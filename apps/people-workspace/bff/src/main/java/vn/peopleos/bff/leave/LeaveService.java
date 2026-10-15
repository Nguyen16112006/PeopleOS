package vn.peopleos.bff.leave;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.common.WorkingDays;
import vn.peopleos.bff.employee.EmployeeLookup;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.integration.n8n.WorkflowClient;
import vn.peopleos.bff.leave.dto.CreateLeaveRequest;
import vn.peopleos.bff.leave.dto.LeaveDecisionRequest;
import vn.peopleos.bff.leave.dto.LeaveResult;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Quy trình Nghỉ phép / Nghỉ ốm: pending → approved | rejected | cancelled, theo từng giai đoạn (stage):
 * <ul>
 *   <li>Nhân viên: Quản lý trực tiếp duyệt (stage manager) → báo HR chỉnh công.</li>
 *   <li>Quản lý, Kế toán, Admin: HR kiểm tra ngày phép (stage hr) → Giám đốc duyệt (stage director).</li>
 *   <li>HR: Giám đốc duyệt trực tiếp (stage director).</li>
 *   <li>Giám đốc: tự ghi nhận (approved ngay), HR được thông báo để lưu lại.</li>
 * </ul>
 *
 * <p>Quy tắc: số ngày = ngày làm việc T2-T6; phép năm kiểm tra quỹ phép (đã tính đơn đang chờ);
 * mỗi giai đoạn chỉ đúng người/vai trò được duyệt; không ai tự duyệt đơn của mình.
 */
@Service
public class LeaveService {
    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final WorkflowClient workflows;
    private final NotificationService notifications;
    private final AuditService audit;

    public LeaveService(HasuraClient hasura, EmployeeLookup employees, WorkflowClient workflows,
                        NotificationService notifications, AuditService audit) {
        this.audit = audit;
        this.hasura = hasura;
        this.employees = employees;
        this.workflows = workflows;
        this.notifications = notifications;
    }

    // ------------------------------------------------------------------ 1. Tạo đơn
    public LeaveResult create(CurrentUser user, CreateLeaveRequest req) {
        if (req.endDate().isBefore(req.startDate())) {
            throw ApiException.badRequest("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu");
        }
        int days = WorkingDays.count(req.startDate(), req.endDate());
        if (days == 0) throw ApiException.badRequest("Khoảng thời gian chọn không có ngày làm việc nào");

        JsonNode emp = employees.requireByUser(user.sub());
        String employeeId = emp.get("id").asText();

        JsonNode check = hasura.query(LeaveQueries.CHECK, Params.of(
                "eid", employeeId, "year", req.startDate().getYear(),
                "start", req.startDate().toString(), "end", req.endDate().toString()));
        if (!check.get("overlap").isEmpty()) throw ApiException.conflict("Đã có đơn nghỉ phép trùng thời gian này");
        if ("annual".equals(req.leaveType())) checkAnnualBalance(check, days);

        // Chọn giai đoạn duyệt đầu tiên theo vai trò người xin nghỉ
        String stage;
        String status = "pending";
        if (user.isDirector()) { stage = "done"; status = "approved"; }
        else if (user.isHr()) stage = "director";
        else if (user.hasAny("manager", "accountant", "sysadmin")) stage = "hr";
        else stage = "manager";

        JsonNode created = hasura.query(LeaveQueries.INSERT, Params.of("obj", Params.of(
                "employee_id", employeeId, "leave_type", req.leaveType(),
                "start_date", req.startDate().toString(), "end_date", req.endDate().toString(),
                "days", days, "reason", req.reason(), "status", status, "stage", stage))).get("insert_leave_requests_one");
        String requestId = created.get("id").asText();
        if ("approved".equals(status)) {   // Giám đốc tự ghi nhận: trừ phép và báo HR lưu lại
            useBalance(req.leaveType(), employeeId, req.startDate().getYear(), days);
            notifications.notify(Target.role("hr"), "Giám đốc ghi nhận nghỉ phép",
                    emp.get("full_name").asText() + " nghỉ " + days + " ngày (" + req.startDate() + " → " + req.endDate() + ").",
                    "leave_request", requestId, "leave.recorded");
        }

        Map<String, Object> payload = Params.of(
                "request_id", requestId, "employee_name", emp.get("full_name").asText(), "employee_user_id", user.sub(),
                "manager_user_id", Json.text(emp.path("manager"), "user_id"), "stage", stage, "leave_type", req.leaveType(),
                "start_date", req.startDate().toString(), "end_date", req.endDate().toString(), "days", days);
        if (!"done".equals(stage)) workflows.trigger("leave-request", payload, this::notifySubmittedFallback);
        audit.record(user, "LEAVE.CREATED", "leave_request", requestId,
                Params.of("leave_type", req.leaveType(), "days", days, "start_date", req.startDate().toString()));
        return new LeaveResult(requestId, created.get("status").asText(), days);
    }

