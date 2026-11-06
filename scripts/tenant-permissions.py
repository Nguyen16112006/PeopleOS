#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""
Bọc điều kiện tenant vào MỌI permission trong metadata Hasura (lớp bảo vệ 1).

  select / update / delete : filter  ->  {_and: [{tenant_id: {_eq: X-Hasura-Tenant-Id}}, <filter cũ>]}
  insert                   : check   ->  như trên;  set -> thêm tenant_id: X-Hasura-Tenant-Id

Chạy lại nhiều lần an toàn (idempotent): permission đã có điều kiện tenant được bỏ qua.

Cách dùng (từ gốc repo):
  python3 scripts/tenant-permissions.py            # chỉ báo cáo, không ghi
  python3 scripts/tenant-permissions.py --apply    # ghi vào các file public_*.yaml
  python3 scripts/tenant-permissions.py --check    # thoát mã 1 nếu còn permission thiếu tenant (dùng cho CI)
  python3 scripts/tenant-permissions.py --dir <thư mục> ...   # chỉ định thư mục tables khác

Yêu cầu: PyYAML. Mọi bảng/view được track phải có cột tenant_id (migration 1760000000007 và 1760000000008).
"""
import argparse
import copy
import glob
import os
import sys

import yaml

DEFAULT_DIR = "core/data/structured/hasura/metadata/databases/default/tables"
SESSION_VAR = "X-Hasura-Tenant-Id"
TENANT = {"tenant_id": {"_eq": SESSION_VAR}}
FILTER_KINDS = ("select_permissions", "update_permissions", "delete_permissions")


def has_tenant(cond):
    """True nếu điều kiện đã chứa ràng buộc tenant ở cấp cao nhất (trực tiếp hoặc trong _and)."""
    if not isinstance(cond, dict):
        return False
    if cond == TENANT:
        return True
    return any(has_tenant(c) for c in cond.get("_and", []))


def wrap(cond):
    if cond in (None, {}):
        return copy.deepcopy(TENANT)
    if has_tenant(cond):
        return cond
    return {"_and": [copy.deepcopy(TENANT), cond]}


def process(doc):
    """Sửa doc tại chỗ. Trả về (số_đã_sửa, số_đã_đủ)."""
    changed = ok = 0
    for kind in FILTER_KINDS:
        for p in doc.get(kind, []) or []:
            perm = p["permission"]
            if has_tenant(perm.get("filter")):
                ok += 1
                continue
            perm["filter"] = wrap(perm.get("filter"))
            changed += 1
    for p in doc.get("insert_permissions", []) or []:
        perm = p["permission"]
        touched = False
        if not has_tenant(perm.get("check")):
            perm["check"] = wrap(perm.get("check"))
            touched = True
        setv = perm.get("set") or {}
        if setv.get("tenant_id") != SESSION_VAR:
            setv["tenant_id"] = SESSION_VAR
            perm["set"] = setv
            touched = True
        changed += 1 if touched else 0
        ok += 0 if touched else 1
    return changed, ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", default=DEFAULT_DIR)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="ghi thay đổi vào file")
    mode.add_argument("--check", action="store_true", help="chỉ kiểm tra, thoát 1 nếu còn thiếu")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.dir, "public_*.yaml")))
    if not files:
        print(f"Không thấy file public_*.yaml trong {args.dir}", file=sys.stderr)
        return 2

    total_changed = total_ok = 0
    for f in files:
        with open(f, encoding="utf-8") as fh:
            doc = yaml.safe_load(fh)
        changed, ok = process(doc)
        total_changed += changed
        total_ok += ok
        if changed:
            print(f"{'ĐÃ SỬA' if args.apply else 'CẦN SỬA'}  {os.path.basename(f):45s} {changed} permission")
            if args.apply:
                with open(f, "w", encoding="utf-8") as fh:
                    yaml.safe_dump(doc, fh, sort_keys=False, default_flow_style=False,
                                   allow_unicode=True, width=1000)

    print(f"\nTổng: {total_changed} permission {'đã bọc' if args.apply else 'cần bọc'}, {total_ok} đã có điều kiện tenant.")
    if args.check and total_changed:
        print("KIỂM TRA THẤT BẠI: còn permission thiếu điều kiện tenant.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
