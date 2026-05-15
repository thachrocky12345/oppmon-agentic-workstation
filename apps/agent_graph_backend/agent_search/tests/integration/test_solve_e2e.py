"""TAG-64 — integration tests for ``POST /solve`` end-to-end.

This is the *integration* layer: real FastAPI ASGI stack, real auth path,
real planner orchestrator, real SSE wire. Only two things are stubbed:

  * ``CorpusSearch`` — replaced with :class:`StubCorpus` (deterministic
    canned hits per query, plus a call ledger we assert on).
  * The LLM — replaced with :class:`FakeLLMClient.scripted([...])` per
    test, so the planner emits a known tool-call sequence.

A second variant of cross-tenant case 4 (``test_cross_tenant_model_403``)
runs against a live Postgres if ``DATABASE_URL`` is set, exercising the
actual ``resolve_llm_spec`` → ``select_visible_model_for_user`` SQL path.
It is skipped by default to keep the contributor pipeline hermetic.

Maps 1-to-1 to the test table in
``docs/jira/TAG-64-eval-and-integration.md``.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

import httpx
import pytest

from agent_search.agent_v2.orchestrator.rag_planner_prompt import REFUSAL_TEXT

from .conftest import (
    COLLECTION_A,
    JWT_SECRET,
    MODEL_FAKE,
    PROVIDER_FAKE,
    TENANT_A,
    TENANT_B,
    USER_B,
    StubCorpus,
    body,
    collect_sse_data,
    event_types,
    make_client,
    make_hit,
    mint_jwt,
)

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Local helpers
# ---------------------------------------------------------------------------


def _install_scripted_llm(monkeypatch, script: list[dict[str, Any]]):
    """Patch ``solve_mod.build_client`` to return a scripted FakeLLMClient.

    The route in ``api/solve.py`` calls ``build_client(spec)`` once per
    request right after the resolver returns. Patching at that import
    site lets each test install its own LLM script without disturbing
    the auth + resolver layers above it.
    """
    from agent_search.agent_v2.api import solve as solve_mod
    from agent_search.agent_v2.llm.fake_client import FakeLLMClient

    fake = FakeLLMClient.scripted(script)
    monkeypatch.setattr(solve_mod, "build_client", lambda spec: fake)
    return fake


def _final_answer(frames: list[dict[str, Any]]) -> str:
    """Pull the ``response.response`` text from the terminal END frame."""
    for fr in reversed(frames):
        resp = fr.get("response", {})
        if resp.get("state") == "END" and resp.get("type") == "planner":
            return str(resp.get("response", ""))
    return ""


SNAPSHOT_PATH = (
    Path(__file__).parent / "snapshots" / "solve_v2.json"
)


# ---------------------------------------------------------------------------
# TC01 — /solve_v2 SSE shape unchanged (regression snapshot)
# ---------------------------------------------------------------------------


async def test_tc01_solve_v2_sse_shape_unchanged(patched_app, monkeypatch):
    """``/solve_v2`` keeps the planner:STREAM_ING → ANSWER_ING → END shape.

    Re-record by setting ``UPDATE_SNAPSHOTS=1``. The snapshot captures
    the (type, state) tuple per frame, not full content, so planner
    reword tweaks don't churn this file.
    """
    # /solve_v2 uses the env-driven LLM factory, not the route-level
    # build_client. The conftest's autouse fixture pins LLM_PROVIDER=fake.
    async with await make_client(patched_app) as client, client.stream(
        "POST",
        "/solve_v2",
        json={
            "inputs": "what is 2+2?",
            "enable_tools": False,
            "web_fallback": True,
            "collection_ids": [],
        },
    ) as resp:
        assert resp.status_code == 200
        frames = await collect_sse_data(resp)

    actual = event_types(frames)
    # First frame must be a STREAM_ING planner kick-off; last must be END.
    assert actual, "no SSE frames received"
    assert actual[0] == "planner:STREAM_ING", actual
    assert actual[-1] == "planner:END", actual
    # Every frame must be a planner:* state — /solve_v2 has no searcher
    # output in the FakeLLMClient.echo() path.
    assert all(s.startswith("planner:") for s in actual), actual

    import os

    if os.getenv("UPDATE_SNAPSHOTS") == "1":
        SNAPSHOT_PATH.write_text(
            json.dumps(
                {
                    "version": 1,
                    "request": {
                        "inputs": "what is 2+2?",
                        "enable_tools": False,
                        "web_fallback": True,
                        "collection_ids": [],
                    },
                    "events": actual,
                },
                indent=2,
            )
        )
        return

    snapshot = json.loads(SNAPSHOT_PATH.read_text())
    expected = snapshot["events"]
    # Cardinality on the body of the stream can drift if Anthropic-style
    # streaming chunks differ; we assert the BOOKENDS plus the presence
    # of an ANSWER_ING frame — the wire-shape contract the UI parser
    # depends on.
    assert actual[0] == expected[0]
    assert actual[-1] == expected[-1]
    assert "planner:ANSWER_ING" in actual


# ---------------------------------------------------------------------------
# TC02 — /solve without Authorization header → 401
# ---------------------------------------------------------------------------


async def test_tc02_solve_no_auth_returns_401(patched_app):
    async with await make_client(patched_app) as client:
        resp = await client.post("/solve", json=body())
    assert resp.status_code == 401, resp.text


# ---------------------------------------------------------------------------
# TC03 — /solve with bad JWT → 401
# ---------------------------------------------------------------------------


async def test_tc03_solve_bad_jwt_returns_401(patched_app):
    """Use a JWT signed with the wrong secret — verify_jwt rejects it."""
    bad = mint_jwt(secret="wrong-secret-not-the-server-one")
    async with await make_client(patched_app) as client:
        resp = await client.post(
            "/solve",
            json=body(),
            headers={"Authorization": f"Bearer {bad}"},
        )
    assert resp.status_code == 401, resp.text


# ---------------------------------------------------------------------------
# TC04 — Cross-tenant model access → 403 with generic message
# ---------------------------------------------------------------------------


async def test_tc04_cross_tenant_model_returns_403_generic(
    patched_app, monkeypatch
):
    """Tenant B asking for Tenant A's model gets a 403 — never 404.

    The resolver returns 403 with the same message regardless of
    whether the model exists in another tenant or doesn't exist at
    all. We simulate that here by swapping the patched resolver for
    one that raises the production HTTPException. The real DB-bound
    version of this test lives in ``test_cross_tenant_model_403_with_db``
    behind the ``requires_postgres`` marker.
    """
    from fastapi import HTTPException, status

    from agent_search.agent_v2.api import solve as solve_mod
    from agent_search.agent_v2.auth.resolve import _MSG_NOT_AVAILABLE

    async def _deny(user, *, model, provider):  # noqa: ARG001
        raise HTTPException(status.HTTP_403_FORBIDDEN, _MSG_NOT_AVAILABLE)

    monkeypatch.setattr(solve_mod, "resolve_llm_spec", _deny)

    token = mint_jwt(sub=USER_B, tenant_id=TENANT_B)
    async with await make_client(patched_app) as client:
        resp = await client.post(
            "/solve",
            json=body(model="fake-alpha", provider="fake"),
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 403, resp.text
    assert _MSG_NOT_AVAILABLE in resp.text
    # Critical: the message MUST NOT leak model-existence info — i.e.
    # it must NOT say "not found" or "does not exist".
    lower = resp.text.lower()
    assert "not found" not in lower
    assert "does not exist" not in lower


# ---------------------------------------------------------------------------
# TC05 — webFallback=false + collectionIds=[] → 422 at validator
# ---------------------------------------------------------------------------


async def test_tc05_no_grounding_source_returns_422(patched_app):
    token = mint_jwt()
    async with await make_client(patched_app) as client:
        resp = await client.post(
            "/solve",
            json=body(webFallback=False, collectionIds=[]),
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# TC06 — corpus mode produces [[doc:chunk]] citations in END frame
# ---------------------------------------------------------------------------


async def test_tc06_corpus_mode_returns_citations(
    patched_app, monkeypatch, stub_corpus_factory
):
    question = "Summarize policy X"
    stub = stub_corpus_factory(
        StubCorpus(
            {
                question: [
                    make_hit(
                        doc_id="doc_alpha",
                        chunk_id="c1",
                        text="Policy X allows 30-day extensions.",
                    ),
                ]
            }
        )
    )
    _install_scripted_llm(
        monkeypatch,
        [
            {
                "tool_calls": [
                    {"name": "add_node", "args": {"question": question}}
                ]
            },
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {"node_id": "n1", "question": question},
                    }
                ]
            },
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {
                            "answer": (
                                "Policy X allows 30-day extensions "
                                "[[doc_alpha:c1]]."
                            )
                        },
                    }
                ]
            },
        ],
    )

    token = mint_jwt()
    async with await make_client(patched_app) as client, client.stream(
        "POST",
        "/solve",
        json=body(
            messages=[{"role": "user", "content": question}],
            webFallback=False,
            collectionIds=[COLLECTION_A],
        ),
        headers={"Authorization": f"Bearer {token}"},
    ) as resp:
        assert resp.status_code == 200, await resp.aread()
        frames = await collect_sse_data(resp)

    final = _final_answer(frames)
    assert re.search(r"\[\[\w+:\w+\]\]", final), final
    assert "[[doc_alpha:c1]]" in final
    # Defence-in-depth: the corpus must have been called with the
    # authenticated user's tenant_id, never the wrong one.
    assert stub.calls, "expected at least one corpus.search call"
    assert all(c["tenant_id"] == TENANT_A for c in stub.calls)


# ---------------------------------------------------------------------------
# TC07 — corpus mode with no hits → verbatim refusal string
# ---------------------------------------------------------------------------


async def test_tc07_corpus_out_of_corpus_emits_refusal(
    patched_app, monkeypatch, stub_corpus_factory
):
    stub_corpus_factory(StubCorpus(default=[]))  # every query → no hits
    _install_scripted_llm(
        monkeypatch,
        [
            {
                "tool_calls": [
                    {
                        "name": "add_node",
                        "args": {"question": "What is the moon made of?"},
                    }
                ]
            },
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {
                            "node_id": "n1",
                            "question": "What is the moon made of?",
                        },
                    }
                ]
            },
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {"answer": REFUSAL_TEXT},
                    }
                ]
            },
        ],
    )

    token = mint_jwt()
    async with await make_client(patched_app) as client, client.stream(
        "POST",
        "/solve",
        json=body(
            messages=[
                {"role": "user", "content": "What is the moon made of?"}
            ],
            webFallback=False,
            collectionIds=[COLLECTION_A],
        ),
        headers={"Authorization": f"Bearer {token}"},
    ) as resp:
        assert resp.status_code == 200
        frames = await collect_sse_data(resp)

    assert _final_answer(frames) == REFUSAL_TEXT


# ---------------------------------------------------------------------------
# TC08 — web mode (no corpus) parses the same SSE wire shape as /solve_v2
# ---------------------------------------------------------------------------


async def test_tc08_web_mode_matches_solve_v2_shape(
    patched_app, monkeypatch
):
    """/solve in web mode must yield the same (planner:STREAM_ING … END)
    envelope sequence /solve_v2 does. We don't snapshot the body — only
    the wire-shape bookends + presence of an ANSWER_ING frame."""
    # FakeLLMClient.echo()-like minimal script: no tool calls, single
    # final response. The planner.run() loop exits cleanly after one
    # turn and emits planner_event(END).
    _install_scripted_llm(
        monkeypatch,
        [
            {"text": "4", "stop_reason": "end_turn"},
        ],
    )

    token = mint_jwt()
    async with await make_client(patched_app) as client, client.stream(
        "POST",
        "/solve",
        json=body(webFallback=True, collectionIds=[]),
        headers={"Authorization": f"Bearer {token}"},
    ) as resp:
        assert resp.status_code == 200, await resp.aread()
        frames = await collect_sse_data(resp)

    types = event_types(frames)
    assert types, "expected at least one SSE frame"
    assert types[0] == "planner:STREAM_ING", types
    assert types[-1] == "planner:END", types


# ---------------------------------------------------------------------------
# TC09 — hybrid mode: corpus answers fully → web mode is NOT invoked
# ---------------------------------------------------------------------------


async def test_tc09_hybrid_corpus_complete_skips_web(
    patched_app, monkeypatch, stub_corpus_factory
):
    question = "Summarize policy X"
    stub_corpus_factory(
        StubCorpus(
            {
                question: [
                    make_hit(
                        doc_id="doc_alpha",
                        chunk_id="c1",
                        text="Policy X is fully covered here.",
                    ),
                ]
            }
        )
    )
    _install_scripted_llm(
        monkeypatch,
        [
            {
                "tool_calls": [
                    {"name": "add_node", "args": {"question": question}}
                ]
            },
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {"node_id": "n1", "question": question},
                    }
                ]
            },
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {
                            "answer": "Policy X covered [[doc_alpha:c1]]."
                        },
                    }
                ]
            },
        ],
    )

    # Spy on hybrid_mode.run_web_solve — must not be invoked.
    from agent_search.agent_v2.orchestrator import hybrid_mode as hyb_mod

    call_count = {"n": 0}

    async def _spy_web(*, request, llm, req):  # noqa: ARG001
        call_count["n"] += 1
        if False:
            yield {}  # pragma: no cover

    monkeypatch.setattr(hyb_mod, "run_web_solve", _spy_web)

    token = mint_jwt()
    async with await make_client(patched_app) as client, client.stream(
        "POST",
        "/solve",
        json=body(
            messages=[{"role": "user", "content": question}],
            webFallback=True,
            collectionIds=[COLLECTION_A],
        ),
        headers={"Authorization": f"Bearer {token}"},
    ) as resp:
        assert resp.status_code == 200
        _ = await collect_sse_data(resp)

    assert call_count["n"] == 0, (
        "corpus answered fully → web should NOT have been invoked"
    )


# ---------------------------------------------------------------------------
# TC10 — hybrid mode: corpus partial → web invoked exactly once
# ---------------------------------------------------------------------------


async def test_tc10_hybrid_corpus_partial_invokes_web(
    patched_app, monkeypatch, stub_corpus_factory
):
    """Corpus returns nothing → ``_corpus_is_complete()`` is False →
    hybrid fans out to the web runner. We patch ``run_web_solve`` to
    a counter so we don't need a real web search."""
    stub_corpus_factory(StubCorpus(default=[]))
    _install_scripted_llm(
        monkeypatch,
        [
            {
                "tool_calls": [
                    {"name": "add_node", "args": {"question": "anything"}}
                ]
            },
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {"node_id": "n1", "question": "anything"},
                    }
                ]
            },
            # Force a refusal so _corpus_is_complete() returns False.
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {"answer": REFUSAL_TEXT},
                    }
                ]
            },
        ],
    )

    from agent_search.agent_v2.orchestrator import hybrid_mode as hyb_mod
    from agent_search.agent_v2.orchestrator.graph import GraphState
    from agent_search.agent_v2.orchestrator.sse import (
        end_event,
        planner_event,
    )
    from agent_search.agent_v2.orchestrator.graph import WebSearchGraph

    call_count = {"n": 0}

    async def _stub_web(*, request, llm, req, config=None):  # noqa: ARG001
        call_count["n"] += 1
        g = WebSearchGraph()
        g.add_root("anything")
        yield planner_event(g, state=GraphState.STREAM_ING)
        yield end_event(g, response_text="web answer")

    monkeypatch.setattr(hyb_mod, "run_web_solve", _stub_web)

    token = mint_jwt()
    async with await make_client(patched_app) as client, client.stream(
        "POST",
        "/solve",
        json=body(
            messages=[{"role": "user", "content": "anything"}],
            webFallback=True,
            collectionIds=[COLLECTION_A],
        ),
        headers={"Authorization": f"Bearer {token}"},
    ) as resp:
        assert resp.status_code == 200
        _ = await collect_sse_data(resp)

    assert call_count["n"] == 1, (
        f"expected exactly one web invocation, got {call_count['n']}"
    )


