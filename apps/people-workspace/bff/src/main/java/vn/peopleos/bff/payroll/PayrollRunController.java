package vn.peopleos.bff.payroll;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.payroll.dto.CalculateRequest;
import vn.peopleos.bff.payroll.dto.CloseTimesheetRequest;
import vn.peopleos.bff.payroll.dto.PayrollRunResult;
import vn.peopleos.bff.payroll.dto.ReviewRequest;
import vn.peopleos.bff.security.CurrentUser;

/** API kỳ lương hằng tháng: chốt công, tính lương, rà soát, duyệt, chi trả. */
@RestController
@RequestMapping("/api/payroll-runs")
public class PayrollRunController {
    private final PayrollRunService service;

    public PayrollRunController(PayrollRunService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PayrollRunResult closeTimesheet(CurrentUser user, @Valid @RequestBody CloseTimesheetRequest body) {
        return service.closeTimesheet(user, body);
    }

    @PostMapping("/{id}/calculate")
    public PayrollRunResult calculate(CurrentUser user, @PathVariable String id, @Valid @RequestBody(required = false) CalculateRequest body) {
        return service.calculate(user, id, body);
    }

    @PostMapping("/{id}/hr-review")
    public PayrollRunResult hrReview(CurrentUser user, @PathVariable String id, @Valid @RequestBody ReviewRequest body) {
        return service.hrReview(user, id, body);
    }

    @PostMapping("/{id}/decision")
    public PayrollRunResult decision(CurrentUser user, @PathVariable String id, @Valid @RequestBody ReviewRequest body) {
        return service.directorDecision(user, id, body);
    }

    @PostMapping("/{id}/pay")
    public PayrollRunResult pay(CurrentUser user, @PathVariable String id) {
        return service.pay(user, id);
    }
}
