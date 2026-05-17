# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Tests for `agent_v2.db.pool` — lazy singleton + lifecycle."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from agent_search.agent_v2.config import Settings
from agent_search.agent_v2.db import pool as pool_mod


def test_require_db_raises_when_dsn_empty():
    s = Settings(database_url="")
    with pytest.raises(RuntimeError, match="DATABASE_URL not set"):
        s.require_db()


def test_require_db_passes_when_dsn_set():
    s = Settings(database_url="postgresql://u:p@h:5432/d")
    s.require_db()  # must not raise


@pytest.mark.asyncio
async def test_get_pool_raises_when_settings_have_no_dsn(monkeypatch):
    # Force the module-level settings.database_url to "" for this test
    from agent_search.agent_v2 import config as config_mod

    monkeypatch.setattr(config_mod.settings, "database_url", "")
    with pytest.raises(RuntimeError, match="DATABASE_URL not set"):
        await pool_mod.get_pool()


@pytest.mark.asyncio
async def test_get_pool_is_idempotent(monkeypatch):
    """Second call returns the same pool object (no re-open)."""
    from agent_search.agent_v2 import config as config_mod

    monkeypatch.setattr(
        config_mod.settings, "database_url", "postgresql://u:p@h:5432/d"
    )

    fake_pool = MagicMock(name="asyncpg_pool")
    create_pool_mock = AsyncMock(return_value=fake_pool)

    with patch("asyncpg.create_pool", new=create_pool_mock):
        p1 = await pool_mod.get_pool()
        p2 = await pool_mod.get_pool()

    assert p1 is p2 is fake_pool
    create_pool_mock.assert_awaited_once()  # only ONE create


@pytest.mark.asyncio
async def test_get_pool_passes_settings_to_create_pool(monkeypatch):
    """create_pool is called with the settings-derived kwargs."""
    from agent_search.agent_v2 import config as config_mod

    monkeypatch.setattr(
        config_mod.settings, "database_url", "postgresql://u:p@host:5432/d"
    )
    monkeypatch.setattr(config_mod.settings, "db_pool_min_size", 2)
    monkeypatch.setattr(config_mod.settings, "db_pool_max_size", 7)
    monkeypatch.setattr(config_mod.settings, "db_pool_timeout_s", 3.5)

    fake_pool = MagicMock(name="asyncpg_pool")
    create_pool_mock = AsyncMock(return_value=fake_pool)

    with patch("asyncpg.create_pool", new=create_pool_mock):
        await pool_mod.get_pool()

    create_pool_mock.assert_awaited_once()
    kwargs = create_pool_mock.call_args.kwargs
    assert kwargs["dsn"] == "postgresql://u:p@host:5432/d"
    assert kwargs["min_size"] == 2
    assert kwargs["max_size"] == 7
    assert kwargs["timeout"] == 3.5
    # Multi-tenant safety — prepared-statement cache disabled.
    assert kwargs["statement_cache_size"] == 0


@pytest.mark.asyncio
async def test_close_pool_no_op_when_unopened():
    """close_pool on a never-opened pool does nothing."""
    pool_mod._pool = None
    await pool_mod.close_pool()  # must not raise


@pytest.mark.asyncio
async def test_close_pool_closes_and_resets():
    """close_pool calls pool.close() and resets the singleton."""
    fake_pool = MagicMock(name="asyncpg_pool")
    fake_pool.close = AsyncMock()
    pool_mod._pool = fake_pool

    await pool_mod.close_pool()

    fake_pool.close.assert_awaited_once()
    assert pool_mod._pool is None


@pytest.mark.asyncio
async def test_close_pool_resets_even_on_close_error():
    """Even if pool.close() raises, the singleton is reset."""
    fake_pool = MagicMock(name="asyncpg_pool")
    fake_pool.close = AsyncMock(side_effect=RuntimeError("boom"))
    pool_mod._pool = fake_pool

    with pytest.raises(RuntimeError, match="boom"):
        await pool_mod.close_pool()

    # The finally block must have nulled it.
    assert pool_mod._pool is None
