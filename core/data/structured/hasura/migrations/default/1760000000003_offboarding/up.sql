-- =====================================================================
-- PeopleOS - Migration 4: Quy trình nghỉ việc (offboarding)
-- Nghỉ việc: Nhân viên gửi đơn -> Quản lý xác nhận (hoặc Giám đốc với Quản lý/HR/Kế toán/Admin)
--   -> HR kiểm tra hợp đồng, thời gian báo trước -> bàn giao -> HR chốt công
--   -> Kế toán tính lương cuối -> Giám đốc duyệt -> Kế toán chi trả -> HR chấm dứt hợp đồng
--   -> tài khoản tự khóa vào ngày làm việc cuối. Hồ sơ được giữ lại, không xóa.
-- Công ty chấm dứt hợp đồng: Quản lý đề xuất -> HR thẩm định -> Giám đốc duyệt -> các bước còn lại như trên.
-- =====================================================================
CREATE TABLE IF NOT EXISTS offboarding_cases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('resignation','termination')),
  reason             text NOT NULL,
  proposed_last_day  date,
  last_working_day   date,
  stage              text NOT NULL CHECK (stage IN ('manager','director_confirm','hr_review','director_decision',
                       'handover','timesheet','final_payroll','director_payroll','payment','terminate','done','closed')),
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','rejected')),
  initiated_by       uuid REFERENCES employees(id) ON DELETE SET NULL,
  final_pay_amount   bigint CHECK (final_pay_amount >= 0),
  account_locked_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
-- Mỗi nhân viên chỉ có tối đa một hồ sơ nghỉ việc đang mở
CREATE UNIQUE INDEX IF NOT EXISTS uq_offboarding_one_open ON offboarding_cases(employee_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_offboarding_stage ON offboarding_cases(stage, status);
CREATE TRIGGER trg_offboarding_updated BEFORE UPDATE ON offboarding_cases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_audit_offboarding_cases AFTER INSERT OR UPDATE OR DELETE ON offboarding_cases
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
