package vn.peopleos.bff.integration.keycloak;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import vn.peopleos.bff.config.AppProperties;

/** Tạo tài khoản SSO trong Keycloak (Admin REST API) khi onboarding nhân viên mới. */
@Component
public class KeycloakAdminClient {
    private final RestClient http = RestClient.create();
    private final AppProperties.Keycloak cfg;

    public KeycloakAdminClient(AppProperties props) {
        this.cfg = props.keycloak();
    }

    /** Tạo người dùng với mật khẩu tạm (bắt đổi ở lần đăng nhập đầu), gán role realm, trả về id (= claim sub). */
    public String createUser(String username, String email, String firstName, String lastName,
                             String tempPassword, List<String> roles) {
        String adminToken = adminToken();
        String realmUrl = cfg.url() + "/admin/realms/" + cfg.realm();

        Map<String, Object> body = Map.of(
                "username", username, "email", email, "firstName", firstName, "lastName", lastName,
                "enabled", true, "emailVerified", true,
                "credentials", List.of(Map.of("type", "password", "value", tempPassword, "temporary", true)));
        ResponseEntity<Void> created = http.post().uri(realmUrl + "/users")
                .headers(h -> h.setBearerAuth(adminToken)).contentType(MediaType.APPLICATION_JSON)
                .body(body).retrieve().toBodilessEntity();
        URI location = created.getHeaders().getLocation();
        if (location == null) throw new IllegalStateException("Keycloak không trả về Location của người dùng mới");
        String path = location.getPath();
        String userId = path.substring(path.lastIndexOf('/') + 1);

        for (String role : roles) {
            JsonNode roleRep = http.get().uri(realmUrl + "/roles/" + role)
                    .headers(h -> h.setBearerAuth(adminToken)).retrieve().body(JsonNode.class);
            http.post().uri(realmUrl + "/users/" + userId + "/role-mappings/realm")
                    .headers(h -> h.setBearerAuth(adminToken)).contentType(MediaType.APPLICATION_JSON)
                    .body(List.of(roleRep)).retrieve().toBodilessEntity();
        }
        return userId;
    }

    private String adminToken() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("client_id", "admin-cli");
        form.add("username", cfg.adminUser());
        form.add("password", cfg.adminPassword());
        JsonNode token = http.post().uri(cfg.url() + "/realms/master/protocol/openid-connect/token")
                .contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(JsonNode.class);
        if (token == null || !token.hasNonNull("access_token")) {
            throw new IllegalStateException("Không lấy được admin token từ Keycloak");
        }
        return token.get("access_token").asText();
    }
}
