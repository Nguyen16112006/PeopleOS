# Workflow (n8n)

4 workflow được nhập và kích hoạt tự động khi container khởi động:

| File | Webhook | Chức năng |
|---|---|---|
| `01-leave-request.json` | `POST /webhook/leave-request` | Gửi đơn nghỉ → thông báo quản lý (hoặc HR) và nhân viên |
| `02-leave-decision.json` | `POST /webhook/leave-decision` | Kết quả duyệt/từ chối → thông báo nhân viên (+ HR khi duyệt) |
| `03-salary-proposal.json` | `POST /webhook/salary-proposal` | Duyệt nhiều cấp HR → Giám đốc: định tuyến thông báo theo từng sự kiện |
| `04-onboarding.json` | `POST /webhook/onboarding` | Sinh checklist hội nhập, rồi thông báo HR, quản lý, nhân viên |

n8n gọi ngược BFF qua `/api/internal/notify` và `/api/internal/onboarding-tasks` (header `x-internal-key`);
BFF lưu thông báo vào PostgreSQL và đẩy realtime qua NATS → WebSocket. Nếu n8n tạm ngừng, BFF dùng hàm dự phòng để thông báo vẫn đến.
