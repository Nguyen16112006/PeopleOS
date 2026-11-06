# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

"""Webhook: đăng ký endpoint, nhận sự kiện từ Hasura Event Trigger, giao có ký HMAC + retry + dead-letter."""
import json
import time
from datetime import datetime, timedelta, timezone

import httpx

from .context import Ctx
from .db import ApiError
from .security import decrypt, encrypt, new_webhook_secret, sign_payload

ENTITIES = {"employees": "employee", "contracts": "contract", "leave_requests": "leave_request", "payrolls": "payroll"}
OPS = {"INSERT": "created", "UPDATE": "updated", "DELETE": "deleted"}
EVENT_TYPES = {f"{e}.{o}" for e in ENTITIES.values() for o in OPS.values()}
BACKOFF = [60, 300, 1800, 7200, 21600]      # giây, trước các lần thử 2..6
MAX_ATTEMPTS = 6


def create_endpoint(ctx: Ctx, t: dict, dev_id: str, url: str, events: list[str]) -> dict:
    bad = [e for e in events if e != "*" and e not in EVENT_TYPES]
    if not events or bad:
        raise ApiError(422, f"Sự kiện không hợp lệ: {bad or 'danh sách rỗng'}. Hợp lệ: {sorted(EVENT_TYPES)} hoặc '*'")
    ctx.check_url(url)
    secret = new_webhook_secret()
    with ctx.db.tx() as c:
        n = c.execute("SELECT count(*) AS n FROM platform.webhook_endpoints WHERE tenant_id = %s AND active",
                      (t["id"],)).fetchone()["n"]
        if n >= ctx.settings.plans[t["plan"]]["webhooks"]:
            raise ApiError(403, "Đã đạt giới hạn webhook của gói")
        row = c.execute("""INSERT INTO platform.webhook_endpoints (tenant_id, url, events, secret_enc, created_by)
                           VALUES (%s,%s,%s,%s,%s) RETURNING id, url, events, active, created_at""",
                        (t["id"], url, events, encrypt(ctx.settings.secret_key, secret), dev_id)).fetchone()
    return {**row, "secret": secret}           # secret chỉ hiện MỘT lần


def list_endpoints(ctx: Ctx, t: dict) -> list[dict]:
    with ctx.db.tx() as c:
        return c.execute("SELECT id, url, events, active, created_at FROM platform.webhook_endpoints "
                         "WHERE tenant_id = %s ORDER BY created_at", (t["id"],)).fetchall()


def delete_endpoint(ctx: Ctx, t: dict, endpoint_id: str) -> None:
    with ctx.db.tx() as c:
        r = c.execute("DELETE FROM platform.webhook_endpoints WHERE id = %s AND tenant_id = %s", (endpoint_id, t["id"]))
        if r.rowcount == 0:
            raise ApiError(404, "Không có webhook này")


def _enqueue(c, tenant_id, endpoint_id, event_id: str, event_type: str, payload: dict) -> None:
    c.execute("""INSERT INTO platform.webhook_deliveries (tenant_id, endpoint_id, event_id, event_type, payload)
                 VALUES (%s,%s,%s,%s,%s) ON CONFLICT (endpoint_id, event_id) DO NOTHING""",
              (tenant_id, endpoint_id, event_id, event_type, json.dumps(payload)))


def send_ping(ctx: Ctx, t: dict, endpoint_id: str) -> dict:
    with ctx.db.tx() as c:
        if not c.execute("SELECT 1 FROM platform.webhook_endpoints WHERE id = %s AND tenant_id = %s",
                         (endpoint_id, t["id"])).fetchone():
            raise ApiError(404, "Không có webhook này")
        eid = f"ping_{int(time.time() * 1000)}"
        _enqueue(c, t["id"], endpoint_id, eid, "ping",
                 {"id": eid, "type": "ping", "tenant_id": str(t["id"]), "created_at": _now().isoformat(), "data": {}})
    return {"queued": eid}


def ingest_event(ctx: Ctx, body: dict) -> dict:
    """Nhận payload của Hasura Event Trigger và tạo lượt giao cho các endpoint của ĐÚNG tenant."""
    try:
        table = body["table"]["name"]
        op = body["event"]["op"]
        data = body["event"]["data"]
        event_id = body["id"]
    except (KeyError, TypeError):
        raise ApiError(400, "Payload sự kiện không đúng định dạng Hasura")
    if table not in ENTITIES or op not in OPS:
        return {"queued": 0, "ignored": True}
    new, old = data.get("new"), data.get("old")
    row = new or old or {}
    tenant_id = row.get("tenant_id")
    if not tenant_id:
        raise ApiError(400, "Sự kiện thiếu tenant_id")
    event_type = f"{ENTITIES[table]}.{OPS[op]}"
    envelope = {"id": event_id, "type": event_type, "tenant_id": tenant_id, "created_at": body.get("created_at") or _now().isoformat(),
                "data": {"object": new if new is not None else old, "previous": old if op == "UPDATE" else None}}
    queued = 0
    with ctx.db.tx() as c:
        if not c.execute("SELECT 1 FROM platform.tenants WHERE id = %s AND status = 'active'", (tenant_id,)).fetchone():
            return {"queued": 0, "ignored": True}
        eps = c.execute("""SELECT id FROM platform.webhook_endpoints
                           WHERE tenant_id = %s AND active AND (%s = ANY(events) OR '*' = ANY(events))""",
                        (tenant_id, event_type)).fetchall()
        for ep in eps:
            _enqueue(c, tenant_id, ep["id"], event_id, event_type, envelope)
            queued += 1
    return {"queued": queued}


