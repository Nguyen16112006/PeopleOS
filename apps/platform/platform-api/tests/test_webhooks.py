# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

import hashlib
import hmac
import json
import threading
import uuid
from datetime import datetime, timedelta, timezone


from platform_api.db import ApiError
from platform_api.security import assert_public_url, decrypt
from platform_api.webhooks import BACKOFF, MAX_ATTEMPTS, deliver_due

from .conftest import DEV_A, DEV_B, auth

EV = {"x-platform-secret": "evsecret"}


def q(ctx, sql, *p):
    with ctx.db.tx() as c:
        return c.execute(sql, p).fetchall()


def hook(client, p, url, events=("*",), dev=DEV_A):
    r = client.post(f"/v1/projects/{p['id']}/webhooks", json={"url": url, "events": list(events)}, headers=auth(dev))
    assert r.status_code == 201, r.text
    return r.json()


def hasura_event(tenant_id, table="employees", op="INSERT", new=None, old=None, eid=None):
    row = {"id": str(uuid.uuid4()), "tenant_id": str(tenant_id), "full_name": "Nguyễn A"}
    data = {"old": old, "new": new if new is not None else (row if op != "DELETE" else None)}
    return {"id": eid or str(uuid.uuid4()), "table": {"schema": "public", "name": table}, "trigger": {"name": f"platform_events_{table}"},
            "event": {"op": op, "data": data, "session_variables": {}}, "created_at": "2026-10-29T08:00:00Z"}


def send(client, ev, headers=EV):
    return client.post("/internal/hasura-events", json=ev, headers=headers)


# ---------------- Đăng ký ----------------
def test_ssrf_blocked_by_real_checker(client, ctx, make_project):
    p = make_project()
    ctx.check_url = lambda u: assert_public_url(u, False, False)           # bộ kiểm tra thật (không nới lỏng như các test khác)
    for url in ("https://127.0.0.1/h", "https://localhost/h", "https://10.1.2.3/h", "https://192.168.1.1/h",
                "https://169.254.169.254/latest/meta-data", "https://[::1]/h", "http://example.com/h",
                "https://user:pw@example.com/h", "ftp://example.com/h"):
        r = client.post(f"/v1/projects/{p['id']}/webhooks", json={"url": url, "events": ["*"]}, headers=auth())
        assert r.status_code == 422, url
    assert not q(ctx, "SELECT 1 FROM platform.webhook_endpoints")


def test_secret_shown_once_and_encrypted(client, ctx, make_project, receiver):
    p = make_project()
    h = hook(client, p, receiver.url)
    assert h["secret"].startswith("whsec_")
    row = q(ctx, "SELECT secret_enc FROM platform.webhook_endpoints WHERE id=%s", h["id"])[0]
    assert h["secret"] not in row["secret_enc"] and decrypt(ctx.settings.secret_key, row["secret_enc"]) == h["secret"]
    listed = client.get(f"/v1/projects/{p['id']}/webhooks", headers=auth()).json()
    assert "secret" not in listed[0] and "secret_enc" not in listed[0]
    assert client.post(f"/v1/projects/{p['id']}/webhooks", json={"url": receiver.url, "events": ["employee.exploded"]}, headers=auth()).status_code == 422
    assert client.post(f"/v1/projects/{p['id']}/webhooks", json={"url": receiver.url, "events": []}, headers=auth()).status_code == 422
    hook(client, p, receiver.url); hook(client, p, receiver.url)
    assert client.post(f"/v1/projects/{p['id']}/webhooks", json={"url": receiver.url, "events": ["*"]}, headers=auth()).status_code == 403   # free: 3
    assert client.delete(f"/v1/projects/{p['id']}/webhooks/{h['id']}", headers=auth(DEV_B)).status_code == 404


# ---------------- Nhận sự kiện từ Hasura ----------------
def test_ingest_requires_secret(client, make_project):
    p = make_project()
    ev = hasura_event(p["id"])
    assert send(client, ev, {}).status_code == 401
    assert send(client, ev, {"x-platform-secret": "sai"}).status_code == 401
    assert send(client, {"bad": 1}).status_code == 400
    assert send(client, hasura_event(p["id"], new={"id": "x"})).status_code == 400        # thiếu tenant_id


