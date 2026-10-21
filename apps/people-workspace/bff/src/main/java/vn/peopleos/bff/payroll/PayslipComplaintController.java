package vn.peopleos.bff.payroll;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.payroll.dto.AdjustPayslipRequest;
import vn.peopleos.bff.payroll.dto.ComplaintRequest;
import vn.peopleos.bff.payroll.dto.ComplaintResult;
import vn.peopleos.bff.payroll.dto.ComplaintReviewRequest;
import vn.peopleos.bff.security.CurrentUser;

/** API khiếu nại phiếu lương. */
@RestController
@RequestMapping("/api/payslip-complaints")
public class PayslipComplaintController {
    private final PayslipComplaintService service;

    public PayslipComplaintController(PayslipComplaintService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ComplaintResult file(CurrentUser user, @Valid @RequestBody ComplaintRequest body) {
        return service.file(user, body);
    }

    @PostMapping("/{id}/review")
    public ComplaintResult review(CurrentUser user, @PathVariable String id, @Valid @RequestBody ComplaintReviewRequest body) {
        return service.review(user, id, body);
    }

    @PostMapping("/{id}/adjust")
    public ComplaintResult adjust(CurrentUser user, @PathVariable String id, @Valid @RequestBody AdjustPayslipRequest body) {
        return service.adjust(user, id, body);
    }
}
