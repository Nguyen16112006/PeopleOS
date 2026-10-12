package vn.peopleos.bff.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import org.junit.jupiter.api.Test;

class AuditHasherTest {
    @Test
    void hashIsDeterministicSha256Hex() {
        String h1 = AuditHasher.compute(1, AuditHasher.GENESIS, "2026-10-07T01:02:03Z", "u1", "hr", "LEAVE.APPROVED", "leave_request", "L1", "{}");
        String h2 = AuditHasher.compute(1, AuditHasher.GENESIS, "2026-10-07T01:02:03Z", "u1", "hr", "LEAVE.APPROVED", "leave_request", "L1", "{}");
        assertEquals(h1, h2);
        assertEquals(64, h1.length());
    }

    @Test
    void anyFieldChangeChangesHash() {
        String base = AuditHasher.compute(1, AuditHasher.GENESIS, "t", "u", "hr", "A", "e", "1", "{}");
        assertNotEquals(base, AuditHasher.compute(2, AuditHasher.GENESIS, "t", "u", "hr", "A", "e", "1", "{}"));
        assertNotEquals(base, AuditHasher.compute(1, AuditHasher.GENESIS, "t", "u", "hr", "A", "e", "1", "{\"x\":1}"));
        assertNotEquals(base, AuditHasher.compute(1, "1".repeat(64), "t", "u", "hr", "A", "e", "1", "{}"));
    }

    @Test
    void nullActorEqualsEmptyString() {
        assertEquals(AuditHasher.compute(1, AuditHasher.GENESIS, "t", null, null, "A", null, null, "{}"),
                AuditHasher.compute(1, AuditHasher.GENESIS, "t", "", "", "A", "", "", "{}"));
    }
}
