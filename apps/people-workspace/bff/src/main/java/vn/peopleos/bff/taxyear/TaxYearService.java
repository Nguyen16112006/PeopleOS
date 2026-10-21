package vn.peopleos.bff.taxyear;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.audit.AuditService;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.common.Json;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.employee.EmployeeLookup;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.notification.NotificationService;
import vn.peopleos.bff.notification.NotificationService.Target;
import vn.peopleos.bff.security.CurrentUser;
import vn.peopleos.bff.taxyear.dto.BudgetRequest;
import vn.peopleos.bff.taxyear.dto.ReportDecisionRequest;
import vn.peopleos.bff.taxyear.dto.TaxYearResult;

/**
 * Thuế TNCN, BHXH cuối năm và báo cáo tài chính năm.
 *
 * <p>Thứ tự: HR xác nhận người phụ thuộc + mã số thuế (hr-confirm) → Kế toán quyết toán thuế TNCN và hệ thống tự phát hành
 * chứng từ khấu trừ cho từng nhân viên (settle) → Kế toán lập báo cáo tài chính năm từ dữ liệu lương/bảo hiểm (report submit)
 * → Giám đốc duyệt hoặc trả lại → Kế toán đề xuất ngân sách nhân sự/quỹ lương năm sau → Giám đốc duyệt (cần báo cáo năm trước đã duyệt).
 * Việc khai và nộp thuế/BHXH hằng tháng, quý với cơ quan nhà nước do Kế toán thực hiện bên ngoài hệ thống; hệ thống không ghi nhận.
 */
@Service
public class TaxYearService {
    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final NotificationService notifications;
    private final AuditService audit;

    public TaxYearService(HasuraClient hasura, EmployeeLookup employees, NotificationService notifications, AuditService audit) {
        this.hasura = hasura;
        this.employees = employees;
        this.notifications = notifications;
        this.audit = audit;
    }

    // ------------------------------------------------------------------ tính toán thuần (dễ kiểm thử)
    /** Tổng hợp chứng từ khấu trừ theo từng nhân viên từ các dòng bảng lương đã chi trả trong năm. */
    record Certificate(String employeeId, int months, long gross, long insurance, long taxable, long pit, long net) {}

    static List<Certificate> aggregateCertificates(JsonNode payrolls) {
        Map<String, long[]> acc = new LinkedHashMap<>();   // [months, gross, insurance, taxable, pit, net]
        for (JsonNode p : payrolls) {
            long[] a = acc.computeIfAbsent(p.get("employee_id").asText(), k -> new long[6]);
            a[0] += 1;
            a[1] += p.get("gross").asLong();
            a[2] += p.get("bhxh_employee").asLong() + p.get("bhyt_employee").asLong() + p.get("bhtn_employee").asLong();
            a[3] += p.get("taxable_income").asLong();
            a[4] += p.get("personal_income_tax").asLong();
            a[5] += p.get("net_salary").asLong();
        }
        List<Certificate> out = new ArrayList<>();
        acc.forEach((id, a) -> out.add(new Certificate(id, (int) a[0], a[1], a[2], a[3], a[4], a[5])));
        return out;
    }

    /** Họ tên những nhân viên chưa có mã số thuế. */
    static List<String> missingTaxCodes(JsonNode employeeRows) {
        List<String> names = new ArrayList<>();
        for (JsonNode e : employeeRows) {
            String code = e.path("tax_code").isNull() ? null : e.path("tax_code").asText(null);
            if (code == null || code.isBlank()) names.add(e.get("full_name").asText());
        }
        return names;
    }

    /** Số liệu báo cáo tài chính năm: tổng hợp từ bảng lương, bảo hiểm và phòng ban của nhân viên. */
    static Map<String, Object> buildFigures(JsonNode payrolls, JsonNode employeeRows, JsonNode insurance, int year) {
        Map<String, String> deptOf = new LinkedHashMap<>();
        for (JsonNode e : employeeRows) deptOf.put(e.get("id").asText(), e.path("department").asText("Khác"));
        long gross = 0, net = 0, pit = 0, empIns = 0, employerIns = 0;
        Set<String> people = new LinkedHashSet<>();
        Map<String, long[]> byDept = new LinkedHashMap<>();   // [headcount, gross]
        Map<String, Set<String>> deptPeople = new LinkedHashMap<>();
        for (JsonNode p : payrolls) {
            String id = p.get("employee_id").asText();
            gross += p.get("gross").asLong();
            net += p.get("net_salary").asLong();
            pit += p.get("personal_income_tax").asLong();
            empIns += p.get("bhxh_employee").asLong() + p.get("bhyt_employee").asLong() + p.get("bhtn_employee").asLong();
            people.add(id);
            String d = deptOf.getOrDefault(id, "Khác");
            byDept.computeIfAbsent(d, k -> new long[2])[1] += p.get("gross").asLong();
            deptPeople.computeIfAbsent(d, k -> new LinkedHashSet<>()).add(id);
        }
        for (JsonNode i : insurance) {
            employerIns += i.get("bhxh_employer").asLong() + i.get("bhyt_employer").asLong() + i.get("bhtn_employer").asLong();
        }
        List<Map<String, Object>> depts = new ArrayList<>();
        byDept.forEach((d, a) -> depts.add(Params.of("department", d, "headcount", deptPeople.get(d).size(), "gross", a[1])));
        depts.sort(Comparator.comparingLong((Map<String, Object> m) -> (Long) m.get("gross")).reversed());
        return Params.of("year", year, "headcount", people.size(), "gross_total", gross, "net_total", net, "pit_total", pit,
                "employee_insurance_total", empIns, "employer_insurance_total", employerIns,
                "employer_cost_total", gross + employerIns, "by_department", depts);
    }

