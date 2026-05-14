"""Smoke: /solve_v2 still mounts and responds with DATABASE_URL empty.

We don't drive a full streaming run here (that's TAG-58's contract); we
verify the route exists, the app boots clean with no DB, and the shutdown
handler can run without an open pool.
"""

from __future__ import annotations

import pytest

from agent_search.agent_v2.db import pool as pool_mod


def test_app_has_solve_v2_route(app):
    paths = {getattr(r, "path", None) for r in app.routes}
    assert "/solve_v2" in paths


@pytest.mark.asyncio
async def test_shutdown_handler_closes_pool_noop(app):
    """Pool was never opened; shutdown still completes cleanly."""
    pool_mod._pool = None
    handlers = app.router.on_shutdown
    assert handlers, "expected on_shutdown handler registered by mount_v2"
    for h in handlers:
        await h()
    assert pool_mod._pool is None


@pytest.mark.asyncio
async def test_shutdown_handler_closes_open_pool(app, monkeypatch):
    """Shutdown calls pool.close() and resets the singleton."""
    from unittest.mock import AsyncMock, MagicMock

    fake_pool = MagicMock(name="asyncpg_pool")
    fake_pool.close = AsyncMock()
    pool_mod._pool = fake_pool

    for h in app.router.on_shutdown:
        await h()

    fake_pool.close.assert_awaited_once()
    assert pool_mod._pool is None
