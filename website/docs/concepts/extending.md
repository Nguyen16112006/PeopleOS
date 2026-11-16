---
id: extending
title: Mở rộng dữ liệu
description: Hai cách mở rộng lõi nhân sự - bảng dữ liệu riêng và trường tùy chỉnh - và khi nào dùng cách nào.
---

Lõi nhân sự dùng chung cho mọi dự án nên không sửa cấu trúc được. Khi ứng dụng cần thêm dữ liệu, PeopleOS cho hai cách, **đều không cần viết SQL**:

| | Trường tùy chỉnh | Bảng dữ liệu riêng |
|---|---|---|
| Dùng khi | Thêm vài **thuộc tính** cho nhân viên | Cần **thực thể mới** có nhiều dòng (đổi ca, thiết bị, khóa học…) |
| Lưu ở | Cột `employees.custom` (jsonb) | Bảng `ext_<mã dự án>.<tên bảng>` |
| Kiểu dữ liệu | `string` · `number` · `boolean` · `date` · `enum` | `text` · `int` · `bigint` · `numeric` · `boolean` · `date` · `timestamptz` · `uuid` · `jsonb` |
| Kiểm tra | Trigger kiểm kiểu, bắt buộc, danh sách chọn | Ràng buộc PostgreSQL (`NOT NULL`, `UNIQUE`, khóa ngoại tới `employees`) |
| Tốc độ thêm | Tức thì | Vài giây (tạo bảng + cập nhật GraphQL) |
| Giới hạn gói `free` | 10 trường | 5 bảng, 20 cột / bảng |

## Trường tùy chỉnh

Ví dụ: thêm cỡ áo đồng phục và mã máy chấm công vân tay.

```json
{"key": "shirt_size", "type": "enum", "options": ["S", "M", "L", "XL"]}
{"key": "fingerprint_id", "type": "string", "required": true}
```

Sau khi khai báo, đọc ghi như một khóa trong `custom`:

```graphql
mutation {
  update_employees_by_pk(pk_columns: {id: "…"}, _append: {custom: {shirt_size: "M"}}) { custom }
}
```

Giá trị sai (ví dụ `"XXL"`), khóa chưa khai báo, hay thiếu `fingerprint_id` khi `required` đều bị **từ chối ngay ở cơ sở dữ liệu**, nên mọi ứng dụng ghi vào dự án đều phải tuân theo.

## Bảng dữ liệu riêng

Ví dụ: bảng `shift_swaps` để nhân viên đổi ca với nhau.

```json
{
  "table": "shift_swaps",
  "columns": [
    {"name": "requester_id", "type": "uuid", "nullable": false, "references": "employees"},
    {"name": "shift_date", "type": "date", "nullable": false},
    {"name": "status", "type": "text", "nullable": false}
  ]
}
```

Hệ thống tự thêm `id`, `tenant_id`, `created_at`, bật cô lập theo tenant và đưa bảng vào GraphQL với tiền tố dự án:

```graphql
query { ext_pk3x9q2m_shift_swaps(order_by: {shift_date: asc}) { id shift_date status } }
```

`references: "employees"` tạo **khóa ngoại tổng hợp** `(tenant_id, requester_id)`: không thể trỏ tới nhân viên của dự án khác.

Mỗi lần tạo hoặc xóa bảng được ghi thành một **phiên bản schema** (kèm DDL đã chạy) để bạn kiểm tra lại lịch sử thay đổi.

:::caution
Xóa bảng là **xóa luôn dữ liệu** trong bảng. Chưa hỗ trợ thêm/bớt cột trên bảng đã có: tạo bảng mới, chuyển dữ liệu, rồi xóa bảng cũ.
:::

Làm từng bước: [Dữ liệu riêng cho ứng dụng](../guides/custom-data.mdx). Tham chiếu: [Schema](../platform/schema.mdx), [Trường tùy chỉnh](../platform/custom-fields.mdx).
