-- Xác minh chuỗi băm kiểm toán ngay trong PostgreSQL (dùng cho verify-backup.sh và kiểm tra thủ công).
-- Kết quả: số bản ghi HỎNG (0 = toàn vẹn). Công thức giống hệt trigger audit_chain_before_insert() và AuditService.verify().
WITH chk AS (
  SELECT seq, prev_hash, hash,
         lag(hash) OVER (ORDER BY seq) AS lag_hash,
         lag(seq)  OVER (ORDER BY seq) AS lag_seq,
         encode(digest(convert_to(concat_ws('|', seq::text, prev_hash, occurred_text, COALESCE(actor_id, ''), COALESCE(actor_role, ''),
                action, COALESCE(entity_type, ''), COALESCE(entity_id, ''), details), 'UTF8'), 'sha256'), 'hex') AS calc
    FROM audit_logs)
SELECT count(*) FILTER (WHERE calc <> hash
                           OR prev_hash <> COALESCE(lag_hash, repeat('0', 64))
                           OR seq <> COALESCE(lag_seq, 0) + 1) AS broken
  FROM chk;
