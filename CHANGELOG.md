# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

## [2.0.1] - 2026-11-03 (rà soát giấy phép, tài liệu, hạ tầng cộng đồng và giảm rủi ro demo)
### Fixed
- **Giấy phép:** `redis:7-alpine` (Redis 7.4+ không thuộc OSI) → **Valkey** (BSD-3-Clause); mặc định mô hình `qwen2.5:3b` (Qwen Research License,
  phi thương mại) → `qwen2.5:1.5b` (Apache-2.0); `ollama/ollama:latest` → `0.32.6` (ghi đè bằng `OLLAMA_IMAGE`); MinIO cho phép thay image bằng `MINIO_IMAGE`.
- **Tài liệu:** README ghi đúng 6 vai trò và 6 workflow n8n, bỏ tuyên bố "100% nguồn mở", chuyển "Đa tenant" khỏi hướng phát triển, cập nhật bảng kiểm thử;
  sửa số liệu cũ trong `docs/architecture.md`, `docs/deployment.md`, `docs/demo-script.md`.
### Added
- Header **SPDX** (Apache-2.0) cho toàn bộ tệp mã; `scripts/spdx-headers.py --check/--apply`; `NOTICE`, `THIRD_PARTY_LICENSES.md`, `docs/LICENSING.md`
  (nêu trung thực n8n không thuộc OSI và MinIO bị ngừng phát hành image, kèm phương án thay thế).
- Cộng đồng: `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md` đầy đủ, mẫu issue (báo lỗi, đề xuất), mẫu Pull Request, `docs/screenshots/README.md`.
- Phát hành: `scripts/make-release.py` tạo **`.tar.gz`** tái lập được (build 2 lần giống hệt), tự loại `.env`, `backups/`, dump và từ chối nếu có khóa riêng.
- Giảm rủi ro demo: `scripts/preflight.py` (Docker/RAM/đĩa/cổng/`.env`, `--check-images` kiểm tra tag image có tồn tại), `scripts/smoke-paas.py`
  (kiểm thử đầu-cuối cả stack, gồm cô lập tenant và webhook ký HMAC), `docs/DEMO_CHECKLIST.md`.
- CI: job `license-compliance`; job `gateway-and-scripts` chạy thêm test của preflight/release/smoke.
### Chưa làm (cần quyết định)
- Thay n8n bằng engine OSI (Kestra/Temporal/Flowable) và MinIO bằng SeaweedFS: xem `docs/LICENSING.md`.

## [2.0.0] - 2026-10-30 (HR-PaaS: đa tenant + control plane cho developer)
### Added
- **Đa tenant**: cột `tenant_id` + Row-Level Security (fail-closed) cho mọi bảng nghiệp vụ; permission Hasura nào cũng lọc theo
  `X-Hasura-Tenant-Id`; chuỗi băm kiểm toán riêng từng tenant; khóa ngoại tổng hợp `(tenant_id, id)` chống tham chiếu chéo tenant.
  Migration `1760000000007` … `1760000000011` (có `down.sql`).
- **Control plane** `apps/platform/platform-api` (FastAPI): project (saga cấp phát có bù trừ), API key (chỉ lưu hash),
  Schema Service (spec → DDL → Hasura metadata API), custom field (jsonb + trigger kiểm kiểu), webhook (HMAC, retry, dead-letter, chống SSRF),
  đo đếm sử dụng theo ngày.
- **Developer Portal** `apps/developer-portal` (React): project, API key, schema, trường tùy chỉnh, webhook, người dùng, sử dụng.
- **Gateway**: APISIX chạy bằng etcd (`core/gateway/config.paas.yaml`), consumer-group theo gói, Lua `api-key-to-hasura.lua`,
  `scripts/apisix-paas-bootstrap.py`.
