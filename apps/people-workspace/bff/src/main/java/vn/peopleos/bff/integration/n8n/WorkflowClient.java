package vn.peopleos.bff.integration.n8n;

import java.util.Map;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import vn.peopleos.bff.config.AppProperties;

/**
 * Gọi quy trình n8n qua webhook. Nếu n8n chưa sẵn sàng, chạy hàm dự phòng (fallback)
 * để người dùng vẫn nhận được thông báo - demo không bị gián đoạn.
 */
@Component
public class WorkflowClient {
    private static final Logger log = LoggerFactory.getLogger(WorkflowClient.class);
    private final RestClient http;
    private final String base;

    public WorkflowClient(AppProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5000);
        factory.setReadTimeout(5000);
        this.http = RestClient.builder().requestFactory(factory).build();
        this.base = props.n8n().webhookBase();
    }

    /** @return true nếu n8n nhận được; false nếu phải dùng fallback. */
    public boolean trigger(String workflow, Map<String, Object> payload, Consumer<Map<String, Object>> fallback) {
        try {
            http.post().uri(base + "/" + workflow).contentType(MediaType.APPLICATION_JSON).body(payload)
                    .retrieve().toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.warn("Không gọi được workflow n8n '{}': {}", workflow, e.getMessage());
            if (fallback != null) {
                try {
                    fallback.accept(payload);
                } catch (Exception inner) {
                    log.error("Fallback cho workflow '{}' cũng lỗi", workflow, inner);
                }
            }
            return false;
        }
    }
}
