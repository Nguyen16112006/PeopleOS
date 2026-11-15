// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.timesheet;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
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
import vn.peopleos.bff.security.CurrentUser;
import vn.peopleos.bff.timesheet.TimesheetCalculator.Day;
import vn.peopleos.bff.timesheet.TimesheetCalculator.Leave;
import vn.peopleos.bff.timesheet.TimesheetCalculator.Summary;
import vn.peopleos.bff.timesheet.dto.AttendanceResult;
import vn.peopleos.bff.timesheet.dto.DayRequest;
import vn.peopleos.bff.timesheet.dto.PeriodRequest;
import vn.peopleos.bff.timesheet.dto.TimesheetDecisionRequest;
import vn.peopleos.bff.timesheet.dto.TimesheetView;

/**
 * Bảng công cho mọi vai trò (Nhân viên, Quản lý, HR, Kế toán, Giám đốc, Quản trị hệ thống đều chấm công như nhau).
 *
 * <p>Chấm công vào/ra hằng ngày, khai làm thêm giờ → gửi bảng công tháng → người xác nhận duyệt hoặc trả lại
 * → HR chốt công (xem {@link #closeMonth}) → Kế toán tính lương theo ngày công.
 *
 * <p>Người xác nhận: quản lý trực tiếp; HR được xác nhận thay cho bất kỳ ai (trừ chính mình);
 * Giám đốc xác nhận cho người không có quản lý trực tiếp. Không ai tự xác nhận bảng công của mình.
 * Bảng công đã gửi hoặc đã xác nhận thì nhân viên không tự sửa được nữa; HR sửa được cho đến khi chốt công.
 */
@Service
public class TimesheetService {
    /** Ngày công tính theo giờ Việt Nam, không phụ thuộc múi giờ của máy chủ/container. */
    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final List<String> SELF_STATUSES = List.of("present", "remote", "business_trip");

    private final HasuraClient hasura;
    private final EmployeeLookup employees;
    private final NotificationService notifications;
    private final AuditService audit;

    public TimesheetService(HasuraClient hasura, EmployeeLookup employees, NotificationService notifications, AuditService audit) {
        this.hasura = hasura;
        this.employees = employees;
        this.notifications = notifications;
        this.audit = audit;
    }

    /** Hôm nay theo giờ Việt Nam. */
    public static LocalDate today() {
        return LocalDate.now(ZONE);
    }

    // ------------------------------------------------------------------ 1. Chấm công vào / ra
    public AttendanceResult checkIn(CurrentUser user) {
        String employeeId = employees.requireByUser(user.sub()).get("id").asText();
        LocalDate today = today();
        requireOpenForSelf(employeeId, today);
        JsonNode rec = findDay(employeeId, today);
        if (rec != null && Json.text(rec, "check_in") != null) throw ApiException.conflict("Hôm nay bạn đã chấm công vào rồi");
        String now = Instant.now().toString();
        JsonNode saved = rec == null
                ? hasura.query(TimesheetQueries.DAY_INSERT, Params.of("obj", Params.of("employee_id", employeeId, "work_date", today.toString(),
                        "check_in", now, "status", "present", "work_days", 1, "overtime_type", TimesheetCalculator.defaultOvertimeType(today),
                        "source", "self"))).get("insert_attendance_records_one")
                : hasura.query(TimesheetQueries.DAY_UPDATE, Params.of("id", rec.get("id").asText(), "set", Params.of("check_in", now)))
                        .get("update_attendance_records_by_pk");
        return result(saved);
    }

    public AttendanceResult checkOut(CurrentUser user) {
        String employeeId = employees.requireByUser(user.sub()).get("id").asText();
        LocalDate today = today();
        requireOpenForSelf(employeeId, today);
        JsonNode rec = findDay(employeeId, today);
        if (rec == null || Json.text(rec, "check_in") == null) throw ApiException.conflict("Bạn chưa chấm công vào hôm nay");
        if (Json.text(rec, "check_out") != null) throw ApiException.conflict("Hôm nay bạn đã chấm công ra rồi");
        JsonNode saved = hasura.query(TimesheetQueries.DAY_UPDATE, Params.of("id", rec.get("id").asText(),
                "set", Params.of("check_out", Instant.now().toString()))).get("update_attendance_records_by_pk");
        return result(saved);
    }

