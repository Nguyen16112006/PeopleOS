# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
import hashlib
import importlib.util
import tarfile
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location("make_release", Path(__file__).resolve().parents[1] / "make-release.py")
mr = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mr)


@pytest.fixture()
def tree(tmp_path):
    (tmp_path / "CHANGELOG.md").write_text("# x\n\n## [9.8.7] - 2026-01-01\n", encoding="utf-8")
    for rel, content in {
        "README.md": "hi", "scripts/run.sh": "#!/bin/sh\necho x\n", "src/a.py": "print(1)",
        "infrastructure/.env": "SECRET=1", "infrastructure/.env.example": "SECRET=changeme",
        "backups/postgres/db.dump": "dump", "backups/README.md": "ghi chú",
        "node_modules/x/index.js": "x", "apps/ui/dist/app.js": "x", "src/__pycache__/a.pyc": "x",
        "docs/out.zip": "z",
    }.items():
        f = tmp_path / rel; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(content, encoding="utf-8")
    return tmp_path


def names(tree):
    return {rel for _, rel in mr.release_files(tree)}


def test_excludes_secrets_dumps_and_build_artifacts(tree):
    n = names(tree)
    assert {"README.md", "scripts/run.sh", "src/a.py", "infrastructure/.env.example", "backups/README.md", "CHANGELOG.md"} <= n
    assert not any(x in n for x in ("infrastructure/.env", "backups/postgres/db.dump", "node_modules/x/index.js",
                                    "apps/ui/dist/app.js", "src/__pycache__/a.pyc", "docs/out.zip"))


def test_refuses_private_key(tree):
    (tree / "src" / "k.txt").write_text("-----BEGIN " + "PRIVATE KEY-----\nabc\n", encoding="utf-8")   # ghép chuỗi để chính file test không bị quét nhầm
    assert any("khóa riêng" in p for p in mr.scan_secrets(mr.release_files(tree)))
    with pytest.raises(SystemExit):
        mr.build("1.0.0", tree / "dist" / "out", tree)


def test_tar_gz_is_reproducible_and_prefixed(tree):
    a = mr.build(mr.detect_version(tree), tree / "dist" / "o1", tree)
    b = mr.build(mr.detect_version(tree), tree / "dist" / "o2", tree)
    assert a.name == "PeopleOS-9.8.7.tar.gz" and a.read_bytes() == b.read_bytes()      # tái lập bit-by-bit
    with tarfile.open(a) as t:
        members = {m.name: m for m in t.getmembers()}
    assert all(n.startswith("PeopleOS-9.8.7/") for n in members)
    assert members["PeopleOS-9.8.7/scripts/run.sh"].mode == 0o755 and members["PeopleOS-9.8.7/README.md"].mode == 0o644
    assert all(m.uid == 0 and m.mtime == mr.FIXED_MTIME for m in members.values())
    line = (tree / "dist" / "o1" / "SHA256SUMS").read_text().split()
    assert line[0] == hashlib.sha256(a.read_bytes()).hexdigest() and line[1] == a.name
