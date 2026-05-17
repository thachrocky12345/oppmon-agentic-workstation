# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Cerebras Chat Completions provider.

Cerebras Cloud serves an OpenAI-compatible API at https://api.cerebras.ai/v1,
so we inherit `OpenAIClient` and only override the default `base_url`.

Why a separate class instead of just "configure OpenAIClient with a base_url"?
  - First-class provider identity for telemetry, logs, and future per-provider
    pricing/routing decisions (mirrors `apps/api/src/lib/llm/cerebras.ts`).
  - Lets the factory dispatch on a typed literal rather than guessing from
    a string `api_base`.
  - Keeps the contract: anyone reading `factory.py` can see all supported
    providers at a glance.

Confirmed-working models (tool-calling + multi-turn tool_result roundtrip):
  - llama3.1-8b
  - gpt-oss-120b           (needs strong system prompt; may fall back to
                            plain text content instead of calling finalize)
  - qwen-3-235b-a22b-instruct-2507
  - zai-glm-4.7
"""

from __future__ import annotations

from .openai_client import OpenAIClient


CEREBRAS_API_BASE = "https://api.cerebras.ai/v1"


class CerebrasClient(OpenAIClient):
    """OpenAI-compatible client pinned to Cerebras Cloud.

    Accepts the same kwargs as `OpenAIClient`. `api_base` defaults to the
    Cerebras endpoint but can be overridden for testing against a proxy.
    """

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        api_base: str | None = None,
        max_tokens: int = 4096,
        timeout: float = 60.0,
    ):
        super().__init__(
            api_key=api_key,
            model=model,
            api_base=api_base or CEREBRAS_API_BASE,
            max_tokens=max_tokens,
            timeout=timeout,
        )


__all__ = ["CerebrasClient", "CEREBRAS_API_BASE"]
