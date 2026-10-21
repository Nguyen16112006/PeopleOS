# API Gateway (Apache APISIX, chế độ standalone)

| Route | Đích | Ghi chú |
|---|---|---|
| `/graphql` | Hasura `/v1/graphql` | JWT bắt buộc |
| `/api/*` | BFF `:8000` | JWT bắt buộc |
| `/api/internal/*` | - | Trả 404 (chỉ n8n gọi nội bộ) |
| `/ai/*` | RAG `:8001` | JWT bắt buộc, rewrite bỏ tiền tố `/ai` |
| `/ws` | BFF WebSocket | Token qua `?token=`, BFF tự xác thực chữ ký |

Xác thực: plugin `openid-connect` (bearer_only, kiểm chữ ký bằng JWKS của Keycloak). Không cần etcd vì dùng `config_provider: yaml`.

## Lớp kiểm tra vai trò ở gateway

Ngoài xác thực JWT, một số nhóm API có thêm bước kiểm tra claim `realm_access.roles` (plugin `serverless-post-function`, chạy sau `openid-connect`). Vai trò không thuộc danh sách sẽ nhận 403 ngay tại gateway; phân quyền chi tiết vẫn do BFF và Hasura quyết định.

| Route guard | Đường dẫn | Vai trò được qua |
|---|---|---|
| `guard-tax-year` | `/api/tax-year/*` | `hr`, `accountant`, `director` |
| `guard-payroll-runs` | `/api/payroll-runs*` | `hr`, `accountant`, `director` |
| `guard-temp-access` | `/api/temp-access-requests*` | `sysadmin`, `hr`, `accountant`, `director` |
| `guard-audit` | `/api/audit/*` | `sysadmin`, `director`, `hr` |
| `guard-salary-proposals` | `/api/salary-proposals*` | `manager`, `hr`, `accountant`, `director` |
| `guard-employees` | `/api/employees*` | `hr` |

Route `/graphql` từ chối mọi yêu cầu có header `x-hasura-role: admin`, vì trong Hasura vai trò `admin` là siêu quyền (bỏ qua mọi phân quyền). Vai trò quản trị kỹ thuật của PeopleOS tên là `sysadmin`.

Các yêu cầu `OPTIONS` (preflight CORS) được bỏ qua ở bước kiểm tra vai trò. Thêm nhóm API mới cần kiểm tra vai trò: sao chép một route `guard-*` và đổi danh sách vai trò trong bảng `allowed`.
