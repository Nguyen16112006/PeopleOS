# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

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
