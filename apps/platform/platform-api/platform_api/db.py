# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


class ApiError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


class Database:
    """Kết nối bằng role control-plane (có BYPASSRLS, CREATEROLE). Mỗi `with db.tx()` là một transaction."""

    def __init__(self, dsn: str, max_size: int = 10):
        self.pool = ConnectionPool(dsn, min_size=1, max_size=max_size, kwargs={"row_factory": dict_row}, open=True)

    @contextmanager
    def tx(self):
        with self.pool.connection() as conn:   # commit khi thoát bình thường, rollback khi có ngoại lệ
            yield conn

    def close(self):
        self.pool.close()
