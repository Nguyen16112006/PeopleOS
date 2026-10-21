package vn.peopleos.bff.advance;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.advance.dto.AdvanceDecisionRequest;
import vn.peopleos.bff.advance.dto.AdvanceResult;
import vn.peopleos.bff.advance.dto.CreateAdvanceRequest;
import vn.peopleos.bff.advance.dto.SettlementRequest;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.employee.EmployeeLookup;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Tạm ứng / hoàn ứng / thanh toán chi phí.
 *
 * <p>Giai đoạn (stage):
 * <ul>
 *   <li>{@code manager}: Quản lý trực tiếp duyệt cấp 1 (người gửi là Nhân viên).</li>
 *   <li>{@code director}: Giám đốc duyệt cấp 1 thay Quản lý (người gửi là Quản lý, HR, Kế toán, Admin).</li>
 *   <li>{@code director_l2}: Giám đốc duyệt cấp 2 khi số tiền vượt ngưỡng (app_settings, mặc định 20 triệu).</li>
 *   <li>{@code accountant}: Kế toán kiểm tra chứng từ, hạn mức rồi chi tiền → {@code paid} (tạm ứng) hoặc {@code closed} (chi phí).</li>
 *   <li>Tạm ứng đã chi: Nhân viên khai hoàn ứng → Kế toán đối chiếu, quyết toán → {@code settled}.</li>
 * </ul>
 * Yêu cầu của Giám đốc đi thẳng tới Kế toán (không có cấp trên). Không ai tự duyệt yêu cầu của mình.
 */
