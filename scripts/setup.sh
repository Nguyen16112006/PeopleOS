#!/usr/bin/env bash
# =====================================================================
# PeopleOS - cài đặt một lệnh: tạo .env, build, khởi chạy, nạp dữ liệu mẫu
# Dùng: ./scripts/setup.sh            (khởi chạy toàn bộ)
#       ./scripts/setup.sh --no-ai    (bỏ qua Ollama/Qdrant/RAG - máy yếu)
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/../infrastructure"

command -v docker >/dev/null || { echo "Cần cài Docker trước."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Cần Docker Compose v2 (lệnh 'docker compose')."; exit 1; }

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ">> Đã tạo infrastructure/.env từ .env.example (hãy đổi mật khẩu trước khi triển khai thật)"
fi

SERVICES=()
if [[ "${1:-}" == "--no-ai" ]]; then
  SERVICES=(postgres keycloak hasura minio minio-init nats n8n apisix bff frontend clamav autoheal backup-postgres backup-minio)
  echo ">> Chế độ --no-ai: không chạy ollama, qdrant, rag-service (trang Trợ lý AI sẽ báo lỗi kết nối)"
fi

echo ">> Build và khởi chạy các dịch vụ (lần đầu mất vài phút)..."
docker compose up -d --build "${SERVICES[@]}"

echo ">> Chờ Hasura áp dụng migration/metadata..."
../scripts/init-db.sh

echo ">> Nạp dữ liệu mẫu..."
../scripts/seed-data.sh

cat <<'MSG'

==================== PeopleOS đã sẵn sàng ====================
 People Workspace : http://localhost:3000
 Keycloak         : http://localhost:8080   (admin / admin_change_me)
 Hasura Console   : http://localhost:8081   (admin secret trong .env)
 MinIO Console    : http://localhost:9001
 n8n              : http://localhost:5678   (lần đầu: tạo tài khoản owner)
 API Gateway      : http://localhost:9080

 Tài khoản demo (mật khẩu chung: Peopleos@123)
   admin / hr / manager / employee / employee2

 Kiểm tra sức khỏe : ./infrastructure/monitoring/healthcheck.sh
 Lưu ý: Ollama đang tải mô hình AI ở nền (docker compose logs -f ollama-init).
=============================================================
MSG
