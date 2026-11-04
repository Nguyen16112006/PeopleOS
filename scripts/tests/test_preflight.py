# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
import importlib.util
import socket
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("preflight", Path(__file__).resolve().parents[1] / "preflight.py")
pf = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pf)
ROOT = Path(__file__).resolve().parents[2]


def test_resolve_uses_env_then_default():
    assert pf.resolve("${A:-x}", {}) == "x" and pf.resolve("${A:-x}", {"A": "y"}) == "y"
    assert pf.resolve("pre-${A:-1}-${B:-2}", {"B": "9"}) == "pre-1-9"


def test_images_pinned_and_resolved():
    imgs = pf.extract_images((ROOT / "infrastructure/docker-compose.yml").read_text(encoding="utf-8"), {})
    assert "ollama/ollama:0.32.6" in imgs
    assert not any(i.endswith(":latest") or ":" not in i for i in imgs), [i for i in imgs if i.endswith(":latest") or ":" not in i]
    over = pf.extract_images((ROOT / "infrastructure/docker-compose.paas.yml").read_text(encoding="utf-8"), {})
    assert "valkey/valkey:8-alpine" in over and not any("redis" in i for i in over)         # không còn Redis
    assert pf.extract_images("image: ${OLLAMA_IMAGE:-a:1}", {"OLLAMA_IMAGE": "b:2"}) == ["b:2"]


def test_ports_extracted_including_env_defaults():
    text = '''services:
  a:
    ports:
      - "3000:80"
      - "127.0.0.1:8090:8090"
      - "${KC_PORT:-8080}:8080"
      - 9091:9091/tcp
'''
    assert pf.extract_ports(text, {}) == [3000, 8090, 8080, 9091]
    assert pf.extract_ports(text, {"KC_PORT": "18080"})[2] == 18080


def test_real_compose_has_ports():
    assert len(pf.extract_ports((ROOT / "infrastructure/docker-compose.yml").read_text(encoding="utf-8"), {})) >= 3


def test_port_free_detects_listener():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); s.listen(1)
    port = s.getsockname()[1]
    assert pf.port_free(port) is False
    s.close()
    assert pf.port_free(port) is True
