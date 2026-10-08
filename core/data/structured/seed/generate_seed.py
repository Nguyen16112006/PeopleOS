#!/usr/bin/env python3
"""Sinh seed.sql (dữ liệu mẫu để demo) - chạy: python3 generate_seed.py > seed.sql

Dùng chung module tính lương `peopleos_shared.payroll` để số liệu phiếu lương/BHXH
trong CSDL khớp tuyệt đối với kết quả của AI Assistant.
"""
import sys, uuid
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "shared" / "python"))
from peopleos_shared.payroll import compute_net  # noqa: E402

NS = uuid.UUID("6f1d3b8e-0000-4000-8000-000000000000")
def uid(name: str) -> str: return str(uuid.uuid5(NS, name))
def q(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, date): return f"'{v.isoformat()}'"
    return "'" + str(v).replace("'", "''") + "'"
out = []
def insert(table, rows):
    for r in rows:
        cols = ", ".join(r.keys()); vals = ", ".join(q(x) for x in r.values())
        out.append(f"INSERT INTO {table} ({cols}) VALUES ({vals});")

U = lambda n: f"00000000-0000-4000-8000-00000000000{n}"
E = lambda n: f"10000000-0000-4000-8000-00000000000{n}"

# ----- người dùng (khớp realm Keycloak) -----------------------------------------
users = [
  (1, "admin",     "admin@peopleos.local",     "Nguyễn Văn An",  "admin"),
  (2, "hr",        "hr@peopleos.local",        "Trần Thị Bình",  "hr"),
  (3, "manager",   "manager@peopleos.local",   "Lê Minh Cường",  "manager"),
  (4, "employee",  "employee@peopleos.local",  "Phạm Thu Dung",  "employee"),
  (5, "employee2", "employee2@peopleos.local", "Hoàng Văn Em",   "employee"),
]
# ----- nhân sự --------------------------------------------------------------------
# (n, user_n, code, name, dept, title, mgr, hire, base, allow, deps, status, gender, dob, phone)
emps = [
  (1, 1, "NV0001", "Nguyễn Văn An", "Ban Giám đốc", "Giám đốc điều hành", None, date(2020,1,1), 50_000_000, 10_000_000, 2, "active", "Nam", date(1984,3,12), "0901000001"),
  (2, 2, "NV0002", "Trần Thị Bình", "Phòng Nhân sự", "Trưởng phòng Nhân sự", 1, date(2021,5,10), 22_000_000, 3_000_000, 1, "active", "Nữ", date(1990,7,21), "0901000002"),
  (3, 3, "NV0003", "Lê Minh Cường", "Phòng Kỹ thuật", "Trưởng phòng Kỹ thuật", 1, date(2022,2,1), 35_000_000, 5_000_000, 2, "active", "Nam", date(1988,11,5), "0901000003"),
  (4, 4, "NV0004", "Phạm Thu Dung", "Phòng Kỹ thuật", "Kỹ sư phần mềm", 3, date(2024,7,1), 18_000_000, 2_000_000, 0, "active", "Nữ", date(1998,2,17), "0901000004"),
  (5, 5, "NV0005", "Hoàng Văn Em", "Phòng Kỹ thuật", "Kỹ sư kiểm thử", 3, date(2025,10,15), 14_000_000, 1_500_000, 0, "active", "Nam", date(1999,9,9), "0901000005"),
  (6, None, "NV0006", "Vũ Thị Phương", "Phòng Kỹ thuật", "Kỹ sư phần mềm mới", 3, date(2026,9,1), 12_000_000, 0, 0, "onboarding", "Nữ", date(2002,4,30), "0901000006"),
]
E_BY = {e[0]: e for e in emps}

out.append("-- Sinh bởi generate_seed.py - KHÔNG sửa tay. Chạy lại sẽ XÓA dữ liệu demo cũ.")
out.append("TRUNCATE users, employees, contracts, payrolls, insurance_records, leave_balances, leave_requests,"
           " salary_proposals, approval_steps, onboarding_tasks, notifications, data_lineage, data_assets CASCADE;")
insert("users", [dict(id=U(n), username=un, email=em, full_name=fn, role=r) for n, un, em, fn, r in users])

