#!/bin/sh
# Khởi tạo các bucket lưu dữ liệu phi cấu trúc trong MinIO.
set -e
until mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "Chờ MinIO sẵn sàng..."; sleep 2
done
for b in contracts payslips documents; do
  mc mb --ignore-existing "local/$b"
  mc anonymous set none "local/$b" >/dev/null 2>&1 || true
done
echo "MinIO buckets: contracts, payslips, documents - OK"
