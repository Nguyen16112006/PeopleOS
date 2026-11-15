// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.timesheet;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Tổng hợp bảng công tháng từ bản ghi chấm công từng ngày và các đơn nghỉ đã duyệt (thuần tính toán, không gọi dịch vụ ngoài).
 *
 * <p>Quy tắc cho từng ngày làm việc (thứ 2 - thứ 6) của tháng, kể từ ngày vào làm:
 * <ul>
 *   <li>Có bản ghi chấm công: đi làm (văn phòng, từ xa, công tác) tính theo số công 0,5 hoặc 1; nghỉ lễ, nghỉ hưởng lương,
 *       nghỉ không lương, vắng tính trọn 1 ngày vào nhóm tương ứng.</li>
 *   <li>Phần còn thiếu của ngày (không có bản ghi, hoặc chỉ làm nửa ngày): nếu có đơn nghỉ đã duyệt phủ ngày đó thì tính theo
 *       loại đơn (phép năm, ốm: hưởng lương; không lương, việc riêng: không lương); nếu không thì tính vắng.</li>
 * </ul>
 * Ngày trước ngày vào làm không thuộc nhóm nào (không hưởng lương, cũng không bị tính vắng).
 * Giờ làm thêm lấy từ mọi bản ghi trong tháng, kể cả thứ 7 và chủ nhật, cộng theo loại (ngày thường, ngày nghỉ, ngày lễ).
 */
public final class TimesheetCalculator {
    private TimesheetCalculator() {}

    /** Một bản ghi chấm công. */
    public record Day(LocalDate date, String status, double workDays, double overtimeHours, String overtimeType) {}

    /** Một đơn nghỉ đã duyệt. leaveType ∈ annual | sick | unpaid | personal. */
    public record Leave(LocalDate start, LocalDate end, String leaveType) {
        boolean covers(LocalDate d) {
            return !d.isBefore(start) && !d.isAfter(end);
        }

        boolean paid() {
            return "annual".equals(leaveType) || "sick".equals(leaveType);
        }
    }

    /** Bảng công tháng. missingDates: ngày làm việc đã qua mà chưa chấm công và không có đơn nghỉ (đang bị tính vắng). */
    public record Summary(double standardDays, double workDays, double paidLeaveDays, double holidayDays, double unpaidLeaveDays,
                          double absentDays, double otWeekdayHours, double otWeekendHours, double otHolidayHours,
                          List<LocalDate> missingDates) {
        /** Ngày công hưởng lương = công đi làm + nghỉ hưởng lương + nghỉ lễ. */
        public double paidDays() {
            return workDays + paidLeaveDays + holidayDays;
        }

        public double overtimeHours() {
            return otWeekdayHours + otWeekendHours + otHolidayHours;
        }
    }

    public static boolean isWorkingDay(LocalDate d) {
        DayOfWeek w = d.getDayOfWeek();
        return w != DayOfWeek.SATURDAY && w != DayOfWeek.SUNDAY;
    }

    /** Loại làm thêm mặc định theo ngày: thứ 7, chủ nhật là ngày nghỉ hằng tuần. */
    public static String defaultOvertimeType(LocalDate d) {
        return isWorkingDay(d) ? "weekday" : "weekend";
    }

    /**
     * @param hireDate ngày vào làm (null: tính từ đầu tháng)
     * @param countUntil chỉ xét ngày làm việc đến hết ngày này (thường là hôm nay khi tháng chưa kết thúc; null: hết tháng).
     *                   Ngày sau mốc này chưa diễn ra nên chưa bị tính vắng, trừ khi đã có bản ghi hoặc đơn nghỉ.
     */
    public static Summary summarize(int year, int month, LocalDate hireDate, LocalDate countUntil, List<Day> days, List<Leave> leaves) {
        LocalDate first = LocalDate.of(year, month, 1);
        LocalDate last = first.plusMonths(1).minusDays(1);
        Map<LocalDate, Day> byDate = new HashMap<>();
        for (Day d : days) byDate.put(d.date(), d);

        double standard = 0, work = 0, paidLeave = 0, holiday = 0, unpaid = 0, absent = 0;
        List<LocalDate> missing = new ArrayList<>();
        for (LocalDate d = first; !d.isAfter(last); d = d.plusDays(1)) {
            if (!isWorkingDay(d)) continue;
            standard += 1;
            if (hireDate != null && d.isBefore(hireDate)) continue;
            Day rec = byDate.get(d);
            double remaining = 1;
            if (rec != null) {
                switch (rec.status()) {
                    case "holiday" -> { holiday += 1; remaining = 0; }
                    case "paid_leave" -> { paidLeave += 1; remaining = 0; }
                    case "unpaid_leave" -> { unpaid += 1; remaining = 0; }
                    case "absent" -> { absent += 1; remaining = 0; }
                    default -> {   // present | remote | business_trip
                        double w = Math.max(0, Math.min(1, rec.workDays()));
                        work += w;
                        remaining = 1 - w;
                    }
                }
            }
            if (remaining <= 0) continue;
            Leave leave = null;
            for (Leave l : leaves) {
                if (l.covers(d)) { leave = l; break; }
            }
            if (leave != null) {
                if (leave.paid()) paidLeave += remaining; else unpaid += remaining;
            } else if (countUntil == null || !d.isAfter(countUntil)) {
                absent += remaining;
                if (rec == null) missing.add(d);
            }
        }

        double otWeekday = 0, otWeekend = 0, otHoliday = 0;
        for (Day d : days) {
            if (d.overtimeHours() <= 0 || d.date().isBefore(first) || d.date().isAfter(last)) continue;
            String type = d.overtimeType() == null ? defaultOvertimeType(d.date()) : d.overtimeType();
            switch (type) {
                case "holiday" -> otHoliday += d.overtimeHours();
                case "weekend" -> otWeekend += d.overtimeHours();
                default -> otWeekday += d.overtimeHours();
            }
        }
        return new Summary(standard, work, paidLeave, holiday, unpaid, absent, otWeekday, otWeekend, otHoliday, List.copyOf(missing));
    }
}
