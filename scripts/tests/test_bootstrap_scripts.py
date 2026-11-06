# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

"""Kiểm thử luồng gọi của scripts/keycloak-paas-bootstrap.py và scripts/apisix-paas-bootstrap.py bằng server giả
(KHÔNG chứng minh tương thích với Keycloak/APISIX thật - chỉ kiểm tra logic, tính idempotent và nội dung gửi đi).
Chạy từ gốc repo: python -m pytest scripts/tests -q"""
import json
import os
import re
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def serve(handler_cls):
    srv = HTTPServer(("127.0.0.1", 0), handler_cls)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def run(script, env):
    r = subprocess.run([sys.executable, str(ROOT / "scripts" / script)], cwd=ROOT, capture_output=True, text=True,
                       env={**os.environ, **env})
    return r.returncode, r.stdout + r.stderr


# ---------------- Keycloak giả ----------------
def make_keycloak():
    S = {"profile": {"attributes": [{"name": "username"}, {"name": "email"}]}, "mappers": [], "realms": {"peopleos": 1},
         "users": [{"id": f"u{i}", "username": f"user{i}", "attributes": ({"tenant_id": ["x"]} if i == 0 else {})} for i in range(5)]}

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _send(self, code, obj=None):
            b = json.dumps(obj).encode() if obj is not None else b""
            self.send_response(code); self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

        def _body(self):
            n = int(self.headers.get("Content-Length") or 0)
            return self.rfile.read(n) if n else b""

        def do_POST(self):
            raw = self._body()
            if "openid-connect/token" in self.path:
                return self._send(200, {"access_token": "T"})
            if self.headers.get("Authorization") != "Bearer T":
                return self._send(401)
            if self.path.endswith("/protocol-mappers/models"):
                S["mappers"].append(json.loads(raw)); return self._send(201)
            if self.path == "/admin/realms":
                r = json.loads(raw); S["realms"][r["realm"]] = r; return self._send(201)
            self._send(404)

        def do_PUT(self):
            raw = self._body()
            if self.path.endswith("/users/profile"):
                S["profile"] = json.loads(raw); return self._send(204)
            m = re.search(r"/users/(u\d+)$", self.path)
            if m:
                u = json.loads(raw); S["users"] = [u if x["id"] == m.group(1) else x for x in S["users"]]; return self._send(204)
            self._send(404)

        def do_GET(self):
            if self.path.endswith("/users/profile"):
                return self._send(200, S["profile"])
            if "/clients?clientId=people-workspace" in self.path:
                return self._send(200, [{"id": "cid", "clientId": "people-workspace"}])
            if self.path.endswith("/protocol-mappers/models"):
                return self._send(200, S["mappers"])
            m = re.search(r"/users\?first=(\d+)&max=(\d+)", self.path)
            if m:
                f, n = int(m.group(1)), int(m.group(2)); return self._send(200, S["users"][f:f + n])
            m = re.match(r"/admin/realms/([^/]+)$", self.path)
            if m:
                return self._send(200, {}) if m.group(1) in S["realms"] else self._send(404)
            self._send(404)
    return serve(H), S


def test_keycloak_bootstrap_configures_and_is_idempotent():
    srv, S = make_keycloak()
    env = {"KEYCLOAK_URL": f"http://127.0.0.1:{srv.server_port}"}
    code, out = run("keycloak-paas-bootstrap.py", env)
    assert code == 0, out
    attr = next(a for a in S["profile"]["attributes"] if a["name"] == "tenant_id")
    assert attr["permissions"] == {"view": ["admin"], "edit": ["admin"]}                     # người dùng không tự đổi được tenant
    assert len(S["mappers"]) == 1 and S["mappers"][0]["config"]["claim.name"] == "tenant_id"
    assert all(u["attributes"].get("tenant_id") for u in S["users"])
    assert S["users"][0]["attributes"]["tenant_id"] == ["x"]                                 # giá trị cũ không bị ghi đè
    assert "peopleos-platform" in S["realms"]
    snapshot = json.dumps(S, sort_keys=True)
    code, out = run("keycloak-paas-bootstrap.py", env)
    assert code == 0 and "Không có thay đổi" in out and json.dumps(S, sort_keys=True) == snapshot
    srv.shutdown()


# ---------------- APISIX giả ----------------
def make_apisix():
    LOG = []

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def do_PUT(self):
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(n))
            if self.headers.get("X-API-KEY") != "testkey":
                self.send_response(401); self.end_headers(); return
            LOG.append((self.path.split("/apisix/admin/")[1], body))
            self.send_response(200); self.send_header("Content-Length", "2"); self.end_headers(); self.wfile.write(b"{}")
    return serve(H), LOG


def test_apisix_bootstrap_loads_old_and_paas_resources():
    srv, LOG = make_apisix()
    env = {"APISIX_ADMIN_URL": f"http://127.0.0.1:{srv.server_port}", "APISIX_ADMIN_KEY": "testkey",
           "EVENT_DISPATCHER_SECRET": "evsecret", "CLICKHOUSE_ENDPOINT": "http://ch:8123"}
    code, out = run("apisix-paas-bootstrap.py", env)
    assert code == 0, out
    d = dict(LOG)
    assert "routes/graphql" in d and "routes/block-internal" in d and "plugin_configs/secured" in d     # route cũ được chuyển
    assert not any("id" in v for k, v in d.items() if k.startswith("routes/"))
    data = d["routes/paas-data-api"]["plugins"]
    assert data["key-auth"]["header"] == "X-API-Key" and "tenant_api_write" in data["serverless-post-function"]["functions"][0]
    free = d["consumer_groups/plan-free"]["plugins"]
    assert free["limit-count"]["count"] == 10_000 and free["limit-count"]["policy"] == "redis"
    g = d["global_rules/observability"]["plugins"]
    assert g["http-logger"]["auth_header"] == "Bearer evsecret" and g["http-logger"]["uri"].endswith("/internal/usage")
    assert "clickhouse-logger" in g and "prometheus" in g
    srv.shutdown()


def test_apisix_bootstrap_rejects_bad_admin_key():
    srv, _ = make_apisix()
    code, out = run("apisix-paas-bootstrap.py", {"APISIX_ADMIN_URL": f"http://127.0.0.1:{srv.server_port}", "APISIX_ADMIN_KEY": "sai"})
    assert code != 0 and "401" in out
    srv.shutdown()


def test_plan_quota_matches_between_gateway_and_control_plane():
    """Hạn mức ngày ở APISIX (bootstrap) phải khớp với platform_api/config.py (portal hiển thị)."""
    sys.path.insert(0, str(ROOT / "apps/platform/platform-api"))
    from platform_api.config import DEFAULT_PLANS
    src = (ROOT / "scripts/apisix-paas-bootstrap.py").read_text(encoding="utf-8")
    daily = {m.group(1): int(m.group(2).replace("_", "")) for m in re.finditer(r'"plan-(\w+)": \(\d+, \d+, ([\d_]+)\)', src)}
    assert daily == {k: v["daily_requests"] for k, v in DEFAULT_PLANS.items()}
