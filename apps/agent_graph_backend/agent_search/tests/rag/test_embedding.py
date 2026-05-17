# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Tests for ``agent_v2/rag/embedding.py`` (TAG-60).

Covers the five cases mandated by the ticket plus a factory smoke:

    1.  Fake provider is deterministic.
    2.  Fake provider's ``dim`` matches output length.
    3.  OpenAI provider (mocked SDK) returns expected dim.
    4.  Dim mismatch raises ``RuntimeError`` (corpus-drift guardrail).
    5.  Empty ``api_key`` for OpenAI provider raises ``RuntimeError``.

Plus:
    6.  Factory: ``embedding_provider="fake"`` returns ``FakeEmbeddingProvider``.
    7.  Factory: ``embedding_provider="openai"`` returns ``OpenAIEmbeddingProvider``
        using the chat key when embed key is unset (dev-ergonomics fallback).

The OpenAI SDK is patched at the import-site (``rag.embedding`` rebinds
``AsyncOpenAI`` into its own namespace at import; patching
``openai.AsyncOpenAI`` after import is a no-op — same idiom as the
TAG-57 monkeypatch lesson).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from agent_search.agent_v2 import config as config_mod
from agent_search.agent_v2.rag import embedding as embed_mod
from agent_search.agent_v2.rag.embedding import (
    FakeEmbeddingProvider,
    OpenAIEmbeddingProvider,
    create_embedding_provider,
)


# ---- 1) Fake determinism -------------------------------------------------


async def test_fake_provider_is_deterministic() -> None:
    p = FakeEmbeddingProvider(dim=16)
    v1 = await p.embed_query("the quick brown fox")
    v2 = await p.embed_query("the quick brown fox")
    assert v1 == v2
    # Different input → different vector (sanity: not always identical).
    v3 = await p.embed_query("a different sentence")
    assert v1 != v3


# ---- 2) Fake dim matches output -----------------------------------------


@pytest.mark.parametrize("dim", [1, 8, 16, 32])
async def test_fake_provider_dim_matches_output_length(dim: int) -> None:
    p = FakeEmbeddingProvider(dim=dim)
    vec = await p.embed_query("anything")
    assert len(vec) == dim == p.dim
    # Sanity-check the [0, 1] normalisation.
    assert all(0.0 <= x <= 1.0 for x in vec)


# ---- 3) OpenAI provider with mocked SDK ---------------------------------


def _make_fake_async_openai(vector: list[float]) -> Any:
    """Return a factory that mimics ``AsyncOpenAI(api_key=..., base_url=...)``
    and exposes ``.embeddings.create(...)`` as an ``AsyncMock`` returning
    a struct with the shape ``resp.data[0].embedding``."""

    def _factory(*, api_key: str, base_url: str | None = None) -> Any:  # noqa: ARG001
        client = MagicMock()
        client.embeddings = MagicMock()
        client.embeddings.create = AsyncMock(
            return_value=SimpleNamespace(
                data=[SimpleNamespace(embedding=vector)],
            ),
        )
        return client

    return _factory


async def test_openai_provider_returns_vector_with_expected_dim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_vec = [0.01 * i for i in range(1536)]
    monkeypatch.setattr(embed_mod, "AsyncOpenAI", _make_fake_async_openai(fake_vec))

    p = OpenAIEmbeddingProvider(
        api_key="sk-test-NOT-A-REAL-KEY",
        model="text-embedding-3-small",
        dim=1536,
    )
    vec = await p.embed_query("hello world")
    assert len(vec) == 1536
    assert vec == fake_vec


# ---- 4) Dim mismatch raises ---------------------------------------------


