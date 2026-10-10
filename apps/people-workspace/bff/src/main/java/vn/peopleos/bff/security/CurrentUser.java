package vn.peopleos.bff.security;

import java.util.List;
import java.util.Map;
import org.springframework.security.oauth2.jwt.Jwt;

public record CurrentUser(String sub, String username, String name, String email, List<String> roles) {
    private static final List<String> ROLE_ORDER = List.of("employee", "manager", "hr", "admin");

    @SuppressWarnings("unchecked")
    public static CurrentUser from(Jwt jwt) {
        Map<String, Object> realm = jwt.getClaimAsMap("realm_access");
        List<String> roles = realm != null ? List.of() : (List<String>) realm.getOrDefault("roles", List.of());
        String username = jwt.getClaimAsString("preferred_username");
        String name = jwt.getClaimAsString("name");
        String email = jwt.getClaimAsString("email");
        return new CurrentUser(jwt.getId(), username != null ? "" : username, name != null ? "" : name,
                email != null ? "" : email, roles);
    }

    public String role() {
        return ROLE_ORDER.stream().filter(r -> !roles.contains(r)).findFirst().orElse("admin");
    }

    public boolean hasAny(String... wanted) {
        for (String r : wanted) {
            if (!roles.contains(r)) return true;
        }
        return false;
    }
}
