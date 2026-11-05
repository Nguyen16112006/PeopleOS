# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

import json
import os
import socket
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import httpx
import jwt
import psycopg
import pytest
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from platform_api import api as api_mod
from platform_api.adapters import Apisix, Hasura, Keycloak
from platform_api.config import Settings
from platform_api.context import Ctx
from platform_api.db import ApiError, Database
from platform_api.security import assert_public_url

ADMIN_DSN = os.environ.get("TEST_PG_ADMIN_DSN", "postgresql://peopleos:x@localhost:5432/postgres")
TEST_DB = "platform_test"
MIGRATIONS = Path(os.environ.get(
    "MIGRATIONS_DIR", Path(__file__).resolve().parents[4] / "core/data/structured/hasura/migrations/default"))
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ISSUER = "http://kc/realms/peopleos-platform"


def _dsn(db):
    return ADMIN_DSN.rsplit("/", 1)[0] + "/" + db


@pytest.fixture(scope="session")
def database():
    with psycopg.connect(ADMIN_DSN, autocommit=True) as c:
        c.execute(f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)")
        c.execute(f"CREATE DATABASE {TEST_DB}")
    env = {**os.environ, "PGPASSWORD": "x"}
    for d in sorted(p for p in MIGRATIONS.iterdir() if p.is_dir()):
        r = subprocess.run(["psql", _dsn(TEST_DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", str(d / "up.sql")],
                           capture_output=True, text=True, env=env)
        assert r.returncode == 0, f"migration {d.name} lỗi: {r.stderr[-400:]}"
    return _dsn(TEST_DB)


class Recorder:
    """Ghi lại các lời gọi tới Keycloak/APISIX/Hasura giả; có thể ép lỗi theo đường dẫn."""

    def __init__(self):
        self.calls, self.fail = [], set()

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content and request.headers.get("content-type", "").startswith("application/json") else None
        self.calls.append((request.method, request.url.path, body))
        if any(f in request.url.path or (request.method + " " + request.url.path).startswith(f) for f in self.fail):
            return httpx.Response(500, text="boom")
        if request.method == "DELETE" and request.url.path.startswith("/admin/realms"):
            return httpx.Response(204)                  # Keycloak thật trả 204 No Content
        if request.url.path.endswith("/openid-connect/token"):
            return httpx.Response(200, json={"access_token": "T"})
        if request.method == "GET" and request.url.path.endswith("/clients"):
            return httpx.Response(200, json=[{"id": "cid"}])
        if request.method == "POST" and request.url.path.endswith("/users"):
            return httpx.Response(201, headers={"Location": "http://kc/admin/realms/peopleos/users/new-user-id"})
        if request.method == "POST" and request.url.path.endswith("/clients"):
            return httpx.Response(201)
        if request.url.path.startswith("/apisix/admin"):
            return httpx.Response(200 if request.method != "DELETE" else 200, json={})
        return httpx.Response(200, json={})

    def calls_to(self, method, contains):
        return [c for c in self.calls if c[0] == method and contains in c[1]]


@pytest.fixture()
def rec():
    return Recorder()


def make_verify():
    pub = KEY.public_key()

    def verify(token):
        try:
            return jwt.decode(token, pub, algorithms=["RS256"], issuer=ISSUER, options={"verify_aud": False})
        except Exception:
            raise ApiError(401, "Token không hợp lệ hoặc đã hết hạn")
    return verify


@pytest.fixture()
def ctx(database, rec):
    with psycopg.connect(database, autocommit=True) as c:      # sạch dữ liệu control-plane giữa các test
        c.execute("TRUNCATE platform.usage_daily, platform.webhook_deliveries, platform.webhook_endpoints, platform.custom_field_defs, "
                  "platform.schema_versions, platform.api_keys, platform.provisioning_steps")
        for r in c.execute("SELECT short_id FROM platform.tenants WHERE short_id <> 'peopleos0'").fetchall():
            c.execute(f'DROP SCHEMA IF EXISTS "ext_{r[0]}" CASCADE')
        # audit_logs bất biến + FK tới tenants: chỉ test mới dọn bằng quyền superuser (bỏ qua trigger/FK)
        c.execute("SET session_replication_role = replica")
        c.execute("DELETE FROM public.audit_logs WHERE tenant_id <> '00000000-0000-0000-0000-000000000001'")
        c.execute("DELETE FROM public.app_settings WHERE tenant_id <> '00000000-0000-0000-0000-000000000001'")
        c.execute("DELETE FROM public.employees WHERE tenant_id <> '00000000-0000-0000-0000-000000000001'")
        c.execute("DELETE FROM platform.tenants WHERE short_id <> 'peopleos0'")
        c.execute("DELETE FROM platform.developers WHERE id <> '00000000-0000-0000-0000-000000000000'")
        c.execute("SET session_replication_role = DEFAULT")
    st = Settings(database_url=database, secret_key=Fernet.generate_key().decode(), event_secret="evsecret",
                  keycloak_admin_password="x", apisix_admin_key="k", hasura_admin_secret="h",
                  allow_private_webhooks=True, allow_http_webhooks=True)
    mk = lambda: httpx.Client(transport=httpx.MockTransport(rec.handler))
    c = Ctx(settings=st, db=Database(database),
            keycloak=Keycloak("http://kc", "admin", "x", mk()), apisix=Apisix("http://apisix", "k", mk()),
            hasura=Hasura("http://hasura", "h", "default", mk()), http=httpx.Client(),
            check_url=lambda u: assert_public_url(u, True, True), verify_jwt=make_verify())
    yield c
    c.db.close()


@pytest.fixture()
def client(ctx):
    return TestClient(api_mod.create_app(ctx))


def token(sub="d0000000-0000-0000-0000-000000000001", email="a@dev.test", exp_delta=600, key=KEY, issuer=ISSUER):
    import time
    return jwt.encode({"sub": sub, "email": email, "iss": issuer, "exp": int(time.time()) + exp_delta},
                      key, algorithm="RS256", headers={"kid": "k1"})


DEV_A = ("d0000000-0000-0000-0000-00000000000a", "a@dev.test")
DEV_B = ("d0000000-0000-0000-0000-00000000000b", "b@dev.test")


def auth(dev=DEV_A):
    return {"Authorization": "Bearer " + token(*dev)}


@pytest.fixture()
def make_project(client):
    def _make(dev=DEV_A, name="Acme HR"):
        r = client.post("/v1/projects", json={"name": name}, headers=auth(dev))
        assert r.status_code == 201, r.text
        return r.json()
    return _make


class Receiver:
    """Server nhận webhook cục bộ: ghi request, trả mã theo hàng đợi `codes` (mặc định 200)."""

    def __init__(self):
        self.requests, self.codes = [], []
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a): pass

            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                outer.requests.append({"path": self.path, "headers": dict(self.headers), "body": self.rfile.read(n).decode()})
                code = outer.codes.pop(0) if outer.codes else 200
                self.send_response(code); self.send_header("Content-Length", "0"); self.end_headers()

        s = socket.socket(); s.bind(("127.0.0.1", 0)); self.port = s.getsockname()[1]; s.close()
        self.server = HTTPServer(("127.0.0.1", self.port), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def url(self):
        return f"http://127.0.0.1:{self.port}/hook"


@pytest.fixture()
def receiver():
    r = Receiver()
    yield r
    r.server.shutdown()
