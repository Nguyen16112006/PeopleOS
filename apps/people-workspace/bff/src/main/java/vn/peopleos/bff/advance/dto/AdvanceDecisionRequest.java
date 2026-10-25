// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.advance.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** Body của POST /api/advance-requests/{id}/decision. */
public record AdvanceDecisionRequest(
        @NotNull @Pattern(regexp = "approve|reject", message = "phải là approve hoặc reject") String decision,
        String comment) {}
