#!/usr/bin/env bash
# Khôi phục một CSDL từ bản sao lưu.  Dùng: ./scripts/restore.sh <tên-csdl> <đường-dẫn-file.dump> --yes
# CẢNH BÁO: xóa CSDL hiện tại rồi nạp lại từ file. Các dịch vụ dùng CSDL đó được dừng tạm rồi khởi động lại.
set -euo pipefail
DB="${1:-}"; FILE="${2:-}"; CONFIRM="${3:-}"
[[ -n "$DB" && -f "$FILE" ]] || { echo "Dùng: $0 <csdl: peopleos|keycloak|n8n> <file.dump> --yes"; exit 1; }
[[ "$CONFIRM" == "--yes" ]] || { echo "Thao tác này XÓA CSDL '$DB' hiện tại. Thêm --yes để xác nhận."; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT/infrastructure"
[[ -f .env ]] && set -a && source .env && set +a
DB_USER="${POSTGRES_USER:-peopleos}"
case "$DB" in
  keycloak) DEPS=(keycloak) ;;
  n8n)      DEPS=(n8n) ;;
  *)        DEPS=(hasura bff) ;;
esac
FILE_ABS="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"
echo ">> Dừng ${DEPS[*]}"; docker compose stop "${DEPS[@]}"
docker compose exec -T postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS \"$DB\";" -c "CREATE DATABASE \"$DB\";"
echo ">> Nạp lại từ $FILE_ABS"
docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$DB" --no-owner < "$FILE_ABS"
echo ">> Khởi động lại ${DEPS[*]}"; docker compose start "${DEPS[@]}"
echo "Hoàn tất khôi phục '$DB'."
