# Event Bus (NATS)

Quy ước subject:

| Subject | Ý nghĩa |
|---|---|
| `peopleos.notify.<user_id>` | Thông báo realtime cho một người dùng (BFF đẩy xuống WebSocket) |
| `peopleos.events.<domain>.<action>` | Sự kiện nghiệp vụ (leave.created, proposal.approved, ...) phục vụ audit/tích hợp |

Bất kỳ dịch vụ nào cũng có thể đăng ký `peopleos.events.>` để mở rộng (ví dụ đồng bộ kế toán).