# employees: chèn không có manager_id trước rồi cập nhật (tránh phụ thuộc thứ tự)
for (n, un, code, name, dept, title, mgr, hire, base, allow, deps, status, gender, dob, phone) in emps:
    insert("employees", [dict(
        id=E(n), user_id=U(un) if un else None, employee_code=code, full_name=name,
        email=f"{code.lower()}@peopleos.local" if not un else dict((u[0], u[2]) for u in users)[un],
        phone=phone, date_of_birth=dob, gender=gender, address="Hà Nội, Việt Nam", department=dept,
        job_title=title, hire_date=hire, status=status, dependents=deps, region=1,
        tax_code=f"8{n:09d}", social_insurance_no=f"79{n:08d}", health_insurance_no=f"DN4797900{n:03d}")])
for e in emps:
    if e[6]: out.append(f"UPDATE employees SET manager_id = '{E(e[6])}' WHERE id = '{E(e[0])}';")

# ----- hợp đồng ---------------------------------------------------------------------
ctype = {1: ("indefinite", None), 2: ("indefinite", None), 3: ("indefinite", None),
         4: ("fixed_term", date(2027,6,30)), 5: ("fixed_term", date(2027,10,14)), 6: ("probation", date(2026,10,31))}
for e in emps:
    t, end = ctype[e[0]]
    insert("contracts", [dict(id=uid(f"contract-{e[0]}"), employee_id=E(e[0]), contract_no=f"HD-{e[7].year}-{e[0]:03d}",
        contract_type=t, start_date=e[7], end_date=end, base_salary=e[8], allowance=e[9], status="active")])

# ----- bảng lương T1..T9/2026 + quá trình BHXH 2025-01..2026-09 --------------------------
def salary_at(e, period: date):
    base, allow = e[8], e[9]
    if e[0] == 4 and period < date(2025, 12, 1):   # Dung được tăng lương 16tr -> 18tr từ 12/2025
        base = 16_000_000
    return base, allow

for e in emps:
    n, hire = e[0], e[7]
    for m in range(1, 10):
        if hire > date(2026, m, 28): continue
        base, allow = salary_at(e, date(2026, m, 1))
        ot = ((n * 3 + m) % 4) * 400_000 if n in (4, 5) else 0
        bonus = 2_000_000 if (m in (6, 9) and n in (3, 4, 5)) else (10_000_000 if (m == 6 and n == 1) else 0)
        gross = base + allow + ot + bonus
        r = compute_net(gross, dependents=e[10], region=1, on=date(2026, m, 1), insured_salary=base + allow)
        insert("payrolls", [dict(id=uid(f"payroll-{n}-{m}"), employee_id=E(n), period_year=2026, period_month=m,
            base_salary=base, allowance=allow, overtime_pay=ot, bonus=bonus, gross=gross, insured_salary=r.insured_salary,
            bhxh_employee=r.bhxh, bhyt_employee=r.bhyt, bhtn_employee=r.bhtn, taxable_income=r.taxable_income,
            personal_income_tax=r.pit, net_salary=r.net, status="paid", paid_at=date(2026, m + 1, 5))])
    y, m = 2025, 1
    while (y, m) <= (2026, 9):
        p = date(y, m, 1)
        if hire <= p.replace(day=28):
            base, allow = salary_at(e, p)
            r = compute_net(base + allow, dependents=e[10], region=1, on=p, insured_salary=base + allow)
            insert("insurance_records", [dict(id=uid(f"ins-{n}-{y}-{m}"), employee_id=E(n), period=p, insured_salary=base + allow,
                bhxh_employee=r.bhxh, bhyt_employee=r.bhyt, bhtn_employee=r.bhtn,
                bhxh_employer=r.employer_bhxh, bhyt_employer=r.employer_bhyt, bhtn_employer=r.employer_bhtn)])
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

