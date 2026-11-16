# Trang tài liệu API PeopleOS

Trang tài liệu cho developer, dựng bằng [Docusaurus](https://docusaurus.io/) (cùng công cụ với reactnative.dev).

## Chạy cục bộ

```bash
cd website
npm install
npm start            # http://localhost:3000/PeopleOS/ - tự tải lại khi sửa file
```

Build bản tĩnh (thư mục `build/`) và xem thử:

```bash
npm run build
npm run serve
```

`npm run build` **thất bại nếu có link hỏng**, nên hãy chạy trước khi mở PR.

## Cấu trúc

| Đường dẫn | Nội dung |
|---|---|
| `docs/*.md(x)` | Hướng dẫn: giới thiệu, bắt đầu nhanh, xác thực, quy ước, vai trò, GraphQL, realtime, AI |
| `docs/workspace/` | Tham chiếu HR Workspace API (BFF `/api/*`) - mỗi nhóm nghiệp vụ một trang |
| `docs/platform/` | Tham chiếu Platform API (PaaS `/platform/v1/*`, `/v1/data`, webhook) |
| `sidebars.js` | Ba sidebar: Hướng dẫn · API · Platform |
| `src/components/Endpoint.js` | Khối `<Endpoint method path roles />` và chip `<Role id />` |
| `src/theme/MDXComponents.js` | Đăng ký `Endpoint`, `Role`, `Tabs`, `TabItem` cho mọi trang (không cần import) |
| `src/css/custom.css` | Theme navy, khớp bảng màu developer-portal |

## Viết một trang endpoint

```mdx
### Duyệt hoặc từ chối

<Endpoint method="POST" path="/api/leave-requests/{id}/decision" roles={['manager', 'hr', 'director']} />

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `decision` | enum | Có | `approve` \| `reject` |
```

Khóa vai trò cho `roles`: `employee`, `manager`, `hr`, `director`, `accountant`, `sysadmin`, và `any`, `owner`, `public`, `developer`, `apikey`, `internal`.

**Nguồn sự thật là code.** Khi đổi controller/DTO trong `apps/people-workspace/bff` hoặc `apps/platform/platform-api`, cập nhật trang tương ứng trong cùng PR.

## Triển khai

Workflow `.github/workflows/docs.yml` build và đăng lên GitHub Pages khi có thay đổi trong `website/` trên nhánh `main`
(bật *Settings → Pages → Source: GitHub Actions* một lần). Đổi domain bằng biến `DOCS_URL` và `DOCS_BASE_URL`.
