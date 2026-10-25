"""Công cụ trả lời câu hỏi bằng dữ liệu nội bộ: tính lương Net và tra cứu qua Hasura.

Các truy vấn Hasura dùng CHÍNH token của người hỏi (kèm x-hasura-role) nên chịu cùng
phân quyền với giao diện: AI không bao giờ thấy nhiều hơn người dùng được phép thấy.
"""
import base64
import json
from datetime import date

import httpx

from peopleos_shared.payroll import compute_net, format_vnd

from .config import settings
from .intents import amount_context, parse_amount, parse_dependents, parse_region

ROLE_ORDER = ["sysadmin", "director", "accountant", "hr", "manager", "employee"]
STATUS_VN = {"pending": "Chờ duyệt", "approved": "Đã duyệt", "rejected": "Từ chối", "cancelled": "Đã huỷ"}
TYPE_VN = {"annual": "Nghỉ phép năm", "sick": "Nghỉ ốm", "unpaid": "Nghỉ không lương", "personal": "Nghỉ việc riêng"}


def token_claims(token: str) -> dict:
    """Đọc payload JWT (KHÔNG xác thực - Hasura sẽ xác thực chữ ký khi nhận token)."""
    try:
        body = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except Exception:
        return {}


def pick_role(claims: dict) -> str:
    roles = (claims.get("realm_access") or {}).get("roles", [])
    return next((r for r in ROLE_ORDER if r in roles), "employee")


# --------------------------- Gross <-> Net ---------------------------
def reverse_net_to_gross(net: int, **kw) -> int:
    lo, hi = net, net * 3 + 50_000_000
    while lo < hi:
        mid = (lo + hi) // 2
        if compute_net(mid, **kw).net < net:
            lo = mid + 1
        else:
            hi = mid
    return lo


def net_calc_answer(message: str) -> str:
    amount = parse_amount(message)
    if amount is None:
        return "Bạn hãy cho mình biết mức lương, ví dụ: \"Lương Gross 30 triệu thì Net là bao nhiêu?\"."
    deps, region = parse_dependents(message), parse_region(message)
    kw = dict(dependents=deps, region=region, on=date.today())
    mode = amount_context(message)
    gross = amount if mode == "gross" else reverse_net_to_gross(amount, **kw)
    r = compute_net(gross, **kw)
    head = (f"Lương Gross {format_vnd(gross)} tương ứng lương Net khoảng {format_vnd(r.net)}"
            if mode == "gross" else
            f"Để nhận Net {format_vnd(amount)} bạn cần mức Gross khoảng {format_vnd(gross)}")
    lines = [
        head + f" (vùng {region}, {deps} người phụ thuộc, quy định thuế {'2026' if r.rules == '2026' else 'cũ'}).", "",
        f"• BHXH 8%: {format_vnd(r.bhxh)}",
        f"• BHYT 1,5%: {format_vnd(r.bhyt)}",
        f"• BHTN 1%: {format_vnd(r.bhtn)}",
        f"• Giảm trừ gia cảnh: {format_vnd(r.personal_deduction + r.dependent_deduction)}",
        f"• Thu nhập tính thuế: {format_vnd(r.taxable_income)}",
        f"• Thuế TNCN: {format_vnd(r.pit)}",
        f"• Thực nhận (Net): {format_vnd(r.net)}", "",
        f"Doanh nghiệp đóng thêm {format_vnd(r.employer_total)} bảo hiểm (21,5%), tổng chi phí {format_vnd(r.total_employer_cost)}.",
        "Giả định lương đóng bảo hiểm bằng Gross (có áp trần) và chưa tính các khoản miễn thuế. Kết quả chỉ mang tính tham khảo.",
    ]
    return "\n".join(lines)


# --------------------------- Dữ liệu nội bộ (Hasura) ---------------------------
async def hasura_query(token: str, query: str, variables: dict) -> dict:
    role = pick_role(token_claims(token))
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(settings.hasura_url, json={"query": query, "variables": variables},
                         headers={"Authorization": f"Bearer {token}", "x-hasura-role": role})
    body = r.json()
    if body.get("errors"):
        raise RuntimeError(body["errors"][0].get("message", "Lỗi Hasura"))
    return body["data"]


Q_LEAVES = """query MyLeaves($uid: uuid!) {
  leave_requests(where: {employee: {user_id: {_eq: $uid}}}, order_by: {created_at: desc}, limit: 5) {
    leave_type start_date end_date days status decision_note
  } }"""
Q_BALANCE = """query MyBalance($uid: uuid!, $year: smallint!) {
  leave_balances(where: {employee: {user_id: {_eq: $uid}}, year: {_eq: $year}}) { entitled_days used_days sick_days_used } }"""
Q_PAYSLIP = """query MyPayslip($uid: uuid!) {
  payrolls(where: {employee: {user_id: {_eq: $uid}}}, order_by: [{period_year: desc}, {period_month: desc}], limit: 1) {
    period_month period_year gross net_salary personal_income_tax bhxh_employee bhyt_employee bhtn_employee } }"""


async def leave_status_answer(token: str) -> str:
    uid = token_claims(token).get("sub")
    if not uid:
        return "Mình chưa xác định được tài khoản của bạn. Hãy đăng nhập lại."
    rows = (await hasura_query(token, Q_LEAVES, {"uid": uid}))["leave_requests"]
    if not rows:
        return "Bạn chưa có đơn nghỉ phép nào trong hệ thống."
    out = ["Các đơn nghỉ phép gần đây của bạn:"]
    for r in rows:
        span = r["start_date"] if r["start_date"] == r["end_date"] else f"{r['start_date']} → {r['end_date']}"
        note = f" - ghi chú: {r['decision_note']}" if r.get("decision_note") else ""
        out.append(f"• {TYPE_VN.get(r['leave_type'], r['leave_type'])} {span} ({float(r['days']):g} ngày): "
                   f"{STATUS_VN.get(r['status'], r['status'])}{note}")
    pending = [r for r in rows if r["status"] == "pending"]
    if pending:
        out.append(f"\nHiện có {len(pending)} đơn đang chờ quản lý duyệt.")
    return "\n".join(out)


async def leave_balance_answer(token: str) -> str:
    uid = token_claims(token).get("sub")
    rows = (await hasura_query(token, Q_BALANCE, {"uid": uid, "year": date.today().year}))["leave_balances"]
    if not rows:
        return "Chưa có thông tin quỹ phép năm nay của bạn."
    b = rows[0]
    left = float(b["entitled_days"]) - float(b["used_days"])
    return (f"Năm {date.today().year} bạn được {float(b['entitled_days']):g} ngày phép, đã dùng {float(b['used_days']):g} ngày, "
            f"còn {left:g} ngày (đã nghỉ ốm {float(b['sick_days_used']):g} ngày, không trừ vào phép năm).")


async def payslip_answer(token: str) -> str:
    uid = token_claims(token).get("sub")
    rows = (await hasura_query(token, Q_PAYSLIP, {"uid": uid}))["payrolls"]
    if not rows:
        return "Chưa có phiếu lương nào của bạn trong hệ thống."
    p = rows[0]
    ins = int(p["bhxh_employee"]) + int(p["bhyt_employee"]) + int(p["bhtn_employee"])
    return (f"Phiếu lương tháng {p['period_month']:02d}/{p['period_year']}: Gross {format_vnd(p['gross'])}, bảo hiểm {format_vnd(ins)}, "
            f"thuế TNCN {format_vnd(p['personal_income_tax'])}, thực nhận {format_vnd(p['net_salary'])}. "
            "Bạn có thể tải PDF tại mục \"Bảng lương\".")
