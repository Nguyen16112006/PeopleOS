// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.taxyear;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.security.CurrentUser;
import vn.peopleos.bff.taxyear.dto.BudgetRequest;
import vn.peopleos.bff.taxyear.dto.ReportDecisionRequest;
import vn.peopleos.bff.taxyear.dto.TaxYearResult;

/** API thuế TNCN, BHXH cuối năm, báo cáo tài chính năm và ngân sách nhân sự năm sau. */
@RestController
@RequestMapping("/api/tax-year/{year}")
public class TaxYearController {
    private final TaxYearService service;

    public TaxYearController(TaxYearService service) {
        this.service = service;
    }

    @PostMapping("/hr-confirm")
    public TaxYearResult hrConfirm(CurrentUser user, @PathVariable int year) {
        return service.hrConfirm(user, year);
    }

    @PostMapping("/settle")
    public TaxYearResult settle(CurrentUser user, @PathVariable int year) {
        return service.settle(user, year);
    }

    @PostMapping("/report/submit")
    public TaxYearResult submitReport(CurrentUser user, @PathVariable int year) {
        return service.submitReport(user, year);
    }

    @PostMapping("/report/approve")
    public TaxYearResult approveReport(CurrentUser user, @PathVariable int year) {
        return service.approveReport(user, year);
    }

    @PostMapping("/report/return")
    public TaxYearResult returnReport(CurrentUser user, @PathVariable int year, @Valid @RequestBody(required = false) ReportDecisionRequest body) {
        return service.returnReport(user, year, body);
    }

    @PostMapping("/budget")
    public TaxYearResult proposeBudget(CurrentUser user, @PathVariable int year, @Valid @RequestBody BudgetRequest body) {
        return service.proposeBudget(user, year, body);
    }

    @PostMapping("/budget/approve")
    public TaxYearResult approveBudget(CurrentUser user, @PathVariable int year) {
        return service.approveBudget(user, year);
    }
}
