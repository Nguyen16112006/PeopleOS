package vn.peopleos.bff.proposal;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.proposal.dto.CreateProposalRequest;
import vn.peopleos.bff.proposal.dto.ProposalDecisionRequest;
import vn.peopleos.bff.proposal.dto.ProposalResult;
import vn.peopleos.bff.security.CurrentUser;

/** API Đề xuất tăng lương/phụ cấp: tạo đề xuất, duyệt/từ chối một cấp. */
@RestController
@RequestMapping("/api/salary-proposals")
public class ProposalController {
    private final ProposalService service;

    public ProposalController(ProposalService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProposalResult create(CurrentUser user, @Valid @RequestBody CreateProposalRequest body) {
        return service.create(user, body);
    }

    @PostMapping("/{id}/decision")
    public ProposalResult decide(CurrentUser user, @PathVariable String id, @Valid @RequestBody ProposalDecisionRequest body) {
        return service.decide(user, id, body);
    }
}
