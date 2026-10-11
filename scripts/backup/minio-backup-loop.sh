#!/bin/sh
# Sao lưu các bucket MinIO định kỳ (chạy trong container backup-minio): mirror gia tăng sang /backups/minio/<bucket>.
set -u
INTERVAL=$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))
until mc alias set src http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "[backup-minio] chờ MinIO..."; sleep 5
done
sleep 90
while true; do
  for b in contracts payslips documents; do
    mkdir -p "/backups/minio/$b"
    if mc mirror --overwrite "src/$b" "/backups/minio/$b" >/dev/null 2>&1; then
      echo "[backup-minio] $(date '+%F %T') OK  bucket $b"
    else
      echo "[backup-minio] $(date '+%F %T') LỖI bucket $b"
    fi
  done
  date '+%F %T' > /backups/minio/LAST_BACKUP
  sleep "$INTERVAL"
done
