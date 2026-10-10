package vn.peopleos.bff.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Toàn bộ thuộc tính cấu hình (tiền tố "peopleos" trong application.yml). */
@ConfigurationProperties(prefix = "peopleos")
public record AppProperties(
        Hasura hasura, Jwt jwt, Keycloak keycloak, Nats nats, N8n n8n, Minio minio, Clamav clamav,
        String internalApiKey, Cors cors) {

    public record Hasura(String url, String adminSecret) {}
    public record Jwt(String jwksUrl, String issuer) {}
    public record Keycloak(String url, String realm, String adminUser, String adminPassword) {}
    public record Nats(String url) {}
    public record N8n(String webhookBase) {}
    public record Minio(String endpoint, String accessKey, String secretKey) {}
    /** Quét mã độc ClamAV: enabled=false để tắt; failOpen=true cho phép tải lên khi clamd chưa sẵn sàng. */
    public record Clamav(boolean enabled, String host, int port, int timeoutMs, boolean failOpen) {}
    public record Cors(boolean enabled, String frontendUrl) {}
}
