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
| MinIO: upstream ngừng phát hành image cộng đồng từ 10/2025; repo từng dùng image mirror bên thứ ba `scnd/minio-mirror` (không rõ nguồn build) | Build MinIO + mc từ tag phát hành chính thức trên github.com/minio bằng [`core/data/unstructured/minio/Dockerfile`](../core/data/unstructured/minio/Dockerfile) (không sửa mã); image kèm văn bản AGPL-3.0 và link mã nguồn tương ứng tại `/licenses`. CI build image này ở mỗi lần chạy |
| Image `hasura/graphql-engine` thường (từ v2.12.0) chứa thêm thành phần Enterprise độc quyền | Dùng tag Community `v2.40.0-ce` / `v2.40.0-ce.cli-migrations-v3` (chỉ phần mã nguồn mở) ở compose, `Dockerfile.metadata` và manifest Kubernetes |

## Còn lại - cần để ý

### Thành phần khác cần để ý
- **ClamAV (GPL-2.0)** chạy như dịch vụ riêng, giao tiếp qua giao thức INSTREAM - không liên kết mã với PeopleOS.
- **psycopg (LGPL-3.0)** trong `platform-api`: dùng như thư viện ngoài, không sửa đổi; bản phân phối container giữ nguyên gói gốc.
- **OpenPDF** (BFF): song giấy phép LGPL-2.1/MPL-2.0 - xác minh phiên bản cụ thể khi phát hành.
- **MinIO (AGPL-3.0)** chạy như dịch vụ riêng, BFF truy cập qua API S3 (`io.minio:minio`, Apache-2.0). Upstream đang ở chế độ bảo trì; nếu cần kho S3
  còn phát triển tích cực, có thể chuyển sang **SeaweedFS** (Apache-2.0) - chủ yếu là đổi cấu hình endpoint/khóa và script khởi tạo bucket.
- **Hasura**: chỉ dùng bản Community (`-ce`); tính năng Enterprise/Cloud (rate-limit, read replica...) **không** dùng.

## Quy trình khi thêm phụ thuộc mới
1. Kiểm tra giấy phép (SPDX id) và ghi vào `THIRD_PARTY_LICENSES.md` kèm cột "Xác minh".
2. Không thêm thành phần theo RSAL/SSPL/BUSL/Elastic/Commons Clause/CC-BY-NC mà không ghi rõ trong tài liệu này.
3. Ghim phiên bản image/gói; không dùng `latest`.
