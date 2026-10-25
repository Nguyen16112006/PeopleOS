// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll.dto;

import jakarta.validation.Valid;
import java.util.List;

/** Body tùy chọn của POST /api/payroll-runs/{id}/calculate. */
public record CalculateRequest(@Valid List<PayrollAdjustment> adjustments) {}