    private void checkAnnualBalance(JsonNode check, int days) {
        JsonNode bal = Json.first(check.get("leave_balances"));
        double entitled = bal == null ? 0 : bal.get("entitled_days").asDouble();
        double used = bal == null ? 0 : bal.get("used_days").asDouble();
        double pending = 0;
        for (JsonNode p : check.get("pending")) pending += p.get("days").asDouble();
        double remaining = entitled - used - pending;
        if (days > remaining) {
            throw ApiException.badRequest("Không đủ ngày phép: còn " + fmt(remaining)
                    + " ngày (đã tính các đơn đang chờ duyệt), cần " + days);
        }
    }

    /** Dự phòng khi n8n không chạy: tự gửi thông báo cho người duyệt. */
    private void notifySubmittedFallback(Map<String, Object> p) {
        Object manager = p.get("manager_user_id");
        String stage = String.valueOf(p.get("stage"));
        Target target = "hr".equals(stage) ? Target.role("hr")
                : "director".equals(stage) ? Target.role("director")
                : manager != null ? Target.user(manager.toString()) : Target.role("hr");
        notifications.notify(target, "Đơn nghỉ phép chờ duyệt",
                p.get("employee_name") + " xin nghỉ " + p.get("days") + " ngày (" + p.get("start_date") + " → " + p.get("end_date") + ").",
                "leave_request", p.get("request_id").toString(), "leave.pending");
    }

