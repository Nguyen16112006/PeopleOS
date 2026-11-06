# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

"""Cấp phát / thu hồi một project (tenant) theo kiểu saga: mỗi bước có hành động bù trừ."""
import secrets
import string

import psycopg
from psycopg import sql

from .adapters import AdapterError
from .config import FIRST_PARTY_TENANT
from .context import Ctx
from .db import ApiError

_ALPHABET = string.ascii_lowercase + string.digits


def new_short_id() -> str:
    return "p" + "".join(secrets.choice(_ALPHABET) for _ in range(7))


def owner_role(short: str) -> str:
    return f"ext_{short}_owner"


def ext_schema(short: str) -> str:
    return f"ext_{short}"


def _record(ctx: Ctx, tenant_id, step: str, status: str, error: str | None = None) -> None:
    with ctx.db.tx() as c:
        c.execute("""INSERT INTO platform.provisioning_steps (tenant_id, step, status, error)
                     VALUES (%s,%s,%s,%s)
                     ON CONFLICT (tenant_id, step) DO UPDATE SET status = EXCLUDED.status,
                       error = EXCLUDED.error, updated_at = now()""", (tenant_id, step, status, error))


# ---- Các bước -------------------------------------------------------------------
def _schema_do(ctx: Ctx, t: dict, **_):
    role, schema = sql.Identifier(owner_role(t["short_id"])), sql.Identifier(ext_schema(t["short_id"]))
    with ctx.db.tx() as c:
        if not c.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (owner_role(t["short_id"]),)).fetchone():
            c.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(role))
        c.execute(sql.SQL("GRANT {} TO CURRENT_USER").format(role))
        c.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {} AUTHORIZATION {}").format(schema, role))
        c.execute(sql.SQL("GRANT USAGE ON SCHEMA platform TO {}").format(role))        # platform.current_tenant()
        c.execute(sql.SQL("GRANT REFERENCES (tenant_id, id) ON public.employees TO {}").format(role))
        c.execute(sql.SQL("GRANT USAGE ON SCHEMA {} TO hasura_app").format(schema))
        c.execute(sql.SQL("ALTER DEFAULT PRIVILEGES FOR ROLE {} IN SCHEMA {} "
                          "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hasura_app").format(role, schema))


def _schema_undo(ctx: Ctx, t: dict, **_):
    role, schema = sql.Identifier(owner_role(t["short_id"])), sql.Identifier(ext_schema(t["short_id"]))
    with ctx.db.tx() as c:
        c.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(schema))
        if c.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (owner_role(t["short_id"]),)).fetchone():
            c.execute(sql.SQL("DROP OWNED BY {}").format(role))
            c.execute(sql.SQL("DROP ROLE {}").format(role))


def _defaults_do(ctx: Ctx, t: dict, **_):
    # tenant mới thừa hưởng cấu hình mặc định của tenant first-party (vd. ngưỡng tạm ứng cấp 2)
    with ctx.db.tx() as c:
        c.execute("""INSERT INTO public.app_settings (tenant_id, key, value)
                     SELECT %s, key, value FROM public.app_settings WHERE tenant_id = %s
                     ON CONFLICT DO NOTHING""", (t["id"], FIRST_PARTY_TENANT))


def _defaults_undo(ctx: Ctx, t: dict, **_):
    with ctx.db.tx() as c:
        c.execute("DELETE FROM public.app_settings WHERE tenant_id = %s", (t["id"],))


def _keycloak_do(ctx: Ctx, t: dict, redirect_uris=(), **_):
    cid = f"app-{t['short_id']}"
    ctx.keycloak.create_client(ctx.settings.end_user_realm, cid, list(redirect_uris))
    with ctx.db.tx() as c:
        c.execute("UPDATE platform.tenants SET keycloak_client_id = %s WHERE id = %s", (cid, t["id"]))


def _keycloak_undo(ctx: Ctx, t: dict, **_):
    ctx.keycloak.delete_client(ctx.settings.end_user_realm, f"app-{t['short_id']}")


STEPS = [("db_schema", _schema_do, _schema_undo),
         ("defaults", _defaults_do, _defaults_undo),
         ("keycloak_client", _keycloak_do, _keycloak_undo)]


