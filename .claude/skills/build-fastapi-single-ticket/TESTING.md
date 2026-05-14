# Phase 3 — Unit Testing Patterns

`apps/agent_graph_backend/` is async FastAPI. Pytest + pytest-asyncio +
httpx (already a runtime dep). This file is the canonical pattern reference.

## One-time bootstrap (first ticket only)

If `apps/agent_graph_backend/agent_search/tests/` doesn't exist yet:

```bash
cd apps/agent_graph_backend
mkdir -p agent_search/tests
touch agent_search/tests/__init__.py
```

Create `apps/agent_graph_backend/pytest.ini`:

```ini
[pytest]
asyncio_mode = auto
testpaths = agent_search/tests
filterwarnings =
    ignore::DeprecationWarning
addopts = -ra --strict-markers
```

Add to `requirements-v2.txt` (or a sibling `requirements-test.txt`):

```
pytest>=8.0
pytest-asyncio>=0.23
pytest-cov>=5.0
```

## conftest.py skeleton

```python
# agent_search/tests/conftest.py
from __future__ import annotations
import os
import pytest

# IMPORTANT: any env override must happen BEFORE importing modules that
# read Settings() at import time. Use a session-scoped autouse fixture.
@pytest.fixture(autouse=True, scope="session")
def _set_test_env() -> None:
    os.environ.setdefault("LLM_PROVIDER", "fake")
    os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
    os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
    # never include real keys here

@pytest.fixture
def fake_llm():
    from agent_search.agent_v2.llm.fake_client import FakeLLMClient
    return FakeLLMClient()

@pytest.fixture
def app():
    """A fresh FastAPI app with v2 mounted."""
    from fastapi import FastAPI
    from agent_search.agent_v2.app import mount_v2
    a = FastAPI()
    mount_v2(a)
    return a
```

## Pattern: in-process endpoint test (httpx ASGI transport)

```python
import httpx, pytest

@pytest.mark.asyncio
async def test_healthz(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
```

## Pattern: testing SSE responses

`/solve_v2` returns `text/event-stream`. Read the frame stream and assert
on event types or payload contents.

```python
import json
import httpx
import pytest

@pytest.mark.asyncio
async def test_solve_v2_streams_final_event(app, monkeypatch):
    # Force fake LLM if app doesn't already use it
    monkeypatch.setenv("LLM_PROVIDER", "fake")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=30) as ac:
        async with ac.stream(
            "POST",
            "/solve_v2",
            json={"inputs": "hello", "web_fallback": False, "enable_tools": False, "collection_ids": []},
        ) as resp:
            assert resp.status_code == 200
            events = []
            async for line in resp.aiter_lines():
                if line.startswith("data:"):
                    events.append(json.loads(line[5:].strip()))
    assert any(e.get("type") == "final" for e in events)
```

## Pattern: AsyncMock for awaited methods

`MagicMock` will silently let `await mock.x()` return a `MagicMock` —
tests pass and you've mocked nothing. Always use `AsyncMock` for awaited
calls.

```python
from unittest.mock import AsyncMock, patch
import pytest

@pytest.mark.asyncio
async def test_planner_calls_llm():
    mock_chat = AsyncMock(return_value={"role": "assistant", "content": "ok"})
    with patch(
        "agent_search.agent_v2.llm.anthropic_client.AnthropicClient.chat",
        new=mock_chat,
    ):
        from agent_search.agent_v2.llm.anthropic_client import AnthropicClient
        client = AnthropicClient(api_key="test")
        out = await client.chat(messages=[], tools=[])
    mock_chat.assert_awaited_once()
    assert out["content"] == "ok"
```

## Pattern: Settings overrides

`Settings` is a Pydantic `BaseSettings`. Override via env in a fixture:

```python
@pytest.fixture
def settings(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("PLANNER_MAX_ITERATIONS", "3")
    # IMPORTANT: invalidate any cached singleton if you have one
    from agent_search.agent_v2 import config
    if hasattr(config, "_settings"):
        config._settings = None
    return config.Settings()
```

## Pattern: DB / asyncpg (TAG-51 onward)

```python
import pytest

@pytest.fixture
async def pg_pool(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://oppmon:oppmon@localhost:5433/oppmon_test")
    from agent_search.agent_v2.db.pool import get_pool, close_pool
    pool = await get_pool()
    yield pool
    await close_pool()

@pytest.mark.asyncio
async def test_pool_executes_select_1(pg_pool):
    async with pg_pool.acquire() as conn:
        v = await conn.fetchval("SELECT 1")
    assert v == 1
```

Tests that require Postgres should be marked and skippable when the DB
isn't running:

```python
# conftest.py
def pytest_collection_modifyitems(config, items):
    import socket
    try:
        sock = socket.create_connection(("localhost", 5433), timeout=0.5)
        sock.close()
    except OSError:
        skip = pytest.mark.skip(reason="postgres :5433 not available")
        for item in items:
            if "pg_pool" in item.fixturenames:
                item.add_marker(skip)
```

## Common pitfalls

| Pitfall | Fix |
|---|---|
| `MagicMock` for awaited coro → silently passes | Use `AsyncMock`. |
| `os.environ[...]` read at module import → fixture too late | Use `monkeypatch.setenv` in conftest's autouse session fixture, OR use `pytest_plugins = []` + early `os.environ` patching. |
| `httpx.AsyncClient(app=...)` deprecated | Use `httpx.AsyncClient(transport=httpx.ASGITransport(app=app))`. |
| SSE test hangs forever | Set `timeout=` on the AsyncClient and break out of `aiter_lines` once you see `event: final` (or after N frames). |
| Coverage doesn't include async functions | `pytest-cov` ≥ 5 + `asyncio_mode = auto` handles it natively. |
| Test pollutes global state (`config._settings`) | Reset module-level caches in fixture teardown. |

## Run commands

```bash
cd apps/agent_graph_backend

# All tests
pytest agent_search/tests/ -v

# One file
pytest agent_search/tests/test_llm_factory.py -v

# One test
pytest agent_search/tests/test_llm_factory.py::test_create_anthropic -v

# Coverage
pytest agent_search/tests/ --cov=agent_search --cov-report=term-missing --cov-report=html

# Run in Docker (if local Python env is missing deps)
docker compose --profile graph run --rm graph-agent \
    pytest /app/agent_search/tests/ -v
```
