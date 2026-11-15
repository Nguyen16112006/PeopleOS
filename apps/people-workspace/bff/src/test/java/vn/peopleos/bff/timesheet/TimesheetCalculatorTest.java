// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.timesheet;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import vn.peopleos.bff.timesheet.TimesheetCalculator.Day;
import vn.peopleos.bff.timesheet.TimesheetCalculator.Leave;
import vn.peopleos.bff.timesheet.TimesheetCalculator.Summary;

/** Tổng hợp bảng công tháng. Tháng 10/2026 có 22 ngày làm việc (thứ 2 - thứ 6), bắt đầu vào thứ 5. */
class TimesheetCalculatorTest {
    private static final double EPS = 1e-9;

    private static Day present(int day) {
        return new Day(LocalDate.of(2026, 10, day), "present", 1, 0, "weekday");
    }

    /** Chấm công đủ mọi ngày làm việc của tháng 10/2026, trừ các ngày trong {@code skip}. */
    private static List<Day> fullMonthExcept(Integer... skip) {
        List<Integer> skipped = List.of(skip);
        List<Day> days = new ArrayList<>();
        for (int d = 1; d <= 31; d++) {
            if (TimesheetCalculator.isWorkingDay(LocalDate.of(2026, 10, d)) && !skipped.contains(d)) days.add(present(d));
        }
        return days;
    }

    @Test
    void fullAttendanceEqualsStandardDays() {
        Summary s = TimesheetCalculator.summarize(2026, 10, null, null, fullMonthExcept(), List.of());
        assertEquals(22, s.standardDays(), EPS);
        assertEquals(22, s.workDays(), EPS);
        assertEquals(22, s.paidDays(), EPS);
        assertEquals(0, s.absentDays(), EPS);
        assertTrue(s.missingDates().isEmpty());
    }