def test_events_only_reach_own_tenant(client, ctx, make_project, receiver):
    a, b = make_project(DEV_A, "Alpha"), make_project(DEV_B, "Beta")
    ha = hook(client, a, receiver.url, ["employee.created"])
    hb = hook(client, b, receiver.url, ["*"], dev=DEV_B)
    r = send(client, hasura_event(a["id"]))
    assert r.json() == {"queued": 1}
    rows = q(ctx, "SELECT endpoint_id, tenant_id FROM platform.webhook_deliveries")
    assert [(str(x["endpoint_id"]), str(x["tenant_id"])) for x in rows] == [(ha["id"], a["id"])]      # B (đăng ký '*') không nhận gì
    assert send(client, hasura_event(a["id"], op="UPDATE", old={"x": 1})).json() == {"queued": 0}      # A chỉ đăng ký created
    assert send(client, hasura_event(a["id"], table="users")).json()["ignored"] is True                  # bảng không hỗ trợ
    ev = hasura_event(a["id"]); assert send(client, ev).json() == {"queued": 1}; assert send(client, ev).json() == {"queued": 1}
    assert q(ctx, "SELECT count(*) AS n FROM platform.webhook_deliveries WHERE event_id = %s", ev["id"])[0]["n"] == 1   # Hasura retry không tạo trùng
    ctx_b = send(client, hasura_event(b["id"], table="payrolls", op="DELETE", old={"id": "1", "tenant_id": b["id"]}))
    assert ctx_b.json() == {"queued": 1}
    assert q(ctx, "SELECT event_type FROM platform.webhook_deliveries WHERE endpoint_id = %s", hb["id"])[0]["event_type"] == "payroll.deleted"


def test_suspended_tenant_gets_nothing(client, ctx, make_project, receiver):
    a = make_project(); hook(client, a, receiver.url)
    with ctx.db.tx() as c:
        c.execute("UPDATE platform.tenants SET status='suspended' WHERE id=%s", (a["id"],))
    assert send(client, hasura_event(a["id"])).json()["queued"] == 0


# ---------------- Giao hàng ----------------
def test_delivery_is_signed_and_marked_delivered(client, ctx, make_project, receiver):
    a = make_project(); h = hook(client, a, receiver.url)
    ev = hasura_event(a["id"], op="UPDATE", old={"department": "IT"}, new={"id": "e1", "tenant_id": a["id"], "department": "HR"})
    send(client, ev)
    assert deliver_due(ctx) == {"delivered": 1, "retry": 0, "dead": 0}
    req = receiver.requests[0]
    sig = dict(kv.split("=", 1) for kv in req["headers"]["X-PeopleOS-Signature"].split(","))
    expected = hmac.new(h["secret"].encode(), f"{sig['t']}.{req['body']}".encode(), hashlib.sha256).hexdigest()
    assert hmac.compare_digest(sig["v1"], expected)                                                   # developer tự kiểm chứng được
    body = json.loads(req["body"])
    assert body["id"] == ev["id"] and body["type"] == "employee.updated" and body["tenant_id"] == a["id"]
    assert body["data"]["object"]["department"] == "HR" and body["data"]["previous"] == {"department": "IT"}
    assert req["headers"]["X-PeopleOS-Event"] == "employee.updated" and req["headers"]["X-PeopleOS-Delivery"]
    d = q(ctx, "SELECT status, attempts, delivered_at FROM platform.webhook_deliveries")[0]
    assert d["status"] == "delivered" and d["attempts"] == 1 and d["delivered_at"] is not None
    assert deliver_due(ctx) == {"delivered": 0, "retry": 0, "dead": 0}                                # không giao lại


def test_retry_with_backoff_then_success(client, ctx, make_project, receiver):
    a = make_project(); hook(client, a, receiver.url); send(client, hasura_event(a["id"]))
    receiver.codes[:] = [500, 503]
    t0 = datetime.now(timezone.utc)
    assert deliver_due(ctx, now=t0)["retry"] == 1
    d = q(ctx, "SELECT status, attempts, next_attempt_at, last_status FROM platform.webhook_deliveries")[0]
    assert d["status"] == "failed" and d["attempts"] == 1 and d["last_status"] == 500
    assert abs((d["next_attempt_at"] - t0).total_seconds() - BACKOFF[0]) < 1
    assert deliver_due(ctx, now=t0 + timedelta(seconds=30)) == {"delivered": 0, "retry": 0, "dead": 0}   # chưa đến hạn
    assert deliver_due(ctx, now=t0 + timedelta(seconds=61))["retry"] == 1                                # lần 2 vẫn lỗi (503)
    assert deliver_due(ctx, now=t0 + timedelta(seconds=61 + BACKOFF[1] + 1))["delivered"] == 1            # lần 3 thành công
    assert q(ctx, "SELECT status, attempts FROM platform.webhook_deliveries")[0] == {"status": "delivered", "attempts": 3}


