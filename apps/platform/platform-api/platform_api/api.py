# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

import hmac
import os
from typing import Annotated

import httpx
from fastapi import Depends, FastAPI, Header, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import provisioning, schema_service, usage, webhooks
from .adapters import AdapterError, Apisix, Hasura, Keycloak
from .config import Settings
from .context import Ctx
from .db import ApiError, Database
from .schema_service import CustomField, TableSpec
from .security import JwtVerifier, assert_public_url, hash_key, new_api_key


class ProjectIn(BaseModel):
    name: str
    redirect_uris: list[str] = []


class KeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    scope: str = Field(pattern="^(read|write)$")
    env: str = Field(default="sandbox", pattern="^(sandbox|live)$")


class WebhookIn(BaseModel):
    url: str
    events: list[str]


class UserIn(BaseModel):
    username: str = Field(pattern=r"^[a-z][a-z0-9._-]{2,30}$")
    email: str
    password: str = Field(min_length=10)


def build_ctx(settings: Settings) -> Ctx:
    return Ctx(
        settings=settings, db=Database(settings.database_url),
        keycloak=Keycloak(settings.keycloak_url, settings.keycloak_admin, settings.keycloak_admin_password),
        apisix=Apisix(settings.apisix_admin_url, settings.apisix_admin_key),
        hasura=Hasura(settings.hasura_url, settings.hasura_admin_secret, settings.hasura_source),
        http=httpx.Client(),
        check_url=lambda u: assert_public_url(u, settings.allow_private_webhooks, settings.allow_http_webhooks),
        verify_jwt=JwtVerifier(settings.platform_jwks_url, settings.platform_issuer))


