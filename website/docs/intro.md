---
id: intro
title: Giới thiệu
slug: /intro
description: PeopleOS PaaS là gì, dành cho ai và tài liệu này dạy bạn những gì.
---

**PeopleOS** là nền tảng nhân sự & đãi ngộ nguồn mở. Ngoài ứng dụng HR có sẵn (People Workspace), PeopleOS mở lõi dữ liệu của mình thành một **PaaS**: developer đăng ký, tạo dự án, lấy **API key** và có ngay hồ sơ nhân viên, hợp đồng, nghỉ phép, bảng lương để xây ứng dụng riêng - không phải tự dựng cơ sở dữ liệu, phân quyền hay hạ tầng.

## Vì sao dùng PeopleOS PaaS?

- **Không tạo thêm "ốc đảo dữ liệu".** Ứng dụng chấm công, app tuyển dụng, chatbot nội bộ… cùng đọc ghi một lõi nhân sự thay vì mỗi phần mềm giữ một bản sao.
- **Bỏ qua phần hạ tầng.** Xác thực, cô lập dữ liệu giữa các công ty (multi-tenant), giới hạn tốc độ, webhook có chữ ký và nhật ký kiểm toán đã có sẵn.
- **Vẫn mở rộng được.** Thiếu bảng thì [tạo bảng riêng](./concepts/extending.md), thiếu thuộc tính thì thêm [trường tùy chỉnh](./concepts/extending.md#trường-tùy-chỉnh) - không cần viết SQL.
- **Nguồn mở, tự triển khai.** Apache-2.0, chạy được trên máy của bạn bằng Docker Compose hoặc trên Kubernetes.

## Bạn sẽ học gì

Tài liệu đi theo thứ tự như khi bạn thật sự xây một ứng dụng:

| Phần | Nội dung |
|---|---|
| [Bắt đầu nhanh](./getting-started.mdx) | Từ con số 0 tới lời gọi API đầu tiên trong khoảng 5 phút |
| [Cài đặt môi trường](./environment-setup.mdx) | Tự chạy toàn bộ PeopleOS trên máy để phát triển |
| Khái niệm cốt lõi | [Dự án & tenant](./concepts/projects.md), [API key](./concepts/api-keys.md), [mô hình dữ liệu](./concepts/data-model.md), [mở rộng](./concepts/extending.md), [sự kiện](./concepts/events.md), [gói & hạn mức](./concepts/plans.md), [cô lập dữ liệu](./concepts/isolation.md) |
| Hướng dẫn thực hành | [Dùng Developer Portal](./guides/developer-portal.md), [xây ứng dụng đầu tiên](./guides/first-app.mdx), [dữ liệu riêng](./guides/custom-data.mdx), [nhận webhook](./guides/webhooks.mdx), [đăng nhập người dùng](./guides/end-user-login.mdx), [lên môi trường thật](./guides/go-live.md) |
| Tham chiếu | [Platform API](./platform/overview.mdx), [HR Workspace API](./workspace/overview.mdx) |

## Kiến thức cần có

Bạn nên quen với **HTTP/JSON** và biết cơ bản về **GraphQL** (query, mutation, biến). Ví dụ trong tài liệu dùng `curl`, **Node.js 18+** và **Python 3.10+**. Không cần biết Keycloak, Hasura hay PostgreSQL - PeopleOS lo phần đó.

:::tip Cần trợ giúp?
Tra mục [Khắc phục sự cố](./guides/troubleshooting.md), tìm bằng ô tìm kiếm (<kbd>Ctrl</kbd> + <kbd>K</kbd>), hoặc [mở issue trên GitHub](https://github.com/Nguyen16112006/PeopleOS/issues).
:::
