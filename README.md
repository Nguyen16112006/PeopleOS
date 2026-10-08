# PeopleOS

**Hệ điều hành Chuyển đổi số Quản trị Con người & Đãi ngộ toàn diện - DX-OS Open-Core**

![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Stack](https://img.shields.io/badge/stack-100%25%20open--source-green)

---

## 1. Giới thiệu

PeopleOS là nền tảng **mã nguồn mở** gồm hai tầng:

- **Tầng 1 - Open-Core (Headless PaaS):** lõi dùng chung, *không có giao diện người dùng cuối*: Định danh/SSO, API Gateway, dữ liệu cấu trúc & phi cấu trúc, động cơ quy trình, Event Bus.
- **Tầng 2 - People Workspace:** ứng dụng minh họa tập trung vào **quản trị nhân sự, đãi ngộ và an sinh** (Human Capital & Total Rewards) cùng **Trợ lý AI** chạy cục bộ.

### Bài toán "2 thái cực"

| Thái cực | Vấn đề | Cách PeopleOS giải quyết |
|---|---|---|
| **Ốc đảo dữ liệu** | Mỗi phân hệ một CSDL, một hệ thống đăng nhập | Mọi phân hệ dùng **chung một lõi**: 1 SSO, 1 Gateway, 1 kho dữ liệu, 1 động cơ quy trình, 1 event bus. AI cũng đọc dữ liệu qua cùng lớp phân quyền |
| **Phụ thuộc nhà cung cấp** | Bị khóa vào một hãng | **100% nguồn mở**, giao tiếp bằng chuẩn mở (OIDC, GraphQL, S3, webhook, NATS); thay từng thành phần mà không viết lại hệ thống |

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
│     ├─► n8n                         4 quy trình                     │
│     └─► NATS                        sự kiện realtime                │
└────────────────────────────────────────────────────────────────────┘
```

Sơ đồ chi tiết, luồng xác thực, realtime và ma trận phân quyền: [docs/architecture.md](docs/architecture.md).

---

## 3. Công nghệ

| Lớp | Công nghệ |
|---|---|
| Định danh / SSO | Keycloak 26 (OIDC, PKCE) |
| API Gateway | Apache APISIX 3.9 (standalone, plugin `openid-connect`) |
| Dữ liệu cấu trúc | PostgreSQL 16 + Hasura 2.40 (GraphQL, phân quyền hàng/cột) |
| Dữ liệu phi cấu trúc | MinIO |
| Workflow | n8n 1.70 |
| Event Bus | NATS 2.10 |
| Điều phối | Docker Compose (healthcheck, autoheal) |
| An ninh & vận hành | ClamAV (quét mã độc), GitHub Actions (CI), GitOps agent, sao lưu pg_dump/mc mirror |
| Frontend | React 19, TypeScript, Tailwind CSS, shadcn/ui, Vite |
| Backend nghiệp vụ | **Java 21 + Spring Boot 3** (Spring Security OAuth2, WebSocket, Maven) |
| Realtime | WebSocket + NATS |
| AI | Ollama (`qwen2.5:3b`, `bge-m3`), LangChain (text splitter), Qdrant, RAG |

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
│   ├── workflow/workflows/    # n8n: 4 workflow JSON
│   ├── event-bus/             # NATS
│   └── shared/python/         # peopleos_shared.payroll (tính Gross→Net)
├── apps/people-workspace/
│   ├── frontend/              # React + TS + Tailwind + shadcn/ui
│   └── bff/                   # Backend Java (Spring Boot), chia theo mục: config, security, integration, leave, proposal, onboarding, document...
├── ai/
│   ├── rag-service/           # RAG: Ollama + Qdrant
│   └── knowledge/             # Luật Lao động, BHXH, thuế TNCN, chính sách nội bộ
├── infrastructure/            # docker-compose(.dev).yml, .env.example, monitoring/healthcheck.sh
├── docs/                      # architecture, api-reference, deployment, demo-script, governance
├── scripts/                   # setup, init-db, seed-data, backup, restore, verify-backup, audit-verify.sql
│   ├── backup/                #   vòng lặp sao lưu PostgreSQL và MinIO
│   └── gitops/                #   agent GitOps
└── .github/workflows/ci.yml   # CI: test, build, migration, kiểm tra cấu hình
```

---

## 5. Tính năng

### Open-Core
- SSO + RBAC 4 vai trò: **Admin, HR, Manager, Employee**
- APISIX bảo vệ toàn bộ API (JWT bắt buộc), chặn API nội bộ
- PostgreSQL + Hasura tự sinh GraphQL, phân quyền hàng/cột theo vai trò
- MinIO lưu hợp đồng và phiếu lương (PDF)
- 4 quy trình n8n; NATS đẩy sự kiện realtime
- Toàn bộ hệ thống chạy bằng `docker compose up -d`

### People Workspace
- Đăng nhập SSO Keycloak; menu và dữ liệu theo vai trò
- **Cổng tự phục vụ:** hồ sơ cá nhân, hợp đồng lao động (tải PDF), bảng lương theo tháng (tải PDF), quá trình đóng BHXH/BHYT
- **Quy trình:** Onboarding nhân viên mới · Nghỉ phép/Nghỉ ốm · Đề xuất tăng lương/phụ cấp duyệt nhiều cấp (Quản lý → HR → Giám đốc)
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
./scripts/setup.sh            # tạo .env, build, khởi chạy, nạp dữ liệu mẫu
# hoặc thủ công:
cd infrastructure && cp .env.example .env
docker compose up -d --build
../scripts/init-db.sh && ../scripts/seed-data.sh
```

| Dịch vụ | URL |
|---|---|
| **People Workspace** | http://localhost:3000 |
| API Gateway | http://localhost:9080 |
| Keycloak | http://localhost:8080 |
| Hasura Console | http://localhost:8081 |
| MinIO Console | http://localhost:9001 |
| n8n | http://localhost:5678 |

**Tài khoản demo** (mật khẩu chung `Peopleos@123`): `admin`, `hr`, `manager`, `employee` (Phạm Thu Dung), `employee2`.

Kiểm tra: `./infrastructure/monitoring/healthcheck.sh`. Chi tiết, khắc phục sự cố và hướng dẫn production: [docs/deployment.md](docs/deployment.md).

---

## 7. Kiểm thử

| Thành phần | Test | Cách chạy |
|---|---|---|
| Tính lương (Gross→Net, trần BH, thuế 2026) | 7 (Python) | `cd core/shared/python && PYTHONPATH=. python -m pytest tests` |
| Backend Java (nghỉ phép, duyệt nhiều cấp, vai trò) | JUnit 5 + Mockito (đã viết, **chưa chạy được** trong môi trường phát triển - xem lưu ý) | `cd apps/people-workspace/bff && mvn test` |
| RAG (phân loại, tính lương, truy xuất, fallback) | 21 (Python) | `cd ai/rag-service && python -m pytest tests` |
| Kiểm toán, sao lưu, view dashboard (migration, seed, chuỗi băm DB↔Java, ghi đồng thời, giả mạo, khôi phục) | kịch bản chạy thật trên PostgreSQL 16 | `scripts/audit-verify.sql` + CI job `database` |
| ClamAV (giao thức INSTREAM) | chạy thật với clamd giả lập; JUnit đã viết | `mvn test` |
| Frontend | kiểm tra kiểu + build | `cd apps/people-workspace/frontend && npm run build` |

Schema SQL và dữ liệu mẫu đã được chạy thử trên PostgreSQL 16 thật. Các lớp thuần Java (đếm ngày làm việc, tách tên, tham số) đã chạy thử trên JDK 21.

> **Lưu ý trung thực:** môi trường phát triển dự án này không có Docker và không tải được thư viện Maven, nên backend Java mới chỉ được kiểm tra cú pháp bằng `javac` (chưa biên dịch đầy đủ, chưa chạy test), ClamAV thật, autoheal, sao lưu/GitOps dạng container và CI trên GitHub chưa được chạy, và `docker-compose.yml`, cấu hình Keycloak/APISIX/Hasura và 4 workflow n8n
> được viết theo tài liệu chính thức của từng sản phẩm nhưng **chưa được chạy tích hợp đầu-cuối**. Lần chạy đầu hãy dùng `healthcheck.sh` và
> mục "Khắc phục sự cố" trong [docs/deployment.md](docs/deployment.md); các điểm dễ cần chỉnh nhất là URL Keycloak (issuer), tên image/phiên bản và lệnh nhập workflow của n8n.

---

## 8. Tài liệu

- [Kiến trúc](docs/architecture.md) · [Tham chiếu API](docs/api-reference.md) · [Triển khai](docs/deployment.md) · [Kịch bản demo 15 phút](docs/demo-script.md) · [An ninh, vận hành, quản trị dữ liệu](docs/governance.md)
- README từng thành phần: `core/*/README.md`, `apps/people-workspace/*/README.md`, `ai/rag-service/README.md`

## 9. Hướng phát triển

- Phân hệ Tuyển dụng, KPI/OKR, Đào tạo gắn vào cùng lõi
- Bảng lương tự động từ chấm công; trừ ngày lễ trong tính ngày nghỉ; khoản miễn thuế
- Ký số hợp đồng điện tử; đồng bộ cổng BHXH/thuế
- Kubernetes + Helm + Argo CD/Flux; Prometheus/Grafana/Loki; HA cho Keycloak và PostgreSQL
- Neo chuỗi kiểm toán ra kho WORM bên ngoài; role CSDL tách quyền; sao lưu off-site có mã hóa
- Đa tenant, đa ngôn ngữ, ứng dụng di động
- Đánh giá chất lượng RAG (bộ câu hỏi chuẩn) và hỗ trợ mô hình lớn hơn

## 10. Đóng góp & Giấy phép

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Phát hành theo **Apache-2.0** ([LICENSE](LICENSE)).
Nội dung pháp luật trong `ai/knowledge` chỉ mang tính tham khảo, không thay thế tư vấn pháp lý/kế toán.
