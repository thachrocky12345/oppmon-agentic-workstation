# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Within-session conversational memory.

Holds the message list the LLM sees, with cheap token accounting so we know
when to summarize (>80% context, per Arkon `memory-manager.ts:627`).
"""

from __future__ import annotations

from ..llm.base import ChatMessage


class ConversationalMemory:
    """Message list with token accounting + soft summarization trigger.

    `summarize_when_over` defines the ratio at which `should_summarize()`
    starts returning True. Actual summarization is done by `summary.py` —
    this class only tracks the threshold.
    """

    def __init__(
        self,
        *,
        max_context_tokens: int = 100_000,
        summarize_when_over: float = 0.80,
    ):
        self._messages: list[ChatMessage] = []
        self._max_tokens = max_context_tokens
        self._summarize_ratio = summarize_when_over

    def append(self, message: ChatMessage) -> None:
        self._messages.append(message)

    def extend(self, messages: list[ChatMessage]) -> None:
        self._messages.extend(messages)

    def messages(self) -> list[ChatMessage]:
        return list(self._messages)

    def replace(self, messages: list[ChatMessage]) -> None:
        """Replace history after summarization."""
        self._messages = list(messages)

    def __len__(self) -> int:
        return len(self._messages)

    # ---- token accounting ----

    def estimated_tokens(self) -> int:
        """4-chars-per-token heuristic (Arkon uses the same rough estimate).

        For accuracy, swap in `tiktoken` later — same interface.
        """
        total_chars = 0
        for m in self._messages:
            total_chars += len(m.content or "")
            for tc in m.tool_calls:
                # Approximate cost of serializing tool call args.
                total_chars += len(tc.name) + len(str(tc.arguments))
        return max(1, total_chars // 4)

    def utilization(self) -> float:
        return self.estimated_tokens() / self._max_tokens

    def should_summarize(self) -> bool:
        return self.utilization() >= self._summarize_ratio


__all__ = ["ConversationalMemory"]
