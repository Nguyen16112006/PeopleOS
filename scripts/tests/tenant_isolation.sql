-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- =====================================================================
-- Kiểm thử cô lập đa tenant ở tầng PostgreSQL (lớp 2: RLS).
-- Chạy bằng role owner/superuser; script tự SET ROLE hasura_app để mô phỏng Hasura,
-- tự seed 2 tenant thử nghiệm và ROLLBACK ở cuối -> không để lại dữ liệu.
-- Chạy:  scripts/test-tenant-isolation.sh
-- Thất bại bất kỳ ca nào => RAISE EXCEPTION => psql thoát mã khác 0.
-- =====================================================================
\set ON_ERROR_STOP on
BEGIN;

-- ---- Seed (chạy bằng owner, RLS bị bỏ qua; ghi tenant_id tường minh) -----------------
INSERT INTO platform.tenants (id, short_id, name, owner_dev_id) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'testaaa1', 'Tenant thử A', '00000000-0000-0000-0000-000000000000'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'testbbb1', 'Tenant thử B', '00000000-0000-0000-0000-000000000000');

-- Cùng username / employee_code / contract_no ở 2 tenant: hợp lệ nhờ UNIQUE theo tenant
INSERT INTO users (id, username, email, full_name, role, tenant_id) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'hr', 'hr@a.test', 'HR A', 'hr', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000001', 'hr', 'hr@b.test', 'HR B', 'hr', 'bbbbbbbb-0000-0000-0000-00000000000b');

