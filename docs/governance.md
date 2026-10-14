# An ninh, vận hành và quản trị dữ liệu

Tài liệu này mô tả 4 nhóm tiêu chí bổ sung và cách kiểm chứng từng nhóm.

## 0. Bảng đối chiếu tiêu chí

| Tiêu chí | Cách triển khai | File chính | Cách kiểm chứng nhanh |
|---|---|---|---|
| **Kiểm dịch mã độc (ClamAV)** | Dịch vụ `clamav` (clamd); backend quét mọi tệp tải lên bằng giao thức INSTREAM **trước khi** lưu MinIO; từ chối tệp nhiễm, ghi nhật ký `FILE.QUARANTINED` | `infrastructure/docker-compose.yml`, `bff/.../integration/clamav/`, `document/DocumentService.java` | Tải tệp EICAR lên (mục 1) |
| **GitOps** | Git là nguồn sự thật; CI kiểm tra mọi thay đổi; `gitops-agent` kéo commit mới và đối chiếu trạng thái chạy | `.github/workflows/ci.yml`, `scripts/gitops/agent.sh` | `docker compose --profile gitops up -d gitops-agent` (mục 2.1) |
| **Tự phục hồi** | `restart: unless-stopped` + healthcheck mọi dịch vụ chính + `autoheal` khởi động lại container "unhealthy" | `docker-compose.yml` (healthcheck, `autoheal`) | Làm hỏng một dịch vụ, xem tự hồi sinh (mục 2.2) |
| **Sao lưu** | `backup-postgres` (pg_dump định kỳ, giữ N ngày), `backup-minio` (mirror bucket); khôi phục và kiểm chứng bằng script | `scripts/backup/*`, `scripts/backup.sh`, `restore.sh`, `verify-backup.sh` | `./scripts/verify-backup.sh` (mục 2.3) |
| **Kiểm toán, nhật ký bất biến** | Bảng `audit_logs` append-only, chuỗi băm SHA-256, trigger chặn sửa/xóa/truncate, trigger ghi mọi thay đổi dữ liệu nhạy cảm; trang Kiểm toán + API xác minh | `hasura/migrations/.../1760000000001_governance/up.sql`, `bff/.../audit/`, `frontend/src/pages/Audit.tsx` | Trang **Kiểm toán** → "Xác minh toàn vẹn" (mục 3) |
| **Phả hệ dữ liệu** | Danh mục `data_assets` + `data_lineage` (31 tài sản, 52 quan hệ), phân loại dữ liệu (công khai/nội bộ/mật/PII), trang truy vết ngược-xuôi | migration `1760000000001`, `seed/generate_seed.py`, `pages/Lineage.tsx` | Trang **Phả hệ dữ liệu** (mục 4) |
| **Dashboard điều hành** | 5 view SQL (`v_kpi_summary`, `v_headcount_by_department`, `v_payroll_monthly`, `v_leave_summary`, `v_contracts_expiring`) qua Hasura (HR/Admin) | migration `1760000000001`, `pages/Executive.tsx` | Trang **Dashboard điều hành** (mục 4) |

---

## 1. Kiểm dịch mã độc (ClamAV)

**Luồng tải hợp đồng đã ký (HR/Admin):**
`Frontend → APISIX → Backend` → kiểm quyền → đọc tệp (≤ 10 MB) → **gửi tới clamd (INSTREAM)** → nếu nhiễm: từ chối **422** + ghi `FILE.QUARANTINED` → nếu sạch: kiểm tra đúng PDF (**415** nếu không) → lưu MinIO → ghi `CONTRACT.UPLOADED` (kèm kết quả quét).

| Cấu hình | Ý nghĩa |
|---|---|
| `CLAMAV_ENABLED` (mặc định `true`) | Tắt quét (không khuyến nghị) |
| `CLAMAV_FAIL_OPEN` (mặc định `false`) | `false` = **từ chối** tải lên khi ClamAV chưa sẵn sàng (an toàn). `true` = cho qua, chỉ nên dùng khi demo lúc ClamAV đang tải chữ ký |

Lần đầu khởi động, ClamAV tải cơ sở dữ liệu chữ ký (vài phút) và dùng khoảng 1-2 GB RAM. Trong lúc đó tải lên sẽ báo 503 "Dịch vụ quét mã độc chưa sẵn sàng" (khi `FAIL_OPEN=false`). Theo dõi: `docker compose ps clamav` (healthy).

