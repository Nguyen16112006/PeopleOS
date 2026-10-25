#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Đảm bảo CSDL đã có schema (Hasura CLI migrations tự áp dụng khi container khởi động).
# Nếu sau ~2 phút chưa có bảng, thử khởi động lại Hasura rồi báo lỗi kèm log.
set -euo pipefail
cd "$(dirname "$0")/../infrastructure"
DB_USER="${POSTGRES_USER:-peopleos}"; DB_NAME="${POSTGRES_DB:-peopleos}"
[[ -f .env ]] && set -a && source .env && set +a
DB_USER="${POSTGRES_USER:-$DB_USER}"; DB_NAME="${POSTGRES_DB:-$DB_NAME}"

has_schema() {
  docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -Atc \
    "select to_regclass('public.employees') is not null" 2>/dev/null | grep -q t
}
for attempt in $(seq 1 60); do
  if has_schema; then echo "   Schema đã sẵn sàng."; exit 0; fi
  if [[ $attempt -eq 30 ]]; then echo "   Chưa thấy schema, khởi động lại Hasura..."; docker compose restart hasura >/dev/null; fi
  sleep 2
done
echo "!! Không thấy schema. Xem log: docker compose logs hasura" >&2
exit 1
