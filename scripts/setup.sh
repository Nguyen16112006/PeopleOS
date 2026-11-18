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
# Bí mật PaaS: bổ sung nếu thiếu/để trống/còn giá trị mẫu (không ảnh hưởng volume, an toàn khi chạy lại)
rand_hex32() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32
  else python3 -c 'import secrets; print(secrets.token_hex(32))'; fi
}
ensure_secret() {   # $1 = tên biến
  local cur; cur="$(grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true)"
  if [[ -z "$cur" || "$cur" == *change_me* ]]; then
    if grep -qE "^$1=" .env; then sed -i.bak "s|^$1=.*|$1=$(rand_hex32)|" .env; rm -f .env.bak
    else echo "$1=$(rand_hex32)" >> .env; fi
    echo ">> Đã sinh $1 ngẫu nhiên"
  fi
}
ensure_secret EVENT_DISPATCHER_SECRET
ensure_secret APISIX_ADMIN_KEY
if ! grep -qE '^PLATFORM_SECRET_KEY=.+' .env; then   # khóa Fernet: base64 urlsafe của 32 byte
  KEY="$(python3 -c 'import base64,secrets;print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())' 2>/dev/null \
        || openssl rand -base64 32 | tr '+/' '-_')"
  sed -i.bak '/^PLATFORM_SECRET_KEY=/d' .env; rm -f .env.bak; echo "PLATFORM_SECRET_KEY=$KEY" >> .env
  echo ">> Đã sinh PLATFORM_SECRET_KEY"
fi

# .env có sẵn (vd copy tay từ .env.example) mà vẫn còn mật khẩu mẫu công khai trong repo -> cảnh báo to.
# Không tự đổi vì mật khẩu PostgreSQL/Keycloak chỉ áp dụng ở lần khởi tạo volume đầu tiên.
WEAK="$(grep -E '^(POSTGRES_PASSWORD|KEYCLOAK_ADMIN_PASSWORD|HASURA_ADMIN_SECRET|MINIO_ROOT_PASSWORD|INTERNAL_API_KEY)=' .env \
        | grep -E '=(peopleos_pg_pass|admin_change_me|hasura_admin_secret_change_me|peopleos_minio_secret|internal_key_change_me)$' \
        | cut -d= -f1 || true)"
if [[ -n "$WEAK" ]]; then
  echo "!! CẢNH BÁO: infrastructure/.env còn mật khẩu MẪU công khai trong repo: $(echo $WEAK)"
  echo "   Môi trường thật: xóa volume (docker compose down -v) rồi xóa .env và chạy lại setup.sh để sinh mật khẩu mới."
  [[ "${PEOPLEOS_ALLOW_DEFAULT_SECRETS:-}" == "1" ]] || { echo "   (Đặt PEOPLEOS_ALLOW_DEFAULT_SECRETS=1 để bỏ qua khi chỉ demo cục bộ.)"; exit 1; }
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

echo ">> Chờ Keycloak sẵn sàng và đảm bảo token có claim tenant_id..."
for _ in $(seq 1 90); do
  curl -fs http://localhost:8080/realms/peopleos >/dev/null 2>&1 && break
  sleep 2
done
# Bootstrap idempotent: bổ sung thuộc tính/mapper tenant_id nếu realm còn thiếu (an toàn khi chạy lại)
export KEYCLOAK_URL=http://localhost:8080 KEYCLOAK_ADMIN_PASSWORD="$KC_ADMIN_PASS"
[[ -n "$KC_ADMIN_USER" ]] && export KEYCLOAK_ADMIN="$KC_ADMIN_USER"
if command -v python3 >/dev/null 2>&1 && python3 --version >/dev/null 2>&1; then
  (cd .. && python3 scripts/keycloak-paas-bootstrap.py) || echo "!! Bootstrap Keycloak lỗi (xem thông báo trên)"
elif command -v python >/dev/null 2>&1 && python --version >/dev/null 2>&1; then
  (cd .. && python scripts/keycloak-paas-bootstrap.py) || echo "!! Bootstrap Keycloak lỗi (xem thông báo trên)"
else
  KC_NET="$(docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$(docker compose ps -q keycloak)")"
  MSYS_NO_PATHCONV=1 docker run --rm --network "$KC_NET" -v "$(cd .. && pwd -W 2>/dev/null || (cd .. && pwd)):/w" -w /w \
    -e KEYCLOAK_URL=http://keycloak:8080 -e KEYCLOAK_ADMIN="${KC_ADMIN_USER:-admin}" -e KEYCLOAK_ADMIN_PASSWORD="$KC_ADMIN_PASS" \
    python:3.12-slim python scripts/keycloak-paas-bootstrap.py || echo "!! Bootstrap Keycloak lỗi (xem thông báo trên)"
fi
# Kiểm tra thật: lấy token của user demo và xác nhận có claim tenant_id
TOKEN_JSON="$(curl -fs -X POST http://localhost:8080/realms/peopleos/protocol/openid-connect/token \
  -d grant_type=password -d client_id=people-workspace -d username=hr -d password='Peopleos@123' || true)"
if echo "$TOKEN_JSON" | grep -q access_token; then
  PAYLOAD="$(echo "$TOKEN_JSON" | sed -E 's/.*"access_token":"[^."]+\.([^."]+)\..*/\1/' | tr '_-' '/+')"
  PAYLOAD="$PAYLOAD$(printf '%*s' $(( (4 - ${#PAYLOAD} % 4) % 4 )) '' | tr ' ' '=')"
  CLAIMS="$(echo "$PAYLOAD" | base64 -d 2>/dev/null || true)"
  if echo "$CLAIMS" | grep -q tenant_id; then echo "   Token có tenant_id: OK"
  else echo "!! Token vẫn THIẾU tenant_id - giao diện sẽ báo lỗi JWT claim. Xem docs/paas/README.md"; fi
  # Keycloak 25+: claim sub nằm trong client scope "basic"; thiếu thì Hasura báo "x-hasura-user-id not found"
  if echo "$CLAIMS" | grep -q '"sub"'; then echo "   Token có sub: OK"
  else echo "!! Token THIẾU sub - giao diện sẽ báo 'x-hasura-user-id not found'. Chạy lại: python scripts/keycloak-paas-bootstrap.py"; fi
else
  echo "!! Không lấy được token thử (Keycloak chưa sẵn sàng?)"
fi

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
   admin / hr / manager / director / accountant / employee / employee2

 Kiểm tra sức khỏe : ./infrastructure/monitoring/healthcheck.sh
 Lưu ý: Ollama đang tải mô hình AI ở nền (docker compose logs -f ollama-init).
=============================================================
MSG