- Keycloak: realm `peopleos-platform` (developer); `scripts/keycloak-paas-bootstrap.py` (thuộc tính `tenant_id` chỉ admin sửa được + mapper).
- Role Hasura `bff_service`, `tenant_api_read`, `tenant_api_write` (sinh bằng `scripts/tenant-roles.py`); Event Trigger cho 4 bảng.
- Hạ tầng: `docker-compose.paas.yml`; `infrastructure/k8s/` (Hasura, platform-api, worker + KEDA, CloudNativePG + PgBouncer, APISIX, Job migration/metadata);
  `scripts/apply-sql-migrations.sh` (áp migration bằng role owner, có sổ cái).
- CI: job `platform-api`, `gateway-and-scripts`, `developer-portal`, `k8s-validate`; bước cô lập đa tenant, kiểm tra permission/role và trình áp migration.
- Tài liệu: `docs/paas/README.md`, `infrastructure/k8s/README.md`.

### Changed (có thể làm vỡ tích hợp cũ)
- **BFF không còn dùng vai trò admin của Hasura**: dùng role `bff_service` + `x-hasura-tenant-id` (lấy từ claim `tenant_id` của JWT; thiếu thì 403).
- Token phải có claim `tenant_id` (chạy `scripts/keycloak-paas-bootstrap.py`); Hasura từ chối token thiếu claim.
- Khóa chính `app_settings`, `hr_budgets`, `annual_reports`, `tax_year_closings` và `audit_logs` nay có `tenant_id`;
  các truy vấn `*_by_pk(year|key)` của 4 bảng đầu đổi sang `where` + `limit: 1` (BFF và `TaxYear.tsx`).
- UNIQUE của `users`, `employees`, `contracts`, `kpi_cycles`, `payroll_runs` nay theo tenant. View `v_*` có thêm cột `tenant_id`; `v_kpi_summary` một dòng cho mỗi tenant.
- n8n gọi `/api/internal/*` có thể gửi header `x-tenant-id` (mặc định: tenant first-party).
- `seed.sql` đặt tenant first-party và **từ chối chạy** nếu DB đã có tenant khác (trước đây `TRUNCATE ... CASCADE` sẽ xóa dữ liệu của mọi tenant).
- `scripts/audit-verify.sql` kiểm chuỗi theo từng tenant.

### Đã kiểm tra trong môi trường phát triển
- Migration 007–011 (up/down/up, backfill dữ liệu cũ), seed, chuỗi kiểm toán, sao lưu/khôi phục: PostgreSQL 16 thật. Mô phỏng nguyên job `database` của CI: đạt.
- Cô lập đa tenant ở tầng SQL (15 ca); `platform-api` 45 test với PostgreSQL thật (Keycloak/APISIX/Hasura là mock HTTP); Lua 6 ca; script bootstrap 4 test (server giả).
- `tsc` + `vite build` cho frontend và Developer Portal; `kubeconform --strict` + `kustomize build` cho 30 resource Kubernetes.
- **Chưa kiểm tra**: Hasura/Keycloak/APISIX/cluster thật; BFF chưa build Maven (chỉ `javac` kiểm cú pháp, chạy thật `TenantContext`).

## [1.1.0] - 2026-10-20 (mô hình 6 vai trò)
### Changed
- **6 vai trò** thay cho 4: `employee`, `manager`, `hr`, `director` (Giám đốc), `accountant` (Kế toán), `sysadmin` (Admin kỹ thuật). Mỗi người một vai trò chính, quản lý một tầng.
  Khóa `sysadmin` (không phải `admin`) vì vai trò `admin` trong Hasura là siêu quyền, bỏ qua mọi phân quyền.
- Đề xuất lương: Quản lý → HR → Kế toán (ngân sách) → Giám đốc. Nghỉ phép duyệt theo giai đoạn (Quản lý / HR / Giám đốc).
- Dữ liệu mẫu: thêm Giám đốc và Kế toán; `admin` thành quản trị kỹ thuật.
- Dashboard: sửa view `v_kpi_summary` (đếm đề xuất chờ duyệt theo chuỗi mới), `v_payroll_monthly` chỉ tính lương đã chi trả.

