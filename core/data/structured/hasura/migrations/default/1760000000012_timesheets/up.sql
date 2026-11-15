-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- =====================================================================
-- PeopleOS - Bảng công (chấm công) cho mọi vai trò, làm đầu vào tính lương
--   Mọi tài khoản (6 vai trò) chấm công vào/ra, khai làm thêm giờ -> gửi bảng công tháng
--   -> Quản lý trực tiếp xác nhận (không có quản lý: HR; HR không có quản lý: Giám đốc)
--   -> HR chốt công (tạo kỳ lương, khóa bảng công) -> Kế toán tính lương THEO NGÀY CÔNG và giờ làm thêm.
--
--   attendance_records : một dòng cho mỗi nhân viên mỗi ngày (giờ vào/ra, loại ngày, số công, giờ làm thêm)
--   timesheets         : bảng công tháng (tổng hợp từ attendance_records + đơn nghỉ đã duyệt), có trạng thái duyệt
--   payrolls           : thêm số liệu công để phiếu lương giải thích được cách tính
-- Đa tenant: theo đúng mẫu của migration 007/008/010 (tenant_id + RLS fail-closed + khóa ngoại tổng hợp).
-- =====================================================================
CREATE TABLE IF NOT EXISTS attendance_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT platform.current_tenant() REFERENCES platform.tenants(id),
  employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date      date NOT NULL,
  check_in       timestamptz,
  check_out      timestamptz,
  -- present: làm tại văn phòng · remote: làm từ xa · business_trip: công tác · holiday: nghỉ lễ hưởng lương
  -- paid_leave: nghỉ hưởng lương (phép năm, ốm) · unpaid_leave: nghỉ không lương · absent: vắng không phép
  status         text NOT NULL DEFAULT 'present'
                   CHECK (status IN ('present','remote','business_trip','holiday','paid_leave','unpaid_leave','absent')),
  work_days      numeric(3,2) NOT NULL DEFAULT 1 CHECK (work_days IN (0, 0.5, 1)),
  overtime_hours numeric(4,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0 AND overtime_hours <= 12),
  -- hệ số làm thêm theo Điều 98 Bộ luật Lao động 2019: ngày thường 150%, ngày nghỉ hằng tuần 200%, ngày lễ 300%
  overtime_type  text NOT NULL DEFAULT 'weekday' CHECK (overtime_type IN ('weekday','weekend','holiday')),
  note           text,
  source         text NOT NULL DEFAULT 'self' CHECK (source IN ('self','hr','system')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_employee_id_work_date_key UNIQUE (employee_id, work_date),
  CONSTRAINT attendance_records_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT attendance_records_employee_id_fkey_tenant FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT attendance_records_check_order CHECK (check_out IS NULL OR check_in IS NULL OR check_out >= check_in)
);
CREATE INDEX IF NOT EXISTS ix_attendance_records_tenant ON attendance_records (tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_date ON attendance_records (work_date);

CREATE TABLE IF NOT EXISTS timesheets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL DEFAULT platform.current_tenant() REFERENCES platform.tenants(id),
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_year        smallint NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
  period_month       smallint NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  standard_days      numeric(4,1) NOT NULL DEFAULT 0,   -- công chuẩn của tháng (thứ 2 - thứ 6)
  work_days          numeric(4,1) NOT NULL DEFAULT 0,   -- công đi làm thực tế (văn phòng, từ xa, công tác)
  paid_leave_days    numeric(4,1) NOT NULL DEFAULT 0,   -- nghỉ hưởng lương (phép năm, ốm)
  holiday_days       numeric(4,1) NOT NULL DEFAULT 0,   -- nghỉ lễ hưởng lương
  unpaid_leave_days  numeric(4,1) NOT NULL DEFAULT 0,   -- nghỉ không lương có đơn
  absent_days        numeric(4,1) NOT NULL DEFAULT 0,   -- vắng không phép hoặc chưa chấm công
  ot_weekday_hours   numeric(5,2) NOT NULL DEFAULT 0,
  ot_weekend_hours   numeric(5,2) NOT NULL DEFAULT 0,
  ot_holiday_hours   numeric(5,2) NOT NULL DEFAULT 0,
  -- open: đang chấm · submitted: chờ xác nhận · confirmed: đã xác nhận · closed: HR đã chốt, không sửa được nữa
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','confirmed','closed')),
  submitted_at       timestamptz,
  confirmed_by       uuid REFERENCES employees(id) ON DELETE SET NULL,
  confirmed_at       timestamptz,
  review_note        text,                               -- lý do người xác nhận trả lại bảng công
  closed_at          timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT timesheets_employee_id_period_year_period_month_key UNIQUE (employee_id, period_year, period_month),
  CONSTRAINT timesheets_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT timesheets_employee_id_fkey_tenant FOREIGN KEY (tenant_id, employee_id)
    REFERENCES employees (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT timesheets_confirmed_by_fkey_tenant FOREIGN KEY (tenant_id, confirmed_by)
    REFERENCES employees (tenant_id, id) ON DELETE SET NULL (confirmed_by)
);
CREATE INDEX IF NOT EXISTS ix_timesheets_tenant ON timesheets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_period ON timesheets (period_year, period_month, status);

CREATE TRIGGER trg_attendance_records_updated BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_timesheets_updated BEFORE UPDATE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- Bảng công tháng là căn cứ trả lương nên mọi thay đổi đều vào nhật ký kiểm toán (bản ghi từng ngày thì không, tránh làm loãng nhật ký).
CREATE TRIGGER trg_audit_timesheets AFTER INSERT OR UPDATE OR DELETE ON timesheets
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- Cô lập tenant (fail-closed), giống mọi bảng nghiệp vụ khác
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_records', 'timesheets'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I USING (tenant_id = platform.current_tenant()) '
                   'WITH CHECK (tenant_id = platform.current_tenant())', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_records, timesheets TO hasura_app;

-- Phiếu lương ghi lại số liệu công đã dùng để tính (NULL = kỳ lương cũ, tính đủ tháng)
ALTER TABLE payrolls
  ADD COLUMN IF NOT EXISTS standard_days  numeric(4,1),
  ADD COLUMN IF NOT EXISTS paid_days      numeric(4,1),
  ADD COLUMN IF NOT EXISTS overtime_hours numeric(5,2);
COMMENT ON COLUMN payrolls.paid_days IS 'Ngày công hưởng lương = công đi làm + nghỉ hưởng lương + nghỉ lễ';
