"""TAG-63 — Conversation history trim + summarize.

The orchestrator threads prior turns through ``PlannerAgent.run`` so a
follow-up question (*"and what about 2024?"*) can be resolved against
the prior turn's subject. Without bounds this surface area becomes a
token-cost foot-gun, so this module enforces three contracts:

  1. **Turn cap**  — keep at most :data:`MAX_TURNS` user+assistant pairs.
  2. **Char cap per turn**  — truncate any single message body to
     :data:`MAX_TURN_CHARS` chars with an ellipsis suffix.
  3. **Total cap**  — if the trimmed history still totals more than
     :data:`MAX_TOTAL_CHARS` chars, summarise the oldest half into a
     single ``system``-role message via the request's own LLM client.

``ChatMessage`` here is the *wire* shape from
:mod:`agent_v2.api.solve_request` (``role`` ∈ {``system``, ``user``,
``assistant``}, ``content: str``). It is intentionally NOT
:class:`agent_v2.llm.base.ChatMessage` — that latter shape carries
tool-call fields we never want to forward as conversational history.

The summariser is best-effort:

  * Hit succeeds  → ``[summary] + newer`` replaces the input.
  * Hit fails     → fall back to the trimmed list; a warning event is
    emitted by the caller (see :mod:`.orchestrator.planner`). Per the
    ticket's risk table: "Summariser call fails (rate limit) → fall
    back to raw trim; emit warn event."
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..api.solve_request import ChatMessage
    from ..llm.base import LLMClient


log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Limits — chosen per the TAG-63 ticket.
# ---------------------------------------------------------------------------

MAX_TURNS: int = 8
"""Max user+assistant turn pairs preserved verbatim.

