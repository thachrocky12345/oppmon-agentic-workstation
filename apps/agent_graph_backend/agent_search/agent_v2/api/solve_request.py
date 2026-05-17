# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Request schema for ``POST /solve``.

Two distinct guardrails the validator enforces — both at construction
time so the route handler never has to defend them:

  * ``messages[-1].role == "user"`` — the orchestrator expects the
    final turn to be the question it answers. An assistant- or
    system-terminated history is almost always a client bug
    (off-by-one when appending), and producing a 422 here is
    cheaper than reasoning about a malformed plan later.

  * ``web_fallback OR collection_ids`` — at least one grounding
    source. With both off the planner has nothing to retrieve from
    and would either hallucinate or stall; we'd rather fail fast.

Wire/camelCase parity:
    Express writers emit ``collectionIds``, ``enableTools``,
    ``webFallback``. Pydantic ``populate_by_name`` accepts both the
    aliased camelCase and the Python snake_case so server-to-server
    bodies from ``apps/web`` validate without a transform step.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ChatMessage(BaseModel):
    """One turn in the chat history.

    Matches the OpenAI/Anthropic message shape so the planner can
    forward it to either LLM client without remapping.
    """

    model_config = ConfigDict(extra="forbid")

    role: Literal["system", "user", "assistant"]
    content: str


class SolveRequest(BaseModel):
    """Body of ``POST /solve``.

    Field aliases:
        * ``collection_ids`` ↔ ``collectionIds``
        * ``enable_tools``   ↔ ``enableTools``
        * ``web_fallback``   ↔ ``webFallback``
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    messages: list[ChatMessage] = Field(min_length=1)
    collection_ids: list[str] = Field(
        default_factory=list, alias="collectionIds"
    )
    model: str = Field(min_length=1)
    provider: str = Field(min_length=1)
    enable_tools: bool = Field(default=True, alias="enableTools")
    web_fallback: bool = Field(default=True, alias="webFallback")

    @model_validator(mode="after")
    def _at_least_one_grounding_source(self) -> SolveRequest:
        if not self.web_fallback and not self.collection_ids:
            # Static literal — same wording for every "no grounding"
            # case so callers can't probe internals via error text.
            raise ValueError(
                "webFallback=false requires at least one collectionId"
            )
        last = self.messages[-1]
        if last.role != "user":
            raise ValueError("last message must be a user message")
        return self


__all__ = ["ChatMessage", "SolveRequest"]
