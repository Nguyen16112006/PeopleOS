-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

DROP TRIGGER IF EXISTS employees_validate_custom ON employees;
DROP FUNCTION IF EXISTS platform.validate_custom();
DROP INDEX IF EXISTS employees_custom_gin;
ALTER TABLE employees DROP COLUMN IF EXISTS custom;
DROP TABLE IF EXISTS platform.webhook_deliveries, platform.webhook_endpoints, platform.custom_field_defs,
  platform.schema_versions, platform.api_keys, platform.provisioning_steps;
DROP INDEX IF EXISTS platform.tenants_owner_name_uq;
ALTER TABLE platform.tenants DROP CONSTRAINT IF EXISTS tenants_owner_fk;
DROP TABLE IF EXISTS platform.developers;
ALTER TABLE platform.tenants DROP COLUMN IF EXISTS deleted_at, DROP COLUMN IF EXISTS keycloak_client_id;
ALTER TABLE platform.tenants DROP CONSTRAINT tenants_status_check,
  ADD CONSTRAINT tenants_status_check CHECK (status IN ('provisioning','active','suspended','deleting'));
