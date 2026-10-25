// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Body của POST /api/payslip-complaints/{id}/review: HR chuyển Kế toán điều chỉnh (forward) hoặc từ chối (reject). */
public record ComplaintReviewRequest(
        @NotNull @Pattern(regexp = "forward|reject", message = "phải là forward hoặc reject") String decision,
        @Size(max = 1000) String note) {}
