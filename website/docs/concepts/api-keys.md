---
id: api-keys
title: API key
description: Quyền, môi trường, cách lưu trữ và vòng đời của API key.
---

**API key** là cách máy chủ của bạn chứng minh "tôi thuộc dự án X". Mỗi request tới [Data API](../platform/data-api.mdx) gửi khóa trong header `X-API-Key`; gateway từ đó biết **dự án nào** và **được làm gì**.

```text
pos_test_1a2b3c4d_Xy9…
│   │    │        └─ phần bí mật
│   │    └────────── tiền tố 8 ký tự (hiện trong danh sách để bạn nhận ra khóa)
│   └─────────────── test = sandbox · live = chính thức
└─────────────────── PeopleOS
```

## Quyền (scope)

| Quyền trên portal | `scope` | Được làm |
|---|---|---|
| **Chỉ đọc** | `read` | Mọi `query` trên dữ liệu của dự án |
| **Đọc và ghi** | `write` | `query` + `insert` / `update` / `delete` (trừ bảng `users`, `audit_logs`) |

Nguyên tắc **quyền tối thiểu**: dịch vụ báo cáo hay dashboard chỉ cần khóa `read`; chỉ dịch vụ thật sự ghi dữ liệu mới cầm khóa `write`.

:::warning Ghi trực tiếp không qua quy trình duyệt
Khóa `write` ghi thẳng vào bảng nghiệp vụ. Ví dụ, bạn có thể đặt `status = "approved"` cho một đơn nghỉ phép mà không qua bước duyệt nào. Ứng dụng của bạn tự chịu trách nhiệm về logic nghiệp vụ.
:::

## Môi trường

`sandbox` và `live` hiện chỉ là **nhãn** (tiền tố `pos_test_` / `pos_live_`) để bạn phân biệt khóa; cả hai cùng truy cập dữ liệu của dự án và cùng tính vào hạn mức. Muốn tách hẳn dữ liệu thử và dữ liệu thật, dùng [hai dự án](./projects.md#một-hay-nhiều-dự-án).

## Lưu trữ an toàn

- PeopleOS chỉ lưu **SHA-256** của khóa; khóa đầy đủ hiện **một lần** khi tạo. Mất khóa thì tạo khóa mới và thu hồi khóa cũ.
- Đặt khóa trong biến môi trường hoặc trình quản lý bí mật (Vault, GitHub Actions secrets…), không ghi vào mã nguồn.
- **Không bao giờ** đưa khóa vào trình duyệt hay ứng dụng di động - bất kỳ ai mở DevTools đều đọc được.

## Xoay vòng khóa

1. Tạo khóa mới cùng quyền.
2. Triển khai khóa mới cho dịch vụ.
3. Theo dõi [mức sử dụng](../platform/usage.mdx) để chắc khóa cũ không còn được gọi.
4. **Thu hồi** khóa cũ - có hiệu lực ngay lập tức.

Số khóa đang hoạt động bị giới hạn theo [gói](./plans.md) (gói `free`: 5 khóa / dự án).

Tham chiếu: [API key](../platform/api-keys.mdx).
