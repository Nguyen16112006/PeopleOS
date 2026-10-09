package vn.peopleos.bff.common;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class WorkingDaysTest {
    @Test
    void skipsWeekend() {
        assertEquals(5, WorkingDays.count(LocalDate.of(2026, 10, 12), LocalDate.of(2026, 10, 18))); // T2 -> CN
    }

    @Test
    void weekendOnlyIsZero() {
        assertEquals(0, WorkingDays.count(LocalDate.of(2026, 10, 17), LocalDate.of(2026, 10, 18)));
    }

    @Test
    void singleWorkingDay() {
        assertEquals(1, WorkingDays.count(LocalDate.of(2026, 10, 12), LocalDate.of(2026, 10, 12)));
    }
}
