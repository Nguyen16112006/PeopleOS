#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Sao lưu PostgreSQL định kỳ (chạy trong container backup-postgres).
# Mỗi lần: pg_dump -Fc cho từng CSDL -> /backups/postgres/<db>-<thời-gian>.dump; xóa bản cũ hơn BACKUP_RETENTION_DAYS ngày.
set -u
INTERVAL=$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))
RETENTION=${BACKUP_RETENTION_DAYS:-7}
DBS=${BACKUP_DATABASES:-"peopleos keycloak n8n"}
DIR=/backups/postgres
mkdir -p "$DIR"
echo "[backup-postgres] bắt đầu: mỗi ${BACKUP_INTERVAL_HOURS:-24} giờ, giữ ${RETENTION} ngày, CSDL: $DBS"
sleep 60   # chờ migration/seed ở lần khởi động đầu
while true; do
  ts=$(date +%Y%m%d-%H%M%S)
  for db in $DBS; do
    if pg_dump -Fc -d "$db" -f "$DIR/$db-$ts.dump.tmp"; then
      mv "$DIR/$db-$ts.dump.tmp" "$DIR/$db-$ts.dump"
      echo "[backup-postgres] $(date '+%F %T') OK  $db-$ts.dump ($(du -h "$DIR/$db-$ts.dump" | cut -f1))"
    else
      rm -f "$DIR/$db-$ts.dump.tmp"
      echo "[backup-postgres] $(date '+%F %T') LỖI khi sao lưu $db"
    fi
  done
  find "$DIR" -name '*.dump' -mtime +"$RETENTION" -delete
  date '+%F %T' > "$DIR/LAST_BACKUP"
  sleep "$INTERVAL"
done
