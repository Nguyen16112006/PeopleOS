// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.employee.EmployeeLookup;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.payroll.dto.AdjustPayslipRequest;
import vn.peopleos.bff.payroll.dto.ComplaintRequest;
import vn.peopleos.bff.payroll.dto.ComplaintResult;
import vn.peopleos.bff.payroll.dto.ComplaintReviewRequest;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Khiếu nại phiếu lương: Nhân viên gửi (phiếu đã chi trả của chính mình) → HR xử lý (chuyển Kế toán hoặc từ chối)
 * → Kế toán điều chỉnh tiền làm thêm giờ/thưởng và tính lại phiếu lương, ghi lại bảo hiểm tháng → Nhân viên nhận thông báo.
 */
@Service
public class PayslipComplaintService {
    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final NotificationService notifications;
    private final AuditService audit;

    public PayslipComplaintService(HasuraClient hasura, EmployeeLookup employees, NotificationService notifications, AuditService audit) {
        this.hasura = hasura;
        this.employees = employees;
        this.notifications = notifications;
        this.audit = audit;
    }

    public ComplaintResult file(CurrentUser user, ComplaintRequest req) {
        JsonNode p = hasura.query(PayrollQueries.PAYROLL_BY_ID, Params.of("id", req.payrollId())).get("payrolls_by_pk");
        if (Json.isMissing(p)) throw ApiException.notFound("Không tìm thấy phiếu lương");
        if (!user.sub().equals(Json.text(p.get("employee"), "user_id"))) throw ApiException.forbidden("Chỉ được khiếu nại phiếu lương của chính mình");
        if (!"paid".equals(p.get("status").asText())) throw ApiException.conflict("Chỉ khiếu nại được phiếu lương đã phát hành");
        JsonNode active = hasura.query(PayrollQueries.COMPLAINT_ACTIVE_FOR_PAYROLL, Params.of("pid", req.payrollId())).path("payslip_complaints");
        if (active.isArray() && !active.isEmpty()) throw ApiException.conflict("Phiếu lương này đang có khiếu nại được xử lý");
        String id = hasura.query(PayrollQueries.COMPLAINT_INSERT, Params.of("obj", Params.of("payroll_id", req.payrollId(),
                "employee_id", p.get("employee_id").asText(), "message", req.message(), "status", "open")))
                .get("insert_payslip_complaints_one").get("id").asText();
        notifications.notify(Target.role("hr"), "Khiếu nại phiếu lương chờ xử lý",
                p.get("employee").get("full_name").asText() + " khiếu nại phiếu lương tháng " + p.get("period_month").asInt() + "/" + p.get("period_year").asInt() + ".",
                "payslip_complaint", id, "payslip.complaint");
        audit.record(user, "PAYSLIP.COMPLAINT_FILED", "payslip_complaint", id, Params.of("payroll_id", req.payrollId()));
        return new ComplaintResult(id, "open");
    }

    public ComplaintResult review(CurrentUser user, String id, ComplaintReviewRequest body) {
        if (!user.isHr()) throw ApiException.forbidden("Chỉ HR được xử lý khiếu nại phiếu lương");
        JsonNode c = require(id, "open", "Khiếu nại chưa ở bước chờ HR xử lý");
        if (user.sub().equals(Json.text(c.get("employee"), "user_id"))) throw ApiException.forbidden("Không thể tự xử lý khiếu nại của chính mình");
        JsonNode hr = employees.requireByUser(user.sub());
        boolean forward = "forward".equals(body.decision());
        String status = forward ? "adjusting" : "rejected";
        hasura.query(PayrollQueries.COMPLAINT_HR, Params.of("id", id, "status", status, "note", body.note(), "by", hr.get("id").asText()));
        if (forward) {
            notifications.notify(Target.role("accountant"), "Khiếu nại phiếu lương cần điều chỉnh",
                    c.get("employee").get("full_name").asText() + ": " + (body.note() == null ? "HR đề nghị rà soát và điều chỉnh." : body.note()),
                    "payslip_complaint", id, "payslip.adjusting");
        } else {
            notifications.notify(Target.user(Json.text(c.get("employee"), "user_id")), "Khiếu nại phiếu lương không được chấp nhận",
                    body.note() == null ? "HR đã xem xét và giữ nguyên phiếu lương." : body.note(), "payslip_complaint", id, "payslip.rejected");
        }
        audit.record(user, "PAYSLIP.COMPLAINT_" + (forward ? "FORWARDED" : "REJECTED"), "payslip_complaint", id, Params.of("note", body.note()));
        return new ComplaintResult(id, status);
    }

