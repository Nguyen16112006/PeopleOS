#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""
Cấu hình Keycloak cho PaaS (idempotent - chạy lại nhiều lần an toàn). Chỉ dùng thư viện chuẩn.

Realm end-user (mặc định 'peopleos'):
  1. Khai báo thuộc tính 'tenant_id' trong User Profile, CHỈ admin xem/sửa (người dùng không tự đổi được tenant).
  2. Thêm mapper 'tenant_id' (user attribute -> claim tenant_id) vào các client chỉ định.
  3. Backfill: người dùng chưa có tenant_id được gán tenant mặc định (tenant first-party).
Realm developer ('peopleos-platform'): tạo từ core/identity/realm-peopleos-platform.json nếu chưa có.

Biến môi trường: KEYCLOAK_URL (http://localhost:8080), KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_PASSWORD,
  END_USER_REALM (peopleos), DEFAULT_TENANT_ID (00000000-0000-0000-0000-000000000001),
  MAPPER_CLIENTS (people-workspace, phân tách bằng dấu phẩy), PLATFORM_REALM_FILE.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("KEYCLOAK_URL", "http://localhost:8080").rstrip("/")
ADMIN = os.environ.get("KEYCLOAK_ADMIN", "admin")
ADMIN_PW = os.environ.get("KEYCLOAK_ADMIN_PASSWORD", "admin_change_me")
REALM = os.environ.get("END_USER_REALM", "peopleos")
DEFAULT_TENANT = os.environ.get("DEFAULT_TENANT_ID", "00000000-0000-0000-0000-000000000001")
CLIENTS = [c.strip() for c in os.environ.get("MAPPER_CLIENTS", "people-workspace").split(",") if c.strip()]
PLATFORM_REALM_FILE = os.environ.get("PLATFORM_REALM_FILE", "core/identity/realm-peopleos-platform.json")

actions = []


def call(method, path, token=None, body=None, form=None, ok=(200, 201, 204)):
    url = BASE + path
    data, headers = None, {}
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        if e.code in ok:
            return e.code, None
        if e.code == 404:
            return 404, None
        raise SystemExit(f"{method} {path} -> HTTP {e.code}: {e.read().decode()[:300]}")


def admin_token():
    _, tok = call("POST", "/realms/master/protocol/openid-connect/token",
                  form={"grant_type": "password", "client_id": "admin-cli", "username": ADMIN, "password": ADMIN_PW})
    return tok["access_token"]


def ensure_user_profile(token):
    _, prof = call("GET", f"/admin/realms/{REALM}/users/profile", token)
    if any(a.get("name") == "tenant_id" for a in prof.get("attributes", [])):
        return
    prof.setdefault("attributes", []).append({
        "name": "tenant_id", "displayName": "Tenant", "multivalued": False,
        "validations": {}, "annotations": {},
        "permissions": {"view": ["admin"], "edit": ["admin"]},   # người dùng không xem/sửa được
    })
    call("PUT", f"/admin/realms/{REALM}/users/profile", token, body=prof)
    actions.append("user-profile: thêm thuộc tính tenant_id (admin-only)")


def ensure_mapper(token, client_id):
    _, found = call("GET", f"/admin/realms/{REALM}/clients?clientId={urllib.parse.quote(client_id)}", token)
    if not found:
        print(f"CẢNH BÁO: không thấy client '{client_id}' trong realm {REALM}", file=sys.stderr)
        return
    uuid = found[0]["id"]
    _, mappers = call("GET", f"/admin/realms/{REALM}/clients/{uuid}/protocol-mappers/models", token)
    if any(m.get("name") == "tenant_id" for m in (mappers or [])):
        return
    call("POST", f"/admin/realms/{REALM}/clients/{uuid}/protocol-mappers/models", token, body={
        "name": "tenant_id", "protocol": "openid-connect", "protocolMapper": "oidc-usermodel-attribute-mapper",
        "config": {"user.attribute": "tenant_id", "claim.name": "tenant_id", "jsonType.label": "String",
                   "access.token.claim": "true", "id.token.claim": "true", "userinfo.token.claim": "true"}})
    actions.append(f"client {client_id}: thêm mapper tenant_id")


def backfill_users(token):
    first, updated = 0, 0
    while True:
        _, users = call("GET", f"/admin/realms/{REALM}/users?first={first}&max=100", token)
        if not users:
            break
        for u in users:
            attrs = u.get("attributes") or {}
            if attrs.get("tenant_id"):
                continue
            attrs["tenant_id"] = [DEFAULT_TENANT]
            u["attributes"] = attrs          # PUT thay toàn bộ representation -> gửi lại đầy đủ để không mất trường
            call("PUT", f"/admin/realms/{REALM}/users/{u['id']}", token, body=u)
            updated += 1
        first += 100
    if updated:
        actions.append(f"backfill: gán tenant mặc định cho {updated} người dùng")


def ensure_platform_realm(token):
    with open(PLATFORM_REALM_FILE, encoding="utf-8") as fh:
        rep = json.load(fh)
    status, _ = call("GET", f"/admin/realms/{rep['realm']}", token)
    if status == 404:
        call("POST", "/admin/realms", token, body=rep)
        actions.append(f"tạo realm {rep['realm']}")


def main():
    token = admin_token()
    ensure_user_profile(token)
    for c in CLIENTS:
        ensure_mapper(token, c)
    backfill_users(token)
    ensure_platform_realm(token)
    print("\n".join("ĐÃ LÀM: " + a for a in actions) if actions else "Không có thay đổi (đã cấu hình đủ).")


if __name__ == "__main__":
    main()
