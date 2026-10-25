package vn.peopleos.bff.kpi;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Kiểm tra cách tính điểm, xếp loại và ngày đầu/cuối quý của đánh giá KPI. */
class KpiScoringTest {
    @Test
    void weightedScoreIsWeightedAverage() {
        // 50% đạt 100, 30% đạt 80, 20% đạt 50 → 50 + 24 + 10 = 84
        assertEquals(84.0, KpiService.weightedScore(List.of(new int[] {50, 100}, new int[] {30, 80}, new int[] {20, 50})));
        assertEquals(100.0, KpiService.weightedScore(List.of(new int[] {100, 100})));
        assertEquals(0.0, KpiService.weightedScore(List.of(new int[] {60, 0}, new int[] {40, 0})));
        assertEquals(66.5, KpiService.weightedScore(List.of(new int[] {33, 100}, new int[] {67, 50})), 0.001);  // 33 + 33,5
    }

    @Test
    void ratingBoundaries() {
        assertEquals("excellent", KpiService.ratingFor(90));
        assertEquals("good", KpiService.ratingFor(89.9));
        assertEquals("good", KpiService.ratingFor(75));
        assertEquals("meets", KpiService.ratingFor(74.9));
        assertEquals("meets", KpiService.ratingFor(60));
        assertEquals("needs_improvement", KpiService.ratingFor(59.9));
    }

    @Test
    void quarterBoundaries() {
        assertEquals(LocalDate.of(2026, 10, 1), KpiService.quarterStart(2026, 4));
        assertEquals(LocalDate.of(2026, 12, 31), KpiService.quarterEnd(2026, 4));
        assertEquals(LocalDate.of(2026, 3, 31), KpiService.quarterEnd(2026, 1));
        assertEquals(LocalDate.of(2026, 6, 30), KpiService.quarterEnd(2026, 2));
    }
}
