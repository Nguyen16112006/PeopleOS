// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.kpi.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** Mức hoàn thành (0 đến 100) của một mục tiêu. */
public record GoalScore(@NotBlank String goalId, @NotNull @Min(0) @Max(100) Integer achievement) {}
