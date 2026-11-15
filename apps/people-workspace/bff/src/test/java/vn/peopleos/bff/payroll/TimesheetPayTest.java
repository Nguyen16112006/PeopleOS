// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.payroll;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;
import org.junit.jupiter.api.Test;

/** Quy đổi bảng công thành lương theo ngày công và tiền làm thêm giờ. */
class TimesheetPayTest {
    @Test
    void fullMonthKeepsContractAmount() {
        assertEquals(22_000_000L, TimesheetPay.prorate(22_000_000, 22, 22));
    }

    @Test
    void salaryIsProratedByPaidDays() {
        assertEquals(20_000_000L, TimesheetPay.prorate(22_000_000, 20, 22));
        assertEquals(10_500_000L, TimesheetPay.prorate(22_000_000, 10.5, 22));
        assertEquals(0L, TimesheetPay.prorate(22_000_000, 0, 22));
    }

    @Test
    void paidDaysNeverExceedStandardDays() {
        assertEquals(22_000_000L, TimesheetPay.prorate(22_000_000, 25, 22));
    }

    @Test
    void invalidStandardDaysFallsBackToContractAmount() {
        assertEquals(22_000_000L, TimesheetPay.prorate(22_000_000, 10, 0));
        assertEquals(0L, TimesheetPay.overtimePay(22_000_000, 0, 5, 0, 0));
    }

    @Test
    void overtimeUsesLegalMultipliers() {
        // đơn giá giờ = 22.000.000 / 22 / 8 = 125.000 đ
        assertEquals(187_500L, TimesheetPay.overtimePay(22_000_000, 22, 1, 0, 0));    // 150%
        assertEquals(250_000L, TimesheetPay.overtimePay(22_000_000, 22, 0, 1, 0));    // 200%
        assertEquals(375_000L, TimesheetPay.overtimePay(22_000_000, 22, 0, 0, 1));    // 300%
        assertEquals(2_500_000L, TimesheetPay.overtimePay(22_000_000, 22, 4, 4, 2));  // 750.000 + 1.000.000 + 750.000
    }

    @Test
    void payrollRowFromTimesheetProratesAndRecordsDays() {
        Map<String, Object> r = PayrollRows.payrollFromTimesheet("e1", 2026, 10, 22_000_000, 2_200_000, 22, 20, 4, 0, 0, null, 1_000_000, 0, 1, "draft");
        assertEquals(20_000_000L, r.get("base_salary"));
        assertEquals(2_000_000L, r.get("allowance"));
        assertEquals(750_000L, r.get("overtime_pay"));          // 4 giờ × 125.000 × 150%
        assertEquals(1_000_000L, r.get("bonus"));
        assertEquals(23_750_000L, r.get("gross"));
        assertEquals(22.0, r.get("standard_days"));
        assertEquals(20.0, r.get("paid_days"));
        assertEquals(4.0, r.get("overtime_hours"));
    }

    @Test
    void accountantOverrideReplacesComputedOvertime() {
        Map<String, Object> r = PayrollRows.payrollFromTimesheet("e1", 2026, 10, 22_000_000, 0, 22, 22, 4, 0, 0, 500_000L, 0, 0, 1, "draft");
        assertEquals(500_000L, r.get("overtime_pay"));
        assertEquals(22_500_000L, r.get("gross"));
    }
}
