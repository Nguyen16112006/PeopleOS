// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.security;

import java.util.List;
import java.util.Map;
import org.springframework.security.oauth2.jwt.Jwt;

/** Người dùng đang đăng nhập, trích từ JWT của Keycloak. */
public record CurrentUser(String sub, String username, String name, String email, List<String> roles) {
    /** 6 vai trò của hệ thống. Mỗi người có đúng một vai trò chính; mọi tài khoản đều có thêm quyền tự phục vụ (employee). */
    public static final List<String> ALL_ROLES = List.of("sysadmin", "director", "accountant", "hr", "manager", "employee");

    /** Thứ tự ưu tiên khi token vô tình mang nhiều role (cao -> thấp). */
    private static final List<String> ROLE_ORDER = ALL_ROLES;

    @SuppressWarnings("unchecked")
    public static CurrentUser from(Jwt jwt) {
        Map<String, Object> realm = jwt.getClaimAsMap("realm_access");
        List<String> roles = realm == null ? List.of() : (List<String>) realm.getOrDefault("roles", List.of());
        String username = jwt.getClaimAsString("preferred_username");
        String name = jwt.getClaimAsString("name");
        String email = jwt.getClaimAsString("email");
        return new CurrentUser(jwt.getSubject(), username == null ? "" : username, name == null ? "" : name,
                email == null ? "" : email, roles);
    }

    /** Vai trò chính (cao nhất) của người dùng. */
    public String role() {
        return ROLE_ORDER.stream().filter(roles::contains).findFirst().orElse("employee");
    }

    public boolean isDirector() { return roles.contains("director"); }

    public boolean isAccountant() { return roles.contains("accountant"); }

    public boolean isHr() { return roles.contains("hr"); }

    public boolean isManager() { return roles.contains("manager"); }

    public boolean isAdmin() { return roles.contains("sysadmin"); }

    public boolean hasAny(String... wanted) {
        for (String r : wanted) {
            if (roles.contains(r)) return true;
        }
        return false;
    }
}