**Thử bằng tệp EICAR** (chuỗi kiểm thử chuẩn của ngành, không phải mã độc thật):

```powershell
# PowerShell - tạo tệp EICAR
Set-Content -NoNewline -Path eicar.txt -Value 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
```

Đăng nhập `hr` → **Hợp đồng lao động** → "Tải bản ký lên" → chọn `eicar.txt` (đổi bộ lọc hộp thoại sang "All files"). Kết quả mong đợi: thông báo lỗi *"Tệp bị từ chối: phát hiện mã độc (…Eicar…)"*, và trang **Kiểm toán** (admin) có dòng `FILE.QUARANTINED`. Phần mềm diệt virus trên máy Windows có thể tự xóa `eicar.txt` ngay khi tạo - đó là hành vi bình thường.

**Giới hạn:** chỉ quét tệp người dùng tải lên (PDF do chính hệ thống sinh ra không cần quét); chữ ký do image ClamAV tự cập nhật (freshclam), cần Internet.

---

## 2. GitOps, tự phục hồi, sao lưu

### 2.1 GitOps
Nguyên tắc: **mọi thay đổi cấu hình đi qua Git**, hệ thống đang chạy luôn được đưa về đúng trạng thái trong Git.

1. **CI** (`.github/workflows/ci.yml`) chạy trên mỗi push/PR: test Python, build + test Java, build frontend, áp dụng migration + seed trên PostgreSQL thật rồi kiểm tra chuỗi kiểm toán/bất biến/sao lưu-khôi phục, kiểm tra `docker compose config`, YAML/JSON, shellcheck, build image.
2. **Agent** (`gitops-agent`, profile `gitops`): mỗi `GITOPS_INTERVAL` giây `git fetch` → nếu nhánh có commit mới thì `merge --ff-only` rồi `docker compose up -d --build`; nếu không thì vẫn `docker compose up -d` để **đối chiếu (reconcile)** - container bị dừng/xóa hoặc cấu hình bị lệch sẽ được đưa về trạng thái khai báo. Nếu kho cục bộ không thể fast-forward, agent báo "LỆCH" và không ghi đè.

```bash
# trên máy chủ Linux, kho Git đã clone sẵn tại /opt/peopleos
cd /opt/peopleos/infrastructure
HOST_REPO_PATH=/opt/peopleos docker compose --profile gitops up -d gitops-agent
docker compose logs -f gitops-agent
```

Giới hạn: agent cần `docker.sock` và đường dẫn kho trùng giữa máy chủ và container nên phù hợp **máy chủ Linux**; trên Docker Desktop (Windows) dùng CI + chạy `docker compose up -d` thủ công. Với Kubernetes, hướng phát triển là Argo CD/Flux + Helm.

### 2.2 Tự phục hồi
Ba lớp: (1) `restart: unless-stopped` - tiến trình chết thì Docker khởi động lại; (2) **healthcheck** cho PostgreSQL, Keycloak, Hasura, MinIO, NATS, n8n, APISIX, backend, frontend, Qdrant, Ollama, RAG, ClamAV; (3) **autoheal** theo dõi trạng thái và khởi động lại container "unhealthy" (tiến trình còn sống nhưng không phục vụ được).

```bash
# Thử: giết tiến trình chính của backend rồi xem Docker tự hồi sinh
docker compose exec bff kill 1       # hoặc: docker kill peopleos-bff-1
docker compose ps bff                # vài giây sau: Up (restarted)
docker compose logs autoheal | tail  # nếu là trường hợp unhealthy
```

### 2.3 Sao lưu và khôi phục
- **Tự động:** `backup-postgres` chạy `pg_dump -Fc` cho `peopleos`, `keycloak`, `n8n` mỗi `BACKUP_INTERVAL_HOURS` (mặc định 24), giữ `BACKUP_RETENTION_DAYS` (mặc định 7) ngày, ghi vào thư mục `backups/postgres/`. `backup-minio` mirror 3 bucket sang `backups/minio/`.
- **Thủ công:** `./scripts/backup.sh`.
- **Khôi phục:** `./scripts/restore.sh peopleos backups/postgres/peopleos-<thời-gian>.dump --yes` (dừng Hasura/backend, nạp lại, khởi động lại).
- **Kiểm chứng khôi phục được:** `./scripts/verify-backup.sh` nạp bản mới nhất vào CSDL tạm, đếm bản ghi, xác minh lại chuỗi kiểm toán rồi xóa CSDL tạm; không ảnh hưởng hệ thống đang chạy.

