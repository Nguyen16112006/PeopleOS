// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.kpi.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Body của POST /api/kpi/goals: quản lý trực tiếp giao mục tiêu KPI cho nhân viên (tổng trọng số tối đa 100). */
public record AddGoalRequest(
        @NotBlank String cycleId,
        @NotBlank String employeeId,
        @NotBlank @Size(max = 200) String title,
        @Size(max = 1000) String description,
        @Size(max = 300) String target,
        @NotNull @Min(1) @Max(100) Integer weight) {}
