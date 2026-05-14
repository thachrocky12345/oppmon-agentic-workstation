"""Factory that returns the configured `LLMClient` based on settings."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ..config import Settings, settings as _default_settings
from .base import LLMClient

if TYPE_CHECKING:
    pass


def create_llm_client(s: Settings | None = None) -> LLMClient:
    s = s or _default_settings
    if s.llm_provider == "anthropic":
        from .anthropic_client import AnthropicClient

        s.require_llm_credentials()
        return AnthropicClient(
            api_key=s.anthropic_api_key,
            model=s.anthropic_model,
            max_tokens=s.anthropic_max_tokens,
        )
    if s.llm_provider == "openai":
        from .openai_client import OpenAIClient

        s.require_llm_credentials()
        return OpenAIClient(
            api_key=s.openai_api_key,
            model=s.openai_model,
            api_base=s.openai_api_base,
            max_tokens=s.openai_max_tokens,
        )
    if s.llm_provider == "fake":
        from .fake_client import FakeLLMClient

        return FakeLLMClient.echo()
    raise ValueError(f"Unknown LLM_PROVIDER: {s.llm_provider!r}")


__all__ = ["create_llm_client"]
