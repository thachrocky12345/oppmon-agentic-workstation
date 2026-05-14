"""Factory that returns the configured `LLMClient`.

Two entry points:
  - `create_llm_client(s)` — env/Settings-driven (the process default).
    Used by `mount_v2()` at startup.
  - `create_llm_client_from_spec(provider=..., api_key=..., model=..., ...)`
    — explicit spec, bypasses Settings entirely. Used by request handlers
    that want to honor a per-request override (future `/solve_v2` payload
    field; not wired yet).

Adding a new provider:
  1. Add the literal to `Provider` in `config.py`.
  2. Add `<name>_api_key`, `<name>_model`, etc. fields to `Settings`.
  3. Extend `require_llm_credentials()`.
  4. Add a branch in both `create_llm_client` and `create_llm_client_from_spec`.
  5. Write/extend an `LLMClient` implementation in this package.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ..config import Settings, settings as _default_settings
from .base import LLMClient

if TYPE_CHECKING:
    pass


# ---------------------------------------------------------------------------
# Env / Settings-driven path (process-wide default)
# ---------------------------------------------------------------------------


def create_llm_client(s: Settings | None = None) -> LLMClient:
    """Build the configured LLMClient from Settings (env-driven).

    Honors `s.llm_provider`. Raises `RuntimeError` via `require_llm_credentials`
    if the configured provider is missing its API key.
    """
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
    if s.llm_provider == "cerebras":
        from .cerebras_client import CerebrasClient

        s.require_llm_credentials()
        return CerebrasClient(
            api_key=s.cerebras_api_key,
            model=s.cerebras_model,
            api_base=s.cerebras_api_base or None,
            max_tokens=s.cerebras_max_tokens,
        )
    if s.llm_provider == "fake":
        from .fake_client import FakeLLMClient

        return FakeLLMClient.echo()
    raise ValueError(f"Unknown LLM_PROVIDER: {s.llm_provider!r}")


# ---------------------------------------------------------------------------
# Explicit-spec path (request-payload override hook)
# ---------------------------------------------------------------------------


def create_llm_client_from_spec(
    provider: str,
    *,
    api_key: str,
    model: str,
    api_base: str | None = None,
    max_tokens: int = 4096,
    timeout: float = 60.0,
) -> LLMClient:
    """Build an LLMClient directly from an explicit spec.

    Used when a request payload supplies its own model + key (e.g. an
    operator-approved model passed through `/solve_v2`). Bypasses Settings
    entirely so request-scoped credentials never leak into the process-wide
    default.

    `provider` accepts the same literals as `Settings.llm_provider`. The
    OpenAI-compatible branches (`openai`, `cerebras`) also accept an explicit
    `api_base` so a tenant can point at any compatible gateway (LiteLLM,
    self-hosted vLLM, Together, Groq, etc.) without code changes.

    Raises:
        ValueError: unknown provider.
        RuntimeError: missing credentials for a provider that needs them.
    """
    p = provider.lower()

    if p == "anthropic":
        if not api_key:
            raise RuntimeError("anthropic provider requires api_key")
        from .anthropic_client import AnthropicClient

        return AnthropicClient(api_key=api_key, model=model, max_tokens=max_tokens)

    if p == "cerebras":
        if not api_key:
            raise RuntimeError("cerebras provider requires api_key")
        from .cerebras_client import CerebrasClient

        return CerebrasClient(
            api_key=api_key,
            model=model,
            api_base=api_base,
            max_tokens=max_tokens,
            timeout=timeout,
        )

    # Generic OpenAI-compatible path covers OpenAI proper, Together,
    # Groq, LiteLLM gateway, vLLM, etc. The caller supplies api_base.
    if p in ("openai", "openai_compatible", "groq", "together", "litellm"):
        if not api_key:
            raise RuntimeError(f"{p} provider requires api_key")
        from .openai_client import OpenAIClient

        return OpenAIClient(
            api_key=api_key,
            model=model,
            api_base=api_base,
            max_tokens=max_tokens,
            timeout=timeout,
        )

    if p == "fake":
        from .fake_client import FakeLLMClient

        return FakeLLMClient.echo()

    raise ValueError(f"Unknown provider: {provider!r}")


__all__ = ["create_llm_client", "create_llm_client_from_spec"]
