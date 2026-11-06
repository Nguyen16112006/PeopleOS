# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

from platform_api.db import ApiError
from platform_api.security import JwtVerifier

from .conftest import DEV_A, DEV_B, ISSUER, KEY, auth, token


def q(ctx, sql, *p):
    with ctx.db.tx() as c:
        return c.execute(sql, p).fetchall()


# ---------------- Xác thực ----------------
def test_requires_valid_token(client):
    assert client.get("/v1/projects").status_code == 401
    assert client.get("/v1/projects", headers={"Authorization": "Bearer abc"}).status_code == 401
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    forged = {"Authorization": "Bearer " + token(key=other)}
    assert client.get("/v1/projects", headers=forged).status_code == 401
    expired = {"Authorization": "Bearer " + token(exp_delta=-10)}
    assert client.get("/v1/projects", headers=expired).status_code == 401
    wrong_iss = {"Authorization": "Bearer " + token(issuer="http://evil/realms/x")}
    assert client.get("/v1/projects", headers=wrong_iss).status_code == 401


def test_real_jwks_verifier():
    jwk = json.loads(RSAAlgorithm.to_jwk(KEY.public_key())); jwk.update(kid="k1", alg="RS256", use="sig")

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def do_GET(self):
            b = json.dumps({"keys": [jwk]}).encode()
            self.send_response(200); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    srv = HTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    v = JwtVerifier(f"http://127.0.0.1:{srv.server_port}/certs", ISSUER)
    assert v(token())["sub"]
    for bad in (token(exp_delta=-5), token(issuer="http://x"), token(key=rsa.generate_private_key(public_exponent=65537, key_size=2048))):
        with pytest.raises(ApiError) as e:
            v(bad)
        assert e.value.status == 401
    srv.shutdown()


# ---------------- Project ----------------
def test_create_project_provisions_everything(client, ctx, make_project, rec):
    p = make_project()
    assert p["status"] == "active" and p["plan"] == "free" and p["short_id"].startswith("p")
    short = p["short_id"]
    assert q(ctx, "SELECT 1 FROM pg_namespace WHERE nspname = %s", f"ext_{short}")
    assert q(ctx, "SELECT 1 FROM pg_roles WHERE rolname = %s", f"ext_{short}_owner")
    settings = q(ctx, "SELECT key FROM public.app_settings WHERE tenant_id = %s", p["id"])
    assert [r["key"] for r in settings] == ["advance_level2_threshold_vnd"]       # cấu hình mặc định được thừa hưởng
    steps = {r["step"]: r["status"] for r in q(ctx, "SELECT step, status FROM platform.provisioning_steps WHERE tenant_id = %s", p["id"])}
    assert steps == {"db_schema": "done", "defaults": "done", "keycloak_client": "done"}
    kc = [c for c in rec.calls_to("POST", "/clients") if c[2]]
    assert kc[0][2]["clientId"] == f"app-{short}" and kc[0][2]["protocolMappers"][0]["config"]["user.attribute"] == "tenant_id"


def test_project_isolation_between_developers(client, make_project):
    a = make_project(DEV_A, "Alpha")
    b = make_project(DEV_B, "Beta")
    assert {x["id"] for x in client.get("/v1/projects", headers=auth(DEV_A)).json()} == {a["id"]}
    assert client.get(f"/v1/projects/{a['id']}", headers=auth(DEV_B)).status_code == 404
    assert client.delete(f"/v1/projects/{a['id']}", headers=auth(DEV_B)).status_code == 404
    assert client.post(f"/v1/projects/{a['id']}/api-keys", json={"name": "x", "scope": "read"}, headers=auth(DEV_B)).status_code == 404
    assert client.get(f"/v1/projects/{b['id']}", headers=auth(DEV_B)).status_code == 200
    assert client.get("/v1/projects/not-a-uuid", headers=auth(DEV_A)).status_code == 404


def test_project_limit_and_duplicate_name(client, make_project):
    for i in range(3):
        make_project(DEV_A, f"P{i}x")
    assert client.post("/v1/projects", json={"name": "P4xx"}, headers=auth(DEV_A)).status_code == 403
    assert client.post("/v1/projects", json={"name": "P0x"}, headers=auth(DEV_B)).status_code == 201
    assert client.post("/v1/projects", json={"name": "p0x"}, headers=auth(DEV_B)).status_code == 409     # trùng tên (không phân biệt hoa thường)
    assert client.post("/v1/projects", json={"name": "ab"}, headers=auth(DEV_B)).status_code == 422


