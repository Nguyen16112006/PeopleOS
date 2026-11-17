# Tham chiếu API

Mọi lời gọi đi qua **API Gateway** `http://localhost:9080` và cần header `Authorization: Bearer <access_token>` (lấy từ Keycloak).

## Lấy token để thử bằng curl

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/peopleos/protocol/openid-connect/token \
  -d grant_type=password -d client_id=people-workspace \
  -d username=manager -d password='Peopleos@123' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
```

## 1. GraphQL (Hasura) - `POST /graphql`

Thêm header `x-hasura-role: <admin|hr|manager|employee>` (mặc định `employee`). Dữ liệu trả về bị lọc theo vai trò.

```bash
curl -s http://localhost:9080/graphql -H "Authorization: Bearer $TOKEN" -H "x-hasura-role: manager" \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ leave_requests(where:{status:{_eq:\"pending\"}}) { id days employee { full_name } } }"}'
```

Bảng: `users`, `employees`, `contracts`, `payrolls`, `insurance_records`, `leave_balances`, `leave_requests`, `salary_proposals`,
`approval_steps`, `onboarding_tasks`, `notifications`. Quản trị dữ liệu: `audit_logs` (chỉ role admin), `data_assets`, `data_lineage`,
và các view `v_kpi_summary`, `v_headcount_by_department`, `v_payroll_monthly`, `v_leave_summary`, `v_contracts_expiring` (HR/Admin). Hasura Console (`http://localhost:8081`) cho phép duyệt schema và tự sinh REST endpoint.
Frontend chỉ **đọc** bằng GraphQL (và đánh dấu đã đọc thông báo); mọi thao tác ghi nghiệp vụ đi qua BFF.

## 2. BFF REST - `/api/*`

| Method & đường dẫn | Vai trò | Mô tả |
|---|---|---|
| `GET /api/health` | công khai | Trạng thái BFF và kết nối NATS |
| `GET /api/me` | đăng nhập | Thông tin người dùng, vai trò, hồ sơ nhân sự, quản lý trực tiếp |
| `POST /api/leave-requests` | đăng nhập | Tạo đơn: `{leave_type, start_date, end_date, reason?}`. 400 nếu không đủ phép, 409 nếu trùng ngày |
| `POST /api/leave-requests/{id}/decision` | quản lý trực tiếp / HR / Admin | `{decision: "approve"\|"reject", note?}`. 403 nếu tự duyệt; 409 nếu đã xử lý |
| `POST /api/leave-requests/{id}/cancel` | chủ đơn | Huỷ đơn đang chờ |
| `POST /api/attendance/check-in`, `/check-out` | đăng nhập (cả 6 vai trò) | Chấm công vào/ra hôm nay (giờ Việt Nam). 409 nếu đã chấm, hoặc bảng công tháng đã gửi/đã chốt |
| `PUT /api/attendance/days` | đăng nhập / HR | Khai hoặc sửa công một ngày: `{work_date, status, work_days?, overtime_hours?, overtime_type?, note?, employee_id?}`. Tự khai: `status` ∈ `present`, `remote`, `business_trip`, không khai ngày chưa đến. HR (kèm `employee_id`) dùng được mọi loại: thêm `holiday`, `paid_leave`, `unpaid_leave`, `absent` |
| `GET /api/timesheets?year=&month=&employee_id=` | chủ bảng công / quản lý trực tiếp / HR / Kế toán / Giám đốc | Bảng công tháng tính trực tiếp: công chuẩn, công hưởng lương, nghỉ, vắng, giờ làm thêm, `missing_dates`, `status`, `editable` |
| `POST /api/timesheets/submit` | đăng nhập | `{year, month}`: gửi bảng công để xác nhận. 409 nếu đã gửi |
| `POST /api/timesheets/{id}/decision` | quản lý trực tiếp / HR / Giám đốc (người không có quản lý) | `{decision: "approve"\|"reject", note?}`; trả lại bắt buộc có `note`. 403 nếu tự xác nhận |
| `POST /api/payroll-runs` | HR | `{year, month}`: chốt công (khóa bảng công cả tháng) và tạo kỳ lương. 400 nếu tháng chưa kết thúc; 409 nếu đã có kỳ lương |
| `POST /api/payroll-runs/{id}/calculate` | Kế toán | `{adjustments?: [{employee_id, overtime_pay?, bonus?}]}`: tính lương theo bảng công đã chốt; `overtime_pay` để trống thì tự tính từ giờ làm thêm |
| `POST /api/payroll-runs/{id}/hr-review`, `/decision`, `/pay` | HR / Giám đốc / Kế toán | Rà soát, duyệt (`{decision, comment?}`), chi trả và phát hành phiếu lương |
| `POST /api/salary-proposals` | manager (nhóm mình) / hr / admin | `{employee_id, proposal_type: "raise"\|"allowance", proposed_amount, reason, effective_date?}` |
| `POST /api/salary-proposals/{id}/decision` | HR (bước 1) / Admin (mọi bước) | `{decision, comment?}`; duyệt cấp cuối sẽ cập nhật hợp đồng |
| `POST /api/employees` | hr / admin | Onboarding: tạo hồ sơ, hợp đồng, quỹ phép, tài khoản SSO; trả `employee_code` và mật khẩu tạm |
| `POST /api/onboarding-tasks/{id}/complete` | người phụ trách / HR / Admin | Đánh dấu hoàn thành |
| `GET /api/payslips/{id}/download` | chủ phiếu / hr / admin | PDF phiếu lương (sinh lần đầu rồi lưu MinIO) |
| `GET /api/contracts/{id}/download` | chủ hợp đồng / hr / admin | PDF hợp đồng (ưu tiên bản ký đã tải lên) |
| `POST /api/contracts/{id}/upload` | hr / admin | `multipart/form-data` trường `file` (≤ 10 MB). Quét ClamAV trước khi lưu MinIO: **422** nếu phát hiện mã độc, **415** nếu không phải PDF, **503** nếu ClamAV chưa sẵn sàng |
| `GET /api/audit/verify` | admin | Xác minh toàn vẹn chuỗi băm nhật ký: `{valid, checked, first_broken_seq, message}` |

