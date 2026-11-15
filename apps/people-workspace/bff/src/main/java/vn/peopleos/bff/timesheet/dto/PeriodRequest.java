// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.timesheet.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Body của POST /api/timesheets/submit: nhân viên gửi bảng công tháng để xác nhận. */
public record PeriodRequest(@NotNull @Min(2020) @Max(2100) Integer year, @NotNull @Min(1) @Max(12) Integer month) {}
