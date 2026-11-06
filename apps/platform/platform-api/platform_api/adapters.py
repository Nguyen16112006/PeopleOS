# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

"""Adapter ra các hệ thống ngoài. Mỗi adapter nhận httpx.Client (có thể truyền transport giả khi test)."""
import httpx


class AdapterError(Exception):
    pass


def _check(r: httpx.Response, what: str, ok=(200, 201, 204)):
    if r.status_code not in ok:
        raise AdapterError(f"{what}: HTTP {r.status_code} {r.text[:200]}")
    return r


class Keycloak:
    def __init__(self, base: str, admin: str, password: str, http: httpx.Client | None = None):
        self.base, self.admin, self.password = base.rstrip("/"), admin, password
        self.http = http or httpx.Client(timeout=15)

    def _headers(self) -> dict:
        r = self.http.post(f"{self.base}/realms/master/protocol/openid-connect/token",
                           data={"grant_type": "password", "client_id": "admin-cli",
                                 "username": self.admin, "password": self.password})
        _check(r, "Keycloak token")
        return {"Authorization": "Bearer " + r.json()["access_token"]}

    def create_client(self, realm: str, client_id: str, redirect_uris: list[str]) -> None:
        """Client OIDC công khai (PKCE) cho ứng dụng của tenant; token mang claim tenant_id từ thuộc tính user."""
        body = {
            "clientId": client_id, "enabled": True, "publicClient": True, "protocol": "openid-connect",
            "standardFlowEnabled": True, "directAccessGrantsEnabled": False,
            "redirectUris": redirect_uris, "webOrigins": ["+"] if redirect_uris else [],
            "attributes": {"pkce.code.challenge.method": "S256"},
            "protocolMappers": [{
                "name": "tenant_id", "protocol": "openid-connect", "protocolMapper": "oidc-usermodel-attribute-mapper",
                "config": {"user.attribute": "tenant_id", "claim.name": "tenant_id", "jsonType.label": "String",
                           "access.token.claim": "true", "id.token.claim": "true", "userinfo.token.claim": "true"}}],
        }
        _check(self.http.post(f"{self.base}/admin/realms/{realm}/clients", json=body, headers=self._headers()),
               "Keycloak create client", ok=(201, 409))      # 409 = đã tồn tại (chạy lại an toàn)

    def delete_client(self, realm: str, client_id: str) -> None:
        h = self._headers()
        r = _check(self.http.get(f"{self.base}/admin/realms/{realm}/clients", params={"clientId": client_id}, headers=h),
                   "Keycloak find client")
        for c in r.json():
            _check(self.http.delete(f"{self.base}/admin/realms/{realm}/clients/{c['id']}", headers=h),
                   "Keycloak delete client", ok=(200, 204, 404))

    def create_user(self, realm: str, username: str, email: str, password: str, tenant_id: str) -> str:
        h = self._headers()
        body = {"username": username, "email": email, "enabled": True, "emailVerified": True,
                "attributes": {"tenant_id": [tenant_id]},
                "credentials": [{"type": "password", "value": password, "temporary": True}]}
        r = _check(self.http.post(f"{self.base}/admin/realms/{realm}/users", json=body, headers=h),
                   "Keycloak create user", ok=(201,))
        return r.headers.get("Location", "").rsplit("/", 1)[-1]


class Apisix:
    def __init__(self, base: str, admin_key: str, http: httpx.Client | None = None):
        self.base = base.rstrip("/") + "/apisix/admin"
        self.h = {"X-API-KEY": admin_key}
        self.http = http or httpx.Client(timeout=15)

    def put_consumer(self, username: str, key: str, labels: dict, group_id: str) -> None:
        body = {"username": username, "group_id": group_id, "labels": labels,
                "plugins": {"key-auth": {"key": key}}}
        _check(self.http.put(f"{self.base}/consumers", json=body, headers=self.h), "APISIX put consumer")

    def delete_consumer(self, username: str) -> None:
        _check(self.http.delete(f"{self.base}/consumers/{username}", headers=self.h), "APISIX delete consumer",
               ok=(200, 204, 404))

    def ensure_consumer_group(self, group_id: str, plugins: dict) -> None:
        _check(self.http.put(f"{self.base}/consumer_groups/{group_id}", json={"plugins": plugins}, headers=self.h),
               "APISIX consumer group")


class Hasura:
    def __init__(self, base: str, admin_secret: str, source: str, http: httpx.Client | None = None):
        self.base, self.source = base.rstrip("/"), source
        self.h = {"x-hasura-admin-secret": admin_secret}
        self.http = http or httpx.Client(timeout=30)

    def bulk(self, args: list[dict]) -> None:
        r = self.http.post(f"{self.base}/v1/metadata", json={"type": "bulk", "args": args}, headers=self.h)
        if r.status_code != 200:
            raise AdapterError(f"Hasura metadata: HTTP {r.status_code} {r.text[:300]}")
