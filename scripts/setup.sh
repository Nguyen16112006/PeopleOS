#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
# =====================================================================
# PeopleOS - cài đặt một lệnh: tạo .env, build, khởi chạy, nạp dữ liệu mẫu
# Dùng: ./scripts/setup.sh            (khởi chạy toàn bộ)
#       ./scripts/setup.sh --no-ai    (bỏ qua Ollama/Qdrant/RAG - máy yếu)
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/../infrastructure"

command -v docker >/dev/null || { echo "Cần cài Docker trước."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Cần Docker Compose v2 (lệnh 'docker compose')."; exit 1; }

# Sinh chuỗi ngẫu nhiên (hex, an toàn khi nhúng vào URL kết nối CSDL)
rand_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 16
  else python3 -c 'import secrets; print(secrets.token_hex(16))'; fi
}

if [[ ! -f .env ]]; then
  cp .env.example .env
  # Thay mật khẩu mặc định bằng giá trị ngẫu nhiên cho mỗi máy cài.
  # LƯU Ý: mật khẩu PostgreSQL chỉ có tác dụng ở lần khởi tạo đầu của volume CSDL; nếu đã có volume cũ
  # (docker compose down -v để xóa) hãy giữ nguyên .env cũ, đừng xóa nó.
  for key in POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD HASURA_ADMIN_SECRET MINIO_ROOT_PASSWORD INTERNAL_API_KEY; do
    sed -i.bak "s|^${key}=.*|${key}=$(rand_hex)|" .env
  done
  rm -f .env.bak
  echo ">> Đã tạo infrastructure/.env với mật khẩu ngẫu nhiên (xem trong tệp này; tệp đã nằm trong .gitignore)"
fi
KC_ADMIN_USER="$(grep -E '^KEYCLOAK_ADMIN=' .env | cut -d= -f2-)"
KC_ADMIN_PASS="$(grep -E '^KEYCLOAK_ADMIN_PASSWORD=' .env | cut -d= -f2-)"

SERVICES=()
if [[ "${1:-}" == "--no-ai" ]]; then
  SERVICES=(postgres keycloak hasura minio minio-init nats flowable apisix bff frontend clamav autoheal backup-postgres backup-minio)
  echo ">> Chế độ --no-ai: không chạy ollama, qdrant, rag-service (trang Trợ lý AI sẽ báo lỗi kết nối)"
fi

echo ">> Build và khởi chạy các dịch vụ (lần đầu mất vài phút)..."
docker compose up -d --build "${SERVICES[@]}"

echo ">> Chờ Hasura áp dụng migration/metadata..."
../scripts/init-db.sh

echo ">> Nạp dữ liệu mẫu..."
../scripts/seed-data.sh

cat <<MSG

==================== PeopleOS đã sẵn sàng ====================
 People Workspace : http://localhost:3000
 Keycloak         : http://localhost:8080   (${KC_ADMIN_USER:-admin} / ${KC_ADMIN_PASS})
 Hasura Console   : http://localhost:8081   (admin secret trong .env)
 MinIO Console    : http://localhost:9001
 API Gateway      : http://localhost:9080
 Flowable         : dịch vụ BPMN nội bộ (không publish cổng host)

 Tài khoản demo (mật khẩu chung: Peopleos@123)
   admin / hr / manager / employee / employee2

 Kiểm tra sức khỏe : ./infrastructure/monitoring/healthcheck.sh
 Lưu ý: Ollama đang tải mô hình AI ở nền (docker compose logs -f ollama-init).
=============================================================
MSG
