# Giấy phép của phần mềm bên thứ ba

PeopleOS phát hành theo **Apache-2.0** ([LICENSE](LICENSE), [NOTICE](NOTICE)). Tài liệu này công bố các thành phần bên thứ ba mà PeopleOS sử dụng:
**dùng ở đâu** (kèm đường dẫn tới tệp trong kho), **theo giấy phép gì**, và **có đáp ứng yêu cầu giấy phép của dự án hay không**.

**Yêu cầu giấy phép của dự án** (chi tiết: [docs/LICENSING.md](docs/LICENSING.md)):

1. Thành phần phải theo giấy phép được **OSI phê duyệt**.
2. Cách sử dụng phải **tương thích với Apache-2.0**: không buộc mã của PeopleOS phải đổi sang giấy phép khác.

**Cột "Đáp ứng"**

| Ký hiệu | Ý nghĩa |
|---|---|
| ✔ | Giấy phép cho phép (MIT, BSD, Apache-2.0…): tương thích hoàn toàn |
| ✔ (*) | Giấy phép copyleft nhưng vẫn đáp ứng nhờ **cách dùng**: dùng nguyên bản không sửa đổi, hoặc chạy như dịch vụ riêng không liên kết mã. Điều kiện ghi ở cột Ghi chú |

---

## 1. Dịch vụ chạy bằng container

