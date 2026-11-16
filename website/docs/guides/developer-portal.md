---
id: developer-portal
title: Dùng Developer Portal
description: Tham quan 7 mục của một dự án trên Developer Portal và việc làm được ở từng mục.
---

**Developer Portal** (`http://localhost:3100`) là giao diện web để quản lý dự án mà không cần gọi API. Mọi thao tác trên portal đều gọi [Platform API](../platform/overview.mdx) bên dưới, nên bạn có thể tự động hóa chúng sau này.

## Màn hình chính

Sau khi đăng nhập, cột trái liệt kê **Tất cả dự án** và các dự án của bạn. Ở trang **Dự án của bạn**, nhập **Tên dự án** (3 - 60 ký tự) rồi bấm **Tạo dự án**. Nút đổi **nền sáng / nền tối** và **Đăng xuất** nằm ở góc trên.

## Bảy mục của một dự án

Chọn một dự án để mở các mục sau:

### Tổng quan

**Thông tin kết nối**: mã dự án, gói dịch vụ, ngày tạo, và một lệnh `curl` mẫu gọi Data API. Hai nút tắt **Tạo API key** và **Thiết lập webhook**. Cuối trang là vùng **Xóa dự án này** (có hỏi xác nhận, không hoàn tác được).

### API key

Bảng các khóa: tên, **tiền tố**, quyền, môi trường, ngày tạo, trạng thái. Form tạo khóa gồm **Tên gợi nhớ**, **Quyền** (*Chỉ đọc* / *Đọc và ghi*) và **Môi trường** (*Thử nghiệm* / *Chính thức*). Khóa đầy đủ hiện **một lần** ngay sau khi bấm **Tạo khóa** - sao chép trước khi rời trang. Nút **Thu hồi** vô hiệu khóa ngay lập tức.

Xem thêm: [API key](../concepts/api-keys.md).

### Bảng dữ liệu riêng

Liệt kê bảng bạn đã tạo kèm các cột. Form **Tạo bảng**: **Tên bảng**, rồi từng cột với *Tên cột*, *Kiểu*, ô **Bắt buộc**, **Không trùng**, **Liên kết nhân viên** (tự đổi kiểu sang `uuid` và tạo khóa ngoại tới `employees`). **Thêm cột** để thêm dòng. Mỗi bảng có nút **Xóa bảng** (xóa luôn dữ liệu).

Xem thêm: [Mở rộng dữ liệu](../concepts/extending.md).

### Trường tùy chỉnh

Thêm thuộc tính vào hồ sơ nhân viên: **Khóa**, **Kiểu** (Văn bản, Số, Có / không, Ngày, Danh sách chọn), ô **Bắt buộc**, và **Các giá trị cho phép** khi chọn Danh sách chọn. Nút **Gỡ** xóa trường và dọn giá trị cũ.

### Webhook

**Thêm webhook**: nhập **URL** (`https`, truy cập được từ Internet) và tích các sự kiện theo nhóm *Nhân viên*, *Hợp đồng*, *Đơn nghỉ phép*, *Bảng lương*. Secret ký hiện một lần sau khi tạo. Mỗi webhook có **Gửi thử** (gửi `ping`) và **Gỡ**.

**Nhật ký gửi sự kiện** bên dưới cho biết sự kiện, trạng thái, số lần thử, mã phản hồi và thời điểm; nút **Gửi lại** phát lại một lượt giao, **Làm mới** tải lại danh sách.

Xem thêm: [Nhận webhook](./webhooks.mdx).

### Người dùng ứng dụng

Tạo tài khoản đăng nhập cho người dùng ứng dụng của bạn: **Tên đăng nhập**, **Email**, **Mật khẩu tạm** (ít nhất 10 ký tự, người dùng phải đổi ở lần đăng nhập đầu).

Xem thêm: [Đăng nhập người dùng ứng dụng](./end-user-login.mdx).

### Lượt gọi API

Thẻ **Hôm nay** (số lượt / hạn mức) và bảng theo ngày: lượt gọi, lỗi 4xx, lỗi 5xx. Bấm **Làm mới** để cập nhật.

Xem thêm: [Gói dịch vụ & hạn mức](../concepts/plans.md).

## Tự động hóa thay vì bấm tay

Mọi việc ở trên làm được bằng Platform API với token đăng nhập developer, hữu ích khi bạn tạo dự án hàng loạt cho khách hàng mới:

```bash
curl -s -X POST http://localhost:9080/platform/v1/projects \
  -H "Authorization: Bearer $DEV_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Khách hàng ACME"}'
```

Xem [Platform API](../platform/overview.mdx) và Swagger tại `http://localhost:8090/docs`.
