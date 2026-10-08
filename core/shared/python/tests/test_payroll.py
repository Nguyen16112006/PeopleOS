from datetime import date

import pytest

from peopleos_shared.payroll import compute_net, progressive_tax, BRACKETS_2026


def test_gross_30m_no_dependents_2026():
    r = compute_net(30_000_000, on=date(2026, 10, 1))
    assert r.insurance_total == 3_150_000          # 10,5%
    assert r.taxable_income == 11_350_000          # 30tr - 3,15tr - 15,5tr
    assert r.pit == 635_000                        # 5% x 10tr + 10% x 1,35tr
    assert r.net == 26_215_000


def test_below_threshold_pays_no_tax():
    r = compute_net(15_000_000, on=date(2026, 3, 1))
    assert r.taxable_income == 0 and r.pit == 0
    assert r.net == 15_000_000 - 1_575_000


def test_dependents_reduce_tax():
    a = compute_net(40_000_000, on=date(2026, 3, 1))
    b = compute_net(40_000_000, dependents=2, on=date(2026, 3, 1))
    assert b.pit < a.pit
    assert b.dependent_deduction == 12_400_000


def test_social_insurance_cap_changes_in_july_2026():
    before = compute_net(60_000_000, on=date(2026, 6, 1))
    after = compute_net(60_000_000, on=date(2026, 7, 1))
    assert before.bhxh == 3_744_000    # 46,8tr x 8%
    assert after.bhxh == 4_048_000     # 50,6tr x 8%
    assert after.bhtn == 600_000       # trần BHTN = 20 x 5,31tr = 106,2tr nên chưa bị chặn


def test_legacy_rules_2025():
    r = compute_net(30_000_000, on=date(2025, 6, 1))
    assert r.rules == "legacy"
    assert r.personal_deduction == 11_000_000


def test_progressive_tax_top_bracket():
    assert progressive_tax(120_000_000, BRACKETS_2026) == 20_500_000 + 7_000_000


def test_invalid_input():
    with pytest.raises(ValueError):
        compute_net(-1)
    with pytest.raises(ValueError):
        compute_net(10, region=9)