def create_app(ctx: Ctx | None = None) -> FastAPI:
    app = FastAPI(title="PeopleOS Platform API", version="1.0",
                  description="Control plane của HR-PaaS: project, API key, schema, custom field, webhook.")
    holder: dict = {"ctx": ctx}

    def get_ctx() -> Ctx:
        if holder["ctx"] is None:
            holder["ctx"] = build_ctx(Settings.from_env())
        return holder["ctx"]

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, e: ApiError):
        return JSONResponse({"detail": e.detail}, status_code=e.status)

    @app.exception_handler(AdapterError)
    async def _adapter_error(_: Request, e: AdapterError):
        return JSONResponse({"detail": f"Dịch vụ phụ thuộc lỗi: {e}"}, status_code=502)

    def developer(c: Annotated[Ctx, Depends(get_ctx)], authorization: Annotated[str | None, Header()] = None) -> dict:
        if not authorization or not authorization.lower().startswith("bearer "):
            raise ApiError(401, "Thiếu token")
        claims = c.verify_jwt(authorization[7:])
        email = claims.get("email") or f"{claims['sub']}@unknown.local"
        with c.db.tx() as cn:
            return cn.execute("""INSERT INTO platform.developers (id, email, display_name) VALUES (%s,%s,%s)
                                 ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email RETURNING *""",
                              (claims["sub"], email, claims.get("name"))).fetchone()

    Dev = Annotated[dict, Depends(developer)]
    C = Annotated[Ctx, Depends(get_ctx)]

    def owned(c: Ctx, dev: dict, project_id: str, allow_inactive: bool = False) -> dict:
        try:
            with c.db.tx() as cn:
                t = cn.execute("SELECT * FROM platform.tenants WHERE id = %s AND owner_dev_id = %s",
                               (project_id, dev["id"])).fetchone()
        except Exception:
            t = None
        if not t or t["status"] == "deleted":
            raise ApiError(404, "Không tìm thấy project")     # không phân biệt "không tồn tại" và "của người khác"
        if t["status"] != "active" and not allow_inactive:
            raise ApiError(409, f"Project đang ở trạng thái {t['status']}")
        return t

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    # ---- Project -----------------------------------------------------------------------
    @app.post("/v1/projects", status_code=201)
    def create_project(body: ProjectIn, dev: Dev, c: C):
        return provisioning.create_project(c, str(dev["id"]), body.name, body.redirect_uris)

    @app.get("/v1/projects")
    def list_projects(dev: Dev, c: C):
        with c.db.tx() as cn:
            return cn.execute("""SELECT id, short_id, name, plan, tier, status, created_at FROM platform.tenants
                                 WHERE owner_dev_id = %s AND status <> 'deleted' ORDER BY created_at""", (dev["id"],)).fetchall()

    @app.get("/v1/projects/{pid}")
    def get_project(pid: str, dev: Dev, c: C):
        return owned(c, dev, pid, allow_inactive=True)

    @app.delete("/v1/projects/{pid}", status_code=204)
    def delete_project(pid: str, dev: Dev, c: C):
        provisioning.delete_project(c, owned(c, dev, pid, allow_inactive=True))

    # ---- API key -------------------------------------------------------------------------
    @app.post("/v1/projects/{pid}/api-keys", status_code=201)
    def create_key(pid: str, body: KeyIn, dev: Dev, c: C):
        t = owned(c, dev, pid)
        key, prefix = new_api_key(body.env)
        consumer = f"prj_{t['short_id']}_{prefix}"
        with c.db.tx() as cn:
            n = cn.execute("SELECT count(*) AS n FROM platform.api_keys WHERE tenant_id = %s AND revoked_at IS NULL",
                           (t["id"],)).fetchone()["n"]
            if n >= c.settings.plans[t["plan"]]["api_keys"]:
                raise ApiError(403, "Đã đạt giới hạn API key của gói")
            row = cn.execute("""INSERT INTO platform.api_keys (tenant_id, name, prefix, key_hash, scope, env, consumer, created_by)
                                VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, name, prefix, scope, env, created_at""",
                             (t["id"], body.name, prefix, hash_key(key), body.scope, body.env, consumer, dev["id"])).fetchone()
            # đăng ký trên gateway TRONG transaction: lỗi => rollback, không để lại key "ma"
            c.apisix.put_consumer(consumer, key, {"tenant_id": str(t["id"]), "short_id": t["short_id"],
                                                  "scope": body.scope, "env": body.env}, f"plan-{t['plan']}")
        return {**row, "key": key, "note": "Hãy lưu khóa ngay - hệ thống sẽ không hiển thị lại."}

    @app.get("/v1/projects/{pid}/api-keys")
    def list_keys(pid: str, dev: Dev, c: C):
        t = owned(c, dev, pid)
        with c.db.tx() as cn:
            return cn.execute("""SELECT id, name, prefix, scope, env, created_at, revoked_at FROM platform.api_keys
                                 WHERE tenant_id = %s ORDER BY created_at""", (t["id"],)).fetchall()

    @app.delete("/v1/projects/{pid}/api-keys/{kid}", status_code=204)
    def revoke_key(pid: str, kid: str, dev: Dev, c: C):
        t = owned(c, dev, pid)
        with c.db.tx() as cn:
            k = cn.execute("SELECT consumer FROM platform.api_keys WHERE id = %s AND tenant_id = %s AND revoked_at IS NULL",
                           (kid, t["id"])).fetchone()
            if not k:
                raise ApiError(404, "Không có API key này")
            c.apisix.delete_consumer(k["consumer"])
            cn.execute("UPDATE platform.api_keys SET revoked_at = now() WHERE id = %s", (kid,))

    # ---- Schema & custom field --------------------------------------------------------------
    @app.post("/v1/projects/{pid}/schema/tables", status_code=201)
    def add_table(pid: str, spec: TableSpec, dev: Dev, c: C):
        return schema_service.create_table(c, owned(c, dev, pid), str(dev["id"]), spec)

    @app.get("/v1/projects/{pid}/schema/tables")
    def get_tables(pid: str, dev: Dev, c: C):
        return schema_service.list_tables(c, owned(c, dev, pid))

    @app.delete("/v1/projects/{pid}/schema/tables/{table}")
    def del_table(pid: str, table: str, dev: Dev, c: C):
        return schema_service.drop_table(c, owned(c, dev, pid), str(dev["id"]), table)

    @app.get("/v1/projects/{pid}/schema/versions")
    def versions(pid: str, dev: Dev, c: C):
        t = owned(c, dev, pid)
        with c.db.tx() as cn:
            return cn.execute("""SELECT version, table_name, action, spec, ddl, created_at FROM platform.schema_versions
                                 WHERE tenant_id = %s ORDER BY version""", (t["id"],)).fetchall()

    @app.post("/v1/projects/{pid}/custom-fields", status_code=201)
    def add_cf(pid: str, body: CustomField, dev: Dev, c: C):
        return schema_service.add_custom_field(c, owned(c, dev, pid), body)

    @app.get("/v1/projects/{pid}/custom-fields")
    def get_cf(pid: str, dev: Dev, c: C):
        return schema_service.list_custom_fields(c, owned(c, dev, pid))

    @app.delete("/v1/projects/{pid}/custom-fields/{entity}/{key}", status_code=204)
    def del_cf(pid: str, entity: str, key: str, dev: Dev, c: C):
        schema_service.delete_custom_field(c, owned(c, dev, pid), entity, key)

    # ---- End-user của ứng dụng developer -----------------------------------------------------
    @app.post("/v1/projects/{pid}/users", status_code=201)
    def add_user(pid: str, body: UserIn, dev: Dev, c: C):
        t = owned(c, dev, pid)
        uid = c.keycloak.create_user(c.settings.end_user_realm, f"{t['short_id']}.{body.username}", body.email,
                                     body.password, str(t["id"]))
        return {"id": uid, "username": f"{t['short_id']}.{body.username}"}

    # ---- Webhook -------------------------------------------------------------------------------
    @app.post("/v1/projects/{pid}/webhooks", status_code=201)
    def add_hook(pid: str, body: WebhookIn, dev: Dev, c: C):
        return webhooks.create_endpoint(c, owned(c, dev, pid), str(dev["id"]), body.url, body.events)

    @app.get("/v1/projects/{pid}/webhooks")
    def get_hooks(pid: str, dev: Dev, c: C):
        return webhooks.list_endpoints(c, owned(c, dev, pid))

    @app.delete("/v1/projects/{pid}/webhooks/{wid}", status_code=204)
    def del_hook(pid: str, wid: str, dev: Dev, c: C):
        webhooks.delete_endpoint(c, owned(c, dev, pid), wid)

    @app.post("/v1/projects/{pid}/webhooks/{wid}/test", status_code=202)
    def ping_hook(pid: str, wid: str, dev: Dev, c: C):
        return webhooks.send_ping(c, owned(c, dev, pid), wid)

    @app.get("/v1/projects/{pid}/webhook-deliveries")
    def deliveries(pid: str, dev: Dev, c: C):
        return webhooks.list_deliveries(c, owned(c, dev, pid))

    @app.post("/v1/projects/{pid}/webhook-deliveries/{did}/replay", status_code=202)
    def replay(pid: str, did: str, dev: Dev, c: C):
        webhooks.redeliver(c, owned(c, dev, pid), did)
        return {"status": "pending"}

    # ---- Sử dụng -----------------------------------------------------------------------------------
    @app.get("/v1/projects/{pid}/usage")
    def get_usage(pid: str, dev: Dev, c: C, days: int = 14):
        if not 1 <= days <= 90:
            raise ApiError(422, "days phải từ 1 đến 90")
        return usage.report(c, owned(c, dev, pid, allow_inactive=True), days)

    # ---- Nội bộ: Hasura Event Trigger -------------------------------------------------------------
    @app.post("/internal/hasura-events")
    def hasura_events(body: dict, c: C, x_platform_secret: Annotated[str | None, Header()] = None):
        if not x_platform_secret or not hmac.compare_digest(x_platform_secret, c.settings.event_secret):
            raise ApiError(401, "Sai bí mật")
        return webhooks.ingest_event(c, body)

    @app.post("/internal/usage")
    async def usage_ingest(request: Request, c: C, x_platform_secret: Annotated[str | None, Header()] = None,
                           authorization: Annotated[str | None, Header()] = None):
        given = x_platform_secret or (authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None)
        if not given or not hmac.compare_digest(given, c.settings.event_secret):
            raise ApiError(401, "Sai bí mật")
        try:
            body = await request.json()          # danh sách log (batch) hoặc một log
        except ValueError:
            raise ApiError(400, "Body không phải JSON")
        if not isinstance(body, (list, dict)):
            raise ApiError(400, "Body phải là danh sách hoặc đối tượng log")
        return await run_in_threadpool(usage.ingest, c, body)

    return app


app = create_app() if os.environ.get("DATABASE_URL") else None
