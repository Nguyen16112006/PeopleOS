-- =====================================================================
-- PeopleOS - Quản trị dữ liệu & kiểm toán
--   1. audit_logs: nhật ký BẤT BIẾN, liên kết chuỗi băm SHA-256 (tamper-evident)
--   2. Trigger ghi nhật ký thay đổi dữ liệu nhạy cảm (kể cả khi sửa trực tiếp trong CSDL)
--   3. data_assets / data_lineage: danh mục và phả hệ dữ liệu (data lineage)
--   4. Các view phục vụ dashboard điều hành
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nhật ký kiểm toán bất biến
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  seq            bigint PRIMARY KEY,                 -- gán trong trigger (liên tục, không có khoảng trống)
  occurred_text  text NOT NULL,                      -- thời điểm ISO-8601 (dạng text để băm chính xác)
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  actor_id       text,                               -- sub của Keycloak, hoặc NULL nếu là hệ thống
  actor_name     text,
  actor_role     text,
  action         text NOT NULL,                      -- ví dụ LEAVE.APPROVED, DB.UPDATE
  entity_type    text,
  entity_id      text,
  details        text NOT NULL DEFAULT '{}',         -- JSON dạng text
  prev_hash      text NOT NULL,                      -- hash của bản ghi liền trước (genesis = 64 số 0)
  hash           text NOT NULL                       -- SHA-256(seq|prev_hash|occurred_text|actor_id|actor_role|action|entity_type|entity_id|details)
);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);

-- Gán seq + prev_hash + hash dưới khóa tư vấn để chuỗi luôn tuần tự dù ghi đồng thời.
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

CREATE TRIGGER trg_audit_chain BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_chain_before_insert();
-- occurred_text cho phép NULL ở phía người ghi (trigger tự điền) nhưng cột vẫn NOT NULL sau trigger.

-- Chặn sửa/xóa/truncate: nhật ký chỉ được thêm vào (append-only).
CREATE OR REPLACE FUNCTION audit_block_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs là nhật ký bất biến: không được % bản ghi', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_no_update_delete BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_block_change();
CREATE TRIGGER trg_audit_no_truncate BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_block_change();

-- ---------------------------------------------------------------------
-- 2. Ghi nhật ký thay đổi dữ liệu nhạy cảm ở cấp CSDL
--    (bắt cả thao tác đi qua Hasura, backend lẫn SQL trực tiếp)
-- ---------------------------------------------------------------------
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
      RETURN NULL;                                  -- không có thay đổi thực chất
    END IF;
    detail := jsonb_build_object('old', changed_old, 'new', changed_new);
  END IF;

  INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, details)
  VALUES (actor, actor_role, 'DB.' || TG_OP, TG_TABLE_NAME, rec_id, detail::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_users            AFTER INSERT OR UPDATE OR DELETE ON users            FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_employees        AFTER INSERT OR UPDATE OR DELETE ON employees        FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_contracts        AFTER INSERT OR UPDATE OR DELETE ON contracts        FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_payrolls         AFTER INSERT OR UPDATE OR DELETE ON payrolls         FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_leave_requests   AFTER INSERT OR UPDATE OR DELETE ON leave_requests   FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_salary_proposals AFTER INSERT OR UPDATE OR DELETE ON salary_proposals FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_approval_steps   AFTER INSERT OR UPDATE OR DELETE ON approval_steps   FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ---------------------------------------------------------------------
-- 3. Danh mục dữ liệu và phả hệ (data lineage)
-- ---------------------------------------------------------------------
CREATE TABLE data_assets (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  asset_type      text NOT NULL CHECK (asset_type IN ('source','table','view','object_store','vector_store','process','output')),
  system          text NOT NULL,                     -- hệ thống chứa/xử lý: Keycloak, PostgreSQL, MinIO, n8n, Backend...
  layer           smallint NOT NULL CHECK (layer BETWEEN 1 AND 4),   -- 1 Nguồn, 2 Lưu trữ, 3 Xử lý, 4 Tiêu thụ
  classification  text NOT NULL CHECK (classification IN ('public','internal','confidential','pii')),
  owner           text NOT NULL,
  description     text NOT NULL
);

CREATE TABLE data_lineage (
  id          serial PRIMARY KEY,
  source_id   text NOT NULL REFERENCES data_assets(id) ON DELETE CASCADE,
  target_id   text NOT NULL REFERENCES data_assets(id) ON DELETE CASCADE,
  transform   text NOT NULL,                         -- phép biến đổi / cơ chế chuyển dữ liệu
  UNIQUE (source_id, target_id)
);

-- ---------------------------------------------------------------------
-- 4. View cho dashboard điều hành (HR/Admin đọc qua Hasura)
-- ---------------------------------------------------------------------
CREATE VIEW v_headcount_by_department AS
SELECT department,
       count(*)::int AS headcount,
       COALESCE(round(avg(c.base_salary)), 0)::bigint AS avg_base_salary,
       COALESCE(sum(c.base_salary), 0)::bigint AS total_base_salary
  FROM employees e
  LEFT JOIN LATERAL (SELECT base_salary FROM contracts
                      WHERE employee_id = e.id AND status = 'active' ORDER BY start_date DESC LIMIT 1) c ON true
 WHERE e.status <> 'terminated'
 GROUP BY department;

CREATE VIEW v_payroll_monthly AS
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
 GROUP BY p.period_year, p.period_month;

CREATE VIEW v_leave_summary AS
SELECT leave_type, status, count(*)::int AS requests, COALESCE(sum(days), 0)::numeric AS days
  FROM leave_requests
 WHERE date_part('year', start_date) = date_part('year', now())
 GROUP BY leave_type, status;

CREATE VIEW v_contracts_expiring AS
SELECT c.id, c.contract_no, e.full_name, e.department, c.contract_type, c.end_date,
       (c.end_date - current_date)::int AS days_left
  FROM contracts c JOIN employees e ON e.id = c.employee_id
 WHERE c.status = 'active' AND c.end_date IS NOT NULL AND c.end_date <= current_date + 90;

CREATE VIEW v_kpi_summary AS
SELECT
  (SELECT count(*) FROM employees WHERE status <> 'terminated')::int AS headcount,
  (SELECT count(*) FROM employees WHERE status = 'onboarding')::int AS onboarding_count,
  (SELECT count(*) FROM contracts WHERE status = 'active')::int AS active_contracts,
  (SELECT COALESCE(round(avg(base_salary)), 0) FROM contracts WHERE status = 'active')::bigint AS avg_base_salary,
  (SELECT count(*) FROM leave_requests WHERE status = 'pending')::int AS pending_leave,
  (SELECT count(*) FROM salary_proposals WHERE status IN ('pending_hr', 'pending_admin'))::int AS pending_proposals,
  (SELECT count(*) FROM v_contracts_expiring WHERE days_left <= 60)::int AS expiring_contracts,
  (SELECT period_year FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_year,
  (SELECT period_month FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_month,
  (SELECT gross_total FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_gross,
  (SELECT net_total FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_net,
  (SELECT employer_cost FROM v_payroll_monthly ORDER BY period_year DESC, period_month DESC LIMIT 1) AS latest_employer_cost;
