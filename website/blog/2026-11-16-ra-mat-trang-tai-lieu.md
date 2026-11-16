---
slug: ra-mat-trang-tai-lieu
title: Ra mắt trang tài liệu cho developer
authors: [nguyen]
tags: [docs, paas]
---

Từ hôm nay, PeopleOS có trang tài liệu riêng cho developer muốn xây ứng dụng trên nền tảng nhân sự của chúng tôi.

<!-- truncate -->

Trước đây, muốn dùng PeopleOS PaaS bạn phải đọc mã nguồn và vài tệp README rải rác. Trang mới gom tất cả về một chỗ, sắp xếp theo đúng thứ tự bạn cần khi làm một ứng dụng:

1. **[Bắt đầu nhanh](/docs/getting-started)** - tạo dự án, lấy API key, gọi API đầu tiên trong khoảng 5 phút.
2. **Khái niệm cốt lõi** - [dự án & tenant](/docs/concepts/projects), [API key](/docs/concepts/api-keys), [mô hình dữ liệu](/docs/concepts/data-model), [mở rộng dữ liệu](/docs/concepts/extending), [sự kiện](/docs/concepts/events).
3. **[Tutorial: xây ứng dụng đầu tiên](/docs/guides/first-app)** - một ứng dụng Node.js quản lý nghỉ phép, có nhận webhook, không cần thư viện ngoài.
4. **Tham chiếu** - mọi endpoint của [Platform API](/docs/platform/overview) và [HR Workspace API](/docs/workspace/overview), kèm vai trò được gọi, bảng trường và thông báo lỗi.

Tất cả endpoint, trường dữ liệu và thông báo lỗi đều được đối chiếu với mã nguồn bản 2.3.0. Trang được dựng bằng Docusaurus và nằm ngay trong kho mã (`website/`), nên khi API thay đổi, tài liệu được sửa trong cùng pull request.

Thấy chỗ nào chưa rõ hay sai? Bấm **Sửa trang này** ở cuối mỗi trang để gửi pull request, hoặc [mở issue](https://github.com/Nguyen16112006/PeopleOS/issues).
