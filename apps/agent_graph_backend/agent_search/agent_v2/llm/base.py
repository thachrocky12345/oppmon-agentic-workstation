# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Provider-agnostic LLM interface.

Mirrors Arkon's `apps/api/src/lib/llm/types.ts` and oracle-loop wire format:
every implementation accepts the same `ChatMessage` history + `ToolDef[]`
and returns a `ChatResponse` with optional `tool_calls`.

The reactive loop only depends on this `Protocol` — never on a concrete SDK.
"""

from __future__ import annotations

from typing import Any, Literal, Protocol, runtime_checkable

from pydantic import BaseModel, Field


Role = Literal["system", "user", "assistant", "tool"]


class ChatMessage(BaseModel):
    """Single turn in the conversation. Tool-result messages use role='tool'."""

    role: Role
    content: str = ""
    # For role='assistant': any tool calls the model requested this turn.
    tool_calls: list["ToolCall"] = Field(default_factory=list)
    # For role='tool': which tool_call_id this is a result for.
    tool_call_id: str | None = None
    # For role='tool': the tool's name (some providers want it explicit).
    name: str | None = None


class ToolCall(BaseModel):
    """An LLM-requested tool invocation."""

    id: str
    name: str
    # JSON-serializable argument dict (already parsed from the model's output).
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolDef(BaseModel):
    """JSON-Schema tool definition handed to the LLM.

    `parameters` follows the JSON-Schema convention with `type: "object"`,
    `properties: {...}`, `required: [...]` — identical to OpenAI function-calling
    and to Anthropic `input_schema`.
    """

    name: str
    description: str
    parameters: dict[str, Any]


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0


class ChatResponse(BaseModel):
    """One round-trip from the LLM."""

    text: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    stop_reason: str | None = None
    usage: Usage = Field(default_factory=Usage)


# Resolve forward refs
ChatMessage.model_rebuild()


@runtime_checkable
class LLMClient(Protocol):
    """Provider-agnostic async chat client.

    Implementations: AnthropicClient, OpenAIClient, FakeLLMClient (for tests).

    Streaming is intentionally NOT in the v1 protocol — the reactive loop
    works on full-turn responses. SSE token-level streaming is layered on
    top of this by the orchestrator if needed.
    """

    async def chat(
        self,
        *,
        messages: list[ChatMessage],
        tools: list[ToolDef] | None = None,
        max_tokens: int | None = None,
        temperature: float | None = None,
    ) -> ChatResponse:
        ...


__all__ = [
    "ChatMessage",
    "ChatResponse",
    "LLMClient",
    "Role",
    "ToolCall",
    "ToolDef",
    "Usage",
]
