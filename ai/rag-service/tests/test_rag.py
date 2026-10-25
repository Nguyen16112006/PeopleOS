# SPDX-License-Identifier: Apache-2.0
import base64
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parents[1] / "core" / "shared" / "python"))

from app import intents, tools  # noqa: E402
from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402
from app.rag import LexicalIndex, kb, load_chunks  # noqa: E402

KNOWLEDGE = str(ROOT.parents[0] / "knowledge")


def fake_token(sub="u-dung", roles=("employee",)):
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    return f"{b({'alg': 'none'})}.{b({'sub': sub, 'realm_access': {'roles': list(roles)}})}.sig"


@pytest.mark.parametrize("msg,expected", [
    ("Lương Gross 30 triệu thì thực nhận (Net) là bao nhiêu?", "net_calc"),
    ("Đơn nghỉ phép của tôi đang ở trạng thái nào?", "leave_status"),
    ("Tôi còn bao nhiêu ngày phép?", "leave_balance"),
    ("Lương tháng này của tôi", "payslip"),
    ("Thử việc tối đa bao nhiêu ngày?", "rag"),
    ("Tỷ lệ đóng BHXH của người lao động là bao nhiêu", "rag"),
])
def test_classify(msg, expected):
    assert intents.classify(msg) == expected


@pytest.mark.parametrize("msg,value", [
    ("gross 30 triệu", 30_000_000), ("lương 25tr", 25_000_000), ("gross 30,5 triệu", 30_500_000),
    ("gross 30.000.000 đ", 30_000_000), ("30000000", 30_000_000), ("không có số", None)])
def test_parse_amount(msg, value):
    assert intents.parse_amount(msg) == value


def test_dependents_and_region():
    assert intents.parse_dependents("gross 40 triệu, 2 người phụ thuộc") == 2
    assert intents.parse_dependents("không có người phụ thuộc") == 0
    assert intents.parse_region("ở vùng 2") == 2 and intents.parse_region("") == 1


def test_net_answer_matches_calculator():
    ans = tools.net_calc_answer("Lương Gross 30 triệu thì Net là bao nhiêu?")
    assert "26.215.000" in ans and "635.000" in ans


def test_reverse_net_to_gross_roundtrip():
    from peopleos_shared.payroll import compute_net
    from datetime import date
    g = tools.reverse_net_to_gross(26_215_000, dependents=0, region=1, on=date.today())
    assert compute_net(g, on=date.today()).net >= 26_215_000
    assert compute_net(g - 1, on=date.today()).net < 26_215_000
    assert "Gross khoảng" in tools.net_calc_answer("Muốn nhận net 26 triệu thì gross bao nhiêu?")


def test_knowledge_loads_and_lexical_retrieval():
    chunks = load_chunks(KNOWLEDGE)
    assert len(chunks) > 20
    idx = LexicalIndex(chunks)
    top = idx.search("thời gian thử việc tối đa bao nhiêu ngày", 3)
    assert any("Thử việc" in c.text for c in top)
    top = idx.search("mức giảm trừ gia cảnh 2026", 3)
    assert any("15.500.000" in c.text for c in top)
    top = idx.search("tỷ lệ đóng BHXH BHYT BHTN người lao động", 3)
    assert any("10,5%" in c.text for c in top)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "knowledge_dir", KNOWLEDGE)
    monkeypatch.setattr(settings, "ollama_url", "http://127.0.0.1:9")   # không tồn tại -> kích hoạt dự phòng
    kb.load()
    kb.vector_ready = False
    return TestClient(app)


def test_chat_net_calc_needs_no_llm(client):
    r = client.post("/chat", json={"message": "Lương Gross 30 triệu thì thực nhận (Net) là bao nhiêu?"}).json()
    assert r["intent"] == "net_calc" and r["mode"] == "calculator" and "26.215.000" in r["answer"]


def test_chat_rag_falls_back_to_extractive(client):
    r = client.post("/chat", json={"message": "Thời gian thử việc tối đa là bao lâu?"}).json()
    assert r["intent"] == "rag" and r["mode"].startswith("extractive")
    assert "180 ngày" in r["answer"] and r["sources"]


def test_chat_leave_status_uses_user_token(client, monkeypatch):
    seen = {}

    async def fake_q(token, query, variables):
        seen.update(variables)
        return {"leave_requests": [
            {"leave_type": "annual", "start_date": "2026-10-19", "end_date": "2026-10-20", "days": 2, "status": "pending", "decision_note": None},
            {"leave_type": "sick", "start_date": "2026-08-10", "end_date": "2026-08-10", "days": 1, "status": "approved", "decision_note": "Mau khỏe"}]}
    monkeypatch.setattr(tools, "hasura_query", fake_q)
    r = client.post("/chat", headers={"Authorization": "Bearer " + fake_token()}, json={"message": "Đơn nghỉ phép của tôi đang ở trạng thái nào?"}).json()
    assert seen["uid"] == "u-dung"
    assert "Chờ duyệt" in r["answer"] and "Đã duyệt" in r["answer"] and "1 đơn đang chờ" in r["answer"]


def test_chat_leave_status_requires_login(client):
    r = client.post("/chat", json={"message": "Đơn nghỉ phép của tôi đang ở trạng thái nào?"}).json()
    assert "đăng nhập" in r["answer"]


def test_pick_role_priority():
    assert tools.pick_role(tools.token_claims(fake_token(roles=("employee", "manager")))) == "manager"
