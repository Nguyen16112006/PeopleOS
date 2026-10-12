package vn.peopleos.bff.system;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.peopleos.bff.integration.nats.NatsEventBus;

/** GET /api/health - công khai, dùng cho healthcheck và kiểm tra kết nối NATS. */
@RestController
public class HealthController {
    private final NatsEventBus bus;

    public HealthController(NatsEventBus bus) {
        this.bus = bus;
    }

    @GetMapping("/api/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "nats", bus.isConnected());
    }
}
