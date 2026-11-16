---
title: Cộng đồng
description: Cách đặt câu hỏi, báo lỗi và đóng góp cho PeopleOS.
---

# Cộng đồng PeopleOS

PeopleOS là dự án nguồn mở theo giấy phép **Apache-2.0**. Mọi người đều có thể dùng, sửa và đóng góp.

## Đặt câu hỏi và báo lỗi

| Bạn muốn | Ở đâu |
|---|---|
| Báo lỗi | [GitHub Issues - mẫu **[Lỗi]**](https://github.com/Nguyen16112006/PeopleOS/issues/new/choose) |
| Đề xuất tính năng | [GitHub Issues - mẫu **[Đề xuất]**](https://github.com/Nguyen16112006/PeopleOS/issues/new/choose) |
| Báo lỗ hổng bảo mật | **Không** mở issue công khai - làm theo [SECURITY.md](https://github.com/Nguyen16112006/PeopleOS/blob/main/SECURITY.md) |
| Hỏi cách dùng | Tìm trong tài liệu (<kbd>Ctrl</kbd> + <kbd>K</kbd>) và [Khắc phục sự cố](/docs/guides/troubleshooting) trước, rồi mở issue |

Khi báo lỗi, gửi kèm phiên bản PeopleOS, các bước tái hiện, kết quả mong đợi và thực tế, cùng log liên quan. **Xóa API key, secret và dữ liệu cá nhân** trước khi dán log.

## Đóng góp

1. Đọc [CONTRIBUTING.md](https://github.com/Nguyen16112006/PeopleOS/blob/main/CONTRIBUTING.md) và [Quy tắc ứng xử](https://github.com/Nguyen16112006/PeopleOS/blob/main/CODE_OF_CONDUCT.md).
2. Tìm issue phù hợp hoặc mở issue mô tả việc bạn định làm.
3. Fork, tạo nhánh, viết code **kèm test**, chạy CI cục bộ.
4. Mở pull request liên kết tới issue.

### Đóng góp cho tài liệu

Tài liệu nằm trong thư mục [`website/`](https://github.com/Nguyen16112006/PeopleOS/tree/main/website) của kho mã. Mỗi trang có nút **Sửa trang này** ở cuối để mở ngay trình sửa trên GitHub.

```bash
cd website
npm install
npm start      # xem trước tại http://localhost:3000/PeopleOS/
npm run build  # kiểm tra link hỏng trước khi mở PR
```

Khi sửa controller hoặc DTO trong BFF hay platform-api, hãy cập nhật trang tham chiếu tương ứng trong **cùng** pull request.

## Giấy phép

Mã nguồn và tài liệu: Apache-2.0. Kho mã tuân theo chuẩn [REUSE](https://reuse.software). Giấy phép của các thành phần bên thứ ba xem [docs/LICENSING.md](https://github.com/Nguyen16112006/PeopleOS/blob/main/docs/LICENSING.md).
