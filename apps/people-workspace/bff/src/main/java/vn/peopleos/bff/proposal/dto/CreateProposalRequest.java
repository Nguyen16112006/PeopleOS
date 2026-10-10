package vn.peopleos.bff.proposal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Body của POST /api/salary-proposals. */
public record CreateProposalRequest(
        @NotBlank String employeeId,
        @NotNull @Pattern(regexp = "raise|allowance", message = "phải là raise hoặc allowance") String proposalType,
        @NotNull @Positive Long proposedAmount,
        @NotBlank @Size(min = 5, message = "lý do tối thiểu 5 ký tự") String reason,
        LocalDate effectiveDate) {}
