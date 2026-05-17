# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-62 — ``run_hybrid_solve`` policy tests.

Three contract assertions from the ticket:

  1. Corpus fully answers every sub-question -> web is **not** called.
  2. Corpus leaves any sub-question UNANSWERED -> web **is** called.
  3. When web is called, the merged final answer carries citations
     from both sources (``[[doc_id:chunk_id]]`` and ``[N]`` / URL).

We drive :func:`run_hybrid_solve` with:
  * A :class:`FakeLLMClient` scripted for both planners (corpus turn
    sequence first, then web turn sequence if fall-through fires).
  * A :class:`StubCorpus` mirroring the TAG-61 test helper.
  * A monkeypatched :func:`run_web_solve` that counts invocations and
    yields a tiny synthetic event stream — we are testing the
    *decision*, not the web planner internals (that's TAG-58).
"""

from __future__ import annotations

import re
from typing import Any

import pytest

from agent_search.agent_v2.api.solve_request import ChatMessage, SolveRequest
from agent_search.agent_v2.auth.types import JWTClaims
from agent_search.agent_v2.config import Settings
from agent_search.agent_v2.llm.fake_client import FakeLLMClient
from agent_search.agent_v2.orchestrator import hybrid_mode
from agent_search.agent_v2.orchestrator.hybrid_mode import run_hybrid_solve
from agent_search.agent_v2.rag.corpus_search import CorpusHit


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


class StubCorpus:
    """Records every ``.search()`` call and returns canned hits."""

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


def _make_user(tenant_id: str = "tenant-A") -> JWTClaims:
    return JWTClaims(
        sub="user-1",
        tenant_id=tenant_id,
        role="MEMBER",
        email="u@example.test",
        exp=9_999_999_999,
        iat=1_700_000_000,
    )


def _make_request(question: str) -> SolveRequest:
    # Hybrid mode requires both grounding sources.
    return SolveRequest(
        messages=[ChatMessage(role="user", content=question)],
        collection_ids=["col-1"],
        model="fake-model",
        provider="fake",
        enable_tools=True,
        web_fallback=True,
    )


def _make_hit(*, doc_id: str, chunk_id: str, text: str) -> CorpusHit:
    return CorpusHit(
        doc_id=doc_id,
        chunk_id=chunk_id,
        collection_id="col-1",
        score=0.9,
        text=text,
        title=f"{doc_id}.pdf",
        source_url=None,
        metadata={},
    )


def _settings() -> Settings:
    """Loop budgets tight enough to keep tests sub-second."""
    s = Settings()
    s.planner_max_iterations = 4
    s.tool_dispatch_max_parallel = 4
    s.tool_dispatch_timeout_s = 5.0
    s.rag_top_k = 4
    return s


async def _collect(gen) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    async for ev in gen:
        out.append(ev)
    return out


def _final_answer(events: list[dict[str, Any]]) -> str:
    for ev in reversed(events):
        resp = ev.get("response") or {}
        if resp.get("type") == "planner" and resp.get("state") == "END":
            return str(resp.get("response", ""))
    return ""


class _WebMockState:
    """Holds invocation count + answer text for the mocked web planner."""

    def __init__(self, answer: str) -> None:
        self.calls = 0
        self.answer = answer


def _install_web_mock(monkeypatch: pytest.MonkeyPatch, answer: str) -> _WebMockState:
    """Replace :func:`run_web_solve` with a counter that yields a fake stream.

    The fake stream mirrors the real shape — opening planner_event,
    one searcher_event, terminal end_event — so the merge path in
    :func:`run_hybrid_solve` exercises its template-cloning logic.
    """
    state = _WebMockState(answer=answer)

    async def fake_web_solve(*, request, llm, req, config=None):  # type: ignore[no-untyped-def]
        state.calls += 1
        # Minimal viable shape — only the END frame matters for the
        # merge assertion. The terminal frame carries the canned
        # ``answer`` so the citation regex test can find a [N] marker.
        yield {
            "response": {
                "type": "planner",
                "state": "streaming",
                "response": "",
                "nodes": {},
                "adjacency_list": {},
                "adj": {},
                "inner_steps": [],
                "references": {},
            },
            "current_node": None,
        }
        yield {
            "response": {
                "type": "planner",
                "state": "END",
                "response": state.answer,
                "nodes": {},
                "adjacency_list": {},
                "adj": {},
                "inner_steps": [],
                "references": {},
            },
            "current_node": None,
        }

    monkeypatch.setattr(hybrid_mode, "run_web_solve", fake_web_solve)
    return state


# ----------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hybrid_all_answered_does_not_call_web(monkeypatch):
    """Risk: hybrid fans out to web even when corpus suffices.

    Mitigation: assert the web mock's call count stays at zero when
    every sub-question is OK and the corpus answer contains citations.
    """
    state = _install_web_mock(monkeypatch, answer="should never be used [1]")

    hits = [_make_hit(doc_id="doc1", chunk_id="c1", text="Policy X allows.")]
    corpus = StubCorpus({"Policy X": hits})
    llm = FakeLLMClient.scripted(
        [
            # Corpus planner turns:
            {
                "tool_calls": [
                    {"name": "add_node", "args": {"question": "Policy X"}}
                ],
            },
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {"node_id": "n1", "question": "Policy X"},
                    }
                ],
            },
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {
                            "answer": "Policy X allows extensions [[doc1:c1]].",
                        },
                    }
                ],
            },
        ]
    )

    events = await _collect(
        run_hybrid_solve(
            request=None,  # type: ignore[arg-type]
            user=_make_user(),
            llm=llm,
            req=_make_request("Policy X"),
            corpus=corpus,
            config=_settings(),
        )
    )

    assert state.calls == 0, (
        f"web planner must NOT be called when corpus fully answers; "
        f"got {state.calls} calls"
    )
    final = _final_answer(events)
    assert "[[doc1:c1]]" in final
    # The merged web answer must NOT appear — corpus was sufficient.
    assert state.answer not in final


@pytest.mark.asyncio
async def test_hybrid_unanswered_triggers_web_call(monkeypatch):
    """One UNANSWERED sub-question -> web planner IS called once."""
    state = _install_web_mock(
        monkeypatch, answer="The colour was blue per https://x.test [1]"
    )

    hits = [_make_hit(doc_id="doc1", chunk_id="c1", text="X happened in 1969.")]
    # First sub-Q hits, second misses (empty -> UNANSWERED via rag_tools).
    corpus = StubCorpus({"When did X happen?": hits})
    llm = FakeLLMClient.scripted(
        [
            {
                "tool_calls": [
                    {
                        "name": "add_node",
                        "args": {"question": "When did X happen?"},
                    },
                    {
                        "name": "add_node",
                        "args": {"question": "What colour was X?"},
                    },
                ],
            },
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {
                            "node_id": "n1",
                            "question": "When did X happen?",
                        },
                    },
                    {
                        "name": "search_corpus_node",
                        "args": {
                            "node_id": "n2",
                            "question": "What colour was X?",
                        },
                    },
                ],
            },
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {
                            "answer": (
                                "X happened in 1969 [[doc1:c1]]. "
                                "Colour: UNANSWERED."
                            ),
                        },
                    }
                ],
            },
        ]
    )

    events = await _collect(
        run_hybrid_solve(
            request=None,  # type: ignore[arg-type]
            user=_make_user(),
            llm=llm,
            req=_make_request("When did X happen and what colour was X?"),
            corpus=corpus,
            config=_settings(),
        )
    )

    assert state.calls == 1, (
        f"web planner must be called exactly once when any sub-question "
        f"is UNANSWERED; got {state.calls}"
    )
    final = _final_answer(events)
    # Merge sanity: the web mock's answer is part of the final string.
    assert state.answer in final


@pytest.mark.asyncio
async def test_hybrid_citations_from_both_sources_present(monkeypatch):
    """Merged final answer carries BOTH ``[[doc:chunk]]`` and ``[N]`` markers.

    The ticket explicitly says we do NOT unify the two citation
    formats. The web UI renders both. The regex below mirrors the
    spec table verbatim.
    """
    _install_web_mock(
        monkeypatch,
        answer="Per recent news, the colour was blue [1].",
    )

    hits = [_make_hit(doc_id="doc1", chunk_id="c1", text="X happened in 1969.")]
    corpus = StubCorpus({"When did X happen?": hits})
    llm = FakeLLMClient.scripted(
        [
            {
                "tool_calls": [
                    {
                        "name": "add_node",
                        "args": {"question": "When did X happen?"},
                    },
                    {
                        "name": "add_node",
                        "args": {"question": "What colour was X?"},
                    },
                ],
            },
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {
                            "node_id": "n1",
                            "question": "When did X happen?",
                        },
                    },
                    {
                        "name": "search_corpus_node",
                        "args": {
                            "node_id": "n2",
                            "question": "What colour was X?",
                        },
                    },
                ],
            },
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {
                            "answer": (
                                "X happened in 1969 [[doc1:c1]]. "
                                "Colour: UNANSWERED."
                            ),
                        },
                    }
                ],
            },
        ]
    )

    events = await _collect(
        run_hybrid_solve(
            request=None,  # type: ignore[arg-type]
            user=_make_user(),
            llm=llm,
            req=_make_request("When did X happen and what colour was X?"),
            corpus=corpus,
            config=_settings(),
        )
    )

    final = _final_answer(events)
    # Corpus citation format from TAG-61.
    assert re.search(r"\[\[\w+:\w+\]\]", final), (
        f"missing corpus citation marker [[doc:chunk]]: {final!r}"
    )
    # Web citation format from the web planner.
    assert re.search(r"\[\d+\]", final), (
        f"missing web citation marker [N]: {final!r}"
    )
