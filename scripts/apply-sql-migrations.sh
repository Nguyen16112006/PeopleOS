#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
# Áp migration SQL của Hasura bằng role OWNER qua psql, có sổ cái ops.sql_migrations (idempotent).
# Dùng cho Kubernetes/CI/production, nơi Hasura chạy bằng role hasura_app (NOSUPERUSER) nên KHÔNG tự áp được DDL.
#
#   DATABASE_URL=postgresql://owner:pw@host/db  [HASURA_APP_PASSWORD=...]  scripts/apply-sql-migrations.sh [--baseline <version>]
#
#   --baseline V : DB đã được áp trước đó (vd. bằng Hasura CLI) tới phiên bản V: chỉ ghi sổ cái, không chạy lại.
# Mỗi migration chạy trong MỘT transaction cùng với dòng ghi sổ cái: hoặc áp trọn vẹn, hoặc không gì cả.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="${MIGRATIONS_DIR:-core/data/structured/hasura/migrations/default}"
: "${DATABASE_URL:?Đặt DATABASE_URL (role owner)}"
BASELINE=""
if [[ "${1:-}" == "--baseline" ]]; then BASELINE="${2:?thiếu phiên bản}"; fi
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"   # bớt NOTICE
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" <<'SQL'
CREATE SCHEMA IF NOT EXISTS ops;
CREATE TABLE IF NOT EXISTS ops.sql_migrations (
  version text PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now(), baseline boolean NOT NULL DEFAULT false);
SQL

applied=0; skipped=0
for d in $(ls "$DIR" | sort); do
  version="${d%%_*}"
  if [[ -n "$("${PSQL[@]}" -At -c "SELECT 1 FROM ops.sql_migrations WHERE version = '$version'")" ]]; then skipped=$((skipped+1)); continue; fi
  if [[ -n "$BASELINE" && "$version" -le "$BASELINE" ]]; then
    "${PSQL[@]}" -c "INSERT INTO ops.sql_migrations (version, name, baseline) VALUES ('$version', '$d', true)"
    echo "baseline  $d"; continue
  fi
  "${PSQL[@]}" --single-transaction -f "$DIR/$d/up.sql" \
    -c "INSERT INTO ops.sql_migrations (version, name) VALUES ('$version', '$d')" >/dev/null
  echo "applied   $d"; applied=$((applied+1))
done
echo "Xong: $applied migration mới, $skipped đã áp trước đó."

# Mật khẩu role truy vấn của Hasura (không để trong migration)
if [[ -n "${HASURA_APP_PASSWORD:-}" ]]; then
  "${PSQL[@]}" -v pw="$HASURA_APP_PASSWORD" <<'SQL'
ALTER ROLE hasura_app PASSWORD :'pw';
SQL
  echo "Đã đặt mật khẩu cho role hasura_app."
fi
