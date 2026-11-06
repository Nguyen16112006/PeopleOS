# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

"""Đo đếm sử dụng: nhận log theo lô từ APISIX (plugin http-logger) và gộp theo tenant/ngày."""
from collections import defaultdict
from datetime import date, datetime, timezone

from .context import Ctx


def _day(value) -> date:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc).date()
    except (ValueError, TypeError):
        return datetime.now(timezone.utc).date()


def _int(value) -> int:
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return 0


def ingest(ctx: Ctx, body) -> dict:
    """body: danh sách (hoặc một) log {consumer, status, bytes, time}. Chỉ tính request có API key hợp lệ."""
    entries = body if isinstance(body, list) else [body]
    entries = [e for e in entries if isinstance(e, dict)]
    consumers = {str(e.get("consumer")) for e in entries if e.get("consumer")}
    owner: dict[str, str] = {}
    if consumers:
        with ctx.db.tx() as c:       # tính cả key đã thu hồi (log về muộn)
            for r in c.execute("SELECT consumer, tenant_id FROM platform.api_keys WHERE consumer = ANY(%s)", (list(consumers),)).fetchall():
                owner[r["consumer"]] = r["tenant_id"]
    agg: dict[tuple, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    accepted = 0
    for e in entries:
        tenant = owner.get(str(e.get("consumer") or ""))
        if not tenant:
            continue
        status = _int(e.get("status"))
        a = agg[(tenant, _day(e.get("time")))]
        a[0] += 1
        a[1] += 1 if 400 <= status < 500 else 0
        a[2] += 1 if status >= 500 else 0
        a[3] += _int(e.get("bytes"))
        accepted += 1
    if agg:
        with ctx.db.tx() as c:
            for (tenant, day), (req, e4, e5, b) in agg.items():
                c.execute("""INSERT INTO platform.usage_daily (tenant_id, day, requests, errors_4xx, errors_5xx, bytes_out)
                             VALUES (%s,%s,%s,%s,%s,%s)
                             ON CONFLICT (tenant_id, day) DO UPDATE SET requests = usage_daily.requests + EXCLUDED.requests,
                               errors_4xx = usage_daily.errors_4xx + EXCLUDED.errors_4xx,
                               errors_5xx = usage_daily.errors_5xx + EXCLUDED.errors_5xx,
                               bytes_out = usage_daily.bytes_out + EXCLUDED.bytes_out""", (tenant, day, req, e4, e5, b))
    return {"accepted": accepted, "ignored": len(entries) - accepted}


def report(ctx: Ctx, t: dict, days: int) -> dict:
    today = datetime.now(timezone.utc).date()
    with ctx.db.tx() as c:
        rows = c.execute("""SELECT day, requests, errors_4xx, errors_5xx, bytes_out FROM platform.usage_daily
                            WHERE tenant_id = %s AND day > %s - %s::int ORDER BY day DESC""", (t["id"], today, days)).fetchall()
    quota = ctx.settings.plans[t["plan"]]["daily_requests"]
    used = next((r["requests"] for r in rows if r["day"] == today), 0)
    return {"plan": t["plan"], "daily_quota": quota, "today": {"requests": used, "remaining": max(quota - used, 0)},
            "days": [{**r, "day": r["day"].isoformat()} for r in rows]}