    // ------------------------------------------------------------------ 2. Khai / sửa công một ngày
    public AttendanceResult saveDay(CurrentUser user, DayRequest req) {
        JsonNode me = employees.requireByUser(user.sub());
        String myId = me.get("id").asText();
        boolean forOther = req.employeeId() != null && !req.employeeId().isBlank() && !req.employeeId().equals(myId);
        boolean asHr = user.isHr() && forOther;
        if (forOther && !user.isHr()) throw ApiException.forbidden("Chỉ HR được sửa công của người khác");
        String employeeId = forOther ? req.employeeId() : myId;
        LocalDate date = req.workDate();
        JsonNode emp = requireEmployee(employeeId);
        if (date.isBefore(LocalDate.parse(emp.get("hire_date").asText()))) throw ApiException.badRequest("Ngày công trước ngày vào làm");

        if (asHr) {
            if ("closed".equals(periodStatus(employeeId, date))) throw ApiException.conflict("Tháng này đã chốt công, không sửa được nữa");
        } else {
            if (!SELF_STATUSES.contains(req.status())) throw ApiException.forbidden("Loại ngày này do HR ghi nhận (nghỉ phép hãy tạo đơn ở mục Nghỉ phép)");
            if (date.isAfter(today())) throw ApiException.badRequest("Không khai công cho ngày chưa đến");
            requireOpenForSelf(employeeId, date);
        }

        boolean working = SELF_STATUSES.contains(req.status());
        double workDays = !working ? 0 : req.workDays() == null ? 1 : req.workDays();
        if (workDays != 0 && workDays != 0.5 && workDays != 1) throw ApiException.badRequest("Số công trong ngày phải là 0, 0,5 hoặc 1");
        if (!TimesheetCalculator.isWorkingDay(date)) workDays = 0;   // thứ 7, chủ nhật chỉ ghi nhận giờ làm thêm
        double overtime = req.overtimeHours() == null ? 0 : req.overtimeHours();
        String overtimeType = req.overtimeType() == null ? TimesheetCalculator.defaultOvertimeType(date) : req.overtimeType();
        Map<String, Object> set = Params.of("status", req.status(), "work_days", workDays, "overtime_hours", overtime,
                "overtime_type", overtimeType, "note", req.note(), "source", asHr ? "hr" : "self");

        JsonNode rec = findDay(employeeId, date);
        if (!asHr && rec != null && "hr".equals(Json.text(rec, "source"))) {
            throw ApiException.forbidden("Ngày này đã được HR ghi nhận; liên hệ HR nếu cần điều chỉnh");
        }
        JsonNode saved;
        if (rec == null) {
            Map<String, Object> obj = Params.of("employee_id", employeeId, "work_date", date.toString());
            obj.putAll(set);
            saved = hasura.query(TimesheetQueries.DAY_INSERT, Params.of("obj", obj)).get("insert_attendance_records_one");
        } else {
            saved = hasura.query(TimesheetQueries.DAY_UPDATE, Params.of("id", rec.get("id").asText(), "set", set)).get("update_attendance_records_by_pk");
        }
        if (asHr) {
            resummarizeIfExists(emp, date);
            audit.record(user, "TIMESHEET.DAY_ADJUSTED", "attendance_record", saved.get("id").asText(),
                    Params.of("employee", emp.get("full_name").asText(), "work_date", date.toString(), "status", req.status(),
                            "work_days", workDays, "overtime_hours", overtime, "note", req.note()));
        }
        return result(saved);
    }

    // ------------------------------------------------------------------ 3. Xem bảng công tháng
    public TimesheetView view(CurrentUser user, int year, int month, String employeeIdOrNull) {
        requireValidPeriod(year, month);
        JsonNode me = employees.requireByUser(user.sub());
        String myId = me.get("id").asText();
        String employeeId = employeeIdOrNull == null || employeeIdOrNull.isBlank() ? myId : employeeIdOrNull;
        JsonNode emp = requireEmployee(employeeId);
        boolean own = employeeId.equals(myId);
        boolean directManager = user.sub().equals(Json.text(emp.path("manager"), "user_id"));
        if (!own && !directManager && !user.hasAny("hr", "accountant", "director")) {
            throw ApiException.forbidden("Bạn không được xem bảng công của nhân viên này");
        }
        MonthData data = loadMonth(emp, year, month);
        String status = data.status();
        boolean editable = own ? "open".equals(status) : user.isHr() && !"closed".equals(status);
        return toView(data.timesheetId(), employeeId, year, month, status, data.reviewNote(), editable, data.summary());
    }

