// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.payroll;

import java.time.LocalDate;
import java.util.Map;

/**
 * Tính lương Gross → Net theo quy định Việt Nam. Chuyển nguyên công thức từ module Python dùng chung
 * (core/shared/python/peopleos_shared/payroll.py) để phiếu lương, seed và trợ lý AI cho cùng kết quả.
 *
 * <p>Tham số pháp lý (cập nhật 10/2026): từ kỳ 2026 giảm trừ gia cảnh 15,5 triệu (bản thân) và 6,2 triệu (người phụ thuộc),
 * biểu thuế 5 bậc; trước 2026: 11 triệu / 4,4 triệu, biểu 7 bậc. Lương cơ sở 2,34 triệu (07/2024 đến 06/2026),
 * 2,53 triệu từ 01/07/2026; trần BHXH/BHYT = 20 × lương cơ sở, trần BHTN = 20 × lương tối thiểu vùng.
 * Tỷ lệ đóng: người lao động 8% BHXH + 1,5% BHYT + 1% BHTN; doanh nghiệp 17,5% + 3% + 1%.
 * Không xử lý thu nhập miễn thuế; kết quả mang tính tham khảo.
 */
public final class PayrollCalculator {
    private PayrollCalculator() {}

    private static final Map<Integer, Long> MIN_WAGE_2026 = Map.of(1, 5_310_000L, 2, 4_730_000L, 3, 4_140_000L, 4, 3_700_000L);
    private static final Map<Integer, Long> MIN_WAGE_2025 = Map.of(1, 4_960_000L, 2, 4_410_000L, 3, 3_860_000L, 4, 3_450_000L);
    private static final double INF = Double.POSITIVE_INFINITY;
    private static final double[][] BRACKETS_2026 = {{10e6, 0.05}, {30e6, 0.10}, {60e6, 0.20}, {100e6, 0.30}, {INF, 0.35}};
    private static final double[][] BRACKETS_LEGACY = {{5e6, 0.05}, {10e6, 0.10}, {18e6, 0.15}, {32e6, 0.20}, {52e6, 0.25}, {80e6, 0.30}, {INF, 0.35}};

    /** Kết quả tính lương một tháng. */
    public record Result(long gross, long insuredSalary, long bhxh, long bhyt, long bhtn, long insuranceTotal,
                         long personalDeduction, long dependentDeduction, long taxableIncome, long pit, long net,
                         long employerBhxh, long employerBhyt, long employerBhtn, long employerTotal,
                         long totalEmployerCost, String rules) {}

    /** Làm tròn về đồng (half-up), giống hàm _r của Python. */
    static long round(double x) {
        return (long) (x + 0.5);
    }

    static long baseSalaryRef(LocalDate on) {
        if (!on.isBefore(LocalDate.of(2026, 7, 1))) return 2_530_000L;
        if (!on.isBefore(LocalDate.of(2024, 7, 1))) return 2_340_000L;
        return 1_800_000L;
    }

    /** Thuế lũy tiến từng phần trên thu nhập tính thuế của tháng. */
    static long progressiveTax(double taxable, double[][] brackets) {
        double tax = 0, lower = 0;
        for (double[] b : brackets) {
            if (taxable <= lower) break;
            tax += (Math.min(taxable, b[0]) - lower) * b[1];
            lower = b[0];
        }
        return round(tax);
    }

    static long progressiveTax2026(double taxable) {
        return progressiveTax(taxable, BRACKETS_2026);
    }

    /**
     * @param gross          tổng thu nhập trước thuế/bảo hiểm trong tháng
     * @param dependents     số người phụ thuộc đã đăng ký giảm trừ
     * @param region         vùng lương tối thiểu (1 đến 4)
     * @param on             tháng tính lương (quyết định tham số pháp lý)
     * @param insuredSalary  lương làm căn cứ đóng bảo hiểm; null nghĩa là bằng gross (quy ước của hệ thống)
     */
    public static Result computeNet(long gross, int dependents, int region, LocalDate on, Long insuredSalary) {
        if (region < 1 || region > 4) throw new IllegalArgumentException("region phải thuộc 1..4");
        if (gross < 0 || dependents < 0) throw new IllegalArgumentException("gross và dependents không được âm");
        boolean newRules = !on.isBefore(LocalDate.of(2026, 1, 1));
        long minWage = (newRules ? MIN_WAGE_2026 : MIN_WAGE_2025).get(region);
        long insured = insuredSalary == null ? gross : insuredSalary;

        long capSocial = 20 * baseSalaryRef(on);
        long capUnemp = 20 * minWage;
        long socialBase = Math.min(insured, capSocial);
        long unempBase = Math.min(insured, capUnemp);
        long bhxh = round(socialBase * 0.08);
        long bhyt = round(socialBase * 0.015);
        long bhtn = round(unempBase * 0.01);
        long insurance = bhxh + bhyt + bhtn;

        long personal = newRules ? 15_500_000L : 11_000_000L;
        long depEach = newRules ? 6_200_000L : 4_400_000L;
        long depTotal = depEach * dependents;
        long taxable = Math.max(0, gross - insurance - personal - depTotal);
        long pit = progressiveTax(taxable, newRules ? BRACKETS_2026 : BRACKETS_LEGACY);

        long eBhxh = round(socialBase * 0.175);
        long eBhyt = round(socialBase * 0.03);
        long eBhtn = round(unempBase * 0.01);
        long eTotal = eBhxh + eBhyt + eBhtn;
        return new Result(gross, insured, bhxh, bhyt, bhtn, insurance, personal, depTotal, taxable, pit,
                gross - insurance - pit, eBhxh, eBhyt, eBhtn, eTotal, gross + eTotal, newRules ? "2026" : "legacy");
    }
}