RPO mặc định = khoảng sao lưu (24 giờ, chỉnh được); RTO vào cỡ vài phút với dữ liệu demo. **Khuyến nghị production:** chép thư mục `backups/` ra nơi khác (off-site), mã hóa bản sao lưu, và tăng tần suất.

---

## 3. Kiểm toán và nhật ký bất biến

**Hai lớp ghi nhật ký vào cùng một chuỗi:**
1. **Sự kiện nghiệp vụ** (backend, có danh tính người làm): `LEAVE.CREATED/APPROVED/REJECTED`, `SALARY_PROPOSAL.CREATED/STEP_APPROVED/APPROVED/REJECTED`, `EMPLOYEE.CREATED`, `PAYSLIP.DOWNLOADED`, `CONTRACT.DOWNLOADED/UPLOADED`, `FILE.QUARANTINED`.
2. **Thay đổi dữ liệu ở cấp CSDL** (trigger, bắt cả khi ai đó sửa trực tiếp bằng SQL): `DB.INSERT/UPDATE/DELETE` trên `users`, `employees`, `contracts`, `payrolls`, `leave_requests`, `salary_proposals`, `approval_steps`, kèm giá trị cũ → mới.

**Tính bất biến (tamper-evident):**
- Trigger chặn `UPDATE`, `DELETE`, `TRUNCATE` trên `audit_logs`.
- Mỗi bản ghi lưu `hash = SHA-256(seq | prev_hash | thời điểm | người làm | vai trò | hành động | đối tượng | chi tiết)` và `prev_hash` của bản ghi trước; `seq` liên tục, gán dưới khóa tư vấn nên ghi đồng thời vẫn tuần tự.
- Xóa, sửa hay chèn xen kẽ một bản ghi đều làm chuỗi hỏng. Trang **Kiểm toán** (Admin) → "Xác minh toàn vẹn chuỗi" gọi `GET /api/audit/verify` tái tính toàn bộ chuỗi; `scripts/audit-verify.sql` làm điều tương tự trong SQL.
- Chỉ **Admin** đọc được `audit_logs` (không role nào khác có quyền trong Hasura; không ai ghi được qua Hasura - backend ghi bằng admin secret).

**Demo phát hiện can thiệp:**
```bash
cd infrastructure
# 1) Thử sửa nhật ký - bị chặn
docker compose exec postgres psql -U peopleos -d peopleos -c "UPDATE audit_logs SET action='X' WHERE seq=1"
#    ERROR: audit_logs là nhật ký bất biến: không được UPDATE bản ghi
# 2) Kẻ có quyền cao tắt trigger rồi sửa (mô phỏng) - chuỗi băm vẫn lộ ra
docker compose exec postgres psql -U peopleos -d peopleos \
  -c "ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_no_update_delete" \
  -c "UPDATE audit_logs SET details='{\"hacked\":true}' WHERE seq=10" \
  -c "ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_no_update_delete"
# 3) Trang Kiểm toán -> Xác minh: báo "PHÁT HIỆN NHẬT KÝ BỊ CAN THIỆP", hỏng đầu tiên tại seq 10
```

**Giới hạn cần nói rõ:** chuỗi băm giúp **phát hiện** can thiệp, không **ngăn** được người sở hữu CSDL (superuser) tắt trigger. Để chống chối bỏ ở mức cao hơn: tạo role CSDL riêng không có quyền DDL cho ứng dụng, định kỳ chép `hash` mới nhất (neo chuỗi) ra nơi độc lập, hoặc đẩy nhật ký sang kho WORM (MinIO Object Lock, syslog từ xa). Việc ghi nhật ký nghiệp vụ của backend là "best effort" (lỗi ghi được log mức ERROR nhưng không làm hỏng nghiệp vụ) - có thể đổi sang chặn nghiệp vụ nếu chính sách yêu cầu; trigger CSDL thì luôn chạy cùng giao dịch.

