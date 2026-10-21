package vn.peopleos.bff.kpi.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Body của POST /api/kpi/evaluations: quản lý trực tiếp chấm mức hoàn thành từng mục tiêu. */
public record EvaluateRequest(
        @NotBlank String cycleId,
        @NotBlank String employeeId,
        @NotEmpty @Valid List<GoalScore> scores,
        @Size(max = 2000) String comment) {}
