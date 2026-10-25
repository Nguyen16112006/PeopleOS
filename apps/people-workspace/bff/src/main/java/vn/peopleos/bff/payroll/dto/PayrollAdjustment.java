// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

/** Tiền làm thêm giờ và thưởng của một nhân viên trong kỳ (hệ thống chưa có bảng chấm công chi tiết nên Kế toán nhập theo số liệu HR đã chốt). */
public record PayrollAdjustment(@NotBlank String employeeId, @PositiveOrZero Long overtimePay, @PositiveOrZero Long bonus) {}
