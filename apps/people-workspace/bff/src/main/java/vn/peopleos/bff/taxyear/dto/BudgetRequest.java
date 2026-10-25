// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.taxyear.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** Body của POST /api/tax-year/{year}/budget: Kế toán đề xuất ngân sách nhân sự và quỹ lương cho năm {year}. */
public record BudgetRequest(
        @NotNull @Positive Long payrollFund,
        @PositiveOrZero Integer headcountPlan,
        @Size(max = 1000) String note) {}
