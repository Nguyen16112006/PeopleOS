# Danh sách kiểm tra trước buổi demo / chấm điểm

Mục tiêu: **không có bất ngờ lúc trình diễn**. Hệ thống gồm nhiều dịch vụ (Keycloak, APISIX, Hasura, PostgreSQL, MinIO, NATS, Flowable, AI...), nên
hãy diễn tập trọn vẹn *trên máy sạch* ít nhất **hai lần** trước ngày chấm. Các lệnh dưới đây giống nhau trên Windows (PowerShell/CMD), Linux, macOS.

## 1. Chuẩn bị (ít nhất 3 ngày trước)
- [ ] `python scripts/preflight.py --paas --check-images` → 0 lỗi. Tag image không tồn tại thì đặt `OLLAMA_IMAGE` / `MINIO_IMAGE` trong `infrastructure/.env`.
- [ ] CI trên GitHub xanh (đặc biệt job `backend-java`: lần đầu build Maven đầy đủ, chạy `TenantContextTest`). Sửa mọi lỗi biên dịch **trước** ngày chấm.
- [ ] Tạo tag và release: `python scripts/make-release.py` → tải `dist/PeopleOS-<phiên bản>.tar.gz` + `SHA256SUMS` lên GitHub Releases (không dùng `.zip`).
- [ ] Chụp ảnh theo `docs/screenshots/README.md`; quay **video dự phòng** 5-8 phút luồng chính.

## 2. Diễn tập trên máy sạch (lặp lại 2 lần)
```bash
git clone <repo> && cd PeopleOS
python scripts/preflight.py --paas
cp infrastructure/.env.example infrastructure/.env      # thêm PLATFORM_SECRET_KEY, EVENT_DISPATCHER_SECRET (.env.paas.example)
docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.paas.yml up -d --build
python scripts/keycloak-paas-bootstrap.py               # một lần; chạy lại vô hại
python scripts/smoke-paas.py                            # đầu-cuối: phải báo "12/12 bước đạt"
```
Webhook trong smoke cần `ALLOW_PRIVATE_WEBHOOKS=true` và `ALLOW_HTTP_WEBHOOKS=true` trong `.env` (rồi `up -d` lại).
Bỏ qua bước webhook: `SKIP_WEBHOOK=1 python scripts/smoke-paas.py` (PowerShell: `$env:SKIP_WEBHOOK=1; python scripts/smoke-paas.py`).
- [ ] Ghi lại **thời gian khởi động** từ `up` tới khi dùng được (để canh lịch demo) và bộ nhớ đã dùng (`docker stats --no-stream`).
- [ ] `python scripts/seed...`/`./scripts/seed-data.sh` nạp dữ liệu demo; đăng nhập đủ 7 tài khoản (xem README mục tài khoản demo).
- [ ] `scripts/test-tenant-isolation.sh` → "Tất cả ca bắt buộc đạt" (dùng làm màn hình minh họa cô lập dữ liệu).

## 3. Máy yếu
- Tắt dịch vụ AI khi không demo AI: `docker compose stop ollama qdrant rag-service`; đóng trình duyệt/ứng dụng nặng.
- Nếu cần AI: dùng `qwen2.5:1.5b` (mặc định, Apache-2.0). **Không** dùng `qwen2.5:3b` (Qwen Research License, phi thương mại).
- Tải sẵn image và mô hình **khi có mạng tốt** (`docker compose pull`, `docker compose up -d ollama` rồi đợi tải mô hình); đừng tải lúc đang trình diễn.

## 4. Giờ G
- [ ] Bật Docker, `docker compose ... up -d`, chạy `python scripts/smoke-paas.py` ít nhất **30 phút** trước khi bắt đầu.
- [ ] Mở sẵn các tab: Developer Portal (`:3100`), People Workspace (`:3000`), Keycloak, terminal (preflight/smoke/isolation).
- [ ] Đăng nhập sẵn các vai trò cần dùng ở cửa sổ ẩn danh riêng.
- [ ] Mở sẵn video dự phòng và bộ ảnh chụp.

## 5. Nếu có sự cố
| Sự cố | Cách xử lý nhanh |
|---|---|
| Một dịch vụ không lên | `docker compose logs <dịch vụ> --tail 50`; `docker compose restart <dịch vụ>` |
| Hasura báo thiếu claim `x-hasura-tenant-id` / token bị từ chối (403 "thiếu tenant_id") | Chạy `python scripts/keycloak-paas-bootstrap.py`, rồi đăng xuất và đăng nhập lại; user mới cần được gán thuộc tính `tenant_id` |
| API key vừa tạo báo 401 | Đợi 1-3 giây để Consumer lan truyền qua etcd; kiểm tra `apisix-bootstrap` đã chạy xong |
| Hết RAM, máy treo | Tắt AI (mục 3); chuyển sang video dự phòng |
| Không có mạng | Chạy từ image đã tải sẵn; AI cục bộ không cần mạng |
