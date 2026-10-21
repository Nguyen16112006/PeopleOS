-- =====================================================================
-- PeopleOS - Migration 3: mô hình 6 vai trò
--   employee, manager, hr, director (Giám đốc), accountant (Kế toán), sysadmin (Admin kỹ thuật)
-- Quy ước: mỗi người một vai trò chính; cấu trúc quản lý một tầng
--   (nhân viên -> manager -> director; hr/accountant/admin báo cáo director).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mở rộng danh sách vai trò
-- ---------------------------------------------------------------------
-- Lưu ý bảo mật: KHÔNG dùng tên 'admin' cho vai trò quản trị kỹ thuật vì Hasura coi 'admin' là siêu quyền
-- (bỏ qua mọi phân quyền). Vai trò quản trị kỹ thuật tên là 'sysadmin'.
-- Dữ liệu cũ: user 'admin' trong hệ thống cũ chính là Giám đốc -> chuyển thành 'director'.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'director' WHERE role = 'admin';
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('employee','manager','hr','director','accountant','sysadmin'));

ALTER TABLE onboarding_tasks DROP CONSTRAINT IF EXISTS onboarding_tasks_assignee_role_check;
UPDATE onboarding_tasks SET assignee_role = 'sysadmin' WHERE assignee_role = 'admin';
ALTER TABLE onboarding_tasks ADD CONSTRAINT onboarding_tasks_assignee_role_check
  CHECK (assignee_role IN ('employee','manager','hr','director','accountant','sysadmin'));

-- ---------------------------------------------------------------------
-- 2. Đề xuất lương/thưởng/thăng chức:
--    Quản lý đề xuất -> HR thẩm định -> Kế toán kiểm ngân sách -> Giám đốc duyệt cuối
--    (trước đây: HR -> admin). Dữ liệu cũ: 'admin' trong chuỗi duyệt chính là Giám đốc.
-- ---------------------------------------------------------------------
ALTER TABLE approval_steps DROP CONSTRAINT IF EXISTS approval_steps_approver_role_check;
UPDATE approval_steps SET approver_role = 'director' WHERE approver_role = 'admin';
ALTER TABLE approval_steps ADD CONSTRAINT approval_steps_approver_role_check
  CHECK (approver_role IN ('hr','accountant','director'));

ALTER TABLE salary_proposals DROP CONSTRAINT IF EXISTS salary_proposals_status_check;
UPDATE salary_proposals SET status = 'pending_director' WHERE status = 'pending_admin';
ALTER TABLE salary_proposals ADD CONSTRAINT salary_proposals_status_check
  CHECK (status IN ('pending_hr','pending_accountant','pending_director','approved','rejected'));

-- Đề xuất cũ chỉ có 2 bước (hr, director); thêm bước kế toán cho đề xuất đang chờ để thống nhất chuỗi mới.
-- Bước kế toán chen giữa: dời bước director thành step_order 3 rồi thêm step 2.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT id FROM salary_proposals WHERE status IN ('pending_hr','pending_director') LOOP
    UPDATE approval_steps SET step_order = 3 WHERE proposal_id = p.id AND approver_role = 'director';
    INSERT INTO approval_steps (proposal_id, step_order, approver_role, status)
    SELECT p.id, 2, 'accountant', 'waiting'
    WHERE NOT EXISTS (SELECT 1 FROM approval_steps WHERE proposal_id = p.id AND step_order = 2);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. Nghỉ phép: theo dõi giai đoạn duyệt
--    Nhân viên: manager duyệt -> báo HR chỉnh công.
--    Manager/Kế toán/Admin: HR kiểm tra ngày phép -> Giám đốc duyệt.
--    HR: Giám đốc duyệt trực tiếp.
-- ---------------------------------------------------------------------
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'manager'
  CHECK (stage IN ('manager','hr','director','done'));
UPDATE leave_requests SET stage = 'done' WHERE status <> 'pending';
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS hr_adjusted_at timestamptz;

