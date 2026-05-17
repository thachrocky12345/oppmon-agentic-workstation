# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Thin asyncpg query helpers with a read-only write-guard.

All three helpers assert that the SQL string starts with `SELECT` unless
the caller passes `_allow_write=True`. TAG-52..63 are all read-only;
the guard is a guardrail against accidental writes in downstream code.

These helpers acquire and release a connection per call. For multi-statement
transactions, acquire from `get_pool()` directly:

    async with (await get_pool()).acquire() as conn:
        async with conn.transaction():
            await conn.execute(...)
            await conn.execute(...)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .pool import get_pool

if TYPE_CHECKING:
    from asyncpg import Record


def _assert_read_only(sql: str, allow_write: bool) -> None:
    """Reject non-SELECT SQL unless the caller opts in via `_allow_write=True`."""
    if allow_write:
        return
    head = sql.lstrip().upper()
    if not head.startswith("SELECT"):
        raise ValueError(
            "agent_search.db: refusing to run non-SELECT SQL without _allow_write=True. "
            "Pass _allow_write=True only when you have audited the query."
        )


async def pg_fetch_one(
    sql: str,
    *params: Any,
    _allow_write: bool = False,
) -> Record | None:
    """Run `sql` and return the first row (or None)."""
    _assert_read_only(sql, _allow_write)
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(sql, *params)


async def pg_fetch_all(
    sql: str,
    *params: Any,
    _allow_write: bool = False,
) -> list[Record]:
    """Run `sql` and return all rows."""
    _assert_read_only(sql, _allow_write)
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(sql, *params)


async def pg_execute(
    sql: str,
    *params: Any,
    _allow_write: bool = False,
) -> str:
    """Run `sql` and return the status tag (e.g. 'UPDATE 1'). Read-only by default."""
    _assert_read_only(sql, _allow_write)
    pool = await get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(sql, *params)


__all__ = ["pg_fetch_one", "pg_fetch_all", "pg_execute"]
