"""Deterministic LLM stub for tests.

Two modes:
- `FakeLLMClient.scripted([resp1, resp2, ...])`: returns scripted responses in order.
- `FakeLLMClient.echo()`: returns the last user message as text (no tool calls).
"""

from __future__ import annotations

from typing import Any, Iterable

from .base import ChatMessage, ChatResponse, LLMClient, ToolCall, ToolDef


class FakeLLMClient:
    """Deterministic stub. Implements `LLMClient` structurally (duck-typed)."""

    def __init__(self, script: list[ChatResponse]):
        self._script = list(script)
        self._idx = 0
        self.calls: list[dict[str, Any]] = []

    # ---- factories ----

    @classmethod
    def scripted(cls, turns: Iterable[dict[str, Any]]) -> "FakeLLMClient":
        """Build from a list of raw dicts: {text?, tool_calls?[{name, args}]}."""
        responses: list[ChatResponse] = []
        for i, t in enumerate(turns):
            tcs = []
            for j, tc in enumerate(t.get("tool_calls", [])):
                tcs.append(
                    ToolCall(
                        id=tc.get("id", f"call_{i}_{j}"),
                        name=tc["name"],
                        arguments=tc.get("args", {}) or tc.get("arguments", {}),
                    )
                )
            responses.append(
                ChatResponse(
                    text=t.get("text", ""),
                    tool_calls=tcs,
                    stop_reason=t.get("stop_reason"),
                )
            )
        return cls(responses)

    @classmethod
    def echo(cls) -> "FakeLLMClient":
        """A single-turn echo client — useful for trivial smoke tests."""
        return cls([ChatResponse(text="echo")])

    # ---- LLMClient protocol ----

    async def chat(
        self,
        *,
        messages: list[ChatMessage],
        tools: list[ToolDef] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> ChatResponse:
        self.calls.append(
            {
                "messages": [m.model_dump() for m in messages],
                "tools": [t.model_dump() for t in (tools or [])],
                "max_tokens": max_tokens,
                "temperature": temperature,
            }
        )
        if self._idx >= len(self._script):
            # Once the script is exhausted, return a no-tool-call response so
            # the reactive loop terminates cleanly instead of hanging.
            return ChatResponse(text="(script exhausted)", stop_reason="end_turn")
        resp = self._script[self._idx]
        self._idx += 1
        return resp


__all__ = ["FakeLLMClient"]
