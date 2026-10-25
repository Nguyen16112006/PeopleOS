# SPDX-License-Identifier: Apache-2.0
"""Phân loại câu hỏi + trích xuất tham số (số tiền, người phụ thuộc, vùng)."""
import re
import unicodedata
from typing import Optional


def strip_accents(s: str) -> str:
    s = unicodedata.normalize("NFD", s.lower().replace("đ", "d"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def classify(message: str) -> str:
    t = strip_accents(message)
    has_amount = parse_amount(message) is not None
    if re.search(r"\b(gross|net)\b|thuc nhan|thuc linh|luong rong", t) and (has_amount or "gross" in t):
        return "net_calc"
    if re.search(r"(don|xin).{0,15}(nghi phep|nghi om)|nghi phep cua toi|trang thai.{0,20}don|don nghi", t):
        return "leave_status"
    if re.search(r"(con|bao nhieu|so).{0,12}ngay phep|ngay phep.{0,12}con|quy phep", t):
        return "leave_balance"
    if re.search(r"(luong|phieu luong|payslip).{0,25}(thang nay|thang truoc|gan nhat|moi nhat|cua toi)|luong cua toi", t):
        return "payslip"
    return "rag"


_UNIT = re.compile(r"(\d+(?:[.,]\d+)?)\s*(triệu|trieu|tr|m)\b", re.I)
_PLAIN = re.compile(r"\d{1,3}(?:[.,]\d{3})+|\d{6,}")


def parse_amount(message: str) -> Optional[int]:
    """'30 triệu' / '30tr' / '30.5 triệu' / '30.000.000' / '30000000' -> số đồng."""
    m = _UNIT.search(message)
    if m:
        return int(round(float(m.group(1).replace(",", ".")) * 1_000_000))
    m = _PLAIN.search(message)
    if m:
        return int(re.sub(r"[.,]", "", m.group(0)))
    return None


def amount_context(message: str) -> str:
    """'gross' hay 'net' đứng ngay trước số tiền? -> quyết định chiều quy đổi."""
    t = message.lower()
    m = _UNIT.search(t) or _PLAIN.search(t)
    if not m:
        return "gross"
    before = t[max(0, m.start() - 25):m.start()]
    g, n = before.rfind("gross"), max(before.rfind("net"), before.rfind("thực nhận"), before.rfind("thực lãnh"))
    return "net" if n > g else "gross"


def parse_dependents(message: str) -> int:
    t = strip_accents(message)
    if re.search(r"khong (co )?(nguoi )?phu thuoc", t):
        return 0
    m = re.search(r"(\d+)\s*(nguoi\s*)?(phu thuoc|con)", t)
    return int(m.group(1)) if m else 0


def parse_region(message: str) -> int:
    t = strip_accents(message)
    m = re.search(r"vung\s*(1|2|3|4|iv|iii|ii|i)\b", t)
    if not m:
        return 1
    return {"1": 1, "i": 1, "2": 2, "ii": 2, "3": 3, "iii": 3, "4": 4, "iv": 4}[m.group(1)]
