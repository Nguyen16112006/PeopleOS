// SPDX-License-Identifier: Apache-2.0
package vn.peopleos.bff.taxyear;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import vn.peopleos.bff.common.ApiException;

/** Kiểm tra phần tính toán thuần của chứng từ thuế và báo cáo tài chính năm. */
class TaxYearCalculationTest {
    private static final ObjectMapper M = new ObjectMapper();

    private static JsonNode json(String s) throws Exception { return M.readTree(s); }

    private static final String PAYROLLS = """
            [{"employee_id":"a","gross":30000000,"bhxh_employee":2400000,"bhyt_employee":450000,"bhtn_employee":300000,"taxable_income":20000000,"personal_income_tax":1000000,"net_salary":25850000},
             {"employee_id":"a","gross":30000000,"bhxh_employee":2400000,"bhyt_employee":450000,"bhtn_employee":300000,"taxable_income":20000000,"personal_income_tax":1000000,"net_salary":25850000},
             {"employee_id":"b","gross":20000000,"bhxh_employee":1600000,"bhyt_employee":300000,"bhtn_employee":200000,"taxable_income":10000000,"personal_income_tax":250000,"net_salary":17650000}]""";

    @Test
    void certificatesAreGroupedPerEmployee() throws Exception {
        List<TaxYearService.Certificate> c = TaxYearService.aggregateCertificates(json(PAYROLLS));
        assertEquals(2, c.size());
        TaxYearService.Certificate a = c.get(0);
        assertEquals("a", a.employeeId());
        assertEquals(2, a.months());
        assertEquals(60_000_000L, a.gross());
        assertEquals(6_300_000L, a.insurance());       // 2 × (2.400.000 + 450.000 + 300.000)
        assertEquals(2_000_000L, a.pit());
        assertEquals(51_700_000L, a.net());
        assertEquals(1, c.get(1).months());
    }

    @Test
    void missingTaxCodesListsBlankAndNull() throws Exception {
        JsonNode emps = json("""
                [{"full_name":"An","tax_code":"8000000001"},{"full_name":"Bình","tax_code":null},{"full_name":"Chi","tax_code":"  "},{"full_name":"Dũng"}]""");
        assertEquals(List.of("Bình", "Chi", "Dũng"), TaxYearService.missingTaxCodes(emps));
    }

    @Test
    @SuppressWarnings("unchecked")
    void figuresTotalsAndDepartments() throws Exception {
        JsonNode emps = json("""
                [{"id":"a","department":"Kỹ thuật"},{"id":"b","department":"Kế toán"}]""");
        JsonNode ins = json("""
                [{"bhxh_employer":5000000,"bhyt_employer":900000,"bhtn_employer":300000},{"bhxh_employer":3000000,"bhyt_employer":500000,"bhtn_employer":200000}]""");
        Map<String, Object> f = TaxYearService.buildFigures(json(PAYROLLS), emps, ins, 2026);
        assertEquals(2, f.get("headcount"));
        assertEquals(80_000_000L, f.get("gross_total"));
        assertEquals(69_350_000L, f.get("net_total"));
        assertEquals(2_250_000L, f.get("pit_total"));
        assertEquals(8_400_000L, f.get("employee_insurance_total"));    // 2 × 3.150.000 + 2.100.000
        assertEquals(9_900_000L, f.get("employer_insurance_total"));
        assertEquals(89_900_000L, f.get("employer_cost_total"));        // lương gộp + bảo hiểm doanh nghiệp
        List<Map<String, Object>> depts = (List<Map<String, Object>>) f.get("by_department");
        assertEquals("Kỹ thuật", depts.get(0).get("department"));       // sắp theo lương giảm dần
        assertEquals(60_000_000L, depts.get(0).get("gross"));
        assertEquals("Kế toán", depts.get(1).get("department"));
        assertEquals(20_000_000L, depts.get(1).get("gross"));
    }

    @Test
    void invalidYearIsRejected() {
        assertThrows(ApiException.class, () -> TaxYearService.checkYear(2019));
        assertThrows(ApiException.class, () -> TaxYearService.checkYear(2101));
        TaxYearService.checkYear(2026);
    }
}
