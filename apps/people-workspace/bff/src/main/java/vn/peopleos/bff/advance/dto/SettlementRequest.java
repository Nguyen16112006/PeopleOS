package vn.peopleos.bff.advance.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/** Body của POST /api/advance-requests/{id}/settlement: nhân viên khai số tiền đã chi thực tế khi hoàn ứng. */
public record SettlementRequest(@NotNull @PositiveOrZero Long settledAmount) {}
