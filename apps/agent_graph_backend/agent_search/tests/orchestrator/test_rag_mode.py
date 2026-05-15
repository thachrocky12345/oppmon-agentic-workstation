"""TAG-61 — RAG-mode planner orchestrator tests.

The four mandatory tests from the ticket (`TAG-61-rag-planner-prompt.md`):

  1. Empty corpus → refusal string (exact match).
  2. Seeded corpus → final answer carries `[[doc_id:chunk_id]]` citations.
  3. Mixed corpus (some sub-Qs hit, some empty) → UNANSWERED marker recorded.
  4. Tool list excludes the web `search_node` (negative assertion).

We drive `run_corpus_solve` with:
  * A `FakeLLMClient` scripted to emit deterministic tool-call sequences.
  * A stub `CorpusSearch` whose `.search()` returns canned `CorpusHit` lists.

This isolates the planner→tools wiring without any DB, embedding service,
or real LLM dependency.
"""

from __future__ import annotations

import re
from typing import Any

import pytest

from agent_search.agent_v2.api.solve_request import ChatMessage, SolveRequest
from agent_search.agent_v2.auth.types import JWTClaims
from agent_search.agent_v2.config import Settings
from agent_search.agent_v2.llm.fake_client import FakeLLMClient
from agent_search.agent_v2.orchestrator.modes import run_corpus_solve
from agent_search.agent_v2.orchestrator.rag_planner_prompt import (
    REFUSAL_TEXT,
    _rag_planner_system,
)
from agent_search.agent_v2.orchestrator.rag_tools import register_rag_planner_tools
from agent_search.agent_v2.rag.corpus_search import CorpusHit
from agent_search.agent_v2.tools.registry import ToolRegistry


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


