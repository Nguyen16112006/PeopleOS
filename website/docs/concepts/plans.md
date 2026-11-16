---
id: plans
title: Gói dịch vụ & hạn mức
description: Hạn mức của gói free và pro, cách theo dõi và xử lý khi vượt hạn mức.
---

Mỗi dự án thuộc một **gói dịch vụ**. Dự án mới mặc định gói `free`.

| Hạn mức | `free` | `pro` |
|---|---|---|
| Request Data API / ngày | 10.000 | 1.000.000 |
| Tốc độ (request / giây, cho phép dồn) | 10 / 20 | 100 / 200 |
| Số dự án mỗi developer | 3 | 3 ¹ |
| API key đang hoạt động / dự án | 5 | 50 |
| Bảng dữ liệu riêng | 5 | 100 |
| Cột / bảng | 20 | 60 |
| Webhook đang hoạt động | 3 | 20 |
| Trường tùy chỉnh | 10 | 50 |

¹ Dự án mới luôn tạo ở gói `free`, nên giới hạn số dự án hiện luôn là 3, kể cả khi bạn đã có dự án `pro`.

:::note
PeopleOS **đo** lượt dùng nhưng **chưa có tính phí**. Đổi gói hiện do quản trị viên máy chủ thực hiện trong cơ sở dữ liệu control plane.
:::

## Khi vượt hạn mức

| Loại | Phản hồi |
|---|---|
| Tạo thêm dự án, khóa, bảng, cột, webhook, trường | `403` kèm `detail`, ví dụ `Gói free giới hạn 3 project` |
| Gọi Data API quá nhanh hoặc quá số lượt trong ngày | `429 Too Many Requests` |

Phản hồi Data API có header `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` để ứng dụng tự điều tiết.

### Xử lý `429` đúng cách

```js
async function withRetry(fn, max = 5) {
  for (let i = 0; ; i++) {
    const res = await fn();
    if (res.status !== 429 || i >= max) return res;
    const wait = Math.min(30_000, 500 * 2 ** i) + Math.random() * 250; // lùi theo cấp số nhân + nhiễu
    await new Promise((r) => setTimeout(r, wait));
  }
}
```

## Mẹo tiết kiệm lượt gọi

- Gộp nhiều truy vấn vào **một** request GraphQL (lấy nhân viên kèm hợp đồng, đơn nghỉ trong một lần).
- Dùng [webhook](./events.md) thay vì hỏi định kỳ mỗi vài giây.
- Bộ nhớ đệm phía máy chủ cho dữ liệu ít đổi (danh sách phòng ban, chức danh).

Theo dõi lượt dùng ở mục **Lượt gọi API** của portal hoặc [Usage API](../platform/usage.mdx).