### Added
- 5 migration mới: `six_roles`, `offboarding`, `kpi_cycles`, `tax_year_end`, `payroll_runs`.
- Module BFF mới: tạm ứng/chi phí, cấp quyền tạm thời, nghỉ việc (khóa tài khoản Keycloak vào ngày làm việc cuối), KPI theo quý,
  thuế TNCN/báo cáo tài chính năm/ngân sách, kỳ lương hằng tháng và khiếu nại phiếu lương (bản Java của công thức tính lương).
- Giao diện: Tạm ứng và chi phí, Quyền tạm thời, Nghỉ việc, Đánh giá KPI, Thuế và báo cáo năm, Kỳ lương; khiếu nại trong trang Bảng lương.
- n8n: cập nhật 4 workflow, thêm `05-temp-access-expire` và `06-offboarding-lock` (lịch).
- APISIX: các route `guard-*` kiểm tra vai trò, chặn `x-hasura-role: admin` ở `/graphql`.
- Tài liệu `docs/ROLES_AND_WORKFLOWS.md`; hướng dẫn chạy `HUONG_DAN_CHAY_6_VAI_TRO.md`.

### Đã kiểm tra trong môi trường phát triển
- Biên dịch sạch các module Java mới (với lớp giả cho Spring) và chạy 38 test JUnit đạt; không chạy được test dùng Mockito.
- `tsc` nghiêm ngặt và `npm run build` của frontend đạt.
- 7 migration `up.sql` chạy sạch trên PostgreSQL 16, `seed.sql` nạp được, `down.sql` rồi `up.sql` lại đạt.
- Đối chiếu tĩnh: 97 trường GraphQL và 16 đối tượng ghi của BFF khớp lược đồ; 38 lời gọi API của giao diện khớp route BFF.
- **Chưa chạy:** toàn bộ ngăn xếp Docker (Keycloak, Hasura, APISIX, n8n), khởi động Spring Boot thật.

## [1.0.0] - 2026-10-06
### Added (bổ sung tiêu chí)
- **Quét mã độc ClamAV** cho mọi tệp tải lên (fail-closed mặc định), ghi nhật ký `FILE.QUARANTINED`.
- **GitOps** (CI GitHub Actions, `gitops-agent`), **tự phục hồi** (healthcheck + autoheal), **sao lưu** PostgreSQL/MinIO định kỳ + script khôi phục và kiểm chứng.
- **Kiểm toán bất biến:** `audit_logs` chuỗi băm SHA-256, trigger chặn sửa/xóa, trigger ghi thay đổi dữ liệu nhạy cảm, API và trang xác minh.
- **Phả hệ dữ liệu** (31 tài sản, 52 quan hệ, phân loại PII) và **dashboard điều hành** (5 view SQL).
- Tài liệu `docs/governance.md`.

### Fixed
- Image MinIO chuyển sang `quay.io/minio/*` (Docker Hub không còn phát hành `minio/minio`).

### Added
- **Tầng 1 - Open-Core:** Keycloak (realm, 4 vai trò, 5 tài khoản demo), APISIX (JWT, CORS, chặn API nội bộ), PostgreSQL + Hasura (11 bảng, quyền theo vai trò),
  MinIO (3 bucket), n8n (4 workflow), NATS, Docker Compose cho toàn hệ thống.
- **Tầng 2 - People Workspace:** frontend React 19 (10 trang), backend **Java 21 / Spring Boot 3** chia theo mục (nghỉ phép, đề xuất lương nhiều cấp, onboarding, PDF, realtime, tích hợp Hasura/MinIO/NATS/n8n/Keycloak).
- **AI Assistant:** RAG trên Luật Lao động 2019, Luật BHXH 2024, thuế TNCN 2026, chính sách nội bộ; tính Gross↔Net; tra cứu dữ liệu theo quyền.
- Tài liệu: architecture, api-reference, deployment, demo-script; scripts setup/init-db/seed-data; healthcheck.
- Test: 7 (tính lương) + 21 (RAG) bằng pytest đã chạy; JUnit 5 + Mockito cho backend Java đã viết nhưng chưa chạy được trong môi trường phát triển.
