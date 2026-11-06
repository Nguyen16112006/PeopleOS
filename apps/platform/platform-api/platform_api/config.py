# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

import os
from dataclasses import dataclass, field

FIRST_PARTY_TENANT = "00000000-0000-0000-0000-000000000001"

DEFAULT_PLANS = {
    # giới hạn theo gói; daily_requests do APISIX consumer-group áp dụng (giữ KHỚP scripts/apisix-paas-bootstrap.py)
    "free": {"daily_requests": 10_000, "projects": 3, "api_keys": 5, "tables": 5, "columns": 20, "webhooks": 3, "custom_fields": 10},
    "pro": {"daily_requests": 1_000_000, "projects": 20, "api_keys": 50, "tables": 100, "columns": 60, "webhooks": 20, "custom_fields": 50},
}


@dataclass(frozen=True)
class Settings:
    database_url: str
    keycloak_url: str = "http://keycloak:8080"
    keycloak_admin: str = "admin"
    keycloak_admin_password: str = ""
    end_user_realm: str = "peopleos"
    platform_issuer: str = ""
    platform_jwks_url: str = ""
    apisix_admin_url: str = "http://apisix:9180"
    apisix_admin_key: str = ""
    hasura_url: str = "http://hasura:8080"
    hasura_admin_secret: str = ""
    hasura_source: str = "default"
    secret_key: str = ""          # khóa Fernet (base64 32 byte) để mã hóa secret webhook
    event_secret: str = ""        # bí mật Hasura Event Trigger gửi kèm (x-platform-secret)
    allow_private_webhooks: bool = False   # CHỈ bật khi dev/test
    allow_http_webhooks: bool = False      # CHỈ bật khi dev/test
    plans: dict = field(default_factory=lambda: DEFAULT_PLANS)

    @classmethod
    def from_env(cls) -> "Settings":
        e = os.environ
        return cls(
            database_url=e["DATABASE_URL"],
            keycloak_url=e.get("KEYCLOAK_URL", "http://keycloak:8080"),
            keycloak_admin=e.get("KEYCLOAK_ADMIN", "admin"),
            keycloak_admin_password=e.get("KEYCLOAK_ADMIN_PASSWORD", ""),
            end_user_realm=e.get("END_USER_REALM", "peopleos"),
            platform_issuer=e.get("PLATFORM_ISSUER", ""),
            platform_jwks_url=e.get("PLATFORM_JWKS_URL", ""),
            apisix_admin_url=e.get("APISIX_ADMIN_URL", "http://apisix:9180"),
            apisix_admin_key=e.get("APISIX_ADMIN_KEY", ""),
            hasura_url=e.get("HASURA_URL", "http://hasura:8080"),
            hasura_admin_secret=e.get("HASURA_ADMIN_SECRET", ""),
            hasura_source=e.get("HASURA_SOURCE", "default"),
            secret_key=e["PLATFORM_SECRET_KEY"],
            event_secret=e["EVENT_DISPATCHER_SECRET"],
            allow_private_webhooks=e.get("ALLOW_PRIVATE_WEBHOOKS", "false").lower() == "true",
            allow_http_webhooks=e.get("ALLOW_HTTP_WEBHOOKS", "false").lower() == "true",
        )