    static void checkYear(int year) {
        if (year < 2020 || year > 2100) throw ApiException.badRequest("Năm không hợp lệ: " + year);
    }

    // ------------------------------------------------------------------ 1. HR xác nhận người phụ thuộc và mã số thuế
    public TaxYearResult hrConfirm(CurrentUser user, int year) {
        if (!user.isHr()) throw ApiException.forbidden("Chỉ HR được xác nhận người phụ thuộc và mã số thuế");
        checkYear(year);
        if (status(TaxYearQueries.CLOSING, "tax_year_closings_by_pk", year) != null && "settled".equals(status(TaxYearQueries.CLOSING, "tax_year_closings_by_pk", year))) {
            throw ApiException.conflict("Năm " + year + " đã quyết toán thuế");
        }
        JsonNode payrolls = payrolls(year);
        List<String> ids = distinctEmployeeIds(payrolls);
        JsonNode emps = hasura.query(TaxYearQueries.EMPLOYEES_BY_IDS, Params.of("ids", ids)).path("employees");
        List<String> missing = missingTaxCodes(emps);
        if (!missing.isEmpty()) {
            throw ApiException.conflict("Còn " + missing.size() + " nhân viên chưa có mã số thuế: "
                    + String.join(", ", missing.subList(0, Math.min(5, missing.size()))) + (missing.size() > 5 ? "…" : ""));
        }
        JsonNode hr = employees.requireByUser(user.sub());
        hasura.query(TaxYearQueries.CLOSING_UPSERT, Params.of("obj", Params.of("year", year, "status", "hr_confirmed",
                "hr_confirmed_by", hr.get("id").asText(), "hr_confirmed_at", Instant.now().toString()),
                "cols", List.of("status", "hr_confirmed_by", "hr_confirmed_at")));
        notifications.notify(Target.role("accountant"), "HR đã xác nhận dữ liệu thuế năm " + year,
                "Kế toán có thể quyết toán thuế TNCN năm " + year + ".", "tax_year", String.valueOf(year), "tax.hr_confirmed");
        audit.record(user, "TAX.HR_CONFIRMED", "tax_year", String.valueOf(year), Params.of("employees", ids.size()));
        return new TaxYearResult(year, "hr_confirmed", ids.size());
    }

    // ------------------------------------------------------------------ 2. Kế toán quyết toán và phát hành chứng từ
    public TaxYearResult settle(CurrentUser user, int year) {
        if (!user.isAccountant()) throw ApiException.forbidden("Chỉ Kế toán được quyết toán thuế TNCN");
        checkYear(year);
        String st = status(TaxYearQueries.CLOSING, "tax_year_closings_by_pk", year);
        if (!"hr_confirmed".equals(st)) throw ApiException.conflict(st == null ? "HR chưa xác nhận người phụ thuộc và mã số thuế" : "Năm " + year + " đã ở trạng thái '" + st + "'");

        JsonNode payrolls = payrolls(year);
        List<Certificate> certs = aggregateCertificates(payrolls);
        JsonNode emps = hasura.query(TaxYearQueries.EMPLOYEES_BY_IDS, Params.of("ids", distinctEmployeeIds(payrolls))).path("employees");
        Map<String, JsonNode> byId = new LinkedHashMap<>();
        for (JsonNode e : emps) byId.put(e.get("id").asText(), e);

        String now = Instant.now().toString();
        List<Map<String, Object>> objs = new ArrayList<>();
        for (Certificate c : certs) {
            JsonNode e = byId.get(c.employeeId());
            objs.add(Params.of("year", year, "employee_id", c.employeeId(), "months", c.months(), "gross_total", c.gross(),
                    "insurance_total", c.insurance(), "taxable_total", c.taxable(), "pit_withheld", c.pit(), "net_total", c.net(),
                    "dependents", e == null ? 0 : e.path("dependents").asInt(0), "tax_code", e == null ? null : Json.text(e, "tax_code"), "issued_at", now));
        }
        hasura.query(TaxYearQueries.CERT_UPSERT, Params.of("objs", objs));

        JsonNode acc = employees.requireByUser(user.sub());
        hasura.query(TaxYearQueries.CLOSING_UPSERT, Params.of("obj", Params.of("year", year, "status", "settled",
                "settled_by", acc.get("id").asText(), "settled_at", now, "certificates_issued", certs.size()),
                "cols", List.of("status", "settled_by", "settled_at", "certificates_issued")));
        for (Certificate c : certs) {
            JsonNode e = byId.get(c.employeeId());
            String uid = e == null ? null : Json.text(e, "user_id");
            if (uid != null) notifications.notify(Target.user(uid), "Chứng từ khấu trừ thuế TNCN năm " + year + " đã có",
                    "Bạn có thể xem chứng từ trong mục Chứng từ thuế.", "tax_year", String.valueOf(year), "tax.certificate_issued");
        }
        audit.record(user, "TAX.SETTLED", "tax_year", String.valueOf(year), Params.of("certificates", certs.size()));
        return new TaxYearResult(year, "settled", certs.size());
    }

