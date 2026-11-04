-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint
            WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND conname LIKE '%\_tenant' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
  FOR r IN SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint
            WHERE contype = 'u' AND connamespace = 'public'::regnamespace AND conname LIKE '%\_tenant\_id\_id\_key' ESCAPE '\'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;
