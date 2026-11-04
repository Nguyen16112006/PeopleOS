-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- Khôi phục view về định nghĩa trước 1760000000008 (không có tenant_id).
DROP VIEW IF EXISTS v_kpi_summary;
DROP VIEW IF EXISTS v_payroll_monthly;
DROP VIEW IF EXISTS v_contracts_expiring;
DROP VIEW IF EXISTS v_leave_summary;
DROP VIEW IF EXISTS v_headcount_by_department;

CREATE VIEW v_headcount_by_department WITH (security_invoker = true) AS
SELECT department,
       count(*)::int AS headcount,
       COALESCE(round(avg(c.base_salary)), 0)::bigint AS avg_base_salary,
       COALESCE(sum(c.base_salary), 0)::bigint AS total_base_salary
  FROM employees e
  LEFT JOIN LATERAL (SELECT base_salary FROM contracts
                      WHERE employee_id = e.id AND status = 'active' ORDER BY start_date DESC LIMIT 1) c ON true
 WHERE e.status <> 'terminated'
 GROUP BY department;

CREATE VIEW v_leave_summary WITH (security_invoker = true) AS
SELECT leave_type, status, count(*)::int AS requests, COALESCE(sum(days), 0)::numeric AS days
  FROM leave_requests
 WHERE date_part('year', start_date) = date_part('year', now())
 GROUP BY leave_type, status;

CREATE VIEW v_contracts_expiring WITH (security_invoker = true) AS
SELECT c.id, c.contract_no, e.full_name, e.department, c.contract_type, c.end_date,
       (c.end_date - current_date)::int AS days_left
  FROM contracts c JOIN employees e ON e.id = c.employee_id
 WHERE c.status = 'active' AND c.end_date IS NOT NULL AND c.end_date <= current_date + 90;

CREATE VIEW v_payroll_monthly WITH (security_invoker = true) AS
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

CREATE VIEW v_kpi_summary WITH (security_invoker = true) AS
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

-- ---- Khôi phục audit về chuỗi toàn cục (SẼ LỖI nếu nhiều tenant đã có seq trùng nhau) ----
CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $$
DECLARE
  session_json json;
  actor text;
  actor_role text;
  rec_id text;
  detail jsonb;
  changed_old jsonb;
  changed_new jsonb;
BEGIN
  BEGIN
    session_json := current_setting('hasura.user', true)::json;
    actor := session_json ->> 'x-hasura-user-id';
    actor_role := session_json ->> 'x-hasura-role';
  EXCEPTION WHEN others THEN
    actor := NULL; actor_role := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    rec_id := to_jsonb(NEW) ->> 'id';
    detail := jsonb_build_object('new', to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    rec_id := to_jsonb(OLD) ->> 'id';
    detail := jsonb_build_object('old', to_jsonb(OLD));
  ELSE
    rec_id := to_jsonb(NEW) ->> 'id';
    SELECT jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, to_jsonb(OLD) -> n.key)
      INTO changed_new, changed_old
      FROM jsonb_each(to_jsonb(NEW)) n
     WHERE n.key <> 'updated_at' AND (to_jsonb(OLD) -> n.key) IS DISTINCT FROM n.value;
    IF changed_new IS NULL THEN
      RETURN NULL;
    END IF;
    detail := jsonb_build_object('old', changed_old, 'new', changed_new);
  END IF;

  INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, details)
  VALUES (actor, actor_role, 'DB.' || TG_OP, TG_TABLE_NAME, rec_id, detail::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION audit_chain_before_insert() RETURNS trigger AS $$
DECLARE
  last_hash text;
  last_seq  bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(7300001);
  SELECT seq, hash INTO last_seq, last_hash FROM audit_logs ORDER BY seq DESC LIMIT 1;
  NEW.seq := COALESCE(last_seq, 0) + 1;
  NEW.prev_hash := COALESCE(last_hash, repeat('0', 64));
  IF NEW.occurred_text IS NULL THEN
    NEW.occurred_text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
  END IF;
  NEW.hash := encode(digest(convert_to(concat_ws('|',
      NEW.seq::text, NEW.prev_hash, NEW.occurred_text, COALESCE(NEW.actor_id, ''), COALESCE(NEW.actor_role, ''),
      NEW.action, COALESCE(NEW.entity_type, ''), COALESCE(NEW.entity_id, ''), NEW.details), 'UTF8'), 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_pkey, ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (seq);

-- Khôi phục khóa toàn cục. SẼ LỖI nếu đã có dữ liệu trùng giữa các tenant (đúng chủ đích: chặn rollback mất dữ liệu).
ALTER TABLE hr_budgets        DROP CONSTRAINT hr_budgets_pkey,        ADD CONSTRAINT hr_budgets_pkey        PRIMARY KEY (year);
ALTER TABLE annual_reports    DROP CONSTRAINT annual_reports_pkey,    ADD CONSTRAINT annual_reports_pkey    PRIMARY KEY (year);
ALTER TABLE tax_year_closings DROP CONSTRAINT tax_year_closings_pkey, ADD CONSTRAINT tax_year_closings_pkey PRIMARY KEY (year);
ALTER TABLE app_settings      DROP CONSTRAINT app_settings_pkey,      ADD CONSTRAINT app_settings_pkey      PRIMARY KEY (key);
ALTER TABLE payroll_runs DROP CONSTRAINT payroll_runs_period_year_period_month_key, ADD CONSTRAINT payroll_runs_period_year_period_month_key UNIQUE (period_year, period_month);
ALTER TABLE kpi_cycles   DROP CONSTRAINT kpi_cycles_year_quarter_key, ADD CONSTRAINT kpi_cycles_year_quarter_key UNIQUE (year, quarter);
ALTER TABLE contracts    DROP CONSTRAINT contracts_contract_no_key,   ADD CONSTRAINT contracts_contract_no_key   UNIQUE (contract_no);
ALTER TABLE employees    DROP CONSTRAINT employees_employee_code_key, ADD CONSTRAINT employees_employee_code_key UNIQUE (employee_code);
ALTER TABLE users DROP CONSTRAINT users_email_key,    ADD CONSTRAINT users_email_key    UNIQUE (email);
ALTER TABLE users DROP CONSTRAINT users_username_key, ADD CONSTRAINT users_username_key UNIQUE (username);
