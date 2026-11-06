# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

import json

import psycopg
import pytest

from .conftest import DEV_A, DEV_B, auth

COLS = [{"name": "amount", "type": "numeric", "nullable": False}, {"name": "note", "type": "text"}]


def q(ctx, sql, *p):
    with ctx.db.tx() as c:
        return c.execute(sql, p).fetchall()


def session(ctx, tenant_id, fn):
    """Chạy fn(conn) như Hasura: role hasura_app + session variable của tenant (RLS có hiệu lực)."""
    with ctx.db.tx() as c:
        c.execute("SET LOCAL ROLE hasura_app")
        c.execute("SELECT set_config('hasura.user', %s, true)", (json.dumps({"x-hasura-tenant-id": str(tenant_id)}),))
        return fn(c)


def add(client, p, table="bonus", cols=COLS, dev=DEV_A, **extra):
    return client.post(f"/v1/projects/{p['id']}/schema/tables", json={"table": table, "columns": cols, **extra}, headers=auth(dev))


# ---------------- Tạo bảng ----------------
def test_create_table_ddl_rls_and_hasura(client, ctx, make_project, rec):
    p = make_project()
    r = add(client, p, indexes=[["amount"]])
    assert r.status_code == 201, r.text
    assert r.json() == {"table": "bonus", "schema": f"ext_{p['short_id']}", "version": 1, "graphql_prefix": f"ext_{p['short_id']}_"}
    sch = f"ext_{p['short_id']}"
    cols = {x["column_name"] for x in q(ctx, "SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name='bonus'", sch)}
    assert cols == {"id", "tenant_id", "created_at", "amount", "note"}
    rls = q(ctx, "SELECT relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS owner FROM pg_class WHERE oid = %s::regclass", f'{sch}.bonus')[0]
    assert rls["relrowsecurity"] and rls["relforcerowsecurity"] and rls["owner"] == f"ext_{p['short_id']}_owner"
    v = q(ctx, "SELECT version, action, ddl FROM platform.schema_versions WHERE tenant_id=%s", p["id"])[0]
    assert v["action"] == "create_table" and "CREATE TABLE" in v["ddl"] and "FORCE ROW LEVEL SECURITY" in v["ddl"]

    bulk = rec.calls_to("POST", "/v1/metadata")[0][2]
    assert bulk["type"] == "bulk"
    kinds = [a["type"] for a in bulk["args"]]
    assert kinds[0] == "pg_track_table" and len(kinds) == 10
    perms = [(a["type"].split("_")[2], a["args"]["role"]) for a in bulk["args"][1:]]
    assert ("select", "tenant_api_read") in perms and ("insert", "tenant_api_read") not in perms      # read-only không ghi được
    assert ("insert", "tenant_api_write") in perms and ("delete", "tenant_api_write") in perms and ("insert", "bff_service") in perms
    for a in bulk["args"][1:]:
        pm = a["args"]["permission"]
        assert pm.get("filter", pm.get("check")) == {"tenant_id": {"_eq": "X-Hasura-Tenant-Id"}}
        if a["type"].endswith("insert_permission"):
            assert pm["set"] == {"tenant_id": "X-Hasura-Tenant-Id"} and "tenant_id" not in pm["columns"]
        if a["args"]["role"] != "bff_service" and a["type"].endswith("select_permission"):
            assert pm["limit"] == 1000


@pytest.mark.parametrize("name", ["Users", "select", "pg_x", "a", "1abc", 'x"; drop table employees;--', "a b", "x" * 50])
def test_rejects_bad_table_names(client, ctx, make_project, name):
    p = make_project()
    assert add(client, p, table=name).status_code == 422
    assert q(ctx, "SELECT count(*) AS n FROM public.employees")        # bảng lõi nguyên vẹn


def test_rejects_bad_columns(client, make_project):
    p = make_project()
    for cols in ([{"name": "id", "type": "text"}], [{"name": "tenant_id", "type": "uuid"}], [{"name": "created_at", "type": "date"}],
                 [{"name": "a_b", "type": "text"}, {"name": "a_b", "type": "int"}], [{"name": "x", "type": "serial"}],
                 [{"name": "Bad", "type": "text"}], [{"name": "ok", "type": "text", "references": "users"}]):
        assert add(client, p, cols=cols).status_code == 422, cols
    assert add(client, p, cols=[{"name": "ok", "type": "text"}], indexes=[["nope"]]).status_code == 422
    assert client.post(f"/v1/projects/{p['id']}/schema/tables", json={"table": "t1", "columns": []}, headers=auth()).status_code == 422


