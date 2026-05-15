#!/usr/bin/env python
"""TAG-63 integration smoke — conversation history threading.

The unit-test suite covers ``trim_history`` / ``summarize_oldest_half``
/ ``PlannerAgent.run`` in isolation. This out-of-process smoke proves
the **wiring** end-to-end: the new ``history`` module imports cleanly,
the planner's signature change does not break the existing
``mount_v2`` boot, ``/solve_v2`` still validates, and a real
``ChatMessage`` round-trips through ``trim_history``.

Defaults to in-process where Postgres / network is not available.
Run with ``python scripts/TAG_63_integration.py``.
"""
from __future__ import annotations

import asyncio
import os
import sys
from typing import Any


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # ------------------------------------------------------------------
    # TC-01: imports + module surface stable
    # ------------------------------------------------------------------
    def tc01_imports(self) -> None:
        try:
            from agent_search.agent_v2.memory import (
                MAX_TOTAL_CHARS,
                MAX_TURNS,
                MAX_TURN_CHARS,
                safe_summarize_oldest_half,
                summarize_oldest_half,
                too_long,
                trim_history,
            )

            # The public surface MUST stay stable — if any of these
            # symbols disappear, downstream tickets break silently.
            assert callable(trim_history)
            assert callable(too_long)
            assert callable(summarize_oldest_half)
            assert callable(safe_summarize_oldest_half)
            assert isinstance(MAX_TURNS, int) and MAX_TURNS > 0
            assert isinstance(MAX_TURN_CHARS, int) and MAX_TURN_CHARS > 0
            assert isinstance(MAX_TOTAL_CHARS, int) and MAX_TOTAL_CHARS > 0
            self.rows.append(
                ("imports + module surface stable",
                 True,
                 f"MAX_TURNS={MAX_TURNS} MAX_TURN_CHARS={MAX_TURN_CHARS} "
                 f"MAX_TOTAL_CHARS={MAX_TOTAL_CHARS}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("imports + module surface stable", False, repr(exc)))

    # ------------------------------------------------------------------
    # TC-02: mount_v2 still works (legacy /solve_v2 boot regression)
    # ------------------------------------------------------------------
    def tc02_mount_v2(self) -> None:
        try:
            from fastapi import FastAPI

            from agent_search.agent_v2.app import mount_v2

            app = FastAPI()
            mount_v2(app)
            # Confirm /solve_v2 is registered.
            paths = {r.path for r in app.routes}  # type: ignore[attr-defined]
            ok = "/solve_v2" in paths
            self.rows.append(
                ("mount_v2 still mounts /solve_v2",
                 ok,
                 f"routes={sorted(paths)[:5]}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("mount_v2 still mounts /solve_v2", False, repr(exc)))

    # ------------------------------------------------------------------
    # TC-03: trim_history quadrants
    # ------------------------------------------------------------------
    def tc03_trim_quadrants(self) -> None:
        try:
            from agent_search.agent_v2.api.solve_request import ChatMessage
            from agent_search.agent_v2.memory.history import (
                MAX_TURN_CHARS,
                MAX_TURNS,
                trim_history,
            )

            # Empty
            assert trim_history([]) == []

            # Under cap
            two = [
                ChatMessage(role="user", content="q1"),
                ChatMessage(role="assistant", content="a1"),
            ]
            assert trim_history(two) == two

            # Over cap
            many = []
            for i in range(MAX_TURNS + 3):
                many.append(ChatMessage(role="user", content=f"q{i}"))
                many.append(ChatMessage(role="assistant", content=f"a{i}"))
            trimmed = trim_history(many)
            assert len(trimmed) == MAX_TURNS * 2

            # Truncation
            longer = "x" * (MAX_TURN_CHARS + 100)
            out = trim_history([ChatMessage(role="user", content=longer)])
            assert len(out[0].content) == MAX_TURN_CHARS
            assert out[0].content.endswith("...")

            self.rows.append(
                ("trim_history empty/under/over/truncation",
                 True,
                 f"trimmed_len={len(trimmed)} truncated_len={len(out[0].content)}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("trim_history empty/under/over/truncation",
                              False, repr(exc)))

    # ------------------------------------------------------------------
    # TC-04: summariser fall-back yields warning, never raises
    # ------------------------------------------------------------------
    def tc04_summariser_fallback(self) -> None:
        try:
            from agent_search.agent_v2.api.solve_request import ChatMessage
            from agent_search.agent_v2.memory.history import (
                safe_summarize_oldest_half,
            )

            class _Boom:
                async def chat(self, **_: Any) -> Any:
                    raise RuntimeError("rate limited")

            msgs = [
                ChatMessage(role="user", content="q1"),
                ChatMessage(role="assistant", content="a1"),
            ]
            result, warning = asyncio.run(
                safe_summarize_oldest_half(_Boom(), msgs)
            )
            assert result == msgs
            assert warning is not None
            assert "rate limited" in warning
            self.rows.append(
                ("safe_summarize falls back on LLM error",
                 True,
                 f"warning={warning!r}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("safe_summarize falls back on LLM error",
                              False, repr(exc)))

    # ------------------------------------------------------------------
    # TC-05: planner wove history into LLM call
    # ------------------------------------------------------------------
    def tc05_planner_threads_history(self) -> None:
        try:
            from agent_search.agent_v2.api.solve_request import ChatMessage
            from agent_search.agent_v2.llm.fake_client import FakeLLMClient
            from agent_search.agent_v2.orchestrator.planner import PlannerAgent
            from agent_search.agent_v2.rag.hybrid_search import NullCorpusSearch
            from agent_search.agent_v2.rag.retriever import Retriever

            class _NullWeb:
                async def search(self, query: str, top_k: int = 5):
                    return []

            llm = FakeLLMClient.scripted(
                [{"tool_calls": [{"name": "finalize",
                                   "args": {"answer": "ok"}}]}]
            )
            planner = PlannerAgent(
                llm=llm,
                retriever=Retriever(
                    rag=NullCorpusSearch(),
                    web=_NullWeb(),
                    score_threshold=0.5,
                    topk=4,
                ),
            )

            async def _drive() -> None:
                async for _ in planner.run(
                    question="follow up",
                    history=[
                        ChatMessage(role="user", content="initial"),
                        ChatMessage(role="assistant", content="answer1"),
                    ],
                    enable_tools=False,
                    web_fallback=True,
                ):
                    pass

            asyncio.run(_drive())
            msgs = llm.calls[0]["messages"]
            # Must contain history messages between system and final user.
            roles = [m["role"] for m in msgs]
            contents = [m["content"] for m in msgs]
            ok = (
                roles[0] == "system"
                and "initial" in contents
                and "answer1" in contents
                and contents[-1] == "follow up"
            )
            self.rows.append(
                ("planner threads history into LLM call",
                 ok,
                 f"roles={roles} last_content={contents[-1]!r}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("planner threads history into LLM call",
                              False, repr(exc)))

    # ------------------------------------------------------------------
    # TC-06: legacy inputs=str path threads no history (regression)
    # ------------------------------------------------------------------
    def tc06_legacy_inputs_string(self) -> None:
        try:
            from agent_search.agent_v2.llm.fake_client import FakeLLMClient
            from agent_search.agent_v2.orchestrator.planner import PlannerAgent
            from agent_search.agent_v2.rag.hybrid_search import NullCorpusSearch
            from agent_search.agent_v2.rag.retriever import Retriever

            class _NullWeb:
                async def search(self, query: str, top_k: int = 5):
                    return []

            llm = FakeLLMClient.scripted(
                [{"tool_calls": [{"name": "finalize",
                                   "args": {"answer": "ok"}}]}]
            )
            planner = PlannerAgent(
                llm=llm,
                retriever=Retriever(
                    rag=NullCorpusSearch(),
                    web=_NullWeb(),
                    score_threshold=0.5,
                    topk=4,
                ),
            )

            async def _drive() -> None:
                async for _ in planner.run(
                    inputs="legacy question",
                    enable_tools=False,
                    web_fallback=True,
                ):
                    pass

            asyncio.run(_drive())
            msgs = llm.calls[0]["messages"]
            user_msgs = [m for m in msgs if m["role"] == "user"]
            asst_msgs = [m for m in msgs if m["role"] == "assistant"]
            ok = (
                len(user_msgs) == 1
                and user_msgs[0]["content"] == "legacy question"
                and len(asst_msgs) == 0
            )
            self.rows.append(
                ("legacy inputs=str threads no history (regression)",
                 ok,
                 f"users={len(user_msgs)} assts={len(asst_msgs)}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("legacy inputs=str threads no history (regression)",
                              False, repr(exc)))

    # ------------------------------------------------------------------
    # Runner
    # ------------------------------------------------------------------
    def run(self) -> int:
        for name in [m for m in dir(self) if m.startswith("tc")]:
            getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            marker = "[PASS]" if ok else "[FAIL]"
            print(f"{marker} {name}  {detail}")
        print(f"\ntotal={len(self.rows)} "
              f"passed={passed} failed={len(self.rows) - passed}")
        return 0 if passed == len(self.rows) else 1


if __name__ == "__main__":
    # Make sure we can import the package regardless of cwd.
    here = os.path.dirname(os.path.abspath(__file__))
    pkg_root = os.path.normpath(os.path.join(here, ".."))
    if pkg_root not in sys.path:
        sys.path.insert(0, pkg_root)
    sys.exit(Runner().run())