def test_provisioning_failure_compensates(client, ctx, rec):
    rec.fail.add("POST /admin/realms/peopleos/clients")
    r = client.post("/v1/projects", json={"name": "Will Fail"}, headers=auth(DEV_A))
    assert r.status_code == 502 and "keycloak_client" in r.json()["detail"]
    t = q(ctx, "SELECT id, short_id, status FROM platform.tenants WHERE name = 'Will Fail'")[0]
    assert t["status"] == "failed"
    assert not q(ctx, "SELECT 1 FROM pg_namespace WHERE nspname = %s", f"ext_{t['short_id']}")      # schema đã bị bù trừ
    assert not q(ctx, "SELECT 1 FROM pg_roles WHERE rolname = %s", f"ext_{t['short_id']}_owner")
    assert not q(ctx, "SELECT 1 FROM public.app_settings WHERE tenant_id = %s", t["id"])
    st = {r["step"]: r["status"] for r in q(ctx, "SELECT step, status FROM platform.provisioning_steps WHERE tenant_id = %s", t["id"])}
    assert st == {"db_schema": "compensated", "defaults": "compensated", "keycloak_client": "failed"}
    rec.fail.clear()
    assert client.post("/v1/projects", json={"name": "Will Fail"}, headers=auth(DEV_A)).status_code == 201   # tên được giải phóng


def test_delete_project_revokes_everything(client, ctx, make_project, rec, receiver):
    p = make_project()
    pid = p["id"]
    client.post(f"/v1/projects/{pid}/api-keys", json={"name": "k", "scope": "write"}, headers=auth())
    client.post(f"/v1/projects/{pid}/schema/tables", json={"table": "bonus", "columns": [{"name": "amount", "type": "numeric"}]}, headers=auth())
    client.post(f"/v1/projects/{pid}/webhooks", json={"url": receiver.url, "events": ["*"]}, headers=auth())
    rec.calls.clear()
    assert client.delete(f"/v1/projects/{pid}", headers=auth()).status_code == 204
    assert rec.calls_to("DELETE", "/consumers/")
    untrack = [c for c in rec.calls_to("POST", "/v1/metadata")][0][2]["args"][0]
    assert untrack["type"] == "pg_untrack_table" and untrack["args"]["table"]["name"] == "bonus"
    assert rec.calls_to("DELETE", "/clients/")
    assert not q(ctx, "SELECT 1 FROM pg_namespace WHERE nspname = %s", f"ext_{p['short_id']}")
    assert q(ctx, "SELECT status FROM platform.tenants WHERE id = %s", pid)[0]["status"] == "deleted"
    assert not q(ctx, "SELECT 1 FROM platform.api_keys WHERE tenant_id = %s AND revoked_at IS NULL", pid)
    assert not q(ctx, "SELECT 1 FROM platform.webhook_endpoints WHERE tenant_id = %s AND active", pid)
    assert client.get(f"/v1/projects/{pid}", headers=auth()).status_code == 404
    assert client.post("/v1/projects", json={"name": "Acme HR"}, headers=auth()).status_code == 201         # tên dùng lại được


# ---------------- API key ----------------
def test_api_key_lifecycle(client, ctx, make_project, rec):
    p = make_project()
    r = client.post(f"/v1/projects/{p['id']}/api-keys", json={"name": "server", "scope": "read", "env": "live"}, headers=auth())
    assert r.status_code == 201
    body = r.json(); key = body["key"]
    assert key.startswith("pos_live_") and body["prefix"] in key
    row = q(ctx, "SELECT * FROM platform.api_keys WHERE id = %s", body["id"])[0]
    assert key not in json.dumps({k: str(v) for k, v in row.items()})                    # không lưu khóa rõ
    import hashlib
    assert row["key_hash"] == hashlib.sha256(key.encode()).hexdigest()
    put = rec.calls_to("PUT", "/consumers")[0][2]
    assert put["plugins"]["key-auth"]["key"] == key and put["group_id"] == "plan-free"
    assert put["labels"] == {"tenant_id": p["id"], "short_id": p["short_id"], "scope": "read", "env": "live"}
    assert "key" not in client.get(f"/v1/projects/{p['id']}/api-keys", headers=auth()).json()[0]
    assert client.delete(f"/v1/projects/{p['id']}/api-keys/{body['id']}", headers=auth()).status_code == 204
    assert rec.calls_to("DELETE", f"/consumers/{row['consumer']}")
    assert client.delete(f"/v1/projects/{p['id']}/api-keys/{body['id']}", headers=auth()).status_code == 404   # đã thu hồi
    assert q(ctx, "SELECT revoked_at FROM platform.api_keys WHERE id = %s", body["id"])[0]["revoked_at"] is not None


def test_api_key_rolls_back_if_gateway_fails(client, ctx, make_project, rec):
    p = make_project()
    rec.fail.add("PUT /apisix/admin/consumers")
    assert client.post(f"/v1/projects/{p['id']}/api-keys", json={"name": "k", "scope": "write"}, headers=auth()).status_code == 502
    assert not q(ctx, "SELECT 1 FROM platform.api_keys WHERE tenant_id = %s", p["id"])               # không để lại key "ma"


def test_api_key_validation_and_limit(client, make_project):
    p = make_project()
    url = f"/v1/projects/{p['id']}/api-keys"
    assert client.post(url, json={"name": "k", "scope": "admin"}, headers=auth()).status_code == 422
    for i in range(5):
        assert client.post(url, json={"name": f"k{i}", "scope": "read"}, headers=auth()).status_code == 201
    assert client.post(url, json={"name": "k6", "scope": "read"}, headers=auth()).status_code == 403
