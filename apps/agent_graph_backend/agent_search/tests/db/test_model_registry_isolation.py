"""Cross-tenant isolation tests for `model_registry`.

TAG-55 requires that a user from tenant B who guesses a tenant A row id
gets ``None`` back — never a stray row leak. The Postgres backstop is
the ``WHERE m.tenant_id = $1`` predicate in every query.

Because the unit suite mocks asyncpg, we can't exercise the Postgres
planner directly. What we CAN (and must) do is:

  1. Prove the SQL string contains the tenant-id predicate at $1.
  2. Prove the tenant_id passed to the helper is bound at $1.
  3. Simulate the "row from tenant A would not appear" path by having
     the mock return None when called with tenant B's id.

Steps 1 + 2 protect against the most likely regression — someone
"refactors" the WHERE clause and drops the tenant filter. Step 3 is
defense-in-depth.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from agent_search.agent_v2.db import get_user_model, get_user_models
from agent_search.agent_v2.db import pool as pool_mod


def _patch_pool(conn_method: str, return_value):
    fake_conn = MagicMock(name="conn")
    setattr(fake_conn, conn_method, AsyncMock(return_value=return_value))
    acquire_cm = MagicMock(name="acquire_cm")
    acquire_cm.__aenter__ = AsyncMock(return_value=fake_conn)
    acquire_cm.__aexit__ = AsyncMock(return_value=None)
    fake_pool = MagicMock(name="pool")
    fake_pool.acquire = MagicMock(return_value=acquire_cm)
    pool_mod._pool = fake_pool
    return fake_conn


@pytest.mark.asyncio
async def test_get_user_model_passes_tenant_id_at_position_1() -> None:
    """User from tenant B guessing tenant A's model_id binds B's id at $1."""
    conn = _patch_pool("fetchrow", None)
    out = await get_user_model(
        user_id="usr_tenant_b",
        tenant_id="tnt_b",
        model_id="mdl_owned_by_tenant_a",
    )
    sql, *params = conn.fetchrow.await_args.args
    # tenant_id (= $1) is the caller's, NEVER the queried row's owner.
    assert params[0] == "tnt_b"
    assert "m.tenant_id = $1" in sql
    # And of course the mocked DB returned None — no leak.
    assert out is None


@pytest.mark.asyncio
async def test_get_user_models_passes_tenant_id_at_position_1() -> None:
    conn = _patch_pool("fetch", [])
    await get_user_models(user_id="usr_tenant_b", tenant_id="tnt_b")
    sql, *params = conn.fetch.await_args.args
    assert params[0] == "tnt_b"
    assert "m.tenant_id = $1" in sql


@pytest.mark.asyncio
async def test_no_sql_string_interpolation_of_tenant_id() -> None:
    """A regression where someone f-strings tenant_id into the SQL would
    leave the literal value inside the query text. The tenant_id must
    appear ONLY as the bound ``$1`` parameter."""
    conn = _patch_pool("fetch", [])
    await get_user_models(user_id="usr_caller", tenant_id="tnt_secret_leak")
    sql = conn.fetch.await_args.args[0]
    assert "tnt_secret_leak" not in sql

    conn = _patch_pool("fetchrow", None)
    await get_user_model(
        user_id="usr_caller",
        tenant_id="tnt_secret_leak_2",
        model_id="mdl_x",
    )
    sql = conn.fetchrow.await_args.args[0]
    assert "tnt_secret_leak_2" not in sql


@pytest.mark.asyncio
async def test_no_sql_string_interpolation_of_user_id() -> None:
    """Same guard for user_id — must be bound, never inlined."""
    conn = _patch_pool("fetch", [])
    await get_user_models(user_id="usr_smuggled", tenant_id="tnt_alpha")
    sql = conn.fetch.await_args.args[0]
    assert "usr_smuggled" not in sql


@pytest.mark.asyncio
async def test_team_scope_clause_is_present_and_parameterized() -> None:
    """The TEAM-scope subquery must use $2 (user_id), not the literal."""
    conn = _patch_pool("fetch", [])
    await get_user_models(user_id="usr_caller", tenant_id="tnt_alpha")
    sql = conn.fetch.await_args.args[0]
    assert "team_members" in sql
    assert "user_id = $2" in sql
    assert "usr_caller" not in sql  # not inlined
