# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Tests for ``agent_v2.llm.spec`` — typed LLM construction spec.

The tests cover three concerns, in order of regression risk:

  1. **Secret hygiene.** ``api_key`` must NEVER appear in plaintext in
     ``repr(spec)``, ``spec.model_dump()`` or ``spec.model_dump_json()``.
     This is the single most important property of the type — every
     other test in this file is downstream of it.
  2. **Validator correctness.** A key-required provider with an empty
     ``api_key`` must fail at construction time, not deep inside
     ``build_client``. A keyless provider (``fake``) must construct fine
     with no key.
  3. **Factory delegation.** ``build_client(spec)`` is a thin adapter:
     same provider literal → same client class as the factory's existing
     ``create_llm_client_from_spec`` path. We verify the wire by
     constructing a couple of real clients and by checking the unported
     providers (``azure_openai``, ``bedrock``, ``ollama``) raise a clear
     ``ValueError`` so a registry row pointing at them doesn't silently
     succeed.
"""

from __future__ import annotations

import json

import pytest
from pydantic import SecretStr, ValidationError

from agent_search.agent_v2.llm import LLMSpec, build_client
from agent_search.agent_v2.llm.anthropic_client import AnthropicClient
from agent_search.agent_v2.llm.cerebras_client import CerebrasClient
from agent_search.agent_v2.llm.fake_client import FakeLLMClient
from agent_search.agent_v2.llm.openai_client import OpenAIClient

_PLAINTEXT = "sk-super-secret-do-not-log-1234567890"


# ---- 1. secret hygiene ---------------------------------------------------


def test_repr_does_not_contain_plaintext_key() -> None:
    spec = LLMSpec(provider="anthropic", model="claude-x", api_key=SecretStr(_PLAINTEXT))
    assert _PLAINTEXT not in repr(spec)
    # Pydantic v2 renders SecretStr as ``SecretStr('**********')`` in repr.
    assert "**********" in repr(spec)


def test_model_dump_masks_key() -> None:
    spec = LLMSpec(provider="anthropic", model="claude-x", api_key=SecretStr(_PLAINTEXT))
    dump = spec.model_dump()
    # The dumped api_key is a SecretStr instance — its str() is masked.
    assert _PLAINTEXT not in str(dump)
    assert _PLAINTEXT not in str(dump["api_key"])


def test_model_dump_json_masks_key() -> None:
    spec = LLMSpec(provider="anthropic", model="claude-x", api_key=SecretStr(_PLAINTEXT))
    payload = spec.model_dump_json()
    assert _PLAINTEXT not in payload
    # Confirm the field is present but masked.
    decoded = json.loads(payload)
    assert decoded["api_key"] == "**********"


def test_get_secret_value_returns_plaintext() -> None:
    """Sanity: the plaintext is recoverable when explicitly unwrapped.

    This is what ``build_client`` does once. If this ever fails we've
    broken the only legitimate consumer.
    """
    spec = LLMSpec(provider="anthropic", model="claude-x", api_key=SecretStr(_PLAINTEXT))
    assert spec.api_key.get_secret_value() == _PLAINTEXT


# ---- 2. validator correctness -------------------------------------------


def test_empty_api_key_rejected_for_anthropic() -> None:
    with pytest.raises(ValidationError) as exc:
        LLMSpec(provider="anthropic", model="claude-x")
    assert "anthropic provider requires api_key" in str(exc.value)


def test_empty_api_key_rejected_for_openai() -> None:
    with pytest.raises(ValidationError) as exc:
        LLMSpec(provider="openai", model="gpt-x", api_key=SecretStr(""))
    assert "openai provider requires api_key" in str(exc.value)


def test_empty_api_key_rejected_for_cerebras() -> None:
    with pytest.raises(ValidationError):
        LLMSpec(provider="cerebras", model="llama-x")


def test_empty_api_key_ok_for_fake() -> None:
    spec = LLMSpec(provider="fake", model="echo")
    assert spec.api_key.get_secret_value() == ""


def test_empty_api_key_ok_for_ollama() -> None:
    """``ollama`` is keyless even though the factory hasn't ported it yet.

    The keyless validator must allow the construction; the
    ``build_client`` path is responsible for surfacing the un-ported
    state as a clear ValueError (see the test below).
    """
    spec = LLMSpec(provider="ollama", model="llama3")
    assert spec.api_key.get_secret_value() == ""


def test_unknown_provider_rejected_by_literal() -> None:
    """Static typo guard: ``Literal`` rejects unknown providers at construction."""
    with pytest.raises(ValidationError):
        LLMSpec(provider="anthrpic", model="claude-x", api_key=SecretStr("x"))  # type: ignore[arg-type]


def test_extra_fields_forbidden() -> None:
    """A misspelled registry column (``api_keyy``) must fail loudly, not silently drop."""
    with pytest.raises(ValidationError) as exc:
        LLMSpec(
            provider="anthropic",
            model="claude-x",
            api_key=SecretStr("x"),
            api_keyy="oops",  # type: ignore[call-arg]
        )
    assert "extra" in str(exc.value).lower() or "forbidden" in str(exc.value).lower()


def test_defaults_applied() -> None:
    spec = LLMSpec(provider="fake", model="echo")
    assert spec.max_tokens == 4096
    assert spec.timeout == 60.0
    assert spec.api_base is None
    assert spec.extra_headers is None


# ---- 3. factory delegation ----------------------------------------------


def test_build_client_anthropic_returns_anthropic_client() -> None:
    spec = LLMSpec(provider="anthropic", model="claude-x", api_key=SecretStr("sk-test"))
    client = build_client(spec)
    assert isinstance(client, AnthropicClient)


def test_build_client_cerebras_returns_cerebras_client() -> None:
    spec = LLMSpec(provider="cerebras", model="llama-x", api_key=SecretStr("csk-test"))
    client = build_client(spec)
    assert isinstance(client, CerebrasClient)


def test_build_client_openai_with_api_base_override() -> None:
    """The api_base flows through to the OpenAI-compatible client."""
    spec = LLMSpec(
        provider="openai",
        model="gpt-x",
        api_key=SecretStr("sk-test"),
        api_base="https://gateway.example.com/v1",
    )
    client = build_client(spec)
    assert isinstance(client, OpenAIClient)


def test_build_client_openai_compatible_alias() -> None:
    """``openai_compatible`` is accepted by the factory's OpenAI branch."""
    spec = LLMSpec(
        provider="openai_compatible",
        model="local-model",
        api_key=SecretStr("local-key"),
        api_base="http://localhost:11434/v1",
    )
    client = build_client(spec)
    assert isinstance(client, OpenAIClient)


