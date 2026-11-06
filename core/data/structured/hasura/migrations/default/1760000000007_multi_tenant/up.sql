-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- =====================================================================
-- Multi-tenancy nền tảng (pool model) cho PeopleOS HR-PaaS
-- Backfill toàn bộ dữ liệu hiện có vào tenant first-party.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id      text NOT NULL UNIQUE CHECK (short_id ~ '^[a-z][a-z0-9]{5,11}$'),
  name          text NOT NULL,
  owner_dev_id  uuid NOT NULL,
  tier          text NOT NULL DEFAULT 'pool' CHECK (tier IN ('pool','cell','dedicated')),
  cell_id       text NOT NULL DEFAULT 'cell-1',
  plan          text NOT NULL DEFAULT 'free',
  status        text NOT NULL DEFAULT 'provisioning'
                CHECK (status IN ('provisioning','active','suspended','deleting')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform.tenants (id, short_id, name, owner_dev_id, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'peopleos0', 'PeopleOS (first-party)',
        '00000000-0000-0000-0000-000000000000', 'active')
ON CONFLICT DO NOTHING;

-- Tenant hiện tại lấy từ session variable của Hasura (cùng cơ chế trigger audit đang dùng).
-- Thiếu biến => NULL => RLS không trả dòng nào (fail-closed).
CREATE OR REPLACE FUNCTION platform.current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  -- NULLIF(...,''): sau một transaction đã SET LOCAL, GUC trở về '' (không phải NULL) và ''::json sẽ nổ lỗi.
  SELECT NULLIF(NULLIF(current_setting('hasura.user', true), '')::json ->> 'x-hasura-tenant-id', '')::uuid
$$;

-- Role truy vấn của Hasura: KHÔNG phải superuser, KHÔNG bypass RLS.
-- (Superuser luôn bypass RLS, kể cả FORCE ROW LEVEL SECURITY.)
-- Mật khẩu đặt ngoài migration: ALTER ROLE hasura_app PASSWORD '...' (từ secret).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hasura_app') THEN
    CREATE ROLE hasura_app LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL '
                   'DEFAULT %L::uuid REFERENCES platform.tenants(id)',
                   r.relname, '00000000-0000-0000-0000-000000000001');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT platform.current_tenant()', r.relname);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', 'ix_' || r.relname || '_tenant', r.relname);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.relname);
    EXECUTE format('CREATE POLICY tenant_isolation ON public.%I '
                   'USING (tenant_id = platform.current_tenant()) '
                   'WITH CHECK (tenant_id = platform.current_tenant())', r.relname);
  END LOOP;

  -- View phải chạy với quyền người gọi, nếu không sẽ bypass RLS của bảng gốc (PostgreSQL 15+).
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', r.relname);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public, platform TO hasura_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hasura_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hasura_app;
GRANT EXECUTE ON FUNCTION platform.current_tenant() TO hasura_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hasura_app;

-- TODO sau migration: các UNIQUE hiện có phải thành (tenant_id, cột). Xem 1760000000008.