    // ------------------------------------------------------------------ 3. Báo cáo tài chính năm
    public TaxYearResult submitReport(CurrentUser user, int year) {
        if (!user.isAccountant()) throw ApiException.forbidden("Chỉ Kế toán được lập báo cáo tài chính năm");
        checkYear(year);
        if (!"settled".equals(status(TaxYearQueries.CLOSING, "tax_year_closings_by_pk", year))) {
            throw ApiException.conflict("Cần quyết toán thuế TNCN năm " + year + " trước khi lập báo cáo tài chính năm");
        }
        String current = status(TaxYearQueries.REPORT, "annual_reports_by_pk", year);
        if ("approved".equals(current)) throw ApiException.conflict("Báo cáo năm " + year + " đã được Giám đốc duyệt");

        JsonNode payrolls = payrolls(year);
        JsonNode emps = hasura.query(TaxYearQueries.EMPLOYEES_BY_IDS, Params.of("ids", distinctEmployeeIds(payrolls))).path("employees");
        JsonNode ins = hasura.query(TaxYearQueries.INSURANCE_OF_YEAR, Params.of("from", year + "-01-01", "to", year + "-12-31")).path("insurance_records");
        Map<String, Object> figures = buildFigures(payrolls, emps, ins, year);

        JsonNode acc = employees.requireByUser(user.sub());
        Map<String, Object> obj = Params.of("year", year, "status", "submitted", "figures", figures, "prepared_by", acc.get("id").asText(),
                "prepared_at", Instant.now().toString(), "approved_by", null, "approved_at", null, "director_comment", null);
        hasura.query(TaxYearQueries.REPORT_UPSERT, Params.of("obj", obj));
        notifications.notify(Target.role("director"), "Báo cáo tài chính năm " + year + " chờ duyệt",
                "Kế toán đã lập báo cáo chi phí nhân sự, quỹ lương, thuế và bảo hiểm năm " + year + ".", "tax_year", String.valueOf(year), "report.submitted");
        audit.record(user, "REPORT.SUBMITTED", "annual_report", String.valueOf(year),
                Params.of("gross_total", figures.get("gross_total"), "employer_cost_total", figures.get("employer_cost_total")));
        return new TaxYearResult(year, "submitted", 0);
    }

    public TaxYearResult approveReport(CurrentUser user, int year) {
        if (!user.isDirector()) throw ApiException.forbidden("Chỉ Giám đốc được duyệt báo cáo tài chính năm");
        checkYear(year);
        if (!"submitted".equals(status(TaxYearQueries.REPORT, "annual_reports_by_pk", year))) throw ApiException.conflict("Báo cáo năm " + year + " chưa ở bước chờ Giám đốc duyệt");
        JsonNode dir = employees.requireByUser(user.sub());
        hasura.query(TaxYearQueries.REPORT_APPROVE, Params.of("y", year, "by", dir.get("id").asText()));
        notifications.notify(Target.role("accountant"), "Báo cáo tài chính năm " + year + " đã được duyệt",
                "Bạn có thể đề xuất ngân sách nhân sự và quỹ lương năm " + (year + 1) + ".", "tax_year", String.valueOf(year), "report.approved");
        audit.record(user, "REPORT.APPROVED", "annual_report", String.valueOf(year), Params.of("year", year));
        return new TaxYearResult(year, "approved", 0);
    }

