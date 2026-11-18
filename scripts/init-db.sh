#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
# Đảm bảo CSDL đã có ĐỦ schema trước khi seed (Hasura CLI migrations tự áp dụng khi container khởi động).
# Image hasura cli-migrations-v3 áp hết migration + metadata rồi mới mở server, nên /healthz OK nghĩa là
# migration đã xong. Kiểm thêm bảng của migration đầu (public.employees) và migration 007 (platform.tenants):
# chỉ kiểm bảng đầu thì seed có thể chạy khi Hasura mới áp được một phần migration.
# Nếu sau ~2 phút chưa sẵn sàng, thử khởi động lại Hasura rồi báo lỗi kèm log.
set -euo pipefail
cd "$(dirname "$0")/../infrastructure"
DB_USER="${POSTGRES_USER:-peopleos}"; DB_NAME="${POSTGRES_DB:-peopleos}"
[[ -f .env ]] && set -a && source .env && set +a
DB_USER="${POSTGRES_USER:-$DB_USER}"; DB_NAME="${POSTGRES_DB:-$DB_NAME}"

hasura_ready() {
  docker compose exec -T hasura curl -fs http://127.0.0.1:8080/healthz >/dev/null 2>&1
}
has_schema() {
  docker compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -Atc \
    "select to_regclass('public.employees') is not null and to_regclass('platform.tenants') is not null" 2>/dev/null | grep -q t
}
for attempt in $(seq 1 60); do
  if hasura_ready && has_schema; then echo "   Schema đã sẵn sàng."; exit 0; fi
  if [[ $attempt -eq 30 ]]; then echo "   Chưa thấy đủ schema, khởi động lại Hasura..."; docker compose restart hasura >/dev/null; fi
  sleep 2
done
echo "!! Không thấy đủ schema. Xem log: docker compose logs hasura" >&2
exit 1