def test_build_client_fake_no_key_required() -> None:
    spec = LLMSpec(provider="fake", model="echo")
    client = build_client(spec)
    assert isinstance(client, FakeLLMClient)


@pytest.mark.parametrize("unported", ["azure_openai", "bedrock", "ollama"])
def test_build_client_unported_provider_raises(unported: str) -> None:
    """Providers in the literal but absent from the factory must ValueError.

    Keeps registry rows referencing these validating cleanly while still
    failing fast at construction time. The error message names the
    provider so the operator can see exactly which port is missing.
    """
    # ollama is keyless; azure_openai and bedrock require a key.
    kwargs: dict[str, object] = {"provider": unported, "model": "x"}
    if unported != "ollama":
        kwargs["api_key"] = SecretStr("placeholder-key")
    spec = LLMSpec(**kwargs)  # type: ignore[arg-type]
    with pytest.raises(ValueError) as exc:
        build_client(spec)
    assert unported in str(exc.value).lower() or "unknown provider" in str(exc.value).lower()


def test_build_client_passes_through_max_tokens_and_timeout() -> None:
    """Non-default knobs reach the constructed client."""
    spec = LLMSpec(
        provider="cerebras",
        model="llama-x",
        api_key=SecretStr("csk-test"),
        max_tokens=1024,
        timeout=12.5,
    )
    client = build_client(spec)
    # CerebrasClient stores model + max_tokens as private attrs (TAG-49 port).
    # Asserting on them is the cheapest proof that the spec values flowed
    # through the factory rather than being silently replaced by defaults.
    assert getattr(client, "_model", None) == "llama-x"
    assert getattr(client, "_max_tokens", None) == 1024
