# Dữ liệu cấu trúc (PostgreSQL + Hasura)

| Thư mục | Nội dung |
|---|---|
| `init/` | Script tạo thêm CSDL `keycloak`, `n8n` ở lần khởi tạo đầu của PostgreSQL |
| `hasura/migrations/` | Schema SQL (11 bảng) - Hasura CLI tự áp dụng khi container khởi động |
| `hasura/metadata/` | Quan hệ, quyền theo vai trò (employee / manager / hr; `admin` = role admin của Hasura) |
| `hasura/migrations/.../1760000000001_governance/` | Nhật ký kiểm toán bất biến (chuỗi băm), trigger ghi thay đổi, danh mục phả hệ dữ liệu, view dashboard |
| `seed/` | `generate_seed.py` sinh `seed.sql` (dữ liệu demo, dùng chung module tính lương với AI) |

Sơ đồ quan hệ chính: `users 1-1 employees`, `employees 1-n contracts / payrolls / insurance_records / leave_requests / onboarding_tasks`,
`salary_proposals 1-n approval_steps`, `users 1-n notifications`.
