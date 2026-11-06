#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""
Đóng gói bản phát hành mã nguồn: dist/PeopleOS-<phiên bản>.tar.gz (+ SHA256SUMS).

  python scripts/make-release.py                 # phiên bản lấy từ mục đầu tiên của CHANGELOG.md
  python scripts/make-release.py --version 2.0.1
  python scripts/make-release.py --check         # chỉ kiểm tra (không ghi): có bí mật/dump lọt vào gói không

- Định dạng .tar.gz (không phải .zip). Tái lập được: thứ tự tệp cố định, mtime/uid/gid chuẩn hóa, gzip mtime = 0.
- TỰ LOẠI: .env, backups/*, *.dump, khóa riêng, node_modules, build, __pycache__...
- TỪ CHỐI đóng gói nếu phát hiện khóa riêng (BEGIN ... PRIVATE KEY), tệp .env/.pem/.dump trong tập tệp sẽ phát hành.
Khuyến nghị: chạy trên bản checkout sạch (git clone) và tạo tag trước khi phát hành:  git tag -a v2.0.1 -m "PeopleOS 2.0.1"
"""
import argparse
import gzip
import hashlib
import io
import re
import sys
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCLUDE_DIRS = {".git", "node_modules", "dist", "build", "__pycache__", ".pytest_cache", ".venv", ".idea", ".vscode", "target"}
EXCLUDE_PREFIX = ("backups/", "infrastructure/data/")
KEEP_IN_EXCLUDED = {"backups/README.md", "backups/.gitkeep"}
EXCLUDE_NAMES = {".env", ".DS_Store", "Thumbs.db"}
EXCLUDE_SUFFIX = (".pyc", ".dump", ".pem", ".key", ".p12", ".pfx", ".tsbuildinfo", ".zip")
SECRET_RE = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----")
FIXED_MTIME = 1_767_225_600  # 2026-01-01T00:00:00Z - cố định để bản build tái lập được


def release_files(root: Path = ROOT):
    out = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.is_symlink():
            continue
        rel = p.relative_to(root).as_posix()
        parts = rel.split("/")
        if any(x in EXCLUDE_DIRS for x in parts[:-1]):
            continue
        if rel.startswith(EXCLUDE_PREFIX) and rel not in KEEP_IN_EXCLUDED:
            continue
        if p.name in EXCLUDE_NAMES or rel.endswith(EXCLUDE_SUFFIX):
            continue
        out.append((p, rel))
    return out


def scan_secrets(files):
    problems = []
    for p, rel in files:
        if p.name == ".env" or rel.endswith((".pem", ".key", ".dump")):
            problems.append(f"{rel}: loại tệp không được phát hành")
            continue
        if p.stat().st_size > 2_000_000:
            continue
        try:
            if SECRET_RE.search(p.read_bytes()):
                problems.append(f"{rel}: chứa khóa riêng")
        except OSError:
            pass
    return problems


def detect_version(root: Path = ROOT) -> str:
    m = re.search(r"^## \[(\d+\.\d+\.\d+[^\]]*)\]", (root / "CHANGELOG.md").read_text(encoding="utf-8"), re.M)
    if not m:
        sys.exit("Không tìm thấy phiên bản trong CHANGELOG.md; dùng --version")
    return m.group(1)


def build(version: str, out_dir: Path, root: Path = ROOT) -> Path:
    files = release_files(root)
    problems = scan_secrets(files)
    if problems:
        sys.exit("TỪ CHỐI đóng gói:\n  " + "\n  ".join(problems))
    out_dir.mkdir(parents=True, exist_ok=True)
    name = f"PeopleOS-{version}"
    target = out_dir / f"{name}.tar.gz"
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, compresslevel=9) as gz:
        with tarfile.open(fileobj=gz, mode="w", format=tarfile.PAX_FORMAT) as tar:
            for p, rel in files:
                info = tarfile.TarInfo(f"{name}/{rel}")
                data = p.read_bytes()
                info.size = len(data)
                info.mtime = FIXED_MTIME
                info.uid = info.gid = 0
                info.uname = info.gname = ""
                info.mode = 0o755 if (p.stat().st_mode & 0o111 or data.startswith(b"#!")) else 0o644
                tar.addfile(info, io.BytesIO(data))
    target.write_bytes(buf.getvalue())
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (out_dir / "SHA256SUMS").write_text(f"{digest}  {target.name}\n", encoding="utf-8")
    return target


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version")
    ap.add_argument("--out", default=str(ROOT / "dist"))
    ap.add_argument("--check", action="store_true", help="chỉ kiểm tra, không ghi tệp")
    args = ap.parse_args()
    files = release_files()
    problems = scan_secrets(files)
    if args.check:
        for x in problems:
            print("LỖI:", x)
        print(f"{len(files)} tệp sẽ vào bản phát hành; {len(problems)} vấn đề.")
        return 1 if problems else 0
    target = build(args.version or detect_version(), Path(args.out))
    print(f"Đã tạo {target} ({target.stat().st_size // 1024} KB)")
    print((Path(args.out) / "SHA256SUMS").read_text(encoding="utf-8").strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
