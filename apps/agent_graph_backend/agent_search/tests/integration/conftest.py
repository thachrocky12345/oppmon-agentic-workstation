# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-64 — integration suite fixtures.

The goal of the integration suite (per the ticket) is "real DB, fake
LLM". The suite is **deterministic by default** so it runs in any
sandbox: corpus rows come from a :class:`StubCorpus` and the
``resolve_llm_spec`` call is monkeypatched at import-site to return a
`fake`-provider :class:`LLMSpec`. Tests that explicitly need Postgres
(tenant-isolation SQL checks) are gated behind the ``DATABASE_URL`` env
var via :data:`requires_postgres` and skipped otherwise.

This separation lets the contributor pipeline (`pytest agent_search/`)
stay hermetic while CI can opt into the slower DB-bound path by setting
``DATABASE_URL`` and running ``psql -f fixtures/seed_two_tenants.sql``
beforehand.
"""

from __future__ import annotations

import datetime as dt
import os
from typing import Any

import httpx
import jwt as pyjwt
import pytest
from fastapi import FastAPI
from pydantic import SecretStr

from agent_search.agent_v2 import config as config_mod
from agent_search.agent_v2.api import solve as solve_mod
from agent_search.agent_v2.app import mount_v2
from agent_search.agent_v2.llm.spec import LLMSpec
from agent_search.agent_v2.rag.corpus_search import CorpusHit

# ---------------------------------------------------------------------------
# Static test constants. The JWT secret here is intentionally fake and
# obviously-not-real so a leak into a log review reads as test scaffold,
# not a real credential.
# ---------------------------------------------------------------------------

JWT_SECRET = "tag-64-integration-test-secret-not-for-prod"
JWT_ISSUER = "oppmon"

# Tenant A — the "owner" tenant in the cross-tenant tests.
TENANT_A = "tnt_alpha"
USER_A = "usr_alice"
TEAM_A = "tm_alpha"
COLLECTION_A = "col_alpha"

# Tenant B — used to attempt a cross-tenant access against Tenant A.
TENANT_B = "tnt_beta"
USER_B = "usr_bob"
TEAM_B = "tm_beta"
COLLECTION_B = "col_beta"

MODEL_FAKE = "fake-model"
PROVIDER_FAKE = "fake"


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------


def _now() -> int:
    return int(dt.datetime.now(dt.UTC).timestamp())


def mint_jwt(
    *,
    sub: str = USER_A,
    tenant_id: str = TENANT_A,
    role: str = "MEMBER",
    secret: str = JWT_SECRET,
    issuer: str = JWT_ISSUER,
    expired: bool = False,
) -> str:
    """Issue a valid HS256 JWT in the shape :func:`verify_jwt` expects.

    Used by every test that needs a credential — ``expired=True`` lets
    the bad-JWT case avoid relying on PyJWT's signature mismatch
    branch, which is covered by the unit suite.
    """
    iat = _now() - 60
    exp = _now() - 30 if expired else _now() + 3600
    payload: dict[str, Any] = {
        "sub": sub,
        "tenantId": tenant_id,
        "role": role,
        "email": f"{sub}@example.test",
        "iat": iat,
        "exp": exp,
        "iss": issuer,
    }
    return pyjwt.encode(payload, secret, algorithm="HS256")


# ---------------------------------------------------------------------------
# StubCorpus — the in-process replacement for PgCorpusSearch.
# ---------------------------------------------------------------------------


class StubCorpus:
    """Deterministic ``CorpusSearch`` Protocol impl for integration tests.

    Behaviour mirrors the TAG-61/62 unit-test helper but with one
    additional safety check: every call is recorded with the
    ``tenant_id`` argument, so the cross-tenant test can assert that a
    Tenant-B caller never invokes ``.search()`` with ``tenant_id ==
    TENANT_A``. The Protocol method signature is identical to the
    production :class:`PgCorpusSearch`.
    """

    def __init__(
        self,
        hits_by_query: dict[str, list[CorpusHit]] | None = None,
        *,
        default: list[CorpusHit] | None = None,
    ) -> None:
        self._hits = hits_by_query or {}
        self._default = default or []
        self.calls: list[dict[str, Any]] = []

    async def search(
        self,
        query: str,
        *,
        tenant_id: str,
        collection_ids: list[str],
        top_k: int = 8,
    ) -> list[CorpusHit]:
        self.calls.append(
            {
                "query": query,
                "tenant_id": tenant_id,
                "collection_ids": collection_ids,
                "top_k": top_k,
            }
        )
        return self._hits.get(query, self._default)


def make_hit(
    *,
    doc_id: str,
    chunk_id: str,
    text: str,
    collection_id: str = COLLECTION_A,
) -> CorpusHit:
    """Build a deterministic :class:`CorpusHit` for a seeded answer."""
    return CorpusHit(
        doc_id=doc_id,
        chunk_id=chunk_id,
        collection_id=collection_id,
        score=0.9,
        text=text,
        title=f"{doc_id}.pdf",
        source_url=None,
        metadata={},
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_spec() -> LLMSpec:
    """The keyless ``fake`` LLMSpec the resolver returns by default."""
    return LLMSpec(
        provider="fake",
        model=MODEL_FAKE,
        api_key=SecretStr(""),
    )


@pytest.fixture
def patched_app(
    monkeypatch: pytest.MonkeyPatch,
    fake_spec: LLMSpec,
) -> FastAPI:
    """A fresh FastAPI app with ``/solve`` mounted and the resolver patched.

    The patch is at the import site (``solve_mod.resolve_llm_spec``)
    because Python rebinds names at import; patching
    ``auth.resolve.resolve_llm_spec`` after import is a no-op.
    """
    monkeypatch.setattr(config_mod.settings, "enable_solve_v3", True)
    monkeypatch.setattr(config_mod.settings, "jwt_secret", JWT_SECRET)
    monkeypatch.setattr(config_mod.settings, "jwt_issuer", JWT_ISSUER)
    # TAG-65: check_required_env() runs at mount_v2() time and fails closed
    # on any empty required var. Populate test-only sentinels so the app
    # boots; specific tests override as needed.
    monkeypatch.setattr(
        config_mod.settings, "tag_encryption_master_key", "test-master-key"
    )
    monkeypatch.setattr(config_mod.settings, "database_url", "postgresql://test")
    monkeypatch.setattr(config_mod.settings, "openai_api_key", "test-openai-key")
    # The cached Settings() was built at module-import time, before the
    # session-autouse fixture set LLM_PROVIDER=fake. Force it here so
    # /solve_v2 (which calls create_llm_client()) doesn't hit the
    # anthropic-credentials branch.
    monkeypatch.setattr(config_mod.settings, "llm_provider", "fake")

    # sse_starlette has a process-wide ``AppStatus.should_exit_event``
    # that gets bound to the first event loop that touches it. Across
    # pytest-asyncio tests each test runs on a fresh loop, so the
    # singleton must be reset between tests or the second test in the
    # module raises "Event ... is bound to a different event loop".
    try:
        from sse_starlette.sse import AppStatus  # type: ignore[attr-defined]

        AppStatus.should_exit_event = None  # type: ignore[assignment]
    except (ImportError, AttributeError):  # pragma: no cover — version drift
        pass

    async def _ok_resolve(user, *, model, provider):  # noqa: ARG001
        return fake_spec

    monkeypatch.setattr(solve_mod, "resolve_llm_spec", _ok_resolve)

    app = FastAPI()
    mount_v2(app)
    return app


@pytest.fixture
def stub_corpus_factory(monkeypatch: pytest.MonkeyPatch):
    """Yield a callable that installs a :class:`StubCorpus` into the dispatcher.

    The TAG-62 dispatcher (``orchestrator.modes._build_corpus_search``)
    is the seam we patch. Returning a callable rather than a built
    instance lets each test customise the canned hits before the
    request flies.
    """
    from agent_search.agent_v2.orchestrator import modes as modes_mod

    def _install(corpus: StubCorpus) -> StubCorpus:
        monkeypatch.setattr(
            modes_mod, "_build_corpus_search", lambda config=None: corpus
        )
        return corpus

    return _install


async def make_client(app: FastAPI) -> httpx.AsyncClient:
    """Async HTTP client speaking to the in-process ASGI app."""
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


def body(**overrides: Any) -> dict[str, Any]:
    """Default ``/solve`` request body shape; overrides win."""
    base: dict[str, Any] = {
        "messages": [{"role": "user", "content": "what is 2+2?"}],
        "model": MODEL_FAKE,
        "provider": PROVIDER_FAKE,
        "enableTools": False,
        "webFallback": True,
        "collectionIds": [],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# Postgres gating
# ---------------------------------------------------------------------------


def _postgres_available() -> bool:
    """True iff ``DATABASE_URL`` is set to a non-empty value."""
    return bool(os.getenv("DATABASE_URL", "").strip())


requires_postgres = pytest.mark.skipif(
    not _postgres_available(),
    reason="Postgres-bound integration test — set DATABASE_URL to enable.",
)


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


async def collect_sse_data(response: httpx.Response) -> list[dict[str, Any]]:
    """Drain a streaming SSE response into a list of decoded JSON frames."""
    import json

    frames: list[dict[str, Any]] = []
    async for line in response.aiter_lines():
        if not line.startswith("data:"):
            continue
        raw = line[len("data:") :].strip()
        if not raw:
            continue
        try:
            frames.append(json.loads(raw))
        except json.JSONDecodeError:
            # The wire contract is JSON-per-frame; a non-JSON frame is
            # a defect. Re-raise via assertion in the test, not here.
            frames.append({"_raw": raw})
    return frames


def event_types(frames: list[dict[str, Any]]) -> list[str]:
    """Project a list of SSE frames to their ``response.type`` / ``state``.

    Used by the snapshot test — the snapshot captures the SHAPE of the
    stream (types + states), not the full content, so minor planner
    rewording doesn't churn the file.
    """
    out: list[str] = []
    for fr in frames:
        if "error" in fr:
            out.append("error")
            continue
        resp = fr.get("response") or {}
        t = resp.get("type") or "unknown"
        s = resp.get("state") or "unknown"
        out.append(f"{t}:{s}")
    return out


__all__ = [
    "COLLECTION_A",
    "COLLECTION_B",
    "JWT_ISSUER",
    "JWT_SECRET",
    "MODEL_FAKE",
    "PROVIDER_FAKE",
    "StubCorpus",
    "TEAM_A",
    "TEAM_B",
    "TENANT_A",
    "TENANT_B",
    "USER_A",
    "USER_B",
    "body",
    "collect_sse_data",
    "event_types",
    "fake_spec",
    "make_client",
    "make_hit",
    "mint_jwt",
    "patched_app",
    "requires_postgres",
    "stub_corpus_factory",
]
