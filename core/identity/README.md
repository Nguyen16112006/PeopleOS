# Định danh (Keycloak)

- Realm `peopleos` được import tự động từ `realm-peopleos.json` khi container khởi động.
- Client công khai `people-workspace` (Authorization Code + PKCE S256), redirect `http://localhost:3000/*`.
- 4 realm role: `admin`, `hr`, `manager`, `employee`. Người dùng có vai trò cao cũng mang role `employee`.
- Tài khoản demo (mật khẩu `Peopleos@123`): `admin`, `hr`, `manager`, `employee`, `employee2`.
  UUID của từng user được cố định để khớp bảng `users` trong PostgreSQL (`id` = claim `sub`).
- Hasura đọc vai trò từ `realm_access.roles`; frontend chọn vai trò hiệu lực bằng header `x-hasura-role`.
- Sau khi khởi động Keycloak lần đầu, chạy `python scripts/keycloak-paas-bootstrap.py` để thêm mapper `tenant_id` vào client `people-workspace` và gán tenant mặc định cho user chưa có tenant. Đăng xuất rồi đăng nhập lại để nhận access token mới; token không có `tenant_id` sẽ bị Hasura từ chối.
- Sửa `KEYCLOAK_PUBLIC_URL` trong `.env` nếu truy cập bằng host khác `localhost` (issuer của token phải khớp).
