// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Body của POST /api/payslip-complaints. */
public record ComplaintRequest(@NotBlank String payrollId, @NotBlank @Size(min = 10, max = 1000, message = "nội dung từ 10 đến 1000 ký tự") String message) {}
