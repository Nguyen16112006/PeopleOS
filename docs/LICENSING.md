# Chính sách giấy phép và các thành phần cần lưu ý

**Mã nguồn PeopleOS** phát hành theo **Apache-2.0** (xem [LICENSE](../LICENSE), [NOTICE](../NOTICE)); mỗi tệp mã có header SPDX
(`python scripts/spdx-headers.py --check`). Danh sách phần mềm bên thứ ba: [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).

Nguyên tắc: **ưu tiên thành phần có giấy phép OSI-approved**. Kết quả rà soát ghi ngày 06/11/2026.

## Đã khắc phục
| Vấn đề | Xử lý |
|---|---|
| Redis 7.4+ theo RSALv2/SSPLv1 (không thuộc OSI) - overlay PaaS dùng `redis:7-alpine` | Thay bằng **Valkey** (BSD-3-Clause), tương thích giao thức Redis nên APISIX `limit-count` không đổi cấu hình |
| `qwen2.5:3b` theo Qwen Research License (phi thương mại) | Mặc định `qwen2.5:1.5b` (Apache-2.0); có thể dùng `qwen2.5:7b` (Apache-2.0) nếu đủ RAM |
| `ollama/ollama:latest` không ghim | Ghim `0.32.6`, ghi đè bằng `OLLAMA_IMAGE`; `scripts/preflight.py --check-images` kiểm tra tag có tồn tại |
| Thiếu header giấy phép | Header SPDX + copyright cho mọi tệp mã; CI chặn tệp mới thiếu header |
| n8n theo Sustainable Use License (không thuộc OSI) | Thay bằng Flowable 7.1.0 (Apache-2.0); sáu quy trình đã chuyển thành BPMN trong `core/workflow/engine` |

## Còn lại - cần quyết định

### MinIO (Dữ liệu phi cấu trúc) - mã nguồn AGPL-3.0 nhưng **rủi ro chuỗi cung ứng**
Mã MinIO vẫn theo AGPL-3.0 (thuộc OSI). Nhưng từ 10/2025 upstream **ngừng phát hành image Docker và binary** cho bản cộng đồng, sau đó vào chế độ bảo trì
(chỉ vá lỗi bảo mật). Repo đang dùng bản **mirror bên thứ ba** `scnd/minio-mirror:RELEASE.2025-09-07T16-13-09Z` (ghim phiên bản):
không rõ nguồn build, khó kiểm chứng nguồn gốc. Cách giảm thiểu:
- Biến `MINIO_IMAGE` cho phép thay bằng image tự build từ mã nguồn upstream (đã ghim phiên bản) và đẩy lên registry của dự án.
- Phương án dài hạn: chuyển sang kho S3-tương thích còn hoạt động - **SeaweedFS** (Apache-2.0) hoặc Garage (AGPL-3.0). BFF dùng SDK S3 (`io.minio:minio`)
  qua biến môi trường endpoint/khóa, nên chuyển đổi chủ yếu là cấu hình + script khởi tạo bucket.

### Thành phần khác cần để ý
- **ClamAV (GPL-2.0)** chạy như dịch vụ riêng, giao tiếp qua giao thức INSTREAM - không liên kết mã với PeopleOS.
- **psycopg (LGPL-3.0)** trong `platform-api`: dùng như thư viện ngoài, không sửa đổi; bản phân phối container giữ nguyên gói gốc.
- **OpenPDF** (BFF): song giấy phép LGPL-2.1/MPL-2.0 - xác minh phiên bản cụ thể khi phát hành.
- **Hasura**: chỉ dùng bản community Apache-2.0; tính năng Enterprise/Cloud (rate-limit, read replica...) **không** dùng.

## Quy trình khi thêm phụ thuộc mới
1. Kiểm tra giấy phép (SPDX id) và ghi vào `THIRD_PARTY_LICENSES.md` kèm cột "Xác minh".
2. Không thêm thành phần theo RSAL/SSPL/BUSL/Elastic/Commons Clause/CC-BY-NC mà không ghi rõ trong tài liệu này.
3. Ghim phiên bản image/gói; không dùng `latest`.
