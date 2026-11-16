---
id: conventions
title: Quy ước & mã lỗi
description: Định dạng JSON, ngày giờ, tiền tệ, mã trạng thái HTTP và cấu trúc lỗi chung của mọi API PeopleOS.
---

## Định dạng dữ liệu

| Quy ước | Chi tiết |
|---|---|
| Tên trường JSON | **`snake_case`** ở cả request và response (`leave_type`, `start_date`, `employee_id`) |
| Ngày | ISO 8601 `YYYY-MM-DD` (ví dụ `2026-12-01`) |
| Thời điểm | ISO 8601 có múi giờ (`2026-11-16T08:30:00+07:00`). Chấm công tính theo **giờ Việt Nam** |
| Tiền | Số nguyên **VND**, không có phần lẻ (`25000000`) |
| ID | UUID dạng chuỗi |
| Bộ ký tự | UTF-8; thông báo lỗi bằng tiếng Việt |

## Cấu trúc lỗi

Mọi lỗi của BFF và platform-api đều trả về một đối tượng có trường `detail`:

```json
{"detail": "Không thể tự duyệt đơn của chính mình"}
```

Lỗi kiểm tra dữ liệu (422) gộp các trường sai, cách nhau bằng `; `:

```json
{"detail": "leaveType: loại nghỉ không hợp lệ; startDate: must not be null"}
```

## Mã trạng thái HTTP

| Mã | Khi nào |
|---|---|
| `200 OK` | Thành công |
| `201 Created` | Tạo mới thành công (đơn, đề xuất, kỳ lương, project, API key…) |
| `202 Accepted` | Đã xếp hàng xử lý (gửi thử webhook, phát lại delivery) |
| `204 No Content` | Xóa / thu hồi thành công |
| `400 Bad Request` | JSON sai định dạng, ngày không hợp lệ, vi phạm nghiệp vụ (ví dụ không đủ ngày phép, tháng chưa kết thúc) |
| `401 Unauthorized` | Thiếu hoặc sai token / API key / khóa nội bộ |
| `403 Forbidden` | Sai vai trò, sai bước duyệt, tự duyệt chính mình, vượt giới hạn gói |
| `404 Not Found` | Không có bản ghi, hoặc bản ghi thuộc tenant/người khác (không phân biệt hai trường hợp) |
| `409 Conflict` | Trạng thái không cho phép (đã xử lý, trùng ngày, đã gửi, đã chốt) |
| `413 Payload Too Large` | Tệp tải lên lớn hơn 10 MB |
| `415 Unsupported Media Type` | Tệp tải lên không phải PDF |
| `422 Unprocessable Entity` | Dữ liệu không qua kiểm tra (thiếu trường bắt buộc, sai enum, sai độ dài) - hoặc tệp chứa mã độc |
| `429 Too Many Requests` | Vượt hạn mức gói (chỉ với API key) |
| `502 Bad Gateway` | Lỗi từ tầng dữ liệu (Hasura); `detail` bắt đầu bằng `Lỗi dữ liệu:` |
| `503 Service Unavailable` | Dịch vụ phụ thuộc chưa sẵn sàng (ví dụ ClamAV) |

## Cách đọc trang tham chiếu

Mỗi endpoint có:

1. **Khối endpoint**: phương thức, đường dẫn, các vai trò được gọi.
2. **Body**: bảng trường với cột *Kiểu*, *Bắt buộc*, *Mô tả*.
3. **Phản hồi**: ví dụ JSON khi thành công.
4. **Lỗi thường gặp**: các mã ngoài 401/422 chung.

Trường không bắt buộc có thể bỏ qua hoặc gửi `null`.
