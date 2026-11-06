-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- =====================================================================
-- Vá lỗ hổng tham chiếu chéo tenant: khóa ngoại của PostgreSQL bỏ qua RLS, nên nếu biết UUID của một dòng
-- thuộc tenant khác, tenant này vẫn tạo được bản ghi con trỏ tới nó.
-- Giải pháp: với mọi FK một cột trỏ vào <bảng>(id), thêm FK TỔNG HỢP (tenant_id, cột) -> <bảng>(tenant_id, id).
--  * GIỮ NGUYÊN FK cũ (không đổi tên/hành vi) để quan hệ trong metadata Hasura (foreign_key_constraint_on) không đổi.
--  * Hành vi xóa giữ nguyên: NO ACTION / CASCADE / SET NULL. Riêng SET NULL phải là SET NULL (cột) (PostgreSQL 15+),
--    nếu không FK tổng hợp sẽ cố đặt NULL cho cả tenant_id (NOT NULL).
-- =====================================================================
DO $$
DECLARE
  r record;
  del_action text;
  new_name text;
BEGIN
  -- (tenant_id, id) duy nhất trên mọi bảng được tham chiếu (bắt buộc để làm đích của FK tổng hợp)
  FOR r IN
    SELECT DISTINCT c.confrelid AS ref_oid, c.confrelid::regclass::text AS ref_tbl
      FROM pg_constraint c
     WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND array_length(c.conkey, 1) = 1
       AND (SELECT relnamespace FROM pg_class WHERE oid = c.confrelid) = 'public'::regnamespace   -- bỏ FK tenant_id -> platform.tenants
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1] AND a.attname = 'id')
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    new_name := r.ref_tbl || '_tenant_id_id_key';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = r.ref_oid AND conname = new_name) THEN
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I UNIQUE (tenant_id, id)', r.ref_tbl, new_name);
    END IF;
  END LOOP;

  FOR r IN
    SELECT c.conname, c.conrelid::regclass::text AS child, a.attname AS col, c.confrelid::regclass::text AS parent,
           c.confdeltype, c.confupdtype
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND array_length(c.conkey, 1) = 1
       AND (SELECT relnamespace FROM pg_class WHERE oid = c.confrelid) = 'public'::regnamespace   -- bỏ FK tenant_id -> platform.tenants
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attnum = c.confkey[1] AND a.attname = 'id')
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.confrelid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
  LOOP
    new_name := left(r.conname, 55) || '_tenant';
    CONTINUE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = new_name AND conrelid = r.child::regclass);
    del_action := CASE r.confdeltype
                    WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN format('SET NULL (%I)', r.col) WHEN 'd' THEN format('SET DEFAULT (%I)', r.col) END;
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (tenant_id, %I) REFERENCES %s (tenant_id, id) ON DELETE %s',
                   r.child, new_name, r.col, r.parent, del_action);
  END LOOP;
END $$;
