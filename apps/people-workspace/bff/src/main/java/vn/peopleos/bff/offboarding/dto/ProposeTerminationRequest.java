package vn.peopleos.bff.offboarding.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Body của POST /api/offboarding/terminations: Quản lý đề xuất chấm dứt hợp đồng với nhân viên trong nhóm. */
public record ProposeTerminationRequest(
        @NotBlank String employeeId,
        @NotBlank @Size(min = 5, message = "lý do tối thiểu 5 ký tự") String reason,
        @NotNull LocalDate lastWorkingDay) {}
