#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
# Tạo CSDL riêng cho Keycloak (CSDL ứng dụng và Flowable dùng POSTGRES_DB).
# Script này chỉ chạy ở lần khởi tạo đầu tiên của volume PostgreSQL.
set -euo pipefail
echo ">> Tạo database: keycloak"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE keycloak"
