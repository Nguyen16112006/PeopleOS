# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

"""Schema Service: developer khai báo bảng bằng spec; hệ thống tự sinh DDL và đăng ký với Hasura.
Developer KHÔNG BAO GIỜ gửi SQL thô."""
import re
from typing import Literal

from psycopg import sql
from pydantic import BaseModel, Field

from .adapters import AdapterError
from .context import Ctx
from .db import ApiError
from .provisioning import ext_schema, owner_role

TYPES = {"text": "text", "int": "integer", "bigint": "bigint", "numeric": "numeric", "boolean": "boolean",
         "date": "date", "timestamptz": "timestamptz", "uuid": "uuid", "jsonb": "jsonb"}
RESERVED_COLS = {"id", "tenant_id", "created_at"}
IDENT = re.compile(r"^[a-z][a-z0-9_]{1,40}$")
PG_KEYWORDS = set("""all analyse analyze and any array as asc asymmetric both case cast check collate column constraint
create current_date current_role current_time current_timestamp current_user default deferrable desc distinct do else
end except false fetch for foreign from grant group having in initially intersect into lateral leading limit localtime
localtimestamp not null offset on only or order placing primary references returning select session_user some symmetric
table then to trailing true union unique user using variadic when where window with insert update delete drop alter
join left right full inner outer cross natural binary freeze ilike isnull like notnull overlaps similar verbose""".split())
METADATA_LOCK = 7300002
API_ROLES = ("bff_service", "tenant_api_read", "tenant_api_write")


class Column(BaseModel):
    name: str
    type: Literal["text", "int", "bigint", "numeric", "boolean", "date", "timestamptz", "uuid", "jsonb"]
    nullable: bool = True
    unique: bool = False
    references: Literal["employees"] | None = None      # FK tổng hợp tới public.employees(tenant_id, id)


class TableSpec(BaseModel):
    table: str
    columns: list[Column] = Field(min_length=1)
    indexes: list[list[str]] = []


def _ident(kind: str, v: str) -> None:
    if not IDENT.match(v) or v in PG_KEYWORDS or v.startswith("pg_"):
        raise ApiError(422, f"Tên {kind} '{v}' không hợp lệ (chữ thường/số/_, bắt đầu bằng chữ, 2-41 ký tự, không trùng từ khóa)")


def validate_spec(spec: TableSpec, limits: dict, existing: set[str]) -> None:
    _ident("bảng", spec.table)
    if spec.table in existing:
        raise ApiError(409, f"Bảng '{spec.table}' đã tồn tại")
    if len(existing) >= limits["tables"]:
        raise ApiError(403, f"Gói hiện tại giới hạn {limits['tables']} bảng")
    if len(spec.columns) > limits["columns"]:
        raise ApiError(403, f"Gói hiện tại giới hạn {limits['columns']} cột/bảng")
    names = [c.name for c in spec.columns]
    if len(set(names)) != len(names):
        raise ApiError(422, "Tên cột bị trùng")
    for n in names:
        _ident("cột", n)
        if n in RESERVED_COLS:
            raise ApiError(422, f"Cột '{n}' do hệ thống quản lý")
    if len(spec.indexes) > 5:
        raise ApiError(422, "Tối đa 5 index")
    for ix in spec.indexes:
        if not ix or len(ix) > 4 or any(c not in names for c in ix):
            raise ApiError(422, "Index tham chiếu cột không tồn tại hoặc quá 4 cột")


def build_ddl(schema: str, spec: TableSpec, tenant_id: str) -> list[sql.Composable]:
    S, T = sql.Identifier(schema), sql.Identifier(spec.table)
    cols = [sql.SQL("id uuid PRIMARY KEY DEFAULT gen_random_uuid()"),
            sql.SQL("tenant_id uuid NOT NULL DEFAULT platform.current_tenant()"),
            sql.SQL("created_at timestamptz NOT NULL DEFAULT now()")]
    for c in spec.columns:
        parts = [sql.Identifier(c.name), sql.SQL(TYPES[c.type])]
        if not c.nullable:
            parts.append(sql.SQL("NOT NULL"))
        if c.unique:
            parts.append(sql.SQL("UNIQUE"))
        cols.append(sql.SQL(" ").join(parts))
        if c.references:
            # FK TỔNG HỢP (tenant_id, cột) -> employees(tenant_id, id): chặn tham chiếu chéo tenant (FK thường bỏ qua RLS)
            cols.append(sql.SQL("FOREIGN KEY (tenant_id, {}) REFERENCES public.employees (tenant_id, id)").format(sql.Identifier(c.name)))
    stmts: list[sql.Composable] = [
        sql.SQL("CREATE TABLE {}.{} ({})").format(S, T, sql.SQL(", ").join(cols)),
        sql.SQL("ALTER TABLE {}.{} ENABLE ROW LEVEL SECURITY").format(S, T),
        sql.SQL("ALTER TABLE {}.{} FORCE ROW LEVEL SECURITY").format(S, T),
        # UUID của chính tenant được gắn cứng vào policy: dù một request của tenant khác chạm tới bảng này
        # (vd. qua Hasura dùng chung role), nó cũng không đọc/ghi được dòng nào.
        sql.SQL("CREATE POLICY tenant_isolation ON {}.{} "
                "USING (tenant_id = {}::uuid AND tenant_id = platform.current_tenant()) "
                "WITH CHECK (tenant_id = {}::uuid AND tenant_id = platform.current_tenant())").format(
                    S, T, sql.Literal(str(tenant_id)), sql.Literal(str(tenant_id)))]
    for i, ix in enumerate(spec.indexes):
        stmts.append(sql.SQL("CREATE INDEX {} ON {}.{} ({})").format(
            sql.Identifier(f"{spec.table}_ix{i}"), S, T, sql.SQL(", ").join(sql.Identifier(c) for c in ix)))
    return stmts


