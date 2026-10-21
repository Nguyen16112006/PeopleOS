package vn.peopleos.bff.payroll.dto;

import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** Body của POST /api/payslip-complaints/{id}/adjust: Kế toán điều chỉnh tiền làm thêm giờ và/hoặc thưởng rồi tính lại phiếu lương. */
public record AdjustPayslipRequest(@PositiveOrZero Long overtimePay, @PositiveOrZero Long bonus, @Size(max = 1000) String note) {}
