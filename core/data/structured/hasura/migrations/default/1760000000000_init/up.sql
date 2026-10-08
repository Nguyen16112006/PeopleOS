-- =====================================================================
-- PeopleOS - Schema cơ sở dữ liệu chính (Tầng 1: dữ liệu cấu trúc)
-- Hasura CLI migrations tự áp dụng file này khi container khởi động.
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Cập nhật cột updated_at tự động
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- users: danh tính đồng bộ từ Keycloak (id = claim `sub` của JWT)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id          uuid PRIMARY KEY,
  username    text NOT NULL UNIQUE,
  email       text NOT NULL UNIQUE,
  full_name   text NOT NULL,
  role        text NOT NULL CHECK (role IN ('admin','hr','manager','employee')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- employees: hồ sơ nhân sự
-- ---------------------------------------------------------------------
CREATE TABLE employees (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  employee_code        text NOT NULL UNIQUE,
  full_name            text NOT NULL,
  email                text NOT NULL,
  phone                text,
  date_of_birth        date,
  gender               text,
  address              text,
  department           text NOT NULL,
  job_title            text NOT NULL,
  manager_id           uuid REFERENCES employees(id) ON DELETE SET NULL,
  hire_date            date NOT NULL,
  status               text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('onboarding','active','on_leave','terminated')),
  tax_code             text,
  social_insurance_no  text,
  health_insurance_no  text,
  dependents           integer NOT NULL DEFAULT 0 CHECK (dependents >= 0),
  region               smallint NOT NULL DEFAULT 1 CHECK (region BETWEEN 1 AND 4),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_employees_manager ON employees(manager_id);
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- contracts: hợp đồng lao động (file PDF nằm trong MinIO, tham chiếu bởi file_key)
-- ---------------------------------------------------------------------
CREATE TABLE contracts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  contract_no    text NOT NULL UNIQUE,
  contract_type  text NOT NULL CHECK (contract_type IN ('probation','fixed_term','indefinite')),
  start_date     date NOT NULL,
  end_date       date,
  base_salary    bigint NOT NULL CHECK (base_salary >= 0),
  allowance      bigint NOT NULL DEFAULT 0 CHECK (allowance >= 0),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','expired','terminated')),
  file_key       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_employee ON contracts(employee_id);

-- ---------------------------------------------------------------------
-- payrolls: bảng lương hằng tháng
-- ---------------------------------------------------------------------
CREATE TABLE payrolls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id           uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_year           smallint NOT NULL,
  period_month          smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  base_salary           bigint NOT NULL,
  allowance             bigint NOT NULL DEFAULT 0,
  overtime_pay          bigint NOT NULL DEFAULT 0,
  bonus                 bigint NOT NULL DEFAULT 0,
  gross                 bigint NOT NULL,
  insured_salary        bigint NOT NULL,
  bhxh_employee         bigint NOT NULL,
  bhyt_employee         bigint NOT NULL,
  bhtn_employee         bigint NOT NULL,
  taxable_income        bigint NOT NULL,
  personal_income_tax   bigint NOT NULL,
  net_salary            bigint NOT NULL,
  status                text NOT NULL DEFAULT 'paid' CHECK (status IN ('draft','paid')),
  paid_at               date,
  file_key              text,
  UNIQUE (employee_id, period_year, period_month)
);
CREATE INDEX idx_payrolls_employee ON payrolls(employee_id, period_year DESC, period_month DESC);

-- ---------------------------------------------------------------------
-- insurance_records: quá trình đóng BHXH/BHYT/BHTN theo tháng
-- ---------------------------------------------------------------------
CREATE TABLE insurance_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period          date NOT NULL,                 -- ngày đầu tháng
  insured_salary  bigint NOT NULL,
  bhxh_employee   bigint NOT NULL,
  bhyt_employee   bigint NOT NULL,
  bhtn_employee   bigint NOT NULL,
  bhxh_employer   bigint NOT NULL,
  bhyt_employer   bigint NOT NULL,
  bhtn_employer   bigint NOT NULL,
  UNIQUE (employee_id, period)
);

-- ---------------------------------------------------------------------
-- leave_balances / leave_requests: nghỉ phép, nghỉ ốm
-- ---------------------------------------------------------------------
CREATE TABLE leave_balances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year           smallint NOT NULL,
  entitled_days  numeric(4,1) NOT NULL DEFAULT 12,
  used_days      numeric(4,1) NOT NULL DEFAULT 0,
  sick_days_used numeric(4,1) NOT NULL DEFAULT 0,
  UNIQUE (employee_id, year)
);

CREATE TABLE leave_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type    text NOT NULL CHECK (leave_type IN ('annual','sick','unpaid','personal')),
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  days          numeric(4,1) NOT NULL CHECK (days > 0),
  reason        text,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled')),
  approver_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  decision_note text,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_leave_employee ON leave_requests(employee_id, created_at DESC);
CREATE TRIGGER trg_leave_updated BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- salary_proposals + approval_steps: đề xuất tăng lương/phụ cấp, duyệt nhiều cấp
-- Chuỗi duyệt: HR (bước 1) -> Admin/Giám đốc (bước 2)
-- ---------------------------------------------------------------------
CREATE TABLE salary_proposals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  proposer_id      uuid NOT NULL REFERENCES employees(id),
  proposal_type    text NOT NULL CHECK (proposal_type IN ('raise','allowance')),
  current_amount   bigint NOT NULL,
  proposed_amount  bigint NOT NULL,
  reason           text NOT NULL,
  effective_date   date,
  status           text NOT NULL DEFAULT 'pending_hr'
                     CHECK (status IN ('pending_hr','pending_admin','approved','rejected')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_proposals_updated BEFORE UPDATE ON salary_proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE approval_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id    uuid NOT NULL REFERENCES salary_proposals(id) ON DELETE CASCADE,
  step_order     smallint NOT NULL,
  approver_role  text NOT NULL CHECK (approver_role IN ('hr','admin')),
  status         text NOT NULL DEFAULT 'waiting'
                   CHECK (status IN ('waiting','pending','approved','rejected')),
  approver_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  comment        text,
  decided_at     timestamptz,
  UNIQUE (proposal_id, step_order)
);

-- ---------------------------------------------------------------------
-- onboarding_tasks: checklist hội nhập nhân viên mới (do n8n sinh ra)
-- ---------------------------------------------------------------------
CREATE TABLE onboarding_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title          text NOT NULL,
  assignee_role  text NOT NULL CHECK (assignee_role IN ('hr','manager','employee','admin')),
  status         text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done')),
  due_date       date,
  completed_at   timestamptz
);

-- ---------------------------------------------------------------------
-- notifications: thông báo (đồng thời được đẩy realtime qua NATS -> WebSocket)
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  message     text NOT NULL,
  ref_type    text,
  ref_id      uuid,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
