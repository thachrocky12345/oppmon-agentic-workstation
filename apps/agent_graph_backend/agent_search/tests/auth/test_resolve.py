# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Tests for ``agent_v2.auth.resolve.resolve_llm_spec``.

The resolver is the gluing layer between TAG-52/53 auth, TAG-55 registry
reads, TAG-54 vault decrypt, and TAG-56 ``LLMSpec``. The unit tests
exercise the *contract* — what the resolver returns or raises for each
input shape — by mocking the registry and the vault.

The seven ticket-mandated tests, plus a small set of defensive extras:

  1. Owned active anthropic model           → spec built, key decrypted
  2. Not-owned model id                     → 403 (registry returns None)
  3. Inactive (or soft-deleted) model       → 403 (registry returns None)
  4. Misconfigured: no secret row, key-required → 500
  5. Ollama model (no key needed)           → spec built, empty api_key
  6. Cross-tenant attempt                   → 403, not 404
  7. Error response leak grep               → ciphertext/nonce absent

Defensive extras:

  * Decrypt payload missing ``api_key``     → 500 (treated as misconfig)
  * VaultError on decrypt                   → 500
  * ``public_config`` overrides applied (api_base, max_tokens, timeout)
  * Fake provider                           → spec built, empty api_key
"""

from __future__ import annotations

import datetime as dt
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, status

from agent_search.agent_v2.auth import JWTClaims, resolve_llm_spec
from agent_search.agent_v2.auth import resolve as resolve_mod
from agent_search.agent_v2.crypto.vault import VaultError
from agent_search.agent_v2.db.models import ModelRow


_PLAINTEXT_KEY = "sk-not-a-real-key-just-a-test-fixture"
_CT_B64 = "QUVTLWNpcGhlcnRleHQtcGxhY2Vob2xkZXI="  # base64("AES-ciphertext-placeholder")
_NONCE_B64 = "bm9uY2UtMjQtYnl0ZXMtcGxhY2Vob2xkZXI="


def _claims(*, sub: str = "usr_caller", tenant_id: str = "tnt_caller") -> JWTClaims:
    now = int(dt.datetime.now(dt.UTC).timestamp())
    return JWTClaims(
        sub=sub,
        tenantId=tenant_id,
        role="MEMBER",
        exp=now + 3600,
        iat=now,
    )


def _row(
    *,
    provider: str = "anthropic",
    model: str = "claude-3-5-sonnet-20241022",
    has_secret: bool = True,
    public_config: dict[str, Any] | None = None,
    tenant_id: str = "tnt_caller",
) -> ModelRow:
    return ModelRow(
        id="mdl_test",
        tenant_id=tenant_id,
        scope="TENANT",
        team_id=None,
        created_by_id="usr_owner",
        display_name=f"{provider} {model}",
        provider_template_id=provider,
        model_identifier=model,
        public_config=public_config or {},
        enabled=True,
        secret_ciphertext=_CT_B64 if has_secret else None,
        secret_nonce=_NONCE_B64 if has_secret else None,
        secret_version=1 if has_secret else None,
    )


def _patch_registry(monkeypatch: pytest.MonkeyPatch, return_value: ModelRow | None) -> AsyncMock:
    mock = AsyncMock(return_value=return_value)
    monkeypatch.setattr(resolve_mod, "get_user_model", mock)
    return mock


def _patch_vault(
    monkeypatch: pytest.MonkeyPatch,
    return_value: dict[str, str] | None = None,
    side_effect: Exception | None = None,
) -> AsyncMock:
    """Patch ``decrypt_secret`` (sync function — MagicMock would be fine,
    but AsyncMock works because the resolver calls it synchronously
    inside the async coroutine and AsyncMock is callable as a normal
    function too)."""
    from unittest.mock import MagicMock

    mock = MagicMock()
    if side_effect is not None:
        mock.side_effect = side_effect
    else:
        mock.return_value = return_value or {"api_key": _PLAINTEXT_KEY}
    monkeypatch.setattr(resolve_mod, "decrypt_secret", mock)
    return mock


# ---- 1. happy path -------------------------------------------------------


@pytest.mark.asyncio
async def test_owned_active_anthropic_returns_spec_with_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_registry(monkeypatch, _row(provider="anthropic"))
    _patch_vault(monkeypatch, {"api_key": _PLAINTEXT_KEY})

    spec = await resolve_llm_spec(
        _claims(),
        model="claude-3-5-sonnet-20241022",
        provider="anthropic",
    )

    assert spec.provider == "anthropic"
    assert spec.model == "claude-3-5-sonnet-20241022"
    # api_key arrives masked but unwrapping returns the plaintext.
    assert spec.api_key.get_secret_value() == _PLAINTEXT_KEY


# ---- 2. not-owned / 3. inactive / 6. cross-tenant ----------------------


@pytest.mark.asyncio
async def test_not_owned_model_returns_403(monkeypatch: pytest.MonkeyPatch) -> None:
    """The registry returns None for any 'not yours' case (incl. wrong
    tenant, inactive, soft-deleted). The resolver must surface 403."""
    _patch_registry(monkeypatch, None)
    with pytest.raises(HTTPException) as exc:
        await resolve_llm_spec(
            _claims(),
            model="claude-x",
            provider="anthropic",
        )
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN
    assert exc.value.detail == "model not available for this user"


@pytest.mark.asyncio
async def test_inactive_model_returns_403(monkeypatch: pytest.MonkeyPatch) -> None:
    """``get_user_model`` already filters ``enabled=TRUE``; an inactive
    row never reaches the resolver. The test is a contract assertion
    that this code path matches the not-owned 403, not a 4xx variant."""
    _patch_registry(monkeypatch, None)
    with pytest.raises(HTTPException) as exc:
        await resolve_llm_spec(
            _claims(),
            model="claude-x",
            provider="anthropic",
        )
    assert exc.value.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_cross_tenant_attempt_returns_403_not_404(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A model that exists in tenant A is invisible to tenant B; the
    registry returns None and we 403. NEVER 404, because 404 would
    confirm the model exists in some other tenant."""
    _patch_registry(monkeypatch, None)
    with pytest.raises(HTTPException) as exc:
        await resolve_llm_spec(
            _claims(sub="usr_tenant_b", tenant_id="tnt_b"),
            model="claude-owned-by-tenant-a",
            provider="anthropic",
        )
    assert exc.value.status_code == 403
    assert exc.value.status_code != 404