class StubCorpus:
    """Implements ``CorpusSearch`` Protocol with a canned hit list per query.

    ``hits_by_query`` maps the exact query string the planner sends to a
    list of ``CorpusHit``. Queries not in the map return ``[]`` — the
    "empty corpus" scenario the system prompt asks the model to flag as
    UNANSWERED.
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
    return SolveRequest(
        messages=[ChatMessage(role="user", content=question)],
        collection_ids=["col-1"],
        model="fake-model",
        provider="fake",
        enable_tools=True,
        web_fallback=False,  # corpus mode — no web fallback by definition
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
    """Tight loop limits keep tests fast — 3 iterations is plenty."""
    s = Settings()
    s.planner_max_iterations = 4
    s.tool_dispatch_max_parallel = 4
    s.tool_dispatch_timeout_s = 5.0
    s.rag_top_k = 4
    return s


async def _collect(gen) -> list[dict[str, Any]]:
    """Drain an async generator into a list."""
    out: list[dict[str, Any]] = []
    async for ev in gen:
        out.append(ev)
    return out


def _final_answer(events: list[dict[str, Any]]) -> str:
    """Pull the response_text from the terminal `end_event`."""
    # end_event is the last frame with state == END.
    for ev in reversed(events):
        resp = ev.get("response", {})
        if resp.get("state") == "END" and resp.get("type") == "planner":
            return str(resp.get("response", ""))
    return ""


# ----------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_empty_corpus_yields_refusal_string():
    """HARD RULE #3: empty retrieval → verbatim refusal sentence.

    The planner adds a node, runs corpus search (returns []), and the
    model is scripted to call `finalize(answer=REFUSAL_TEXT)` since no
    chunk was retrieved.
    """
    corpus = StubCorpus(default=[])  # every query → no hits
    llm = FakeLLMClient.scripted(
        [
            # Turn 1: decompose into one sub-question.
            {
                "text": "Decomposing.",
                "tool_calls": [
                    {
                        "name": "add_node",
                        "args": {"question": "What is the moon made of?"},
                    }
                ],
            },
            # Turn 2: search the corpus for that sub-Q.
            {
                "text": "Searching corpus.",
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {
                            "node_id": "n1",
                            "question": "What is the moon made of?",
                        },
                    }
                ],
            },
            # Turn 3: corpus returned UNANSWERED → emit refusal verbatim.
            {
                "text": "",
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {"answer": REFUSAL_TEXT},
                    }
                ],
            },
        ]
    )

    events = await _collect(
        run_corpus_solve(
            request=None,  # type: ignore[arg-type] — not used by body
            user=_make_user(),
            llm=llm,
            req=_make_request("What is the moon made of?"),
            corpus=corpus,
            config=_settings(),
        )
    )

    assert _final_answer(events) == REFUSAL_TEXT
    assert corpus.calls, "corpus.search should have been invoked"
    assert corpus.calls[0]["tenant_id"] == "tenant-A"


@pytest.mark.asyncio
async def test_seeded_corpus_yields_citations_in_final_answer():
    """HARD RULE #1: every claim cited via `[[doc_id:chunk_id]]`.

    Two chunks are returned; the model's scripted finalize answer
    interleaves them with citation markers. The test asserts the
    regex `\\[\\[\\w+:\\w+\\]\\]` matches at least once.
    """
    hits = [
        _make_hit(doc_id="doc1", chunk_id="c1", text="Policy X allows extensions."),
        _make_hit(doc_id="doc1", chunk_id="c2", text="Policy X has a 30-day cap."),
    ]
    corpus = StubCorpus({"Summarize policy X": hits})
    llm = FakeLLMClient.scripted(
        [
            {
                "tool_calls": [
                    {
                        "name": "add_node",
                        "args": {"question": "Summarize policy X"},
                    }
                ],
            },
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {
                            "node_id": "n1",
                            "question": "Summarize policy X",
                        },
                    }
                ],
            },
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {
                            "answer": (
                                "Policy X allows extensions [[doc1:c1]] "
                                "with a 30-day cap [[doc1:c2]]."
                            ),
                        },
                    }
                ],
            },
        ]
    )

    events = await _collect(
        run_corpus_solve(
            request=None,  # type: ignore[arg-type]
            user=_make_user(),
            llm=llm,
            req=_make_request("Summarize policy X"),
            corpus=corpus,
            config=_settings(),
        )
    )

    final = _final_answer(events)
    # Citation marker regex per ticket spec.
    assert re.search(r"\[\[\w+:\w+\]\]", final), (
        f"final answer missing [[doc:chunk]] citation marker: {final!r}"
    )
    assert "[[doc1:c1]]" in final
    assert "[[doc1:c2]]" in final


@pytest.mark.asyncio
async def test_mixed_corpus_marks_unanswered_sub_question():
    """HARD RULE #2: empty sub-Q retrieval → UNANSWERED, do not invent.

    Two sub-questions: the first hits, the second returns empty. The
    `search_corpus_node` tool's structured output carries
    `status="UNANSWERED"` for the empty one — assert the tool output
    in the event stream contains that marker.
    """
    hits = [_make_hit(doc_id="doc1", chunk_id="c1", text="X happened in 1969.")]
    corpus = StubCorpus(
        {
            "When did X happen?": hits,
            # "What colour was X?" returns [] by default
        }
    )
    llm = FakeLLMClient.scripted(
        [
            # Turn 1: add two nodes.
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
            # Turn 2: search both.
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
            # Turn 3: finalize honouring the UNANSWERED contract.
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {
                            "answer": (
                                "X happened in 1969 [[doc1:c1]]. "
                                "Colour: UNANSWERED — no chunk covers this."
                            ),
                        },
                    }
                ],
            },
        ]
    )

    events = await _collect(
        run_corpus_solve(
            request=None,  # type: ignore[arg-type]
            user=_make_user(),
            llm=llm,
            req=_make_request("When did X happen and what colour was X?"),
            corpus=corpus,
            config=_settings(),
        )
    )

    final = _final_answer(events)
    assert "UNANSWERED" in final
    assert "[[doc1:c1]]" in final
    # Both nodes were searched — n1 hit, n2 was empty.
    assert len(corpus.calls) == 2
    # The empty one wrote a UNANSWERED detail onto its node — exposed
    # via the searcher_event detail field.
    unanswered_events = [
        ev
        for ev in events
        if ev.get("current_node") == "n2"
        and (ev.get("response", {}).get("detail") or {}).get("status")
        == "UNANSWERED"
    ]
    assert unanswered_events, (
        "expected a searcher_event for n2 with detail.status=UNANSWERED"
    )


@pytest.mark.asyncio
async def test_tool_list_excludes_web_search_tool():
    """Negative AC: web planner's `search_node` MUST NOT appear in registry.

    The corpus planner registers exactly four tools — no web fallback,
    no fall-through. This is the easiest place for a regression to slip
    in (someone adds `register_planner_tools` next to ours), so we
    enforce the absence here.
    """
    registry = ToolRegistry(max_parallel=4, per_tool_timeout_s=5.0)
    corpus = StubCorpus()
    register_rag_planner_tools(
        registry,
        corpus=corpus,
        tenant_id="tenant-A",
        collection_ids=["col-1"],
    )

    names = set(registry.names())
    assert names == {
        "add_node",
        "search_corpus_node",
        "read_node_answer",
        "finalize",
    }
    assert "search_node" not in names, (
        "RAG planner must NOT expose web `search_node` — that would let "
        "the model bypass the corpus and hit the public internet."
    )


@pytest.mark.asyncio
async def test_iteration_cap_falls_back_to_refusal():
    """Safety net: if loop exits without `finalize`, emit REFUSAL_TEXT.

    The script never calls finalize — the LLM just keeps adding nodes
    until the iteration cap fires. Body must not produce a hallucinated
    "best effort" answer; must produce the refusal.
    """
    corpus = StubCorpus(default=[])
    llm = FakeLLMClient.scripted(
        [
            {
                "tool_calls": [
                    {
                        "name": "add_node",
                        "args": {"question": "anything"},
                    }
                ],
            },
            {
                "tool_calls": [
                    {
                        "name": "add_node",
                        "args": {"question": "another"},
                    }
                ],
            },
        ]
        * 5  # exhaust the iteration cap (cap = 4 in _settings())
    )

    events = await _collect(
        run_corpus_solve(
            request=None,  # type: ignore[arg-type]
            user=_make_user(),
            llm=llm,
            req=_make_request("anything"),
            corpus=corpus,
            config=_settings(),
        )
    )
    assert _final_answer(events) == REFUSAL_TEXT


def test_rag_planner_system_prompt_contains_hard_rules():
    """The exact rule numbering matters — tests/eval depend on it."""
    prompt = _rag_planner_system()
    assert "HARD RULES" in prompt
    for rule_num in ("1.", "2.", "3.", "4.", "5.", "6."):
        assert rule_num in prompt, f"missing HARD RULE {rule_num}"
    # The refusal sentence appears verbatim in HARD RULE #3.
    assert REFUSAL_TEXT in prompt


def test_rag_planner_system_indirection_returns_constant():
    """TAG-73 hot-swap point — the call site MUST go through the function."""
    from agent_search.agent_v2.orchestrator.rag_planner_prompt import (
        _RAG_PLANNER_SYSTEM_V1,
    )

    assert _rag_planner_system() is _RAG_PLANNER_SYSTEM_V1
