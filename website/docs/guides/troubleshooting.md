---
id: troubleshooting
title: Khắc phục sự cố
description: Các lỗi hay gặp khi cài đặt và gọi PeopleOS PaaS, nguyên nhân và cách xử lý.
---

## Cài đặt

### Portal mở ra trang trắng hoặc lỗi đăng nhập

Keycloak chưa sẵn sàng hoặc chưa chạy script khởi tạo. Kiểm tra `docker compose ps` (Keycloak `healthy`), rồi chạy lại `python scripts/keycloak-paas-bootstrap.py` - script an toàn khi chạy nhiều lần.

### `platform-api` khởi động lỗi

Thường do thiếu `PLATFORM_SECRET_KEY` trong `infrastructure/.env`. Sinh khóa theo [Cài đặt môi trường](../environment-setup.mdx#2-cấu-hình-biến-môi-trường) rồi `docker compose … up -d platform-api platform-worker`.

### Máy chậm hoặc container bị dừng

Toàn bộ stack cần khoảng 8 GB RAM cho Docker. Tăng giới hạn trong Docker Desktop, hoặc tắt bớt dịch vụ không dùng (ví dụ AI: Ollama, Qdrant).

## Gọi Data API

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `401` | Thiếu header `X-API-Key`, gõ sai, hoặc khóa đã thu hồi | Kiểm tra tên header và khóa; tạo khóa mới nếu cần |
| `403 API key chưa gắn tenant` | Khóa đăng ký trên gateway bị lỗi | Thu hồi và tạo lại khóa |
| `429` | Vượt tốc độ hoặc hạn mức ngày | Lùi lại rồi thử lại; xem [Gói dịch vụ](../concepts/plans.md) |
| `200` nhưng `data.employees` rỗng | Dự án mới chưa có dữ liệu | Bình thường - xem [bước 5 Bắt đầu nhanh](../getting-started.mdx#5-thêm-nhân-viên-đầu-tiên) |
| `field 'insert_employees_one' not found in type: 'mutation_root'` | Dùng khóa **Chỉ đọc** | Dùng khóa **Đọc và ghi** |
| `field 'ext_…' not found` | Sai mã dự án trong tên bảng, hoặc bảng đã xóa | Lấy mã ở mục **Tổng quan**; tên là `ext_<mã>_<bảng>` |
| `Foreign key violation` | ID tham chiếu không thuộc dự án của bạn | Kiểm tra lại ID (khóa ngoại tổng hợp chặn tham chiếu chéo dự án) |
| `Uniqueness violation … employee_code` | Trùng mã nhân viên trong dự án | Dùng mã khác hoặc `update` bản ghi đã có |
| `Giá trị của trường "…" không đúng kiểu …` | Sai kiểu trường tùy chỉnh | Xem kiểu ở mục **Trường tùy chỉnh** |
| `Thiếu trường tùy chỉnh bắt buộc "…"` | Trường bắt buộc chưa có trong `custom` | Gửi kèm giá trị khi thêm nhân viên hoặc sửa `custom` |

## Webhook

| Triệu chứng | Cách xử lý |
|---|---|
| `URL webhook phải dùng https` / `không được trỏ vào mạng nội bộ` | Dùng URL công khai `https`, hoặc bật `ALLOW_HTTP_WEBHOOKS` / `ALLOW_PRIVATE_WEBHOOKS` **chỉ trên máy dev** |
| Không nhận được gì | Xem **Nhật ký gửi sự kiện**: không có dòng nào nghĩa là chưa có thay đổi ở bảng đã đăng ký; cột **Mã phản hồi** cho biết endpoint trả gì |
| Endpoint trả `401` vì chữ ký sai | Tính HMAC trên **body thô**, đúng chuỗi `"<t>.<body>"`, đúng secret của webhook đó |
| Trạng thái **dead** | Sửa endpoint rồi bấm **Gửi lại** |
| Nhận một sự kiện hai lần | Bình thường (giao ít nhất một lần); chống trùng theo `id` |

## Đăng nhập người dùng ứng dụng

| Triệu chứng | Cách xử lý |
|---|---|
| Keycloak báo `Invalid parameter: redirect_uri` | Redirect URI chưa được khai báo khi tạo dự án - xem [Đăng nhập người dùng ứng dụng](./end-user-login.mdx#1-khai-báo-redirect-uri) |
| Người dùng không đăng nhập được bằng tên đã tạo | Tên thật có tiền tố mã dự án: `<mã>.<tên>` |
| Gọi `/graphql` bằng token người dùng bị từ chối | Tài khoản chưa có vai trò nghiệp vụ; gọi dữ liệu qua máy chủ của bạn bằng API key |

Vẫn chưa giải quyết được? [Mở issue](https://github.com/Nguyen16112006/PeopleOS/issues/new/choose) kèm phiên bản, lệnh đã chạy và log (`docker compose logs platform-api platform-worker apisix`) - nhớ xóa khóa và secret trước khi dán.