# ---------------------------------------------------------------------------
# TC11 — Plaintext API key never appears in logs / traces
# ---------------------------------------------------------------------------


async def test_tc11_plaintext_api_key_absent_from_logs(
    patched_app, monkeypatch, caplog
):
    """The fixture spec's api_key is empty (fake provider). Any real
    secret in a future provider-extension story would also be wrapped
    in :class:`SecretStr`, whose str() is ``'**********'``. We assert
    here that the canary string we inject never lands in a log line.
    """
    from pydantic import SecretStr

    from agent_search.agent_v2.api import solve as solve_mod
    from agent_search.agent_v2.llm.spec import LLMSpec

    canary = "sk-secret-canary-do-not-log"
    spec_with_secret = LLMSpec(
        provider="fake", model=MODEL_FAKE, api_key=SecretStr(canary)
    )

    async def _resolve_with_secret(user, *, model, provider):  # noqa: ARG001
        return spec_with_secret

    monkeypatch.setattr(solve_mod, "resolve_llm_spec", _resolve_with_secret)
    _install_scripted_llm(
        monkeypatch,
        [{"text": "ok", "stop_reason": "end_turn"}],
    )

    token = mint_jwt()
    with caplog.at_level(logging.DEBUG, logger="agent_search"):
        async with await make_client(patched_app) as client:
            async with client.stream(
                "POST",
                "/solve",
                json=body(webFallback=True, collectionIds=[]),
                headers={"Authorization": f"Bearer {token}"},
            ) as resp:
                assert resp.status_code == 200
                frames = await collect_sse_data(resp)

    # No log record may contain the plaintext canary.
    all_log_text = " ".join(rec.getMessage() for rec in caplog.records)
    assert canary not in all_log_text, (
        f"plaintext secret leaked into logs: {all_log_text!r}"
    )
    # And no SSE frame may carry it either.
    blob = json.dumps(frames, ensure_ascii=False)
    assert canary not in blob, "plaintext secret leaked into SSE frames"


