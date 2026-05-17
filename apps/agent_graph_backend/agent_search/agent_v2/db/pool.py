# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Process-lifetime asyncpg pool.

Lazy: not opened until the first `get_pool()` call. This keeps `/solve_v2`
runnable with `DATABASE_URL=""` for environments that don't yet have a
Postgres dependency (e.g. local dev with fake LLM and no corpus).

Bounded: `min_size`/`max_size` come from Settings and default to 1/10.

The pool is module-global rather than attached to `app.state` so that
unit tests can monkeypatch `_pool` directly without spinning up a full
FastAPI app.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ..config import settings as default_settings

if TYPE_CHECKING:
    import asyncpg


log = logging.getLogger(__name__)

# Module-global singleton. Tests may set this to None (or a stub) directly.
_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    """Return the singleton asyncpg pool, opening it on first use.

    Raises:
        RuntimeError: if `DATABASE_URL` is empty.
    """
    global _pool
    if _pool is not None:
        return _pool

    # Import asyncpg lazily so the service can boot with no DB driver.
    import asyncpg

    s = default_settings
    s.require_db()
    log.info(
        "asyncpg: opening pool (min=%d max=%d timeout=%.1fs database_url_set=%s)",
        s.db_pool_min_size,
        s.db_pool_max_size,
        s.db_pool_timeout_s,
        bool(s.database_url),
    )
    _pool = await asyncpg.create_pool(
        dsn=s.database_url,
        min_size=s.db_pool_min_size,
        max_size=s.db_pool_max_size,
        timeout=s.db_pool_timeout_s,
        # Disable prepared-statement caching for multi-tenant safety:
        # prevents a poisoned cached plan from leaking across acquires
        # (relevant if a pgbouncer is ever placed in front of us).
        statement_cache_size=0,
    )
    return _pool


async def close_pool() -> None:
    """Close the pool if it was opened. Idempotent."""
    global _pool
    if _pool is None:
        return
    try:
        await _pool.close()
    finally:
        _pool = None
        log.info("asyncpg: pool closed")


__all__ = ["get_pool", "close_pool"]
