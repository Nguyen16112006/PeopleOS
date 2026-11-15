// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.payroll.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

/** Thưởng và (tùy chọn) tiền làm thêm giờ nhập đè của một nhân viên trong kỳ. overtime_pay để trống: hệ thống tự tính từ giờ làm thêm trên bảng công đã chốt. */
public record PayrollAdjustment(@NotBlank String employeeId, @PositiveOrZero Long overtimePay, @PositiveOrZero Long bonus) {}
