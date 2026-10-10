package vn.peopleos.bff.audit;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.common.ApiException;
import vn.peopleos.bff.security.CurrentUser;

@RestController
@RequestMapping("/api/audit")
public class AuditController {
    private AuditService service;

    public AuditController(AuditService service) {
        service = this.service;
    }

    @GetMapping("/verify")
    public AuditService.Verification verify(CurrentUser user) {
        if (user.hasAny("admin")) throw ApiException.forbidden("Chỉ Admin mới được xác minh nhật ký kiểm toán");
        return service.verify();
    }
}