    // ------------------------------------------------------------------ 4. Gửi bảng công
    public TimesheetView submit(CurrentUser user, PeriodRequest req) {
        requireValidPeriod(req.year(), req.month());
        JsonNode me = employees.requireByUser(user.sub());
        String employeeId = me.get("id").asText();
        JsonNode emp = requireEmployee(employeeId);
        MonthData data = loadMonth(emp, req.year(), req.month());
        if (!"open".equals(data.status())) throw ApiException.conflict("Bảng công đã ở trạng thái '" + data.status() + "'");
        Summary s = data.summary();
        Map<String, Object> obj = summaryColumns(s);
        obj.put("employee_id", employeeId);
        obj.put("period_year", req.year());
        obj.put("period_month", req.month());
        obj.put("status", "submitted");
        obj.put("submitted_at", Instant.now().toString());
        obj.put("review_note", null);
        String id = hasura.query(TimesheetQueries.SUBMIT, Params.of("obj", obj)).get("insert_timesheets_one").get("id").asText();

        String label = req.month() + "/" + req.year();
        String managerUser = Json.text(emp.path("manager"), "user_id");
        Target target = managerUser != null && !managerUser.equals(user.sub()) ? Target.user(managerUser)
                : user.isHr() ? Target.role("director") : Target.role("hr");
        notifications.notify(target, "Bảng công tháng " + label + " chờ xác nhận",
                emp.get("full_name").asText() + ": " + fmt(s.paidDays()) + "/" + fmt(s.standardDays()) + " ngày công, "
                        + fmt(s.overtimeHours()) + " giờ làm thêm.", "timesheet", id, "timesheet.submitted");
        audit.record(user, "TIMESHEET.SUBMITTED", "timesheet", id, Params.of("year", req.year(), "month", req.month(),
                "paid_days", s.paidDays(), "overtime_hours", s.overtimeHours()));
        return toView(id, employeeId, req.year(), req.month(), "submitted", null, false, s);
    }

    // ------------------------------------------------------------------ 5. Xác nhận / trả lại
    public TimesheetView decide(CurrentUser user, String timesheetId, TimesheetDecisionRequest body) {
        JsonNode ts = hasura.query(TimesheetQueries.BY_ID, Params.of("id", timesheetId)).get("timesheets_by_pk");
        if (Json.isMissing(ts)) throw ApiException.notFound("Không tìm thấy bảng công");
        JsonNode emp = ts.get("employee");
        if (user.sub().equals(Json.text(emp, "user_id"))) throw ApiException.forbidden("Không thể tự xác nhận bảng công của chính mình");
        boolean directManager = user.sub().equals(Json.text(emp.path("manager"), "user_id"));
        boolean noManager = Json.text(emp, "manager_id") == null;
        if (!directManager && !user.isHr() && !(user.isDirector() && noManager)) {
            throw ApiException.forbidden("Bảng công do quản lý trực tiếp hoặc HR xác nhận");
        }
        String current = ts.get("status").asText();
        if (!"submitted".equals(current)) throw ApiException.conflict("Bảng công đang ở trạng thái '" + current + "', không chờ xác nhận");

        int year = ts.get("period_year").asInt();
        int month = ts.get("period_month").asInt();
        String label = month + "/" + year;
        boolean approve = "approve".equals(body.decision());
        String employeeUser = Json.text(emp, "user_id");
        if (approve) {
            JsonNode approver = employees.findByUser(user.sub());
            hasura.query(TimesheetQueries.CONFIRM, Params.of("id", timesheetId, "by", approver == null ? null : approver.get("id").asText()));
            if (employeeUser != null) notifications.notify(Target.user(employeeUser), "Bảng công tháng " + label + " đã được xác nhận",
                    "Bảng công sẽ được HR chốt để tính lương.", "timesheet", timesheetId, "timesheet.confirmed");
        } else {
            if (body.note() == null || body.note().isBlank()) throw ApiException.badRequest("Cần nêu lý do khi trả lại bảng công");
            hasura.query(TimesheetQueries.RETURN, Params.of("id", timesheetId, "note", body.note()));
            if (employeeUser != null) notifications.notify(Target.user(employeeUser), "Bảng công tháng " + label + " bị trả lại",
                    body.note(), "timesheet", timesheetId, "timesheet.returned");
        }
        audit.record(user, approve ? "TIMESHEET.CONFIRMED" : "TIMESHEET.RETURNED", "timesheet", timesheetId,
                Params.of("employee", emp.get("full_name").asText(), "year", year, "month", month, "note", body.note()));
        String status = approve ? "confirmed" : "open";
        return toView(timesheetId, ts.get("employee_id").asText(), year, month, status, approve ? null : body.note(), false,
                loadMonth(requireEmployee(ts.get("employee_id").asText()), year, month).summary());
    }

