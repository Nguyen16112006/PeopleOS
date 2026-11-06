#!/usr/bin/env python3
"""Thêm dòng SPDX-License-Identifier vào đầu mọi file mã nguồn trong repo (chạy ở thư mục gốc).

Cách dùng:
    python add_spdx_headers.py --dry-run   # chỉ liệt kê, không sửa
    python add_spdx_headers.py             # thêm header
    python add_spdx_headers.py --check     # chỉ kiểm tra (exit 1 nếu còn file thiếu), dùng cho CI

An toàn:
- Chỉ xử lý file đã được git theo dõi (git ls-files), nên bỏ qua node_modules, build...
- Giữ nguyên kiểu xuống dòng (CRLF/LF) và BOM của từng file.
- Giữ dòng shebang (#!) và dòng khai báo encoding của Python ở trên cùng.
- Bỏ qua file đã có SPDX, file JSON (không có comment) và file sinh tự động.
"""
import subprocess
import sys
from pathlib import Path

LICENSE_ID = "Apache-2.0"
TAG = f"SPDX-License-Identifier: {LICENSE_ID}"

SLASH = {".java", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
HASH = {".py", ".sh", ".yml", ".yaml"}
DASH = {".sql"}
BLOCK = {".css"}
HASH_NAMES = {"Dockerfile"}

# File sinh tự động hoặc có kiểm tra nội dung chính xác -> không đụng vào.
SKIP_PARTS = ("node_modules/", "package-lock.json", "/dist/", "/build/", "__pycache__/")
SKIP_FILES = {"core/data/structured/seed/seed.sql"}  # CI so sánh với generate_seed.py


def comment_for(path: Path):
    name, ext = path.name, path.suffix.lower()
    if name in HASH_NAMES or name.startswith("Dockerfile"):
        return "# ", ""
    if ext in SLASH:
        return "// ", ""
    if ext in HASH:
        return "# ", ""
    if ext in DASH:
        return "-- ", ""
    if ext in BLOCK:
        return "/* ", " */"
    return None


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], capture_output=True, check=True).stdout
    return [p for p in out.decode("utf-8").split("\0") if p]


def process(rel: str, apply: bool):
    p = Path(rel)
    if rel in SKIP_FILES or any(s in rel for s in SKIP_PARTS):
        return "skip"
    cm = comment_for(p)
    if cm is None:
        return "skip"
    raw = p.read_bytes()
    bom = b"\xef\xbb\xbf" if raw.startswith(b"\xef\xbb\xbf") else b""
    body = raw[len(bom):]
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        return "skip"
    if TAG in "\n".join(text.splitlines()[:15]):
        return "has"
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(nl) if text else []
    header = f"{cm[0]}{TAG}{cm[1]}"

    idx = 0
    if p.suffix.lower() in {".py", ".sh"} or p.suffix.lower() in HASH:
        if lines and lines[0].startswith("#!"):
            idx = 1
        # Python: dòng encoding phải nằm ở dòng 1 hoặc 2
        if p.suffix.lower() == ".py" and len(lines) > idx and lines[idx].lstrip().startswith("#") and "coding" in lines[idx]:
            idx += 1
    new_lines = lines[:idx] + [header] + lines[idx:]
    if not lines:
        new_lines = [header, ""]
    if apply:
        p.write_bytes(bom + nl.join(new_lines).encode("utf-8"))
    return "add"


def main():
    args = set(sys.argv[1:])
    apply = not ({"--dry-run", "--check"} & args)
    counts = {"add": 0, "has": 0, "skip": 0}
    missing = []
    for rel in tracked_files():
        r = process(rel, apply)
        counts[r] += 1
        if r == "add":
            missing.append(rel)
    verb = "Đã thêm" if apply else "Cần thêm"
    print(f"{verb} header cho {counts['add']} file | đã có sẵn: {counts['has']} | bỏ qua: {counts['skip']}")
    if not apply:
        for m in missing[:40]:
            print("  -", m)
        if len(missing) > 40:
            print(f"  ... và {len(missing) - 40} file nữa")
    if "--check" in args and missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
