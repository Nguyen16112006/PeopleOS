package vn.peopleos.bff.onboarding.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Body của POST /api/employees (HR/Admin). Các trường tuỳ chọn có giá trị mặc định ở service. */
public record NewEmployeeRequest(
        @NotBlank @Size(min = 2) String fullName,
        @NotBlank @Pattern(regexp = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message = "email không hợp lệ") String email,
        String phone,
        @NotBlank String department,
        @NotBlank String jobTitle,
        String managerId,
        @NotNull LocalDate hireDate,
        @NotNull @Positive Long baseSalary,
        Long allowance,
        Integer dependents,
        @Pattern(regexp = "probation|fixed_term|indefinite", message = "loại hợp đồng không hợp lệ") String contractType,
        Boolean createAccount) {}
