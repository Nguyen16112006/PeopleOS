-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- =====================================================================
-- Control plane của HR-PaaS: developer, API key, webhook, version schema, trường tùy chỉnh.
-- Toàn bộ nằm trong schema "platform" - KHÔNG cấp quyền cho hasura_app (Hasura không thấy các bảng này).
-- Service platform-api kết nối bằng role riêng có BYPASSRLS (RLS FORCE áp dụng cho cả owner).
-- =====================================================================
ALTER TABLE platform.tenants DROP CONSTRAINT tenants_status_check,
  ADD CONSTRAINT tenants_status_check CHECK (status IN ('provisioning','active','suspended','deleting','deleted','failed'));
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS keycloak_client_id text;
ALTER TABLE platform.tenants ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE platform.developers (
  id           uuid PRIMARY KEY,                       -- = claim sub của Keycloak realm peopleos-platform
  email        text NOT NULL UNIQUE,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform.developers (id, email, display_name)
VALUES ('00000000-0000-0000-0000-000000000000', 'system@peopleos.local', 'System (first-party)')
ON CONFLICT DO NOTHING;
ALTER TABLE platform.tenants
  ADD CONSTRAINT tenants_owner_fk FOREIGN KEY (owner_dev_id) REFERENCES platform.developers(id);
-- project 'failed'/'deleted' nhả tên để tạo lại
CREATE UNIQUE INDEX tenants_owner_name_uq ON platform.tenants (owner_dev_id, lower(name)) WHERE status NOT IN ('deleted','failed');

-- Trạng thái từng bước cấp phát (saga) để chạy lại an toàn và bù trừ khi lỗi
CREATE TABLE platform.provisioning_steps (
  tenant_id  uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  step       text NOT NULL,
  status     text NOT NULL CHECK (status IN ('done','failed','compensated')),
  error      text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, step)
);

-- API key: chỉ lưu prefix (hiển thị) + SHA-256; khóa đầy đủ chỉ trả một lần lúc tạo
CREATE TABLE platform.api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  name         text NOT NULL,
  prefix       text NOT NULL UNIQUE,
  key_hash     text NOT NULL,
  scope        text NOT NULL CHECK (scope IN ('read','write')),
  env          text NOT NULL CHECK (env IN ('sandbox','live')),
  consumer     text NOT NULL,                          -- tên Consumer trong APISIX
  created_by   uuid NOT NULL REFERENCES platform.developers(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);
CREATE INDEX api_keys_tenant_idx ON platform.api_keys (tenant_id) WHERE revoked_at IS NULL;

-- Phiên bản schema do developer định nghĩa (spec + DDL đã chạy) - có thể truy vết/rollback
CREATE TABLE platform.schema_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  version    integer NOT NULL,
  table_name text NOT NULL,
  action     text NOT NULL CHECK (action IN ('create_table','drop_table')),
  spec       jsonb NOT NULL,
  ddl        text NOT NULL,
  created_by uuid NOT NULL REFERENCES platform.developers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version)
);

-- Trường tùy chỉnh (custom fields) cho thực thể lõi: lưu trong cột jsonb "custom", KHÔNG cần DDL
CREATE TABLE platform.custom_field_defs (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  entity    text NOT NULL CHECK (entity IN ('employee')),
  key       text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  type      text NOT NULL CHECK (type IN ('string','number','boolean','date','enum')),
  required  boolean NOT NULL DEFAULT false,
  options   jsonb,                                     -- danh sách giá trị khi type = enum
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, entity, key)
);

-- Webhook
CREATE TABLE platform.webhook_endpoints (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  url        text NOT NULL,
  events     text[] NOT NULL CHECK (cardinality(events) > 0),
  secret_enc text NOT NULL,                            -- Fernet (khóa ở biến môi trường), không lưu rõ
  active     boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES platform.developers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_endpoints_tenant_idx ON platform.webhook_endpoints (tenant_id) WHERE active;

CREATE TABLE platform.webhook_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  endpoint_id     uuid NOT NULL REFERENCES platform.webhook_endpoints(id) ON DELETE CASCADE,
  event_id        text NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed','dead')),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_status     integer,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  UNIQUE (endpoint_id, event_id)                       -- cùng một sự kiện không tạo hai lượt giao
);
CREATE INDEX webhook_deliveries_due_idx ON platform.webhook_deliveries (next_attempt_at)
  WHERE status IN ('pending','failed');

-- ---- Custom fields trên employees --------------------------------------------------
ALTER TABLE employees ADD COLUMN custom jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(custom) = 'object');
CREATE INDEX employees_custom_gin ON employees USING gin (custom jsonb_path_ops);

-- Kiểm tra custom theo khai báo của tenant. SECURITY DEFINER vì hasura_app không đọc được schema platform.
CREATE OR REPLACE FUNCTION platform.validate_custom() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = platform, pg_temp AS $$
DECLARE
  ent text := TG_ARGV[0];
  k text; v jsonb; d record; ok boolean;
BEGIN
  -- Control plane đặt biến này (SET LOCAL) khi GỠ một trường để dọn dữ liệu cũ; Hasura không chạy được SQL tùy ý.
  IF current_setting('platform.skip_custom_validation', true) = 'on' THEN RETURN NEW; END IF;
  FOR k, v IN SELECT key, value FROM jsonb_each(NEW.custom) LOOP
    SELECT * INTO d FROM platform.custom_field_defs WHERE tenant_id = NEW.tenant_id AND entity = ent AND key = k;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Trường tùy chỉnh "%" chưa được khai báo', k USING ERRCODE = 'check_violation';
    END IF;
    IF v <> 'null'::jsonb THEN
      ok := CASE d.type
        WHEN 'string'  THEN jsonb_typeof(v) = 'string'
        WHEN 'number'  THEN jsonb_typeof(v) = 'number'
        WHEN 'boolean' THEN jsonb_typeof(v) = 'boolean'
        WHEN 'date'    THEN jsonb_typeof(v) = 'string' AND (v #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$'
        WHEN 'enum'    THEN jsonb_typeof(v) = 'string' AND d.options ? (v #>> '{}')
      END;
      IF NOT COALESCE(ok, false) THEN
        RAISE EXCEPTION 'Giá trị của trường "%" không đúng kiểu %', k, d.type USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;
  FOR d IN SELECT key FROM platform.custom_field_defs
            WHERE tenant_id = NEW.tenant_id AND entity = ent AND required LOOP
    IF NOT (NEW.custom ? d.key) OR NEW.custom -> d.key = 'null'::jsonb THEN
      RAISE EXCEPTION 'Thiếu trường tùy chỉnh bắt buộc "%"', d.key USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER employees_validate_custom BEFORE INSERT OR UPDATE OF custom ON employees
  FOR EACH ROW EXECUTE FUNCTION platform.validate_custom('employee');
