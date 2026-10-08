"""Tính lương Gross -> Net theo quy định Việt Nam.

Module thuần Python, không phụ thuộc thư viện ngoài, được dùng chung bởi:
  * BFF  (sinh phiếu lương, kiểm tra đề xuất),
  * RAG  (trả lời "Gross X thì Net bao nhiêu?"),
  * script seed dữ liệu mẫu.

Tham số pháp lý (cập nhật tháng 10/2026):
  * Giảm trừ gia cảnh từ kỳ tính thuế 2026: 15,5 triệu (bản thân), 6,2 triệu (người phụ thuộc)
    - Nghị quyết 110/2025/UBTVQH15; biểu thuế lũy tiến 5 bậc - Luật Thuế TNCN 109/2025/QH15.
  * Trước 2026: 11 triệu / 4,4 triệu và biểu thuế 7 bậc.
  * Lương cơ sở: 2,34 triệu (07/2024-06/2026), 2,53 triệu từ 01/07/2026 (NĐ 161/2026/NĐ-CP).
    Trần đóng BHXH/BHYT = 20 x lương cơ sở.
  * Lương tối thiểu vùng 2026 (NĐ 293/2025/NĐ-CP). Trần đóng BHTN = 20 x lương tối thiểu vùng.
  * Tỷ lệ đóng: NLĐ 8% BHXH + 1,5% BHYT + 1% BHTN; NSDLĐ 17,5% + 3% + 1%.

Không xử lý: thu nhập miễn thuế (ăn trưa, đồng phục...), đóng góp từ thiện/hưu trí tự nguyện.
Kết quả mang tính tham khảo, không thay thế tư vấn của kế toán/pháp lý.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

REGION_MIN_WAGE_2026 = {1: 5_310_000, 2: 4_730_000, 3: 4_140_000, 4: 3_700_000}
REGION_MIN_WAGE_2025 = {1: 4_960_000, 2: 4_410_000, 3: 3_860_000, 4: 3_450_000}

EMPLOYEE_RATES = {"bhxh": 0.08, "bhyt": 0.015, "bhtn": 0.01}
EMPLOYER_RATES = {"bhxh": 0.175, "bhyt": 0.03, "bhtn": 0.01}

# (giới hạn trên của bậc, thuế suất) - thu nhập tính thuế THÁNG
BRACKETS_2026 = [(10e6, 0.05), (30e6, 0.10), (60e6, 0.20), (100e6, 0.30), (float("inf"), 0.35)]
BRACKETS_LEGACY = [
    (5e6, 0.05), (10e6, 0.10), (18e6, 0.15), (32e6, 0.20),
    (52e6, 0.25), (80e6, 0.30), (float("inf"), 0.35),
]


def _r(x: float) -> int:
    """Làm tròn về đồng (half-up)."""
    return int(x + 0.5)


def base_salary_ref(on: date) -> int:
    """Mức lương cơ sở có hiệu lực tại ngày `on`."""
    if on >= date(2026, 7, 1):
        return 2_530_000
    if on >= date(2024, 7, 1):
        return 2_340_000
    return 1_800_000


def progressive_tax(taxable: float, brackets) -> int:
    """Thuế lũy tiến từng phần trên thu nhập tính thuế tháng."""
    tax, lower = 0.0, 0.0
    for upper, rate in brackets:
        if taxable <= lower:
            break
        tax += (min(taxable, upper) - lower) * rate
        lower = upper
    return _r(tax)


@dataclass
class PayrollResult:
    gross: int
    insured_salary: int
    bhxh: int
    bhyt: int
    bhtn: int
    insurance_total: int
    personal_deduction: int
    dependent_deduction: int
    taxable_income: int
    pit: int
    net: int
    employer_bhxh: int
    employer_bhyt: int
    employer_bhtn: int
    employer_total: int
    total_employer_cost: int
    rules: str  # "2026" hoặc "legacy"

    def as_dict(self) -> dict:
        return asdict(self)


def compute_net(
    gross: int,
    *,
    dependents: int = 0,
    region: int = 1,
    on: date | None = None,
    insured_salary: int | None = None,
) -> PayrollResult:
    """Tính các khoản khấu trừ và lương thực nhận (Net).

    gross           : tổng thu nhập trước thuế/bảo hiểm trong tháng.
    dependents      : số người phụ thuộc đã đăng ký giảm trừ.
    region          : vùng lương tối thiểu (1-4).
    on              : tháng tính lương (quyết định tham số pháp lý), mặc định hôm nay.
    insured_salary  : lương làm căn cứ đóng bảo hiểm (mặc định = gross).
    """
    on = on or date.today()
    if region not in (1, 2, 3, 4):
        raise ValueError("region phải thuộc 1..4")
    if gross < 0 or dependents < 0:
        raise ValueError("gross và dependents không được âm")

    new_rules = on >= date(2026, 1, 1)
    min_wage = (REGION_MIN_WAGE_2026 if new_rules else REGION_MIN_WAGE_2025)[region]
    insured = gross if insured_salary is None else insured_salary

    cap_social = 20 * base_salary_ref(on)
    cap_unemp = 20 * min_wage
    bhxh = _r(min(insured, cap_social) * EMPLOYEE_RATES["bhxh"])
    bhyt = _r(min(insured, cap_social) * EMPLOYEE_RATES["bhyt"])
    bhtn = _r(min(insured, cap_unemp) * EMPLOYEE_RATES["bhtn"])
    insurance = bhxh + bhyt + bhtn

    personal, dep_each = (15_500_000, 6_200_000) if new_rules else (11_000_000, 4_400_000)
    dep_total = dep_each * dependents
    taxable = max(0, gross - insurance - personal - dep_total)
    pit = progressive_tax(taxable, BRACKETS_2026 if new_rules else BRACKETS_LEGACY)

    e_bhxh = _r(min(insured, cap_social) * EMPLOYER_RATES["bhxh"])
    e_bhyt = _r(min(insured, cap_social) * EMPLOYER_RATES["bhyt"])
    e_bhtn = _r(min(insured, cap_unemp) * EMPLOYER_RATES["bhtn"])
    e_total = e_bhxh + e_bhyt + e_bhtn

    return PayrollResult(
        gross=gross, insured_salary=insured,
        bhxh=bhxh, bhyt=bhyt, bhtn=bhtn, insurance_total=insurance,
        personal_deduction=personal, dependent_deduction=dep_total,
        taxable_income=taxable, pit=pit, net=gross - insurance - pit,
        employer_bhxh=e_bhxh, employer_bhyt=e_bhyt, employer_bhtn=e_bhtn,
        employer_total=e_total, total_employer_cost=gross + e_total,
        rules="2026" if new_rules else "legacy",
    )


def format_vnd(amount: int | float) -> str:
    """1234567 -> '1.234.567 đ'."""
    return f"{int(amount):,}".replace(",", ".") + " đ"
