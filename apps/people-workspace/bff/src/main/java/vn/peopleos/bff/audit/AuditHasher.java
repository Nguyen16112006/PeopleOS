package vn.peopleos.bff.audit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Công thức băm của chuỗi kiểm toán - PHẢI trùng khớp với trigger audit_chain_before_insert() trong PostgreSQL:
 * SHA-256( seq | prev_hash | occurred_text | actor_id | actor_role | action | entity_type | entity_id | details ),
 * giá trị null được thay bằng chuỗi rỗng (trừ prev_hash, action, details luôn có giá trị).
 */
public final class AuditHasher {
    /** prev_hash của bản ghi đầu tiên (genesis). */
    public static final String GENESIS = "0".repeat(64);

    private AuditHasher() {}

    public static String compute(long seq, String prevHash, String occurredText, String actorId, String actorRole,
                                 String action, String entityType, String entityId, String details) {
        String canonical = String.join("|", Long.toString(seq), prevHash, occurredText, nz(actorId), nz(actorRole),
                action, nz(entityType), nz(entityId), details);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("JVM thiếu SHA-256", e);
        }
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