# ---- 4. misconfigured: missing secret ----------------------------------


@pytest.mark.asyncio
async def test_missing_secret_for_key_required_provider_returns_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_registry(monkeypatch, _row(provider="anthropic", has_secret=False))
    # Vault must not even be called.
    vault = _patch_vault(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await resolve_llm_spec(
            _claims(),
            model="claude-x",
            provider="anthropic",
        )
    assert exc.value.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert exc.value.detail == "model misconfigured: missing secret"
    vault.assert_not_called()


@pytest.mark.asyncio
async def test_decrypt_payload_missing_api_key_returns_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Successful AEAD decrypt but payload lacks ``api_key`` field."""
    _patch_registry(monkeypatch, _row(provider="openai"))
    _patch_vault(monkeypatch, {"organization": "org-x"})

    with pytest.raises(HTTPException) as exc:
        await resolve_llm_spec(_claims(), model="gpt-x", provider="openai")
    assert exc.value.status_code == 500


@pytest.mark.asyncio
async def test_vault_error_surfaces_as_500_with_generic_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_registry(monkeypatch, _row(provider="cerebras"))
    _patch_vault(monkeypatch, side_effect=VaultError("decrypt failed"))

    with pytest.raises(HTTPException) as exc:
        await resolve_llm_spec(_claims(), model="llama-x", provider="cerebras")
    assert exc.value.status_code == 500
    assert exc.value.detail == "secret decrypt failed"


# ---- 5. keyless providers ----------------------------------------------


@pytest.mark.asyncio
async def test_ollama_model_no_decrypt_no_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Ollama doesn't need a key. The vault is not consulted and the
    resulting LLMSpec has an empty SecretStr."""
    _patch_registry(monkeypatch, _row(provider="ollama", has_secret=False))
    vault = _patch_vault(monkeypatch)

    spec = await resolve_llm_spec(_claims(), model="llama3", provider="ollama")
    assert spec.provider == "ollama"
    assert spec.api_key.get_secret_value() == ""
    vault.assert_not_called()


@pytest.mark.asyncio
async def test_fake_model_no_decrypt_no_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_registry(monkeypatch, _row(provider="fake", has_secret=False))
    vault = _patch_vault(monkeypatch)

    spec = await resolve_llm_spec(_claims(), model="echo", provider="fake")
    assert spec.provider == "fake"
    assert spec.api_key.get_secret_value() == ""
    vault.assert_not_called()


# ---- 7. response-leak grep ---------------------------------------------


@pytest.mark.asyncio
async def test_error_response_does_not_contain_ciphertext_or_nonce(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No HTTPException ``detail`` ever contains the row's ciphertext,
    nonce, or any plaintext-derived material. We exercise every error
    branch and grep the response body."""
    leaks = (_CT_B64, _NONCE_B64, _PLAINTEXT_KEY, "encrypted", "nonce")

    # branch A: missing secret
    _patch_registry(monkeypatch, _row(provider="anthropic", has_secret=False))
    _patch_vault(monkeypatch)
    with pytest.raises(HTTPException) as a:
        await resolve_llm_spec(_claims(), model="claude-x", provider="anthropic")
    for s in leaks:
        assert s not in a.value.detail

    # branch B: vault error
    _patch_registry(monkeypatch, _row(provider="anthropic"))
    _patch_vault(monkeypatch, side_effect=VaultError("internal master-key debug detail"))
    with pytest.raises(HTTPException) as b:
        await resolve_llm_spec(_claims(), model="claude-x", provider="anthropic")
    for s in leaks:
        assert s not in b.value.detail
    assert "master-key" not in b.value.detail
    assert "debug detail" not in b.value.detail

    # branch C: 403 not-owned
    _patch_registry(monkeypatch, None)
    with pytest.raises(HTTPException) as c:
        await resolve_llm_spec(_claims(), model="claude-x", provider="anthropic")
    for s in leaks:
        assert s not in c.value.detail


# ---- defensive: public_config overrides flow into the spec --------------


@pytest.mark.asyncio
async def test_registry_row_with_unknown_provider_literal_returns_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A DB row whose ``provider_template_id`` isn't in ``LLMSpec``'s
    Literal would fail Pydantic construction. The resolver must catch
    that and return a generic 500 — never a 4xx (it's a data-integrity
    bug, not a caller bug)."""
    # The registry row's provider_template_id is what the resolver
    # passes through to ``LLMSpec.provider``. We have to pretend the
    # caller's request matched a row whose provider isn't in the
    # vocabulary — and since the resolver does the keyless-check on
    # the caller's provider arg first, we need ``provider`` to be in
    # _KEYLESS_PROVIDERS so we never call the vault, while the LLMSpec
    # construction itself rejects the literal.
    #
    # The cleanest path is to use a provider that LOOKS keyless to
    # the resolver but isn't in the LLMSpec Literal. We don't have
    # one — both ``ollama`` and ``fake`` are accepted by LLMSpec. So
    # we test the other side: a key-required provider with an OK
    # secret payload, but a typo-style provider that LLMSpec rejects.
    _patch_registry(monkeypatch, _row(provider="anthrpic"))  # typo
    _patch_vault(monkeypatch, {"api_key": _PLAINTEXT_KEY})

    with pytest.raises(HTTPException) as exc:
        await resolve_llm_spec(_claims(), model="x", provider="anthrpic")
    assert exc.value.status_code == 500


@pytest.mark.asyncio
async def test_public_config_overrides_applied(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_registry(
        monkeypatch,
        _row(
            provider="openai",
            public_config={
                "api_base": "https://gw.example.com/v1",
                "extra_headers": {"X-Org": "example"},
                "max_tokens": 1024,
                "timeout": 30.0,
            },
        ),
    )
    _patch_vault(monkeypatch, {"api_key": _PLAINTEXT_KEY})

    spec = await resolve_llm_spec(_claims(), model="gpt-x", provider="openai")
    assert spec.api_base == "https://gw.example.com/v1"
    assert spec.extra_headers == {"X-Org": "example"}
    assert spec.max_tokens == 1024
    assert spec.timeout == 30.0
