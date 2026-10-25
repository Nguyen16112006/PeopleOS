// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.tempaccess;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.security.CurrentUser;
import vn.peopleos.bff.tempaccess.dto.CreateTempAccessRequest;
import vn.peopleos.bff.tempaccess.dto.TempAccessDecisionRequest;
import vn.peopleos.bff.tempaccess.dto.TempAccessResult;

/** API cấp quyền tạm thời: tạo (Admin), duyệt (chủ dữ liệu + Giám đốc), thu hồi sớm. */
@RestController
@RequestMapping("/api/temp-access-requests")
public class TempAccessController {
    private final TempAccessService service;

    public TempAccessController(TempAccessService service) {
        this.service = service;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TempAccessResult create(CurrentUser user, @Valid @RequestBody CreateTempAccessRequest body) {
        return service.create(user, body);
    }

    @PostMapping("/{id}/decision")
    public TempAccessResult decide(CurrentUser user, @PathVariable String id, @Valid @RequestBody TempAccessDecisionRequest body) {
        return service.decide(user, id, body);
    }

    @PostMapping("/{id}/revoke")
    public TempAccessResult revoke(CurrentUser user, @PathVariable String id) {
        return service.revoke(user, id);
    }
}
