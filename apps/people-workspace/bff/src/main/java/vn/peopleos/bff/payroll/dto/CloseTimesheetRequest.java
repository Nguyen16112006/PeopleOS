// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Body của POST /api/payroll-runs: HR chốt công tháng và tạo kỳ lương. */
public record CloseTimesheetRequest(@NotNull @Min(2020) @Max(2100) Integer year, @NotNull @Min(1) @Max(12) Integer month) {}
