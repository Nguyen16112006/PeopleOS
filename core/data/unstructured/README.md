# Dữ liệu phi cấu trúc (MinIO)

| Bucket | Nội dung | Quy ước object key |
|---|---|---|
| `contracts` | Hợp đồng lao động (PDF) | `<employee_id>/<contract_no>.pdf` |
| `payslips` | Phiếu lương theo tháng | `<employee_id>/<yyyy>-<mm>.pdf` |
| `documents` | Chứng từ, hồ sơ khác | tự do |

Không bucket nào công khai. Mọi truy cập đi qua BFF, BFF kiểm tra vai trò rồi mới đọc từ MinIO.
