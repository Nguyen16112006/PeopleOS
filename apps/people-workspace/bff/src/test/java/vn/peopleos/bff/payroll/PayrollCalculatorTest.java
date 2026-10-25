package vn.peopleos.bff.payroll;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

/** Các ca lấy từ core/shared/python/tests/test_payroll.py để bảo đảm bản Java khớp bản Python. */
class PayrollCalculatorTest {
    @Test
    void gross30mNoDependents2026() {
        PayrollCalculator.Result r = PayrollCalculator.computeNet(30_000_000, 0, 1, LocalDate.of(2026, 10, 1), null);
        assertEquals(3_150_000L, r.insuranceTotal());      // 10,5%
        assertEquals(11_350_000L, r.taxableIncome());      // 30tr - 3,15tr - 15,5tr
        assertEquals(635_000L, r.pit());                   // 5% × 10tr + 10% × 1,35tr
        assertEquals(26_215_000L, r.net());
        assertEquals("2026", r.rules());
    }

    @Test
    void belowThresholdPaysNoTax() {
        PayrollCalculator.Result r = PayrollCalculator.computeNet(15_000_000, 0, 1, LocalDate.of(2026, 3, 1), null);
        assertEquals(0L, r.taxableIncome());
        assertEquals(0L, r.pit());
        assertEquals(15_000_000L - 1_575_000L, r.net());
    }

    @Test
    void dependentsReduceTax() {
        PayrollCalculator.Result a = PayrollCalculator.computeNet(40_000_000, 0, 1, LocalDate.of(2026, 3, 1), null);
        PayrollCalculator.Result b = PayrollCalculator.computeNet(40_000_000, 2, 1, LocalDate.of(2026, 3, 1), null);
        assertTrue(b.pit() < a.pit());
        assertEquals(12_400_000L, b.dependentDeduction());
    }

    @Test
    void socialInsuranceCapChangesInJuly2026() {
        PayrollCalculator.Result before = PayrollCalculator.computeNet(60_000_000, 0, 1, LocalDate.of(2026, 6, 1), null);
        PayrollCalculator.Result after = PayrollCalculator.computeNet(60_000_000, 0, 1, LocalDate.of(2026, 7, 1), null);
        assertEquals(3_744_000L, before.bhxh());           // 46,8tr × 8%
        assertEquals(4_048_000L, after.bhxh());            // 50,6tr × 8%
        assertEquals(600_000L, after.bhtn());              // trần BHTN 106,2tr chưa bị chặn
    }

    @Test
    void legacyRules2025() {
        PayrollCalculator.Result r = PayrollCalculator.computeNet(30_000_000, 0, 1, LocalDate.of(2025, 6, 1), null);
        assertEquals("legacy", r.rules());
        assertEquals(11_000_000L, r.personalDeduction());
    }

    @Test
    void progressiveTaxTopBracket() {
        assertEquals(20_500_000L + 7_000_000L, PayrollCalculator.progressiveTax2026(120_000_000));
    }

    @Test
    void employerSideAndInvalidInput() {
        PayrollCalculator.Result r = PayrollCalculator.computeNet(30_000_000, 0, 1, LocalDate.of(2026, 10, 1), null);
        assertEquals(30_000_000L + r.employerTotal(), r.totalEmployerCost());
        assertEquals(5_250_000L, r.employerBhxh());        // 17,5% × 30tr
        assertThrows(IllegalArgumentException.class, () -> PayrollCalculator.computeNet(-1, 0, 1, LocalDate.of(2026, 1, 1), null));
        assertThrows(IllegalArgumentException.class, () -> PayrollCalculator.computeNet(10, 0, 9, LocalDate.of(2026, 1, 1), null));
    }
}
