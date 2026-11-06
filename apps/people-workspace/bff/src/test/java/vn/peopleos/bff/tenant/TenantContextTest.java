// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

package vn.peopleos.bff.tenant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class TenantContextTest {
    private static final String A = "aaaaaaaa-0000-0000-0000-00000000000a";
    private static final String B = "bbbbbbbb-0000-0000-0000-00000000000b";

    @AfterEach
    void cleanUp() { TenantContext.clear(); }

    @Test
    void requireFailsClosedWithoutTenant() {
        assertTrue(TenantContext.current().isEmpty());
        assertThrows(IllegalStateException.class, TenantContext::require);
    }

    @Test
    void rejectsMalformedTenantIds() {
        assertFalse(TenantContext.isValid(null));
        assertFalse(TenantContext.isValid("abc"));
        assertFalse(TenantContext.isValid("'; drop table x;--"));
        assertThrows(IllegalArgumentException.class, () -> TenantContext.set("abc"));
    }

    @Test
    void runAsRestoresPreviousTenantEvenOnException() {
        TenantContext.set(A);
        assertEquals(B, TenantContext.runAs(B, TenantContext::require));
        assertEquals(A, TenantContext.require());
        assertThrows(RuntimeException.class, () -> TenantContext.runAs(B, () -> { throw new RuntimeException("x"); }));
        assertEquals(A, TenantContext.require());
    }
}
