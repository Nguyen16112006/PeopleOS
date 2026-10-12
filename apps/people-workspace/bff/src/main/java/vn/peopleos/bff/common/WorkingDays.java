package vn.peopleos.bff.common;

import java.time.DayOfWeek;
import java.time.LocalDate;

/** Đếm ngày làm việc (thứ 2 - thứ 6) trong khoảng [start, end]. Chưa trừ ngày lễ, tết. */
public final class WorkingDays {
    private WorkingDays() {}

    public static int count(LocalDate start, LocalDate end) {
        int n = 0;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            DayOfWeek w = d.getDayOfWeek();
            if (w != DayOfWeek.SATURDAY && w != DayOfWeek.SUNDAY) n++;
        }
        return n;
    }
}
