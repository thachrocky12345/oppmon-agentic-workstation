# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""OpenAI Chat Completions provider with function-calling.

Lazy-imports the SDK so environments without it can still use `FakeLLMClient`.
"""

from __future__ import annotations

import json
from typing import Any

from .base import ChatMessage, ChatResponse, ToolCall, ToolDef, Usage


class OpenAIClient:
    """Implements `LLMClient` structurally."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        api_base: str | None = None,
        max_tokens: int = 4096,
        timeout: float = 60.0,
    ):
        try:
            from openai import AsyncOpenAI  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "openai package not installed. Run: pip install 'openai>=1.50'"
            ) from e
        client_kwargs: dict[str, Any] = {"api_key": api_key, "timeout": timeout}
        if api_base:
            client_kwargs["base_url"] = api_base
        self._client = AsyncOpenAI(**client_kwargs)
        self._model = model
        self._max_tokens = max_tokens

    async def chat(
        self,
        *,
        messages: list[ChatMessage],
        tools: list[ToolDef] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> ChatResponse:
        payload_msgs = [_msg_to_openai(m) for m in messages]
        payload_tools = [_tool_to_openai(t) for t in (tools or [])]

        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": payload_msgs,
            "max_tokens": max_tokens or self._max_tokens,
        }
        if payload_tools:
            kwargs["tools"] = payload_tools
            kwargs["tool_choice"] = "auto"
        if temperature is not None:
            kwargs["temperature"] = temperature

        resp = await self._client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        msg = choice.message

        tool_calls: list[ToolCall] = []
        for tc in getattr(msg, "tool_calls", None) or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {"_raw": tc.function.arguments}
            tool_calls.append(
                ToolCall(id=tc.id, name=tc.function.name, arguments=args)
            )

        usage_obj = getattr(resp, "usage", None)
        return ChatResponse(
            text=msg.content or "",
            tool_calls=tool_calls,
            stop_reason=choice.finish_reason,
            usage=Usage(
                input_tokens=getattr(usage_obj, "prompt_tokens", 0) or 0,
                output_tokens=getattr(usage_obj, "completion_tokens", 0) or 0,
            ),
        )


def _msg_to_openai(m: ChatMessage) -> dict[str, Any]:
    if m.role == "tool":
        return {
            "role": "tool",
            "tool_call_id": m.tool_call_id or "",
            "content": m.content,
        }
    if m.role == "assistant" and m.tool_calls:
        return {
            "role": "assistant",
            "content": m.content or None,
            "tool_calls": [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.name,
                        "arguments": json.dumps(tc.arguments),
                    },
                }
                for tc in m.tool_calls
            ],
        }
    return {"role": m.role, "content": m.content}


def _tool_to_openai(tool: ToolDef) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters,
        },
    }


__all__ = ["OpenAIClient"]
