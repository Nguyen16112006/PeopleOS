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
        assertEquals("sysadmin", new CurrentUser("u", "u", "U", "", List.of("employee", "sysadmin", "hr")).role());
        assertEquals("director", new CurrentUser("u", "u", "U", "", List.of("employee", "director")).role());
        assertEquals("accountant", new CurrentUser("u", "u", "U", "", List.of("employee", "accountant", "hr")).role());
    }

    @Test
    void defaultsToEmployee() {
        assertEquals("employee", new CurrentUser("u", "u", "U", "", List.of()).role());
    }

    @Test
    void hasAnyChecksMembership() {
        CurrentUser hr = new CurrentUser("u", "u", "U", "", List.of("hr", "employee"));
        assertTrue(hr.hasAny("sysadmin", "hr"));
        assertFalse(hr.hasAny("sysadmin", "manager"));
    }
}