#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors
"""Install PaaS-only Hasura event triggers after the shared metadata is loaded."""
import json
import os
import sys
import urllib.error
import urllib.request


HASURA_URL = os.environ.get("HASURA_URL", "http://hasura:8080").rstrip("/")
ADMIN_SECRET = os.environ["HASURA_ADMIN_SECRET"]
TRIGGERS = ("employees", "contracts", "leave_requests", "payrolls")


def create_trigger(table: str) -> None:
    name = f"platform_events_{table}"
    args = {
        "name": name,
        "table": {"schema": "public", "name": table},
        "source": "default",
        "insert": {"columns": "*"},
        "update": {"columns": "*"},
        "delete": {"columns": "*"},
        "retry_conf": {"num_retries": 5, "interval_sec": 10, "timeout_sec": 60},
        "webhook_from_env": "EVENT_DISPATCHER_URL",
        "headers": [{"name": "x-platform-secret", "value_from_env": "EVENT_DISPATCHER_SECRET"}],
        "replace": True,
    }
    request = urllib.request.Request(
        f"{HASURA_URL}/v1/metadata",
        data=json.dumps({"type": "pg_create_event_trigger", "args": args}).encode(),
        headers={
            "Content-Type": "application/json",
            "x-hasura-admin-secret": ADMIN_SECRET,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Hasura refused event trigger {name}: HTTP {error.code}: {detail}") from error
    print(f"Installed Hasura event trigger {name}")


def main() -> int:
    try:
        for table in TRIGGERS:
            create_trigger(table)
    except (OSError, RuntimeError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
