-- SPDX-License-Identifier: Apache-2.0
-- Copyright (c) 2026 PeopleOS contributors

-- Đo đếm sử dụng API theo tenant/ngày (APISIX http-logger -> platform-api /internal/usage).
-- Nằm trong schema platform: Hasura không thấy bảng này.
CREATE TABLE platform.usage_daily (
  tenant_id  uuid   NOT NULL REFERENCES platform.tenants(id),
  day        date   NOT NULL,
  requests   bigint NOT NULL DEFAULT 0,
  errors_4xx bigint NOT NULL DEFAULT 0,
  errors_5xx bigint NOT NULL DEFAULT 0,
  bytes_out  bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);