def test_limits_duplicates_and_references(client, make_project):
    p = make_project()
    assert add(client, p, table="t0").status_code == 201
    assert add(client, p, table="t0").status_code == 409
    r = add(client, p, table="with_fk", cols=[{"name": "employee_id", "type": "uuid", "references": "employees"}, {"name": "code", "type": "text", "unique": True}])
    assert r.status_code == 201, r.text
    for i in range(1, 4):
        assert add(client, p, table=f"t{i}").status_code == 201
    assert add(client, p, table="t_over").status_code == 403                      # gói free: 5 bảng
    many = [{"name": f"c{i}", "type": "int"} for i in range(21)]
    q2 = make_project(DEV_B, "Other")
    assert add(client, q2, table="wide", cols=many, dev=DEV_B).status_code == 403   # gói free: 20 cột


def test_hasura_failure_rolls_back_table(client, ctx, make_project, rec):
    p = make_project()
    rec.fail.add("/v1/metadata")
    assert add(client, p).status_code == 502
    sch = f"ext_{p['short_id']}"
    assert not q(ctx, "SELECT 1 FROM information_schema.tables WHERE table_schema=%s", sch)
    assert not q(ctx, "SELECT 1 FROM platform.schema_versions WHERE tenant_id=%s", p["id"])
    rec.fail.clear()
    assert add(client, p).status_code == 201


def test_drop_table_and_versions(client, ctx, make_project, rec):
    p = make_project()
    add(client, p); rec.calls.clear()
    assert client.delete(f"/v1/projects/{p['id']}/schema/tables/bonus", headers=auth()).status_code == 200
    assert rec.calls_to("POST", "/v1/metadata")[0][2]["args"][0]["type"] == "pg_untrack_table"
    assert not q(ctx, "SELECT 1 FROM information_schema.tables WHERE table_schema=%s", f"ext_{p['short_id']}")
    assert client.delete(f"/v1/projects/{p['id']}/schema/tables/bonus", headers=auth()).status_code == 404
    vs = client.get(f"/v1/projects/{p['id']}/schema/versions", headers=auth()).json()
    assert [(v["version"], v["action"]) for v in vs] == [(1, "create_table"), (2, "drop_table")]
    assert client.get(f"/v1/projects/{p['id']}/schema/tables", headers=auth()).json() == []


def test_schema_endpoints_are_owner_only(client, make_project):
    p = make_project(DEV_A, "Alpha")
    make_project(DEV_B, "Beta")
    assert add(client, p, dev=DEV_B).status_code == 404
    assert client.get(f"/v1/projects/{p['id']}/schema/tables", headers=auth(DEV_B)).status_code == 404


# ---------------- Cô lập dữ liệu ở tầng SQL (RLS) ----------------
def test_ext_tables_isolated_between_tenants(client, ctx, make_project):
    a, b = make_project(DEV_A, "Alpha"), make_project(DEV_B, "Beta")
    add(client, a, dev=DEV_A); add(client, b, dev=DEV_B)
    ta, tb = f"ext_{a['short_id']}.bonus", f"ext_{b['short_id']}.bonus"
    session(ctx, a["id"], lambda c: c.execute(f"INSERT INTO {ta} (amount, note) VALUES (100, 'a1')"))      # tenant_id tự gán
    session(ctx, b["id"], lambda c: c.execute(f"INSERT INTO {tb} (amount, note) VALUES (200, 'b1')"))
    assert [r["note"] for r in session(ctx, a["id"], lambda c: c.execute(f"SELECT note FROM {ta}").fetchall())] == ["a1"]
    assert session(ctx, a["id"], lambda c: c.execute(f"SELECT 1 FROM {tb}").fetchall()) == []             # A không đọc được bảng của B
    assert session(ctx, b["id"], lambda c: c.execute(f"SELECT 1 FROM {ta}").fetchall()) == []
    with pytest.raises(psycopg.errors.InsufficientPrivilege):                                               # A ghi vào schema của B: bị chặn
        session(ctx, a["id"], lambda c: c.execute(f"INSERT INTO {tb} (amount, tenant_id) VALUES (1, %s)", (a["id"],)))
    with pytest.raises(psycopg.errors.InsufficientPrivilege):                                               # A gài dòng mang tenant của B
        session(ctx, a["id"], lambda c: c.execute(f"INSERT INTO {ta} (amount, tenant_id) VALUES (1, %s)", (b["id"],)))
    assert session(ctx, a["id"], lambda c: c.execute(f"UPDATE {tb} SET amount = 0").rowcount) == 0
    with pytest.raises(psycopg.errors.InsufficientPrivilege):                                               # không có session => không ghi được
        with ctx.db.tx() as c:
            c.execute("SET LOCAL ROLE hasura_app"); c.execute(f"INSERT INTO {ta} (amount) VALUES (1)")