    // ------------------------------------------------------------------ 2. Duyệt / từ chối
    public LeaveResult decide(CurrentUser user, String requestId, LeaveDecisionRequest body) {
        JsonNode req = hasura.query(LeaveQueries.BY_ID, Params.of("id", requestId)).get("leave_requests_by_pk");
        if (Json.isMissing(req)) throw ApiException.notFound("Không tìm thấy đơn nghỉ phép");

        JsonNode emp = req.get("employee");
        if (user.sub().equals(Json.text(emp, "user_id"))) throw ApiException.forbidden("Không thể tự duyệt đơn của chính mình");
        String stage = req.path("stage").asText("manager");
        boolean directManager = user.sub().equals(Json.text(emp.path("manager"), "user_id"));
        switch (stage) {
            case "manager" -> {
                if (!directManager) throw ApiException.forbidden("Giai đoạn này do quản lý trực tiếp của nhân viên duyệt");
            }
            case "hr" -> {
                if (!user.isHr()) throw ApiException.forbidden("Giai đoạn này do HR kiểm tra ngày phép");
            }
            case "director" -> {
                if (!user.isDirector()) throw ApiException.forbidden("Giai đoạn này do Giám đốc duyệt");
            }
            default -> { /* stage done: xử lý ở kiểm tra trạng thái bên dưới */ }
        }
        String current = req.get("status").asText();
        if (!"pending".equals(current)) throw ApiException.conflict("Đơn đã ở trạng thái '" + current + "'");

        JsonNode approver = employees.findByUser(user.sub());
        String approverId = approver == null ? null : approver.get("id").asText();
        String approverName = approver == null ? user.name() : approver.get("full_name").asText();
        boolean approve = "approve".equals(body.decision());

        // HR kiểm tra ngày phép xong thì chuyển lên Giám đốc (đơn vẫn pending)
        if ("hr".equals(stage) && approve) {
            hasura.query(LeaveQueries.STAGE, Params.of("id", requestId, "stage", "director"));
            notifications.notify(Target.role("director"), "Đơn nghỉ phép chờ Giám đốc duyệt",
                    emp.get("full_name").asText() + " xin nghỉ " + req.get("days").asDouble() + " ngày (HR đã kiểm tra ngày phép).",
                    "leave_request", requestId, "leave.pending");
            audit.record(user, "LEAVE.HR_CHECKED", "leave_request", requestId,
                    Params.of("employee", emp.get("full_name").asText(), "note", body.note()));
            return LeaveResult.of(requestId, "pending");
        }

        String status = approve ? "approved" : "rejected";
        hasura.query(LeaveQueries.DECIDE, Params.of("id", requestId, "status", status,
                "approver", approverId, "note", body.note()));

        if ("approved".equals(status)) {
            useBalance(req.get("leave_type").asText(), req.get("employee_id").asText(),
                    Integer.parseInt(req.get("start_date").asText().substring(0, 4)), req.get("days").asDouble());
            // Báo HR chỉnh công / lưu lại
            notifications.notify(Target.role("hr"), "Đơn nghỉ phép đã duyệt - cần chỉnh công",
                    emp.get("full_name").asText() + " nghỉ " + req.get("days").asDouble() + " ngày ("
                            + req.get("start_date").asText() + " → " + req.get("end_date").asText() + ").",
                    "leave_request", requestId, "leave.adjust_timesheet");
        }

        Map<String, Object> payload = Params.of(
                "request_id", requestId, "decision", status, "approver_name", approverName,
                "employee_name", emp.get("full_name").asText(), "employee_user_id", Json.text(emp, "user_id"),
                "start_date", req.get("start_date").asText(), "end_date", req.get("end_date").asText(),
                "days", req.get("days").asDouble(), "note", body.note());
        workflows.trigger("leave-decision", payload, this::notifyDecisionFallback);
        audit.record(user, "LEAVE." + status.toUpperCase(), "leave_request", requestId,
                Params.of("employee", emp.get("full_name").asText(), "days", req.get("days").asDouble(),
                        "stage", stage, "note", body.note()));
        return LeaveResult.of(requestId, status);
    }

    /** Trừ quỹ phép năm / nghỉ ốm khi đơn được duyệt xong. */
    private void useBalance(String type, String employeeId, int year, double days) {
        if (!"annual".equals(type) && !"sick".equals(type)) return;
        String column = "annual".equals(type) ? "used_days" : "sick_days_used";
        hasura.query(LeaveQueries.USE_BALANCE.formatted(column), Params.of("eid", employeeId, "year", year, "d", days));
    }

    private void notifyDecisionFallback(Map<String, Object> p) {
        Object employeeUser = p.get("employee_user_id");
        if (employeeUser == null) return;
        boolean ok = "approved".equals(p.get("decision"));
        notifications.notify(Target.user(employeeUser.toString()),
                ok ? "Đơn nghỉ phép đã được duyệt" : "Đơn nghỉ phép bị từ chối",
                p.get("approver_name") + (ok ? " đã duyệt" : " đã từ chối") + " đơn nghỉ " + p.get("days") + " ngày.",
                "leave_request", p.get("request_id").toString(), "leave." + p.get("decision"));
    }

    // ------------------------------------------------------------------ 3. Huỷ đơn
    public LeaveResult cancel(CurrentUser user, String requestId) {
        JsonNode req = hasura.query(LeaveQueries.BY_ID, Params.of("id", requestId)).get("leave_requests_by_pk");
        if (Json.isMissing(req) || !user.sub().equals(Json.text(req.get("employee"), "user_id"))) {
            throw ApiException.notFound("Không tìm thấy đơn nghỉ phép của bạn");
        }
        if (!"pending".equals(req.get("status").asText())) throw ApiException.conflict("Chỉ huỷ được đơn đang chờ duyệt");
        hasura.query(LeaveQueries.CANCEL, Params.of("id", requestId));
        return LeaveResult.of(requestId, "cancelled");
    }

    private static String fmt(double v) {
        return BigDecimal.valueOf(v).stripTrailingZeros().toPlainString();
    }
}