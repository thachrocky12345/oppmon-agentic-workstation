"""Tests for `agent_v2.db.queries` — read-only write-guard + helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from agent_search.agent_v2.db import pool as pool_mod
from agent_search.agent_v2.db import queries

# ---- write-guard ---------------------------------------------------------


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE users SET name='x'",
        "DELETE FROM users",
        "INSERT INTO users VALUES (1)",
        "DROP TABLE users",
        "  update users SET x=1",  # case + whitespace
        "TRUNCATE users",
    ],
)
@pytest.mark.asyncio
async def test_pg_fetch_one_rejects_writes(sql):
    with pytest.raises(ValueError, match="non-SELECT SQL"):
        await queries.pg_fetch_one(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE users SET name='x'",
        "DELETE FROM users",
    ],
)
@pytest.mark.asyncio
async def test_pg_fetch_all_rejects_writes(sql):
    with pytest.raises(ValueError, match="non-SELECT SQL"):
        await queries.pg_fetch_all(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE users SET name='x'",
        "DELETE FROM users",
    ],
)
@pytest.mark.asyncio
async def test_pg_execute_rejects_writes(sql):
    with pytest.raises(ValueError, match="non-SELECT SQL"):
        await queries.pg_execute(sql)


# ---- happy path: SELECT goes through ------------------------------------


def _patch_pool(monkeypatch, conn_method: str, return_value):
    """Helper: install a fake pool whose acquired connection returns `return_value`."""
    fake_conn = MagicMock(name="conn")
    setattr(fake_conn, conn_method, AsyncMock(return_value=return_value))

    # Async context manager for `async with pool.acquire() as conn:`
    acquire_cm = MagicMock(name="acquire_cm")
    acquire_cm.__aenter__ = AsyncMock(return_value=fake_conn)
    acquire_cm.__aexit__ = AsyncMock(return_value=None)

    fake_pool = MagicMock(name="pool")
    fake_pool.acquire = MagicMock(return_value=acquire_cm)
    pool_mod._pool = fake_pool
    return fake_conn


@pytest.mark.asyncio
async def test_pg_fetch_one_select_reaches_db(monkeypatch):
    conn = _patch_pool(monkeypatch, "fetchrow", {"col": 1})
    row = await queries.pg_fetch_one("SELECT 1 AS col")
    assert row == {"col": 1}
    conn.fetchrow.assert_awaited_once_with("SELECT 1 AS col")


@pytest.mark.asyncio
async def test_pg_fetch_all_select_reaches_db(monkeypatch):
    conn = _patch_pool(monkeypatch, "fetch", [{"col": 1}, {"col": 2}])
    rows = await queries.pg_fetch_all("SELECT col FROM t WHERE x = $1", 7)
    assert rows == [{"col": 1}, {"col": 2}]
    conn.fetch.assert_awaited_once_with("SELECT col FROM t WHERE x = $1", 7)


@pytest.mark.asyncio
async def test_pg_execute_select_reaches_db(monkeypatch):
    conn = _patch_pool(monkeypatch, "execute", "SELECT 1")
    out = await queries.pg_execute("SELECT 1")
    assert out == "SELECT 1"
    conn.execute.assert_awaited_once_with("SELECT 1")


# ---- write-guard opt-out -------------------------------------------------


@pytest.mark.asyncio
async def test_pg_fetch_one_allow_write_reaches_db(monkeypatch):
    """_allow_write=True bypasses the guard and dispatches to fetchrow."""
    conn = _patch_pool(monkeypatch, "fetchrow", None)
    out = await queries.pg_fetch_one(
        "UPDATE users SET name=$1 WHERE id=$2 RETURNING id",
        "alice",
        1,
        _allow_write=True,
    )
    assert out is None
    conn.fetchrow.assert_awaited_once_with(
        "UPDATE users SET name=$1 WHERE id=$2 RETURNING id", "alice", 1
    )


@pytest.mark.asyncio
async def test_pg_execute_allow_write_reaches_db(monkeypatch):
    conn = _patch_pool(monkeypatch, "execute", "UPDATE 1")
    out = await queries.pg_execute(
        "UPDATE users SET name=$1", "alice", _allow_write=True
    )
    assert out == "UPDATE 1"
    conn.execute.assert_awaited_once_with("UPDATE users SET name=$1", "alice")
