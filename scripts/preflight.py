#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""
Kiểm tra máy trước khi chạy PeopleOS (Windows / Linux / macOS, chỉ dùng thư viện chuẩn).

  python scripts/preflight.py                 # Docker, RAM, đĩa, cổng, .env
  python scripts/preflight.py --paas          # thêm overlay PaaS (etcd, platform-api, portal...)
  python scripts/preflight.py --check-images  # kiểm tra MỌI image (đã ghim) có thật trên registry - cần mạng

Thoát mã 1 nếu có LỖI chặn (Docker không chạy, cổng bị chiếm, thiếu đĩa); CẢNH BÁO không chặn.
"""
import argparse
import ctypes
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ROOT / "infrastructure" / "docker-compose.yml"
OVERLAY = ROOT / "infrastructure" / "docker-compose.paas.yml"
MIN_DISK_GB, MIN_RAM_GB, WARN_RAM_GB = 15, 4, 8

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ENV_DEFAULT = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}")


def resolve(text: str, env=None) -> str:
    """Thay ${VAR:-mặc định} bằng biến môi trường (nếu có) hoặc giá trị mặc định."""
    env = os.environ if env is None else env
    return ENV_DEFAULT.sub(lambda m: env.get(m.group(1)) or (m.group(2) or ""), text)


def extract_images(compose_text: str, env=None) -> list[str]:
    imgs = []
    for line in compose_text.splitlines():
        m = re.match(r"^\s*image:\s*([^\s#]+)", line)
        if m:
            img = resolve(m.group(1), env).strip("\"'")
            if img and img not in imgs:
                imgs.append(img)
    return imgs


def extract_ports(compose_text: str, env=None) -> list[int]:
    ports = []
    pat = re.compile(r"^\s*-\s*[\"']?(?:[\d.]+:)?(\$\{[^}]+\}|\d+):(\d+)(?:/\w+)?[\"']?\s*(?:#.*)?$")
    for line in compose_text.splitlines():
        m = pat.match(line)
        if m:
            host = resolve(m.group(1), env)
            if host.isdigit() and int(host) not in ports:
                ports.append(int(host))
    return ports


def total_ram_gb() -> float | None:
    try:
        if sys.platform.startswith("win"):
            class MEMSTAT(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                            ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong),
                            ("ullAvailPageFile", ctypes.c_ulonglong), ("ullTotalVirtual", ctypes.c_ulonglong),
                            ("ullAvailVirtual", ctypes.c_ulonglong), ("sullAvailExtendedVirtual", ctypes.c_ulonglong)]
            st = MEMSTAT(); st.dwLength = ctypes.sizeof(MEMSTAT)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
            return st.ullTotalPhys / 2**30
        if sys.platform == "darwin":
            return int(subprocess.check_output(["sysctl", "-n", "hw.memsize"]).strip()) / 2**30
        with open("/proc/meminfo", encoding="utf-8") as fh:
            return int(re.search(r"MemTotal:\s+(\d+)", fh.read()).group(1)) / 2**20
    except Exception:
        return None


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) != 0


def run(cmd, timeout=30):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).strip()
    except (OSError, subprocess.TimeoutExpired) as e:
        return 127, str(e)


class Report:
    def __init__(self):
        self.errors = self.warnings = 0

    def ok(self, msg): print(f"  [OK]       {msg}")
    def warn(self, msg): self.warnings += 1; print(f"  [CẢNH BÁO] {msg}")
    def err(self, msg): self.errors += 1; print(f"  [LỖI]      {msg}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--paas", action="store_true", help="kiểm tra thêm overlay HR-PaaS")
    ap.add_argument("--check-images", action="store_true", help="docker manifest inspect cho mọi image (cần mạng)")
    args = ap.parse_args()
    r = Report()
    texts = [COMPOSE.read_text(encoding="utf-8")] + ([OVERLAY.read_text(encoding="utf-8")] if args.paas else [])

    print(f"Hệ thống: {platform.system()} {platform.release()}, Python {platform.python_version()}")
    print("\n1. Docker")
    code, out = run(["docker", "version", "--format", "{{.Server.Version}}"])
    if code != 0:
        r.err("Docker không chạy hoặc chưa cài. Mở Docker Desktop và đợi trạng thái 'Running'.")
    else:
        r.ok(f"Docker daemon {out.splitlines()[-1]}")
        code, out = run(["docker", "compose", "version", "--short"])
        r.ok(f"Docker Compose {out}") if code == 0 else r.err("Thiếu Docker Compose v2 ('docker compose').")

    print("\n2. Tài nguyên")
    ram = total_ram_gb()
    if ram is None:
        r.warn("Không đọc được dung lượng RAM.")
    elif ram < MIN_RAM_GB:
        r.err(f"RAM {ram:.1f} GB < {MIN_RAM_GB} GB: không đủ để chạy dù đã tắt dịch vụ AI.")
    elif ram < WARN_RAM_GB:
        r.warn(f"RAM {ram:.1f} GB: chạy được nhưng chậm. Tắt dịch vụ AI khi không cần: docker compose stop ollama qdrant rag-service; đóng ứng dụng nặng khác")
    else:
        r.ok(f"RAM {ram:.1f} GB")
    free = shutil.disk_usage(ROOT).free / 2**30
    (r.ok if free >= MIN_DISK_GB else r.err)(f"Đĩa trống {free:.1f} GB" + ("" if free >= MIN_DISK_GB else f" < {MIN_DISK_GB} GB (image + mô hình AI)"))

    print("\n3. Cổng sẽ được dùng")
    busy = [p for p in sorted({p for t in texts for p in extract_ports(t)}) if not port_free(p)]
    if busy:
        r.err("Cổng đang bị chiếm: " + ", ".join(map(str, busy)) + " (tắt ứng dụng đang dùng hoặc đổi cổng trong .env)")
    else:
        r.ok("Các cổng cần thiết đều trống")

    print("\n4. Cấu hình")
    env_file = ROOT / "infrastructure" / ".env"
    if not env_file.exists():
        r.err("Thiếu infrastructure/.env  ->  cp infrastructure/.env.example infrastructure/.env")
    else:
        r.ok("infrastructure/.env")
        if "change_me" in env_file.read_text(encoding="utf-8", errors="ignore"):
            r.warn("Còn giá trị '*_change_me' trong .env: chỉ chấp nhận khi demo, KHÔNG dùng cho môi trường thật.")
    if args.paas and not os.environ.get("PLATFORM_SECRET_KEY") and "PLATFORM_SECRET_KEY=" not in (env_file.read_text(encoding="utf-8", errors="ignore") if env_file.exists() else ""):
        r.err('Thiếu PLATFORM_SECRET_KEY (bắt buộc cho PaaS). Sinh: python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"')
    model = resolve("${OLLAMA_CHAT_MODEL:-qwen2.5:1.5b}")
    if model.startswith("qwen2.5:3b"):
        r.warn("qwen2.5:3b theo Qwen Research License (phi thương mại, không thuộc OSI). Dùng qwen2.5:1.5b hoặc qwen2.5:7b.")

    if args.check_images:
        print("\n5. Image có tồn tại trên registry không (docker manifest inspect)")
        images = sorted({i for t in texts for i in extract_images(t)})
        for img in images:
            code, out = run(["docker", "manifest", "inspect", img], timeout=60)
            (r.ok if code == 0 else r.err)(img + ("" if code == 0 else "  <- KHÔNG TÌM THẤY tag (đặt biến *_IMAGE trong .env để dùng tag khác)"))
        if not images:
            r.warn("Không đọc được danh sách image.")

    print(f"\nKết quả: {r.errors} lỗi, {r.warnings} cảnh báo.")
    return 1 if r.errors else 0


if __name__ == "__main__":
    sys.exit(main())
