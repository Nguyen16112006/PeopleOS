-- SPDX-License-Identifier: Apache-2.0
-- =====================================================================
-- PeopleOS - Migration 5: Đánh giá hiệu suất (KPI) theo quý
-- HR mở chu kỳ quý -> Giám đốc giao KPI cho Quản lý, Quản lý giao KPI cho nhóm (người giao = quản lý trực tiếp)
--   -> Quản lý đánh giá nhân viên (Giám đốc đánh giá Quản lý, HR, Kế toán, Admin)
--   -> HR tổng hợp, rà soát -> Giám đốc duyệt kết quả -> Nhân viên xem kết quả và phản hồi
--   -> kết quả làm cơ sở cho đề xuất tăng lương/thưởng. KHÔNG có bước nhân viên tự đánh giá.
-- =====================================================================
CREATE TABLE IF NOT EXISTS kpi_cycles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  year        smallint NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  quarter     smallint NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','review','approved')),
  created_by  uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, quarter)
);

CREATE TABLE IF NOT EXISTS kpi_goals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id     uuid NOT NULL REFERENCES kpi_cycles(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  target       text,
  weight       smallint NOT NULL CHECK (weight BETWEEN 1 AND 100),   -- tổng trọng số mỗi người trong một chu kỳ = 100
  created_by   uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kpi_goals_cycle_emp ON kpi_goals(cycle_id, employee_id);

CREATE TABLE IF NOT EXISTS kpi_evaluations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id          uuid NOT NULL REFERENCES kpi_cycles(id) ON DELETE CASCADE,
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  evaluator_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  goal_scores       jsonb NOT NULL DEFAULT '[]',                     -- [{goalId, achievement 0..100}]
  score             numeric(5,1) NOT NULL CHECK (score BETWEEN 0 AND 100),
  rating            text NOT NULL CHECK (rating IN ('excellent','good','meets','needs_improvement')),
  comment           text,
  status            text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','consolidated','approved')),
  employee_feedback text,
  feedback_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id)
);
CREATE TRIGGER trg_kpi_evaluations_updated BEFORE UPDATE ON kpi_evaluations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_kpi_cycles      AFTER INSERT OR UPDATE OR DELETE ON kpi_cycles      FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_kpi_goals       AFTER INSERT OR UPDATE OR DELETE ON kpi_goals       FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_kpi_evaluations AFTER INSERT OR UPDATE OR DELETE ON kpi_evaluations FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Sửa view dashboard: đề xuất lương chờ duyệt nay gồm cả bước Kế toán và Giám đốc (trước đây dùng trạng thái cũ pending_admin)
CREATE OR REPLACE VIEW v_kpi_summary AS
SELECT
  (SELECT count(*) FROM employees WHERE status <> 'terminated')::int AS headcount,
  (SELECT count(*) FROM employees WHERE status = 'onboarding')::int AS onboarding_count,
  (SELECT count(*) FROM contracts WHERE status = 'active')::int AS active_contracts,
  (SELECT COALESCE(round(avg(base_salary)), 0) FROM contracts WHERE status = 'active')::bigint AS avg_base_salary,
  (SELECT count(*) FROM leave_requests WHERE status = 'pending')::int AS pending_leave,
  (SELECT count(*) FROM salary_proposals WHERE status IN ('pending_hr', 'pending_accountant', 'pending_director'))::int AS pending_proposals,
  (SELECT count(*) FROM v_contracts_expiring WHERE days_left <= 60)::int AS expiring_contracts,
  (SELECT period_year FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_year,
  (SELECT period_month FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_month,
  (SELECT gross_total FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_gross,
  (SELECT net_total FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_net,
  (SELECT employer_cost FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_employer_cost;
