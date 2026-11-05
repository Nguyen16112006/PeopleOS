-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- Gỡ multi-tenancy nền tảng. Chạy SAU down của 1760000000008.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW public.%I RESET (security_invoker)', r.relname);
  END LOOP;

  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.relname);
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS tenant_id', r.relname);
  END LOOP;
END $$;

DROP SCHEMA IF EXISTS platform CASCADE;
-- Role hasura_app được giữ lại (có thể đang được dùng bởi kết nối); xóa tay nếu không cần:
--   REASSIGN OWNED BY hasura_app TO peopleos; DROP OWNED BY hasura_app; DROP ROLE hasura_app;
