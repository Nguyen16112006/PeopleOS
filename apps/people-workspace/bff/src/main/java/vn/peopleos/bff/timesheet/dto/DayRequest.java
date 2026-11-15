// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.timesheet.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * Body của PUT /api/attendance/days: khai hoặc sửa công một ngày.
 * Nhân viên tự khai cho mình (employee_id để trống; chỉ được chọn present, remote, business_trip); HR sửa cho bất kỳ ai với mọi loại ngày.
 */
public record DayRequest(
        String employeeId,
        @NotNull LocalDate workDate,
        @NotNull @Pattern(regexp = "present|remote|business_trip|holiday|paid_leave|unpaid_leave|absent", message = "loại ngày công không hợp lệ") String status,
        @DecimalMin("0") @DecimalMax("1") Double workDays,
        @DecimalMin("0") @DecimalMax(value = "12", message = "tối đa 12 giờ làm thêm mỗi ngày") Double overtimeHours,
        @Pattern(regexp = "weekday|weekend|holiday", message = "phải là weekday, weekend hoặc holiday") String overtimeType,
        @Size(max = 500) String note) {}
