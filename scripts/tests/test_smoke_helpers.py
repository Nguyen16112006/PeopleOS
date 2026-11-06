# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""Kiểm thử các hàm thuần của smoke-paas.py (bản thân bài smoke cần stack chạy thật nên không chạy được ở đây)."""
import hashlib
import hmac
import importlib.util
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("smoke", ROOT / "scripts" / "smoke-paas.py")
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)


def sign(secret, t, body):
    return f"t={t},v1=" + hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()


def test_verify_signature_accepts_valid_and_rejects_tampering():
    now = int(time.time()); body = '{"a":1}'
    assert smoke.verify_signature("s3", sign("s3", now, body), body)
    assert not smoke.verify_signature("s3", sign("s3", now, body), body + " ")           # sửa body
    assert not smoke.verify_signature("khac", sign("s3", now, body), body)               # sai secret
    assert not smoke.verify_signature("s3", sign("s3", now - 3600, body), body)          # quá hạn (chống replay)
    assert not smoke.verify_signature("s3", "rac", body) and not smoke.verify_signature("s3", "", body)


def test_signature_matches_platform_api_signer():
    """Bên kiểm tra (smoke/developer) phải khớp với bên ký (platform-api)."""
    sys.path.insert(0, str(ROOT / "apps/platform/platform-api"))
    from platform_api.security import sign_payload
    t = int(time.time()); body = '{"type":"employee.created"}'
    assert smoke.verify_signature("whsec_x", sign_payload("whsec_x", t, body), body)


def test_wait_until_returns_value_and_times_out():
    assert smoke.wait_until(lambda: 42, timeout=1) == 42
    assert smoke.wait_until(lambda: None, timeout=0.3, every=0.1) is None


def test_step_runner_records_failures_without_crashing():
    s = smoke.Smoke()
    s.step("tốt", lambda: None)
    s.step("hỏng", lambda: (_ for _ in ()).throw(AssertionError("x")))
    s.step("lỗi lạ", lambda: 1 / 0)
    assert [r[1] for r in s.results] == [True, False, False] and not s.ok()
