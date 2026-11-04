# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

from dataclasses import dataclass
from typing import Callable

import httpx

from .adapters import Apisix, Hasura, Keycloak
from .config import Settings
from .db import Database


@dataclass
class Ctx:
    settings: Settings
    db: Database
    keycloak: Keycloak
    apisix: Apisix
    hasura: Hasura
    http: httpx.Client                       # dùng để giao webhook
    check_url: Callable[[str], None]         # kiểm tra SSRF (có thể thay khi test)
    verify_jwt: Callable[[str], dict]
