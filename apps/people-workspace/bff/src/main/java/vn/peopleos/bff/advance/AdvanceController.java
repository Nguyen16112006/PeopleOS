package vn.peopleos.bff.advance;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.advance.dto.AdvanceDecisionRequest;
import vn.peopleos.bff.advance.dto.AdvanceResult;
import vn.peopleos.bff.advance.dto.CreateAdvanceRequest;
import vn.peopleos.bff.advance.dto.SettlementRequest;
import vn.peopleos.bff.security.CurrentUser;

/** API Tạm ứng / hoàn ứng / thanh toán chi phí. */
@RestController
@RequestMapping("/api/advance-requests")
public class AdvanceController {
    private final AdvanceService service;

    public AdvanceController(AdvanceService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdvanceResult create(CurrentUser user, @Valid @RequestBody CreateAdvanceRequest body) {
        return service.create(user, body);
    }

    @PostMapping("/{id}/decision")
    public AdvanceResult decide(CurrentUser user, @PathVariable String id, @Valid @RequestBody AdvanceDecisionRequest body) {
        return service.decide(user, id, body);
    }

    @PostMapping("/{id}/settlement")
    public AdvanceResult submitSettlement(CurrentUser user, @PathVariable String id, @Valid @RequestBody SettlementRequest body) {
        return service.submitSettlement(user, id, body);
    }

    @PostMapping("/{id}/settle")
    public AdvanceResult confirmSettlement(CurrentUser user, @PathVariable String id) {
        return service.confirmSettlement(user, id);
    }
}
