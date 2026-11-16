---
slug: ba-lop-co-lap-tenant
title: Ba lớp cô lập dữ liệu giữa các tenant trong PeopleOS
authors: [nguyen]
tags: [paas, security]
---

Khi nhiều công ty dùng chung một cơ sở dữ liệu, câu hỏi quan trọng nhất là: *làm sao chắc chắn công ty A không bao giờ đọc được bảng lương của công ty B?* Bài này giải thích vì sao PeopleOS chọn **ba lớp chặn độc lập** thay vì tin vào một lớp.

<!-- truncate -->

## Chọn mô hình: pool, không phải database-per-tenant

PeopleOS đặt mọi tenant trong **một** PostgreSQL, mỗi dòng mang `tenant_id` (mô hình *pool*). Cách này rẻ, tạo tenant mới chỉ mất vài giây, và một bản nâng cấp schema áp cho mọi tenant cùng lúc. Cái giá phải trả: một lỗi lọc dữ liệu là đủ để lộ dữ liệu chéo. Vì vậy chúng tôi không dựa vào một lớp duy nhất.

## Lớp 1 - Permission của Hasura

Mọi permission của mọi vai trò đều có điều kiện `tenant_id = X-Hasura-Tenant-Id`. Giá trị này **không bao giờ** đến từ client: với API key, gateway xóa mọi header `x-hasura-*` do client gửi rồi tự gắn theo khóa; với người dùng, nó đến từ claim `tenant_id` trong JWT mà chỉ quản trị Keycloak sửa được.

## Lớp 2 - Row-Level Security

Nếu một permission bị cấu hình sai, PostgreSQL vẫn chặn. Mỗi bảng lõi có chính sách RLS đọc tenant từ biến phiên mà Hasura đặt. Chính sách viết theo kiểu **fail-closed**: không xác định được tenant thì trả về 0 dòng, không phải toàn bộ bảng. Bộ kiểm thử `scripts/tests/tenant_isolation.sql` chạy các ca như truy vấn không có tenant, ghi chéo tenant, view và audit log.

## Lớp 3 - Khóa ngoại tổng hợp

Lớp này chặn một kiểu lỗi tinh vi hơn: ghi một dòng **hợp lệ** của mình nhưng trỏ tới dữ liệu người khác, ví dụ tạo đơn nghỉ phép với `employee_id` của nhân viên công ty khác. Khóa ngoại `(tenant_id, employee_id) → employees(tenant_id, id)` làm việc này không thể xảy ra ở mức cơ sở dữ liệu.

## Những gì chưa hoàn hảo

Hasura v2 dùng chung một GraphQL schema, nên **tên** bảng riêng của tenant khác có thể hiện trong introspection (dữ liệu thì không). Chúng tôi ghi rõ điểm này trong [Bảo mật & cô lập dữ liệu](/docs/concepts/isolation#giới-hạn-đã-biết) cùng các giới hạn khác, vì developer cần biết chính xác những gì được bảo đảm trước khi đưa dữ liệu thật vào.