def test_dead_after_max_attempts_and_replay(client, ctx, make_project, receiver):
    a = make_project(); hook(client, a, receiver.url); send(client, hasura_event(a["id"]))
    receiver.codes[:] = [500] * MAX_ATTEMPTS
    now = datetime.now(timezone.utc)
    last = None
    for i in range(MAX_ATTEMPTS):
        now += timedelta(hours=7)
        last = deliver_due(ctx, now=now)
    assert last["dead"] == 1
    d = q(ctx, "SELECT id, status, attempts FROM platform.webhook_deliveries")[0]
    assert d["status"] == "dead" and d["attempts"] == MAX_ATTEMPTS
    assert deliver_due(ctx, now=now + timedelta(days=2)) == {"delivered": 0, "retry": 0, "dead": 0}
    assert client.post(f"/v1/projects/{a['id']}/webhook-deliveries/{d['id']}/replay", headers=auth(DEV_B)).status_code == 404
    assert client.post(f"/v1/projects/{a['id']}/webhook-deliveries/{d['id']}/replay", headers=auth()).status_code == 202
    assert deliver_due(ctx)["delivered"] == 1                                                         # replay giao được khi endpoint đã khỏe lại
    log = client.get(f"/v1/projects/{a['id']}/webhook-deliveries", headers=auth()).json()
    assert log[0]["status"] == "delivered"


def test_redirects_are_not_followed(client, ctx, make_project, receiver):
    a = make_project(); hook(client, a, receiver.url); send(client, hasura_event(a["id"]))
    receiver.codes[:] = [302]
    assert deliver_due(ctx)["retry"] == 1 and len(receiver.requests) == 1                             # không đi theo chuyển hướng (chống SSRF vòng)


def test_disabled_endpoint_and_ssrf_at_delivery_time(client, ctx, make_project, receiver):
    a = make_project(); h = hook(client, a, receiver.url); send(client, hasura_event(a["id"]))
    ctx.check_url = lambda u: (_ for _ in ()).throw(ApiError(422, "URL webhook không được trỏ vào mạng nội bộ"))   # DNS đổi sang IP nội bộ sau khi đăng ký
    assert deliver_due(ctx)["retry"] == 1 and receiver.requests == []                                  # bị chặn trước khi gửi
    assert "nội bộ" in q(ctx, "SELECT last_error FROM platform.webhook_deliveries")[0]["last_error"]
    with ctx.db.tx() as c:
        c.execute("UPDATE platform.webhook_endpoints SET active=false WHERE id=%s", (h["id"],))
        c.execute("UPDATE platform.webhook_deliveries SET next_attempt_at = now() - interval '1 minute'")
    assert deliver_due(ctx)["dead"] == 1


def test_ping(client, ctx, make_project, receiver):
    a = make_project(); h = hook(client, a, receiver.url, ["employee.created"])
    assert client.post(f"/v1/projects/{a['id']}/webhooks/{h['id']}/test", headers=auth()).status_code == 202
    assert client.post(f"/v1/projects/{a['id']}/webhooks/{h['id']}/test", headers=auth(DEV_B)).status_code == 404
    assert deliver_due(ctx)["delivered"] == 1 and json.loads(receiver.requests[0]["body"])["type"] == "ping"


def test_parallel_workers_never_double_deliver(client, ctx, make_project, receiver):
    a = make_project(); hook(client, a, receiver.url)
    for _ in range(12):
        send(client, hasura_event(a["id"]))
    results = []
    ts = [threading.Thread(target=lambda: results.append(deliver_due(ctx, limit=4))) for _ in range(6)]
    [t.start() for t in ts]; [t.join() for t in ts]
    while deliver_due(ctx, limit=50)["delivered"]:
        pass
    assert len(receiver.requests) == 12 and len({r["headers"]["X-PeopleOS-Delivery"] for r in receiver.requests}) == 12
    assert q(ctx, "SELECT count(*) AS n FROM platform.webhook_deliveries WHERE status='delivered'")[0]["n"] == 12
