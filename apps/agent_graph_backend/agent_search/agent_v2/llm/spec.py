# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""``LLMSpec`` — typed wire contract from registry/auth resolution to the
LLM factory.

TAG-49 introduced ``create_llm_client_from_spec(...)`` as a kwargs-bag
entry point. That was fine as an internal seam but it has two problems
for the upcoming TAG-57+ work that resolves an ``LLMSpec`` from a
per-request model id:

  1. Nothing prevents a caller from passing a plaintext ``api_key`` into
     a log line, a trace span, or a ``repr()``. The caller has to
     remember to be careful — which they won't.
  2. ``provider``, ``api_key``, ``model``, ``api_base`` etc. are
     untyped at the call boundary. A typo (``"anthrpic"``) only fails
     deep inside the factory's branch ladder.

``LLMSpec`` fixes both. The ``api_key`` field is a ``SecretStr`` so
``repr``, ``model_dump``, and ``model_dump_json`` all mask it by default.
The ``provider`` field is a closed ``Literal`` so static checkers and
Pydantic both reject typos at construction time. And a single
``@model_validator`` runs at construction time to ensure providers that
need a key actually got one.

``build_client(spec)`` is the only public function that ever unmasks
``api_key`` — and it does so once, just long enough to hand the value to
``create_llm_client_from_spec``. The plaintext never escapes this
module's frame.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator

from .base import LLMClient
from .factory import create_llm_client_from_spec

# Closed set of providers the gateway can route to. Includes every
# provider that has a concrete client in this package OR is documented
# in TAG-49's audit as "shipped in TS, port pending" — keeping
# ``azure_openai``, ``bedrock`` and ``ollama`` in the literal means
# downstream registry rows that reference them validate cleanly even
# though ``build_client`` will currently ``ValueError`` for the unported
# ones. The factory's error message tells the operator exactly which
# port is missing.
Provider = Literal[
    "anthropic",
    "openai",
    "openai_compatible",
    "cerebras",
    "azure_openai",
    "bedrock",
    "ollama",
    "fake",
]

# Providers that DON'T need an API key. Used by the validator and by
# tests — keep it as a single source of truth.
_KEYLESS_PROVIDERS: frozenset[str] = frozenset({"ollama", "fake"})


class LLMSpec(BaseModel):
    """Typed parameters for constructing an ``LLMClient``.

    The schema is intentionally narrow — it carries exactly what the
    factory needs and nothing more. Per-request overrides like
    ``temperature`` belong on the call site (``LLMClient.chat(...)``),
    not the construction spec.

    Repr / dump safety: ``api_key`` is a ``SecretStr`` so ``repr(spec)``,
    ``spec.model_dump()``, and ``spec.model_dump_json()`` all emit a
    mask (``'**********'``) instead of the plaintext. The only way to
    extract the plaintext is ``spec.api_key.get_secret_value()`` — and
    the only place that's called is ``build_client`` below.
    """

    # Forbid extras so a typo in a registry row (e.g. ``api_keyy``)
    # surfaces as a validation error instead of being silently dropped.
    model_config = ConfigDict(extra="forbid")

    provider: Provider
    model: str
    api_key: SecretStr = Field(default=SecretStr(""))
    api_base: str | None = None
    extra_headers: dict[str, str] | None = None
    max_tokens: int = 4096
    timeout: float = 60.0

    @model_validator(mode="after")
    def _require_key_when_provider_needs_it(self) -> LLMSpec:
        """Fail closed if a key-required provider has an empty ``api_key``.

        ``SecretStr`` includes the empty string as a legal value, so we
        must explicitly check. Without this, the factory would raise a
        ``RuntimeError`` deep in the dispatch — by failing at
        construction we keep the error close to the caller and make
        validation testable without instantiating any HTTP client.
        """
        if self.provider not in _KEYLESS_PROVIDERS and not self.api_key.get_secret_value():
            raise ValueError(f"{self.provider} provider requires api_key")
        return self


def build_client(spec: LLMSpec) -> LLMClient:
    """Construct an ``LLMClient`` from an ``LLMSpec``.

    This is the single place ``api_key.get_secret_value()`` is unmasked.
    The plaintext is bound to a local, handed straight to the factory,
    and never returned to the caller — the caller gets the constructed
    ``LLMClient`` (which holds its own private reference to the key).

    ``extra_headers`` is accepted on the spec for forward-compat but is
    NOT currently plumbed through any concrete client; TAG-49's gap
    audit owns the follow-up port.

    Raises:
        ValueError: ``spec.provider`` is in the literal but the factory
            does not yet have a client for it (``azure_openai``,
            ``bedrock``, ``ollama``).
        RuntimeError: factory-side credential validation failed. The
            ``LLMSpec`` validator should make this unreachable in
            practice — it's only here as a defensive backstop.
    """
    return create_llm_client_from_spec(
        provider=spec.provider,
        api_key=spec.api_key.get_secret_value(),
        model=spec.model,
        api_base=spec.api_base,
        max_tokens=spec.max_tokens,
        timeout=spec.timeout,
    )


__all__ = ["LLMSpec", "Provider", "build_client"]
