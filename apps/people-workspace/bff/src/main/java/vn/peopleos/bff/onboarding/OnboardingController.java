package vn.peopleos.bff.onboarding;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.onboarding.dto.NewEmployeeRequest;
import vn.peopleos.bff.onboarding.dto.NewEmployeeResponse;
import vn.peopleos.bff.onboarding.dto.TaskResult;
import vn.peopleos.bff.security.CurrentUser;

/** API Onboarding: tạo nhân viên mới (HR/Admin) và hoàn thành việc trong checklist. */
@RestController
public class OnboardingController {
    private final OnboardingService service;

    public OnboardingController(OnboardingService service) {
        this.service = service;
    }

    @PostMapping("/api/employees")
    @ResponseStatus(HttpStatus.CREATED)
    public NewEmployeeResponse create(CurrentUser user, @Valid @RequestBody NewEmployeeRequest body) {
        return service.createEmployee(user, body);
    }

    @PostMapping("/api/onboarding-tasks/{id}/complete")
    public TaskResult complete(CurrentUser user, @PathVariable String id) {
        return service.completeTask(user, id);
    }
}
