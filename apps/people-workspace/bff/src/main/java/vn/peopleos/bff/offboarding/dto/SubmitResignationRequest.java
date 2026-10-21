package vn.peopleos.bff.offboarding.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Body của POST /api/offboarding/resignations: người dùng tự gửi đơn xin nghỉ việc. */
public record SubmitResignationRequest(
        @NotBlank @Size(min = 5, message = "lý do tối thiểu 5 ký tự") String reason,
        @NotNull LocalDate lastWorkingDay) {}
