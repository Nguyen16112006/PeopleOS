# PeopleOS

**Hệ điều hành Chuyển đổi số Quản trị Con người & Đãi ngộ toàn diện - DX-OS Open-Core**

![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![SPDX](https://img.shields.io/badge/SPDX-Apache--2.0-informational)

> **Bản 2.0 - HR-PaaS (đa tenant):** developer bên thứ 3 đăng ký, lấy API key, tự định nghĩa schema và nhận webhook trên hạ tầng PeopleOS.
> Kiến trúc, cách chạy (`docker-compose.paas.yml`), mức độ kiểm chứng và các giới hạn đã biết: [docs/paas/README.md](docs/paas/README.md).
> **Đọc mục "Thứ tự bắt buộc" trước khi nâng cấp** môi trường đang chạy: migration đa tenant phải đi cùng bootstrap Keycloak và BFF/frontend mới.

---

## 1. Giới thiệu

PeopleOS là nền tảng **mã nguồn mở** gồm hai tầng:

- **Tầng 1 - Open-Core (Headless PaaS):** lõi dùng chung, *không có giao diện người dùng cuối*: Định danh/SSO, API Gateway, dữ liệu cấu trúc & phi cấu trúc, động cơ quy trình, Event Bus.
- **Tầng 2 - People Workspace:** ứng dụng minh họa tập trung vào **quản trị nhân sự, đãi ngộ và an sinh** (Human Capital & Total Rewards) cùng **Trợ lý AI** chạy cục bộ.

### Bài toán "2 thái cực"

| Thái cực | Vấn đề | Cách PeopleOS giải quyết |
|---|---|---|
| **Ốc đảo dữ liệu** | Mỗi phân hệ một CSDL, một hệ thống đăng nhập | Mọi phân hệ dùng **chung một lõi**: 1 SSO, 1 Gateway, 1 kho dữ liệu, 1 động cơ quy trình, 1 event bus. AI cũng đọc dữ liệu qua cùng lớp phân quyền |
| **Phụ thuộc nhà cung cấp** | Bị khóa vào một hãng | Ưu tiên thành phần **nguồn mở OSI**, giao tiếp bằng chuẩn mở (OIDC, GraphQL, S3, webhook, NATS); thay từng thành phần mà không viết lại hệ thống |

---

## 2. Kiến trúc

```text
┌────────────────────────────────────────────────────────────────────┐
│ TẦNG 2 - PEOPLE WORKSPACE                                          │
│  Frontend (React 19 · TS · Tailwind · shadcn/ui)                   │
│  Backend (Java·Spring Boot): quy trình · PDF · WS   RAG (Ollama)   │
└───────────────────────────────┬────────────────────────────────────┘
                                │ JWT (OIDC)
┌───────────────────────────────▼────────────────────────────────────┐
│ TẦNG 1 - OPEN-CORE (HEADLESS PAAS)                                 │
│  Apache APISIX ─ xác thực JWKS ─► Keycloak (SSO · RBAC)            │
│     ├─► Hasura ─► PostgreSQL        dữ liệu cấu trúc               │
│     ├─► MinIO                       hợp đồng · payslip · chứng từ   │
│     ├─► Flowable                    6 quy trình BPMN                 │
│     └─► NATS                        sự kiện realtime                │
└────────────────────────────────────────────────────────────────────┘
```

Sơ đồ chi tiết, luồng xác thực, realtime và ma trận phân quyền: [docs/architecture.md](docs/architecture.md).

---

## 3. Công nghệ

| Lớp | Công nghệ |
|---|---|
| Định danh / SSO | Keycloak 26 (OIDC, PKCE) |
| API Gateway | Apache APISIX 3.9 (standalone; chế độ etcd cho PaaS; plugin `openid-connect`, `key-auth`) |
| Dữ liệu cấu trúc | PostgreSQL 16 + Hasura 2.40 (GraphQL, phân quyền hàng/cột) |
| Dữ liệu phi cấu trúc | MinIO (AGPL-3.0; build từ mã nguồn chính thức - xem [docs/LICENSING.md](docs/LICENSING.md)) |
| Workflow | Flowable 7.1.0 (BPMN, Apache-2.0, dịch vụ headless) |
| Event Bus | NATS 2.10 |
| Điều phối | Docker Compose (healthcheck, autoheal) |
| An ninh & vận hành | ClamAV (quét mã độc), GitHub Actions (CI), GitOps agent, sao lưu pg_dump/mc mirror |
| Frontend | React 19, TypeScript, Tailwind CSS, shadcn/ui, Vite |
| Backend nghiệp vụ | **Java 21 + Spring Boot 3** (Spring Security OAuth2, WebSocket, Maven) |
| Realtime | WebSocket + NATS |
| AI | Ollama (`qwen2.5:1.5b` Apache-2.0, `bge-m3` MIT), LangChain (text splitter), Qdrant, RAG |

> **Về ngôn ngữ:** backend nghiệp vụ (BFF) viết bằng **Java 21 / Spring Boot**, chia package theo từng mục (xem `apps/people-workspace/bff/README.md`). Dịch vụ AI (RAG) giữ Python vì hệ sinh thái Ollama/Qdrant/LangChain; module tính lương dùng chung nằm ở `core/shared`.

---

## 4. Cấu trúc thư mục

```text
PeopleOS/
├── core/                      # Tầng 1: Open-Core
│   ├── identity/              # Keycloak: realm, vai trò, tài khoản demo
│   ├── gateway/               # APISIX: route, xác thực JWT
│   ├── data/structured/       # PostgreSQL + Hasura: migration, metadata (quyền), seed
│   ├── data/unstructured/     # MinIO: bucket
│   ├── workflow/engine/       # Flowable: 6 quy trình BPMN + engine headless
│   ├── event-bus/             # NATS
│   └── shared/python/         # peopleos_shared.payroll (tính Gross→Net)
├── apps/
│   ├── platform/platform-api/ # HR-PaaS: control plane (FastAPI) - project, API key, schema, webhook
│   ├── developer-portal/      # HR-PaaS: cổng developer (React)
│   └── people-workspace/      # ứng dụng minh họa
│       ├── frontend/          # React + TS + Tailwind + shadcn/ui
│       └── bff/                   # Backend Java (Spring Boot), chia theo mục: config, security, integration, leave, proposal, onboarding, document...
├── ai/
│   ├── rag-service/           # RAG: Ollama + Qdrant
│   └── knowledge/             # Luật Lao động, BHXH, thuế TNCN, chính sách nội bộ
├── infrastructure/            # docker-compose(.dev).yml, .env.example, monitoring/healthcheck.sh
├── docs/                      # architecture, api-reference, deployment, demo-script, governance, LICENSING, paas/
├── scripts/                   # setup, init-db, seed-data, backup, restore, verify-backup, audit-verify.sql
│   ├── backup/                #   vòng lặp sao lưu PostgreSQL và MinIO
│   └── gitops/                #   agent GitOps
├── NOTICE · THIRD_PARTY_LICENSES.md · SECURITY.md · CODE_OF_CONDUCT.md
└── .github/                   # workflows/ci.yml (CI), ISSUE_TEMPLATE/, PULL_REQUEST_TEMPLATE.md
```

---

## 5. Tính năng

### Open-Core
- SSO + RBAC 6 vai trò: **Quản trị hệ thống, HR, Quản lý, Giám đốc, Kế toán, Nhân viên**
- APISIX bảo vệ toàn bộ API (JWT bắt buộc), chặn API nội bộ
- PostgreSQL + Hasura tự sinh GraphQL, phân quyền hàng/cột theo vai trò
- MinIO lưu hợp đồng và phiếu lương (PDF)
- 6 quy trình BPMN với Flowable (nghỉ phép, duyệt nghỉ phép, đề xuất lương, onboarding, hết hạn quyền tạm, khóa tài khoản nghỉ việc); NATS đẩy sự kiện realtime
- Toàn bộ hệ thống chạy bằng `docker compose up -d`

### HR-PaaS (bản 2.0) - xem [docs/paas/README.md](docs/paas/README.md)
- **Đa tenant** với ba lớp cô lập dữ liệu (permission Hasura, Row-Level Security, khóa ngoại tổng hợp)
- **Developer Portal:** đăng ký, tạo project, API key (chỉ lưu hash), thiết kế bảng bằng spec (không gửi SQL), trường tùy chỉnh, webhook có ký HMAC, thống kê sử dụng
- Gateway cấp phát/thu hồi API key động, giới hạn tốc độ và hạn mức theo gói

### People Workspace
- Đăng nhập SSO Keycloak; menu và dữ liệu theo vai trò
- **Cổng tự phục vụ:** hồ sơ cá nhân, hợp đồng lao động (tải PDF), bảng lương theo tháng (tải PDF), quá trình đóng BHXH/BHYT
- **Bảng công cho cả 6 vai trò:** chấm công vào/ra, khai làm thêm giờ, gửi bảng công tháng → quản lý xác nhận → HR chốt công → **lương tính theo ngày công và giờ làm thêm** (150% / 200% / 300%)
- **9 quy trình nghiệp vụ** cho 6 vai trò: Đề xuất tăng lương/thưởng/thăng chức (Quản lý → HR → Kế toán → Giám đốc) · Tính lương và chi trả hằng tháng · Nghỉ phép/Nghỉ ốm · Onboarding · Nghỉ việc (offboarding) · Tạm ứng, hoàn ứng, thanh toán chi phí · Đánh giá KPI theo quý · Thuế TNCN, BHXH và báo cáo năm · Cấp quyền tạm thời khi xử lý sự cố. Chi tiết vai trò, ma trận quyền và sơ đồ từng quy trình: [docs/ROLES_AND_WORKFLOWS.md](docs/ROLES_AND_WORKFLOWS.md)
- Thông báo realtime (toast + chuông) khi có người duyệt hoặc từ chối

### An ninh, vận hành & quản trị dữ liệu (xem [docs/governance.md](docs/governance.md))
- **Quét mã độc ClamAV** mọi tệp tải lên trước khi lưu MinIO
- **GitOps** (CI + agent đối chiếu trạng thái với Git), **tự phục hồi** (healthcheck + autoheal), **sao lưu** định kỳ + khôi phục + kiểm chứng
- **Kiểm toán & nhật ký bất biến:** chuỗi băm SHA-256, chặn sửa/xóa, ghi cả thay đổi dữ liệu trực tiếp, Admin xác minh trên giao diện
- **Phả hệ dữ liệu** (truy vết ngược/xuôi, phân loại PII) và **Dashboard điều hành**

### AI Assistant
- Hỏi đáp Luật Lao động, BHXH, thuế TNCN bằng RAG (có trích nguồn)
- "Lương Gross X thì Net là bao nhiêu?" - tính chính xác theo quy định 2026 (và quy đổi ngược Net → Gross)
- "Đơn nghỉ phép của tôi đang ở trạng thái nào?" - tra cứu bằng đúng quyền của người hỏi
- Chạy hoàn toàn cục bộ; tự hạ cấp về tìm kiếm từ khóa nếu mô hình chưa sẵn sàng

---

## 6. Hướng dẫn chạy

Yêu cầu: Docker 24+ (Compose v2), RAM 8 GB (16 GB nếu chạy AI; ClamAV dùng thêm ~1-2 GB), ~10-20 GB ổ đĩa.

```bash
cd PeopleOS
./scripts/setup.sh            # tạo .env, build, khởi chạy, nạp dữ liệu mẫu (có AI)
./scripts/setup.sh --no-ai    # máy yếu: bỏ Ollama/Qdrant/RAG (trang Trợ lý AI sẽ báo lỗi kết nối)
# hoặc thủ công:
cd infrastructure && cp .env.example .env
docker compose up -d --build
../scripts/init-db.sh && ../scripts/seed-data.sh
```

> **Nếu trước đây đã chạy bản cũ:** xóa dữ liệu cũ trước (`cd infrastructure && docker compose down -v`), vì realm Keycloak chỉ được nạp khi CSDL còn trống.

| Dịch vụ | URL |
|---|---|
| **People Workspace** | http://localhost:3000 |
| API Gateway | http://localhost:9080 |
| Keycloak | http://localhost:8080 |
| Hasura Console | http://localhost:8081 |
| MinIO Console | http://localhost:9001 |
| Workflow Engine | Chỉ truy cập trong mạng Docker |

**Tài khoản demo** (mật khẩu chung `Peopleos@123` - *chỉ để demo*, hãy đổi trước khi triển khai thật):

| Tài khoản | Vai trò | Họ tên |
|---|---|---|
| `employee` | Nhân viên | Phạm Thu Dung |
| `employee2` | Nhân viên | Hoàng Văn Em |
| `manager` | Quản lý | Lê Minh Cường |
| `hr` | HR | Trần Thị Bình |
| `accountant` | Kế toán | Vũ Thị Lan |
| `director` | Giám đốc | Hoàng Quốc Hùng |
| `admin` | Admin kỹ thuật (khóa vai trò `sysadmin`) | Nguyễn Văn An |

Kiểm tra: `./infrastructure/monitoring/healthcheck.sh`. Chi tiết, khắc phục sự cố và hướng dẫn production: [docs/deployment.md](docs/deployment.md).

### Chạy bản HR-PaaS (đa tenant)

```bash
cd infrastructure
cp .env.example .env          # rồi thêm các biến trong .env.paas.example (bắt buộc: PLATFORM_SECRET_KEY)
docker compose -f docker-compose.yml -f docker-compose.paas.yml up -d --build
# Keycloak lên xong (một lần, idempotent): thuộc tính tenant_id, mapper, gán tenant cho user cũ, tạo realm developer
cd .. && python scripts/keycloak-paas-bootstrap.py
```

| Dịch vụ | URL |
|---|---|
| Developer Portal (đăng ký developer ở realm `peopleos-platform`) | http://localhost:3100 |
| Swagger control plane (`platform-api`) | http://localhost:8090/docs |
| Gọi dữ liệu bằng API key | `POST http://localhost:9080/v1/data` với header `X-API-Key` |

> **Thứ tự bắt buộc khi nâng cấp:** áp migration 007–011, bootstrap Keycloak và đưa BFF/frontend bản mới **cùng lúc** (token cũ không có `tenant_id` sẽ bị Hasura từ chối). Trước buổi demo chạy `python scripts/preflight.py --paas --check-images` rồi `python scripts/smoke-paas.py`. Kiến trúc, mức độ kiểm chứng, giới hạn đã biết và checklist production: [docs/paas/README.md](docs/paas/README.md).

### Thử từng quy trình theo 6 vai trò

| Quy trình | Thử như sau | Trang |
|---|---|---|
| Đề xuất lương | `manager` đề xuất → `hr` thẩm định → `accountant` kiểm ngân sách → `director` duyệt | Đề xuất tăng lương, Phê duyệt |
| Nghỉ phép | `employee` gửi đơn → `manager` duyệt. Thử `manager` gửi đơn → `hr` → `director` | Nghỉ phép, Phê duyệt |
| Onboarding | `hr` tạo nhân viên mới | Onboarding |
| Nghỉ việc | `employee` xin nghỉ → `manager` chốt ngày → `hr` → bàn giao → chốt công → `accountant` lương cuối → `director` → chi trả → `hr` chấm dứt hợp đồng | Nghỉ việc |
| Tạm ứng / chi phí | `employee` gửi 25.000.000 đ → `manager` → `director` (cấp 2) → `accountant` chi → `employee` hoàn ứng → `accountant` quyết toán | Tạm ứng và chi phí |
| KPI quý | `hr` mở chu kỳ → `manager` giao mục tiêu (tổng 100%) và chấm → `director` giao/chấm cho `manager` → `hr` tổng hợp → `director` duyệt → `employee` xem và phản hồi | Đánh giá KPI |
| Bảng công | mọi tài khoản chấm công vào/ra, khai làm thêm giờ → gửi bảng công tháng → `manager` (hoặc `hr`) xác nhận / trả lại → `hr` sửa công nếu cần | Bảng công |
| Kỳ lương | `hr` chốt công tháng (khóa bảng công) → `accountant` tính theo ngày công → `hr` rà soát → `director` duyệt → `accountant` chi trả → `employee` khiếu nại phiếu lương → `hr` → `accountant` điều chỉnh | Kỳ lương, Bảng lương |
| Thuế và báo cáo năm | `hr` xác nhận → `accountant` quyết toán (phát chứng từ) → lập báo cáo → `director` duyệt → ngân sách năm sau | Thuế và báo cáo năm |
| Quyền tạm thời | `admin` tạo yêu cầu → `accountant` (hoặc `hr`) và `director` cùng duyệt | Quyền tạm thời |

> **Về dữ liệu mẫu:** lương **đã chi trả từ tháng 1 đến tháng 9/2026**. Hệ thống không cho chốt công tháng đã có lương đã chi trả, nên khi thử kỳ lương hãy chọn **tháng 10/2026** (giao diện mặc định là tháng trước, tức tháng 9, sẽ báo trùng). Đã có sẵn chấm công tháng 10 và 11/2026: bảng công tháng 10 của 5 người đã xác nhận, của `employee2` đang chờ `manager` xác nhận, của `employee` chưa gửi (`employee` và `employee2` còn đơn nghỉ phép tháng 10 chờ `manager` duyệt; duyệt xong các ngày đó tự thành nghỉ hưởng lương). Trang Thuế và báo cáo năm dùng dữ liệu lương 2026 có sẵn.

### Báo lỗi

Gửi kèm lệnh vừa chạy, thông báo lỗi nguyên văn và log liên quan:

```bash
cd infrastructure
docker compose ps
docker compose logs --tail=100 bff flowable hasura keycloak apisix
# kiểm tra riêng phần Java và giao diện
cd ../apps/people-workspace/bff && mvn test
cd ../frontend && npm ci && npm run build
```

### Biên dịch từ mã nguồn (không qua Docker)

Dùng khi muốn build/chạy riêng từng thành phần hoặc đóng góp mã. Công cụ cần có: **JDK 21**, **Maven 3.9+**, **Node.js 22 + npm**, **Python 3.12**; PostgreSQL 16, Keycloak, Hasura, MinIO... vẫn nên chạy bằng `docker compose up -d postgres keycloak hasura minio nats` (xem `infrastructure/docker-compose.yml`).

| Thành phần | Lệnh build | Sản phẩm / chạy |
|---|---|---|
| BFF (Java, Spring Boot) | `cd apps/people-workspace/bff && mvn -B -DskipTests package` | `target/app.jar` → `java -jar target/app.jar` |
| Workflow Engine (Flowable) | `cd core/workflow/engine && mvn -B -DskipTests package` | `target/app.jar` → `java -jar target/app.jar` |
| People Workspace (React) | `cd apps/people-workspace/frontend && npm ci && npm run build` | thư mục `dist/` (phục vụ bằng nginx hoặc `npm run dev`) |
| Developer Portal (React) | `cd apps/developer-portal && npm ci && npm run build` | thư mục `dist/` |
| platform-api (FastAPI) | `cd apps/platform/platform-api && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt` | `uvicorn platform_api.api:app --port 8090` |
| RAG service | `cd ai/rag-service && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt` | `uvicorn app.main:app --port 8001` |

**Cấu hình trước khi build/chạy:** chỉ bằng biến môi trường (`infrastructure/.env`, `application.yml`), không phải sửa tệp mã hay header. Nạp biến vào shell: `set -a; . infrastructure/.env; set +a`. Các script Python (`scripts/*.py`) cũng đọc mật khẩu từ biến môi trường này. Khi chạy ngoài Docker, trỏ `POSTGRES_*`, `HASURA_ADMIN_SECRET`, `KEYCLOAK_*`, `MINIO_*` tới dịch vụ tương ứng.

**Thư viện phụ thuộc:** khai báo trong `pom.xml`, `package-lock.json`, `requirements.txt` và được tải về từ kho chính thức (Maven Central, npm, PyPI); kho này **không đính kèm hay chỉnh sửa mã nguồn** của thư viện bên thứ ba (ngoại lệ: vài thành phần giao diện trong `apps/people-workspace/frontend/src/components/ui/` phỏng theo shadcn/ui, giấy phép MIT, có ghi công trong header từng tệp). Danh sách và giấy phép: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Các dịch vụ hạ tầng (Keycloak, Hasura, APISIX...) dùng image đã ghim phiên bản trong `docker-compose.yml`.

**Kiểm tra bản build:** chạy các lệnh ở mục 7; kiểm tra giấy phép từng tệp bằng `python scripts/spdx-headers.py --check` và toàn kho theo chuẩn REUSE bằng `pipx run reuse lint`.

**RAG ngoài Docker:** dịch vụ tự đọc tri thức từ `ai/knowledge`; đặt `KNOWLEDGE_DIR` nếu muốn dùng thư mục khác. Cần Ollama (`OLLAMA_URL`) và Qdrant (`QDRANT_URL`); nếu chưa có mô hình, dịch vụ tự hạ cấp về tìm kiếm từ khóa.

### Bản phát hành

Mỗi phiên bản là một git tag có chú thích `vX.Y.Z` và một GitHub Release kèm `PeopleOS-X.Y.Z.tar.gz` + `SHA256SUMS` do `python scripts/make-release.py` tạo (tái lập được). Tệp "Source code (zip)" trên trang Release do GitHub tự sinh, không phải định dạng phát hành chính thức của dự án. Kiểm tra gói tải về:

```bash
sha256sum -c SHA256SUMS
tar -xzf PeopleOS-X.Y.Z.tar.gz && cd PeopleOS-X.Y.Z && ./scripts/setup.sh
```

---

## 7. Kiểm thử

| Thành phần | Test | Cách chạy |
|---|---|---|
| Tính lương (Gross→Net, trần BH, thuế 2026) | 7 (Python) | `cd core/shared/python && PYTHONPATH=. python -m pytest tests` |
| Backend Java (nghỉ phép, duyệt nhiều cấp, vai trò) | JUnit 5 + Mockito: 88 test (thêm 17 test bảng công và lương theo ngày công) | `cd apps/people-workspace/bff && mvn test` |
| BPMN workflow engine | 3 test đạt: API nội bộ + triển khai 6 BPMN và 2 timer | `cd core/workflow/engine && mvn test` |
| RAG (phân loại, tính lương, truy xuất, fallback) | 21 (Python) | `cd ai/rag-service && python -m pytest tests` |
| Kiểm toán, sao lưu, view dashboard (migration, seed, chuỗi băm DB↔Java, ghi đồng thời, giả mạo, khôi phục) | kịch bản chạy thật trên PostgreSQL 16 | `scripts/audit-verify.sql` + CI job `database` |
| ClamAV (giao thức INSTREAM) | chạy thật với clamd giả lập; JUnit đã viết | `mvn test` |
| Frontend | kiểm tra kiểu + build | `cd apps/people-workspace/frontend && npm run build` |
| Control plane HR-PaaS (`platform-api`: auth, saga cấp phát, API key, schema, custom field, webhook, usage) | 45 (Python, PostgreSQL thật; Keycloak/APISIX/Hasura là mock) | `cd apps/platform/platform-api && python -m pytest tests` |
| Cô lập đa tenant ở tầng SQL (RLS, audit theo tenant, view, FK chéo tenant, bảng công) | 16 ca trên PostgreSQL 16 thật | `scripts/test-tenant-isolation.sh` |
| Gateway Lua + script bootstrap Keycloak/APISIX | 6 ca Lua + 4 test (server giả) | `lua5.4 core/gateway/paas/test_api_key_to_hasura.lua` · `python -m pytest scripts/tests` |
| Developer Portal | kiểm tra kiểu + build | `cd apps/developer-portal && npm ci && npm run build` |
| Manifest Kubernetes | `kustomize build` + `kubeconform --strict` | xem `infrastructure/k8s/README.md` |

Schema SQL và dữ liệu mẫu đã được chạy thử trên PostgreSQL 16 thật. Các lớp thuần Java (đếm ngày làm việc, tách tên, tham số) đã chạy thử trên JDK 21.

> **Lưu ý kiểm chứng:** toàn bộ ngăn xếp Docker và luồng tích hợp đầu-cuối (Flowable/BFF) cần được chạy cùng Docker Compose trước ngày demo; engine không có UI quản trị, nên chỉnh quy trình bằng BPMN trong mã nguồn và build lại. Lần chạy đầu hãy dùng `healthcheck.sh`, mục "Khắc phục sự cố" trong [docs/deployment.md](docs/deployment.md) và kiểm tra các điểm sau:
>
> 1. Spring Boot và Flowable khởi động (`docker compose logs bff flowable`): kết nối database, callback, timer jobs.
> 2. Hasura nạp metadata (`docker compose logs hasura`): quan hệ hoặc quyền sai tên.
> 3. Keycloak nạp realm mới (`docker compose logs keycloak`).
> 4. Flowable tự triển khai 6 BPMN khi khởi động (`docker compose logs flowable`).
> 5. APISIX nạp `apisix.yaml` với plugin `serverless-post-function` (`docker compose logs apisix`); nếu gateway trả 403/401 bất thường ở nhóm API có `guard-*` thì đây là chỗ cần xem.

### Giới hạn đã biết

- **Quyền tạm thời mới là bản ghi và nhật ký**: chưa có API nào dùng quyền đó để mở dữ liệu cho Admin (`TempAccessService.hasActiveGrant` chưa được nối).
- Bảng công: chưa có lịch ngày lễ và ca làm việc (HR ghi nhận ngày lễ từng ngày), chưa nối máy chấm công, chưa xử lý làm thêm ban đêm và phần tiền làm thêm miễn thuế.
- Việc khai và nộp thuế/BHXH định kỳ với cơ quan nhà nước nằm ngoài hệ thống.
- Giám đốc và Kế toán đọc đủ cột hồ sơ nhân viên (Hasura chỉ cho một bộ cột mỗi vai trò).
- Tài khoản Keycloak của nhân viên mới do hệ thống tạo tự động khi HR tạo hồ sơ (không qua bước Admin tạo tay như tài liệu mô tả ban đầu).

---

## 8. Tài liệu

- [Vai trò và quy trình nghiệp vụ](docs/ROLES_AND_WORKFLOWS.md) · [Kiến trúc](docs/architecture.md) · [Tham chiếu API](docs/api-reference.md) · [Triển khai](docs/deployment.md) · [Kịch bản demo 15 phút](docs/demo-script.md) · [An ninh, vận hành, quản trị dữ liệu](docs/governance.md)
- README từng thành phần: `core/*/README.md`, `apps/people-workspace/*/README.md`, `ai/rag-service/README.md`

## 9. Hướng phát triển

- Phân hệ Tuyển dụng, OKR, Đào tạo gắn vào cùng lõi (KPI theo quý đã có)
- Lịch ngày lễ và ca làm việc cho bảng công, nối máy chấm công; trừ ngày lễ trong tính ngày nghỉ; khoản miễn thuế, làm thêm ban đêm
- Ký số hợp đồng điện tử; đồng bộ cổng BHXH/thuế
- Kubernetes + Helm + Argo CD/Flux; Prometheus/Grafana/Loki; HA cho Keycloak và PostgreSQL
- Neo chuỗi kiểm toán ra kho WORM bên ngoài; role CSDL tách quyền; sao lưu off-site có mã hóa
- Đa ngôn ngữ, ứng dụng di động; thanh toán/billing cho HR-PaaS (đo đếm sử dụng đã có)
- Cân nhắc chuyển MinIO sang kho S3 tương thích còn phát triển tích cực như SeaweedFS (xem [docs/LICENSING.md](docs/LICENSING.md))
- Đánh giá chất lượng RAG (bộ câu hỏi chuẩn) và hỗ trợ mô hình lớn hơn

## 10. Đóng góp & Giấy phép

Xem [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md).
Mã nguồn PeopleOS phát hành theo **Apache-2.0** ([LICENSE](LICENSE), [NOTICE](NOTICE)); mỗi tệp mã có header SPDX.
Giấy phép phần mềm bên thứ ba: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) - liệt kê từng thành phần, dùng ở tệp nào và có tương thích với Apache-2.0 hay không. Chính sách và các thay đổi đã thực hiện: [docs/LICENSING.md](docs/LICENSING.md).
Nội dung pháp luật trong `ai/knowledge` chỉ mang tính tham khảo, không thay thế tư vấn pháp lý/kế toán.