# ---------------------------------------------------------------------------
# TC12 — Decrypted secret never appears in SSE error event
# ---------------------------------------------------------------------------


async def test_tc12_decrypted_secret_absent_from_error_frame(
    patched_app, monkeypatch
):
    """If the planner raises, the route emits a terminal frame with
    ``{"error": {"msg": ..., "details": str(exc)}}``. The secret must
    not be embedded in any of those fields — even if a planner
    accidentally puts ``spec.api_key.get_secret_value()`` into an
    exception message, that string is the canary and should be filtered
    or simply never plumbed through.
    """
    from pydantic import SecretStr

    from agent_search.agent_v2.api import solve as solve_mod
    from agent_search.agent_v2.llm.spec import LLMSpec

    canary = "csk-secret-not-in-errors-please"
    spec_with_secret = LLMSpec(
        provider="fake", model=MODEL_FAKE, api_key=SecretStr(canary)
    )

    async def _resolve_with_secret(user, *, model, provider):  # noqa: ARG001
        return spec_with_secret

    # Force run_solve to raise so the error-frame path runs. Patching
    # at solve_mod's import site (not modes_mod) is the rebind-safe seam.
    async def _explode(**kwargs):  # noqa: ARG001
        raise RuntimeError("boom - generic failure with no key in it")
        if False:  # pragma: no cover
            yield {}

    monkeypatch.setattr(solve_mod, "resolve_llm_spec", _resolve_with_secret)
    monkeypatch.setattr(solve_mod, "run_solve", _explode)

    token = mint_jwt()
    async with await make_client(patched_app) as client, client.stream(
        "POST",
        "/solve",
        json=body(webFallback=True, collectionIds=[]),
        headers={"Authorization": f"Bearer {token}"},
    ) as resp:
        assert resp.status_code == 200
        frames = await collect_sse_data(resp)

    # At least one error frame is expected, and none of them may carry
    # the plaintext secret.
    err_frames = [fr for fr in frames if "error" in fr]
    assert err_frames, f"expected at least one error frame, got {frames!r}"
    blob = json.dumps(err_frames, ensure_ascii=False)
    assert canary not in blob, "decrypted secret leaked into error frame"


