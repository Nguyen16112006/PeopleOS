# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

Ngày của từng phiên bản khớp với lịch sử Git: 1.1.0 và 2.0.1 theo ngày tạo tag; 1.0.0 và 2.0.0 không có tag riêng nên lấy ngày các thành phần của phiên bản đó
lần đầu được commit (2.0.0 và 2.0.1 cùng được đưa vào kho bằng commit `5779d04`).

## [Unreleased]
### Removed
- People Workspace: bỏ tùy chọn **Màu nhấn** ở trang Tùy chỉnh giao diện vì gần như không có tác dụng (#36); toàn hệ thống dùng một màu nhận diện
  xanh mực, thống nhất với Developer Portal và trang tài liệu. Giá trị `accent` cũ trong localStorage được bỏ qua.
### Fixed
- **Giấy phép - Hasura:** đổi sang tag Community `hasura/graphql-engine:v2.40.0-ce` / `v2.40.0-ce.cli-migrations-v3` (compose, `Dockerfile.metadata`,
  `k8s/cell/hasura.yaml`); image thường từ v2.12.0 chứa thêm thành phần Enterprise độc quyền.
- **Giấy phép - MinIO:** bỏ image mirror bên thứ ba `scnd/minio-mirror`; MinIO + mc build từ tag phát hành chính thức
  (`core/data/unstructured/minio/Dockerfile`, image `peopleos/minio:RELEASE.2025-10-15T17-29-55Z`). CI build thêm image `minio` và `hasura-metadata`;
  `preflight.py --check-images` bỏ qua image `peopleos/*` build tại chỗ.
- `THIRD_PARTY_LICENSES.md` viết lại: mỗi thành phần ghi rõ dùng ở tệp nào (có link), giấy phép và mức đáp ứng yêu cầu của dự án.
### Changed
- **Giao diện mới cho People Workspace và Developer Portal** (cùng một bộ nhận diện): menu bên trái xanh dương mực, nền xám lạnh, phông Be Vietnam Pro
  (hiển thị đúng dấu tiếng Việt), cỡ chữ lớn hơn, số tiền và ngày tháng thẳng cột; có chế độ nền tối (nút trên thanh trên cùng, ghi nhớ lựa chọn).
- People Workspace: menu chia nhóm *Của tôi / Công việc quản lý / Hệ thống*; ô tìm trang ở thanh trên cùng (`Ctrl K` / `⌘ K`, tìm được khi gõ không dấu);
  trang **Tổng quan** có dải số liệu (phép năm còn lại, lương thực nhận, việc chờ duyệt) và danh sách **Việc cần làm** dẫn thẳng tới trang xử lý;
  nút đăng xuất hiện sẵn ở cuối menu. Bảng màu `slate`/`blue`/`indigo` của Tailwind được ánh xạ sang biến CSS nên các trang cũ đổi màu theo, không cần sửa từng trang.
- People Workspace cá nhân hóa: trang **Tùy chỉnh giao diện** (`/settings`) cho từng người chọn cách gọi trong lời chào (tên, anh/chị + tên, họ tên),
  cỡ chữ, khoảng cách, nền sáng/tối/theo máy và các trang ghim lên đầu menu (gợi ý sẵn theo vai trò);
  trang Tổng quan có mục **Bạn hay mở** (số ngày mở mỗi trang trong 30 ngày). Cài đặt và lượt mở lưu theo tài khoản trên trình duyệt đang dùng (localStorage), chưa đồng bộ giữa các máy.
- Phiếu lương trình bày như tờ phiếu giấy, có con dấu đỏ "Đã chi" kèm ngày chi khi kỳ lương đã chi (`components/Stamp.tsx`; con dấu chỉ dùng cho việc đã hoàn tất).
- Developer Portal: menu bên trái liệt kê dự án và các mục của dự án đang mở (thay cho hàng tab); trạng thái, quyền khóa, môi trường, kiểu trường hiển thị bằng
  tiếng Việt; khối mã `curl` có nút sao chép; khung **Xóa dự án** tách riêng; tạo dự án xong thì mở luôn dự án đó.

## [2.3.0] - 2026-11-15
### Added
- **Bảng công cho cả 6 vai trò** (migration `1760000000012_timesheets`): bảng `attendance_records` (chấm công từng ngày) và `timesheets` (bảng công tháng) có RLS và khóa ngoại tổng hợp theo tenant;
  BFF `timesheet/` (`/api/attendance/check-in`, `/check-out`, `/days`, `/api/timesheets`, `/submit`, `/{id}/decision`); trang **Bảng công**; quyền Hasura theo vai trò
  (Nhân viên, Admin: của mình; Quản lý: của mình và nhân viên trực thuộc; HR, Kế toán, Giám đốc: toàn công ty).
- **Lương tính theo bảng công:** HR chốt công sẽ khóa bảng công của tháng; Kế toán tính lương cơ bản và phụ cấp theo ngày công hưởng lương, tiền làm thêm giờ tự tính từ số giờ
  (150% / 200% / 300%); phiếu lương lưu công chuẩn, ngày công và giờ làm thêm (`payrolls.standard_days`, `paid_days`, `overtime_hours`).
- Dữ liệu mẫu: chấm công tháng 10 và 11/2026, bảng công tháng 10; thêm tài sản `tbl_timesheets` vào phả hệ dữ liệu (32 tài sản, 56 quan hệ).
- Kiểm thử: 17 test JUnit cho tổng hợp bảng công và quy đổi lương; ca T16 (cô lập tenant của bảng công) trong `scripts/tests/tenant_isolation.sql`.
### Changed
- Kỳ lương cũ không có bảng công đã chốt vẫn tính đủ tháng như trước; `overtime_pay` trong `adjustments` trở thành giá trị nhập đè (để trống: tự tính).
- Số phiên bản các thành phần nâng lên 2.3.0.
### Fixed
- Chỉ cho chốt công khi tháng đã kết thúc (trước đây chốt được tháng đang diễn ra).

## [2.2.2] - 2026-11-15
### Added
- `REUSE.toml` và thư mục `LICENSES/` (Apache-2.0, MIT): toàn kho đạt chuẩn REUSE 3.3, kể cả tệp JSON, metadata Hasura, Markdown không mang được header.
- CI job `license-compliance` chạy thêm `reuse lint`.
- README: mục "Bản phát hành" (tag, gói `.tar.gz` + `SHA256SUMS`, cách kiểm tra gói tải về).
### Changed
- Đồng bộ số phiên bản các thành phần (BFF, Workflow Engine, frontend, Developer Portal, platform-api, RAG) với phiên bản phát hành của dự án.
### Fixed
- Ghi công tác giả shadcn/ui (MIT) cho các thành phần `components/ui/*` phỏng theo shadcn/ui.
- Bổ sung dòng bản quyền còn thiếu ở 10 tệp (Dockerfile RAG, các trang frontend, `requirements.txt`).
- `generate_seed.py`: tách chuỗi header SPDX ghi vào `seed.sql` để `reuse lint` không hiểu nhầm là header của chính tệp.

## [2.2.1] - 2026-11-15
### Changed
- RAG service: khi chạy ngoài Docker, mặc định đọc tri thức từ `ai/knowledge` trong kho mã (vẫn ghi đè được bằng `KNOWLEDGE_DIR`).
### Fixed
- **Frontend gửi sai định dạng khóa JSON:** các trang Kỳ lương, Nghỉ việc, KPI, Tạm ứng, Quyền tạm thời, Thuế và báo cáo năm gửi khóa camelCase (`employeeId`, `lastWorkingDay`...) trong khi BFF
  đọc snake_case và bỏ qua khóa lạ, nên các trường này thành null phía server và yêu cầu bị từ chối 400. `api()` nay chuẩn hóa mọi khóa sang snake_case.
- Keycloak: thêm claim `tenant_id` vào realm và tự bootstrap trong `setup.sh`; `setup.sh` qua ShellCheck SC2034.
- Thông báo nghỉ phép hiển thị "2 ngày" thay vì "2.0 ngày".
- `.gitignore`: chặn `*.tsbuildinfo` do `npm run build` sinh ra.

## [2.2.0] - 2026-11-10
### Added
- README: mục "Biên dịch từ mã nguồn (không qua Docker)" (công cụ cần có, lệnh build từng thành phần, cấu hình bằng biến môi trường, thư viện phụ thuộc).
### Changed
- `scripts/setup.sh` tự sinh mật khẩu ngẫu nhiên (PostgreSQL, Keycloak admin, Hasura, MinIO, khóa API nội bộ) khi tạo `.env` và in mật khẩu Keycloak admin thực tế thay vì giá trị mặc định cố định.
### Fixed
- Sửa ngày phát hành các phiên bản 1.0.0, 1.1.0, 2.0.0, 2.0.1 trong CHANGELOG cho khớp với ngày thật trong lịch sử Git.
- Thêm `.mailmap` để gộp các tên tác giả trùng email khi xem `git log`/`git shortlog`.
- BFF: WebSocket chỉ chấp nhận origin khai báo trong `FRONTEND_URL` thay vì mọi origin.
- Tài liệu và script: đồng bộ danh sách 7 tài khoản demo.
- Dockerfile (BFF, Flowable): bộ nhớ đệm Maven và thử lại khi tải thư viện lỗi.
- `.gitignore`: chặn thư mục `target/`.
### Removed
- `add_spdx_headers.py` ở thư mục gốc (trùng với `scripts/spdx-headers.py`).

## [2.1.0] - 2026-11-06 (thay engine quy trình bằng Flowable, hoàn thiện giấy phép từng tệp, chuẩn hóa phát hành)
### Added
- Header **SPDX** cho thêm `pom.xml`, `*.bpmn20.xml`, `index.html`, `nginx.conf`, `nats-server.conf`; `scripts/spdx-headers.py` hỗ trợ XML/HTML/`.conf` và bỏ qua thư mục `target/`.
- Thay workflow engine n8n (Sustainable Use License, không thuộc OSI) bằng dịch vụ Flowable 7.1.0 (Apache-2.0).
- Chuyển sáu quy trình hiện có sang BPMN; hai lịch định kỳ nay là timer start events được lưu bền vững trong PostgreSQL.
- Thêm kiểm thử bảo vệ API nội bộ và kiểm thử deploy BPMN/timer jobs.
- Khởi tạo Hasura Event Trigger riêng trong PaaS bằng tên duy nhất cho từng bảng; metadata dùng chung không phụ thuộc biến môi trường chỉ có ở PaaS.
### Changed
- Gỡ `PeopleOS-v1.1.0.tar.gz` khỏi kho mã; tệp phát hành chỉ đính kèm GitHub Release (tạo bằng `scripts/make-release.py`).
### Fixed
- Migration khóa ngoại tenant chỉ xử lý bảng tham chiếu có đủ `id` và `tenant_id`, tránh Hasura lỗi khi gặp bảng không thuộc mô hình tenant.
- Cập nhật test webhook để dùng tên Event Trigger riêng theo bảng.

## [2.0.1] - 2026-11-05 (rà soát giấy phép, tài liệu, hạ tầng cộng đồng và giảm rủi ro demo)
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

## [2.0.0] - 2026-11-04 (HR-PaaS: đa tenant + control plane cho developer)
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

## [1.1.0] - 2026-10-25 (mô hình 6 vai trò)
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

## [1.0.0] - 2026-10-12
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

[Unreleased]: https://github.com/Nguyen16112006/PeopleOS/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/Nguyen16112006/PeopleOS/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Nguyen16112006/PeopleOS/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/Nguyen16112006/PeopleOS/compare/v1.1.0...v2.0.1
[1.1.0]: https://github.com/Nguyen16112006/PeopleOS/releases/tag/v1.1.0
