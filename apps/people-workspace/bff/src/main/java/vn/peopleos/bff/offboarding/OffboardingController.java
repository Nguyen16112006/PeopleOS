// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.offboarding;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.offboarding.dto.OffboardingActionRequest;
import vn.peopleos.bff.offboarding.dto.OffboardingResult;
import vn.peopleos.bff.offboarding.dto.ProposeTerminationRequest;
import vn.peopleos.bff.offboarding.dto.SubmitResignationRequest;
import vn.peopleos.bff.security.CurrentUser;

/** API quy trình nghỉ việc. */
@RestController
@RequestMapping("/api/offboarding")
public class OffboardingController {
    private final OffboardingService service;

    public OffboardingController(OffboardingService service) {
        this.service = service;
    }

    @PostMapping("/resignations")
    @ResponseStatus(HttpStatus.CREATED)
    public OffboardingResult submitResignation(CurrentUser user, @Valid @RequestBody SubmitResignationRequest body) {
        return service.submitResignation(user, body);
    }

    @PostMapping("/terminations")
    @ResponseStatus(HttpStatus.CREATED)
    public OffboardingResult proposeTermination(CurrentUser user, @Valid @RequestBody ProposeTerminationRequest body) {
        return service.proposeTermination(user, body);
    }

    @PostMapping("/{id}/action")
    public OffboardingResult act(CurrentUser user, @PathVariable String id, @Valid @RequestBody OffboardingActionRequest body) {
        return service.act(user, id, body);
    }
}
