-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- Xác minh chuỗi băm kiểm toán ngay trong PostgreSQL (dùng cho verify-backup.sh và kiểm tra thủ công).
-- Mỗi tenant có chuỗi riêng (seq liên tục + prev_hash nối theo từng tenant).
-- Kết quả: tổng số bản ghi HỎNG trên mọi tenant (0 = toàn vẹn). Công thức giống hệt trigger
-- audit_chain_before_insert() và AuditService.verify().
-- Chạy bằng role owner/superuser (cần thấy mọi tenant); trong phiên Hasura chỉ thấy tenant của phiên.
WITH chk AS (
  SELECT tenant_id, seq, prev_hash, hash,
         lag(hash) OVER (PARTITION BY tenant_id ORDER BY seq) AS lag_hash,
         lag(seq)  OVER (PARTITION BY tenant_id ORDER BY seq) AS lag_seq,
         encode(digest(convert_to(concat_ws('|', seq::text, prev_hash, occurred_text, COALESCE(actor_id, ''), COALESCE(actor_role, ''),
                action, COALESCE(entity_type, ''), COALESCE(entity_id, ''), details), 'UTF8'), 'sha256'), 'hex') AS calc
    FROM audit_logs)
SELECT count(*) FILTER (WHERE calc <> hash
                           OR prev_hash <> COALESCE(lag_hash, repeat('0', 64))
                           OR seq <> COALESCE(lag_seq, 0) + 1) AS broken
  FROM chk;