Older turns either get summarised (if total chars > MAX_TOTAL_CHARS)
or dropped. A leading ``system`` message does not count against this
cap — it is always preserved if present.
"""

MAX_TURN_CHARS: int = 4_000
"""Per-message char ceiling. Content over this is suffix-truncated."""

MAX_TOTAL_CHARS: int = 16_000
"""Total char budget for the trimmed history before summarisation fires."""

_TRUNCATION_SUFFIX = "..."

_SUMMARISER_SLUG = "template.history_summarizer"
_SUMMARY_PREFIX_SLUG = "template.history_summary_prefix"


def _truncate(text: str) -> str:
    """Hard-truncate one message body to :data:`MAX_TURN_CHARS`.

    The suffix is appended *inside* the budget so the resulting string
    never exceeds the cap — important because downstream token
    accounting in :class:`ConversationalMemory` assumes the cap is a
    hard ceiling, not a soft target.
    """
    if len(text) <= MAX_TURN_CHARS:
        return text
    keep = MAX_TURN_CHARS - len(_TRUNCATION_SUFFIX)
    return text[:keep] + _TRUNCATION_SUFFIX


def trim_history(messages: list[ChatMessage]) -> list[ChatMessage]:
    """Apply turn-cap + per-message char-cap.

    Order of operations:

      1. Pop a leading ``system`` message if present — it is special,
         it acts as a session-level instruction and must survive any
         turn cap. (The web UI does not currently send one but CLI
         callers can.)
      2. Keep only the last ``MAX_TURNS * 2`` non-system messages —
         this is the simplest stable approximation of "last N
         user+assistant pairs" without enforcing strict alternation
         (which we cannot assume — a buggy client could emit
         ``user,user,assistant``).
      3. Per-message truncate each survivor to ``MAX_TURN_CHARS``.

    Idempotent: calling :func:`trim_history` on its own output is a
    no-op. ``trim_history([])`` returns ``[]``.
    """
    # Imported here (not at module top) to avoid a partial-init cycle
    # via ``agent_v2.api.__init__`` which eagerly pulls the orchestrator
    # graph in. The :class:`ChatMessage` symbol is otherwise only used
    # in type-hint position (deferred by ``from __future__ import
    # annotations``).
    from ..api.solve_request import ChatMessage

    if not messages:
        return []

    head: list[ChatMessage] = []
    body = list(messages)
    if body and body[0].role == "system":
        head = [body[0]]
        body = body[1:]

    if len(body) > MAX_TURNS * 2:
        body = body[-(MAX_TURNS * 2):]

    trimmed = head + [
        ChatMessage(role=m.role, content=_truncate(m.content)) for m in body
    ]
    return trimmed


def _total_chars(messages: list[ChatMessage]) -> int:
    return sum(len(m.content) for m in messages)


def too_long(messages: list[ChatMessage]) -> bool:
    """True iff the trimmed list still busts :data:`MAX_TOTAL_CHARS`.

    Public name (no underscore) so the orchestrator can call it without
    poking at module internals. The ticket pseudo-code uses
    ``_too_long`` — kept here as a private alias for fidelity.
    """
    return _total_chars(messages) > MAX_TOTAL_CHARS


# Private alias matching the ticket's pseudo-code spelling.
_too_long = too_long


def _to_text(msgs: list[ChatMessage]) -> str:
    """Render a chunk of turns as a flat transcript for the summariser.

    Format mirrors how the planner concatenates turns into a single
    user prompt; the summariser sees the same shape it would have seen
    if the LLM had been given the raw history, modulo turn markers.
    """
    parts: list[str] = []
    for m in msgs:
        parts.append(f"{m.role.upper()}: {m.content}")
    return "\n\n".join(parts)


async def summarize_oldest_half(
    llm: LLMClient, msgs: list[ChatMessage]
) -> ChatMessage:
    """Compress the oldest half of ``msgs`` into one ``system`` message.

    Uses the request's *own* LLM client — by design, per the ticket:
    a per-request user-scoped key is billed for the summary so cost
    attribution stays clean.

    Returns a single :class:`ChatMessage` with role ``system`` and a
    ``[Earlier turns, summarized]`` prefix so the planner system
    prompt can be instructed (by the caller) to treat it as
    best-effort. If the LLM call raises, the caller falls back to the
    raw trim — see :func:`safe_summarize_oldest_half`.
    """
    from ..api.solve_request import ChatMessage
    from ..llm.base import ChatMessage as LLMChatMessage
    from ..prompts import get_prompt

    half = max(1, len(msgs) // 2)
    older = msgs[:half]

    prompt = get_prompt(_SUMMARISER_SLUG) + "\n\n" + _to_text(older)
    resp = await llm.chat(
        messages=[LLMChatMessage(role="user", content=prompt)],
        max_tokens=512,
        temperature=0.0,
    )
    body = (resp.text or "").strip() or "(no summary generated)"
    summary_prefix = get_prompt(_SUMMARY_PREFIX_SLUG)
    return ChatMessage(role="system", content=f"{summary_prefix}\n{body}")


async def safe_summarize_oldest_half(
    llm: LLMClient,
    msgs: list[ChatMessage],
) -> tuple[list[ChatMessage], str | None]:
    """Summarise + assemble final history, returning a warning on failure.

    Return value:
      * ``(new_history, None)`` on success — ``new_history`` is
        ``[summary, *newer]`` ready to feed the planner.
      * ``(msgs, warning_text)`` on LLM failure — falls back to the
        raw trim; the caller is expected to emit a ``warning_event``
        with the returned text. The orchestrator never raises through
        this seam.

    The fall-back path matches the ticket's risk-table mitigation
    verbatim.
    """
    half = max(1, len(msgs) // 2)
    newer = msgs[half:]
    try:
        summary = await summarize_oldest_half(llm, msgs)
    except Exception as exc:  # noqa: BLE001 — surface to caller as warning
        log.warning("history summariser failed; falling back to raw trim: %s", exc)
        return msgs, f"history summariser failed: {exc}"
    return [summary, *newer], None


__all__ = [
    "MAX_TOTAL_CHARS",
    "MAX_TURNS",
    "MAX_TURN_CHARS",
    "safe_summarize_oldest_half",
    "summarize_oldest_half",
    "too_long",
    "trim_history",
]
