#!/usr/bin/env python
# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-62 integration smoke — mode selection + dispatch end-to-end.

Out-of-process verification that the four-quadrant decision table
behaves correctly **without** needing a running FastAPI server:

  * imports resolve and ``run_solve`` is wired to all three mode entries,
  * ``select_mode`` returns the right ``SolveMode`` for each of the four
    quadrants (with the fourth blocked at the request validator),
  * dispatch from ``run_solve`` reaches each branch — verified with
    monkeypatched mode entries that record calls,
  * the legacy ``/solve_v2`` mount still imports clean (no name drift
    after the ``_build_web_search`` -> ``build_web_search`` extraction),
  * the hybrid policy: corpus-complete -> no web; corpus-UNANSWERED ->
    one web call.

Unlike most agent_graph_backend integration scripts, this one does NOT
require a running FastAPI server — TAG-62 lives at the orchestrator
layer (no new HTTP route), and the route wire is already covered by
TAG-58's ``/solve`` smoke.

Run from the service root:

    cd apps/agent_graph_backend
    python scripts/TAG_62_integration.py
"""

from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path
from typing import Any

# Bootstrap: make ``agent_search`` importable when running this script
# directly from ``apps/agent_graph_backend/``.
_SVC_ROOT = Path(__file__).resolve().parent.parent
if str(_SVC_ROOT) not in sys.path:
    sys.path.insert(0, str(_SVC_ROOT))

os.environ.setdefault("LLM_PROVIDER", "fake")
os.environ.setdefault("DATABASE_URL", "")


class Runner:
    """Numbered tc0N_* test methods append (name, passed, detail) rows."""

    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # ---- TC-01: imports + SolveMode shape ----

    def tc01_imports_and_solve_mode_enum(self) -> None:
        try:
            from agent_search.agent_v2.orchestrator.modes import (
                SolveMode,
                _build_corpus_search,  # noqa: F401  (import-only smoke)
                run_corpus_solve,  # noqa: F401
                run_solve,  # noqa: F401
                select_mode,  # noqa: F401
            )
            from agent_search.agent_v2.orchestrator.web_mode import (
                run_web_solve,  # noqa: F401
            )
            from agent_search.agent_v2.orchestrator.hybrid_mode import (
                run_hybrid_solve,  # noqa: F401
            )
            from agent_search.agent_v2.rag.web_search_factory import (
                build_web_search,  # noqa: F401
            )
        except Exception as e:  # noqa: BLE001
            self.rows.append(
                ("imports + SolveMode", False, f"{type(e).__name__}: {e}")
            )
            return

        values = [m.value for m in SolveMode]
        ok = values == ["web", "corpus", "hybrid", "invalid"]
        self.rows.append(("imports + SolveMode values stable", ok, f"got={values}"))

    # ---- TC-02: legacy /solve_v2 still mounts clean ----

    def tc02_legacy_mount_v2_imports_clean(self) -> None:
        try:
            from fastapi import FastAPI

            from agent_search.agent_v2.app import mount_v2

            app = FastAPI()
            mount_v2(app)
            ok = True
            detail = "mount_v2 succeeded"
        except Exception as e:  # noqa: BLE001
            ok = False
            detail = f"{type(e).__name__}: {e}"
        self.rows.append(("legacy /solve_v2 mount still clean", ok, detail))

    # ---- TC-03: select_mode quadrants ----

    def tc03_select_mode_quadrants(self) -> None:
        from agent_search.agent_v2.api.solve_request import (
            ChatMessage,
            SolveRequest,
        )
        from agent_search.agent_v2.orchestrator.modes import (
            SolveMode,
            select_mode,
        )

        def req(*, web: bool, cols: list[str]):
            return SolveRequest(
                messages=[ChatMessage(role="user", content="q")],
                collection_ids=cols,
                model="fake-model",
                provider="fake",
                enable_tools=True,
                web_fallback=web,
            )

        ok = (
            select_mode(req(web=True, cols=[])) is SolveMode.WEB
            and select_mode(req(web=False, cols=["a"])) is SolveMode.CORPUS
            and select_mode(req(web=True, cols=["a"])) is SolveMode.HYBRID
        )

        # Fourth quadrant: must raise at construction time.
        from pydantic import ValidationError

        rejected = False
        try:
            req(web=False, cols=[])
        except ValidationError:
            rejected = True
        ok = ok and rejected

        self.rows.append(
            ("select_mode quadrants WEB/CORPUS/HYBRID; (false,[]) rejected", ok, "")
        )

    # ---- TC-04: run_solve dispatches each branch ----

    def tc04_run_solve_dispatches_by_mode(self) -> None:
        ok, detail = asyncio.run(_run_dispatch_check())
        self.rows.append(("run_solve dispatches WEB/CORPUS/HYBRID", ok, detail))

    # ---- TC-05: hybrid does NOT call web when corpus complete ----

    def tc05_hybrid_no_web_when_corpus_complete(self) -> None:
        ok, detail = asyncio.run(_run_hybrid_complete())
        self.rows.append(
            ("hybrid skips web when corpus complete", ok, detail)
        )

    # ---- TC-06: hybrid DOES call web when sub-Q UNANSWERED ----

    def tc06_hybrid_falls_through_on_unanswered(self) -> None:
        ok, detail = asyncio.run(_run_hybrid_fallthrough())
        self.rows.append(
            ("hybrid falls through to web on UNANSWERED", ok, detail)
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
# Async test bodies
# ----------------------------------------------------------------------


def _user(tenant_id: str = "tenant-A"):
    from agent_search.agent_v2.auth.types import JWTClaims

    return JWTClaims(
        sub="user-1",
        tenant_id=tenant_id,
        role="MEMBER",
        email=None,
        exp=9_999_999_999,
        iat=1_700_000_000,
    )


def _req(*, web: bool, cols: list[str], question: str = "hello"):
    from agent_search.agent_v2.api.solve_request import (
        ChatMessage,
        SolveRequest,
    )

    return SolveRequest(
        messages=[ChatMessage(role="user", content=question)],
        collection_ids=cols,
        model="fake-model",
        provider="fake",
        enable_tools=True,
        web_fallback=web,
    )


async def _run_dispatch_check() -> tuple[bool, str]:
    """Monkeypatch each mode entry and confirm run_solve picks the right one."""
    from unittest.mock import patch

    from agent_search.agent_v2.orchestrator.modes import (
        SolveMode,
        run_solve,
    )

    calls: dict[str, int] = {"web": 0, "corpus": 0, "hybrid": 0}

    async def fake_web(**_kwargs):
        calls["web"] += 1
        yield {"response": {"type": "planner", "state": "END", "response": "w"}}

    async def fake_corpus(**_kwargs):
        calls["corpus"] += 1
        yield {"response": {"type": "planner", "state": "END", "response": "c"}}

    async def fake_hybrid(**_kwargs):
        calls["hybrid"] += 1
        yield {"response": {"type": "planner", "state": "END", "response": "h"}}

    with (
        patch(
            "agent_search.agent_v2.orchestrator.web_mode.run_web_solve",
            fake_web,
        ),
        patch(
            "agent_search.agent_v2.orchestrator.modes.run_corpus_solve",
            fake_corpus,
        ),
        patch(
            "agent_search.agent_v2.orchestrator.hybrid_mode.run_hybrid_solve",
            fake_hybrid,
        ),
        patch(
            "agent_search.agent_v2.orchestrator.modes._build_corpus_search",
            lambda: None,
        ),
    ):
        for mode, req_args in (
            (SolveMode.WEB, {"web": True, "cols": []}),
            (SolveMode.CORPUS, {"web": False, "cols": ["a"]}),
            (SolveMode.HYBRID, {"web": True, "cols": ["a"]}),
        ):
            async for _ in run_solve(
                request=None,  # type: ignore[arg-type]
                user=_user(),
                llm=None,  # type: ignore[arg-type]  # mocked entry never uses it
                req=_req(**req_args),
                mode=mode,
            ):
                pass

    ok = calls == {"web": 1, "corpus": 1, "hybrid": 1}
    return ok, f"calls={calls}"


def _stub_corpus(hits_by_query=None, default=None):
    """Bare-bones ``CorpusSearch`` Protocol implementation."""
    from agent_search.agent_v2.rag.corpus_search import CorpusHit  # noqa: F401

    class Stub:
        def __init__(self) -> None:
            self._hits = hits_by_query or {}
            self._default = default or []
            self.calls: list[dict[str, Any]] = []

        async def search(self, query, *, tenant_id, collection_ids, top_k=8):
            self.calls.append(
                {
                    "query": query,
                    "tenant_id": tenant_id,
                    "collection_ids": collection_ids,
                }
            )
            return self._hits.get(query, self._default)

    return Stub()


def _make_hit(*, doc_id, chunk_id, text):
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


def _install_web_mock(answer: str):
    """Monkeypatch ``hybrid_mode.run_web_solve`` with a counting stub.

    Returns ``(state, restore_fn)`` so callers can teardown.
    """
    from agent_search.agent_v2.orchestrator import hybrid_mode

    class State:
        calls = 0
        answer_text = answer

    async def fake(*, request, llm, req, config=None):
        State.calls += 1
        yield {
            "response": {
                "type": "planner",
                "state": "END",
                "response": State.answer_text,
            },
            "current_node": None,
        }

    original = hybrid_mode.run_web_solve
    hybrid_mode.run_web_solve = fake  # type: ignore[assignment]

    def restore():
        hybrid_mode.run_web_solve = original  # type: ignore[assignment]

    return State, restore


async def _run_hybrid_complete() -> tuple[bool, str]:
    from agent_search.agent_v2.llm.fake_client import FakeLLMClient
    from agent_search.agent_v2.orchestrator.hybrid_mode import (
        run_hybrid_solve,
    )

    State, restore = _install_web_mock(answer="should not appear [1]")
    try:
        hits = [_make_hit(doc_id="d1", chunk_id="c1", text="Policy X allows.")]
        corpus = _stub_corpus({"Policy X": hits})
        llm = FakeLLMClient.scripted(
            [
                {
                    "tool_calls": [
                        {"name": "add_node", "args": {"question": "Policy X"}}
                    ]
                },
                {
                    "tool_calls": [
                        {
                            "name": "search_corpus_node",
                            "args": {
                                "node_id": "n1",
                                "question": "Policy X",
                            },
                        }
                    ]
                },
                {
                    "tool_calls": [
                        {
                            "name": "finalize",
                            "args": {
                                "answer": "Policy X allows [[d1:c1]].",
                            },
                        }
                    ]
                },
            ]
        )
        events: list[dict[str, Any]] = []
        async for ev in run_hybrid_solve(
            request=None,  # type: ignore[arg-type]
            user=_user(),
            llm=llm,
            req=_req(web=True, cols=["col-1"], question="Policy X"),
            corpus=corpus,
            config=_tight_settings(),
        ):
            events.append(ev)
    finally:
        restore()

    ok = State.calls == 0
    final = ""
    for ev in reversed(events):
        resp = ev.get("response", {})
        if resp.get("state") == "END":
            final = str(resp.get("response", ""))
            break
    return ok, f"web_calls={State.calls}, final[:60]={final[:60]!r}"


async def _run_hybrid_fallthrough() -> tuple[bool, str]:
    from agent_search.agent_v2.llm.fake_client import FakeLLMClient
    from agent_search.agent_v2.orchestrator.hybrid_mode import (
        run_hybrid_solve,
    )

    State, restore = _install_web_mock(answer="Colour was blue [1].")
    try:
        # First sub-Q hits, second misses -> UNANSWERED -> fall through.
        hits = [_make_hit(doc_id="d1", chunk_id="c1", text="X in 1969.")]
        corpus = _stub_corpus({"When did X happen?": hits})
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
                    ]
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
                    ]
                },
                {
                    "tool_calls": [
                        {
                            "name": "finalize",
                            "args": {
                                "answer": (
                                    "X in 1969 [[d1:c1]]. "
                                    "Colour: UNANSWERED."
                                ),
                            },
                        }
                    ]
                },
            ]
        )
        events: list[dict[str, Any]] = []
        async for ev in run_hybrid_solve(
            request=None,  # type: ignore[arg-type]
            user=_user(),
            llm=llm,
            req=_req(
                web=True,
                cols=["col-1"],
                question="When did X happen and what colour was X?",
            ),
            corpus=corpus,
            config=_tight_settings(),
        ):
            events.append(ev)
    finally:
        restore()

    final = ""
    for ev in reversed(events):
        resp = ev.get("response", {})
        if resp.get("state") == "END":
            final = str(resp.get("response", ""))
            break
    has_corpus_cite = bool(re.search(r"\[\[\w+:\w+\]\]", final))
    has_web_cite = bool(re.search(r"\[\d+\]", final))
    ok = State.calls == 1 and has_corpus_cite and has_web_cite
    return (
        ok,
        f"web_calls={State.calls}, corpus_cite={has_corpus_cite}, "
        f"web_cite={has_web_cite}",
    )


if __name__ == "__main__":
    sys.exit(Runner().run())