    public ComplaintResult adjust(CurrentUser user, String id, AdjustPayslipRequest body) {
        if (!user.isAccountant()) throw ApiException.forbidden("Chỉ Kế toán được điều chỉnh phiếu lương");
        if (body.overtimePay() == null && body.bonus() == null) throw ApiException.badRequest("Cần nhập tiền làm thêm giờ và/hoặc thưởng cần điều chỉnh");
        JsonNode c = require(id, "adjusting", "Khiếu nại chưa được HR chuyển sang bước điều chỉnh");
        JsonNode p = hasura.query(PayrollQueries.PAYROLL_BY_ID, Params.of("id", c.get("payroll_id").asText())).get("payrolls_by_pk");
        if (Json.isMissing(p)) throw ApiException.notFound("Không tìm thấy phiếu lương");
        if (user.sub().equals(Json.text(p.get("employee"), "user_id"))) throw ApiException.forbidden("Không thể tự điều chỉnh phiếu lương của chính mình");

        int year = p.get("period_year").asInt();
        int month = p.get("period_month").asInt();
        JsonNode emp = p.get("employee");
        long ot = body.overtimePay() != null ? body.overtimePay() : p.get("overtime_pay").asLong();
        long bonus = body.bonus() != null ? body.bonus() : p.get("bonus").asLong();
        Map<String, Object> row = PayrollRows.payroll(p.get("employee_id").asText(), year, month, p.get("base_salary").asLong(), p.get("allowance").asLong(),
                ot, bonus, emp.path("dependents").asInt(0), emp.path("region").asInt(1), "paid");
        Map<String, Object> set = new HashMap<>(row);
        for (String k : List.of("employee_id", "period_year", "period_month", "status")) set.remove(k);   // chỉ cập nhật các khoản tiền
        hasura.query(PayrollQueries.PAYROLL_UPDATE, Params.of("id", p.get("id").asText(), "set", set));
        hasura.query(PayrollQueries.INSURANCE_UPSERT, Params.of("objs", List.of(PayrollRows.insurance(p.get("employee_id").asText(), year, month,
                (Long) row.get("insured_salary"), (Long) row.get("gross"), emp.path("dependents").asInt(0), emp.path("region").asInt(1)))));
        JsonNode acc = employees.requireByUser(user.sub());
        hasura.query(PayrollQueries.COMPLAINT_RESOLVED, Params.of("id", id, "note", body.note(), "by", acc.get("id").asText()));
        notifications.notify(Target.user(Json.text(emp, "user_id")), "Phiếu lương đã được điều chỉnh",
                "Phiếu lương tháng " + month + "/" + year + " đã được tính lại, thực nhận mới: " + row.get("net_salary") + " đ.", "payroll", p.get("id").asText(), "payslip.adjusted");
        audit.record(user, "PAYSLIP.ADJUSTED", "payslip_complaint", id, Params.of("payroll_id", p.get("id").asText(), "overtime_pay", ot, "bonus", bonus, "net_salary", row.get("net_salary")));
        return new ComplaintResult(id, "resolved");
    }

    private JsonNode require(String id, String expectedStatus, String message) {
        JsonNode c = hasura.query(PayrollQueries.COMPLAINT_BY_ID, Params.of("id", id)).get("payslip_complaints_by_pk");
        if (Json.isMissing(c)) throw ApiException.notFound("Không tìm thấy khiếu nại");
        if (!expectedStatus.equals(c.get("status").asText())) throw ApiException.conflict(message + " (hiện: " + c.get("status").asText() + ")");
        return c;
    }
}
