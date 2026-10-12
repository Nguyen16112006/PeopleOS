package vn.peopleos.bff.integration.nats;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import io.nats.client.Connection;
import io.nats.client.Dispatcher;
import io.nats.client.Message;
import io.nats.client.Nats;
import io.nats.client.Options;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import vn.peopleos.bff.config.AppProperties;
import vn.peopleos.bff.realtime.ConnectionRegistry;

/**
 * Event Bus (NATS) + cầu nối tới WebSocket.
 *
 * <p>Luồng: NotificationService → publish "peopleos.notify.&lt;user_id&gt;" → (subscriber trong chính backend)
 * → WebSocket của đúng người dùng. Nếu NATS chưa sẵn sàng, giao thẳng qua WebSocket nội bộ.
 */
@Component
public class NatsEventBus {
    private static final Logger log = LoggerFactory.getLogger(NatsEventBus.class);
    private final AppProperties.Nats cfg;
    private final ConnectionRegistry registry;
    private final ObjectMapper mapper;
    private volatile Connection connection;
    private volatile boolean running = true;

    public NatsEventBus(AppProperties props, ConnectionRegistry registry, ObjectMapper mapper) {
        this.cfg = props.nats();
        this.registry = registry;
        this.mapper = mapper;
    }

    /** Kết nối ở luồng nền, thử lại đến khi NATS sẵn sàng. */
    @PostConstruct
    void start() {
        Thread t = new Thread(this::connectLoop, "nats-connect");
        t.setDaemon(true);
        t.start();
    }

    @PreDestroy
    void stop() {
        running = false;
        try {
            if (connection != null) connection.close();
        } catch (Exception ignored) {
            // đang tắt
        }
    }

    private void connectLoop() {
        while (running && connection == null) {
            try {
                Options options = new Options.Builder().server(cfg.url()).connectionName("peopleos-bff")
                        .maxReconnects(-1).reconnectWait(Duration.ofSeconds(2)).build();
                Connection nc = Nats.connect(options);
                Dispatcher dispatcher = nc.createDispatcher(this::onNotify);
                dispatcher.subscribe("peopleos.notify.*");
                connection = nc;
                log.info("Đã kết nối NATS {}", cfg.url());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            } catch (Exception e) {
                log.warn("Chưa kết nối được NATS ({}), thử lại sau 3s", e.getMessage());
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    public boolean isConnected() {
        Connection c = connection;
        return c != null && c.getStatus() == Connection.Status.CONNECTED;
    }

    /** Subscriber: chuyển thông báo từ NATS xuống WebSocket của người nhận. */
    private void onNotify(Message msg) {
        String subject = msg.getSubject();
        String userId = subject.substring(subject.lastIndexOf('.') + 1);
        deliver(userId, new String(msg.getData(), StandardCharsets.UTF_8));
    }

    private void deliver(String userId, String payloadJson) {
        try {
            ObjectNode envelope = mapper.createObjectNode();
            envelope.put("type", "notification");
            envelope.set("data", mapper.readTree(payloadJson));
            registry.sendToUser(userId, mapper.writeValueAsString(envelope));
        } catch (Exception e) {
            log.warn("Không chuyển được thông báo realtime: {}", e.getMessage());
        }
    }

    /** Đẩy một thông báo realtime tới người dùng (payload là bản ghi thông báo + "kind"). */
    public void pushNotification(String userId, JsonNode payload) {
        try {
            String json = mapper.writeValueAsString(payload);
            if (isConnected()) {
                connection.publish("peopleos.notify." + userId, json.getBytes(StandardCharsets.UTF_8));
                String kind = payload.path("kind").asText("");
                if (!kind.isEmpty()) { // sự kiện nghiệp vụ cho hệ thống khác đăng ký
                    connection.publish("peopleos.events." + kind, json.getBytes(StandardCharsets.UTF_8));
                }
            } else {
                deliver(userId, json);
            }
        } catch (Exception e) {
            log.warn("Không đẩy được thông báo tới {}: {}", userId, e.getMessage());
        }
    }
}
