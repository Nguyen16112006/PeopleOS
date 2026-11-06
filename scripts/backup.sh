#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
# Sao lưu NGAY: PostgreSQL (peopleos, keycloak) -> backups/postgres/*.dump
# (Định kỳ đã có container backup-postgres và backup-minio tự chạy; script này để sao lưu thủ công trước khi nâng cấp.)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/infrastructure"
[[ -f .env ]] && set -a && source .env && set +a
DB_USER="${POSTGRES_USER:-peopleos}"; DB_MAIN="${POSTGRES_DB:-peopleos}"
OUT="$ROOT/backups/postgres"; mkdir -p "$OUT"
ts=$(date +%Y%m%d-%H%M%S)
for db in "$DB_MAIN" keycloak; do
  docker compose exec -T postgres pg_dump -U "$DB_USER" -Fc "$db" > "$OUT/$db-$ts.dump"
  echo "OK  $OUT/$db-$ts.dump ($(du -h "$OUT/$db-$ts.dump" | cut -f1))"
done
