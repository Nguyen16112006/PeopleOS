# Chính sách giấy phép và các thành phần cần lưu ý

**Mã nguồn PeopleOS** phát hành theo **Apache-2.0** (xem [LICENSE](../LICENSE), [NOTICE](../NOTICE)); mỗi tệp mã có header SPDX
(`python scripts/spdx-headers.py --check`). Danh sách phần mềm bên thứ ba: [THIRD_PARTY_LICENSES.md](../THIRD_PARTY_LICENSES.md).

Nguyên tắc: **ưu tiên thành phần có giấy phép OSI-approved**. Tài liệu này nêu *trung thực* các ngoại lệ, vì "100% nguồn mở"
không đúng với hai thành phần dưới đây. Kết quả tra cứu ghi ngày 30/10/2026.

## Đã khắc phục
| Vấn đề | Xử lý |
|---|---|
| Redis 7.4+ theo RSALv2/SSPLv1 (không thuộc OSI) - overlay PaaS dùng `redis:7-alpine` | Thay bằng **Valkey** (BSD-3-Clause), tương thích giao thức Redis nên APISIX `limit-count` không đổi cấu hình |
| `qwen2.5:3b` theo Qwen Research License (phi thương mại) | Mặc định `qwen2.5:1.5b` (Apache-2.0); có thể dùng `qwen2.5:7b` (Apache-2.0) nếu đủ RAM |
| `ollama/ollama:latest` không ghim | Ghim `0.32.6`, ghi đè bằng `OLLAMA_IMAGE`; `scripts/preflight.py --check-images` kiểm tra tag có tồn tại |
| Thiếu header giấy phép | Header SPDX + copyright cho mọi tệp mã; CI chặn tệp mới thiếu header |

## Còn lại - cần quyết định

### 1. n8n (Workflow) - **không thuộc OSI**
n8n phát hành theo *Sustainable Use License* (fair-code): mã nguồn công khai, dùng nội bộ miễn phí, nhưng hạn chế cung cấp n8n như dịch vụ
cho bên thứ ba; các tệp `.ee.` theo *n8n Enterprise License*. Đây không phải giấy phép OSI. PeopleOS chỉ **chạy n8n như một dịch vụ nội bộ**
và không đóng gói lại mã n8n, nên việc dùng nội bộ nằm trong phạm vi cho phép; tuy nhiên nếu cuộc thi/tổ chức yêu cầu *mọi thành phần* là OSI thì cần thay.

Sáu workflow (`core/workflow/workflows/*.json`) chỉ làm hai việc: **kích hoạt theo lịch/sự kiện** và **gọi các endpoint `/api/internal/*` của BFF**
(toàn bộ logic nghiệp vụ nằm trong BFF). Vì vậy thay engine chỉ là viết lại phần "kích hoạt + gọi HTTP".

| Phương án | Giấy phép (OSI) | Ưu | Nhược |
|---|---|---|---|
| **Kestra** | Apache-2.0 | Workflow khai báo bằng YAML, có lịch + webhook, UI | Cần viết lại 6 flow; thêm 1-2 dịch vụ (kèm DB) - nặng với máy yếu |
| **Temporal** | MIT | Bền vững, retry tốt | Phải viết worker bằng mã (Java/Python); nặng hơn |
| **Flowable** | Apache-2.0 | BPMN, hợp bài toán duyệt nhiều cấp | Java, cần tích hợp |
| **Bộ lập lịch nội bộ** (cron + webhook nhận sự kiện NATS) trong BFF/worker | Apache-2.0 (mã của dự án) | Nhẹ nhất, không thêm dịch vụ | Không còn là "engine workflow" có giao diện; cần giải thích với ban giám khảo |

Khuyến nghị: nếu bắt buộc OSI, chọn **Kestra** (đúng vai trò "Workflow engine"). Chưa thực hiện trong đợt này vì không thể kiểm chứng tích hợp
(môi trường phát triển không chạy được Docker) và làm sai lúc gần hạn nộp còn rủi ro hơn giữ n8n kèm ghi chú rõ ràng.

### 2. MinIO (Dữ liệu phi cấu trúc) - mã nguồn AGPL-3.0 nhưng **rủi ro chuỗi cung ứng**
Mã MinIO vẫn theo AGPL-3.0 (thuộc OSI). Nhưng từ 10/2025 upstream **ngừng phát hành image Docker và binary** cho bản cộng đồng, sau đó vào chế độ bảo trì
(chỉ vá lỗi bảo mật). Repo đang dùng bản **mirror bên thứ ba** `scnd/minio-mirror:RELEASE.2025-09-07T16-13-09Z` (ghim phiên bản):
không rõ nguồn build, khó kiểm chứng nguồn gốc. Cách giảm thiểu:
- Biến `MINIO_IMAGE` cho phép thay bằng image tự build từ mã nguồn upstream (đã ghim phiên bản) và đẩy lên registry của dự án.
- Phương án dài hạn: chuyển sang kho S3-tương thích còn hoạt động - **SeaweedFS** (Apache-2.0) hoặc Garage (AGPL-3.0). BFF dùng SDK S3 (`io.minio:minio`)
  qua biến môi trường endpoint/khóa, nên chuyển đổi chủ yếu là cấu hình + script khởi tạo bucket.

### 3. Thành phần khác cần để ý
- **ClamAV (GPL-2.0)** chạy như dịch vụ riêng, giao tiếp qua giao thức INSTREAM - không liên kết mã với PeopleOS.
- **psycopg (LGPL-3.0)** trong `platform-api`: dùng như thư viện ngoài, không sửa đổi; bản phân phối container giữ nguyên gói gốc.
- **OpenPDF** (BFF): song giấy phép LGPL-2.1/MPL-2.0 - xác minh phiên bản cụ thể khi phát hành.
- **Hasura**: chỉ dùng bản community Apache-2.0; tính năng Enterprise/Cloud (rate-limit, read replica...) **không** dùng.

## Quy trình khi thêm phụ thuộc mới
1. Kiểm tra giấy phép (SPDX id) và ghi vào `THIRD_PARTY_LICENSES.md` kèm cột "Xác minh".
2. Không thêm thành phần theo RSAL/SSPL/BUSL/Elastic/Commons Clause/CC-BY-NC mà không ghi rõ trong tài liệu này.
3. Ghim phiên bản image/gói; không dùng `latest`.
