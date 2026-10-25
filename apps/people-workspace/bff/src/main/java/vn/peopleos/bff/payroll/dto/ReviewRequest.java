// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Body của quyết định HR rà soát / Giám đốc duyệt bảng lương. */
public record ReviewRequest(
        @NotNull @Pattern(regexp = "approve|reject", message = "phải là approve hoặc reject") String decision,
        @Size(max = 1000) String comment) {}
