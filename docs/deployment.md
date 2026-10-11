# Hướng dẫn triển khai

## 1. Yêu cầu

| Hạng mục | Tối thiểu | Khuyến nghị |
|---|---|---|
| Docker | 24+ với Compose v2 | mới nhất |
| RAM | 8 GB (chạy `--no-ai`, ClamAV dùng ~1-2 GB) | 16 GB (kèm Ollama + mô hình 3B) |
| Ổ đĩa | 10 GB | 20 GB (mô hình AI ~3 GB) |
| Cổng rảnh | 3000, 5678, 8080, 8081, 9000, 9001, 9080, 4222, 8222, 6333, 11434 | |

## 2. Chạy nhanh (khuyến nghị)

```bash
cp infrastructure/.env.example infrastructure/.env   # sửa mật khẩu nếu muốn
./scripts/setup.sh              # đầy đủ, gồm AI
./scripts/setup.sh --no-ai      # máy yếu: bỏ Ollama/Qdrant/RAG
```

Script sẽ build, khởi chạy, chờ Hasura áp dụng schema và nạp dữ liệu mẫu.

## 3. Chạy thủ công bằng Docker Compose

```bash
cd infrastructure
cp .env.example .env
docker compose up -d --build
../scripts/init-db.sh        # chờ schema
../scripts/seed-data.sh      # nạp dữ liệu demo
../infrastructure/monitoring/healthcheck.sh
```

Lần đầu `docker compose up -d` cần vài phút để build `bff` (Maven tải thư viện Java, cần Internet; khoảng 3-6 phút), `frontend`, `rag-service` và tải image. Backend Java khởi động mất khoảng 10-20 giây sau khi container chạy. Container `ollama-init` tải mô hình
(`bge-m3` ≈ 1,2 GB, `qwen2.5:3b` ≈ 1,9 GB) ở nền; trong lúc chờ, trợ lý AI vẫn trả lời bằng đoạn trích từ kho tri thức.
Theo dõi: `docker compose logs -f ollama-init rag-service`.

### Thứ tự khởi động
`postgres` → `keycloak` (import realm) · `hasura` (migration + metadata) · `minio` → `minio-init` · `nats` → `n8n` (nhập 4 workflow) → `bff` → `apisix` → `frontend`.

## 4. Cổng và tài khoản

| Dịch vụ | URL | Đăng nhập |
|---|---|---|
| People Workspace | http://localhost:3000 | SSO: `admin`, `hr`, `manager`, `employee`, `employee2` / `Peopleos@123` |
| Keycloak | http://localhost:8080 | `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` |
| Hasura Console | http://localhost:8081 | `HASURA_ADMIN_SECRET` |
| MinIO Console | http://localhost:9001 | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` |
| n8n | http://localhost:5678 | lần đầu truy cập: tạo tài khoản owner (workflow vẫn chạy bình thường khi chưa tạo) |
| API Gateway | http://localhost:9080 | JWT Keycloak |

## 5. Phát triển

```bash
cd infrastructure
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d   # mở cổng BFF :8000, RAG :8001, hot reload
cd ../apps/people-workspace/frontend && cp .env.example .env && npm install && npm run dev   # http://localhost:5173
```

Khi chạy frontend ở cổng 5173, thêm `http://localhost:5173/*` vào *Valid redirect URIs / Web origins* của client `people-workspace` trong Keycloak
và thêm origin đó vào `allow_origins` trong `core/gateway/apisix.yaml` (rồi `docker compose restart apisix`).

Chạy test:

```bash
pip install pytest fastapi httpx qdrant-client langchain-text-splitters
(cd core/shared/python && PYTHONPATH=. python -m pytest tests)
(cd ai/rag-service && python -m pytest tests)
(cd apps/people-workspace/bff && mvn test)        # backend Java: cần JDK 21 + Maven
(cd apps/people-workspace/frontend && npx tsc -b)
```

## 6. Vận hành

| Việc | Lệnh |
|---|---|
| Xem log một dịch vụ | `docker compose logs -f bff` |
| Nạp lại dữ liệu mẫu | `./scripts/seed-data.sh` |
| Sinh lại seed từ mã | `./scripts/seed-data.sh --regenerate` |
| Nạp lại tri thức AI | `curl -X POST http://localhost:9080/ai/reindex -H "Authorization: Bearer $TOKEN"` |
| Dừng, giữ dữ liệu | `docker compose down` |
| Xóa sạch (kể cả dữ liệu) | `docker compose down -v` |
| Sao lưu CSDL | `docker compose exec -T postgres pg_dump -U peopleos peopleos > backup.sql` |

