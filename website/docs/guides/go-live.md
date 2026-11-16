---
id: go-live
title: Lên môi trường chính thức
description: Danh sách việc cần làm trước khi ứng dụng của bạn dùng dữ liệu nhân sự thật.
---

Dữ liệu nhân sự là **dữ liệu cá nhân** (lương, số BHXH, mã số thuế, người phụ thuộc). Trước khi đưa dữ liệu thật vào, rà soát hai phần: ứng dụng của bạn và máy chủ PeopleOS.

## Ứng dụng của bạn

- [ ] Dùng **dự án riêng** cho chính thức, tách khỏi dự án thử nghiệm.
- [ ] Tạo khóa **Chính thức (live)** mới; thu hồi mọi khóa từng dùng khi phát triển.
- [ ] Mỗi dịch vụ một khóa, **quyền tối thiểu** (`read` khi không cần ghi).
- [ ] Khóa và secret webhook nằm trong trình quản lý bí mật, không có trong Git, log hay frontend.
- [ ] Endpoint webhook dùng `https`, **xác minh chữ ký**, chống trùng theo `id`, trả lời trong 10 giây.
- [ ] Xử lý `429` bằng lùi theo cấp số nhân; theo dõi **Lượt gọi API** so với hạn mức.
- [ ] Máy chủ kiểm **chữ ký, `azp`, `tenant_id`** của token người dùng; tự kiểm quyền trước khi ghi bằng khóa `write`.
- [ ] Có kế hoạch đối soát dữ liệu khi webhook lỗi kéo dài.
- [ ] Không đặt thông tin nhạy cảm trong **tên** bảng hoặc cột riêng (tên có thể lộ qua introspection).

## Máy chủ PeopleOS (nếu bạn tự triển khai)

- [ ] Đổi **mọi** mật khẩu, khóa mặc định (`change_me…`, `Peopleos@123`); dùng Vault hoặc External Secrets.
- [ ] Hasura chạy bằng role **`hasura_app`** (không superuser) để **RLS có hiệu lực**; tắt console và dev mode.
- [ ] Keycloak chạy chế độ `start` (không `start-dev`), có SMTP và bật xác minh email cho realm developer.
- [ ] `ALLOW_HTTP_WEBHOOKS` và `ALLOW_PRIVATE_WEBHOOKS` là `false`; worker đi qua egress proxy chỉ cho IP công khai.
- [ ] TLS trên gateway; chỉ gateway, BFF và control plane được nói chuyện với Hasura (NetworkPolicy).
- [ ] Sao lưu định kỳ và **thử khôi phục** (`scripts/backup.sh`, `scripts/verify-backup.sh`).
- [ ] Chạy `python scripts/preflight.py --paas --check-images` và `python scripts/smoke-paas.py` trên môi trường đích.
- [ ] Có chính sách lưu giữ và xóa dữ liệu cá nhân phù hợp quy định pháp luật hiện hành (dự án xóa chỉ là xóa mềm).

Checklist đầy đủ cho người vận hành: [`docs/paas/README.md` - Checklist production](https://github.com/Nguyen16112006/PeopleOS/blob/main/docs/paas/README.md).
