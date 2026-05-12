"""Anthropic Claude provider.

Uses native `tool_use` blocks (Anthropic Messages API). The official `anthropic`
SDK is an optional dependency — we import lazily so test environments without
the package still work via `FakeLLMClient`.
"""

from __future__ import annotations

import json
from typing import Any

from .base import ChatMessage, ChatResponse, ToolCall, ToolDef, Usage


class AnthropicClient:
    """Implements `LLMClient` structurally."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        max_tokens: int = 4096,
        timeout: float = 60.0,
    ):
        try:
            import anthropic  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "anthropic package not installed. Run: pip install 'anthropic>=0.39'"
            ) from e
        self._anthropic = anthropic
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout)
        self._model = model
        self._max_tokens = max_tokens

    # ---- LLMClient ----

    async def chat(
        self,
        *,
        messages: list[ChatMessage],
        tools: list[ToolDef] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> ChatResponse:
        system_text, msg_payload = _split_system_and_messages(messages)
        tool_payload = [_tool_to_anthropic(t) for t in (tools or [])]

        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": max_tokens or self._max_tokens,
            "messages": msg_payload,
        }
        if system_text:
            kwargs["system"] = system_text
        if tool_payload:
            kwargs["tools"] = tool_payload
        if temperature is not None:
            kwargs["temperature"] = temperature

        resp = await self._client.messages.create(**kwargs)

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        for block in resp.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                text_parts.append(block.text)
            elif btype == "tool_use":
                tool_calls.append(
                    ToolCall(
                        id=block.id,
                        name=block.name,
                        arguments=dict(block.input or {}),
                    )
                )

        return ChatResponse(
            text="".join(text_parts),
            tool_calls=tool_calls,
            stop_reason=getattr(resp, "stop_reason", None),
            usage=Usage(
                input_tokens=getattr(resp.usage, "input_tokens", 0),
                output_tokens=getattr(resp.usage, "output_tokens", 0),
            ),
        )


def _split_system_and_messages(
    messages: list[ChatMessage],
) -> tuple[str, list[dict[str, Any]]]:
    """Anthropic wants `system` as a separate top-level arg, not a message."""
    system_chunks: list[str] = []
    out: list[dict[str, Any]] = []
    for m in messages:
        if m.role == "system":
            system_chunks.append(m.content)
            continue
        if m.role == "tool":
            out.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": m.tool_call_id or "",
                            "content": m.content,
                        }
                    ],
                }
            )
            continue
        if m.role == "assistant" and m.tool_calls:
            blocks: list[dict[str, Any]] = []
            if m.content:
                blocks.append({"type": "text", "text": m.content})
            for tc in m.tool_calls:
                blocks.append(
                    {
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.arguments,
                    }
                )
            out.append({"role": "assistant", "content": blocks})
            continue
        # Plain user or assistant text message.
        out.append({"role": m.role, "content": m.content})
    return "\n\n".join(system_chunks), out


def _tool_to_anthropic(tool: ToolDef) -> dict[str, Any]:
    return {
        "name": tool.name,
        "description": tool.description,
        "input_schema": tool.parameters,
    }


__all__ = ["AnthropicClient"]
