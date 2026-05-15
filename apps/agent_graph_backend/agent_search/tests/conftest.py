"""Shared pytest fixtures for agent_search tests.

The autouse session fixture sets a `fake` LLM provider and dummy API keys
BEFORE any module-level `Settings()` evaluation. Per-test fixtures override
specific env values via `monkeypatch.setenv`.
"""

from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True, scope="session")
def _set_test_env() -> None:
    """Default test env. Do not put real keys here."""
    os.environ.setdefault("LLM_PROVIDER", "fake")
    os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
    os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
    os.environ.setdefault("DATABASE_URL", "")


@pytest.fixture
def app():
    """A fresh FastAPI app with v2 mounted."""
    from fastapi import FastAPI

    from agent_search.agent_v2.app import mount_v2

    a = FastAPI()
    mount_v2(a)
    return a


@pytest.fixture(autouse=True)
def _reset_db_pool():
    """Ensure every test starts with a fresh `_pool = None` module state."""
    from agent_search.agent_v2.db import pool as pool_mod

    pool_mod._pool = None
    yield
    pool_mod._pool = None
