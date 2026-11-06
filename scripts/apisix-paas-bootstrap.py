#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""
Nạp cấu hình APISIX (chế độ etcd) qua Admin API. Idempotent (PUT). Chỉ dùng thư viện chuẩn + PyYAML.

  1. Chuyển các route/plugin_config CŨ trong core/gateway/apisix.yaml (standalone) sang etcd.
  2. consumer_groups theo gói (plan-free, plan-pro): giới hạn tốc độ + hạn mức ngày (Redis dùng chung).
  3. Route PaaS:
       POST /v1/data      : API key -> Hasura (Lua gắn tenant/role từ Consumer)
       ANY  /platform/*   : platform-api (Developer Portal gọi; JWT do chính service kiểm tra)
  4. global_rule: metric Prometheus theo consumer; http-logger -> platform-api (đo đếm) nếu có EVENT_DISPATCHER_SECRET;
     clickhouse-logger nếu có CLICKHOUSE_ENDPOINT.

Biến môi trường: APISIX_ADMIN_URL (http://localhost:9180), APISIX_ADMIN_KEY, REDIS_HOST (valkey - máy chủ tương thích giao thức Redis, giấy phép BSD),
  PLATFORM_API_UPSTREAM (platform-api:8090), HASURA_UPSTREAM (hasura:8080), CLICKHOUSE_ENDPOINT/_USER/_PASSWORD/_DB/_TABLE.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

import yaml

ADMIN = os.environ.get("APISIX_ADMIN_URL", "http://localhost:9180").rstrip("/") + "/apisix/admin"
KEY = os.environ.get("APISIX_ADMIN_KEY", "change_me_admin_key")
REDIS = os.environ.get("REDIS_HOST", "valkey")
PLATFORM_UP = os.environ.get("PLATFORM_API_UPSTREAM", "platform-api:8090")
HASURA_UP = os.environ.get("HASURA_UPSTREAM", "hasura:8080")
ROOT = Path(__file__).resolve().parent.parent
LUA = (ROOT / "core/gateway/paas/api-key-to-hasura.lua").read_text(encoding="utf-8")
STANDALONE = ROOT / "core/gateway/apisix.yaml"
PLANS = {                           # (req/giây, burst, hạn mức/ngày) - đếm chung qua Redis; GIỮ KHỚP platform_api/config.py
    "plan-free": (10, 20, 10_000),
    "plan-pro": (100, 200, 1_000_000),
}


def put(resource: str, rid: str, body: dict) -> None:
    req = urllib.request.Request(f"{ADMIN}/{resource}/{rid}", data=json.dumps(body).encode(), method="PUT",
                                 headers={"X-API-KEY": KEY, "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=20).read()
    except urllib.error.HTTPError as e:
        sys.exit(f"PUT {resource}/{rid} -> HTTP {e.code}: {e.read().decode()[:300]}")
    print(f"ok  {resource}/{rid}")


def migrate_standalone() -> None:
    doc = yaml.safe_load(STANDALONE.read_text(encoding="utf-8")) or {}
    for res in ("upstreams", "services", "plugin_configs", "global_rules", "consumer_groups"):
        for item in doc.get(res, []) or []:
            body = dict(item); rid = str(body.pop("id"))
            put(res, rid, body)
    for r in doc.get("routes", []) or []:
        body = dict(r); rid = str(body.pop("id"))
        put("routes", rid, body)


def paas_resources() -> None:
    for gid, (rate, burst, daily) in PLANS.items():
        put("consumer_groups", gid, {"plugins": {
            "limit-req": {"rate": rate, "burst": burst, "key_type": "var", "key": "consumer_name", "rejected_code": 429},
            "limit-count": {"count": daily, "time_window": 86400, "key_type": "var", "key": "consumer_name",
                            "rejected_code": 429, "policy": "redis", "redis_host": REDIS,
                            "show_limit_quota_header": True}}})
    put("routes", "paas-data-api", {
        "uri": "/v1/data", "methods": ["POST", "OPTIONS"], "priority": 20,
        "plugins": {
            "key-auth": {"header": "X-API-Key"},
            "proxy-rewrite": {"uri": "/v1/graphql"},
            "serverless-post-function": {"phase": "access", "functions": [LUA]}},
        "upstream": {"type": "roundrobin", "nodes": {HASURA_UP: 1}, "timeout": {"connect": 5, "send": 30, "read": 30}}})
    put("routes", "paas-platform-api", {
        "uri": "/platform/*", "priority": 20,
        "plugins": {"proxy-rewrite": {"regex_uri": ["^/platform/(.*)", "/$1"]},
                    "cors": {"allow_origins": os.environ.get("PORTAL_ORIGIN", "http://localhost:3100"),
                             "allow_methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "allow_headers": "Authorization,Content-Type"}},
        "upstream": {"type": "roundrobin", "nodes": {PLATFORM_UP: 1}}})
    plugins = {"prometheus": {"prefer_name": True}}
    if os.environ.get("CLICKHOUSE_ENDPOINT"):
        plugins["clickhouse-logger"] = {
            "endpoint_addr": os.environ["CLICKHOUSE_ENDPOINT"], "user": os.environ.get("CLICKHOUSE_USER", "default"),
            "password": os.environ.get("CLICKHOUSE_PASSWORD", ""), "database": os.environ.get("CLICKHOUSE_DB", "default"),
            "logtable": os.environ.get("CLICKHOUSE_TABLE", "gateway_logs"), "batch_max_size": 100}
    secret = os.environ.get("EVENT_DISPATCHER_SECRET")
    if secret:     # đo đếm sử dụng: log theo lô (không chứa nội dung request) -> platform-api -> platform.usage_daily
        plugins["http-logger"] = {
            "uri": os.environ.get("USAGE_INGEST_URL", f"http://{PLATFORM_UP}/internal/usage"),
            "auth_header": f"Bearer {secret}", "timeout": 3, "batch_max_size": 200, "inactive_timeout": 5,
            "include_req_body": False,
            "log_format": {"consumer": "$consumer_name", "status": "$status", "bytes": "$bytes_sent",
                           "route": "$route_id", "time": "$time_iso8601"}}
    put("global_rules", "observability", {"plugins": plugins})


if __name__ == "__main__":
    migrate_standalone()
    paas_resources()
    print("Hoàn tất.")
