# Giấy phép của phần mềm bên thứ ba

> Tài liệu này liệt kê các thành phần mà PeopleOS **sử dụng hoặc triển khai kèm**. PeopleOS không sao chép mã của chúng vào kho này
> (ngoại trừ qua trình quản lý gói: Maven, npm, pip). Cột **Xác minh**: `tra cứu` = đã đối chiếu với nguồn công khai ngày 30/10/2026;
> `quét` = đọc từ metadata của gói đã cài; `kiến thức chung` = chưa đối chiếu lại, **cần xác minh trước khi nộp/phát hành**.

## 1. Dịch vụ chạy bằng container (docker-compose / Kubernetes)

| Thành phần | Phiên bản (trong repo) | Giấy phép | OSI | Xác minh | Ghi chú |
|---|---|---|---|---|---|
| Keycloak | 26.0.7 | Apache-2.0 | ✔ | kiến thức chung | |
| Hasura GraphQL Engine (community) | v2.40.0 | Apache-2.0 | ✔ | kiến thức chung | Không dùng tính năng Enterprise/Cloud |
| Apache APISIX | 3.9.1 | Apache-2.0 | ✔ | kiến thức chung | |
| etcd | v3.5.14 | Apache-2.0 | ✔ | kiến thức chung | Chỉ ở overlay PaaS |
| PostgreSQL | 16 | PostgreSQL License | ✔ | kiến thức chung | |
| NATS Server | 2.10 | Apache-2.0 | ✔ | kiến thức chung | |
| Qdrant | v1.12.4 | Apache-2.0 | ✔ | kiến thức chung | |
| Ollama | 0.32.6 (ghim, ghi đè bằng `OLLAMA_IMAGE`) | MIT | ✔ | tra cứu | Tag chọn theo một nguồn công khai; kiểm tra bằng `scripts/preflight.py --check-images` |
| ClamAV | 1.4 | GPL-2.0 | ✔ | kiến thức chung | Chạy như dịch vụ riêng, không liên kết với mã PeopleOS |
| willfarrell/autoheal | 1.2.0 | MIT | ✔ | kiến thức chung | |
| Valkey | 8 (overlay PaaS) | BSD-3-Clause | ✔ | tra cứu | Thay Redis (xem mục 4) |
| nginx / Node / Python (image nền) | 1.27 / 22 / 3.12 | BSD-2 / MIT / PSF | ✔ | kiến thức chung | |
| **MinIO** | RELEASE.2025-09-07 (qua mirror `scnd/minio-mirror`) | **AGPL-3.0** | ✔ | tra cứu | **Rủi ro chuỗi cung ứng**: upstream ngừng phát hành image/binary cộng đồng từ 10/2025 và vào chế độ bảo trì. Xem `docs/LICENSING.md` |
| **n8n** | 1.70.3 | **Sustainable Use License** (+ n8n Enterprise License cho tệp `.ee.`) | **✘** | tra cứu | **Không thuộc OSI.** Xem `docs/LICENSING.md` mục "n8n" |
| KEDA, CloudNativePG | (operator, tùy chọn ở K8s) | Apache-2.0 | ✔ | kiến thức chung | |

## 2. Mô hình AI (tải lúc chạy, không nằm trong kho)

| Mô hình | Giấy phép | OSI/mở | Xác minh |
|---|---|---|---|
| bge-m3 (BAAI) | MIT | ✔ | kiến thức chung |
| qwen2.5:1.5b | Apache-2.0 | ✔ | tra cứu |
| qwen2.5:7b (tùy chọn) | Apache-2.0 | ✔ | tra cứu |
| ~~qwen2.5:3b~~ (đã **loại bỏ**) | Qwen Research License (phi thương mại) | ✘ | tra cứu |

Trọng số mô hình không phải phần mềm theo định nghĩa OSI; cột "OSI/mở" chỉ cho biết giấy phép có cho phép dùng thương mại và phân phối lại hay không.

## 3. Thư viện lập trình

### Java (BFF) - `apps/people-workspace/bff/pom.xml`
| Thư viện | Giấy phép | Xác minh |
|---|---|---|
| Spring Boot (web, security, oauth2-resource-server, validation, websocket, test) | Apache-2.0 | kiến thức chung |
| io.minio:minio 8.5.12 (SDK) | Apache-2.0 | kiến thức chung |
| io.nats:jnats 2.20.4 | Apache-2.0 | kiến thức chung |
| com.github.librepdf:openpdf 2.0.3 | LGPL-2.1 / MPL-2.0 (song giấy phép) | kiến thức chung - **xác minh phiên bản cụ thể** |
| springdoc-openapi 2.6.0 | Apache-2.0 | kiến thức chung |

### Python
| Gói | Dùng ở | Giấy phép | Xác minh |
|---|---|---|---|
| fastapi, pydantic | rag-service, platform-api | MIT | kiến thức chung |
| uvicorn, httpx | rag-service, platform-api | BSD-3-Clause | kiến thức chung |
| qdrant-client | rag-service | Apache-2.0 | kiến thức chung |
| langchain-text-splitters | rag-service | MIT | kiến thức chung |
| psycopg (v3) | platform-api | **LGPL-3.0** (dùng như thư viện Python bên ngoài, không sửa đổi) | kiến thức chung |
| PyJWT | platform-api | MIT | kiến thức chung |
| cryptography | platform-api | Apache-2.0 hoặc BSD-3-Clause | kiến thức chung |
| pytest, PyYAML | kiểm thử/script | MIT | kiến thức chung |

### JavaScript - `apps/people-workspace/frontend`, `apps/developer-portal`
Đã quét metadata của toàn bộ gói đã cài (`npm ci`):
- Developer Portal: 67 gói - MIT 58, ISC 4, Apache-2.0 3, BSD-3-Clause 1 (không có giấy phép copyleft).
- Frontend: 157 gói - MIT 125, ISC 10, Apache-2.0 6, BSD-3-Clause 1, CC-BY-4.0 1 (dữ liệu `caniuse-lite`, yêu cầu ghi công); không có GPL/AGPL. (Một số mục "UNKNOWN" là tệp thử nghiệm lồng trong gói, không phải phụ thuộc thật.)
- Trực tiếp: React, React DOM, react-router-dom, keycloak-js (Apache-2.0), lucide-react (ISC), tailwind-merge, clsx, class-variance-authority, Vite, TypeScript (Apache-2.0). Xác minh: `quét`.

## 4. Thay đổi giấy phép đã thực hiện (đợt rà soát 30/10/2026)
| Trước | Sau | Lý do |
|---|---|---|
| `redis:7-alpine` (Redis 7.4+: RSALv2/SSPLv1, không thuộc OSI) | `valkey/valkey:8-alpine` (BSD-3-Clause) | Redis 7.4.x-7.8.x không còn giấy phép OSI |
| `qwen2.5:3b` (Qwen Research License) | `qwen2.5:1.5b` (Apache-2.0) | Bản 3B phi thương mại |
| `ollama/ollama:latest` | `ollama/ollama:0.32.6` (ghi đè được) | Tái lập được, tránh đổi âm thầm |

## 5. Cách phát hiện lại
- Header SPDX: `python scripts/spdx-headers.py --check` (CI chạy bước này).
- Quét giấy phép npm: `npx license-checker --summary` trong từng thư mục frontend.