## 6b. An ninh và vận hành

| Việc | Lệnh |
|---|---|
| Sao lưu ngay | `./scripts/backup.sh` |
| Kiểm chứng sao lưu khôi phục được | `./scripts/verify-backup.sh` |
| Khôi phục | `./scripts/restore.sh peopleos backups/postgres/<file>.dump --yes` |
| Kiểm tra sức khỏe + ClamAV/autoheal/sao lưu | `./infrastructure/monitoring/healthcheck.sh` |
| Bật GitOps agent (Linux) | `HOST_REPO_PATH=/opt/peopleos docker compose --profile gitops up -d gitops-agent` |
| Xác minh chuỗi kiểm toán bằng SQL | `docker compose exec -T postgres psql -U peopleos -d peopleos -At < ../scripts/audit-verify.sql` (kết quả 0 = toàn vẹn) |

Bản sao lưu nằm ở `backups/` (đổi bằng `BACKUP_DIR`); chi tiết: [governance.md](governance.md).

## 7. Khắc phục sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| Đăng nhập xong báo 401 ở mọi API | URL Keycloak trình duyệt dùng khác `KEYCLOAK_PUBLIC_URL` → `iss` không khớp | Đặt `KEYCLOAK_PUBLIC_URL` đúng host rồi `docker compose up -d --force-recreate keycloak bff` và build lại frontend |
| Lỗi CORS trên trình duyệt | Origin frontend chưa nằm trong `allow_origins` của APISIX | Sửa `core/gateway/apisix.yaml`, `docker compose restart apisix` |
| Hasura báo "no such table" | Migration chưa chạy | `./scripts/init-db.sh`, xem `docker compose logs hasura` |
| Trang trống / không có dữ liệu | Chưa seed | `./scripts/seed-data.sh` |
| Thông báo realtime không tới | WebSocket bị chặn (proxy) hoặc NATS lỗi | Kiểm `GET /api/health` (trường `nats`), console trình duyệt tab Network → WS |
| Trợ lý AI trả "đoạn trích" thay vì câu trả lời | Ollama đang tải mô hình | Chờ `ollama-init` kết thúc; kiểm `GET /ai/health` |
| `ollama-init` lỗi tải mô hình | Không có Internet | Dùng `--no-ai` hoặc nạp mô hình thủ công: `docker compose exec ollama ollama pull bge-m3` |
| Build `bff` lỗi ở bước Maven | Mất mạng hoặc lỗi biên dịch (backend Java chưa được biên dịch đầy đủ trong môi trường phát triển) | `docker compose build bff` và gửi log lỗi; kiểm tra mạng tới repo.maven.apache.org |
| Tải hợp đồng lên báo 503 "quét mã độc chưa sẵn sàng" | ClamAV đang tải chữ ký lần đầu (vài phút) | Chờ `docker compose ps clamav` thành healthy; hoặc tạm đặt `CLAMAV_FAIL_OPEN=true` khi demo |
| Workflow n8n không chạy | Chưa kích hoạt | Mở n8n, bật công tắc Active; hoặc `docker compose restart n8n` |

## 8. Chuyển sang production (bắt buộc rà soát)

1. Đổi **mọi** mật khẩu/secret trong `.env`; không dùng giá trị mẫu. Xóa hoặc đổi mật khẩu 5 tài khoản demo và gán lại bằng quy trình thật.
2. Keycloak: dùng `start` (không phải `start-dev`), bật HTTPS và hostname chuẩn, cấu hình SMTP; đặt `KEYCLOAK_PUBLIC_URL` là URL HTTPS.
3. Đặt reverse proxy TLS trước APISIX, frontend và Keycloak; cập nhật `allow_origins` và biến `VITE_*`/`WS_URL` sang `https`/`wss`.
4. Đóng các cổng quản trị (Hasura Console, MinIO Console, n8n, PostgreSQL, NATS monitor, Qdrant, Ollama); tắt `HASURA_GRAPHQL_DEV_MODE` và `ENABLE_CONSOLE`.
5. Sao lưu định kỳ PostgreSQL và MinIO; cấu hình tài nguyên (resource limits) cho từng container.
6. Cân nhắc quản lý secret bằng Docker secrets/Vault và theo dõi bằng Prometheus/Grafana (APISIX và NATS đều có exporter).