---

## 4. Phả hệ dữ liệu và dashboard điều hành

### Phả hệ dữ liệu (data lineage)
- **Danh mục** `data_assets`: 31 tài sản dữ liệu gồm nguồn, bảng, view, kho tệp, kho vector, tiến trình xử lý, đầu ra; mỗi tài sản có hệ thống chứa, **chủ sở hữu** và **phân loại** (`public`/`internal`/`confidential`/`pii`).
- **Quan hệ** `data_lineage`: 52 cạnh "từ đâu → đến đâu" kèm phép biến đổi (ví dụ `tbl_payrolls → proc_pdf → obj_payslips → out_files`; `src_law → proc_embed → vec_knowledge → out_ai`).
- **Trang Phả hệ dữ liệu** (HR/Admin): sơ đồ trái → phải; bấm một nút để truy vết ngược/xuôi, xem mô tả, chủ sở hữu và có đụng tới dữ liệu cá nhân (PII) hay không - hữu ích cho đánh giá tác động khi đổi một nguồn dữ liệu hoặc khi xử lý yêu cầu về dữ liệu cá nhân.
- Danh mục được **khai báo thủ công** trong `seed/generate_seed.py` (không tự suy ra từ mã). Khi thêm bảng/tích hợp mới, thêm một dòng vào `ASSETS`/`EDGES` rồi `./scripts/seed-data.sh --regenerate`.

### Dashboard điều hành
Trang **Dashboard điều hành** (HR/Admin) đọc 5 view SQL qua Hasura: nhân sự theo phòng ban, lương cơ bản trung bình, tổng Gross/Net/thuế/chi phí doanh nghiệp theo tháng, nghỉ phép đã duyệt theo loại, việc đang chờ duyệt, hợp đồng sắp hết hạn (≤ 90 ngày, cảnh báo ≤ 30 ngày). Số liệu tính ở CSDL nên nhất quán với bảng lương và BHXH; biểu đồ vẽ bằng HTML/CSS thuần, không thêm thư viện.

---

## 5. Đã kiểm chứng gì

| Hạng mục | Mức kiểm chứng |
|---|---|
| Migration kiểm toán/phả hệ/view, seed | Chạy thật trên PostgreSQL 16 |
| Chuỗi băm: DB tính, **Java tái tính độc lập** khớp (có tiếng Việt, ký tự `\|`, `&`) | Chạy thật, 124 bản ghi |
| Ghi đồng thời 40 lần qua 10 tiến trình → chuỗi vẫn liên tục, hợp lệ | Chạy thật |
| Chặn UPDATE/DELETE/TRUNCATE; phát hiện sửa/xóa khi tắt trigger | Chạy thật |
| Trigger ghi thay đổi trực tiếp (lương 18 → 19 triệu) | Chạy thật |
| Sao lưu `pg_dump` → khôi phục → chuỗi hợp lệ → trigger còn hiệu lực → phát hiện giả mạo | Chạy thật |
| 5 view dashboard cho số liệu đúng với dữ liệu mẫu | Chạy thật |
| Giao thức ClamAV (INSTREAM): sạch, EICAR, 1 MB nhiều khối, lỗi, mất kết nối | Chạy thật với clamd **giả lập** |
| Sơ đồ phả hệ (bố cục 8 cột) | Dựng thật bằng đúng hàm layout |
| Frontend (3 trang mới) | Kiểm tra kiểu + build thành công |
| Backend Java biên dịch đầy đủ | Chạy thật: biên dịch bằng Maven trong giai đoạn build image `bff` (Docker) |
| Sao lưu PostgreSQL/MinIO dạng container | Chạy thật: sinh ra các bản `pg_dump` và bản sao MinIO trong `backups/` |
| CI trên GitHub | Chạy thật: workflow `ci.yml` gồm 6 job (Python, backend Java `mvn verify`, frontend, database, kiểm tra cấu hình, build image) |
| ClamAV thật (container `clamav`) | Chưa kiểm chứng riêng; giao thức đã chạy thật với clamd giả lập (dòng trên) |
| autoheal | Chưa kiểm chứng riêng |
| gitops-agent | Chưa kiểm chứng riêng |