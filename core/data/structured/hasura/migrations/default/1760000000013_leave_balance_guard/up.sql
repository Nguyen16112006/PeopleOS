-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors
--
-- Chống race condition khi duyệt nghỉ phép:
--  1. Trừ quỹ phép NGAY TRONG CSDL bằng trigger khi đơn chuyển sang approved (cùng giao dịch với UPDATE trạng thái).
--     Hai người duyệt cùng lúc: UPDATE thứ hai chờ khóa dòng rồi đánh giá lại WHERE status='pending' -> 0 dòng -> không trừ lần hai.
--  2. Ràng buộc used_days <= entitled_days: hai đơn tạo song song cùng qua bước kiểm tra số dư thì đơn duyệt sau bị CSDL từ chối
--     (toàn bộ giao dịch rollback, đơn vẫn pending).

-- Dữ liệu cũ đã vượt quỹ (nếu có) phải được HR xử lý trước; ràng buộc NOT VALID để không chặn migration, vẫn áp dụng cho dòng mới/sửa.
ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_used_within_entitled CHECK (used_days <= entitled_days) NOT VALID;
ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_non_negative CHECK (used_days >= 0 AND sick_days_used >= 0) NOT VALID;

CREATE OR REPLACE FUNCTION leave_apply_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  y smallint := EXTRACT(YEAR FROM NEW.start_date)::smallint;
BEGIN
  IF NEW.status <> 'approved' OR (TG_OP = 'UPDATE' AND OLD.status = 'approved') THEN
    RETURN NEW;
  END IF;
  IF NEW.leave_type = 'annual' THEN
    UPDATE leave_balances SET used_days = used_days + NEW.days WHERE employee_id = NEW.employee_id AND year = y;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không đủ ngày phép: nhân viên chưa có quỹ phép năm %', y USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.leave_type = 'sick' THEN
    UPDATE leave_balances SET sick_days_used = sick_days_used + NEW.days WHERE employee_id = NEW.employee_id AND year = y;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_leave_apply_balance
  AFTER INSERT OR UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION leave_apply_balance();
