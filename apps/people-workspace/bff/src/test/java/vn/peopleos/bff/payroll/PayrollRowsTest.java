package vn.peopleos.bff.payroll;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;
import org.junit.jupiter.api.Test;

/** Kiểm tra cách dựng dòng bảng lương và dòng bảo hiểm từ công thức tính lương. */
class PayrollRowsTest {
    @Test
    void payrollRowComputesGrossAndNet() {
        Map<String, Object> r = PayrollRows.payroll("e1", 2026, 10, 25_000_000, 5_000_000, 0, 0, 0, 1, "draft");
        assertEquals(30_000_000L, r.get("gross"));
        assertEquals(30_000_000L, r.get("insured_salary"));
        assertEquals(635_000L, r.get("personal_income_tax"));
        assertEquals(26_215_000L, r.get("net_salary"));
        assertEquals("draft", r.get("status"));
        assertEquals(10, r.get("period_month"));
    }

    @Test
    void overtimeAndBonusRaiseGross() {
        Map<String, Object> r = PayrollRows.payroll("e1", 2026, 10, 25_000_000, 5_000_000, 2_000_000, 1_000_000, 0, 1, "draft");
        assertEquals(33_000_000L, r.get("gross"));
        assertEquals(2_000_000L, r.get("overtime_pay"));
        assertEquals(1_000_000L, r.get("bonus"));
    }

    @Test
    void insuranceRowUsesStoredInsuredSalary() {
        Map<String, Object> r = PayrollRows.insurance("e1", 2026, 10, 30_000_000, 30_000_000, 0, 1);
        assertEquals("2026-10-01", r.get("period"));
        assertEquals(2_400_000L, r.get("bhxh_employee"));
        assertEquals(5_250_000L, r.get("bhxh_employer"));
        assertEquals(900_000L, r.get("bhyt_employer"));
        assertEquals(300_000L, r.get("bhtn_employer"));
    }
}
