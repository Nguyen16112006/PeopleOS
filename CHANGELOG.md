# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

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
