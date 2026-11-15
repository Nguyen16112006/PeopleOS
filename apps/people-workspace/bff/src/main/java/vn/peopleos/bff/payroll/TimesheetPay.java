// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.payroll;

/**
 * Quy đổi bảng công thành tiền lương của tháng.
 *
 * <p>Lương theo ngày công = lương hợp đồng × ngày công hưởng lương ÷ công chuẩn (không vượt quá lương hợp đồng).
 * Tiền làm thêm giờ theo Điều 98 Bộ luật Lao động 2019: đơn giá giờ = lương cơ bản ÷ công chuẩn ÷ 8 giờ,
 * nhân 150% (ngày thường), 200% (ngày nghỉ hằng tuần), 300% (ngày lễ, tết).
 * Chưa xử lý phần tiền làm thêm được miễn thuế TNCN và làm thêm ban đêm; kết quả mang tính tham khảo.
 */
public final class TimesheetPay {
    private TimesheetPay() {}

    public static final double HOURS_PER_DAY = 8;
    public static final double RATE_WEEKDAY = 1.5;
    public static final double RATE_WEEKEND = 2.0;
    public static final double RATE_HOLIDAY = 3.0;

    /** Lương (hoặc phụ cấp) theo ngày công. Công chuẩn không hợp lệ thì trả nguyên số tiền hợp đồng. */
    public static long prorate(long amount, double paidDays, double standardDays) {
        if (standardDays <= 0) return amount;
        double ratio = Math.max(0, Math.min(paidDays, standardDays)) / standardDays;
        return PayrollCalculator.round(amount * ratio);
    }

    public static long overtimePay(long baseSalary, double standardDays, double weekdayHours, double weekendHours, double holidayHours) {
        if (standardDays <= 0) return 0;
        double hourly = baseSalary / standardDays / HOURS_PER_DAY;
        return PayrollCalculator.round(hourly * (RATE_WEEKDAY * weekdayHours + RATE_WEEKEND * weekendHours + RATE_HOLIDAY * holidayHours));
    }
}
