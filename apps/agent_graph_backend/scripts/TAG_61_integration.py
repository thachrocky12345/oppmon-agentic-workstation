#!/usr/bin/env python
"""TAG-61 integration smoke — RAG-mode planner orchestrator.

Out-of-process verification that ``run_corpus_solve`` wires up cleanly:

  * imports resolve without circular-import surprises,
  * the system prompt + refusal text load via the indirection,
  * the four-tool registry registers exactly the corpus tool set,
  * an end-to-end planner→corpus→finalize loop produces a citation-
    bearing answer with a stub LLM and stub corpus,
  * the empty-corpus path emits REFUSAL_TEXT verbatim,
  * tenant_id is forwarded to every ``CorpusSearch.search`` call
    (defence-in-depth assertion mirroring TAG-59's invariant).

Unlike most agent_graph_backend integration scripts, this one does NOT
require a running FastAPI server — TAG-61 lives at the orchestrator
layer (no new HTTP route), and the full SSE wire is covered by TAG-58's
existing ``/solve`` endpoint smoke + TAG-64 (web planner end-to-end).

Run from the service root:

    cd apps/agent_graph_backend
    python scripts/TAG_61_integration.py
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path
from typing import Any

# Bootstrap: make `agent_search` importable when running this script
# directly from `apps/agent_graph_backend/`. The same path layout pytest
# discovers via `pytest.ini:testpaths`.
_SVC_ROOT = Path(__file__).resolve().parent.parent
if str(_SVC_ROOT) not in sys.path:
    sys.path.insert(0, str(_SVC_ROOT))

# Ensure test-mode env so `Settings()` boots without real credentials.
os.environ.setdefault("LLM_PROVIDER", "fake")
os.environ.setdefault("DATABASE_URL", "")


class Runner:
    """Numbered tc0N_* test methods append (name, passed, detail) rows."""

    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # ---- TC-01: imports + prompt indirection ----

    def tc01_imports_and_prompt_indirection(self) -> None:
        try:
            from agent_search.agent_v2.orchestrator.rag_planner_prompt import (
                REFUSAL_TEXT,
                _RAG_PLANNER_SYSTEM_V1,
                _rag_planner_system,
            )
            from agent_search.agent_v2.orchestrator.rag_tools import (
                register_rag_planner_tools,  # noqa: F401  (import-only smoke)
            )
            from agent_search.agent_v2.orchestrator.modes import (
                run_corpus_solve,  # noqa: F401  (import-only smoke)
            )
        except Exception as e:  # noqa: BLE001
            self.rows.append(
                ("imports + prompt indirection", False, f"{type(e).__name__}: {e}")
            )
            return

        ok = (
            _rag_planner_system() is _RAG_PLANNER_SYSTEM_V1
            and REFUSAL_TEXT
            in "I don't have information about that in the provided collections."
            and "HARD RULES" in _rag_planner_system()
        )
        self.rows.append(
            (
                "imports + prompt indirection",
                ok,
                f"prompt_len={len(_rag_planner_system())}, refusal_len={len(REFUSAL_TEXT)}",
            )
        )

    # ---- TC-02: registry contains exactly the four corpus tools ----

    def tc02_registry_excludes_web_search_tool(self) -> None:
        from agent_search.agent_v2.orchestrator.rag_tools import (
            register_rag_planner_tools,
        )
        from agent_search.agent_v2.tools.registry import ToolRegistry

        reg = ToolRegistry(max_parallel=4, per_tool_timeout_s=5.0)
        register_rag_planner_tools(
            reg,
            corpus=_StubCorpus(),
            tenant_id="tenant-A",
            collection_ids=["col-1"],
        )
        names = set(reg.names())
        expected = {
            "add_node",
            "search_corpus_node",
            "read_node_answer",
            "finalize",
        }
        ok = names == expected and "search_node" not in names
        self.rows.append(
            (
                "registry has 4 corpus tools, no web search_node",
                ok,
                f"got={sorted(names)}",
            )
        )

    # ---- TC-03: happy path — citations present ----

    def tc03_happy_path_emits_citations(self) -> None:
        ok, detail = asyncio.run(_run_happy_path())
        self.rows.append(
            ("happy path final answer carries [[doc:chunk]]", ok, detail)
        )

    # ---- TC-04: empty corpus → refusal verbatim ----

    def tc04_empty_corpus_refusal(self) -> None:
        ok, detail = asyncio.run(_run_empty_corpus())
        self.rows.append(("empty corpus -> REFUSAL_TEXT verbatim", ok, detail))

    # ---- TC-05: tenant_id propagation ----

    def tc05_tenant_id_propagated_to_search(self) -> None:
        ok, detail = asyncio.run(_run_tenant_propagation())
        self.rows.append(
            (
                "tenant_id forwarded to CorpusSearch.search",
                ok,
                detail,
            )
        )

    # ---- Driver ----

    def run(self) -> int:
        for name in sorted(m for m in dir(self) if m.startswith("tc")):
            try:
                getattr(self, name)()
            except Exception as e:  # noqa: BLE001
                self.rows.append((name, False, f"unhandled {type(e).__name__}: {e}"))
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            tag = "[PASS]" if ok else "[FAIL]"
            print(f"{tag} {name}  {detail}")
        total = len(self.rows)
        failed = total - passed
        print(f"\ntotal={total} passed={passed} failed={failed}")
        return 0 if failed == 0 else 1


# ----------------------------------------------------------------------
# Async test bodies (kept out of the Runner so they don't trip the
# `tcNN_*` discovery rule).
# ----------------------------------------------------------------------


class _StubCorpus:
    def __init__(
        self, hits_by_query: dict[str, list[Any]] | None = None
    ) -> None:
        self._hits = hits_by_query or {}
        self.calls: list[dict[str, Any]] = []

    async def search(
        self,
        query: str,
        *,
        tenant_id: str,
        collection_ids: list[str],
        top_k: int = 8,
    ) -> list[Any]:
        self.calls.append(
            {"query": query, "tenant_id": tenant_id, "collection_ids": collection_ids}
        )
        return self._hits.get(query, [])


def _build_request(question: str):
    from agent_search.agent_v2.api.solve_request import ChatMessage, SolveRequest

    return SolveRequest(
        messages=[ChatMessage(role="user", content=question)],
        collection_ids=["col-1"],
        model="fake-model",
        provider="fake",
        enable_tools=True,
        web_fallback=False,
    )


def _build_user(tenant_id: str = "tenant-A"):
    from agent_search.agent_v2.auth.types import JWTClaims

    return JWTClaims(
        sub="user-1",
        tenant_id=tenant_id,
        role="MEMBER",
        email=None,
        exp=9_999_999_999,
        iat=1_700_000_000,
    )


def _make_hit(doc_id: str, chunk_id: str, text: str):
    from agent_search.agent_v2.rag.corpus_search import CorpusHit

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


def _tight_settings():
    from agent_search.agent_v2.config import Settings

    s = Settings()
    s.planner_max_iterations = 4
    s.tool_dispatch_max_parallel = 4
    s.tool_dispatch_timeout_s = 5.0
    return s


def _final_answer(events: list[dict[str, Any]]) -> str:
    for ev in reversed(events):
        resp = ev.get("response", {})
        if resp.get("state") == "END" and resp.get("type") == "planner":
            return str(resp.get("response", ""))
    return ""


async def _run_happy_path() -> tuple[bool, str]:
    from agent_search.agent_v2.llm.fake_client import FakeLLMClient
    from agent_search.agent_v2.orchestrator.modes import run_corpus_solve

    hits = [
        _make_hit("docA", "c1", "Policy X allows extensions."),
        _make_hit("docA", "c2", "Policy X has a 30-day cap."),
    ]
    corpus = _StubCorpus({"Summarize policy X": hits})
    llm = FakeLLMClient.scripted(
        [
            {"tool_calls": [{"name": "add_node", "args": {"question": "Summarize policy X"}}]},
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {"node_id": "n1", "question": "Summarize policy X"},
                    }
                ]
            },
            {
                "tool_calls": [
                    {
                        "name": "finalize",
                        "args": {
                            "answer": (
                                "Policy X allows extensions [[docA:c1]] "
                                "with a 30-day cap [[docA:c2]]."
                            ),
                        },
                    }
                ]
            },
        ]
    )

    events: list[dict[str, Any]] = []
    async for ev in run_corpus_solve(
        request=None,  # type: ignore[arg-type]
        user=_build_user(),
        llm=llm,
        req=_build_request("Summarize policy X"),
        corpus=corpus,
        config=_tight_settings(),
    ):
        events.append(ev)

    final = _final_answer(events)
    cite_re = re.compile(r"\[\[\w+:\w+\]\]")
    ok = bool(cite_re.search(final)) and "[[docA:c1]]" in final
    return ok, f"final[:80]={final[:80]!r}"


async def _run_empty_corpus() -> tuple[bool, str]:
    from agent_search.agent_v2.llm.fake_client import FakeLLMClient
    from agent_search.agent_v2.orchestrator.modes import run_corpus_solve
    from agent_search.agent_v2.orchestrator.rag_planner_prompt import REFUSAL_TEXT

    corpus = _StubCorpus()  # every query → []
    llm = FakeLLMClient.scripted(
        [
            {"tool_calls": [{"name": "add_node", "args": {"question": "moon comp"}}]},
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {"node_id": "n1", "question": "moon comp"},
                    }
                ]
            },
            {"tool_calls": [{"name": "finalize", "args": {"answer": REFUSAL_TEXT}}]},
        ]
    )
    events: list[dict[str, Any]] = []
    async for ev in run_corpus_solve(
        request=None,  # type: ignore[arg-type]
        user=_build_user(),
        llm=llm,
        req=_build_request("moon comp"),
        corpus=corpus,
        config=_tight_settings(),
    ):
        events.append(ev)

    final = _final_answer(events)
    ok = final == REFUSAL_TEXT
    return ok, f"final={final!r}"


async def _run_tenant_propagation() -> tuple[bool, str]:
    """Every corpus.search() call must carry the user's tenant_id verbatim."""
    from agent_search.agent_v2.llm.fake_client import FakeLLMClient
    from agent_search.agent_v2.orchestrator.modes import run_corpus_solve

    corpus = _StubCorpus()
    llm = FakeLLMClient.scripted(
        [
            {"tool_calls": [{"name": "add_node", "args": {"question": "q"}}]},
            {
                "tool_calls": [
                    {
                        "name": "search_corpus_node",
                        "args": {"node_id": "n1", "question": "q"},
                    }
                ]
            },
            {"tool_calls": [{"name": "finalize", "args": {"answer": "done"}}]},
        ]
    )
    async for _ in run_corpus_solve(
        request=None,  # type: ignore[arg-type]
        user=_build_user(tenant_id="tenant-XYZ"),
        llm=llm,
        req=_build_request("q"),
        corpus=corpus,
        config=_tight_settings(),
    ):
        pass

    if not corpus.calls:
        return False, "corpus.search was never called"
    tenants = {c["tenant_id"] for c in corpus.calls}
    ok = tenants == {"tenant-XYZ"}
    return ok, f"tenants_seen={sorted(tenants)}"


if __name__ == "__main__":
    sys.exit(Runner().run())