@Service
public class AdvanceService {
    static final long DEFAULT_THRESHOLD_VND = 20_000_000L;
    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9._/-]{1,200}");

    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final NotificationService notifications;
    private final AuditService audit;

    public AdvanceService(HasuraClient hasura, EmployeeLookup employees, NotificationService notifications, AuditService audit) {
        this.hasura = hasura;
        this.employees = employees;
        this.notifications = notifications;
        this.audit = audit;
    }

    /** Giai đoạn kế tiếp sau khi một cấp duyệt xong (trừ bước chi tiền của Kế toán). */
    static String nextStageAfterApproval(String stage, long amount, long threshold) {
        return switch (stage) {
            case "manager" -> amount > threshold ? "director_l2" : "accountant";
            case "director", "director_l2" -> "accountant";
            default -> throw ApiException.conflict("Giai đoạn '" + stage + "' không có bước duyệt kế tiếp");
        };
    }

    // ------------------------------------------------------------------ 1. Tạo yêu cầu
    public AdvanceResult create(CurrentUser user, CreateAdvanceRequest req) {
        JsonNode emp = employees.requireByUser(user.sub());
        String employeeId = emp.get("id").asText();

        String stage;
        if (user.isDirector()) stage = "accountant";
        else if (user.hasAny("manager", "hr", "accountant", "sysadmin")) stage = "director";
        else stage = Json.text(emp.path("manager"), "user_id") == null ? "director" : "manager";

        java.util.Map<String, Object> o = Params.of("employee_id", employeeId, "request_type", req.requestType(),
                "amount", req.amount(), "reason", req.reason(), "stage", stage, "status", "pending");
        List<String> keys = req.receiptKeys() == null ? List.of() : req.receiptKeys();
        for (String k : keys) if (!KEY.matcher(k).matches()) throw ApiException.badRequest("Khóa chứng từ không hợp lệ: " + k);
        if (!keys.isEmpty()) o.put("receipt_keys", "{" + String.join(",", keys) + "}");

        JsonNode created = hasura.query(AdvanceQueries.INSERT, Params.of("obj", o)).get("insert_advance_requests_one");
        String id = created.get("id").asText();
        notifyStage(stage, emp.get("full_name").asText(), req.amount(), id, emp.path("manager"));
        audit.record(user, "ADVANCE.CREATED", "advance_request", id,
                Params.of("type", req.requestType(), "amount", req.amount(), "stage", stage));
        return new AdvanceResult(id, created.get("stage").asText(), created.get("status").asText());
    }

    // ------------------------------------------------------------------ 2. Duyệt / từ chối theo giai đoạn
    public AdvanceResult decide(CurrentUser user, String requestId, AdvanceDecisionRequest body) {
        JsonNode req = load(requestId);
        JsonNode emp = req.get("employee");
        if (user.sub().equals(Json.text(emp, "user_id"))) throw ApiException.forbidden("Không thể tự duyệt yêu cầu của chính mình");

        String stage = req.get("stage").asText();
        switch (stage) {
            case "manager" -> {
                if (!user.sub().equals(Json.text(emp.path("manager"), "user_id")))
                    throw ApiException.forbidden("Giai đoạn này do quản lý trực tiếp của nhân viên duyệt");
            }
            case "director", "director_l2" -> {
                if (!user.isDirector()) throw ApiException.forbidden("Giai đoạn này do Giám đốc duyệt");
            }
            case "accountant" -> {
                if (!user.isAccountant()) throw ApiException.forbidden("Giai đoạn này do Kế toán kiểm tra và chi tiền");
            }
            default -> throw ApiException.conflict("Yêu cầu đang ở giai đoạn '" + stage + "', không còn bước duyệt");
        }
        if (!"pending".equals(req.get("status").asText())) {
            throw ApiException.conflict("Yêu cầu đã ở trạng thái '" + req.get("status").asText() + "'");
        }

        boolean approve = "approve".equals(body.decision());
        long amount = req.get("amount").asLong();
        String type = req.get("request_type").asText();
        String employeeName = emp.get("full_name").asText();
        String requesterUserId = Json.text(emp, "user_id");
        JsonNode approver = employees.findByUser(user.sub());

        AdvanceResult result;
        if (!approve) {
            hasura.query(AdvanceQueries.MOVE, Params.of("id", requestId, "stage", "closed", "status", "rejected"));
            result = new AdvanceResult(requestId, "closed", "rejected");
            notifications.notify(Target.user(requesterUserId), "Yêu cầu tạm ứng/chi phí bị từ chối",
                    "Yêu cầu " + amount + " đ của bạn bị từ chối" + (body.comment() == null ? "." : ": " + body.comment()),
                    "advance_request", requestId, "advance.rejected");
        } else if ("accountant".equals(stage)) {
            String finalStage = "advance".equals(type) ? "paid" : "closed";   // chi tiền
            hasura.query(AdvanceQueries.PAID, Params.of("id", requestId, "stage", finalStage));
            result = new AdvanceResult(requestId, finalStage, "approved");
            notifications.notify(Target.user(requesterUserId), "Đã chi tiền",
                    "Kế toán đã chi " + amount + " đ cho yêu cầu của bạn."
                            + ("advance".equals(type) ? " Vui lòng hoàn ứng kèm chứng từ." : ""),
                    "advance_request", requestId, "advance.paid");
        } else {
            String next = nextStageAfterApproval(stage, amount, threshold());
            hasura.query(AdvanceQueries.MOVE, Params.of("id", requestId, "stage", next, "status", "pending"));
            result = new AdvanceResult(requestId, next, "pending");
            notifyStage(next, employeeName, amount, requestId, null);
        }

        hasura.query(AdvanceQueries.EVENT, Params.of("obj", Params.of(
                "ref_type", "advance", "ref_id", requestId, "stage", stage,
                "actor_id", approver == null ? null : approver.get("id").asText(),
                "decision", approve ? "approved" : "rejected", "comment", body.comment())));
        audit.record(user, "ADVANCE." + (approve ? "APPROVED" : "REJECTED"), "advance_request", requestId,
                Params.of("employee", employeeName, "amount", amount, "stage", stage, "result_stage", result.stage()));
        return result;
    }

    // ------------------------------------------------------------------ 3. Hoàn ứng (nhân viên khai) và quyết toán (Kế toán)
    public AdvanceResult submitSettlement(CurrentUser user, String requestId, SettlementRequest body) {
        JsonNode req = load(requestId);
        if (!user.sub().equals(Json.text(req.get("employee"), "user_id"))) throw ApiException.forbidden("Chỉ người tạm ứng được khai hoàn ứng");
        if (!"advance".equals(req.get("request_type").asText()) || !"paid".equals(req.get("stage").asText())) {
            throw ApiException.conflict("Chỉ tạm ứng đã chi tiền mới khai hoàn ứng được");
        }
        hasura.query(AdvanceQueries.SETTLE_SUBMIT, Params.of("id", requestId, "amount", body.settledAmount()));
        notifications.notify(Target.role("accountant"), "Nhân viên đã khai hoàn ứng",
                req.get("employee").get("full_name").asText() + " khai chi thực tế " + body.settledAmount() + " đ.",
                "advance_request", requestId, "advance.settlement_submitted");
        audit.record(user, "ADVANCE.SETTLEMENT_SUBMITTED", "advance_request", requestId, Params.of("settled_amount", body.settledAmount()));
        return new AdvanceResult(requestId, "paid", "approved");
    }

    public AdvanceResult confirmSettlement(CurrentUser user, String requestId) {
        if (!user.isAccountant()) throw ApiException.forbidden("Chỉ Kế toán được đối chiếu và quyết toán hoàn ứng");
        JsonNode req = load(requestId);
        if (!"paid".equals(req.get("stage").asText()) || req.path("settled_amount").isNull() || req.path("settled_amount").isMissingNode()) {
            throw ApiException.conflict("Chưa có khai hoàn ứng để đối chiếu");
        }
        hasura.query(AdvanceQueries.SETTLE_CONFIRM, Params.of("id", requestId));
        notifications.notify(Target.user(Json.text(req.get("employee"), "user_id")), "Đã quyết toán hoàn ứng",
                "Kế toán đã đối chiếu và quyết toán khoản tạm ứng của bạn.", "advance_request", requestId, "advance.settled");
        audit.record(user, "ADVANCE.SETTLED", "advance_request", requestId, Params.of("settled_amount", req.get("settled_amount").asLong()));
        return new AdvanceResult(requestId, "settled", "approved");
    }

    // ------------------------------------------------------------------ helper
    private JsonNode load(String id) {
        JsonNode req = hasura.query(AdvanceQueries.BY_ID, Params.of("id", id)).get("advance_requests_by_pk");
        if (Json.isMissing(req)) throw ApiException.notFound("Không tìm thấy yêu cầu");
        return req;
    }

    private long threshold() {
        JsonNode s = hasura.query(AdvanceQueries.THRESHOLD, Params.of()).path("app_settings_by_pk");
        try {
            return Json.isMissing(s) ? DEFAULT_THRESHOLD_VND : Long.parseLong(s.get("value").asText());
        } catch (NumberFormatException e) {
            return DEFAULT_THRESHOLD_VND;
        }
    }

    private void notifyStage(String stage, String employeeName, long amount, String id, JsonNode managerNode) {
        String title = "Yêu cầu tạm ứng/chi phí chờ duyệt";
        String msg = employeeName + " đề nghị " + amount + " đ.";
        Target target = switch (stage) {
            case "manager" -> {
                String m = managerNode == null ? null : Json.text(managerNode, "user_id");
                yield m != null ? Target.user(m) : Target.role("director");
            }
            case "director", "director_l2" -> Target.role("director");
            default -> Target.role("accountant");
        };
        notifications.notify(target, title, msg, "advance_request", id, "advance.pending");
    }
}
