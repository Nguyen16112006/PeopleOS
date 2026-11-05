# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

"""Worker giao webhook: python -m platform_api.worker  (chạy nhiều bản sao song song được)."""
import signal
import time

from .api import build_ctx
from .config import Settings
from .webhooks import deliver_due

_stop = False


def _handle(*_):
    global _stop
    _stop = True


def main() -> None:
    signal.signal(signal.SIGTERM, _handle)
    signal.signal(signal.SIGINT, _handle)
    ctx = build_ctx(Settings.from_env())
    while not _stop:
        s = deliver_due(ctx)
        if sum(s.values()) == 0:
            time.sleep(1)
    ctx.db.close()


if __name__ == "__main__":
    main()
