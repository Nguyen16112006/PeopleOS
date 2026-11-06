# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/).

## [Unreleased]
### Added
- Chuyển sáu quy trình hiện có từ n8n sang Flowable 7.1.0 (Apache-2.0) dưới dạng BPMN; hai lịch định kỳ được lưu bền vững trong PostgreSQL.
- Khởi tạo Hasura Event Trigger riêng trong PaaS với tên duy nhất cho từng bảng; metadata dùng chung không phụ thuộc biến môi trường chỉ có ở PaaS.
### Fixed
- Migration khóa ngoại tenant chỉ xử lý bảng tham chiếu có đủ `id` và `tenant_id`, tránh Hasura lỗi khi gặp bảng không thuộc mô hình tenant.
- Cập nhật test webhook để dùng tên Event Trigger riêng theo bảng.

## [1.0.0] - 2026-10-06
### Added (bổ sung tiêu chí)
- **Quét mã độc ClamAV** cho mọi tệp tải lên (fail-closed mặc định), ghi nhật ký `FILE.QUARANTINED`.
- **GitOps** (CI GitHub Actions, `gitops-agent`), **tự phục hồi** (healthcheck + autoheal), **sao lưu** PostgreSQL/MinIO định kỳ + script khôi phục và kiểm chứng.
- **Kiểm toán bất biến:** `audit_logs` chuỗi băm SHA-256, trigger chặn sửa/xóa, trigger ghi thay đổi dữ liệu nhạy cảm, API và trang xác minh.
- **Phả hệ dữ liệu** (31 tài sản, 52 quan hệ, phân loại PII) và **dashboard điều hành** (5 view SQL).
- Tài liệu `docs/governance.md`.

### Fixed
- Image MinIO dùng bản mirror `scnd/minio-mirror` (Docker Hub không còn phát hành `minio/minio`).

### Added
- **Tầng 1 - Open-Core:** Keycloak (realm, 4 vai trò, 5 tài khoản demo), APISIX (JWT, CORS, chặn API nội bộ), PostgreSQL + Hasura (11 bảng, quyền theo vai trò),
  MinIO (3 bucket), n8n (4 workflow), NATS, Docker Compose cho toàn hệ thống.
- **Tầng 2 - People Workspace:** frontend React 19 (10 trang), backend **Java 21 / Spring Boot 3** chia theo mục (nghỉ phép, đề xuất lương nhiều cấp, onboarding, PDF, realtime, tích hợp Hasura/MinIO/NATS/n8n/Keycloak).
- **AI Assistant:** RAG trên Luật Lao động 2019, Luật BHXH 2024, thuế TNCN 2026, chính sách nội bộ; tính Gross↔Net; tra cứu dữ liệu theo quyền.
- Tài liệu: architecture, api-reference, deployment, demo-script; scripts setup/init-db/seed-data; healthcheck.
- Test: 7 (tính lương) + 21 (RAG) bằng pytest; JUnit 5 + Mockito cho backend Java chạy tự động trong CI bằng `mvn verify`. Toàn bộ hệ thống đã được build và chạy bằng Docker Compose; backend Java được biên dịch trong giai đoạn build image `bff`.