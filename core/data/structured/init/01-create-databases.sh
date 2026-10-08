#!/bin/bash
# Tạo thêm các CSDL cho Keycloak và n8n (CSDL ứng dụng đã được tạo bởi POSTGRES_DB).
# Script này chỉ chạy ở lần khởi tạo đầu tiên của volume PostgreSQL.
set -euo pipefail
for db in keycloak n8n; do
  echo ">> Tạo database: $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE $db"
done