# ----- nghỉ phép ----------------------------------------------------------------------
def wd(a, b): return sum(1 for i in range((b - a).days + 1) if (a + timedelta(i)).weekday() < 5)
leaves = [  # (key, emp, type, start, end, status, approver_emp, note, created)
  ("l1", 4, "annual", date(2026,6,15), date(2026,6,16), "approved", 3, "Đồng ý", date(2026,6,8)),
  ("l2", 4, "sick",   date(2026,8,10), date(2026,8,10), "approved", 3, "Chúc bạn mau khỏe", date(2026,8,10)),
  ("l3", 4, "annual", date(2026,10,19), date(2026,10,20), "pending", None, None, date(2026,10,2)),
  ("l4", 5, "annual", date(2026,10,12), date(2026,10,12), "pending", None, None, date(2026,10,3)),
  ("l5", 3, "annual", date(2026,4,27), date(2026,4,29), "approved", 1, "Đồng ý", date(2026,4,15)),
  ("l6", 2, "annual", date(2026,7,20), date(2026,7,20), "approved", 1, "Đồng ý", date(2026,7,10)),
]
used, sick = {}, {}
for key, emp, lt, s, e_, st, appr, note, created in leaves:
    d = wd(s, e_)
    if st == "approved":
        (used if lt == "annual" else sick)[emp] = (used if lt == "annual" else sick).get(emp, 0) + d
    insert("leave_requests", [dict(id=uid(key), employee_id=E(emp), leave_type=lt, start_date=s, end_date=e_, days=d,
        reason={"annual": "Nghỉ phép năm", "sick": "Nghỉ ốm có giấy khám", "unpaid": "", "personal": ""}[lt],
        status=st, approver_id=E(appr) if appr else None, decision_note=note,
        decided_at=f"{created.isoformat()} 17:00:00+07" if appr else None, created_at=f"{created.isoformat()} 09:00:00+07")])
for e in emps:
    n, hire = e[0], e[7]
    if hire.year == 2026:
        ent = round(12 * (13 - hire.month) / 12)
    else:
        ent = 12 + (2026 - hire.year if date(2026,12,31).replace(year=2026) and (2026 - hire.year) >= 5 else 0) // 5
    insert("leave_balances", [dict(id=uid(f"lb-{n}"), employee_id=E(n), year=2026, entitled_days=ent,
        used_days=used.get(n, 0), sick_days_used=sick.get(n, 0))])

# ----- đề xuất tăng lương (duyệt nhiều cấp) ---------------------------------------------
props = [
  ("p1", 4, 3, "raise", 18_000_000, 21_000_000, "Hoàn thành vượt KPI 2 quý liên tiếp, đảm nhận vai trò tech lead module thanh toán.", "pending_hr", date(2026,10,1),
     [("hr", "pending", None, None), ("admin", "waiting", None, None)]),
  ("p2", 5, 3, "allowance", 1_500_000, 2_500_000, "Đảm nhận trực hệ thống ngoài giờ theo ca.", "pending_admin", date(2026,9,25),
     [("hr", "approved", 2, "Phù hợp chính sách phụ cấp trách nhiệm"), ("admin", "pending", None, None)]),
  ("p3", 4, 3, "raise", 16_000_000, 18_000_000, "Điều chỉnh sau hết thời gian thử việc và đánh giá năm 2025.", "approved", date(2025,11,10),
     [("hr", "approved", 2, "Đồng ý"), ("admin", "approved", 1, "Duyệt")]),
]
for key, emp, proposer, typ, cur, new, reason, st, created, steps in props:
    insert("salary_proposals", [dict(id=uid(key), employee_id=E(emp), proposer_id=E(proposer), proposal_type=typ,
        current_amount=cur, proposed_amount=new, reason=reason, effective_date=date(2025,12,1) if st == "approved" else None,
        status=st, created_at=f"{created.isoformat()} 10:00:00+07")])
    for i, (role, sst, appr, cmt) in enumerate(steps, 1):
        insert("approval_steps", [dict(id=uid(f"{key}-s{i}"), proposal_id=uid(key), step_order=i, approver_role=role,
            status=sst, approver_id=E(appr) if appr else None, comment=cmt,
            decided_at=f"{created.isoformat()} 15:00:00+07" if appr else None)])

# ----- checklist onboarding cho nhân viên mới (Phương) -----------------------------------
tasks = [("Ký hợp đồng thử việc và nộp hồ sơ cá nhân", "hr", "done", date(2026,9,1)),
         ("Tạo tài khoản email và SSO", "hr", "done", date(2026,9,2)),
         ("Cấp laptop và thiết bị làm việc", "hr", "todo", date(2026,10,8)),
         ("Đăng ký BHXH, BHYT và mã số thuế", "hr", "todo", date(2026,10,15)),
         ("Phân công mentor và giới thiệu nhóm", "manager", "todo", date(2026,10,9)),
         ("Hoàn thành khóa nội quy và an toàn thông tin", "employee", "todo", date(2026,10,20))]
