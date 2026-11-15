// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.payroll;

import java.time.LocalDate;
import java.util.Map;
import vn.peopleos.bff.common.Params;

/** Dựng dòng bảng lương và dòng bảo hiểm từ kết quả {@link PayrollCalculator}. */
final class PayrollRows {
    private PayrollRows() {}

    /** Dòng bảng lương (payrolls); gross = lương cơ bản + phụ cấp + làm thêm giờ + thưởng, lương đóng bảo hiểm = gross (quy ước của hệ thống). */
    static Map<String, Object> payroll(String employeeId, int year, int month, long base, long allowance, long overtime, long bonus,
                                       int dependents, int region, String status) {
        long gross = base + allowance + overtime + bonus;
        PayrollCalculator.Result r = PayrollCalculator.computeNet(gross, dependents, region, LocalDate.of(year, month, 1), null);
        return Params.of("employee_id", employeeId, "period_year", year, "period_month", month,
                "base_salary", base, "allowance", allowance, "overtime_pay", overtime, "bonus", bonus,
                "gross", r.gross(), "insured_salary", r.insuredSalary(),
                "bhxh_employee", r.bhxh(), "bhyt_employee", r.bhyt(), "bhtn_employee", r.bhtn(),
                "taxable_income", r.taxableIncome(), "personal_income_tax", r.pit(), "net_salary", r.net(), "status", status);
    }

    /**
     * Dòng bảng lương tính theo bảng công đã chốt: lương cơ bản và phụ cấp hưởng theo ngày công, tiền làm thêm giờ tính từ số giờ
     * trên bảng công (trừ khi Kế toán nhập đè {@code overtimeOverride}). Phiếu lương lưu kèm công chuẩn, ngày công hưởng lương và giờ làm thêm.
     */
    static Map<String, Object> payrollFromTimesheet(String employeeId, int year, int month, long contractBase, long contractAllowance,
                                                    double standardDays, double paidDays, double otWeekday, double otWeekend, double otHoliday,
                                                    Long overtimeOverride, long bonus, int dependents, int region, String status) {
        long base = TimesheetPay.prorate(contractBase, paidDays, standardDays);
        long allowance = TimesheetPay.prorate(contractAllowance, paidDays, standardDays);
        long overtime = overtimeOverride != null ? overtimeOverride
                : TimesheetPay.overtimePay(contractBase, standardDays, otWeekday, otWeekend, otHoliday);
        Map<String, Object> row = payroll(employeeId, year, month, base, allowance, overtime, bonus, dependents, region, status);
        row.put("standard_days", standardDays);
        row.put("paid_days", Math.min(paidDays, standardDays));
        row.put("overtime_hours", otWeekday + otWeekend + otHoliday);
        return row;
    }

    /** Dòng bảo hiểm tháng (insurance_records) tính từ lương đóng bảo hiểm đã lưu trên phiếu lương. */
    static Map<String, Object> insurance(String employeeId, int year, int month, long insuredSalary, long gross, int dependents, int region) {
        PayrollCalculator.Result r = PayrollCalculator.computeNet(gross, dependents, region, LocalDate.of(year, month, 1), insuredSalary);
        return Params.of("employee_id", employeeId, "period", LocalDate.of(year, month, 1).toString(), "insured_salary", r.insuredSalary(),
                "bhxh_employee", r.bhxh(), "bhyt_employee", r.bhyt(), "bhtn_employee", r.bhtn(),
                "bhxh_employer", r.employerBhxh(), "bhyt_employer", r.employerBhyt(), "bhtn_employer", r.employerBhtn());
    }
}