def create_project(ctx: Ctx, dev_id: str, name: str, redirect_uris: list[str]) -> dict:
    name = name.strip()
    if not (3 <= len(name) <= 60):
        raise ApiError(422, "Tên project phải dài 3-60 ký tự")
    plan = "free"
    limit = ctx.settings.plans[plan]["projects"]
    t = None
    with ctx.db.tx() as c:
        n = c.execute("SELECT count(*) AS n FROM platform.tenants WHERE owner_dev_id = %s "
                      "AND status NOT IN ('deleted','failed')", (dev_id,)).fetchone()["n"]
        if n >= limit:
            raise ApiError(403, f"Gói {plan} giới hạn {limit} project")
        for _ in range(5):
            try:
                with c.transaction():
                    t = c.execute("""INSERT INTO platform.tenants (short_id, name, owner_dev_id, plan)
                                     VALUES (%s,%s,%s,%s) RETURNING *""",
                                  (new_short_id(), name, dev_id, plan)).fetchone()
                break
            except psycopg.errors.UniqueViolation as e:
                if "tenants_owner_name_uq" in str(e):
                    raise ApiError(409, "Bạn đã có project trùng tên")
        if t is None:
            raise ApiError(500, "Không sinh được mã project")

    done = []
    try:
        for step, do, undo in STEPS:
            do(ctx, t, redirect_uris=redirect_uris)
            done.append((step, undo))
            _record(ctx, t["id"], step, "done")
    except Exception as e:     # bù trừ ngược thứ tự
        for step, undo in reversed(done):
            try:
                undo(ctx, t)
                _record(ctx, t["id"], step, "compensated")
            except Exception:
                _record(ctx, t["id"], step, "failed", "bù trừ thất bại - cần dọn tay")
        failed_step = STEPS[len(done)][0]
        _record(ctx, t["id"], failed_step, "failed", str(e)[:300])
        with ctx.db.tx() as c:
            c.execute("UPDATE platform.tenants SET status = 'failed' WHERE id = %s", (t["id"],))
        raise ApiError(502, f"Cấp phát thất bại ở bước {failed_step}: {e}")
    with ctx.db.tx() as c:
        return c.execute("UPDATE platform.tenants SET status = 'active' WHERE id = %s RETURNING *",
                         (t["id"],)).fetchone()


def delete_project(ctx: Ctx, t: dict) -> None:
    """Thu hồi truy cập và dọn tài nguyên hạ tầng. Dữ liệu lõi (public.*) KHÔNG bị xóa ở đây - xem README (purge/retention)."""
    with ctx.db.tx() as c:
        c.execute("UPDATE platform.tenants SET status = 'deleting' WHERE id = %s", (t["id"],))
        keys = c.execute("SELECT id, consumer FROM platform.api_keys WHERE tenant_id = %s AND revoked_at IS NULL",
                         (t["id"],)).fetchall()
        tables = c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = %s",
                           (ext_schema(t["short_id"]),)).fetchall()
    try:
        for k in keys:
            ctx.apisix.delete_consumer(k["consumer"])
        if tables:
            ctx.hasura.bulk([{"type": "pg_untrack_table", "args": {
                "source": ctx.hasura.source, "cascade": True,
                "table": {"schema": ext_schema(t["short_id"]), "name": r["table_name"]}}} for r in tables])
        ctx.keycloak.delete_client(ctx.settings.end_user_realm, f"app-{t['short_id']}")
    except AdapterError as e:
        raise ApiError(502, f"Thu hồi chưa xong ({e}); gọi lại DELETE để thử tiếp")
    _schema_undo(ctx, t)
    with ctx.db.tx() as c:
        c.execute("UPDATE platform.api_keys SET revoked_at = now() WHERE tenant_id = %s AND revoked_at IS NULL", (t["id"],))
        c.execute("UPDATE platform.webhook_endpoints SET active = false WHERE tenant_id = %s", (t["id"],))
        c.execute("UPDATE platform.tenants SET status = 'deleted', deleted_at = now() WHERE id = %s", (t["id"],))
