package vn.peopleos.bff.kpi.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/** Body của POST /api/kpi/cycles: HR mở chu kỳ đánh giá theo quý. */
public record OpenCycleRequest(@NotNull @Min(2020) @Max(2100) Integer year, @NotNull @Min(1) @Max(4) Integer quarter) {}
