-- SPDX-License-Identifier: Apache-2.0
-- =====================================================================
-- PeopleOS - Migration 7: Tính lương và chi trả hằng tháng (quy trình 4.2) + khiếu nại phiếu lương
--   Nhân viên chấm công/OT -> Quản lý xác nhận -> HR chốt công (tạo kỳ lương)
--   -> Kế toán tính lương, lập bảng lương -> HR rà soát -> Giám đốc duyệt
--   -> Kế toán chi trả, phát hành phiếu lương -> Nhân viên nhận thông báo, có thể khiếu nại
--   (khiếu nại gửi HR xử lý -> Kế toán điều chỉnh). Bị từ chối ở bước rà soát/duyệt thì quay về Kế toán sửa.
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year         smallint NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  period_month        smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  status              text NOT NULL DEFAULT 'timesheet_closed'
                        CHECK (status IN ('timesheet_closed','calculated','hr_reviewed','approved','paid')),
  timesheet_closed_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  timesheet_closed_at timestamptz,
  calculated_by       uuid REFERENCES employees(id) ON DELETE SET NULL,
  calculated_at       timestamptz,
  hr_reviewed_by      uuid REFERENCES employees(id) ON DELETE SET NULL,
  hr_reviewed_at      timestamptz,
  approved_by         uuid REFERENCES employees(id) ON DELETE SET NULL,
  approved_at         timestamptz,
  paid_by             uuid REFERENCES employees(id) ON DELETE SET NULL,
  paid_at             timestamptz,
  employee_count      integer NOT NULL DEFAULT 0,
  total_gross         bigint NOT NULL DEFAULT 0,
  total_net           bigint NOT NULL DEFAULT 0,
  return_comment      text,                         -- lý do HR/Giám đốc trả bảng lương về Kế toán
  UNIQUE (period_year, period_month)
);

CREATE TABLE IF NOT EXISTS payslip_complaints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id       uuid NOT NULL REFERENCES payrolls(id) ON DELETE CASCADE,
  employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  message          text NOT NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','adjusting','resolved','rejected')),
  hr_note          text,
  hr_handled_by    uuid REFERENCES employees(id) ON DELETE SET NULL,
  adjustment_note  text,
  adjusted_by      uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
-- Mỗi phiếu lương chỉ có một khiếu nại đang xử lý
CREATE UNIQUE INDEX IF NOT EXISTS uq_payslip_one_active_complaint ON payslip_complaints(payroll_id) WHERE status IN ('open','adjusting');
CREATE INDEX IF NOT EXISTS idx_payslip_complaints_status ON payslip_complaints(status);
CREATE TRIGGER trg_payslip_complaints_updated BEFORE UPDATE ON payslip_complaints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_payroll_runs      AFTER INSERT OR UPDATE OR DELETE ON payroll_runs      FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_payslip_complaints AFTER INSERT OR UPDATE OR DELETE ON payslip_complaints FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Dashboard chỉ tính các bảng lương đã chi trả (bản nháp đang tính chưa được tính vào)
CREATE OR REPLACE VIEW v_payroll_monthly AS
SELECT p.period_year, p.period_month,
       count(*)::int AS employees,
       sum(p.gross)::bigint AS gross_total,
       sum(p.net_salary)::bigint AS net_total,
       sum(p.personal_income_tax)::bigint AS pit_total,
       sum(p.bhxh_employee + p.bhyt_employee + p.bhtn_employee)::bigint AS employee_insurance_total,
       COALESCE(max(i.employer_total), 0)::bigint AS employer_insurance_total,
       (sum(p.gross) + COALESCE(max(i.employer_total), 0))::bigint AS employer_cost
  FROM payrolls p
  LEFT JOIN (SELECT date_part('year', period)::int AS y, date_part('month', period)::int AS m,
                    sum(bhxh_employer + bhyt_employer + bhtn_employer)::bigint AS employer_total
               FROM insurance_records GROUP BY 1, 2) i
         ON i.y = p.period_year AND i.m = p.period_month
 WHERE p.status = 'paid'
 GROUP BY p.period_year, p.period_month;