INSERT INTO employees (id, employee_code, full_name, email, department, job_title, hire_date, tenant_id) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'E001', 'A Một', 'a1@a.test', 'IT', 'Dev', '2024-01-01', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('a2000000-0000-0000-0000-000000000002', 'E002', 'A Hai', 'a2@a.test', 'IT', 'Dev', '2024-01-01', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('b2000000-0000-0000-0000-000000000001', 'E001', 'B Một', 'b1@b.test', 'HR', 'HR', '2024-01-01', 'bbbbbbbb-0000-0000-0000-00000000000b');

INSERT INTO contracts (employee_id, contract_no, contract_type, start_date, base_salary, tenant_id) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'HD-001', 'indefinite', '2024-01-01', 20000000, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('b2000000-0000-0000-0000-000000000001', 'HD-001', 'indefinite', '2024-01-01', 99000000, 'bbbbbbbb-0000-0000-0000-00000000000b');

INSERT INTO payrolls (employee_id, period_year, period_month, base_salary, gross, insured_salary,
                      bhxh_employee, bhyt_employee, bhtn_employee, taxable_income, personal_income_tax,
                      net_salary, status, tenant_id) VALUES
  ('a2000000-0000-0000-0000-000000000001', 2026, 9, 20000000, 20000000, 20000000, 0,0,0, 0,0, 20000000, 'paid', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('a2000000-0000-0000-0000-000000000002', 2026, 9, 10000000, 10000000, 10000000, 0,0,0, 0,0, 10000000, 'paid', 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('b2000000-0000-0000-0000-000000000001', 2026, 9, 99000000, 99000000, 99000000, 0,0,0, 0,0, 99000000, 'paid', 'bbbbbbbb-0000-0000-0000-00000000000b');

-- Khóa chính (tenant_id, year) cho phép cùng năm ở 2 tenant
INSERT INTO hr_budgets (year, payroll_fund, tenant_id) VALUES
  (2026, 1, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  (2026, 2, 'bbbbbbbb-0000-0000-0000-00000000000b');

-- ---- Chuỗi audit: mỗi tenant một chuỗi riêng, seq bắt đầu từ 1, không lẫn nhau -----------
DO $$ DECLARE a int; b int; broken int; BEGIN
  SELECT count(*), min(seq) INTO a, broken FROM audit_logs WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  IF a = 0 OR broken <> 1 THEN RAISE EXCEPTION 'FAIL T12: chuỗi audit của A rỗng hoặc không bắt đầu từ seq 1 (count=%, min=%)', a, broken; END IF;
  SELECT count(*), min(seq) INTO b, broken FROM audit_logs WHERE tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  IF b = 0 OR broken <> 1 THEN RAISE EXCEPTION 'FAIL T12: chuỗi audit của B rỗng hoặc không bắt đầu từ seq 1'; END IF;

  -- Cùng công thức với scripts/audit-verify.sql (toàn bộ tenant)
  WITH chk AS (
    SELECT tenant_id, seq, prev_hash, hash,
           lag(hash) OVER (PARTITION BY tenant_id ORDER BY seq) AS lag_hash,
           lag(seq)  OVER (PARTITION BY tenant_id ORDER BY seq) AS lag_seq,
           encode(digest(convert_to(concat_ws('|', seq::text, prev_hash, occurred_text, COALESCE(actor_id, ''), COALESCE(actor_role, ''),
                  action, COALESCE(entity_type, ''), COALESCE(entity_id, ''), details), 'UTF8'), 'sha256'), 'hex') AS calc
      FROM audit_logs)
  SELECT count(*) FILTER (WHERE calc <> hash OR prev_hash <> COALESCE(lag_hash, repeat('0', 64))
                             OR seq <> COALESCE(lag_seq, 0) + 1) INTO broken FROM chk;
  IF broken <> 0 THEN RAISE EXCEPTION 'FAIL T12: % bản ghi audit hỏng chuỗi băm', broken; END IF;
  RAISE NOTICE 'PASS T12  chuỗi audit tách riêng từng tenant (A=% bản ghi, B=%), băm toàn vẹn', a, b;
END $$;

-- ---- Từ đây mô phỏng Hasura: role không-superuser, tenant qua hasura.user ------------
SET LOCAL ROLE hasura_app;
SELECT set_config('hasura.user', '{"x-hasura-role":"hr","x-hasura-tenant-id":"aaaaaaaa-0000-0000-0000-00000000000a"}', true);

DO $$ DECLARE n int; g bigint; BEGIN
  SELECT count(*) INTO n FROM employees;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL T1: tenant A thấy % nhân viên (kỳ vọng 2)', n; END IF;
  RAISE NOTICE 'PASS T1  tenant A chỉ thấy nhân viên của mình (2)';

  SELECT count(*) INTO n FROM employees WHERE tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T2: A lọc theo tenant_id của B vẫn thấy % dòng', n; END IF;
  RAISE NOTICE 'PASS T2  A cố tình lọc tenant_id của B -> 0 dòng';

  UPDATE employees SET department = 'HACKED' WHERE id = 'b2000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T3: A sửa được % dòng của B', n; END IF;
  DELETE FROM contracts WHERE contract_no = 'HD-001' AND tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T3: A xóa được % dòng của B', n; END IF;
  RAISE NOTICE 'PASS T3  A không sửa/xóa được dữ liệu của B';

  BEGIN
    INSERT INTO employees (employee_code, full_name, email, department, job_title, hire_date, tenant_id)
    VALUES ('E900', 'Gài B', 'x@b.test', 'IT', 'Dev', '2024-01-01', 'bbbbbbbb-0000-0000-0000-00000000000b');
    RAISE EXCEPTION 'FAIL T4: A ghi được dòng mang tenant_id của B';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS T4  A không ghi được dòng mang tenant_id của B (RLS WITH CHECK)';
  END;

  INSERT INTO employees (employee_code, full_name, email, department, job_title, hire_date)
  VALUES ('E003', 'A Ba', 'a3@a.test', 'IT', 'Dev', '2024-01-01');
  SELECT count(*) INTO n FROM employees WHERE employee_code = 'E003' AND tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T5: INSERT không chỉ định tenant_id không tự gán tenant của phiên'; END IF;
  RAISE NOTICE 'PASS T5  INSERT thiếu tenant_id tự gán tenant của phiên';

  BEGIN
    INSERT INTO employees (employee_code, full_name, email, department, job_title, hire_date)
    VALUES ('E001', 'Trùng mã', 'dup@a.test', 'IT', 'Dev', '2024-01-01');
    RAISE EXCEPTION 'FAIL T6: trùng employee_code trong cùng tenant vẫn ghi được';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS T6  trùng employee_code TRONG tenant bị chặn (tenant khác thì được, xem seed)';
  END;

  -- View
  SELECT gross_total INTO g FROM v_payroll_monthly WHERE period_year = 2026 AND period_month = 9;
  IF g IS DISTINCT FROM 30000000 THEN RAISE EXCEPTION 'FAIL T7: v_payroll_monthly của A = % (kỳ vọng 30000000, không lẫn B)', g; END IF;
  SELECT headcount INTO n FROM v_kpi_summary WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL T8: v_kpi_summary.headcount của A = % (kỳ vọng 3)', n; END IF;
  SELECT headcount INTO n FROM v_kpi_summary WHERE tenant_id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T8: phiên A thấy headcount của B qua v_kpi_summary = %', n; END IF;
  RAISE NOTICE 'PASS T7/T8  view tổng hợp chỉ chứa số liệu của tenant phiên';

  -- Audit vẫn bất biến dưới role không-superuser, và chỉ thấy chuỗi của tenant phiên
  SELECT count(*) INTO n FROM audit_logs WHERE tenant_id <> 'aaaaaaaa-0000-0000-0000-00000000000a';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T13: phiên A thấy % bản ghi audit của tenant khác', n; END IF;
  BEGIN
    UPDATE audit_logs SET details = '{}' WHERE tenant_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'FAIL T13: sửa được audit_logs';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS T13  audit bất biến và cô lập theo tenant dưới role hasura_app';
END $$;

-- Chuyển sang tenant B: kiểm tra đối xứng
SELECT set_config('hasura.user', '{"x-hasura-tenant-id":"bbbbbbbb-0000-0000-0000-00000000000b"}', true);
DO $$ DECLARE n int; g bigint; BEGIN
  SELECT count(*) INTO n FROM employees;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL T9: tenant B thấy % nhân viên (kỳ vọng 1)', n; END IF;
  SELECT gross_total INTO g FROM v_payroll_monthly WHERE period_year = 2026 AND period_month = 9;
  IF g IS DISTINCT FROM 99000000 THEN RAISE EXCEPTION 'FAIL T9: v_payroll_monthly của B = %', g; END IF;
  RAISE NOTICE 'PASS T9  tenant B đối xứng';
END $$;

-- Thiếu / sai session variable => fail-closed
SELECT set_config('hasura.user', '{"x-hasura-role":"hr"}', true);
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM employees;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T10: không có x-hasura-tenant-id nhưng thấy % dòng', n; END IF;
  BEGIN
    INSERT INTO employees (employee_code, full_name, email, department, job_title, hire_date)
    VALUES ('E777', 'Vô chủ', 'n@n.test', 'IT', 'Dev', '2024-01-01');
    RAISE EXCEPTION 'FAIL T11: ghi được dòng khi không có tenant';
  EXCEPTION WHEN not_null_violation OR insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'PASS T10/T11  thiếu tenant => không đọc, không ghi (fail-closed)';
END $$;

-- GUC rỗng (trạng thái sau khi một transaction trước đó đã SET LOCAL trên cùng connection của pool) => 0 dòng, KHÔNG lỗi
SELECT set_config('hasura.user', '', true);
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM employees;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL T14: GUC rỗng nhưng thấy % dòng', n; END IF;
  RAISE NOTICE 'PASS T14  hasura.user rỗng => 0 dòng, không lỗi (an toàn với connection pool)';
END $$;

-- ---- Tham chiếu chéo tenant qua FK phải bị chặn (migration 1760000000010: FK tổng hợp (tenant_id, id)) ----
-- Kiểm tra FK của PostgreSQL bỏ qua RLS, nên nếu không có FK tổng hợp thì A biết id nhân viên của B vẫn tạo được hợp đồng trỏ tới B.
SELECT set_config('hasura.user', '{"x-hasura-tenant-id":"aaaaaaaa-0000-0000-0000-00000000000a"}', true);
DO $$ BEGIN
  BEGIN
    INSERT INTO contracts (employee_id, contract_no, contract_type, start_date, base_salary)
    VALUES ('b2000000-0000-0000-0000-000000000001', 'HD-CHEO', 'indefinite', '2024-01-01', 1);
    RAISE EXCEPTION 'FAIL T15: A tạo được hợp đồng của A trỏ tới nhân viên của B (thiếu FK tổng hợp)';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS T15  tham chiếu chéo tenant qua FK bị chặn';
  END;
  -- đối chứng: tham chiếu CÙNG tenant vẫn hợp lệ
  INSERT INTO contracts (employee_id, contract_no, contract_type, start_date, base_salary)
  VALUES ('a2000000-0000-0000-0000-000000000002', 'HD-OK', 'indefinite', '2024-01-01', 1);
  RAISE NOTICE 'PASS T15b tham chiếu cùng tenant vẫn ghi được';
END $$;

RESET ROLE;
ROLLBACK;
\echo '>>> Tất cả ca bắt buộc đạt. Dữ liệu thử đã ROLLBACK.'
