// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
import vn.peopleos.bff.payroll.dto.CalculateRequest;
import vn.peopleos.bff.payroll.dto.CloseTimesheetRequest;
import vn.peopleos.bff.payroll.dto.PayrollAdjustment;
import vn.peopleos.bff.payroll.dto.PayrollRunResult;
import vn.peopleos.bff.payroll.dto.ReviewRequest;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Tính lương và chi trả hằng tháng.
 *
 * <p>HR chốt công (tạo kỳ lương) → Kế toán tính lương, lập bảng lương (các phiếu ở trạng thái draft) → HR rà soát
 * → Giám đốc duyệt → Kế toán chi trả (phiếu chuyển paid, ghi bảo hiểm tháng, thông báo từng nhân viên).
 * HR hoặc Giám đốc từ chối thì kỳ lương quay về Kế toán kèm lý do để tính lại.
 *
 * <p>Giới hạn: hệ thống chưa có bảng chấm công chi tiết nên tiền làm thêm giờ và thưởng do Kế toán nhập theo số liệu HR đã chốt;
 * lương tính đủ tháng cho mọi nhân viên đang làm việc có hợp đồng hiệu lực (chưa tính theo ngày công thực tế).
 */
@Service
public class PayrollRunService {
    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final NotificationService notifications;
    private final AuditService audit;

