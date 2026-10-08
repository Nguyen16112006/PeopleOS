# Định danh (Keycloak)

- Realm `peopleos` được import tự động từ `realm-peopleos.json` khi container khởi động.
- Client công khai `people-workspace` (Authorization Code + PKCE S256), redirect `http://localhost:3000/*`.
- 4 realm role: `admin`, `hr`, `manager`, `employee`. Người dùng có vai trò cao cũng mang role `employee`.
- Tài khoản demo (mật khẩu `Peopleos@123`): `admin`, `hr`, `manager`, `employee`, `employee2`.
  UUID của từng user được cố định để khớp bảng `users` trong PostgreSQL (`id` = claim `sub`).
- Hasura đọc vai trò từ `realm_access.roles`; frontend chọn vai trò hiệu lực bằng header `x-hasura-role`.
- Sửa `KEYCLOAK_PUBLIC_URL` trong `.env` nếu truy cập bằng host khác `localhost` (issuer của token phải khớp).
