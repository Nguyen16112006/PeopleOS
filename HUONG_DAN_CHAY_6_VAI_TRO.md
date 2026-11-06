# Hướng dẫn chạy PeopleOS bản 6 vai trò

Bản này là PeopleOS gốc đã được nâng lên **6 vai trò** và **9 quy trình nghiệp vụ**. Chi tiết nghiệp vụ: `docs/ROLES_AND_WORKFLOWS.md`.

## 1. Chạy

Yêu cầu: Docker và Docker Compose v2.

```bash
cd PeopleOS
# Nếu trước đây đã chạy bản cũ, xóa dữ liệu cũ (bắt buộc: realm Keycloak chỉ được nạp khi CSDL còn trống)
cd infrastructure && docker compose down -v && cd ..

./scripts/setup.sh            # chạy đầy đủ (có AI)
./scripts/setup.sh --no-ai    # máy yếu: bỏ Ollama/Qdrant/RAG
```

Địa chỉ: ứng dụng `http://localhost:3000`, Keycloak `:8080`, Hasura `:8081`, gateway `:9080`. Flowable là dịch vụ nội bộ, không publish cổng host.

Tài khoản demo (mật khẩu chung `Peopleos@123`):

| Tài khoản | Vai trò | Họ tên |
|---|---|---|
| `employee` | Nhân viên | Phạm Thu Dung |
| `employee2` | Nhân viên | Hoàng Văn Em |
| `manager` | Quản lý | Lê Minh Cường |
| `hr` | HR | Trần Thị Bình |
| `accountant` | Kế toán | Vũ Thị Lan |
| `director` | Giám đốc | Hoàng Quốc Hùng |
| `admin` | Admin kỹ thuật (`sysadmin`) | Nguyễn Văn An |

## 2. Thử từng quy trình (gợi ý)

| Quy trình | Thử như sau | Trang |
|---|---|---|
| Đề xuất lương | `manager` đề xuất → `hr` thẩm định → `accountant` kiểm ngân sách → `director` duyệt | Đề xuất tăng lương, Phê duyệt |
| Nghỉ phép | `employee` gửi đơn → `manager` duyệt. Thử `manager` gửi đơn → `hr` → `director` | Nghỉ phép, Phê duyệt |
| Onboarding | `hr` tạo nhân viên mới | Onboarding |
| Nghỉ việc | `employee` xin nghỉ → `manager` chốt ngày → `hr` → bàn giao → chốt công → `accountant` lương cuối → `director` → chi trả → `hr` chấm dứt hợp đồng | Nghỉ việc |
| Tạm ứng / chi phí | `employee` gửi 25.000.000 đ → `manager` → `director` (cấp 2) → `accountant` chi → `employee` hoàn ứng → `accountant` quyết toán | Tạm ứng và chi phí |
| KPI quý | `hr` mở chu kỳ → `manager` giao mục tiêu (tổng 100%) và chấm → `director` giao/chấm cho `manager` → `hr` tổng hợp → `director` duyệt → `employee` xem và phản hồi | Đánh giá KPI |
| Kỳ lương | `hr` chốt công tháng → `accountant` tính → `hr` rà soát → `director` duyệt → `accountant` chi trả → `employee` khiếu nại phiếu lương → `hr` → `accountant` điều chỉnh | Kỳ lương, Bảng lương |
| Thuế và báo cáo năm | `hr` xác nhận → `accountant` quyết toán (phát chứng từ) → lập báo cáo → `director` duyệt → ngân sách năm sau | Thuế và báo cáo năm |
| Quyền tạm thời | `admin` tạo yêu cầu → `accountant` (hoặc `hr`) và `director` cùng duyệt | Quyền tạm thời |

Lưu ý: dữ liệu mẫu đã có lương **đã chi trả từ tháng 1 đến tháng 9/2026**. Hệ thống không cho chốt công tháng đã có lương đã chi trả, nên khi thử kỳ lương hãy chọn **tháng 10/2026** (giao diện mặc định là tháng trước, tức tháng 9, sẽ báo trùng). Trang Thuế và báo cáo năm dùng dữ liệu lương 2026 có sẵn.

## 3. Đã kiểm tra và chưa kiểm tra

Đã kiểm tra trong lần cập nhật này:
- BFF Java: `mvn test` đạt **71 test**.
- Flowable: `mvn test` đạt **3 test**, gồm xác thực API nội bộ, triển khai đủ 6 BPMN và tạo 2 timer jobs.
- Frontend: `npm run build` đạt.
- Compose: `docker compose config --quiet` đạt; header SPDX đầy đủ.

**Chưa chạy**: toàn bộ ngăn xếp Docker và luồng tích hợp đầu-cuối. Các điểm cần kiểm tra khi chạy lần đầu:
1. Spring Boot và Flowable khởi động (`docker compose logs bff flowable`): kết nối database, callback, timer jobs.
2. Hasura nạp metadata (`docker compose logs hasura`): quan hệ hoặc quyền sai tên.
3. Keycloak nạp realm mới (`docker compose logs keycloak`).
4. Flowable tự triển khai 6 BPMN khi khởi động (`docker compose logs flowable`).
5. APISIX nạp `apisix.yaml` với plugin `serverless-post-function` (`docker compose logs apisix`); nếu gateway trả 403/401 bất thường ở nhóm API có `guard-*` thì đây là chỗ cần xem.

## 4. Báo lỗi

Gửi kèm: lệnh vừa chạy, thông báo lỗi nguyên văn, và log liên quan:

```bash
cd infrastructure
docker compose ps
docker compose logs --tail=100 bff flowable hasura keycloak apisix
# kiểm tra riêng phần Java và giao diện
cd ../apps/people-workspace/bff && mvn test
cd ../frontend && npm ci && npm run build
```

## 5. Giới hạn đã biết

- **Quyền tạm thời mới là bản ghi và nhật ký**: chưa có API nào dùng quyền đó để mở dữ liệu cho Admin (`TempAccessService.hasActiveGrant` chưa được nối).
- Chưa có bảng chấm công chi tiết: tiền làm thêm giờ và thưởng do Kế toán nhập tay khi tính lương; lương tính đủ tháng, không theo ngày công thực tế.
- Việc khai và nộp thuế/BHXH định kỳ với cơ quan nhà nước nằm ngoài hệ thống.
- Giám đốc và Kế toán đọc đủ cột hồ sơ nhân viên (Hasura chỉ cho một bộ cột mỗi vai trò).
- Tài khoản Keycloak của nhân viên mới do hệ thống tạo tự động khi HR tạo hồ sơ (không qua bước Admin tạo tay như tài liệu mô tả ban đầu).
