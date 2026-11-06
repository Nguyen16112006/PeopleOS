// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

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
import vn.peopleos.bff.tenant.TenantContext;

/**
 * Client GraphQL gọi Hasura.
 *
 * <p>Mọi dữ liệu nghiệp vụ đi qua Hasura (lõi dùng chung): backend chỉ thêm logic nghiệp vụ và
 * kiểm tra quyền trước khi ghi, không có CSDL riêng.
 *
 * <p>Đa tenant: client KHÔNG còn chạy với vai trò admin. Nó dùng admin secret chỉ để "đóng vai" role
 * {@value #SERVICE_ROLE} kèm {@code x-hasura-tenant-id} của yêu cầu hiện tại, nên mọi permission của Hasura
 * (lọc theo tenant, gán tenant_id khi ghi) đều có hiệu lực cho cả BFF. Thiếu tenant => ném lỗi (fail-closed).
 */
@Component
public class HasuraClient {
    /** Role dịch vụ của BFF trong metadata Hasura (CRUD toàn bộ bảng nghiệp vụ, luôn bị lọc theo tenant). */
    public static final String SERVICE_ROLE = "bff_service";

    private final RestClient http = RestClient.create();
    private final ObjectMapper mapper;
    private final AppProperties.Hasura cfg;

    public HasuraClient(AppProperties props, ObjectMapper mapper) {
        this.cfg = props.hasura();
        this.mapper = mapper;
    }

    /** Chạy một truy vấn/mutation và trả về nút "data". */
    public JsonNode query(String graphql, Map<String, Object> variables) {
        String tenant = TenantContext.require();
        ObjectNode body = mapper.createObjectNode();
        body.put("query", graphql);
        body.set("variables", mapper.valueToTree(variables == null ? Map.of() : variables));

        JsonNode response;
        try {
            response = http.post()
                    .uri(cfg.url())
                    .header("x-hasura-admin-secret", cfg.adminSecret())
                    .header("x-hasura-role", SERVICE_ROLE)
                    .header("x-hasura-tenant-id", tenant)
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
