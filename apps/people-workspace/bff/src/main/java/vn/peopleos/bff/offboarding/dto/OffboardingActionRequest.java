// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.offboarding.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDate;

/**
 * Body của POST /api/offboarding/{id}/action: người đang giữ bước hiện tại xử lý hồ sơ.
 * lastWorkingDay (tùy chọn): người xác nhận chốt lại ngày làm việc cuối; finalPayAmount: bắt buộc ở bước Kế toán tính lương cuối.
 */
public record OffboardingActionRequest(
        @NotNull @Pattern(regexp = "approve|reject", message = "phải là approve hoặc reject") String decision,
        String comment,
        LocalDate lastWorkingDay,
        @PositiveOrZero Long finalPayAmount) {}
