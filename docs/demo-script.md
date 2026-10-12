# Kịch bản demo 15 phút

**Chuẩn bị (trước giờ demo):** chạy `./scripts/setup.sh`, chờ `ollama-init` xong, chạy `./infrastructure/monitoring/healthcheck.sh` (tất cả OK).
Mở sẵn 4 cửa sổ trình duyệt/ẩn danh: **A** = `employee`, **B** = `manager`, **C** = `hr`, **D** = `admin`; thêm tab Keycloak, Hasura Console, n8n, MinIO Console.
Mật khẩu chung `Peopleos@123`. Nếu cần làm lại từ đầu: `./scripts/seed-data.sh`.

| Phút | Nội dung | Thao tác | Thông điệp chính |
|---|---|---|---|
| 0:00 - 1:00 | **Mở đầu: bài toán 2 thái cực** | Sơ đồ trong `docs/architecture.md` | Ốc đảo dữ liệu và khóa nhà cung cấp; giải bằng một lõi mở dùng chung |
| 1:00 - 2:30 | **Tầng 1 - Open-Core** | `docker compose ps` (container healthy). Mở Keycloak (realm `peopleos`), Hasura Console (bảng + quyền theo role), MinIO (3 bucket), n8n (4 workflow Active) | Headless: không UI cuối, mọi thứ là dịch vụ thay thế được |
| 2:30 - 3:30 | **SSO + RBAC** | Cửa sổ A `employee`, B `manager`, C `hr`, D `admin`: menu và dữ liệu khác nhau theo vai trò | Một lần đăng nhập, quyền đổi theo vai trò |
| 3:30 - 4:45 | **Cổng tự phục vụ** (A) | Hồ sơ → Hợp đồng (Tải PDF) → Bảng lương (tải PDF) → BHXH/BHYT | PDF sinh và lưu trên MinIO; số liệu khớp luật 2026 |
| 4:45 - 6:45 | **Quy trình 1: Nghỉ phép + realtime** | A tạo đơn nghỉ phép năm 2 ngày → B nhận toast realtime → Duyệt → A nhận toast | Webhook n8n → backend → NATS → WebSocket |
| 6:45 - 9:00 | **Quy trình 2: Tăng lương nhiều cấp** | B đề xuất cho Phạm Thu Dung lên 24.000.000 → C (HR) duyệt → D (admin) duyệt cuối → A thấy hợp đồng đã cập nhật | Chuỗi Quản lý → HR → Giám đốc; tự áp dụng vào hợp đồng |
| 9:00 - 10:15 | **Quy trình 3: Onboarding** | C tạo nhân viên mới (bật tạo tài khoản SSO); checklist 6 việc; đánh dấu xong | Một thao tác: hồ sơ + hợp đồng + quỹ phép + SSO + checklist |
| 10:15 - 11:15 | **AI Assistant** (A) | "Gross 30 triệu thì Net?" (26.215.000 đ) · "Đơn nghỉ phép của tôi?" · "Thử việc tối đa bao lâu?" | Tính toán chính xác; RAG cục bộ có nguồn; AI chỉ thấy dữ liệu theo quyền người hỏi |
| 11:15 - 12:15 | **Kiểm dịch mã độc** (C) | Hợp đồng → "Tải bản ký lên" → chọn `eicar.txt` → bị từ chối "phát hiện mã độc"; tải một PDF thật → thành công | ClamAV quét trước khi vào MinIO; sự kiện được ghi vào nhật ký |
| 12:15 - 13:30 | **Kiểm toán & nhật ký bất biến** (D) | Trang **Kiểm toán**: xem các sự kiện vừa tạo (duyệt nghỉ, duyệt lương, `FILE.QUARANTINED`) → "Xác minh toàn vẹn" (xanh). Chạy lệnh giả mạo (xem `docs/governance.md` mục 3) → xác minh lại: **đỏ, chỉ ra seq hỏng** | Sửa/xóa bị chặn; kể cả khi bị vượt quyền vẫn **phát hiện** được nhờ chuỗi băm |
| 13:30 - 14:15 | **Dashboard điều hành + Phả hệ dữ liệu** (D) | Dashboard: KPI, chi phí lương theo tháng, hợp đồng sắp hết hạn → Phả hệ: bấm `payrolls` để thấy đi đâu và đụng dữ liệu PII nào | Ra quyết định dựa trên dữ liệu; biết dữ liệu đi đâu để đánh giá tác động |
| 14:15 - 15:00 | **Tự phục hồi, sao lưu, GitOps + chốt** | `docker kill peopleos-bff-1` → tự hồi sinh; `./scripts/verify-backup.sh` → "khôi phục được, chuỗi toàn vẹn"; nhắc CI + GitOps agent; quay lại sơ đồ | Hệ thống tự lành, có bằng chứng khôi phục được, thay đổi đi qua Git |

## Kịch bản dự phòng
- **Không có mạng / mô hình AI chưa tải xong:** trợ lý vẫn trả lời bằng đoạn trích có nguồn (nhãn "Trích dẫn"), câu hỏi Gross/Net và nghỉ phép không bị ảnh hưởng.
- **Realtime không hiện:** kiểm tra biểu tượng "Realtime: đã kết nối" ở góc trái dưới; thông báo vẫn nằm trong chuông và trong CSDL.
- **Muốn demo quyền:** đăng nhập `employee` và thử vào `/approvals` (bị chuyển về Tổng quan); gọi GraphQL bằng token employee để chỉ ra chỉ thấy dữ liệu của mình.
- **Làm lại từ đầu:** `./scripts/seed-data.sh` (đặt lại dữ liệu mẫu, không xóa tài khoản Keycloak do onboarding tạo; nhật ký kiểm toán là bất biến nên KHÔNG bị xóa - sẽ có thêm các dòng `DB.INSERT` mới).
- **ClamAV chưa sẵn sàng (đang tải chữ ký):** đặt `CLAMAV_FAIL_OPEN=true` trong `.env` rồi `docker compose up -d bff` để demo, hoặc trình bày bằng ảnh chụp bước tải EICAR.
- **Chuẩn bị trước giờ demo:** tạo sẵn `eicar.txt` (xem `docs/governance.md` mục 1) và sẵn lệnh giả mạo nhật ký ở một cửa sổ terminal.

## Câu hỏi thường gặp của ban giám khảo
- *Thay Keycloak/MinIO bằng sản phẩm khác thì sao?* Chỉ đổi cấu hình endpoint vì giao tiếp bằng OIDC/JWKS và S3 API.
- *Dữ liệu AI có ra ngoài không?* Không: Ollama, Qdrant chạy cục bộ trong Docker.
- *Mở rộng phân hệ mới thế nào?* Tạo ứng dụng Tầng 2 mới, đăng ký client Keycloak, thêm bảng + quyền trong Hasura, thêm workflow n8n.