    // ------------------------------------------------------------------ 6. HR chốt công (gọi từ kỳ lương)
    /** Kết quả chốt công: tổng số bảng công đã khóa và số bảng đã được xác nhận trước khi chốt. */
    public record CloseResult(int total, int confirmed) {}

    /**
     * Khóa bảng công của mọi nhân viên đang làm việc trong tháng. Số liệu được tính lại từ chấm công và đơn nghỉ đã duyệt tại thời điểm chốt;
     * nhân viên chưa gửi hoặc chưa được xác nhận vẫn được chốt theo số liệu hệ thống (HR chịu trách nhiệm rà soát trước khi chốt).
     */
    public CloseResult closeMonth(int year, int month) {
        LocalDate first = LocalDate.of(year, month, 1);
        LocalDate last = first.plusMonths(1).minusDays(1);
        JsonNode data = hasura.query(TimesheetQueries.CLOSE_DATA, Params.of("from", first.toString(), "to", last.toString(), "y", year, "m", month));
        Map<String, List<Day>> daysByEmp = new HashMap<>();
        for (JsonNode r : data.path("attendance_records")) daysByEmp.computeIfAbsent(r.get("employee_id").asText(), k -> new ArrayList<>()).add(day(r));
        Map<String, List<Leave>> leavesByEmp = new HashMap<>();
        for (JsonNode l : data.path("leave_requests")) leavesByEmp.computeIfAbsent(l.get("employee_id").asText(), k -> new ArrayList<>()).add(leave(l));
        int confirmed = 0;
        for (JsonNode t : data.path("timesheets")) {
            if ("confirmed".equals(t.get("status").asText())) confirmed++;
        }
        String now = Instant.now().toString();
        LocalDate until = last.isAfter(today()) ? today() : null;
        List<Map<String, Object>> rows = new ArrayList<>();
        for (JsonNode e : data.path("employees")) {
            String id = e.get("id").asText();
            Summary s = TimesheetCalculator.summarize(year, month, LocalDate.parse(e.get("hire_date").asText()), until,
                    daysByEmp.getOrDefault(id, List.of()), leavesByEmp.getOrDefault(id, List.of()));
            Map<String, Object> row = summaryColumns(s);
            row.put("employee_id", id);
            row.put("period_year", year);
            row.put("period_month", month);
            row.put("status", "closed");
            row.put("closed_at", now);
            rows.add(row);
        }
        if (!rows.isEmpty()) hasura.query(TimesheetQueries.CLOSE, Params.of("objs", rows));
        return new CloseResult(rows.size(), confirmed);
    }

    /** Bảng công đã chốt của một tháng, theo employee_id (đầu vào của bước tính lương). */
    public Map<String, JsonNode> closedOfMonth(int year, int month) {
        Map<String, JsonNode> byEmployee = new HashMap<>();
        for (JsonNode t : hasura.query(TimesheetQueries.CLOSED_OF_MONTH, Params.of("y", year, "m", month)).path("timesheets")) {
            byEmployee.put(t.get("employee_id").asText(), t);
        }
        return byEmployee;
    }

    // ------------------------------------------------------------------ nội bộ
    private record MonthData(String timesheetId, String status, String reviewNote, Summary summary) {}

    private MonthData loadMonth(JsonNode emp, int year, int month) {
        LocalDate first = LocalDate.of(year, month, 1);
        LocalDate last = first.plusMonths(1).minusDays(1);
        JsonNode data = hasura.query(TimesheetQueries.MONTH, Params.of("eid", emp.get("id").asText(),
                "from", first.toString(), "to", last.toString(), "y", year, "m", month));
        List<Day> days = new ArrayList<>();
        for (JsonNode r : data.path("attendance_records")) days.add(day(r));
        List<Leave> leaves = new ArrayList<>();
        for (JsonNode l : data.path("leave_requests")) leaves.add(leave(l));
        LocalDate until = last.isAfter(today()) ? today() : null;
        Summary s = TimesheetCalculator.summarize(year, month, LocalDate.parse(emp.get("hire_date").asText()), until, days, leaves);
        JsonNode ts = Json.first(data.get("timesheets"));
        return new MonthData(ts == null ? null : ts.get("id").asText(), ts == null ? "open" : ts.get("status").asText(),
                ts == null ? null : Json.text(ts, "review_note"), s);
    }

