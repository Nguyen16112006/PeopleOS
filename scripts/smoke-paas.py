#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""
Kiểm thử ĐẦU-CUỐI cho HR-PaaS khi cả stack đang chạy (Keycloak + APISIX + Hasura + Postgres + platform-api + worker).
Đây là bài kiểm tra mà môi trường phát triển không thể chạy; chạy nó TRƯỚC mỗi buổi demo.

  docker compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.paas.yml up -d --build
  python scripts/keycloak-paas-bootstrap.py
  # (đặt ALLOW_PRIVATE_WEBHOOKS=true và ALLOW_HTTP_WEBHOOKS=true trong .env rồi `up -d` lại để thử webhook)
  python scripts/smoke-paas.py

Nó tạo developer + 2 project tạm, rồi kiểm tra: cấp phát project, API key (read/write), chạy GraphQL qua gateway, CÔ LẬP giữa 2 tenant
(kể cả khi client giả mạo header x-hasura-*), bảng tùy chỉnh, trường tùy chỉnh, webhook có chữ ký (đi qua Hasura Event Trigger),
đo đếm sử dụng, thu hồi key. Dọn dẹp mọi thứ đã tạo. Thoát mã 1 nếu có bước hỏng.
Biến môi trường: KEYCLOAK_URL (http://localhost:8080), GATEWAY_URL (http://localhost:9080), KEYCLOAK_ADMIN/_PASSWORD,
SMOKE_WEBHOOK_HOST (host.docker.internal), SKIP_WEBHOOK=1 để bỏ qua bước webhook.
"""
import hashlib
import hmac
import json
import os
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

KC = os.environ.get("KEYCLOAK_URL", "http://localhost:8080").rstrip("/")
GW = os.environ.get("GATEWAY_URL", "http://localhost:9080").rstrip("/")
KC_ADMIN = os.environ.get("KEYCLOAK_ADMIN", "admin")
KC_PW = os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "admin_change_me")
HOOK_HOST = os.environ.get("SMOKE_WEBHOOK_HOST", "host.docker.internal")
REALM = "peopleos-platform"
RUN = secrets.token_hex(3)


def call(method, url, body=None, headers=None, form=None, timeout=30):
    data, h = None, dict(headers or {})
    if form is not None:
        data = urllib.parse.urlencode(form).encode(); h["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(); code = r.status; loc = r.headers.get("Location")
    except urllib.error.HTTPError as e:
        raw = e.read(); code = e.code; loc = e.headers.get("Location")
    except (urllib.error.URLError, OSError) as e:
        return 0, {"error": str(e)}, None
    try:
        return code, json.loads(raw) if raw else None, loc
    except ValueError:
        return code, raw.decode("utf-8", "replace"), loc


def verify_signature(secret: str, header: str, body: str, tolerance: int = 300, now: float | None = None) -> bool:
    """Kiểm tra X-PeopleOS-Signature = t=<epoch>,v1=<hex HMAC-SHA256(secret, '<t>.<body>')>."""
    try:
        parts = dict(kv.split("=", 1) for kv in header.split(","))
        t = int(parts["t"])
    except (ValueError, KeyError):
        return False
    if abs((now or time.time()) - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))


def gql(key, query, variables=None, extra_headers=None):
    h = {"X-API-Key": key, **(extra_headers or {})}
    code, data, _ = call("POST", f"{GW}/v1/data", {"query": query, "variables": variables or {}}, h)
    return code, data


class Smoke:
    def __init__(self):
        self.results, self.cleanup = [], []

    def step(self, name, fn):
        try:
            fn(); self.results.append((name, True, ""))
            print(f"  [OK]   {name}")
        except AssertionError as e:
            self.results.append((name, False, str(e))); print(f"  [HỎNG] {name}\n         -> {e}")
        except Exception as e:  # noqa: BLE001 - báo mọi lỗi bất ngờ thay vì dừng cả bài
            self.results.append((name, False, repr(e))); print(f"  [LỖI]  {name}\n         -> {e!r}")

    def ok(self) -> bool:
        return all(r[1] for r in self.results)


def wait_until(pred, timeout=30, every=1.0):
    end = time.time() + timeout
    while time.time() < end:
        v = pred()
        if v:
            return v
        time.sleep(every)
    return None


def main() -> int:
    S = Smoke(); st: dict = {}
    print(f"Smoke test HR-PaaS (run {RUN}) - Keycloak {KC} · Gateway {GW}\n")

    def services_up():
        for name, url in (("Keycloak realm developer", f"{KC}/realms/{REALM}/.well-known/openid-configuration"),
                          ("platform-api qua gateway", f"{GW}/platform/healthz")):
            ok = wait_until(lambda: call("GET", url)[0] == 200, timeout=90, every=3)
            assert ok, f"{name} chưa sẵn sàng ({url}). Đã chạy bootstrap Keycloak và apisix-bootstrap chưa?"

    def developer_token():
        code, tok, _ = call("POST", f"{KC}/realms/master/protocol/openid-connect/token",
                            form={"grant_type": "password", "client_id": "admin-cli", "username": KC_ADMIN, "password": KC_PW})
        assert code == 200, f"không lấy được token admin Keycloak ({code})"
        adm = {"Authorization": "Bearer " + tok["access_token"]}
        st["adm"] = adm
        call("POST", f"{KC}/admin/realms/{REALM}/clients", {"clientId": "paas-smoke", "publicClient": True,
             "directAccessGrantsEnabled": True, "standardFlowEnabled": False}, adm)       # 409 nếu đã có: bỏ qua
        email, pw = f"smoke-{RUN}@peopleos.test", secrets.token_urlsafe(16)
        code, _, loc = call("POST", f"{KC}/admin/realms/{REALM}/users", {"username": email, "email": email, "enabled": True,
             "emailVerified": True, "credentials": [{"type": "password", "value": pw, "temporary": False}]}, adm)
        assert code == 201, f"tạo developer thử thất bại ({code})"
        st["uid"] = loc.rsplit("/", 1)[-1]
        S.cleanup.append(lambda: call("DELETE", f"{KC}/admin/realms/{REALM}/users/{st['uid']}", headers=adm))
        code, t, _ = call("POST", f"{KC}/realms/{REALM}/protocol/openid-connect/token",
                          form={"grant_type": "password", "client_id": "paas-smoke", "username": email, "password": pw})
        assert code == 200 and t.get("access_token"), f"đăng nhập developer thất bại ({code}): {t}"
        st["h"] = {"Authorization": "Bearer " + t["access_token"]}

    def api(method, path, body=None):
        return call(method, f"{GW}/platform{path}", body, st["h"])

    def make_projects():
        for tag in ("A", "B"):
            code, p, _ = api("POST", "/v1/projects", {"name": f"Smoke {tag} {RUN}"})
            assert code == 201 and p["status"] == "active", f"tạo project {tag}: {code} {p}"
            st[tag] = p
            S.cleanup.append(lambda pid=p["id"]: api("DELETE", f"/v1/projects/{pid}"))

    def make_keys():
        for name, proj, scope in (("Aw", "A", "write"), ("Ar", "A", "read"), ("Br", "B", "read")):
            code, k, _ = api("POST", f"/v1/projects/{st[proj]['id']}/api-keys", {"name": name, "scope": scope})
            assert code == 201 and k["key"].startswith("pos_"), f"tạo key {name}: {code} {k}"
            st[name] = k

    def write_and_read_own_data():
        q = "mutation($o: employees_insert_input!){ insert_employees_one(object:$o){ id employee_code } }"
        o = {"employee_code": f"SMK{RUN}", "full_name": "Smoke Test", "email": f"s{RUN}@x.test", "department": "IT", "job_title": "Dev", "hire_date": "2024-01-01"}
        ok = wait_until(lambda: gql(st["Aw"]["key"], q, {"o": o})[0] == 200, timeout=20, every=2)   # chờ Consumer lan truyền qua etcd
        assert ok, "API key write không gọi được /v1/data (gateway/Hasura/permission?)"
        code, d = gql(st["Aw"]["key"], q, {"o": {**o, "employee_code": f"SMK{RUN}b", "email": f"b{RUN}@x.test"}})
        assert code == 200 and d and d.get("data") and d["data"]["insert_employees_one"]["id"], f"insert employee lỗi: {d}"
        rd = '{ employees(where:{employee_code:{_like:"SMK%s%%"}}){ id } }' % RUN
        code, d = gql(st["Ar"]["key"], rd)
        assert code == 200 and len(d["data"]["employees"]) == 2, f"key read của chính tenant phải thấy 2 nhân viên: {d}"

    def isolation():
        rd = '{ employees(where:{employee_code:{_like:"SMK%s%%"}}){ id } }' % RUN
        code, d = gql(st["Br"]["key"], rd)
        assert code == 200 and d["data"]["employees"] == [], f"RÒ RỈ: tenant B thấy dữ liệu của tenant A: {d}"
        spoof = {"x-hasura-role": "admin", "x-hasura-tenant-id": st["A"]["id"], "x-hasura-admin-secret": "x", "X-Hasura-User-Id": "evil"}
        code, d = gql(st["Br"]["key"], rd, extra_headers=spoof)
        assert code in (200, 400, 401, 403) and not (d and d.get("data") and d["data"].get("employees")), f"RÒ RỈ: giả mạo header x-hasura-* có tác dụng: {d}"

    def read_key_cannot_write():
        q = 'mutation { insert_employees_one(object:{employee_code:"HACK%s", full_name:"x", email:"h%s@x.test", department:"IT", job_title:"x", hire_date:"2024-01-01"}){ id } }' % (RUN, RUN)
        code, d = gql(st["Ar"]["key"], q)
        assert d and d.get("errors"), f"key read KHÔNG được phép ghi nhưng đã ghi được: {d}"

    def custom_table():
        short = st["A"]["short_id"]
        code, r, _ = api("POST", f"/v1/projects/{st['A']['id']}/schema/tables",
                         {"table": "bonus", "columns": [{"name": "amount", "type": "numeric", "nullable": False}, {"name": "note", "type": "text"}]})
        assert code == 201, f"tạo bảng tùy chỉnh: {code} {r}"
        f = f"ext_{short}_bonus"
        code, d = gql(st["Aw"]["key"], "mutation { insert_%s_one(object:{amount: 100, note:\"x\"}){ id amount } }" % f)
        assert d and d.get("data") and d["data"][f"insert_{f}_one"]["id"], f"ghi vào bảng tùy chỉnh lỗi: {d}"
        code, d = gql(st["Ar"]["key"], "{ %s { amount } }" % f)
        assert d["data"][f] == [{"amount": 100}], f"đọc lại bảng tùy chỉnh: {d}"
        code, d = gql(st["Br"]["key"], "{ %s { amount } }" % f)
        assert not d.get("data") or d["data"].get(f) == [], f"RÒ RỈ dữ liệu bảng tùy chỉnh sang tenant B: {d}"

    def custom_field():
        pid = st["A"]["id"]
        code, r, _ = api("POST", f"/v1/projects/{pid}/custom-fields", {"key": "level", "type": "enum", "options": ["junior", "senior"], "required": False})
        assert code == 201, f"thêm trường tùy chỉnh: {code} {r}"
        q = "mutation($o: employees_insert_input!){ insert_employees_one(object:$o){ id } }"
        base = {"full_name": "C", "department": "IT", "job_title": "Dev", "hire_date": "2024-01-01"}
        code, d = gql(st["Aw"]["key"], q, {"o": {**base, "employee_code": f"CF{RUN}", "email": f"cf{RUN}@x.test", "custom": {"level": "senior"}}})
        assert d and d.get("data") and d["data"]["insert_employees_one"]["id"], f"giá trị hợp lệ bị từ chối: {d}"
        code, d = gql(st["Aw"]["key"], q, {"o": {**base, "employee_code": f"CG{RUN}", "email": f"cg{RUN}@x.test", "custom": {"level": "intern"}}})
        assert d and d.get("errors"), f"giá trị sai kiểu/enum KHÔNG bị chặn: {d}"

    def webhook():
        if os.environ.get("SKIP_WEBHOOK") == "1":
            return
        got = []

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                got.append((dict(self.headers), self.rfile.read(n).decode()))
                self.send_response(200); self.send_header("Content-Length", "0"); self.end_headers()
        srv = HTTPServer(("0.0.0.0", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        S.cleanup.append(srv.shutdown)
        url = f"http://{HOOK_HOST}:{srv.server_port}/hook"
        code, w, _ = api("POST", f"/v1/projects/{st['A']['id']}/webhooks", {"url": url, "events": ["employee.created"]})
        assert code == 201, (f"đăng ký webhook: {code} {w}. Cần ALLOW_PRIVATE_WEBHOOKS=true và ALLOW_HTTP_WEBHOOKS=true trong .env "
                             "(hoặc SKIP_WEBHOOK=1 để bỏ qua bước này)")
        q = "mutation($o: employees_insert_input!){ insert_employees_one(object:$o){ id } }"
        gql(st["Aw"]["key"], q, {"o": {"employee_code": f"WH{RUN}", "full_name": "W", "email": f"w{RUN}@x.test", "department": "IT", "job_title": "Dev", "hire_date": "2024-01-01"}})
        assert wait_until(lambda: [g for g in got if '"employee.created"' in g[1] and f"WH{RUN}" in g[1]], timeout=60, every=2), \
            "không nhận được webhook trong 60s (Hasura Event Trigger -> platform-api -> worker?)"
        hdr, body = next(g for g in got if f"WH{RUN}" in g[1])
        assert verify_signature(w["secret"], hdr.get("X-PeopleOS-Signature", ""), body), "chữ ký webhook không hợp lệ"
        assert json.loads(body)["tenant_id"] == st["A"]["id"], "payload webhook mang sai tenant"

    def usage():
        def seen():
            code, u, _ = api("GET", f"/v1/projects/{st['A']['id']}/usage")
            return code == 200 and u["today"]["requests"] > 0
        assert wait_until(seen, timeout=45, every=3), "chưa thấy số liệu sử dụng sau 45s (http-logger -> /internal/usage?)"

    def revoke():
        code, _, _ = api("DELETE", f"/v1/projects/{st['A']['id']}/api-keys/{st['Aw']['id']}")
        assert code == 204, f"thu hồi key: {code}"
        assert wait_until(lambda: gql(st["Aw"]["key"], "{ employees(limit:1){ id } }")[0] in (401, 403), timeout=20, every=2), \
            "key đã thu hồi vẫn gọi được /v1/data"

    for name, fn in (("Các dịch vụ sẵn sàng", services_up), ("Tạo developer và đăng nhập", developer_token),
                     ("Cấp phát 2 project", make_projects), ("Cấp API key read/write", make_keys),
                     ("Ghi/đọc dữ liệu của chính tenant qua gateway", write_and_read_own_data),
                     ("CÔ LẬP giữa 2 tenant (kể cả giả mạo header)", isolation), ("Key read không ghi được", read_key_cannot_write),
                     ("Bảng tùy chỉnh (schema service)", custom_table), ("Trường tùy chỉnh được kiểm kiểu", custom_field),
                     ("Webhook ký HMAC qua Event Trigger", webhook), ("Đo đếm sử dụng", usage), ("Thu hồi API key", revoke)):
        S.step(name, fn)
        if name in ("Các dịch vụ sẵn sàng", "Tạo developer và đăng nhập", "Cấp phát 2 project", "Cấp API key read/write") and not S.results[-1][1]:
            print("\nBước nền tảng hỏng - dừng các bước phụ thuộc."); break

    print("\nDọn dẹp...")
    for fn in reversed(S.cleanup):
        try: fn()
        except Exception: pass                                                          # noqa: E722,S110 - dọn dẹp best-effort
    bad = [r for r in S.results if not r[1]]
    print(f"\nKết quả: {len(S.results) - len(bad)}/{len(S.results)} bước đạt." + ("" if not bad else "  HỎNG: " + "; ".join(b[0] for b in bad)))
    return 0 if S.ok() else 1


if __name__ == "__main__":
    sys.exit(main())
