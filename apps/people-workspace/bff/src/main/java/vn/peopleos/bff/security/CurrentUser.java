package vn.peopleos.bff.security;

import java.util.List;
import java.util.Map;
import org.springframework.security.oauth2.jwt.Jwt;

/** Người dùng đang đăng nhập, trích từ JWT của Keycloak. */
public record CurrentUser(String sub, String username, String name, String email, List<String> roles) {
    /** Thứ tự ưu tiên vai trò (cao -> thấp). */
    private static final List<String> ROLE_ORDER = List.of("admin", "hr", "manager", "employee");

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

    public boolean hasAny(String... wanted) {
        for (String r : wanted) {
            if (roles.contains(r)) return true;
        }
        return false;
    }
}
