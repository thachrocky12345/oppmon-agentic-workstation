"""TAG-63 — PlannerAgent threads conversation history into the LLM call.

Contract assertions:

  1. ``PlannerAgent.run(question=..., history=[...])`` is the new
     wire shape; the legacy ``inputs=...`` shape still works (for
     ``/solve_v2`` regression).
  2. Prior turns appear in the LLM messages between the system prompt
     and the current user question — so the model can resolve
     follow-up questions like *"and what about 2024?"* against the
     prior subject.
  3. Passing both ``inputs`` and ``question`` raises ``ValueError`` —
     the API surface refuses ambiguous calls.
  4. The legacy ``list[dict]`` ``inputs`` shape derives history
     correctly (everything before the last user message).
"""

from __future__ import annotations

from typing import Any

import pytest

from agent_search.agent_v2.api.solve_request import ChatMessage
from agent_search.agent_v2.llm.fake_client import FakeLLMClient
from agent_search.agent_v2.orchestrator.planner import PlannerAgent
from agent_search.agent_v2.rag.hybrid_search import NullCorpusSearch
from agent_search.agent_v2.rag.retriever import Retriever


class _NullWebSearch:
    """Web search stub that returns no hits — keeps tests offline."""

    async def search(self, query: str, top_k: int = 5):  # noqa: D401
        return []


def _make_planner(llm: FakeLLMClient) -> PlannerAgent:
    retriever = Retriever(
        rag=NullCorpusSearch(),
        web=_NullWebSearch(),
        score_threshold=0.5,
        topk=4,
    )
    return PlannerAgent(llm=llm, retriever=retriever)


def _finalize_script(answer: str) -> list[dict[str, Any]]:
    """Minimal one-turn script: planner calls ``finalize`` immediately.

    Keeps the test focused on the *messages-the-LLM-sees* assertion;
    we don't need the planner to actually dispatch searcher fanout.
    """
    return [
        {
            "tool_calls": [
                {"name": "finalize", "args": {"answer": answer}},
            ],
        },
    ]


async def _collect(gen) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    async for ev in gen:
        out.append(ev)
    return out


# ----------------------------------------------------------------------
# Tests
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_follow_up_question_sees_prior_turn_in_llm_messages():
    """The ticket's headline assertion: prior turns sit between the
    planner system prompt and the current user question.

    A follow-up ``"and what about 2024?"`` must be able to resolve the
    subject (revenue, in this scripted example) from history. We
    assert on the *shape* the LLM sees, not on the model's output,
    because we don't run a real model.
    """
    llm = FakeLLMClient.scripted(_finalize_script("Revenue in 2024 was $50M."))
    planner = _make_planner(llm)

    history = [
        ChatMessage(role="user", content="What was Q1 2023 revenue?"),
        ChatMessage(role="assistant", content="Q1 2023 revenue was $42M."),
    ]

    await _collect(
        planner.run(
            question="and what about 2024?",
            history=history,
            enable_tools=False,
            web_fallback=True,
        )
    )

    # First (and only) LLM call carries the woven message list.
    assert len(llm.calls) >= 1
    msgs = llm.calls[0]["messages"]

    # Layout: [system_prompt, <history...>, user_question, ...]
    assert msgs[0]["role"] == "system"
    # History is woven verbatim, in order.
    assert msgs[1]["role"] == "user"
    assert msgs[1]["content"] == "What was Q1 2023 revenue?"
    assert msgs[2]["role"] == "assistant"
    assert msgs[2]["content"] == "Q1 2023 revenue was $42M."
    # Final user message is the current question.
    user_msgs = [m for m in msgs if m["role"] == "user"]
    assert user_msgs[-1]["content"] == "and what about 2024?"


@pytest.mark.asyncio
async def test_legacy_inputs_string_shape_threads_no_history():
    """``/solve_v2`` regression: ``inputs="..."`` constructs history=[].

    Behaviour must be byte-identical to today — the only messages
    sent to the LLM are system prompt + the user question.
    """
    llm = FakeLLMClient.scripted(_finalize_script("ok"))
    planner = _make_planner(llm)

    await _collect(
        planner.run(inputs="single question", enable_tools=False, web_fallback=True)
    )

    msgs = llm.calls[0]["messages"]
    assert msgs[0]["role"] == "system"
    user_msgs = [m for m in msgs if m["role"] == "user"]
    assert len(user_msgs) == 1
    assert user_msgs[0]["content"] == "single question"
    # No assistant messages — no prior turn was threaded.
    assert all(m["role"] != "assistant" for m in msgs)


@pytest.mark.asyncio
async def test_legacy_inputs_list_shape_derives_history():
    """``inputs=[{role,content},...]`` (web-UI shape) splits history
    from question via the planner's adapter.

    Everything before the final ``user`` message becomes history.
    """
    llm = FakeLLMClient.scripted(_finalize_script("ok"))
    planner = _make_planner(llm)

    await _collect(
        planner.run(
            inputs=[
                {"role": "user", "content": "first turn"},
                {"role": "assistant", "content": "ack"},
                {"role": "user", "content": "current question"},
            ],
            enable_tools=False,
            web_fallback=True,
        )
    )

    msgs = llm.calls[0]["messages"]
    user_msgs = [m["content"] for m in msgs if m["role"] == "user"]
    asst_msgs = [m["content"] for m in msgs if m["role"] == "assistant"]
    assert "first turn" in user_msgs
    assert "current question" in user_msgs
    assert "ack" in asst_msgs
    # Order: first turn precedes current question.
    assert user_msgs.index("first turn") < user_msgs.index("current question")


@pytest.mark.asyncio
async def test_both_inputs_and_question_rejected():
    """Defence-in-depth: ambiguous calls fail loud."""
    llm = FakeLLMClient.scripted(_finalize_script("ok"))
    planner = _make_planner(llm)

    with pytest.raises(ValueError, match="either `inputs`"):
        async for _ in planner.run(
            inputs="foo",
            question="bar",
            enable_tools=False,
            web_fallback=True,
        ):
            pass


@pytest.mark.asyncio
async def test_neither_inputs_nor_question_rejected():
    """The other failure mode of the API surface."""
    llm = FakeLLMClient.scripted(_finalize_script("ok"))
    planner = _make_planner(llm)

    with pytest.raises(ValueError, match="requires either `inputs`"):
        async for _ in planner.run(enable_tools=False, web_fallback=True):
            pass