    public TaxYearResult returnReport(CurrentUser user, int year, ReportDecisionRequest body) {
        if (!user.isDirector()) throw ApiException.forbidden("Chỉ Giám đốc được trả lại báo cáo tài chính năm");
        checkYear(year);
        if (!"submitted".equals(status(TaxYearQueries.REPORT, "annual_reports_by_pk", year))) throw ApiException.conflict("Báo cáo năm " + year + " chưa ở bước chờ Giám đốc duyệt");
        String comment = body == null ? null : body.comment();
        hasura.query(TaxYearQueries.REPORT_RETURN, Params.of("y", year, "comment", comment));
        notifications.notify(Target.role("accountant"), "Giám đốc trả lại báo cáo năm " + year, comment == null ? "Vui lòng rà soát và gửi lại." : comment,
                "tax_year", String.valueOf(year), "report.returned");
        audit.record(user, "REPORT.RETURNED", "annual_report", String.valueOf(year), Params.of("comment", comment));
        return new TaxYearResult(year, "returned", 0);
    }

    // ------------------------------------------------------------------ 4. Ngân sách nhân sự và quỹ lương năm sau
    public TaxYearResult proposeBudget(CurrentUser user, int year, BudgetRequest body) {
        if (!user.isAccountant()) throw ApiException.forbidden("Chỉ Kế toán được đề xuất ngân sách nhân sự và quỹ lương");
        checkYear(year);
        if ("approved".equals(status(TaxYearQueries.BUDGET, "hr_budgets_by_pk", year))) throw ApiException.conflict("Ngân sách năm " + year + " đã được duyệt");
        JsonNode acc = employees.requireByUser(user.sub());
        hasura.query(TaxYearQueries.BUDGET_UPSERT, Params.of("obj", Params.of("year", year, "payroll_fund", body.payrollFund(),
                "headcount_plan", body.headcountPlan() == null ? 0 : body.headcountPlan(), "note", body.note(),
                "status", "proposed", "proposed_by", acc.get("id").asText())));
        notifications.notify(Target.role("director"), "Ngân sách nhân sự năm " + year + " chờ duyệt",
                "Quỹ lương đề xuất: " + body.payrollFund() + " đ.", "tax_year", String.valueOf(year), "budget.proposed");
        audit.record(user, "BUDGET.PROPOSED", "hr_budget", String.valueOf(year), Params.of("payroll_fund", body.payrollFund()));
        return new TaxYearResult(year, "proposed", 0);
    }

    public TaxYearResult approveBudget(CurrentUser user, int year) {
        if (!user.isDirector()) throw ApiException.forbidden("Chỉ Giám đốc được duyệt ngân sách nhân sự và quỹ lương");
        checkYear(year);
        if (!"proposed".equals(status(TaxYearQueries.BUDGET, "hr_budgets_by_pk", year))) throw ApiException.conflict("Chưa có đề xuất ngân sách năm " + year + " chờ duyệt");
        if (!"approved".equals(status(TaxYearQueries.REPORT, "annual_reports_by_pk", year - 1))) {
            throw ApiException.conflict("Báo cáo tài chính năm " + (year - 1) + " cần được duyệt trước khi duyệt ngân sách năm " + year);
        }
        JsonNode dir = employees.requireByUser(user.sub());
        hasura.query(TaxYearQueries.BUDGET_APPROVE, Params.of("y", year, "by", dir.get("id").asText()));
        notifications.notify(Target.role("accountant"), "Ngân sách năm " + year + " đã được duyệt", "Quỹ lương năm " + year + " đã được Giám đốc phê duyệt.",
                "tax_year", String.valueOf(year), "budget.approved");
        notifications.notify(Target.role("hr"), "Ngân sách nhân sự năm " + year + " đã được duyệt", "HR có thể lập kế hoạch tuyển dụng theo ngân sách.",
                "tax_year", String.valueOf(year), "budget.approved");
        audit.record(user, "BUDGET.APPROVED", "hr_budget", String.valueOf(year), Params.of("year", year));
        return new TaxYearResult(year, "approved", 0);
    }

    // ------------------------------------------------------------------ helper
    private JsonNode payrolls(int year) {
        JsonNode rows = hasura.query(TaxYearQueries.PAYROLLS_OF_YEAR, Params.of("y", year)).path("payrolls");
        if (!rows.isArray() || rows.isEmpty()) throw ApiException.conflict("Chưa có bảng lương đã chi trả cho năm " + year);
        return rows;
    }

    private static List<String> distinctEmployeeIds(JsonNode payrolls) {
        Set<String> ids = new LinkedHashSet<>();
        for (JsonNode p : payrolls) ids.add(p.get("employee_id").asText());
        return new ArrayList<>(ids);
    }

    /** Trạng thái hiện tại của bản ghi theo năm, hoặc null nếu chưa có. */
    private String status(String query, String field, int year) {
        JsonNode n = hasura.query(query, Params.of("y", year)).path(field);
        return n.isMissingNode() || n.isNull() ? null : n.path("status").asText(null);
    }
}
