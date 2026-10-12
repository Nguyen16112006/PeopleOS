package vn.peopleos.bff.employee;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.security.CurrentUser;

/** GET /api/me - thông tin người đăng nhập, vai trò, hồ sơ nhân sự và quản lý trực tiếp. */
@RestController
public class MeController {
    private final EmployeeLookup employees;

    public MeController(EmployeeLookup employees) {
        this.employees = employees;
    }

    @GetMapping("/api/me")
    public Map<String, Object> me(CurrentUser user) {
        JsonNode emp = employees.findByUser(user.sub());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sub", user.sub());
        body.put("username", user.username());
        body.put("name", user.name());
        body.put("email", user.email());
        body.put("roles", user.roles());
        body.put("role", user.role());
        body.put("employee", emp);
        return body;
    }
}
