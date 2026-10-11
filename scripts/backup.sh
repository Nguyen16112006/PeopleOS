#!/usr/bin/env bash
# Sao lưu NGAY: PostgreSQL (peopleos, keycloak, n8n) -> backups/postgres/*.dump
# (Định kỳ đã có container backup-postgres và backup-minio tự chạy; script này để sao lưu thủ công trước khi nâng cấp.)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/infrastructure"
[[ -f .env ]] && set -a && source .env && set +a
DB_USER="${POSTGRES_USER:-peopleos}"; DB_MAIN="${POSTGRES_DB:-peopleos}"
OUT="$ROOT/backups/postgres"; mkdir -p "$OUT"
ts=$(date +%Y%m%d-%H%M%S)
for db in "$DB_MAIN" keycloak n8n; do
  docker compose exec -T postgres pg_dump -U "$DB_USER" -Fc "$db" > "$OUT/$db-$ts.dump"
  echo "OK  $OUT/$db-$ts.dump ($(du -h "$OUT/$db-$ts.dump" | cut -f1))"
done