def test_owner_role_is_contained(client, ctx, make_project):
    p = make_project()
    role = f"ext_{p['short_id']}_owner"

    def as_owner(stmt):
        with ctx.db.tx() as c:
            c.execute(f'SET LOCAL ROLE "{role}"'); c.execute(stmt)
    for stmt in ("CREATE TABLE public.hack (id int)", "SELECT * FROM platform.api_keys", "SELECT * FROM platform.webhook_endpoints",
                 "SELECT * FROM public.employees", "DROP TABLE public.employees", "CREATE ROLE evil SUPERUSER"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            as_owner(stmt)


# ---------------- Custom fields ----------------
def emp(ctx, tenant_id, code, custom):
    return session(ctx, tenant_id, lambda c: c.execute(
        "INSERT INTO public.employees (employee_code, full_name, email, department, job_title, hire_date, custom) "
        "VALUES (%s,'N','n@x','IT','Dev','2024-01-01',%s)", (code, json.dumps(custom))))


def test_custom_fields_enforced_per_tenant(client, ctx, make_project):
    a, b = make_project(DEV_A, "Alpha"), make_project(DEV_B, "Beta")
    url = f"/v1/projects/{a['id']}/custom-fields"
    assert client.post(url, json={"key": "level", "type": "enum", "options": ["junior", "senior"], "required": True}, headers=auth()).status_code == 201
    assert client.post(url, json={"key": "level", "type": "string"}, headers=auth()).status_code == 409
    assert client.post(url, json={"key": "grade", "type": "enum"}, headers=auth()).status_code == 422
    assert client.post(url, json={"key": "x", "type": "string", "options": ["a"]}, headers=auth()).status_code == 422
    assert client.post(url, json={"key": "Bad Key", "type": "string"}, headers=auth()).status_code == 422
    emp(ctx, a["id"], "E1", {"level": "senior"})                                      # hợp lệ
    for bad in ({"level": "intern"}, {"level": "senior", "zzz": 1}, {}):
        with pytest.raises(psycopg.errors.CheckViolation):
            emp(ctx, a["id"], "E2", bad)
    emp(ctx, b["id"], "E1", {})                                                       # tenant B không bị ảnh hưởng bởi định nghĩa của A
    with pytest.raises(psycopg.errors.CheckViolation):
        emp(ctx, b["id"], "E3", {"level": "senior"})                                  # ...và không dùng được trường của A
    assert [f["key"] for f in client.get(url, headers=auth()).json()] == ["level"]
    assert client.get(f"/v1/projects/{a['id']}/custom-fields", headers=auth(DEV_B)).status_code == 404


def test_delete_custom_field_cleans_existing_data(client, ctx, make_project):
    a = make_project()
    url = f"/v1/projects/{a['id']}/custom-fields"
    client.post(url, json={"key": "level", "type": "enum", "options": ["junior", "senior"], "required": True}, headers=auth())
    emp(ctx, a["id"], "E1", {"level": "senior"})
    assert client.delete(f"{url}/employee/level", headers=auth()).status_code == 204       # trường bắt buộc vẫn gỡ được
    assert q(ctx, "SELECT custom FROM public.employees WHERE tenant_id=%s", a["id"])[0]["custom"] == {}
    emp(ctx, a["id"], "E2", {})
    assert client.delete(f"{url}/employee/level", headers=auth()).status_code == 404


def test_ext_foreign_key_cannot_cross_tenants(client, ctx, make_project):
    a, b = make_project(DEV_A, "Alpha"), make_project(DEV_B, "Beta")
    cols = [{"name": "employee_id", "type": "uuid", "references": "employees"}, {"name": "amount", "type": "numeric"}]
    assert add(client, a, table="grant_a", cols=cols, dev=DEV_A).status_code == 201
    emp_a = emp_b = None
    with ctx.db.tx() as c:
        for tid, code in ((a["id"], "A1"), (b["id"], "B1")):
            row = c.execute("INSERT INTO public.employees (employee_code, full_name, email, department, job_title, hire_date, tenant_id) "
                            "VALUES (%s,'N',%s,'IT','Dev','2024-01-01',%s) RETURNING id", (code, code + "@x", tid)).fetchone()
            if code == "A1":
                emp_a = row["id"]
            else:
                emp_b = row["id"]
    tbl = f"ext_{a['short_id']}.grant_a"
    session(ctx, a["id"], lambda c: c.execute(f"INSERT INTO {tbl} (employee_id, amount) VALUES (%s, 1)", (emp_a,)))      # cùng tenant: được
    with pytest.raises(psycopg.errors.ForeignKeyViolation):                                                              # nhân viên của tenant khác: bị chặn
        session(ctx, a["id"], lambda c: c.execute(f"INSERT INTO {tbl} (employee_id, amount) VALUES (%s, 1)", (emp_b,)))