Lỗi trả dạng `{"detail": "..."}`. Tài liệu OpenAPI tương tác của backend Java: `http://localhost:8000/swagger-ui.html` khi chạy cùng `docker-compose.dev.yml`.

### API nội bộ (chỉ Flowable, không đi qua gateway)

Các endpoint dưới đây yêu cầu header `x-internal-key`; tác vụ theo tenant gửi thêm `x-tenant-id`.

| Endpoint | Mục đích / body |
|---|---|
| `POST /api/internal/notify` | Tạo thông báo: `{user_id? \| role?, title, message, ref_type?, ref_id?, kind?}` |
| `POST /api/internal/onboarding/initialize` | Tạo checklist + thông báo onboarding; body là payload onboarding |
| `POST /api/internal/temp-access/expire` | Đánh dấu quyền tạm quá hạn |
| `POST /api/internal/offboarding/lock-due` | Khóa tài khoản đến ngày nghỉ việc |

Khóa nội bộ: `x-internal-key: $INTERNAL_API_KEY`.

## 3. WebSocket - `ws://localhost:9080/ws?token=<access_token>`

Server gửi `{"type":"connected"}` khi thành công, rồi `{"type":"notification","data":{id,title,message,ref_type,ref_id,created_at,kind}}`
mỗi khi có thông báo cho người dùng. Gửi chuỗi `ping` để giữ kết nối (nhận `pong`). Token sai → đóng với mã 4401.

## 4. AI Assistant - `/ai/*`

| Endpoint | Mô tả |
|---|---|
| `POST /ai/chat` | `{message, history?: [{role, content}]}` → `{intent, answer, sources[], mode}` |
| `GET /ai/health` | Số đoạn tri thức, trạng thái Ollama/Qdrant, `vector_ready` |
| `POST /reindex` (chỉ nội bộ, gateway chặn `/ai/reindex`) | Nạp lại `ai/knowledge` và ghi lại Qdrant |

`intent`: `net_calc` · `leave_status` · `leave_balance` · `payslip` · `rag`.
`mode`: `calculator` · `tool` · `llm+vector` · `llm+lexical` · `extractive+…` (LLM chưa sẵn sàng, trả đoạn trích) · `error`.

```bash
curl -s http://localhost:9080/ai/chat -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"Lương Gross 30 triệu thì thực nhận là bao nhiêu?"}'
```

## 5. Sự kiện NATS

| Subject | Payload |
|---|---|
| `peopleos.notify.<user_id>` | bản ghi thông báo (+ `kind`) - BFF chuyển xuống WebSocket |
| `peopleos.events.<kind>` | cùng payload; `kind` ∈ `leave.pending`, `leave.approved`, `leave.rejected`, `proposal.pending_hr`, `proposal.pending_admin`, `proposal.approved`, `proposal.rejected`, `onboarding.started`... |

Theo dõi nhanh: `docker run --rm --network peopleos_default natsio/nats-box nats sub -s nats://nats:4222 'peopleos.>'`
