"""TAG-63 — ``memory.history`` unit tests.

Six contract assertions from the ticket's Tests table plus a small
guard for the truncation suffix shape:

  1. ``trim_history`` keeps the last N user+assistant turns.
  2. Per-message char truncation appends an ellipsis suffix.
  3. Empty history is a no-op (``trim_history([]) == []``).
  4. Summariser is invoked exactly once when total > MAX_TOTAL_CHARS.
  5. Summariser returns a system-role message with the documented prefix.
  6. ``safe_summarize_oldest_half`` falls back to raw trim on LLM error
     and surfaces the failure as a warning string (risk-table item).

We use :class:`FakeLLMClient` for the summariser tests so cost
attribution and parameter passing can be asserted without an external
service.
"""

from __future__ import annotations

import pytest

from agent_search.agent_v2.api.solve_request import ChatMessage
from agent_search.agent_v2.llm.base import ChatResponse
from agent_search.agent_v2.llm.fake_client import FakeLLMClient
from agent_search.agent_v2.memory.history import (
    MAX_TOTAL_CHARS,
    MAX_TURN_CHARS,
    MAX_TURNS,
    safe_summarize_oldest_half,
    summarize_oldest_half,
    too_long,
    trim_history,
)


# ----------------------------------------------------------------------
# trim_history
# ----------------------------------------------------------------------


def _pair(i: int) -> list[ChatMessage]:
    """Return one (user, assistant) pair tagged with ``i``."""
    return [
        ChatMessage(role="user", content=f"q{i}"),
        ChatMessage(role="assistant", content=f"a{i}"),
    ]


def test_trim_history_keeps_last_n_pairs():
    """When the history exceeds ``MAX_TURNS`` pairs, only the last
    ``MAX_TURNS * 2`` non-system messages survive — older turns drop.
    """
    # Build 12 (q,a) pairs = 24 messages.
    msgs: list[ChatMessage] = []
    for i in range(12):
        msgs.extend(_pair(i))

    out = trim_history(msgs)

    assert len(out) == MAX_TURNS * 2, (
        f"expected {MAX_TURNS * 2} messages, got {len(out)}"
    )
    # The first surviving turn must be the (12 - MAX_TURNS)-th user
    # message — i.e. we kept the *most recent* MAX_TURNS pairs.
    assert out[0].content == f"q{12 - MAX_TURNS}"
    assert out[-1].content == "a11"


def test_trim_history_preserves_leading_system_message():
    """A leading ``system`` message is *not* counted against the turn
    cap — it sits in front of the trimmed body verbatim.
    """
    msgs: list[ChatMessage] = [
        ChatMessage(role="system", content="you are a helpful assistant"),
    ]
    for i in range(12):
        msgs.extend(_pair(i))

    out = trim_history(msgs)

    assert out[0].role == "system"
    assert out[0].content == "you are a helpful assistant"
    assert len(out) == 1 + MAX_TURNS * 2


def test_trim_history_per_message_char_truncation():
    """Bodies longer than ``MAX_TURN_CHARS`` are suffix-truncated.

    The resulting string is at most ``MAX_TURN_CHARS`` and ends with
    ``...`` so a downstream reader can recognise the elision.
    """
    long_body = "x" * (MAX_TURN_CHARS + 500)
    msgs = [ChatMessage(role="user", content=long_body)]

    out = trim_history(msgs)

    assert len(out) == 1
    assert len(out[0].content) == MAX_TURN_CHARS
    assert out[0].content.endswith("...")


def test_trim_history_empty_input_is_noop():
    """``trim_history([]) == []`` per the ticket Tests table."""
    assert trim_history([]) == []


def test_trim_history_idempotent():
    """Defence-in-depth: calling trim_history twice gives the same result.

    The orchestrator calls this exactly once but a future caller
    might re-trim a stored history; the invariant guards against
    surprise length drift.
    """
    msgs: list[ChatMessage] = []
    for i in range(20):
        msgs.extend(_pair(i))
    msgs[0] = ChatMessage(role="user", content="x" * (MAX_TURN_CHARS + 10))

    once = trim_history(msgs)
    twice = trim_history(once)

    assert len(once) == len(twice)
    for a, b in zip(once, twice, strict=True):
        assert a.role == b.role
        assert a.content == b.content


# ----------------------------------------------------------------------
# too_long
# ----------------------------------------------------------------------