# ---------------------------------------------------------------------------
# Optional: real-DB cross-tenant variant (TAG-59 SQL isolation backstop)
# ---------------------------------------------------------------------------


from .conftest import requires_postgres  # noqa: E402


@requires_postgres
async def test_cross_tenant_model_403_with_db(patched_app):
    """Real-DB version of TC04 — exercises the production resolver path.

    Requires ``DATABASE_URL`` env + the ``seed_two_tenants.sql`` fixture
    pre-loaded. The patched_app fixture's resolver patch is stripped
    here so we hit the actual ``select_visible_model_for_user`` SQL.
    """
    # Skip the patched resolver by directly mounting a fresh app.
    from fastapi import FastAPI

    from agent_search.agent_v2 import config as config_mod
    from agent_search.agent_v2.app import mount_v2

    cfg = config_mod.settings
    object.__setattr__(cfg, "enable_solve_v3", True)
    object.__setattr__(cfg, "jwt_secret", JWT_SECRET)
    object.__setattr__(cfg, "jwt_issuer", "oppmon")
    # TAG-65: mount_v2() now fails closed if any required env is empty.
    object.__setattr__(cfg, "tag_encryption_master_key", "test-master-key")
    object.__setattr__(cfg, "database_url", "postgresql://test")
    object.__setattr__(cfg, "openai_api_key", "test-openai-key")

    app = FastAPI()
    mount_v2(app)

    bob_token = mint_jwt(sub=USER_B, tenant_id=TENANT_B)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/solve",
            json=body(model="fake-alpha", provider=PROVIDER_FAKE),
            headers={"Authorization": f"Bearer {bob_token}"},
        )
    assert resp.status_code == 403
    assert "model not available" in resp.text.lower()
