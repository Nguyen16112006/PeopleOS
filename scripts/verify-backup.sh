#!/usr/bin/env bash
# Kiểm chứng bản sao lưu CÓ KHÔI PHỤC ĐƯỢC: nạp bản mới nhất của CSDL chính vào CSDL tạm, đếm dữ liệu,
# và xác minh lại chuỗi băm kiểm toán, rồi xóa CSDL tạm. Không ảnh hưởng hệ thống đang chạy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT/infrastructure"
[[ -f .env ]] && set -a && source .env && set +a
DB_USER="${POSTGRES_USER:-peopleos}"; DB_MAIN="${POSTGRES_DB:-peopleos}"; TMP="restore_check"
LATEST=$(ls -1t "$ROOT"/backups/postgres/"$DB_MAIN"-*.dump 2>/dev/null | head -1 || true)
[[ -n "$LATEST" ]] || { echo "Chưa có bản sao lưu trong backups/postgres/. Chạy ./scripts/backup.sh trước."; exit 1; }
echo ">> Kiểm chứng: $LATEST"
PSQL=(docker compose exec -T postgres psql -U "$DB_USER" -v ON_ERROR_STOP=1 -At)
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $TMP;" -c "CREATE DATABASE $TMP;"
docker compose exec -T postgres pg_restore -U "$DB_USER" -d "$TMP" --no-owner < "$LATEST"
echo "-- số bản ghi sau khi khôi phục (employees | payrolls | audit_logs):"
"${PSQL[@]}" -d "$TMP" -c "SELECT (SELECT count(*) FROM employees) || ' | ' || (SELECT count(*) FROM payrolls) || ' | ' || (SELECT count(*) FROM audit_logs);"
BROKEN=$("${PSQL[@]}" -d "$TMP" -f - < "$ROOT/scripts/audit-verify.sql" | tail -1)
"${PSQL[@]}" -d postgres -c "DROP DATABASE $TMP;" >/dev/null
if [[ "$BROKEN" == "0" ]]; then echo "OK: bản sao lưu khôi phục được và chuỗi kiểm toán toàn vẹn."; else echo "CẢNH BÁO: chuỗi kiểm toán có $BROKEN bản ghi hỏng!"; exit 2; fi