def list_deliveries(ctx: Ctx, t: dict, limit: int = 50) -> list[dict]:
    with ctx.db.tx() as c:
        return c.execute("""SELECT id, endpoint_id, event_id, event_type, status, attempts, next_attempt_at,
                                   last_status, last_error, created_at, delivered_at
                            FROM platform.webhook_deliveries WHERE tenant_id = %s
                            ORDER BY created_at DESC LIMIT %s""", (t["id"], min(limit, 200))).fetchall()


def redeliver(ctx: Ctx, t: dict, delivery_id: str) -> None:
    with ctx.db.tx() as c:
        r = c.execute("""UPDATE platform.webhook_deliveries SET status = 'pending', attempts = 0, next_attempt_at = now(),
                         last_error = NULL WHERE id = %s AND tenant_id = %s AND status IN ('dead','failed','delivered')""",
                      (delivery_id, t["id"]))
        if r.rowcount == 0:
            raise ApiError(404, "Không có lượt giao này")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def deliver_due(ctx: Ctx, limit: int = 20, now: datetime | None = None) -> dict:
    """Giao các lượt đến hạn. FOR UPDATE SKIP LOCKED => nhiều worker chạy song song không giao trùng."""
    now = now or _now()
    stats = {"delivered": 0, "retry": 0, "dead": 0}
    with ctx.db.tx() as c:
        rows = c.execute("""SELECT d.id, d.attempts, d.event_type, d.payload, e.url, e.secret_enc, e.active
                            FROM platform.webhook_deliveries d JOIN platform.webhook_endpoints e ON e.id = d.endpoint_id
                            WHERE d.status IN ('pending','failed') AND d.next_attempt_at <= %s
                            ORDER BY d.next_attempt_at LIMIT %s FOR UPDATE OF d SKIP LOCKED""", (now, limit)).fetchall()
        for d in rows:
            attempts = d["attempts"] + 1
            status_code, error = None, None
            if not d["active"]:
                c.execute("UPDATE platform.webhook_deliveries SET status='dead', last_error=%s WHERE id=%s",
                          ("endpoint đã tắt", d["id"]))
                stats["dead"] += 1
                continue
            try:
                ctx.check_url(d["url"])
                body = json.dumps(d["payload"], separators=(",", ":"), ensure_ascii=False)
                ts = int(now.timestamp())
                r = ctx.http.post(d["url"], content=body.encode(), timeout=10, follow_redirects=False, headers={
                    "Content-Type": "application/json", "User-Agent": "PeopleOS-Webhooks/1",
                    "X-PeopleOS-Event": d["event_type"], "X-PeopleOS-Delivery": str(d["id"]),
                    "X-PeopleOS-Signature": sign_payload(decrypt(ctx.settings.secret_key, d["secret_enc"]), ts, body)})
                status_code = r.status_code
                if 200 <= r.status_code < 300:
                    c.execute("""UPDATE platform.webhook_deliveries SET status='delivered', attempts=%s, last_status=%s,
                                 last_error=NULL, delivered_at=%s WHERE id=%s""", (attempts, status_code, now, d["id"]))
                    stats["delivered"] += 1
                    continue
                error = f"HTTP {r.status_code}"
            except (httpx.HTTPError, ApiError) as e:
                error = (e.detail if isinstance(e, ApiError) else str(e))[:300]
            if attempts >= MAX_ATTEMPTS:
                c.execute("""UPDATE platform.webhook_deliveries SET status='dead', attempts=%s, last_status=%s, last_error=%s
                             WHERE id=%s""", (attempts, status_code, error, d["id"]))
                stats["dead"] += 1
            else:
                nxt = now + timedelta(seconds=BACKOFF[attempts - 1])
                c.execute("""UPDATE platform.webhook_deliveries SET status='failed', attempts=%s, last_status=%s,
                             last_error=%s, next_attempt_at=%s WHERE id=%s""", (attempts, status_code, error, nxt, d["id"]))
                stats["retry"] += 1
    return stats