    public PayrollRunService(HasuraClient hasura, EmployeeLookup employees, NotificationService notifications, AuditService audit) {
        this.hasura = hasura;
        this.employees = employees;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ 1. HR chốt công
    public PayrollRunResult closeTimesheet(CurrentUser user, CloseTimesheetRequest req) {
        if (!user.isHr()) throw ApiException.forbidden("Chỉ HR được chốt công và tạo kỳ lương");
        LocalDate first = LocalDate.of(req.year(), req.month(), 1);
        if (first.isAfter(LocalDate.now().withDayOfMonth(1))) throw ApiException.badRequest("Chưa đến kỳ lương " + req.month() + "/" + req.year());
        JsonNode ex = hasura.query(PayrollQueries.RUN_EXISTS, Params.of("y", req.year(), "m", req.month()));
        if (ex.path("payroll_runs").isArray() && !ex.path("payroll_runs").isEmpty()) throw ApiException.conflict("Kỳ lương " + req.month() + "/" + req.year() + " đã được tạo");
        if (ex.path("payrolls_aggregate").path("aggregate").path("count").asInt(0) > 0) {
            throw ApiException.conflict("Tháng " + req.month() + "/" + req.year() + " đã có phiếu lương đã chi trả");
        }
        JsonNode hr = employees.requireByUser(user.sub());
        String id = hasura.query(PayrollQueries.RUN_INSERT, Params.of("obj", Params.of("period_year", req.year(), "period_month", req.month(),
                "status", "timesheet_closed", "timesheet_closed_by", hr.get("id").asText(), "timesheet_closed_at", java.time.Instant.now().toString())))
                .get("insert_payroll_runs_one").get("id").asText();
        notifications.notify(Target.role("accountant"), "HR đã chốt công tháng " + req.month() + "/" + req.year(),
                "Kế toán có thể tính lương và lập bảng lương.", "payroll_run", id, "payroll.timesheet_closed");
        audit.record(user, "PAYROLL.TIMESHEET_CLOSED", "payroll_run", id, Params.of("year", req.year(), "month", req.month()));
        return new PayrollRunResult(id, "timesheet_closed", 0);
    }

    // ------------------------------------------------------------------ 2. Kế toán tính lương, lập bảng lương
    public PayrollRunResult calculate(CurrentUser user, String runId, CalculateRequest body) {
        if (!user.isAccountant()) throw ApiException.forbidden("Chỉ Kế toán được tính lương và lập bảng lương");
        JsonNode run = requireRun(runId, "timesheet_closed", "Kỳ lương chưa ở bước chờ Kế toán tính lương");
        int year = run.get("period_year").asInt();
        int month = run.get("period_month").asInt();
        LocalDate end = LocalDate.of(year, month, 1).plusMonths(1).minusDays(1);

        JsonNode contracts = hasura.query(PayrollQueries.ELIGIBLE, Params.of("end", end.toString())).path("contracts");
        Map<String, JsonNode> byEmployee = new LinkedHashMap<>();
        for (JsonNode c : contracts) byEmployee.putIfAbsent(c.get("employee_id").asText(), c);
        if (byEmployee.isEmpty()) throw ApiException.conflict("Không có nhân viên nào đủ điều kiện tính lương tháng " + month + "/" + year);

        Map<String, PayrollAdjustment> adj = new HashMap<>();
        if (body != null && body.adjustments() != null) {
            for (PayrollAdjustment a : body.adjustments()) {
                if (!byEmployee.containsKey(a.employeeId())) throw ApiException.badRequest("Nhân viên không thuộc kỳ lương này: " + a.employeeId());
                adj.put(a.employeeId(), a);
            }
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        long totalGross = 0, totalNet = 0;
        for (Map.Entry<String, JsonNode> e : byEmployee.entrySet()) {
            JsonNode c = e.getValue();
            JsonNode emp = c.get("employee");
            PayrollAdjustment a = adj.get(e.getKey());
            Map<String, Object> row = PayrollRows.payroll(e.getKey(), year, month, c.get("base_salary").asLong(), c.get("allowance").asLong(),
                    a == null || a.overtimePay() == null ? 0 : a.overtimePay(), a == null || a.bonus() == null ? 0 : a.bonus(),
                    emp.path("dependents").asInt(0), emp.path("region").asInt(1), "draft");
            rows.add(row);
            totalGross += (Long) row.get("gross");
            totalNet += (Long) row.get("net_salary");
        }
        hasura.query(PayrollQueries.PAYROLL_UPSERT, Params.of("objs", rows));
        JsonNode acc = employees.requireByUser(user.sub());
        hasura.query(PayrollQueries.RUN_CALCULATED, Params.of("id", runId, "by", acc.get("id").asText(), "count", rows.size(), "gross", totalGross, "net", totalNet));
        notifications.notify(Target.role("hr"), "Bảng lương tháng " + month + "/" + year + " chờ HR rà soát",
                rows.size() + " phiếu lương, tổng thực nhận " + totalNet + " đ.", "payroll_run", runId, "payroll.calculated");
        audit.record(user, "PAYROLL.CALCULATED", "payroll_run", runId, Params.of("count", rows.size(), "total_gross", totalGross, "total_net", totalNet));
        return new PayrollRunResult(runId, "calculated", rows.size());
    }

    // ------------------------------------------------------------------ 3. HR rà soát
    public PayrollRunResult hrReview(CurrentUser user, String runId, ReviewRequest body) {
        if (!user.isHr()) throw ApiException.forbidden("Chỉ HR được rà soát bảng lương");
        JsonNode run = requireRun(runId, "calculated", "Kỳ lương chưa ở bước chờ HR rà soát");
        String label = run.get("period_month").asInt() + "/" + run.get("period_year").asInt();
        JsonNode hr = employees.requireByUser(user.sub());
        PayrollRunResult result;
        if ("approve".equals(body.decision())) {
            hasura.query(PayrollQueries.RUN_REVIEWED, Params.of("id", runId, "by", hr.get("id").asText()));
            notifications.notify(Target.role("director"), "Bảng lương tháng " + label + " chờ Giám đốc duyệt",
                    "HR đã rà soát (đối chiếu hợp đồng, phụ cấp).", "payroll_run", runId, "payroll.hr_reviewed");
            result = new PayrollRunResult(runId, "hr_reviewed", 0);
        } else {
            hasura.query(PayrollQueries.RUN_RETURN, Params.of("id", runId, "comment", body.comment()));
            notifications.notify(Target.role("accountant"), "HR trả lại bảng lương tháng " + label,
                    body.comment() == null ? "Vui lòng rà soát và tính lại." : body.comment(), "payroll_run", runId, "payroll.returned");
            result = new PayrollRunResult(runId, "timesheet_closed", 0);
        }
        audit.record(user, "PAYROLL.HR_" + ("approve".equals(body.decision()) ? "REVIEWED" : "RETURNED"), "payroll_run", runId, Params.of("comment", body.comment()));
        return result;
    }

    // ------------------------------------------------------------------ 4. Giám đốc duyệt
    public PayrollRunResult directorDecision(CurrentUser user, String runId, ReviewRequest body) {
        if (!user.isDirector()) throw ApiException.forbidden("Chỉ Giám đốc được duyệt bảng lương");
        JsonNode run = requireRun(runId, "hr_reviewed", "Kỳ lương chưa ở bước chờ Giám đốc duyệt");
        String label = run.get("period_month").asInt() + "/" + run.get("period_year").asInt();
        JsonNode dir = employees.requireByUser(user.sub());
        PayrollRunResult result;
        if ("approve".equals(body.decision())) {
            hasura.query(PayrollQueries.RUN_APPROVED, Params.of("id", runId, "by", dir.get("id").asText()));
            notifications.notify(Target.role("accountant"), "Bảng lương tháng " + label + " đã được duyệt", "Kế toán có thể chi trả và phát hành phiếu lương.",
                    "payroll_run", runId, "payroll.approved");
            result = new PayrollRunResult(runId, "approved", 0);
        } else {
            hasura.query(PayrollQueries.RUN_RETURN, Params.of("id", runId, "comment", body.comment()));
            notifications.notify(Target.role("accountant"), "Giám đốc trả lại bảng lương tháng " + label,
                    body.comment() == null ? "Vui lòng sửa và gửi lại." : body.comment(), "payroll_run", runId, "payroll.returned");
            result = new PayrollRunResult(runId, "timesheet_closed", 0);
        }
        audit.record(user, "PAYROLL." + ("approve".equals(body.decision()) ? "APPROVED" : "RETURNED"), "payroll_run", runId, Params.of("comment", body.comment()));
        return result;
    }

    // ------------------------------------------------------------------ 5. Kế toán chi trả, phát hành phiếu lương
    public PayrollRunResult pay(CurrentUser user, String runId) {
        if (!user.isAccountant()) throw ApiException.forbidden("Chỉ Kế toán được chi trả lương");
        JsonNode run = requireRun(runId, "approved", "Kỳ lương chưa được Giám đốc duyệt");
        int year = run.get("period_year").asInt();
        int month = run.get("period_month").asInt();
        JsonNode rows = hasura.query(PayrollQueries.PAYROLLS_OF_MONTH, Params.of("y", year, "m", month)).path("payrolls");
        if (!rows.isArray() || rows.isEmpty()) throw ApiException.conflict("Không có phiếu lương nào để chi trả");

        List<Map<String, Object>> insurance = new ArrayList<>();
        for (JsonNode p : rows) {
            JsonNode emp = p.path("employee");
            insurance.add(PayrollRows.insurance(p.get("employee_id").asText(), year, month, p.get("insured_salary").asLong(), p.get("gross").asLong(),
                    emp.path("dependents").asInt(0), emp.path("region").asInt(1)));
        }
        hasura.query(PayrollQueries.INSURANCE_UPSERT, Params.of("objs", insurance));
        hasura.query(PayrollQueries.PAYROLLS_PAID, Params.of("y", year, "m", month, "today", LocalDate.now().toString()));
        JsonNode acc = employees.requireByUser(user.sub());
        hasura.query(PayrollQueries.RUN_PAID, Params.of("id", runId, "by", acc.get("id").asText()));
        for (JsonNode p : rows) {
            String uid = Json.text(p.path("employee"), "user_id");
            if (uid != null) notifications.notify(Target.user(uid), "Phiếu lương tháng " + month + "/" + year + " đã phát hành",
                    "Bạn có thể xem phiếu lương và gửi khiếu nại nếu có sai sót.", "payroll", p.get("id").asText(), "payroll.paid");
        }
        notifications.notify(Target.role("director"), "Đã chi trả lương tháng " + month + "/" + year, rows.size() + " phiếu lương đã phát hành.",
                "payroll_run", runId, "payroll.paid_fyi");
        audit.record(user, "PAYROLL.PAID", "payroll_run", runId, Params.of("count", rows.size(), "year", year, "month", month));
        return new PayrollRunResult(runId, "paid", rows.size());
    }

    private JsonNode requireRun(String id, String expectedStatus, String wrongStatusMessage) {
        JsonNode run = hasura.query(PayrollQueries.RUN_BY_ID, Params.of("id", id)).get("payroll_runs_by_pk");
        if (Json.isMissing(run)) throw ApiException.notFound("Không tìm thấy kỳ lương");
        if (!expectedStatus.equals(run.get("status").asText())) throw ApiException.conflict(wrongStatusMessage + " (hiện: " + run.get("status").asText() + ")");
        return run;
    }
}
