#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""
Sinh permission cho 3 role dịch vụ trong metadata Hasura, luôn bị lọc theo tenant:

  bff_service      : BFF (đóng vai bằng admin secret + x-hasura-role). CRUD mọi bảng nghiệp vụ;
                     audit_logs chỉ select + insert (không có seq/hash - trigger điền).
  tenant_api_read  : API key của developer, chỉ đọc (select, giới hạn 1000 dòng/truy vấn).
  tenant_api_write : API key của developer, đọc + ghi dữ liệu nghiệp vụ của CHÍNH tenant mình
                     (không đụng audit_logs, users - danh tính do Keycloak quản lý).

Danh sách cột lấy từ DB thật (psql, biến môi trường PG*), nên chạy sau khi đã áp migration 007/008.
Idempotent: permission cũ của 3 role này được thay mới; role khác giữ nguyên.

  python3 scripts/tenant-roles.py --apply | --check | (mặc định: báo cáo)
"""
import argparse
import copy
import glob
import os
import subprocess
import sys

import yaml

DEFAULT_DIR = "core/data/structured/hasura/metadata/databases/default/tables"
SV = "X-Hasura-Tenant-Id"
TENANT = {"tenant_id": {"_eq": SV}}
ROLES = ("bff_service", "tenant_api_read", "tenant_api_write")
NO_API_ACCESS = {"audit_logs"}                 # developer không đọc/ghi nhật ký hệ thống
NO_API_WRITE = {"audit_logs", "users"}
AUDIT_INSERT_COLS = ["occurred_text", "actor_id", "actor_name", "actor_role", "action", "entity_type", "entity_id", "details"]


def db_columns():
    sql = ("select c.relname, c.relkind, string_agg(a.attname, ',' order by a.attnum) "
           "from pg_class c join pg_namespace n on n.oid=c.relnamespace "
           "join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped "
           "where n.nspname='public' and c.relkind in ('r','v') group by 1,2")
    out = subprocess.run(["psql", "-At", "-F", "|", "-c", sql], capture_output=True, text=True, check=True).stdout
    res = {}
    for line in out.strip().splitlines():
        name, kind, cols = line.split("|")
        res[name] = (kind, cols.split(","))
    return res


def sel(cols, limit=None):
    p = {"columns": list(cols), "filter": copy.deepcopy(TENANT), "allow_aggregations": True}
    if limit:
        p["limit"] = limit
    return {"permission": p}


def ins(cols):
    return {"permission": {"check": copy.deepcopy(TENANT), "set": {"tenant_id": SV},
                           "columns": list(cols), "backend_only": False}}


def upd(cols):
    return {"permission": {"columns": list(cols), "filter": copy.deepcopy(TENANT),
                           "check": copy.deepcopy(TENANT)}}


def dele():
    return {"permission": {"filter": copy.deepcopy(TENANT)}}


def plan(table, kind, cols):
    """Trả về {role: {loại: entry}} cho một bảng/view."""
    is_table = kind == "r"
    writable = [c for c in cols if c != "tenant_id"]
    updatable = [c for c in writable if c != "id"]
    out = {r: {} for r in ROLES}
    # bff_service
    out["bff_service"]["select"] = sel(cols)
    if is_table and table == "audit_logs":
        out["bff_service"]["insert"] = ins([c for c in AUDIT_INSERT_COLS if c in cols])
    elif is_table:
        out["bff_service"]["insert"] = ins(writable)
        out["bff_service"]["update"] = upd(updatable)
        out["bff_service"]["delete"] = dele()
    # API key của developer
    if table not in NO_API_ACCESS:
        out["tenant_api_read"]["select"] = sel(cols, 1000)
        out["tenant_api_write"]["select"] = sel(cols, 1000)
        if is_table and table not in NO_API_WRITE:
            out["tenant_api_write"]["insert"] = ins(writable)
            out["tenant_api_write"]["update"] = upd(updatable)
            out["tenant_api_write"]["delete"] = dele()
    return out


KINDS = {"select": "select_permissions", "insert": "insert_permissions",
         "update": "update_permissions", "delete": "delete_permissions"}


def apply(doc, wanted):
    """Gỡ permission cũ của ROLES rồi thêm mới. Trả về True nếu doc đổi."""
    before = yaml.safe_dump(doc, sort_keys=False)
    for key in KINDS.values():
        if key in doc:
            doc[key] = [p for p in doc[key] if p["role"] not in ROLES]
    for role in ROLES:
        for op, entry in wanted[role].items():
            doc.setdefault(KINDS[op], []).append({"role": role, **entry})
    for key in KINDS.values():
        if key in doc and not doc[key]:
            del doc[key]
    return yaml.safe_dump(doc, sort_keys=False) != before


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=DEFAULT_DIR)
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--apply", action="store_true")
    g.add_argument("--check", action="store_true")
    args = ap.parse_args()

    cols = db_columns()
    changed = 0
    for f in sorted(glob.glob(os.path.join(args.dir, "public_*.yaml"))):
        with open(f, encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
        name = doc["table"]["name"]
        if name not in cols:
            print(f"BỎ QUA {name}: không có trong DB", file=sys.stderr)
            continue
        kind, c = cols[name]
        if "tenant_id" not in c:
            print(f"LỖI {name}: thiếu cột tenant_id", file=sys.stderr)
            return 2
        if apply(doc, plan(name, kind, c)):
            changed += 1
            if args.apply:
                with open(f, "w", encoding="utf-8") as fh:
                    yaml.safe_dump(doc, fh, sort_keys=False, default_flow_style=False, allow_unicode=True, width=1000)
    print(f"{changed} file {'đã cập nhật' if args.apply else 'cần cập nhật'}.")
    return 1 if (args.check and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