def _tenant_filter() -> dict:
    return {"tenant_id": {"_eq": "X-Hasura-Tenant-Id"}}


def hasura_args(source: str, schema: str, spec: TableSpec) -> list[dict]:
    table = {"schema": schema, "name": spec.table}
    cols = [c.name for c in spec.columns]
    args = [{"type": "pg_track_table", "args": {"source": source, "table": table}}]

    def perm(kind, role, permission):
        args.append({"type": f"pg_create_{kind}_permission",
                     "args": {"source": source, "table": table, "role": role, "permission": permission}})

    for role in API_ROLES:
        sel = {"columns": ["id", "tenant_id", "created_at"] + cols, "filter": _tenant_filter(), "allow_aggregations": True}
        if role != "bff_service":
            sel["limit"] = 1000
        perm("select", role, sel)
        if role in ("bff_service", "tenant_api_write"):
            perm("insert", role, {"check": _tenant_filter(), "set": {"tenant_id": "X-Hasura-Tenant-Id"}, "columns": cols})
            perm("update", role, {"columns": cols, "filter": _tenant_filter(), "check": _tenant_filter()})
            perm("delete", role, {"filter": _tenant_filter()})
    return args


def _run_as_owner(c, short: str, stmts) -> None:
    c.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(owner_role(short))))
    c.execute("SET LOCAL lock_timeout = '3s'")
    c.execute("SET LOCAL statement_timeout = '10s'")
    c.execute("SET LOCAL search_path = pg_catalog")
    for s in stmts:
        c.execute(s)
    c.execute("RESET ROLE")


def _hasura_locked(ctx: Ctx, fn):
    """Hasura tuần tự hóa metadata; dùng advisory lock để các bản sao platform-api không giẫm lên nhau."""
    with ctx.db.pool.connection() as lc:
        lc.execute("SELECT pg_advisory_lock(%s)", (METADATA_LOCK,))
        try:
            return fn()
        finally:
            lc.execute("SELECT pg_advisory_unlock(%s)", (METADATA_LOCK,))


def _existing(c, schema: str) -> set[str]:
    return {r["table_name"] for r in c.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = %s", (schema,)).fetchall()}


def create_table(ctx: Ctx, t: dict, dev_id: str, spec: TableSpec) -> dict:
    short, schema = t["short_id"], ext_schema(t["short_id"])
    limits = ctx.settings.plans[t["plan"]]
    with ctx.db.tx() as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("schema:" + str(t["id"]),))
        validate_spec(spec, limits, _existing(c, schema))
        stmts = build_ddl(schema, spec, str(t["id"]))
        _run_as_owner(c, short, stmts)
        ver = c.execute("SELECT COALESCE(max(version), 0) + 1 AS v FROM platform.schema_versions WHERE tenant_id = %s",
                        (t["id"],)).fetchone()["v"]
        ddl = ";\n".join(s.as_string(c) for s in stmts)
        c.execute("""INSERT INTO platform.schema_versions (tenant_id, version, table_name, action, spec, ddl, created_by)
                     VALUES (%s,%s,%s,'create_table',%s,%s,%s)""",
                  (t["id"], ver, spec.table, spec.model_dump_json(), ddl, dev_id))
    try:
        _hasura_locked(ctx, lambda: ctx.hasura.bulk(hasura_args(ctx.hasura.source, schema, spec)))
    except AdapterError as e:     # bù trừ: bỏ bảng và phiên bản vừa tạo
        with ctx.db.tx() as c:
            _run_as_owner(c, short, [sql.SQL("DROP TABLE IF EXISTS {}.{}").format(sql.Identifier(schema), sql.Identifier(spec.table))])
            c.execute("DELETE FROM platform.schema_versions WHERE tenant_id = %s AND version = %s", (t["id"], ver))
        raise ApiError(502, f"Hasura từ chối đăng ký bảng: {e}")
    return {"table": spec.table, "schema": schema, "version": ver, "graphql_prefix": schema + "_"}