async def test_openai_provider_dim_mismatch_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Caller asserts 1536; SDK returns 384 (e.g. operator swapped model
    # env to a different family). MUST raise loudly.
    short_vec = [0.0] * 384
    monkeypatch.setattr(embed_mod, "AsyncOpenAI", _make_fake_async_openai(short_vec))

    p = OpenAIEmbeddingProvider(
        api_key="sk-test-NOT-A-REAL-KEY",
        model="text-embedding-3-small",
        dim=1536,
    )
    with pytest.raises(RuntimeError, match="embedding dim mismatch"):
        await p.embed_query("trigger mismatch")


# ---- 5) Empty api_key raises -------------------------------------------


def test_openai_provider_empty_key_raises() -> None:
    with pytest.raises(RuntimeError, match="api_key required"):
        OpenAIEmbeddingProvider(
            api_key="",
            model="text-embedding-3-small",
            dim=1536,
        )


# ---- 6) Factory: fake provider -----------------------------------------


def test_factory_returns_fake_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(config_mod.settings, "embedding_provider", "fake")
    # Production dim of 1536 must be clamped to a fake-safe value.
    monkeypatch.setattr(config_mod.settings, "embedding_dim", 1536)
    p = create_embedding_provider()
    assert isinstance(p, FakeEmbeddingProvider)
    # Clamped to fallback default 16 (production 1536 > 32 → unfit for fake).
    assert p.dim == 16


def test_factory_fake_respects_in_range_dim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(config_mod.settings, "embedding_provider", "fake")
    monkeypatch.setattr(config_mod.settings, "embedding_dim", 8)
    p = create_embedding_provider()
    assert isinstance(p, FakeEmbeddingProvider)
    assert p.dim == 8


# ---- 7) Factory: openai with chat-key fallback -------------------------


def test_factory_returns_openai_with_chat_key_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Embed-specific key is intentionally empty; chat key carries it.
    monkeypatch.setattr(config_mod.settings, "embedding_provider", "openai")
    monkeypatch.setattr(config_mod.settings, "embedding_model", "text-embedding-3-small")
    monkeypatch.setattr(config_mod.settings, "embedding_dim", 1536)
    monkeypatch.setattr(config_mod.settings, "openai_embed_api_key", "")
    monkeypatch.setattr(config_mod.settings, "openai_api_key", "sk-chat-NOT-A-REAL-KEY")
    monkeypatch.setattr(config_mod.settings, "openai_embed_api_base", "")

    # Use the captured-args factory so we can prove the chat key flowed
    # through without making a real client.
    captured: dict[str, Any] = {}

    def _capture_factory(*, api_key: str, base_url: str | None = None) -> Any:
        captured["api_key"] = api_key
        captured["base_url"] = base_url
        return MagicMock()

    monkeypatch.setattr(embed_mod, "AsyncOpenAI", _capture_factory)

    p = create_embedding_provider()
    assert isinstance(p, OpenAIEmbeddingProvider)
    assert p.dim == 1536
    assert captured["api_key"] == "sk-chat-NOT-A-REAL-KEY"
    # No embed-specific base configured → None (SDK uses default).
    assert captured["base_url"] is None


def test_factory_openai_prefers_embed_key_when_both_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(config_mod.settings, "embedding_provider", "openai")
    monkeypatch.setattr(config_mod.settings, "embedding_model", "text-embedding-3-small")
    monkeypatch.setattr(config_mod.settings, "embedding_dim", 1536)
    monkeypatch.setattr(config_mod.settings, "openai_embed_api_key", "sk-embed-NOT-A-REAL-KEY")
    monkeypatch.setattr(config_mod.settings, "openai_api_key", "sk-chat-NOT-A-REAL-KEY")
    monkeypatch.setattr(config_mod.settings, "openai_embed_api_base", "https://embed-pool.example/v1")

    captured: dict[str, Any] = {}

    def _capture_factory(*, api_key: str, base_url: str | None = None) -> Any:
        captured["api_key"] = api_key
        captured["base_url"] = base_url
        return MagicMock()

    monkeypatch.setattr(embed_mod, "AsyncOpenAI", _capture_factory)

    create_embedding_provider()
    # Embed-specific key wins over chat-side key.
    assert captured["api_key"] == "sk-embed-NOT-A-REAL-KEY"
    assert captured["base_url"] == "https://embed-pool.example/v1"


def test_fake_provider_rejects_dim_above_32() -> None:
    with pytest.raises(RuntimeError, match="dim must be 1..32"):
        FakeEmbeddingProvider(dim=64)