    /** Sau khi HR sửa công: nếu tháng đó đã có bảng công (đã gửi/đã xác nhận) thì cập nhật lại số liệu tổng hợp. */
    private void resummarizeIfExists(JsonNode emp, LocalDate date) {
        MonthData data = loadMonth(emp, date.getYear(), date.getMonthValue());
        if (data.timesheetId() == null) return;
        hasura.query(TimesheetQueries.RESUMMARIZE, Params.of("id", data.timesheetId(), "set", summaryColumns(data.summary())));
    }

    private JsonNode findDay(String employeeId, LocalDate date) {
        return Json.first(hasura.query(TimesheetQueries.DAY, Params.of("eid", employeeId, "d", date.toString())).get("attendance_records"));
    }

    private JsonNode requireEmployee(String employeeId) {
        JsonNode emp = hasura.query(TimesheetQueries.EMPLOYEE, Params.of("id", employeeId)).get("employees_by_pk");
        if (Json.isMissing(emp)) throw ApiException.notFound("Không tìm thấy nhân viên");
        return emp;
    }

    /** Trạng thái bảng công của tháng chứa ngày {@code date}; chưa có bảng công thì là open. */
    private String periodStatus(String employeeId, LocalDate date) {
        JsonNode ts = Json.first(hasura.query(TimesheetQueries.PERIOD_STATUS,
                Params.of("eid", employeeId, "y", date.getYear(), "m", date.getMonthValue())).get("timesheets"));
        return ts == null ? "open" : ts.get("status").asText();
    }

    private void requireOpenForSelf(String employeeId, LocalDate date) {
        String status = periodStatus(employeeId, date);
        if ("closed".equals(status)) throw ApiException.conflict("Tháng " + date.getMonthValue() + "/" + date.getYear() + " đã chốt công");
        if (!"open".equals(status)) throw ApiException.conflict("Bảng công tháng " + date.getMonthValue() + "/" + date.getYear()
                + " đã gửi xác nhận; cần được trả lại hoặc nhờ HR điều chỉnh");
    }

    private static void requireValidPeriod(int year, int month) {
        if (year < 2020 || year > 2100 || month < 1 || month > 12) throw ApiException.badRequest("Kỳ công không hợp lệ");
        if (LocalDate.of(year, month, 1).isAfter(today().withDayOfMonth(1))) throw ApiException.badRequest("Chưa đến kỳ công " + month + "/" + year);
    }

    private static Day day(JsonNode r) {
        return new Day(LocalDate.parse(r.get("work_date").asText()), r.get("status").asText(), r.path("work_days").asDouble(0),
                r.path("overtime_hours").asDouble(0), Json.text(r, "overtime_type"));
    }

    private static Leave leave(JsonNode l) {
        return new Leave(LocalDate.parse(l.get("start_date").asText()), LocalDate.parse(l.get("end_date").asText()), l.get("leave_type").asText());
    }

    private static Map<String, Object> summaryColumns(Summary s) {
        return Params.of("standard_days", s.standardDays(), "work_days", s.workDays(), "paid_leave_days", s.paidLeaveDays(),
                "holiday_days", s.holidayDays(), "unpaid_leave_days", s.unpaidLeaveDays(), "absent_days", s.absentDays(),
                "ot_weekday_hours", s.otWeekdayHours(), "ot_weekend_hours", s.otWeekendHours(), "ot_holiday_hours", s.otHolidayHours());
    }

    private static TimesheetView toView(String id, String employeeId, int year, int month, String status, String reviewNote,
                                        boolean editable, Summary s) {
        return new TimesheetView(id, employeeId, year, month, status, reviewNote, editable, s.standardDays(), s.workDays(),
                s.paidLeaveDays(), s.holidayDays(), s.unpaidLeaveDays(), s.absentDays(), s.paidDays(), s.otWeekdayHours(),
                s.otWeekendHours(), s.otHolidayHours(), s.missingDates().stream().map(LocalDate::toString).toList());
    }

    private static AttendanceResult result(JsonNode r) {
        return new AttendanceResult(r.get("id").asText(), r.get("work_date").asText(), Json.text(r, "check_in"), Json.text(r, "check_out"),
                r.get("status").asText());
    }

    /** 21.0 -> "21", 20.5 -> "20,5". */
    static String fmt(double v) {
        return (v == Math.rint(v) ? String.valueOf((long) v) : String.valueOf(v)).replace('.', ',');
    }
}
