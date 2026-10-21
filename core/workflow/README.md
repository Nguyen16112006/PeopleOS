# Workflow (n8n)

6 workflow được nhập và kích hoạt tự động khi container khởi động:

| File | Webhook | Chức năng |
|---|---|---|
| `01-leave-request.json` | `POST /webhook/leave-request` | Gửi đơn nghỉ → thông báo người duyệt theo giai đoạn (Quản lý / HR / Giám đốc) và nhân viên |
| `02-leave-decision.json` | `POST /webhook/leave-decision` | Kết quả duyệt/từ chối → thông báo nhân viên (HR được BFF báo trực tiếp để chỉnh công) |
| `03-salary-proposal.json` | `POST /webhook/salary-proposal` | Duyệt nhiều cấp HR → Kế toán → Giám đốc: định tuyến thông báo theo từng sự kiện |
| `04-onboarding.json` | `POST /webhook/onboarding` | Sinh checklist hội nhập (Admin kiểm tra tài khoản, Kế toán nhận thông tin lương/BHXH/thuế), rồi thông báo HR, Kế toán, quản lý, nhân viên |
| `05-temp-access-expire.json` | Lịch mỗi phút | Gọi `POST /api/internal/temp-access/expire` để tự chuyển quyền tạm thời quá hạn sang `expired` |

n8n gọi ngược BFF qua `/api/internal/notify` và `/api/internal/onboarding-tasks` (header `x-internal-key`);
BFF lưu thông báo vào PostgreSQL và đẩy realtime qua NATS → WebSocket. Nếu n8n tạm ngừng, BFF dùng hàm dự phòng để thông báo vẫn đến.

| `06-offboarding-lock.json` | Lịch mỗi 15 phút | Gọi `POST /api/internal/offboarding/lock-due` để khóa tài khoản Keycloak của nhân viên đã hoàn tất nghỉ việc và đến ngày làm việc cuối |

Ghi chú: tạm ứng/chi phí và cấp quyền tạm thời do BFF thông báo trực tiếp (NotificationService), không đi qua n8n.
