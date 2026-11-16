---
id: roles
title: Vai trò & quyền
description: Ma trận RBAC của 6 vai trò và quy tắc kiểm soát áp dụng cho mọi API.
---

Trang này tóm tắt quyền của từng vai trò. Mô tả đầy đủ 9 quy trình nghiệp vụ (kèm sơ đồ) nằm ở [`docs/ROLES_AND_WORKFLOWS.md`](https://github.com/Nguyen16112006/PeopleOS/blob/main/docs/ROLES_AND_WORKFLOWS.md).

## Quy tắc kiểm soát

1. **Không tự duyệt** yêu cầu của chính mình (API trả `403`).
2. Admin (`sysadmin`) không đọc lương, hợp đồng, BHXH; chỉ có quyền tạm thời qua [quy trình cấp quyền tạm thời](./workspace/temp-access.mdx).
3. Quản lý chỉ thấy dữ liệu nhân viên **trong nhóm mình** (quan hệ `manager_id` một tầng).
4. Giám đốc chỉ xem tổng hợp, không xem từng phiếu lương cá nhân.
5. Mọi thao tác nhạy cảm ghi vào **audit log** dạng chuỗi băm, kiểm tra được bằng [`GET /api/audit/verify`](./workspace/audit.mdx).

## Ma trận quyền

Ký hiệu: **C** tạo · **R** xem · **U** sửa · **A** duyệt · **S** chỉ của bản thân · **T** chỉ nhóm mình · **—** không có quyền

| Tài nguyên | Nhân viên | Quản lý | HR | Giám đốc | Kế toán | Admin |
|---|---|---|---|---|---|---|
| Hồ sơ cá nhân | R,U (S) | R (T, cơ bản) | C,R,U | R (tổng hợp) | R (thuế/BH) | — |
| Hợp đồng lao động | R (S) | — | C,R,U | R (tổng hợp) | R | — |
| Phiếu lương | R (S) | — | R (rà soát) | R (tổng hợp) | C,R,U | — |
| Bảng lương tháng | — | — | R, rà soát | A | C,R,U | — |
| Chấm công / OT | R,C (S) | A (T) | R,U, chốt công | R | R | — |
| Nghỉ phép | C,R (S) | A (T) | R,U | A (QL, HR, KT, Admin) | — | — |
| Đề xuất lương/thưởng | R (S) | C | Thẩm định | A (cuối) | Kiểm ngân sách | — |
| KPI / đánh giá | R (S), phản hồi | C,U (T) | Mở chu kỳ, tổng hợp | A, đánh giá QL | — | — |
| Tạm ứng / chi phí | C (S) | A cấp 1 (T) | — | A cấp 1/cấp 2 | Kiểm tra, chi | — |
| Thuế TNCN / BHXH | R (S) | — | Xác nhận NPT | R (tổng hợp) | C,R,U | — |
| Báo cáo tài chính năm | — | — | — | A | C,R,U | — |
| Ngân sách / quỹ lương | — | — | R | A | R | — |
| Tài khoản & vai trò | — | — | Yêu cầu tạo | — | — | C,R,U |
| Cấp quyền tạm thời | — | — | A (hồ sơ) | A | A (lương) | C |
| Audit log | — | — | R | R | — | R |

## Tham số cấu hình

| Tham số | Giá trị mặc định | Nơi lưu |
|---|---|---|
| Ngưỡng duyệt cấp 2 tạm ứng/chi phí | 20.000.000 VND | `app_settings` |
| Chu kỳ KPI | Hằng quý | - |
| Thời lượng quyền tạm thời | 5 - 1440 phút | request body |
