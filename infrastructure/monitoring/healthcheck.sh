#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Kiểm tra nhanh tình trạng các dịch vụ PeopleOS (chạy trên máy host).
# Dùng: ./infrastructure/monitoring/healthcheck.sh
set -u
ok=0; fail=0
check() {
  local name="$1" url="$2" expect="${3:-200}"
  code=$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$url" || echo 000)
  if [[ "$code" == "$expect" ]]; then printf '  [ OK ] %-22s %s\n' "$name" "$url"; ok=$((ok+1))
  else printf '  [FAIL] %-22s %s (HTTP %s, mong đợi %s)\n' "$name" "$url" "$code" "$expect"; fail=$((fail+1)); fi
}
echo "== Tầng 1 - Open-Core =="
check "Keycloak (realm)"   "http://localhost:8080/realms/peopleos"
check "Hasura"             "http://localhost:8081/healthz"
check "MinIO"              "http://localhost:9000/minio/health/live"
check "n8n"                "http://localhost:5678/healthz"
check "NATS"               "http://localhost:8222/healthz"
check "Gateway (401=OK)"   "http://localhost:9080/api/me" 401
echo "== Tầng 2 - Ứng dụng & AI =="
check "People Workspace"   "http://localhost:3000"
check "Qdrant"             "http://localhost:6333/healthz"
check "Ollama"             "http://localhost:11434/api/tags"
echo "== An ninh & vận hành =="
check_container() {
  local name="$1" svc="$2"
  st=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "peopleos-$svc-1" 2>/dev/null || echo "không-có")
  if [[ "$st" == "healthy" || "$st" == "running" ]]; then printf '  [ OK ] %-22s %s\n' "$name" "$st"; ok=$((ok+1))
  else printf '  [FAIL] %-22s trạng thái: %s\n' "$name" "$st"; fail=$((fail+1)); fi
}
check_container "ClamAV (quét mã độc)" clamav
check_container "Autoheal (tự phục hồi)" autoheal
check_container "Sao lưu PostgreSQL" backup-postgres
check_container "Sao lưu MinIO" backup-minio
LAST="$(dirname "$0")/../../backups/postgres/LAST_BACKUP"
[[ -f "$LAST" ]] && echo "  Lần sao lưu PostgreSQL gần nhất: $(cat "$LAST")" || echo "  (chưa có bản sao lưu nào - lần đầu chờ ~1 phút sau khi khởi động)"
echo
echo "Kết quả: $ok OK, $fail lỗi"
[[ $fail -eq 0 ]]
