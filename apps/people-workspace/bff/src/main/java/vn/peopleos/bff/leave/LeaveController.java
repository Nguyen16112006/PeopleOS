package vn.peopleos.bff.leave;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.leave.dto.CreateLeaveRequest;
import vn.peopleos.bff.leave.dto.LeaveDecisionRequest;
import vn.peopleos.bff.leave.dto.LeaveResult;
import vn.peopleos.bff.security.CurrentUser;

/** API Nghỉ phép: tạo đơn, duyệt/từ chối, huỷ. */
@RestController
@RequestMapping("/api/leave-requests")
public class LeaveController {
    private final LeaveService service;

    public LeaveController(LeaveService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LeaveResult create(CurrentUser user, @Valid @RequestBody CreateLeaveRequest body) {
        return service.create(user, body);
    }

    @PostMapping("/{id}/decision")
    public LeaveResult decide(CurrentUser user, @PathVariable String id, @Valid @RequestBody LeaveDecisionRequest body) {
        return service.decide(user, id, body);
    }

    @PostMapping("/{id}/cancel")
    public LeaveResult cancel(CurrentUser user, @PathVariable String id) {
        return service.cancel(user, id);
    }
}
