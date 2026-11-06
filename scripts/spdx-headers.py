#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""
Thêm / kiểm tra header giấy phép SPDX cho mã nguồn (Apache-2.0).

  python3 scripts/spdx-headers.py --check    # thoát mã 1 nếu còn file thiếu header (dùng trong CI)
  python3 scripts/spdx-headers.py --apply    # thêm header còn thiếu (idempotent)

Quy tắc an toàn:
  - giữ nguyên dòng shebang, `# -*- coding -*-`, `# syntax=` / `# escape=` của Dockerfile ở đầu file;
  - giữ kiểu xuống dòng (LF/CRLF) và BOM của từng file;
  - XML/HTML: header đặt sau khai báo <?xml ?> / <!doctype>;
  - bỏ qua file sinh tự động hoặc dữ liệu: metadata Hasura (do script ghi lại), seed.sql (do generate_seed.py sinh,
    generator tự ghi header), JSON, Markdown, package-lock, thư mục node_modules/dist/backups.
"""
import argparse
import re
import sys
from pathlib import Path

SPDX_ID = "Apache-2.0"
COPYRIGHT = "Copyright (c) 2026 PeopleOS contributors"
ROOT = Path(__file__).resolve().parent.parent

SKIP_DIRS = {"node_modules", "dist", "build", ".git", "backups", "__pycache__", ".pytest_cache", ".venv", "target"}
SKIP_PATHS = ("core/data/structured/hasura/metadata/", "core/data/structured/seed/seed.sql", "infrastructure/data/")
HASH_EXT = {".py", ".sh", ".yml", ".yaml", ".conf"}
XML_EXT = {".xml", ".html", ".bpmn"}
SLASH_EXT = {".java", ".ts", ".tsx", ".js", ".mjs"}
DASH_EXT = {".sql", ".lua"}
CSS_EXT = {".css"}


def style(path: Path):
    n = path.name
    if n == "Dockerfile" or n.startswith("Dockerfile."):
        return "#"
    ext = path.suffix.lower()
    if ext in HASH_EXT: return "#"
    if ext in SLASH_EXT: return "//"
    if ext in DASH_EXT: return "--"
    if ext in CSS_EXT: return "css"
    if ext in XML_EXT: return "xml"
    return None


def candidates():
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        rel_parts = p.relative_to(ROOT).parts
        rel = "/".join(rel_parts)
        if any(part in SKIP_DIRS for part in rel_parts[:-1]) or rel.startswith(SKIP_PATHS) or style(p) is None:
            continue
        yield p, rel


def header_lines(kind: str):
    if kind == "xml":
        return [f"<!-- SPDX-License-Identifier: {SPDX_ID}", f"     {COPYRIGHT} -->"]
    if kind == "css":
        return [f"/* SPDX-License-Identifier: {SPDX_ID}", f"   {COPYRIGHT} */"]
    return [f"{kind} SPDX-License-Identifier: {SPDX_ID}", f"{kind} {COPYRIGHT}"]


def has_header(text: str) -> bool:
    return "SPDX-License-Identifier" in "\n".join(text.splitlines()[:12])


KEEP_FIRST = re.compile(r"^(<!doctype[^>]*>\s*$|(?i:<!doctype)|#!|#\s*-\*-.*coding|#\s*(vim?|coding)[:=]|#\s*syntax\s*=|#\s*escape\s*=|%YAML|<\?xml)")


def add_header(raw: bytes, kind: str) -> bytes:
    bom = b"\xef\xbb\xbf" if raw.startswith(b"\xef\xbb\xbf") else b""
    text = raw[len(bom):].decode("utf-8")
    nl = "\r\n" if "\r\n" in text.split("\n", 1)[0] + "\n" and "\r\n" in text else "\n"
    lines = text.split(nl) if nl == "\r\n" else text.split("\n")
    keep = 0
    while keep < len(lines) and KEEP_FIRST.match(lines[keep]):
        keep += 1
    new = lines[:keep] + header_lines(kind) + ([""] if keep == 0 and lines and lines[0].strip() else []) + lines[keep:]
    return bom + nl.join(new).encode("utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true")
    g.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    missing = []
    for p, rel in sorted(candidates()):
        raw = p.read_bytes()
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            print(f"BỎ QUA (không phải UTF-8): {rel}", file=sys.stderr)
            continue
        if has_header(text):
            continue
        missing.append(rel)
        if args.apply:
            p.write_bytes(add_header(raw, style(p)))
    if args.check:
        for m in missing:
            print("THIẾU header SPDX:", m)
        print(f"{len(missing)} file thiếu header." if missing else "Mọi file mã đều có header SPDX.")
        return 1 if missing else 0
    print(f"Đã thêm header cho {len(missing)} file.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
