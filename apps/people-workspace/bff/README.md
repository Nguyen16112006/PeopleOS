# Backend - People Workspace (Java 21 + Spring Boot 3)

Backend nghiệp vụ của Tầng 2. Việc **đọc** dữ liệu do frontend gọi thẳng GraphQL (Hasura); backend này lo phần
**ghi có quy tắc nghiệp vụ**, tài liệu PDF và thông báo realtime. Backend **không có CSDL riêng**: mọi dữ liệu đi qua Hasura.

## Cấu trúc theo từng mục

Mỗi mục nghiệp vụ là một package, tự chứa `controller → service → dto` (và file truy vấn GraphQL nếu có):

```
src/main/java/vn/peopleos/bff/
├── PeopleOsBffApplication.java        điểm khởi động
│
├── config/                            ① CẤU HÌNH
│   ├── AppProperties.java             thuộc tính (peopleos.*) đọc từ biến môi trường
│   ├── SecurityConfig.java            OAuth2 Resource Server: kiểm JWT Keycloak (JWKS + issuer), CORS dev
│   ├── WebConfig.java                 tiêm tham số CurrentUser vào controller
│   └── WebSocketConfig.java           đăng ký /ws
│
├── common/                            ② TIỆN ÍCH DÙNG CHUNG
│   ├── ApiException.java              lỗi nghiệp vụ có mã HTTP
│   ├── GlobalExceptionHandler.java    mọi lỗi → {"detail": "..."}
│   ├── WorkingDays.java · VnName.java · Params.java · Json.java
│
├── security/                          ③ NGƯỜI DÙNG & VAI TRÒ
│   ├── CurrentUser.java               sub, tên, vai trò (admin > hr > manager > employee)
│   └── JwtRoleConverter.java          realm_access.roles → ROLE_*
│
├── integration/                       ④ KẾT NỐI TẦNG 1 (mỗi hệ thống một package)
│   ├── hasura/    HasuraClient        GraphQL bằng admin secret
│   ├── minio/     StorageService      lưu/đọc PDF
│   ├── n8n/       WorkflowClient      gọi webhook, có fallback
│   ├── nats/      NatsEventBus        publish/subscribe + cầu nối WebSocket
│   └── keycloak/  KeycloakAdminClient tạo tài khoản SSO
│
├── realtime/                          ⑤ WEBSOCKET /ws
│   ├── NotificationWebSocketHandler   xác thực token ở query, đăng ký kết nối
│   └── ConnectionRegistry             kết nối theo người dùng
│
├── notification/                      ⑥ THÔNG BÁO
│   └── NotificationService            lưu DB (Hasura) + đẩy realtime (NATS)
│
├── employee/                          ⑦ HỒ SƠ NGƯỜI ĐĂNG NHẬP
│   ├── EmployeeLookup                 users.id (sub) → employees
│   └── MeController                   GET /api/me
│
├── leave/                             ⑧ NGHỈ PHÉP / NGHỈ ỐM
│   ├── LeaveController · LeaveService · LeaveQueries · dto/
│
├── proposal/                          ⑨ ĐỀ XUẤT TĂNG LƯƠNG (duyệt Quản lý → HR → Giám đốc)
│   ├── ProposalController · ProposalService · ProposalQueries · dto/
│
├── onboarding/                        ⑩ NHÂN VIÊN MỚI + CHECKLIST
│   ├── OnboardingController · OnboardingService · OnboardingQueries · dto/
│
├── document/                          ⑪ TÀI LIỆU PDF (phiếu lương, hợp đồng)
│   ├── DocumentController · DocumentService · PdfGenerator · PdfFile
│
├── internal/                          ⑫ API NỘI BỘ CHO n8n
│   ├── InternalController · InternalKeyGuard
│
└── system/                            ⑬ HEALTH CHECK
    └── HealthController
```

## API (giữ nguyên hợp đồng với frontend)

| Mục | Endpoint |
|---|---|
| Hệ thống | `GET /api/health`, `GET /api/me`, `WS /ws?token=` |
| Nghỉ phép | `POST /api/leave-requests`, `/{id}/decision`, `/{id}/cancel` |
| Đề xuất lương | `POST /api/salary-proposals`, `/{id}/decision` |
| Onboarding | `POST /api/employees`, `POST /api/onboarding-tasks/{id}/complete` |
| Tài liệu | `GET /api/payslips/{id}/download`, `GET /api/contracts/{id}/download`, `POST /api/contracts/{id}/upload` |
| Nội bộ (n8n) | `POST /api/internal/notify`, `POST /api/internal/onboarding-tasks` |

Chi tiết: `docs/api-reference.md`. Tài liệu tương tác: `/swagger-ui.html` (khi chạy cùng `docker-compose.dev.yml`, cổng 8000).

## Quy ước

- JSON dùng `snake_case` (`spring.jackson.property-naming-strategy=SNAKE_CASE`); lỗi luôn dạng `{"detail": "..."}`.
- Kiểm tra **vai trò và quyền sở hữu nằm trong service** (không rải rác ở controller) để dễ đọc và test.
- Mỗi truy vấn GraphQL nằm trong `*Queries.java` của mục tương ứng.
- Thêm mục mới: tạo package mới (controller, service, dto), dùng `HasuraClient`; không thêm CSDL riêng.

## Build và test

```bash
cd apps/people-workspace/bff
mvn test                 # JUnit 5 + Mockito: ngày làm việc, tên, vai trò, nghỉ phép, đề xuất lương nhiều cấp
mvn -DskipTests package  # tạo target/app.jar
```
Docker build tự biên dịch bằng Maven (xem `Dockerfile`), không cần cài Java/Maven trên máy.

Biến môi trường: xem `src/main/resources/application.yml` và `infrastructure/.env.example`.
