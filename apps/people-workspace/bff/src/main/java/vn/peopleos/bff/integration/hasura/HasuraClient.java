package vn.peopleos.bff.integration.hasura;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import vn.peopleos.bff.config.AppProperties;

/**
 * Client GraphQL gọi Hasura bằng admin secret.
 *
 * <p>Mọi dữ liệu nghiệp vụ đi qua Hasura (lõi dùng chung): backend chỉ thêm logic nghiệp vụ và
 * kiểm tra quyền trước khi ghi, không có CSDL riêng.
 */
@Component
public class HasuraClient {
    private final RestClient http = RestClient.create();
    private final ObjectMapper mapper;
    private final AppProperties.Hasura cfg;

    public HasuraClient(AppProperties props, ObjectMapper mapper) {
        this.cfg = props.hasura();
        this.mapper = mapper;
    }

    /** Chạy một truy vấn/mutation và trả về nút "data". */
    public JsonNode query(String graphql, Map<String, Object> variables) {
        ObjectNode body = mapper.createObjectNode();
        body.put("query", graphql);
        body.set("variables", mapper.valueToTree(variables == null ? Map.of() : variables));

        JsonNode response;
        try {
            response = http.post()
                    .uri(cfg.url())
                    .header("x-hasura-admin-secret", cfg.adminSecret())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException e) {
            throw new HasuraException(extractError(e.getResponseBodyAsString(), "HTTP " + e.getStatusCode().value()));
        } catch (Exception e) {
            throw new HasuraException("Không kết nối được Hasura: " + e.getMessage());
        }
        if (response == null) throw new HasuraException("Hasura trả về phản hồi rỗng");
        if (response.hasNonNull("errors")) {
            throw new HasuraException(response.get("errors").get(0).path("message").asText("lỗi không xác định"));
        }
        return response.get("data");
    }

    private String extractError(String raw, String fallback) {
        try {
            JsonNode n = mapper.readTree(raw);
            if (n.hasNonNull("errors")) return n.get("errors").get(0).path("message").asText(fallback);
            if (n.hasNonNull("error")) return n.get("error").asText(fallback);
        } catch (Exception ignored) {
            // phản hồi không phải JSON
        }
        return fallback;
    }
}
