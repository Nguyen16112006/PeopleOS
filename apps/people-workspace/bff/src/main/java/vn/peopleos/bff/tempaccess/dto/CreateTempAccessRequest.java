// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.tempaccess.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Body của POST /api/temp-access-requests (chỉ Admin kỹ thuật tạo). */
public record CreateTempAccessRequest(
        @NotBlank @Pattern(regexp = "[a-z_]{3,40}", message = "scope gồm chữ thường và dấu gạch dưới, ví dụ payrolls") String scope,
        @NotNull @Pattern(regexp = "hr|accountant", message = "phải là hr hoặc accountant") String dataOwnerRole,
        @NotBlank @Size(min = 10, message = "lý do tối thiểu 10 ký tự") String reason,
        @NotNull @Min(5) @Max(1440) Integer durationMinutes) {}
