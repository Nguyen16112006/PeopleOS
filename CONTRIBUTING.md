# Đóng góp cho PeopleOS

Cảm ơn bạn quan tâm! Vui lòng đọc [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Lỗ hổng bảo mật: xem [SECURITY.md](SECURITY.md) (đừng mở issue công khai).

## Báo lỗi / đề xuất
Dùng mẫu trong *Issues → New issue* (có mẫu **Báo lỗi** và **Đề xuất tính năng**). Nêu rõ phiên bản (tag/commit), cách tái hiện, kết quả mong đợi/thực tế và log liên quan.

## Chuẩn bị môi trường
Yêu cầu: Docker + Docker Compose v2, Python 3.12, Node 22, JDK 21 + Maven (tùy phần bạn sửa). Máy yếu: tắt dịch vụ AI (Ollama/Qdrant) khi không cần.
```bash
python scripts/preflight.py                 # kiểm tra Docker, RAM, đĩa, cổng, image
cp infrastructure/.env.example infrastructure/.env
docker compose -f infrastructure/docker-compose.yml up -d --build      # lõi + ứng dụng minh họa
# HR-PaaS (tùy chọn): thêm -f infrastructure/docker-compose.paas.yml rồi python scripts/keycloak-paas-bootstrap.py
```
Hướng dẫn chi tiết: [docs/deployment.md](docs/deployment.md), [docs/paas/README.md](docs/paas/README.md).

## Quy trình đóng góp
1. Fork, tạo nhánh từ `main`: `feat/<ten>`, `fix/<ten>`, `docs/<ten>`.
2. Commit theo [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
3. Chạy kiểm tra liên quan **trước khi** mở Pull Request:

| Bạn sửa | Chạy |
|---|---|
| Migration / SQL / Hasura metadata | `scripts/test-tenant-isolation.sh`, `python scripts/tenant-permissions.py --check`, `python scripts/tenant-roles.py --check` |
| `apps/platform/platform-api` | `cd apps/platform/platform-api && python -m pytest tests` |
| Gateway / script bootstrap | `lua5.4 core/gateway/paas/test_api_key_to_hasura.lua` · `python -m pytest scripts/tests` |
| BFF Java | `cd apps/people-workspace/bff && mvn verify` |
| Frontend / Developer Portal | `npm ci && npm run build` trong thư mục tương ứng |
| Mọi tệp mã mới | `python scripts/spdx-headers.py --apply` (thêm header SPDX) |
| Shell | `shellcheck -S warning scripts/*.sh` |

4. Cập nhật tài liệu và `CHANGELOG.md` (mục *Unreleased*) khi đổi hành vi.
5. Mở Pull Request theo mẫu; CI phải xanh.

## Quy ước quan trọng
- **Đa tenant:** mọi bảng nghiệp vụ mới trong `public` phải có `tenant_id` + RLS + FK tổng hợp; permission Hasura phải lọc theo `X-Hasura-Tenant-Id`
  (script `tenant-permissions.py`/`tenant-roles.py` sinh và kiểm tra). Không gọi Hasura bằng vai trò admin từ mã ứng dụng.
- **Giấy phép:** mã mới theo Apache-2.0 (header SPDX). Thêm phụ thuộc mới phải ghi vào [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)
  và không dùng giấy phép không thuộc OSI mà không nêu trong [docs/LICENSING.md](docs/LICENSING.md). Ghim phiên bản image/gói.
- Không commit bí mật (`.env`, khóa, dump CSDL). Dữ liệu demo chỉ là dữ liệu giả.
