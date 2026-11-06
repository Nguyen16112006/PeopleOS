// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.integration.flowable;

import java.util.Map;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import vn.peopleos.bff.config.AppProperties;
import vn.peopleos.bff.tenant.TenantContext;

/**
 * Khởi chạy quy trình BPMN trong Flowable. Nếu engine chưa sẵn sàng, chạy fallback
 * để thao tác nghiệp vụ vẫn hoàn tất và thông báo không bị mất.
 */
@Component
public class WorkflowClient {
    private static final Logger log = LoggerFactory.getLogger(WorkflowClient.class);
    private final RestClient http;
    private final String internalApiKey;
    private final String defaultTenantId;

    public WorkflowClient(AppProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(10000);
        this.http = RestClient.builder().baseUrl(props.workflow().url()).requestFactory(factory).build();
        this.internalApiKey = props.internalApiKey();
        this.defaultTenantId = "00000000-0000-0000-0000-000000000001";
    }

    /** @return true nếu quy trình BPMN hoàn tất; false nếu đã dùng fallback. */
    public boolean trigger(String workflow, Map<String, Object> payload, Consumer<Map<String, Object>> fallback) {
        try {
            http.post().uri("/internal/workflows/{workflow}", workflow)
                    .header("x-internal-key", internalApiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("payload", payload,
                            "tenant_id", TenantContext.current().orElse(defaultTenantId)))
                    .retrieve().toBodilessEntity();
            return true;
        } catch (RestClientException e) {
            log.warn("Không chạy được quy trình BPMN '{}'; dùng fallback", workflow, e);
            if (fallback != null) {
                try {
                    fallback.accept(payload);
                } catch (RuntimeException inner) {
                    log.error("Fallback cho quy trình '{}' cũng lỗi", workflow, inner);
                }
            }
            return false;
        }
    }
}
