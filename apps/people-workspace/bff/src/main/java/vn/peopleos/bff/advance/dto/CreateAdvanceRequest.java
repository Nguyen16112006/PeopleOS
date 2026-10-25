// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.advance.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Body của POST /api/advance-requests (tạm ứng hoặc thanh toán chi phí). */
public record CreateAdvanceRequest(
        @NotNull @Pattern(regexp = "advance|expense", message = "phải là advance hoặc expense") String requestType,
        @NotNull @Positive Long amount,
        @NotBlank @Size(min = 5, message = "lý do tối thiểu 5 ký tự") String reason,
        List<String> receiptKeys) {}