    @Test
    void dayWithoutRecordOrLeaveIsAbsentAndReportedMissing() {
        Summary s = TimesheetCalculator.summarize(2026, 10, null, null, fullMonthExcept(5, 6), List.of());
        assertEquals(20, s.workDays(), EPS);
        assertEquals(2, s.absentDays(), EPS);
        assertEquals(List.of(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 6)), s.missingDates());
    }

    @Test
    void approvedLeaveFillsDaysWithoutRecord() {
        List<Leave> leaves = List.of(
                new Leave(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 6), "annual"),     // hưởng lương
                new Leave(LocalDate.of(2026, 10, 12), LocalDate.of(2026, 10, 12), "sick"),      // hưởng lương
                new Leave(LocalDate.of(2026, 10, 19), LocalDate.of(2026, 10, 20), "unpaid"),    // không lương
                new Leave(LocalDate.of(2026, 10, 26), LocalDate.of(2026, 10, 26), "personal")); // không lương
        Summary s = TimesheetCalculator.summarize(2026, 10, null, null, fullMonthExcept(5, 6, 12, 19, 20, 26), leaves);
        assertEquals(16, s.workDays(), EPS);
        assertEquals(3, s.paidLeaveDays(), EPS);
        assertEquals(3, s.unpaidLeaveDays(), EPS);
        assertEquals(0, s.absentDays(), EPS);
        assertEquals(19, s.paidDays(), EPS);
    }

    @Test
    void leaveSpanningWeekendOnlyCountsWorkingDays() {
        // thứ 6 ngày 9 đến thứ 2 ngày 12: chỉ 2 ngày làm việc
        List<Leave> leaves = List.of(new Leave(LocalDate.of(2026, 10, 9), LocalDate.of(2026, 10, 12), "annual"));
        Summary s = TimesheetCalculator.summarize(2026, 10, null, null, fullMonthExcept(9, 12), leaves);
        assertEquals(2, s.paidLeaveDays(), EPS);
        assertEquals(22, s.paidDays(), EPS);
    }

    @Test
    void halfDayIsCompletedByLeaveOrCountedAbsent() {
        List<Day> days = fullMonthExcept(5, 6);
        days.add(new Day(LocalDate.of(2026, 10, 5), "present", 0.5, 0, "weekday"));   // nửa ngày, có đơn nghỉ phép
        days.add(new Day(LocalDate.of(2026, 10, 6), "remote", 0.5, 0, "weekday"));    // nửa ngày, không có đơn
        List<Leave> leaves = List.of(new Leave(LocalDate.of(2026, 10, 5), LocalDate.of(2026, 10, 5), "annual"));
        Summary s = TimesheetCalculator.summarize(2026, 10, null, null, days, leaves);
        assertEquals(21, s.workDays(), EPS);
        assertEquals(0.5, s.paidLeaveDays(), EPS);
        assertEquals(0.5, s.absentDays(), EPS);
        assertTrue(s.missingDates().isEmpty());   // ngày 6 đã có bản ghi nên không báo "chưa chấm công"
    }

    @Test
    void explicitStatusesGoToTheirOwnBuckets() {
        List<Day> days = fullMonthExcept(1, 2, 5, 6);
        days.add(new Day(LocalDate.of(2026, 10, 1), "holiday", 0, 0, "weekday"));
        days.add(new Day(LocalDate.of(2026, 10, 2), "paid_leave", 0, 0, "weekday"));
        days.add(new Day(LocalDate.of(2026, 10, 5), "unpaid_leave", 0, 0, "weekday"));
        days.add(new Day(LocalDate.of(2026, 10, 6), "absent", 0, 0, "weekday"));
        Summary s = TimesheetCalculator.summarize(2026, 10, null, null, days, List.of());
        assertEquals(18, s.workDays(), EPS);
        assertEquals(1, s.holidayDays(), EPS);
        assertEquals(1, s.paidLeaveDays(), EPS);
        assertEquals(1, s.unpaidLeaveDays(), EPS);
        assertEquals(1, s.absentDays(), EPS);
        assertEquals(20, s.paidDays(), EPS);
    }

    @Test
    void daysBeforeHireDateAreNeitherPaidNorAbsent() {
        LocalDate hire = LocalDate.of(2026, 10, 15);   // còn 12 ngày làm việc từ 15 đến 30
        List<Day> days = new ArrayList<>();
        for (Day d : fullMonthExcept()) {
            if (!d.date().isBefore(hire)) days.add(d);
        }
        Summary s = TimesheetCalculator.summarize(2026, 10, hire, null, days, List.of());
        assertEquals(22, s.standardDays(), EPS);
        assertEquals(12, s.paidDays(), EPS);
        assertEquals(0, s.absentDays(), EPS);
    }

    @Test
    void futureDaysAreNotAbsentYetWhenMonthIsOngoing() {
        LocalDate today = LocalDate.of(2026, 10, 9);   // đã qua 7 ngày làm việc: 1, 2, 5, 6, 7, 8, 9
        List<Day> days = List.of(present(1), present(2), present(5), present(6), present(7));
        Summary s = TimesheetCalculator.summarize(2026, 10, null, today, days, List.of());
        assertEquals(5, s.workDays(), EPS);
        assertEquals(2, s.absentDays(), EPS);
        assertEquals(List.of(LocalDate.of(2026, 10, 8), LocalDate.of(2026, 10, 9)), s.missingDates());
    }

    @Test
    void overtimeIsGroupedByTypeIncludingWeekends() {
        List<Day> days = fullMonthExcept(7);
        days.add(new Day(LocalDate.of(2026, 10, 7), "present", 1, 2, "weekday"));
        days.add(new Day(LocalDate.of(2026, 10, 10), "present", 0, 4, "weekend"));    // thứ 7
        days.add(new Day(LocalDate.of(2026, 10, 11), "present", 0, 3, null));          // chủ nhật, không ghi loại: mặc định weekend
        days.add(new Day(LocalDate.of(2026, 10, 17), "present", 0, 8, "holiday"));
        Summary s = TimesheetCalculator.summarize(2026, 10, null, null, days, List.of());
        assertEquals(22, s.workDays(), EPS);            // bản ghi cuối tuần không cộng công
        assertEquals(2, s.otWeekdayHours(), EPS);
        assertEquals(7, s.otWeekendHours(), EPS);
        assertEquals(8, s.otHolidayHours(), EPS);
        assertEquals(17, s.overtimeHours(), EPS);
    }

    @Test
    void defaultOvertimeTypeFollowsDayOfWeek() {
        assertEquals("weekday", TimesheetCalculator.defaultOvertimeType(LocalDate.of(2026, 10, 9)));
        assertEquals("weekend", TimesheetCalculator.defaultOvertimeType(LocalDate.of(2026, 10, 10)));
    }
}
