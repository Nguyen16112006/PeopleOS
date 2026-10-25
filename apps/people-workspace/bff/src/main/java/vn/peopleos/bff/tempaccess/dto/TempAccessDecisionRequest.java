// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.tempaccess.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** Body của POST /api/temp-access-requests/{id}/decision. */
public record TempAccessDecisionRequest(
        @NotNull @Pattern(regexp = "approve|reject", message = "phải là approve hoặc reject") String decision,
        String comment) {}
