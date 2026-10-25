// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.kpi;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.kpi.dto.AddGoalRequest;
import vn.peopleos.bff.kpi.dto.CycleDecisionRequest;
import vn.peopleos.bff.kpi.dto.EvaluateRequest;
import vn.peopleos.bff.kpi.dto.FeedbackRequest;
import vn.peopleos.bff.kpi.dto.KpiResult;
import vn.peopleos.bff.kpi.dto.OpenCycleRequest;
import vn.peopleos.bff.security.CurrentUser;

/** API đánh giá hiệu suất (KPI) theo quý. */
@RestController
@RequestMapping("/api/kpi")
public class KpiController {
    private final KpiService service;

    public KpiController(KpiService service) {
        this.service = service;
    }

    @PostMapping("/cycles")
    @ResponseStatus(HttpStatus.CREATED)
    public KpiResult openCycle(CurrentUser user, @Valid @RequestBody OpenCycleRequest body) {
        return service.openCycle(user, body);
    }

    @PostMapping("/goals")
    @ResponseStatus(HttpStatus.CREATED)
    public KpiResult addGoal(CurrentUser user, @Valid @RequestBody AddGoalRequest body) {
        return service.addGoal(user, body);
    }

    @DeleteMapping("/goals/{id}")
    public KpiResult removeGoal(CurrentUser user, @PathVariable String id) {
        return service.removeGoal(user, id);
    }

    @PostMapping("/evaluations")
    public KpiResult evaluate(CurrentUser user, @Valid @RequestBody EvaluateRequest body) {
        return service.evaluate(user, body);
    }

    @PostMapping("/cycles/{id}/consolidate")
    public KpiResult consolidate(CurrentUser user, @PathVariable String id) {
        return service.consolidate(user, id);
    }

    @PostMapping("/cycles/{id}/approve")
    public KpiResult approve(CurrentUser user, @PathVariable String id) {
        return service.approve(user, id);
    }

    @PostMapping("/cycles/{id}/return")
    public KpiResult returnCycle(CurrentUser user, @PathVariable String id, @Valid @RequestBody(required = false) CycleDecisionRequest body) {
        return service.returnCycle(user, id, body);
    }

    @PostMapping("/evaluations/{id}/feedback")
    public KpiResult feedback(CurrentUser user, @PathVariable String id, @Valid @RequestBody FeedbackRequest body) {
        return service.feedback(user, id, body);
    }
}
