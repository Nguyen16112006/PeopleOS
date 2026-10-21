package vn.peopleos.bff.kpi.dto;

import jakarta.validation.constraints.Size;

/** Body tùy chọn cho duyệt/trả lại chu kỳ: ghi chú của Giám đốc. */
public record CycleDecisionRequest(@Size(max = 1000) String comment) {}