-- ---------------------------------------------------------------------
-- 4. Nhật ký các bước duyệt dùng chung cho các quy trình mới
--    (tạm ứng/chi phí, cấp quyền tạm thời, nghỉ việc...)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS approval_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_type    text NOT NULL,                         -- advance | temp_access | leave | offboarding ...
  ref_id      uuid NOT NULL,
  stage       text NOT NULL,                         -- manager | hr | accountant | director | director_l2 | data_owner
  actor_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  decision    text NOT NULL CHECK (decision IN ('approved','rejected','returned')),
  comment     text,
  decided_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_events_ref ON approval_events(ref_type, ref_id);

-- ---------------------------------------------------------------------
-- 5. Tạm ứng / hoàn ứng / thanh toán chi phí
--    Nhân viên -> Quản lý (cấp 1) -> [Giám đốc cấp 2 nếu > ngưỡng] -> Kế toán kiểm tra, chi -> hoàn ứng
--    Người gửi là manager/hr/accountant/admin: Giám đốc duyệt cấp 1 thay Quản lý.
--    Ngưỡng cấp 2 mặc định 20.000.000 VND, cấu hình ở bảng app_settings.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings (key, value) VALUES ('advance_level2_threshold_vnd', '20000000')
  ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS advance_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  request_type  text NOT NULL CHECK (request_type IN ('advance','expense')),
  amount        bigint NOT NULL CHECK (amount > 0),
  reason        text NOT NULL,
  receipt_keys  text[] NOT NULL DEFAULT '{}',        -- chứng từ lưu ở MinIO
  stage         text NOT NULL DEFAULT 'manager'
                  CHECK (stage IN ('manager','director','accountant','director_l2','paid','settled','closed')),
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled')),
  paid_at       timestamptz,
  settled_amount bigint,                              -- số tiền hoàn ứng đã đối chiếu (chỉ với advance)
  settled_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_advance_employee ON advance_requests(employee_id, created_at DESC);
CREATE TRIGGER trg_advance_updated BEFORE UPDATE ON advance_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- 6. Cấp quyền tạm thời (Admin xử lý sự cố)
--    Admin tạo yêu cầu -> chủ sở hữu dữ liệu (hr/accountant) VÀ Giám đốc cùng duyệt
--    -> cấp quyền, tự thu hồi khi hết hạn. Mọi thao tác ghi audit log.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS temp_access_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id          uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  scope                 text NOT NULL,                -- ví dụ: payrolls, employees, contracts
  data_owner_role       text NOT NULL CHECK (data_owner_role IN ('hr','accountant')),
  reason                text NOT NULL,
  duration_minutes      integer NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440),
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','expired','revoked')),
  owner_approver_id     uuid REFERENCES employees(id) ON DELETE SET NULL,
  owner_approved_at     timestamptz,
  director_approver_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  director_approved_at  timestamptz,
  granted_at            timestamptz,
  expires_at            timestamptz,
  revoked_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_temp_access_status ON temp_access_requests(status, expires_at);

-- Chặn tự duyệt: người duyệt không được trùng người yêu cầu.
CREATE OR REPLACE FUNCTION temp_access_no_self_approval() RETURNS trigger AS $$
BEGIN
  IF NEW.owner_approver_id = NEW.requester_id OR NEW.director_approver_id = NEW.requester_id THEN
    RAISE EXCEPTION 'Không được tự duyệt yêu cầu cấp quyền của chính mình';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_temp_access_no_self BEFORE INSERT OR UPDATE ON temp_access_requests
  FOR EACH ROW EXECUTE FUNCTION temp_access_no_self_approval();

-- ---------------------------------------------------------------------
-- 7. Ghi nhật ký kiểm toán cho các bảng mới
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_audit_advance_requests    AFTER INSERT OR UPDATE OR DELETE ON advance_requests    FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_temp_access         AFTER INSERT OR UPDATE OR DELETE ON temp_access_requests FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_approval_events     AFTER INSERT OR UPDATE OR DELETE ON approval_events      FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_app_settings        AFTER INSERT OR UPDATE OR DELETE ON app_settings         FOR EACH ROW EXECUTE FUNCTION audit_row_change();
