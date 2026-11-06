#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
# Chạy bộ kiểm thử cô lập đa tenant (tầng PostgreSQL / RLS).
#  - Mặc định: chạy trong container postgres của docker compose.
#  - Hoặc đặt PGHOST/PGUSER/PGPASSWORD/PGDATABASE để chạy bằng psql cục bộ.
set -euo pipefail
cd "$(dirname "$0")/.."
SQL=scripts/tests/tenant_isolation.sql

if [[ -n "${PGHOST:-}" ]]; then
  psql -v ON_ERROR_STOP=1 -f "$SQL"
else
  docker compose -f infrastructure/docker-compose.yml exec -T postgres \
    psql -U "${POSTGRES_USER:-peopleos}" -d "${POSTGRES_DB:-peopleos}" -v ON_ERROR_STOP=1 -f - < "$SQL"
fi
