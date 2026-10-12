package vn.peopleos.bff.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.integration.nats.NatsEventBus;

/** Tạo thông báo: lưu vào PostgreSQL (qua Hasura) rồi đẩy realtime qua NATS → WebSocket. */
@Service
public class NotificationService {
    private static final String USERS_BY_ROLE =
            "query UsersByRole($r: String!) { users(where: {role: {_eq: $r}, is_active: {_eq: true}}) { id } }";
    private static final String INSERT = """
            mutation Notify($objs: [notifications_insert_input!]!) {
              insert_notifications(objects: $objs) {
                returning { id user_id title message ref_type ref_id is_read created_at }
              }
            }""";

    private final HasuraClient hasura;
    private final NatsEventBus bus;

    public NotificationService(HasuraClient hasura, NatsEventBus bus) {
        this.hasura = hasura;
        this.bus = bus;
    }

    /** Người nhận: một người dùng cụ thể hoặc tất cả người dùng có một vai trò. */
    public record Target(String userId, String role) {
        public static Target user(String userId) { return new Target(userId, null); }
        public static Target role(String role) { return new Target(null, role); }
    }

    /** @return số thông báo đã tạo. */
    public int notify(Target target, String title, String message, String refType, String refId, String kind) {
        List<String> ids = resolve(target);
        if (ids.isEmpty()) return 0;

        List<Map<String, Object>> objs = new ArrayList<>();
        for (String id : ids) {
            objs.add(Params.of("user_id", id, "title", title, "message", message, "ref_type", refType, "ref_id", refId));
        }
        JsonNode rows = hasura.query(INSERT, Params.of("objs", objs)).get("insert_notifications").get("returning");
        for (JsonNode row : rows) {
            ObjectNode payload = ((ObjectNode) row.deepCopy());
            if (kind != null) payload.put("kind", kind);
            bus.pushNotification(row.get("user_id").asText(), payload);
        }
        return rows.size();
    }

    private List<String> resolve(Target target) {
        if (target.userId() != null) return List.of(target.userId());
        if (target.role() == null) return List.of();
        JsonNode users = hasura.query(USERS_BY_ROLE, Params.of("r", target.role())).get("users");
        List<String> ids = new ArrayList<>();
        users.forEach(u -> ids.add(u.get("id").asText()));
        return ids;
    }
}