def test_too_long_under_budget_returns_false():
    msgs = [ChatMessage(role="user", content="a" * 100)]
    assert too_long(msgs) is False


def test_too_long_over_budget_returns_true():
    msgs = [ChatMessage(role="user", content="a" * (MAX_TOTAL_CHARS + 1))]
    assert too_long(msgs) is True


# ----------------------------------------------------------------------
# summarize_oldest_half
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_summarizer_called_once_when_total_too_long():
    """The summariser hits the LLM exactly once and the call carries
    the user prompt prefix from the spec.

    We do NOT assert on the exact summarisation text — we assert on
    the contract (one call, user prompt, summary prefix in output).
    """
    llm = FakeLLMClient.scripted(
        [{"text": "Earlier they discussed Q1 revenue of $42M."}]
    )

    # Build a history that *fits* trim_history but still busts
    # MAX_TOTAL_CHARS — e.g. 16 messages of MAX_TURN_CHARS each.
    msgs = [
        ChatMessage(role="user" if i % 2 == 0 else "assistant",
                    content="x" * (MAX_TURN_CHARS - 1))
        for i in range(MAX_TURNS * 2)
    ]
    # Sanity precondition.
    assert too_long(msgs)

    result = await summarize_oldest_half(llm, msgs)

    # Exactly one LLM call.
    assert len(llm.calls) == 1
    # The call was a single user-role message containing the prompt.
    sent = llm.calls[0]["messages"]
    assert len(sent) == 1
    assert sent[0]["role"] == "user"
    assert "Summarize the following conversation turns" in sent[0]["content"]
    # Output is a system message carrying the documented prefix.
    assert result.role == "system"
    assert result.content.startswith("[Earlier turns, summarized]")
    assert "Q1 revenue" in result.content


@pytest.mark.asyncio
async def test_summarizer_handles_empty_llm_response():
    """If the LLM returns empty text, the result still has a non-empty
    body — we substitute a sentinel rather than emit an empty system
    message which the planner would then have to special-case.
    """
    llm = FakeLLMClient([ChatResponse(text="")])

    msgs = [
        ChatMessage(role="user", content="hello"),
        ChatMessage(role="assistant", content="hi"),
    ]
    result = await summarize_oldest_half(llm, msgs)
    assert result.role == "system"
    assert result.content.strip() != "[Earlier turns, summarized]"


# ----------------------------------------------------------------------
# safe_summarize_oldest_half — fall-back path
# ----------------------------------------------------------------------


class _ExplodingLLM:
    """LLM stub that raises on every chat call.

    Mirrors the rate-limit-failure shape from the ticket's risk table.
    """

    async def chat(self, **_: object) -> ChatResponse:
        raise RuntimeError("rate limited")


@pytest.mark.asyncio
async def test_safe_summarize_falls_back_to_raw_trim_on_error():
    """LLM error -> ``(input_msgs_unchanged, warning_string)``.

    Per ticket risk table: "Summariser call fails (rate limit) → Fall
    back to raw trim; emit warn event." The caller is expected to
    forward ``warning`` as a SSE warning event.
    """
    llm = _ExplodingLLM()
    msgs = [
        ChatMessage(role="user", content="q1"),
        ChatMessage(role="assistant", content="a1"),
    ]
    result, warning = await safe_summarize_oldest_half(llm, msgs)

    assert result == msgs, "fall-back must return the input messages unchanged"
    assert warning is not None
    assert "rate limited" in warning


@pytest.mark.asyncio
async def test_safe_summarize_success_returns_summary_plus_newer():
    """Happy path: ``[summary, *newer]`` and no warning."""
    llm = FakeLLMClient.scripted([{"text": "earlier turns covered foo"}])
    msgs = [
        ChatMessage(role="user", content="q1"),
        ChatMessage(role="assistant", content="a1"),
        ChatMessage(role="user", content="q2"),
        ChatMessage(role="assistant", content="a2"),
    ]
    result, warning = await safe_summarize_oldest_half(llm, msgs)

    assert warning is None
    assert len(result) == 1 + 2  # one summary + two newer (q2,a2)
    assert result[0].role == "system"
    assert result[0].content.startswith("[Earlier turns, summarized]")
    # ``newer`` half is the tail.
    assert result[-1].content == "a2"
    assert result[-2].content == "q2"