for i, (t, role, st, due) in enumerate(tasks, 1):
    insert("onboarding_tasks", [dict(id=uid(f"task-{i}"), employee_id=E(6), title=t, assignee_role=role, status=st, due_date=due,
        completed_at=f"{due.isoformat()} 12:00:00+07" if st == "done" else None)])

# ----- thông báo mẫu ------------------------------------------------------------------------
notes = [
 (3, "Đơn nghỉ phép chờ duyệt", "Phạm Thu Dung xin nghỉ 2 ngày (2026-10-19 → 2026-10-20).", "leave_request", uid("l3")),
 (3, "Đơn nghỉ phép chờ duyệt", "Hoàng Văn Em xin nghỉ 1 ngày (2026-10-12).", "leave_request", uid("l4")),
 (2, "Đề xuất tăng lương chờ HR duyệt", "Phạm Thu Dung: 18.000.000 đ → 21.000.000 đ.", "salary_proposal", uid("p1")),
 (1, "Đề xuất chờ Giám đốc duyệt", "Hoàng Văn Em - tăng phụ cấp 1.500.000 đ → 2.500.000 đ.", "salary_proposal", uid("p2")),
]
for i, (u, t, m, rt, rid) in enumerate(notes, 1):
    insert("notifications", [dict(id=uid(f"note-{i}"), user_id=U(u), title=t, message=m, ref_type=rt, ref_id=rid)])


