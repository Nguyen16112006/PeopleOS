package vn.peopleos.bff.leave.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

/** Body của POST /api/leave-requests. */
public record CreateLeaveRequest(
        @NotNull @Pattern(regexp = "annual|sick|unpaid|personal", message = "loại nghỉ không hợp lệ") String leaveType,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        String reason) {}
