-- SPDX-License-Identifier: Apache-2.0
-- =====================================================================
-- PeopleOS - Migration 6: Thuế TNCN, BHXH cuối năm và báo cáo tài chính năm
--   Cuối năm: HR xác nhận người phụ thuộc + mã số thuế -> Kế toán quyết toán thuế TNCN
--   -> hệ thống tự cấp chứng từ khấu trừ cho từng nhân viên.
--   Kế toán lập báo cáo tài chính năm (chi phí nhân sự, quỹ lương, thuế, bảo hiểm) -> Giám đốc duyệt
--   -> Kế toán đề xuất ngân sách nhân sự và quỹ lương năm sau -> Giám đốc duyệt.
-- =====================================================================
CREATE TABLE IF NOT EXISTS tax_year_closings (
  year                smallint PRIMARY KEY CHECK (year BETWEEN 2020 AND 2100),
  status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','hr_confirmed','settled')),
  hr_confirmed_by     uuid REFERENCES employees(id) ON DELETE SET NULL,
  hr_confirmed_at     timestamptz,
  settled_by          uuid REFERENCES employees(id) ON DELETE SET NULL,
  settled_at          timestamptz,
  certificates_issued integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tax_certificates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year            smallint NOT NULL,
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  months          smallint NOT NULL CHECK (months BETWEEN 1 AND 12),
  gross_total     bigint NOT NULL,
  insurance_total bigint NOT NULL,          -- BHXH + BHYT + BHTN phần người lao động
  taxable_total   bigint NOT NULL,
  pit_withheld    bigint NOT NULL,          -- thuế TNCN đã khấu trừ
  net_total       bigint NOT NULL,
  dependents      integer NOT NULL DEFAULT 0,
  tax_code        text,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_tax_cert_employee ON tax_certificates(employee_id, year DESC);

CREATE TABLE IF NOT EXISTS annual_reports (
  year             smallint PRIMARY KEY CHECK (year BETWEEN 2020 AND 2100),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','returned')),
  figures          jsonb NOT NULL DEFAULT '{}',       -- số liệu tổng hợp tính từ bảng lương và bảo hiểm
  prepared_by      uuid REFERENCES employees(id) ON DELETE SET NULL,
  prepared_at      timestamptz,
  approved_by      uuid REFERENCES employees(id) ON DELETE SET NULL,
  approved_at      timestamptz,
  director_comment text
);

CREATE TABLE IF NOT EXISTS hr_budgets (
  year          smallint PRIMARY KEY CHECK (year BETWEEN 2020 AND 2100),   -- năm ngân sách
  payroll_fund  bigint NOT NULL CHECK (payroll_fund > 0),
  headcount_plan integer NOT NULL DEFAULT 0 CHECK (headcount_plan >= 0),
  note          text,
  status        text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved')),
  proposed_by   uuid REFERENCES employees(id) ON DELETE SET NULL,
  approved_by   uuid REFERENCES employees(id) ON DELETE SET NULL,
  approved_at   timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_hr_budgets_updated BEFORE UPDATE ON hr_budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_tax_year_closings AFTER INSERT OR UPDATE OR DELETE ON tax_year_closings FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_tax_certificates  AFTER INSERT OR UPDATE OR DELETE ON tax_certificates  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_annual_reports    AFTER INSERT OR UPDATE OR DELETE ON annual_reports    FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_hr_budgets        AFTER INSERT OR UPDATE OR DELETE ON hr_budgets        FOR EACH ROW EXECUTE FUNCTION audit_row_change();