# ----- danh mục dữ liệu + phả hệ (data lineage) -----------------------------------------
# layer: 1 Nguồn · 2 Lưu trữ lõi · 3 Xử lý · 4 Tiêu thụ
ASSETS = [
  # id, name, type, system, layer, classification, owner, description
  ("src_keycloak", "Tài khoản & vai trò", "source", "Keycloak", 1, "confidential", "IT", "Danh tính SSO: sub, email, vai trò admin/hr/manager/employee"),
  ("src_hr_forms", "Biểu mẫu HR (hồ sơ, tải hợp đồng)", "source", "Frontend", 1, "pii", "HR", "HR nhập hồ sơ nhân viên mới và tải bản hợp đồng đã ký"),
  ("src_requests", "Đơn nghỉ phép / đề xuất lương", "source", "Frontend", 1, "internal", "Nhân viên, Quản lý", "Nhân viên và quản lý tạo đơn, đề xuất, quyết định duyệt"),
  ("src_law", "Kho tri thức pháp luật", "source", "ai/knowledge", 1, "public", "HR", "Luật Lao động, BHXH, thuế TNCN, chính sách nội bộ (Markdown)"),
  ("tbl_users", "users", "table", "PostgreSQL", 2, "confidential", "IT", "Danh tính đồng bộ từ Keycloak (id = sub)"),
  ("tbl_employees", "employees", "table", "PostgreSQL", 2, "pii", "HR", "Hồ sơ nhân sự: họ tên, ngày sinh, mã số thuế, số BHXH"),
  ("tbl_contracts", "contracts", "table", "PostgreSQL", 2, "confidential", "HR", "Hợp đồng lao động: loại, thời hạn, lương cơ bản, phụ cấp"),
  ("tbl_payrolls", "payrolls", "table", "PostgreSQL", 2, "confidential", "HR", "Bảng lương hằng tháng: Gross, bảo hiểm, thuế, Net"),
  ("tbl_insurance", "insurance_records", "table", "PostgreSQL", 2, "confidential", "HR", "Quá trình đóng BHXH, BHYT, BHTN theo tháng"),
  ("tbl_leave", "leave_requests / leave_balances", "table", "PostgreSQL", 2, "internal", "HR", "Đơn nghỉ phép và quỹ phép năm"),
  ("tbl_proposals", "salary_proposals / approval_steps", "table", "PostgreSQL", 2, "confidential", "HR", "Đề xuất tăng lương và lịch sử duyệt từng cấp"),
  ("tbl_notifications", "notifications", "table", "PostgreSQL", 2, "internal", "IT", "Thông báo gửi cho người dùng"),
  ("tbl_audit", "audit_logs", "table", "PostgreSQL", 2, "confidential", "Kiểm toán", "Nhật ký bất biến, liên kết chuỗi băm SHA-256"),
  ("obj_contracts", "Bucket contracts", "object_store", "MinIO", 2, "confidential", "HR", "PDF hợp đồng (bản sinh tự động và bản ký)"),
  ("obj_payslips", "Bucket payslips", "object_store", "MinIO", 2, "confidential", "HR", "PDF phiếu lương theo tháng"),
  ("vec_knowledge", "Qdrant: peopleos_knowledge", "vector_store", "Qdrant", 2, "public", "IT", "Vector embedding của kho tri thức pháp luật"),
  ("proc_onboarding", "Quy trình onboarding", "process", "Backend + n8n", 3, "internal", "HR", "Tạo hồ sơ, hợp đồng, quỹ phép, tài khoản SSO, checklist"),
  ("proc_leave", "Quy trình nghỉ phép", "process", "Backend + n8n", 3, "internal", "HR", "Kiểm tra quỹ phép, định tuyến duyệt, thông báo"),
  ("proc_proposal", "Quy trình đề xuất lương nhiều cấp", "process", "Backend + n8n", 3, "internal", "HR", "Quản lý → HR → Giám đốc; áp dụng vào hợp đồng"),
  ("proc_payroll", "Module tính lương", "process", "peopleos_shared", 3, "internal", "HR", "Gross → Net theo luật 2026: bảo hiểm, giảm trừ, thuế lũy tiến"),
  ("proc_pdf", "Sinh PDF", "process", "Backend", 3, "internal", "IT", "Tạo phiếu lương và hợp đồng PDF, lưu MinIO"),
  ("proc_clamav", "Quét mã độc", "process", "ClamAV", 3, "internal", "IT", "Quét mọi tệp tải lên trước khi lưu MinIO"),
  ("proc_embed", "Embedding RAG", "process", "Ollama", 3, "internal", "IT", "Tách đoạn và tạo vector bằng bge-m3"),
  ("view_kpi", "Views v_* cho dashboard", "view", "PostgreSQL + Hasura", 3, "confidential", "HR", "Tổng hợp nhân sự, chi phí lương, nghỉ phép, hợp đồng sắp hết hạn"),
  ("proc_audit", "Chuỗi băm kiểm toán", "process", "PostgreSQL trigger", 3, "internal", "Kiểm toán", "Ghi mọi thay đổi dữ liệu nhạy cảm và liên kết băm SHA-256"),
  ("out_portal", "Cổng tự phục vụ", "output", "Frontend", 4, "pii", "Nhân viên", "Hồ sơ, hợp đồng, phiếu lương, BHXH, nghỉ phép (theo quyền)"),
  ("out_dashboard", "Dashboard điều hành", "output", "Frontend", 4, "confidential", "Ban điều hành", "KPI nhân sự, chi phí lương, nghỉ phép, hợp đồng sắp hết hạn"),
  ("out_ai", "Trợ lý AI", "output", "RAG service", 4, "internal", "Nhân viên", "Hỏi đáp luật, tính Gross/Net, tra cứu dữ liệu cá nhân"),
  ("out_ws", "Thông báo realtime", "output", "NATS + WebSocket", 4, "internal", "Nhân viên", "Toast và chuông thông báo"),
  ("out_files", "Tải PDF", "output", "Backend", 4, "confidential", "Nhân viên", "Người dùng tải phiếu lương và hợp đồng"),
  ("out_audit_ui", "Trang kiểm toán", "output", "Frontend", 4, "confidential", "Kiểm toán", "Xem nhật ký và xác minh toàn vẹn chuỗi băm"),
]
EDGES = [
  ("src_keycloak", "tbl_users", "Đồng bộ sub, email, vai trò"),
  ("src_hr_forms", "proc_onboarding", "POST /api/employees"),
  ("proc_onboarding", "tbl_employees", "Tạo hồ sơ nhân sự"),
  ("proc_onboarding", "tbl_contracts", "Tạo hợp đồng ban đầu"),
  ("proc_onboarding", "tbl_users", "Tạo tài khoản qua Keycloak Admin API"),
  ("src_requests", "proc_leave", "POST /api/leave-requests"),
  ("src_requests", "proc_proposal", "POST /api/salary-proposals"),
  ("proc_leave", "tbl_leave", "Ghi đơn, cập nhật quỹ phép"),
  ("proc_proposal", "tbl_proposals", "Ghi đề xuất và các bước duyệt"),
  ("proc_proposal", "tbl_contracts", "Áp dụng mức lương mới khi duyệt xong"),
  ("proc_leave", "tbl_notifications", "Workflow n8n tạo thông báo"),
  ("proc_proposal", "tbl_notifications", "Workflow n8n tạo thông báo"),
  ("proc_onboarding", "tbl_notifications", "Workflow n8n tạo thông báo"),
  ("tbl_contracts", "proc_payroll", "Lương cơ bản, phụ cấp"),
  ("tbl_employees", "proc_payroll", "Người phụ thuộc, vùng lương"),
  ("proc_payroll", "tbl_payrolls", "Gross → Net hằng tháng"),
  ("proc_payroll", "tbl_insurance", "Phần bảo hiểm NLĐ và doanh nghiệp"),
  ("tbl_payrolls", "proc_pdf", "Dữ liệu phiếu lương"),
  ("tbl_contracts", "proc_pdf", "Dữ liệu hợp đồng"),
  ("tbl_employees", "proc_pdf", "Thông tin người lao động"),
  ("src_hr_forms", "proc_clamav", "Tệp hợp đồng đã ký tải lên"),
  ("proc_clamav", "obj_contracts", "Chỉ lưu tệp sạch, đúng định dạng PDF"),
  ("proc_pdf", "obj_payslips", "Lưu PDF phiếu lương"),
  ("proc_pdf", "obj_contracts", "Lưu PDF hợp đồng"),
  ("obj_payslips", "out_files", "Tải qua backend sau khi kiểm quyền"),
  ("obj_contracts", "out_files", "Tải qua backend sau khi kiểm quyền"),
  ("tbl_employees", "view_kpi", "Đếm nhân sự theo phòng ban"),
  ("tbl_contracts", "view_kpi", "Lương trung bình, hợp đồng sắp hết hạn"),
  ("tbl_payrolls", "view_kpi", "Tổng Gross, Net, thuế theo tháng"),
  ("tbl_insurance", "view_kpi", "Chi phí bảo hiểm doanh nghiệp"),
  ("tbl_leave", "view_kpi", "Thống kê nghỉ phép"),
  ("tbl_proposals", "view_kpi", "Số đề xuất đang chờ"),
  ("view_kpi", "out_dashboard", "GraphQL (HR/Admin)"),
  ("tbl_employees", "out_portal", "GraphQL theo quyền hàng"),
  ("tbl_contracts", "out_portal", "GraphQL theo quyền hàng"),
  ("tbl_payrolls", "out_portal", "GraphQL theo quyền hàng"),
  ("tbl_insurance", "out_portal", "GraphQL theo quyền hàng"),
  ("tbl_leave", "out_portal", "GraphQL theo quyền hàng"),
  ("tbl_notifications", "out_ws", "Backend → NATS → WebSocket"),
  ("src_law", "proc_embed", "Tách đoạn, embedding bge-m3"),
  ("proc_embed", "vec_knowledge", "Ghi vector vào Qdrant"),
  ("vec_knowledge", "out_ai", "Truy xuất top-k làm ngữ cảnh"),
  ("proc_payroll", "out_ai", "Công cụ tính Gross ↔ Net"),
  ("tbl_leave", "out_ai", "Tra cứu bằng JWT của người hỏi"),
  ("tbl_payrolls", "out_ai", "Tra cứu bằng JWT của người hỏi"),
  ("tbl_employees", "proc_audit", "Trigger ghi mọi thay đổi"),
  ("tbl_contracts", "proc_audit", "Trigger ghi mọi thay đổi"),
  ("tbl_payrolls", "proc_audit", "Trigger ghi mọi thay đổi"),
  ("tbl_leave", "proc_audit", "Trigger ghi mọi thay đổi"),
  ("tbl_proposals", "proc_audit", "Trigger ghi mọi thay đổi"),
  ("proc_audit", "tbl_audit", "Liên kết chuỗi băm SHA-256"),
  ("tbl_audit", "out_audit_ui", "GraphQL (Admin) + xác minh chuỗi"),
]
for a in ASSETS:
    insert("data_assets", [dict(zip(["id", "name", "asset_type", "system", "layer", "classification", "owner", "description"], a))])
for src, dst, tf in EDGES:
    insert("data_lineage", [dict(source_id=src, target_id=dst, transform=tf)])

print("\n".join(out))
