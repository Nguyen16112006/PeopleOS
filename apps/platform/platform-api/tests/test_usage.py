# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

from datetime import datetime, timedelta, timezone

from .conftest import DEV_A, DEV_B, auth

SECRET = {"x-platform-secret": "evsecret"}


def key(client, p, dev=DEV_A, scope="read"):
    r = client.post(f"/v1/projects/{p['id']}/api-keys", json={"name": "k", "scope": scope}, headers=auth(dev))
    assert r.status_code == 201
    return f"prj_{p['short_id']}_{r.json()['prefix']}", r.json()["id"]


def iso(delta_days=0):
    return (datetime.now(timezone.utc) - timedelta(days=delta_days)).isoformat()


def q(ctx, sql, *p):
    with ctx.db.tx() as c:
        return c.execute(sql, p).fetchall()


def test_ingest_requires_secret(client):
    assert client.post("/internal/usage", json=[]).status_code == 401
    assert client.post("/internal/usage", json=[], headers={"x-platform-secret": "sai"}).status_code == 401
    assert client.post("/internal/usage", json=[], headers={"Authorization": "Bearer sai"}).status_code == 401
    assert client.post("/internal/usage", json=[], headers=SECRET).status_code == 200
    assert client.post("/internal/usage", json=[], headers={"Authorization": "Bearer evsecret"}).status_code == 200   # APISIX http-logger gửi kiểu này


def test_ingest_aggregates_per_tenant_and_day(client, ctx, make_project):
    a, b = make_project(DEV_A, "Alpha"), make_project(DEV_B, "Beta")
    ca, _ = key(client, a); cb, _ = key(client, b, DEV_B)
    batch = [
        {"consumer": ca, "status": "200", "bytes": "1000", "time": iso()},
        {"consumer": ca, "status": "404", "bytes": "100", "time": iso()},
        {"consumer": ca, "status": "502", "bytes": "50", "time": iso()},
        {"consumer": ca, "status": "200", "bytes": "10", "time": iso(1)},
        {"consumer": cb, "status": "200", "bytes": "7", "time": iso()},
        {"consumer": "prj_unknown_deadbeef", "status": "200", "bytes": "1", "time": iso()},   # key lạ
        {"consumer": "", "status": "200", "bytes": "1", "time": iso()},                        # route không dùng API key
        {"status": "200"},
    ]
    r = client.post("/internal/usage", json=batch, headers=SECRET)
    assert r.json() == {"accepted": 5, "ignored": 3}
    client.post("/internal/usage", json=[{"consumer": ca, "status": "200", "bytes": "5", "time": iso()}], headers=SECRET)   # cộng dồn
    ua = {str(x["day"]): x for x in q(ctx, "SELECT * FROM platform.usage_daily WHERE tenant_id = %s", a["id"])}
    today = datetime.now(timezone.utc).date().isoformat()
    t = ua[today]
    assert (t["requests"], t["errors_4xx"], t["errors_5xx"], t["bytes_out"]) == (4, 1, 1, 1155)
    assert len(ua) == 2
    assert q(ctx, "SELECT requests FROM platform.usage_daily WHERE tenant_id = %s", b["id"])[0]["requests"] == 1     # không lẫn tenant


def test_revoked_key_still_counted_and_single_object_accepted(client, ctx, make_project):
    a = make_project()
    ca, kid = key(client, a)
    client.delete(f"/v1/projects/{a['id']}/api-keys/{kid}", headers=auth())
    assert client.post("/internal/usage", json={"consumer": ca, "status": "200", "bytes": "3", "time": iso()}, headers=SECRET).json()["accepted"] == 1


def test_usage_report_and_access_control(client, make_project):
    a = make_project(DEV_A, "Alpha"); make_project(DEV_B, "Beta")
    ca, _ = key(client, a)
    client.post("/internal/usage", json=[{"consumer": ca, "status": "200", "bytes": "1", "time": iso()}] * 3, headers=SECRET)
    rep = client.get(f"/v1/projects/{a['id']}/usage", headers=auth()).json()
    assert rep["plan"] == "free" and rep["daily_quota"] == 10_000
    assert rep["today"] == {"requests": 3, "remaining": 9_997} and rep["days"][0]["requests"] == 3
    assert client.get(f"/v1/projects/{a['id']}/usage", headers=auth(DEV_B)).status_code == 404
    assert client.get(f"/v1/projects/{a['id']}/usage?days=0", headers=auth()).status_code == 422
    assert client.get(f"/v1/projects/{a['id']}/usage?days=91", headers=auth()).status_code == 422
    assert client.get(f"/v1/projects/{a['id']}/usage?days=1", headers=auth()).status_code == 200
