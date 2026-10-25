#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Nạp dữ liệu mẫu (5 tài khoản demo, 6 nhân sự, hợp đồng, lương, BHXH, nghỉ phép, đề xuất...).
# Chạy lại được nhiều lần: seed.sql TRUNCATE dữ liệu cũ trước khi nạp.
# Tùy chọn: ./scripts/seed-data.sh --regenerate  để sinh lại seed.sql từ generate_seed.py
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED_DIR="$ROOT/core/data/structured/seed"
cd "$ROOT/infrastructure"
[[ -f .env ]] && set -a && source .env && set +a
DB_USER="${POSTGRES_USER:-peopleos}"; DB_NAME="${POSTGRES_DB:-peopleos}"

if [[ "${1:-}" == "--regenerate" ]]; then
  python3 "$SEED_DIR/generate_seed.py" > "$SEED_DIR/seed.sql"
  echo "   Đã sinh lại seed.sql"
fi
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -q -U "$DB_USER" -d "$DB_NAME" < "$SEED_DIR/seed.sql"
echo "   Đã nạp dữ liệu mẫu. Tài khoản: admin, hr, manager, employee, employee2 (mật khẩu: Peopleos@123)"
