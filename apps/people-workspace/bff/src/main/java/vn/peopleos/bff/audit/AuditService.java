package vn.peopleos.bff.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import vn.peopleos.bff.common.Params;
import vn.peopleos.bff.integration.hasura.HasuraClient;
import vn.peopleos.bff.security.CurrentUser;

/**
 * Kiểm toán: ghi sự kiện nghiệp vụ (AI đã làm gì, lúc nào) vào bảng audit_logs - nhật ký BẤT BIẾN.
 *
 * <p>Tính bất biến do PostgreSQL bảo đảm: trigger chặn UPDATE/DELETE/TRUNCATE, và mỗi bản ghi chứa
 * SHA-256 liên kết với bản ghi trước (chuỗi băm). Sửa hoặc xóa bất kỳ bản ghi nào sẽ làm {@link #verify()} báo hỏng.
 * Thay đổi dữ liệu nhạy cảm ở cấp CSDL cũng được trigger ghi vào cùng chuỗi (hành động "DB.*").
 */
@Service
public class AuditService {
    private static final Logger log = LoggerFactory.getLogger(AuditService.class);
    private static final int PAGE_SIZE = 500;

    private static final String INSERT = """
            mutation Audit($obj: audit_logs_insert_input!) { insert_audit_logs_one(object: $obj) { seq } }""";
    private static final String PAGE = """
            query AuditPage($after: bigint!, $limit: Int!) {
              audit_logs(where: {seq: {_gt: $after}}, order_by: {seq: asc}, limit: $limit) {
                seq occurred_text actor_id actor_role action entity_type entity_id details prev_hash hash
              }
            }""";

    private final HasuraClient hasura;
    private final ObjectMapper mapper;

    public AuditService(HasuraClient hasura, ObjectMapper mapper) {
        this.hasura = hasura;
        this.mapper = mapper;
    }

    /** Kết quả xác minh chuỗi băm. */
    public record Verification(boolean valid, long checked, Long firstBrokenSeq, String message) {}

    /**
     * Ghi một sự kiện. Lỗi ghi nhật ký được ghi log mức ERROR và KHÔNG làm hỏng nghiệp vụ đang chạy
     * (có thể đổi sang chặn nghiệp vụ nếu chính sách yêu cầu).
     */
    public void record(CurrentUser user, String action, String entityType, String entityId, Map<String, Object> details) {
        try {
            hasura.query(INSERT, Params.of("obj", Params.of(
                    "occurred_text", DateTimeFormatter.ISO_INSTANT.format(Instant.now()),
                    "actor_id", user == null ? null : user.sub(),
                    "actor_name", user == null ? "system" : user.name(),
                    "actor_role", user == null ? "system" : user.role(),
                    "action", action, "entity_type", entityType, "entity_id", entityId,
                    "details", toJson(details))));
        } catch (Exception e) {
            log.error("KHÔNG ghi được nhật ký kiểm toán cho {}: {}", action, e.getMessage());
        }
    }

    /** Duyệt toàn bộ chuỗi, tái tính hash và so với giá trị đã lưu. */
    public Verification verify() {
        long lastSeq = 0;
        String lastHash = AuditHasher.GENESIS;
        long checked = 0;
        while (true) {
            JsonNode rows = hasura.query(PAGE, Params.of("after", lastSeq, "limit", PAGE_SIZE)).get("audit_logs");
            if (rows.isEmpty()) break;
            for (JsonNode r : rows) {
                long seq = r.get("seq").asLong();
                if (seq != lastSeq + 1) {
                    return broken(checked, seq, "Thiếu bản ghi: mong đợi seq " + (lastSeq + 1) + " nhưng gặp " + seq);
                }
                if (!lastHash.equals(r.get("prev_hash").asText())) {
                    return broken(checked, seq, "Liên kết prev_hash bị phá vỡ tại seq " + seq);
                }
                String expected = AuditHasher.compute(seq, r.get("prev_hash").asText(), r.get("occurred_text").asText(),
                        text(r, "actor_id"), text(r, "actor_role"), r.get("action").asText(),
                        text(r, "entity_type"), text(r, "entity_id"), r.get("details").asText());
                if (!expected.equals(r.get("hash").asText())) {
                    return broken(checked, seq, "Nội dung bản ghi seq " + seq + " đã bị thay đổi (hash không khớp)");
                }
                lastSeq = seq;
                lastHash = r.get("hash").asText();
                checked++;
            }
        }
        return new Verification(true, checked, null, "Chuỗi nhật ký toàn vẹn: " + checked + " bản ghi được xác minh");
    }

    private static Verification broken(long checked, long seq, String message) {
        return new Verification(false, checked, seq, message);
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return (v == null || v.isNull()) ? null : v.asText();
    }

    private String toJson(Map<String, Object> details) {
        try {
            return mapper.writeValueAsString(details == null ? Map.of() : details);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
}