| Thành phần | Phiên bản | Giấy phép | Dùng ở | Đáp ứng | Ghi chú |
|---|---|---|---|---|---|
| Keycloak | 26.0.7 | Apache-2.0 | [docker-compose.yml#L43](infrastructure/docker-compose.yml#L43) | ✔ | Đăng nhập SSO |
| Hasura GraphQL Engine | v2.40.0-ce | Apache-2.0 | [docker-compose.yml#L73](infrastructure/docker-compose.yml#L73), [Dockerfile.metadata#L7](core/data/structured/Dockerfile.metadata#L7), [k8s/cell/hasura.yaml#L21](infrastructure/k8s/cell/hasura.yaml#L21) | ✔ | Dùng tag `-ce` (Community Edition): chỉ chứa phần mã nguồn mở, không kèm thành phần Enterprise độc quyền có trong image thường từ v2.12.0 |
| Apache APISIX | 3.9.1 | Apache-2.0 | [docker-compose.yml#L168](infrastructure/docker-compose.yml#L168), [k8s/gateway/apisix.yaml#L23](infrastructure/k8s/gateway/apisix.yaml#L23) | ✔ | API Gateway |
| etcd | v3.5.14 | Apache-2.0 | [docker-compose.paas.yml#L16](infrastructure/docker-compose.paas.yml#L16) | ✔ | Cấu hình gateway (PaaS) |
| PostgreSQL | 16 | PostgreSQL License | [docker-compose.yml#L25](infrastructure/docker-compose.yml#L25), [Dockerfile.migrate#L6](core/data/structured/Dockerfile.migrate#L6), [k8s/cell/postgres-cnpg.yaml#L12](infrastructure/k8s/cell/postgres-cnpg.yaml#L12) | ✔ | Cơ sở dữ liệu |
| NATS Server | 2.10 | Apache-2.0 | [docker-compose.yml#L129](infrastructure/docker-compose.yml#L129) | ✔ | Sự kiện, realtime |
| Qdrant | v1.12.4 | Apache-2.0 | [docker-compose.yml#L254](infrastructure/docker-compose.yml#L254) | ✔ | Vector DB cho trợ lý AI |
| Ollama | 0.32.6 | MIT | [docker-compose.yml#L268](infrastructure/docker-compose.yml#L268) | ✔ | Chạy mô hình AI cục bộ |
| Valkey | 8 | BSD-3-Clause | [docker-compose.paas.yml#L28](infrastructure/docker-compose.paas.yml#L28) | ✔ | Bộ đếm hạn mức API (thay Redis) |
| docker-autoheal | 1.2.0 | MIT | [docker-compose.yml#L334](infrastructure/docker-compose.yml#L334) | ✔ | Tự khởi động lại container lỗi |
| Docker CLI | 27 | Apache-2.0 | [docker-compose.yml#L383](infrastructure/docker-compose.yml#L383) | ✔ | Job vận hành |
| ClamAV | 1.4 | GPL-2.0 | [docker-compose.yml#L321](infrastructure/docker-compose.yml#L321) | ✔ (*) | Dịch vụ riêng. BFF chỉ gửi tệp qua socket theo giao thức INSTREAM ([ClamdProtocol.java](apps/people-workspace/bff/src/main/java/vn/peopleos/bff/integration/clamav/ClamdProtocol.java)), không liên kết mã |
| MinIO (server + mc) | RELEASE.2025-10-15 (mc RELEASE.2025-08-13) | AGPL-3.0 | [docker-compose.yml#L100](infrastructure/docker-compose.yml#L100), [minio/Dockerfile#L23](core/data/unstructured/minio/Dockerfile#L23) | ✔ (*) | Dịch vụ riêng, BFF truy cập qua API S3; PeopleOS không sửa mã MinIO. Image build từ tag phát hành chính thức trên github.com/minio (upstream ngừng phát hành image cộng đồng); văn bản giấy phép và link mã nguồn tương ứng nằm trong image tại `/licenses` |
| KEDA | - | Apache-2.0 | [k8s/platform-system/platform-worker.yaml#L42](infrastructure/k8s/platform-system/platform-worker.yaml#L42) | ✔ | Tùy chọn trên Kubernetes, người vận hành tự cài |
| CloudNativePG | - | Apache-2.0 | [k8s/cell/postgres-cnpg.yaml#L5](infrastructure/k8s/cell/postgres-cnpg.yaml#L5) | ✔ | Tùy chọn trên Kubernetes, người vận hành tự cài |

## 2. Image nền để build và chạy ứng dụng

| Thành phần | Phiên bản | Giấy phép | Dùng ở | Đáp ứng | Ghi chú |
|---|---|---|---|---|---|
| Eclipse Temurin (OpenJDK) | 21 JRE | GPL-2.0 with Classpath Exception | [bff/Dockerfile#L14](apps/people-workspace/bff/Dockerfile#L14), [workflow/engine/Dockerfile#L11](core/workflow/engine/Dockerfile#L11) | ✔ (*) | Classpath Exception cho phép chạy ứng dụng Apache-2.0 trên JVM mà không bị ràng buộc GPL |
| Maven | 3.9 | Apache-2.0 | [bff/Dockerfile#L6](apps/people-workspace/bff/Dockerfile#L6), [workflow/engine/Dockerfile#L4](core/workflow/engine/Dockerfile#L4) | ✔ | Chỉ ở bước build |
| Node.js | 22 | MIT | [frontend/Dockerfile#L5](apps/people-workspace/frontend/Dockerfile#L5), [developer-portal/Dockerfile#L4](apps/developer-portal/Dockerfile#L4) | ✔ | Chỉ ở bước build |
| nginx | 1.27 | BSD-2-Clause | [frontend/Dockerfile#L20](apps/people-workspace/frontend/Dockerfile#L20), [developer-portal/Dockerfile#L15](apps/developer-portal/Dockerfile#L15) | ✔ | Phục vụ giao diện web |
| Python | 3.12 | PSF-2.0 | [platform-api/Dockerfile#L4](apps/platform/platform-api/Dockerfile#L4), [rag-service/Dockerfile#L4](ai/rag-service/Dockerfile#L4), [docker-compose.paas.yml#L110](infrastructure/docker-compose.paas.yml#L110) | ✔ | |
| Go | 1.24 | BSD-3-Clause | [minio/Dockerfile#L15](core/data/unstructured/minio/Dockerfile#L15) | ✔ | Chỉ ở bước build MinIO |
| Alpine Linux | 3.20 | MIT (busybox: GPL-2.0) | [minio/Dockerfile#L37](core/data/unstructured/minio/Dockerfile#L37) | ✔ (*) | Image chạy MinIO; các gói hệ điều hành dùng nguyên bản, là chương trình riêng |

## 3. Thư viện Java

| Thành phần | Phiên bản | Giấy phép | Dùng ở | Đáp ứng | Ghi chú |
|---|---|---|---|---|---|
| Spring Boot (web, security, oauth2, validation, websocket) | 3.3.5 | Apache-2.0 | [bff/pom.xml#L10](apps/people-workspace/bff/pom.xml#L10), [workflow/engine/pom.xml#L9](core/workflow/engine/pom.xml#L9) | ✔ | Khung ứng dụng BFF và Flowable engine |
| Flowable Process Engine | 7.1.0 | Apache-2.0 | [workflow/engine/pom.xml#L25](core/workflow/engine/pom.xml#L25) | ✔ | Quy trình BPMN |
| MinIO Java SDK | 8.5.12 | Apache-2.0 | [bff/pom.xml#L34](apps/people-workspace/bff/pom.xml#L34) | ✔ | Đọc ghi tệp qua S3 |
| jnats | 2.20.4 | Apache-2.0 | [bff/pom.xml#L35](apps/people-workspace/bff/pom.xml#L35) | ✔ | Client NATS |
| OpenPDF | 2.0.3 | MPL-2.0 OR LGPL-2.1-or-later | [bff/pom.xml#L38](apps/people-workspace/bff/pom.xml#L38), [PdfGenerator.java#L7](apps/people-workspace/bff/src/main/java/vn/peopleos/bff/document/PdfGenerator.java#L7) | ✔ (*) | Chọn MPL-2.0, dùng nguyên bản. MPL-2.0 chỉ áp lên tệp của OpenPDF, không lan sang mã PeopleOS |
| springdoc-openapi | 2.6.0 | Apache-2.0 | [bff/pom.xml#L41](apps/people-workspace/bff/pom.xml#L41) | ✔ | Swagger UI |
| PostgreSQL JDBC | theo Spring Boot | BSD-2-Clause | [workflow/engine/pom.xml#L34](core/workflow/engine/pom.xml#L34) | ✔ | |
| Spring Boot Test (JUnit 5, Mockito, AssertJ) | 3.3.5 | Apache-2.0, EPL-2.0, MIT | [bff/pom.xml#L43](apps/people-workspace/bff/pom.xml#L43) | ✔ | Chỉ khi kiểm thử, không có trong bản phát hành |
| H2 Database | theo Spring Boot | MPL-2.0 OR EPL-1.0 | [workflow/engine/pom.xml#L44](core/workflow/engine/pom.xml#L44) | ✔ | Chỉ khi kiểm thử |

## 4. Thư viện Python

| Thành phần | Phiên bản | Giấy phép | Dùng ở | Đáp ứng | Ghi chú |
|---|---|---|---|---|---|
| FastAPI | 0.115.6 / ≥0.110 | MIT | [rag-service/requirements.txt#L3](ai/rag-service/requirements.txt#L3), [platform-api/requirements.txt#L3](apps/platform/platform-api/requirements.txt#L3) | ✔ | |
| Uvicorn | 0.32.1 / ≥0.29 | BSD-3-Clause | [rag-service/requirements.txt#L4](ai/rag-service/requirements.txt#L4), [platform-api/requirements.txt#L4](apps/platform/platform-api/requirements.txt#L4) | ✔ | |
| HTTPX | 0.28.1 / ≥0.27 | BSD-3-Clause | [rag-service/requirements.txt#L5](ai/rag-service/requirements.txt#L5), [platform-api/requirements.txt#L6](apps/platform/platform-api/requirements.txt#L6) | ✔ | |
| qdrant-client | 1.12.1 | Apache-2.0 | [rag-service/requirements.txt#L6](ai/rag-service/requirements.txt#L6), [rag.py#L124](ai/rag-service/app/rag.py#L124) | ✔ | |
| langchain-text-splitters | 0.3.4 | MIT | [rag-service/requirements.txt#L7](ai/rag-service/requirements.txt#L7), [rag.py#L19](ai/rag-service/app/rag.py#L19) | ✔ | |
| psycopg | ≥3.1 | LGPL-3.0 | [platform-api/requirements.txt#L5](apps/platform/platform-api/requirements.txt#L5), [db.py](apps/platform/platform-api/platform_api/db.py) | ✔ (*) | Dùng như thư viện ngoài, không sửa đổi; gói gốc từ PyPI nên người dùng thay được bản khác, đúng yêu cầu của LGPL-3.0 |
| PyJWT | ≥2.7 | MIT | [platform-api/requirements.txt#L7](apps/platform/platform-api/requirements.txt#L7), [security.py#L11](apps/platform/platform-api/platform_api/security.py#L11) | ✔ | |
| cryptography | ≥42 | Apache-2.0 OR BSD-3-Clause | [platform-api/requirements.txt#L8](apps/platform/platform-api/requirements.txt#L8), [security.py#L12](apps/platform/platform-api/platform_api/security.py#L12) | ✔ | |
| pytest | ≥8 | MIT | [platform-api/requirements.txt#L10](apps/platform/platform-api/requirements.txt#L10) | ✔ | Chỉ khi kiểm thử |
| PyYAML | - | MIT | [scripts/tenant-roles.py](scripts/tenant-roles.py), [scripts/tenant-permissions.py](scripts/tenant-permissions.py) | ✔ | Chỉ trong script vận hành |

Thư viện được kéo theo gián tiếp (64 gói) đều theo giấy phép OSI; đa số MIT, BSD, Apache-2.0. Hai gói copyleft yếu là **certifi** (MPL-2.0) và
**orjson** (MPL-2.0 kèm Apache-2.0/MIT), đều dùng nguyên bản nên đáp ứng ✔ (*).

## 5. Thư viện JavaScript

### People Workspace

| Thành phần | Phiên bản | Giấy phép | Dùng ở | Đáp ứng | Ghi chú |
|---|---|---|---|---|---|
| React, React DOM | 19 | MIT | [frontend/package.json#L16](apps/people-workspace/frontend/package.json#L16) | ✔ | |
| React Router | 6 | MIT | [frontend/package.json#L18](apps/people-workspace/frontend/package.json#L18) | ✔ | |
| keycloak-js | 26 | Apache-2.0 | [frontend/package.json#L14](apps/people-workspace/frontend/package.json#L14) | ✔ | Đăng nhập PKCE |
| lucide-react | 0.468 | ISC | [frontend/package.json#L15](apps/people-workspace/frontend/package.json#L15) | ✔ | Bộ icon |
| class-variance-authority | 0.7 | Apache-2.0 | [frontend/package.json#L12](apps/people-workspace/frontend/package.json#L12) | ✔ | |
| clsx, tailwind-merge | 2 | MIT | [frontend/package.json#L13](apps/people-workspace/frontend/package.json#L13), [#L19](apps/people-workspace/frontend/package.json#L19) | ✔ | |
| Vite, Tailwind CSS, PostCSS, Autoprefixer | 6 / 3.4 / 8 / 10 | MIT | [frontend/package.json#L25-L30](apps/people-workspace/frontend/package.json#L25-L30) | ✔ | Chỉ ở bước build |
| TypeScript | 5.6 | Apache-2.0 | [frontend/package.json#L29](apps/people-workspace/frontend/package.json#L29) | ✔ | Chỉ ở bước build |

### Developer Portal

| Thành phần | Phiên bản | Giấy phép | Dùng ở | Đáp ứng | Ghi chú |
|---|---|---|---|---|---|
| React, React DOM | 19 | MIT | [developer-portal/package.json#L13](apps/developer-portal/package.json#L13) | ✔ | |
| keycloak-js | 26 | Apache-2.0 | [developer-portal/package.json#L12](apps/developer-portal/package.json#L12) | ✔ | |
| Vite, TypeScript | 6 / 5.6 | MIT / Apache-2.0 | [developer-portal/package.json#L19-L21](apps/developer-portal/package.json#L19-L21) | ✔ | Chỉ ở bước build |

### Trang tài liệu (`website/`)

| Thành phần | Phiên bản | Giấy phép | Dùng ở | Đáp ứng | Ghi chú |
|---|---|---|---|---|---|
| Docusaurus (core, preset-classic) | 3.10 | MIT | [website/package.json#L13](website/package.json#L13) | ✔ | |
| Docusaurus Mermaid theme | 3.10 | MIT | [website/package.json#L15](website/package.json#L15), [docusaurus.config.js#L53](website/docusaurus.config.js#L53) | ✔ | Kéo theo **elkjs** (EPL-2.0 OR GPL-3.0-or-later): chọn EPL-2.0, dùng nguyên bản → ✔ (*) |
| docusaurus-search-local | 0.52 | MIT | [website/package.json#L16](website/package.json#L16), [docusaurus.config.js#L55](website/docusaurus.config.js#L55) | ✔ | Kéo theo **lunr-languages** (MPL-1.1): dùng nguyên bản → ✔ (*) |
| MDX, prism-react-renderer, React | 3 / 2.4 / 19 | MIT | [website/package.json#L17-L21](website/package.json#L17-L21) | ✔ | |

Toàn bộ gói npm được kéo theo gián tiếp (142 gói ở People Workspace, 71 ở Developer Portal, 1.289 ở trang tài liệu) đều theo giấy phép OSI hoặc
giấy phép cho phép tương đương (MIT, ISC, BSD, Apache-2.0, 0BSD, CC0-1.0, BlueOak-1.0.0). Riêng **caniuse-lite** theo CC-BY-4.0 (dữ liệu trình duyệt,
chỉ dùng lúc build, chỉ yêu cầu ghi công).

## 6. Mô hình AI, phông chữ và mã phỏng theo

| Thành phần | Giấy phép | Dùng ở | Đáp ứng | Ghi chú |
|---|---|---|---|---|
| Mô hình bge-m3 (BAAI) | MIT | [docker-compose.yml#L307](infrastructure/docker-compose.yml#L307), [rag-service/app/config.py#L20](ai/rag-service/app/config.py#L20) | ✔ | Tải lúc chạy, không nằm trong kho |
| Mô hình qwen2.5:1.5b (Alibaba Cloud) | Apache-2.0 | [docker-compose.yml#L306](infrastructure/docker-compose.yml#L306), [rag-service/app/config.py#L19](ai/rag-service/app/config.py#L19) | ✔ | Mặc định; có thể thay bằng qwen2.5:7b (Apache-2.0). **Không** dùng qwen2.5:3b (giấy phép phi thương mại) |
| Phông Be Vietnam Pro | OFL-1.1 | [frontend/index.html#L12](apps/people-workspace/frontend/index.html#L12), [developer-portal/index.html#L12](apps/developer-portal/index.html#L12) | ✔ | Tải từ Google Fonts lúc chạy |
| Phông JetBrains Mono | OFL-1.1 | [developer-portal/index.html#L12](apps/developer-portal/index.html#L12) | ✔ | Tải từ Google Fonts lúc chạy |
| shadcn/ui | MIT | [frontend/src/components/ui/](apps/people-workspace/frontend/src/components/ui/) | ✔ | Mã phỏng theo và đã chỉnh sửa; giữ bản quyền gốc trong header từng tệp và [LICENSES/MIT.txt](LICENSES/MIT.txt) |

## 7. Kết luận

| Tiêu chí | Kết quả |
|---|---|
| Mọi thành phần theo giấy phép OSI | **Đạt.** Hasura dùng bản `-ce` (không kèm thành phần Enterprise), MinIO build từ mã nguồn chính thức |
| Tương thích Apache-2.0 | **Đạt.** Thành phần copyleft (ClamAV, MinIO, OpenPDF, psycopg, elkjs, lunr-languages, certifi, orjson) đều dùng nguyên bản hoặc chạy như dịch vụ riêng, không buộc mã PeopleOS đổi giấy phép |
| Không dùng giấy phép hạn chế (RSAL, SSPL, BUSL, Elastic, Commons Clause, phi thương mại) | **Đạt.** Đã thay Redis bằng Valkey, n8n bằng Flowable, qwen2.5:3b bằng qwen2.5:1.5b |

Khi thêm phụ thuộc mới, cập nhật bảng tương ứng trong tệp này theo quy trình ở [docs/LICENSING.md](docs/LICENSING.md).
