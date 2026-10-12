package vn.peopleos.bff.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class CurrentUserTest {
    @Test
    void primaryRoleIsHighestPriority() {
        assertEquals("manager", new CurrentUser("u", "u", "U", "", List.of("employee", "manager")).role());
        assertEquals("admin", new CurrentUser("u", "u", "U", "", List.of("employee", "admin", "hr")).role());
    }

    @Test
    void defaultsToEmployee() {
        assertEquals("employee", new CurrentUser("u", "u", "U", "", List.of()).role());
    }

    @Test
    void hasAnyChecksMembership() {
        CurrentUser hr = new CurrentUser("u", "u", "U", "", List.of("hr", "employee"));
        assertTrue(hr.hasAny("admin", "hr"));
        assertFalse(hr.hasAny("admin", "manager"));
    }
}
