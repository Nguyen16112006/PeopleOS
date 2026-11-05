# Chính sách bảo mật

## Phiên bản được hỗ trợ
| Phiên bản | Hỗ trợ bản vá bảo mật |
|---|---|
| 2.0.x (HR-PaaS) | ✔ |
| 1.x | ✘ - hãy nâng cấp |

## Báo cáo lỗ hổng
**Không** mở issue công khai cho lỗ hổng bảo mật. Hãy dùng **Security → Report a vulnerability** (Private vulnerability reporting của GitHub)
trên kho mã này. Hãy cung cấp: phiên bản/commit, mô tả, các bước tái hiện, ảnh hưởng (đặc biệt: có đọc/ghi được dữ liệu của tenant khác không), và đề xuất khắc phục nếu có.

Mục tiêu phản hồi (nỗ lực tối đa của người bảo trì, không phải cam kết pháp lý): xác nhận trong **5 ngày làm việc**, đánh giá mức độ trong **10 ngày**,
phát hành bản vá hoặc biện pháp giảm thiểu trong **30 ngày** với lỗi nghiêm trọng. Chúng tôi sẽ ghi công người báo cáo nếu bạn đồng ý.

## Phạm vi quan tâm hàng đầu
- Rò rỉ dữ liệu **giữa các tenant** (bỏ qua permission Hasura, RLS, khóa ngoại tổng hợp, gateway Lua).
- Lộ/đoán được API key, secret webhook; bỏ qua xác thực Keycloak/APISIX; SSRF qua webhook.
- Sửa/xóa nhật ký kiểm toán (bảng `audit_logs` phải bất biến, chuỗi băm phải toàn vẹn).

## Lưu ý khi triển khai
Mật khẩu/khóa trong `infrastructure/.env.example`, `realm-peopleos.json` (`Peopleos@123`) và các giá trị `*_change_me` chỉ dành cho **demo**.
Đổi toàn bộ trước khi triển khai thật; không commit `.env`, `backups/`. Danh sách kiểm tra production: [docs/paas/README.md](docs/paas/README.md).
