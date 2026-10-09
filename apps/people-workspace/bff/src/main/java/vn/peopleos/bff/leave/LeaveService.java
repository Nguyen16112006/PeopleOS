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
 * Quy trình Nghỉ phép / Nghỉ ốm: pending → approved | rejected | cancelled.
 *
 * <p>Quy tắc: số ngày = ngày làm việc T2-T6; phép năm kiểm tra quỹ phép (đã tính đơn đang chờ);
 * chỉ quản lý trực tiếp hoặc HR/Admin được duyệt; không ai tự duyệt đơn của mình.
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

        JsonNode created = hasura.query(LeaveQueries.INSERT, Params.of("obj", Params.of(
                "employee_id", employeeId, "leave_type", req.leaveType(),
                "start_date", req.startDate().toString(), "end_date", req.endDate().toString(),
                "days", days, "reason", req.reason()))).get("insert_leave_requests_one");
        String requestId = created.get("id").asText();

        Map<String, Object> payload = Params.of(
                "request_id", requestId, "employee_name", emp.get("full_name").asText(), "employee_user_id", user.sub(),
                "manager_user_id", Json.text(emp.path("manager"), "user_id"), "leave_type", req.leaveType(),
                "start_date", req.startDate().toString(), "end_date", req.endDate().toString(), "days", days);
        workflows.trigger("leave-request", payload, this::notifySubmittedFallback);
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
        Target target = manager != null ? Target.user(manager.toString()) : Target.role("hr");
        notifications.notify(target, "Đơn nghỉ phép chờ duyệt",
                p.get("employee_name") + " xin nghỉ " + p.get("days") + " ngày (" + p.get("start_date") + " → " + p.get("end_date") + ").",
                "leave_request", p.get("request_id").toString(), "leave.pending");
    }

    // ------------------------------------------------------------------ 2. Duyệt / từ chối
    public LeaveResult decide(CurrentUser user, String requestId, LeaveDecisionRequest body) {
        JsonNode req = hasura.query(LeaveQueries.BY_ID, Params.of("id", requestId)).get("leave_requests_by_pk");
        if (Json.isMissing(req)) throw ApiException.notFound("Không tìm thấy đơn nghỉ phép");

        JsonNode emp = req.get("employee");
        boolean directManager = user.sub().equals(Json.text(emp.path("manager"), "user_id"));
        if (!(directManager || user.hasAny("hr", "admin", "employee"))) {
            throw ApiException.forbidden("Chỉ quản lý trực tiếp hoặc HR/Admin mới được duyệt đơn này");
        }
        String current = req.get("status").asText();
        if (!"pending".equals(current)) throw ApiException.conflict("Đơn đã ở trạng thái '" + current + "'");

        JsonNode approver = employees.findByUser(user.sub());
        String status = "approved".equals(body.decision()) ? "approved" : "rejected";
        hasura.query(LeaveQueries.DECIDE, Params.of("id", requestId, "status", status,
                "approver", approver == null ? null : approver.get("id").asText(), "note", body.note()));

        String type = req.get("leave_type").asText();
        if ("approved".equals(status) && ("annual".equals(type) || "sick".equals(type))) {
            String column = "annual".equals(type) ? "used_days" : "sick_days_used";
            hasura.query(LeaveQueries.USE_BALANCE.formatted(column), Params.of(
                    "eid", req.get("employee_id").asText(),
                    "year", Integer.parseInt(req.get("start_date").asText().substring(0, 4)),
                    "d", req.get("days").asDouble()));
        }

        Map<String, Object> payload = Params.of(
                "request_id", requestId, "decision", status,
                "approver_name", approver == null ? user.name() : approver.get("full_name").asText(),
                "employee_name", emp.get("full_name").asText(), "employee_user_id", Json.text(emp, "user_id"),
                "start_date", req.get("start_date").asText(), "end_date", req.get("end_date").asText(),
                "days", req.get("days").asDouble(), "note", body.note());
        workflows.trigger("leave-decision", payload, this::notifyDecisionFallback);
        audit.record(user, "LEAVE." + status.toUpperCase(), "leave_request", requestId,
                Params.of("employee", emp.get("full_name").asText(), "days", req.get("days").asDouble(), "note", body.note()));
        return LeaveResult.of(requestId, status);
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