def drop_table(ctx: Ctx, t: dict, dev_id: str, table: str) -> dict:
    short, schema = t["short_id"], ext_schema(t["short_id"])
    with ctx.db.tx() as c:
        if table not in _existing(c, schema):
            raise ApiError(404, f"Không có bảng '{table}'")
    _hasura_locked(ctx, lambda: ctx.hasura.bulk([{"type": "pg_untrack_table", "args": {
        "source": ctx.hasura.source, "cascade": True, "table": {"schema": schema, "name": table}}}]))
    stmt = sql.SQL("DROP TABLE {}.{}").format(sql.Identifier(schema), sql.Identifier(table))
    with ctx.db.tx() as c:
        c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("schema:" + str(t["id"]),))
        _run_as_owner(c, short, [stmt])
        ver = c.execute("SELECT COALESCE(max(version), 0) + 1 AS v FROM platform.schema_versions WHERE tenant_id = %s",
                        (t["id"],)).fetchone()["v"]
        c.execute("""INSERT INTO platform.schema_versions (tenant_id, version, table_name, action, spec, ddl, created_by)
                     VALUES (%s,%s,%s,'drop_table','{}',%s,%s)""", (t["id"], ver, table, stmt.as_string(c), dev_id))
    return {"dropped": table, "version": ver}


def list_tables(ctx: Ctx, t: dict) -> list[dict]:
    with ctx.db.tx() as c:
        rows = c.execute("""SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
                            WHERE table_schema = %s ORDER BY table_name, ordinal_position""",
                         (ext_schema(t["short_id"]),)).fetchall()
    out: dict[str, list] = {}
    for r in rows:
        out.setdefault(r["table_name"], []).append(
            {"name": r["column_name"], "type": r["data_type"], "nullable": r["is_nullable"] == "YES"})
    return [{"table": k, "columns": v} for k, v in out.items()]


# ---- Custom fields (không DDL) -------------------------------------------------------
class CustomField(BaseModel):
    entity: Literal["employee"] = "employee"
    key: str
    type: Literal["string", "number", "boolean", "date", "enum"]
    required: bool = False
    options: list[str] | None = None


def add_custom_field(ctx: Ctx, t: dict, f: CustomField) -> dict:
    if not re.match(r"^[a-z][a-z0-9_]{1,40}$", f.key):
        raise ApiError(422, "key không hợp lệ")
    if f.type == "enum" and not f.options:
        raise ApiError(422, "Trường enum cần danh sách options")
    if f.type != "enum" and f.options:
        raise ApiError(422, "options chỉ dùng cho kiểu enum")
    with ctx.db.tx() as c:
        n = c.execute("SELECT count(*) AS n FROM platform.custom_field_defs WHERE tenant_id = %s", (t["id"],)).fetchone()["n"]
        if n >= ctx.settings.plans[t["plan"]]["custom_fields"]:
            raise ApiError(403, "Đã đạt giới hạn trường tùy chỉnh của gói")
        import json as _json
        try:
            c.execute("""INSERT INTO platform.custom_field_defs (tenant_id, entity, key, type, required, options)
                         VALUES (%s,%s,%s,%s,%s,%s)""",
                      (t["id"], f.entity, f.key, f.type, f.required, _json.dumps(f.options) if f.options else None))
        except Exception as e:
            if "custom_field_defs_pkey" in str(e):
                raise ApiError(409, f"Trường '{f.key}' đã tồn tại")
            raise
    return f.model_dump()


def list_custom_fields(ctx: Ctx, t: dict) -> list[dict]:
    with ctx.db.tx() as c:
        return c.execute("SELECT entity, key, type, required, options FROM platform.custom_field_defs "
                         "WHERE tenant_id = %s ORDER BY entity, key", (t["id"],)).fetchall()


def delete_custom_field(ctx: Ctx, t: dict, entity: str, key: str) -> None:
    with ctx.db.tx() as c:
        r = c.execute("DELETE FROM platform.custom_field_defs WHERE tenant_id = %s AND entity = %s AND key = %s",
                      (t["id"], entity, key))
        if r.rowcount == 0:
            raise ApiError(404, "Không có trường này")
        c.execute("SET LOCAL platform.skip_custom_validation = 'on'")   # dọn giá trị cũ, bỏ qua validate
        c.execute("UPDATE public.employees SET custom = custom - %s WHERE tenant_id = %s AND custom ? %s",
                  (key, t["id"], key))
