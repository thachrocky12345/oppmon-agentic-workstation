# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""``resolve_llm_spec`` — glue from authenticated user + request body to ``LLMSpec``.

The single entry point this module exposes binds three previously
independent layers:

  * **TAG-52/53 auth** — the verified ``JWTClaims`` proving who's asking.
  * **TAG-55 registry** — ``get_user_model`` returning a tenant-scoped
    row (or ``None`` for any "not yours / not enabled / soft-deleted").
  * **TAG-54 vault** — ``decrypt_secret`` unwrapping the encrypted
    ``model_secrets`` row into a flat ``dict[str, str]`` payload.
  * **TAG-56 spec** — ``LLMSpec`` carrying the resolved plaintext
    forward as a masked ``SecretStr``.

Output is a constructed ``LLMSpec`` ready to hand to
``build_client(spec)`` — the only place the plaintext is unwrapped.

Failure surface (kept narrow on purpose):

  * 403 "model not available for this user" — every "not yours" case
    funnels here: cross-tenant attempt, model_id that doesn't exist,
    inactive (``enabled=false``) or soft-deleted (``deleted_at IS NOT
    NULL``) row, TEAM-scope model the caller isn't a member of.
    Uniform 403 (not 404) so a caller can't probe another tenant's
    model namespace via status-code side-channel.
  * 500 "model misconfigured: missing secret" — registry row found
    for a key-required provider but ``model_secrets`` join returned
    NULL ciphertext/nonce. A schema-level invariant violation, not a
    user-facing auth failure.
  * 500 "secret decrypt failed" — ``VaultError`` from
    ``decrypt_secret``. Could be a wrong/rotated master key, garbled
    ciphertext, or a payload that AEAD-decrypts but isn't valid JSON.
    Generic message so neither ciphertext nor master-key state leaks
    into the response body.

What this function deliberately does NOT do:

  * It does not log the plaintext anywhere.
  * It does not put ciphertext, nonce, or key material in
    ``HTTPException.detail`` strings — those are static literals.
  * It does not f-string-format any value from the decrypted payload
    into an error message.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from pydantic import SecretStr, ValidationError

from ..crypto.vault import VaultError, decrypt_secret
from ..db.model_registry import get_user_model
from ..llm.spec import _KEYLESS_PROVIDERS, LLMSpec
from .types import JWTClaims

# Generic 403 message — never names which check failed, so a caller
# can't distinguish "wrong tenant" from "model doesn't exist anywhere"
# from "model exists but is disabled".
_MSG_NOT_AVAILABLE = "model not available for this user"

# Generic 500 messages — likewise carry no secret material.
_MSG_MISSING_SECRET = "model misconfigured: missing secret"
_MSG_DECRYPT_FAILED = "secret decrypt failed"


async def resolve_llm_spec(
    user: JWTClaims,
    *,
    model: str,
    provider: str,
) -> LLMSpec:
    """Resolve a ``(provider, model)`` request into a ready-to-build ``LLMSpec``.

    Args:
        user: Verified caller from ``get_current_user`` (TAG-53).
        model: ``models.model_identifier`` (the concrete model name,
            e.g. ``"claude-3-5-sonnet-20241022"``).
        provider: ``models.provider_template_id`` — also the value used
            for ``LLMSpec.provider``. The two MUST be the same literal
            (e.g. ``"anthropic"``) because the registry templates and
            the LLM client factory share the same provider vocabulary.

    Returns:
        An ``LLMSpec`` whose ``api_key`` is masked as ``SecretStr``.
        ``api_key`` is empty for keyless providers (ollama, fake).

    Raises:
        HTTPException 403: registry returned ``None`` — covers every
            cross-tenant / not-owned / inactive / soft-deleted /
            team-membership-missing case via a single static message.
        HTTPException 500: schema-level misconfiguration (missing
            secret join for a key-required provider) or vault decrypt
            failure. Never carries ciphertext or master-key context.
    """
    row = await get_user_model(
        user_id=user.sub,
        tenant_id=user.tenant_id,
        provider=provider,
        model_identifier=model,
    )
    if row is None:
        # 403 — not 404. A 404 would confirm to tenant B that a model
        # name *does* exist in tenant A. The model-identity oracle is
        # an exfil side-channel we close by always answering "no".
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_MSG_NOT_AVAILABLE,
        )

    api_key = ""
    if provider not in _KEYLESS_PROVIDERS:
        # Key-required provider must have a non-NULL secret join. The
        # TS writer in ``apps/api`` enforces this on insert, but we
        # verify here so a missing row surfaces as a clear 500 instead
        # of a confusing decrypt error or a downstream auth-to-the-LLM
        # 401.
        if not (row.secret_ciphertext and row.secret_nonce):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=_MSG_MISSING_SECRET,
            )
        try:
            payload = decrypt_secret(
                row.secret_ciphertext,
                row.secret_nonce,
                row.secret_version,
            )
        except VaultError:
            # Swallow the VaultError details on purpose — the generic
            # 500 message is what reaches the client. The underlying
            # cause stays in agent_search logs via the exception
            # chain, NOT in the HTTP response.
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=_MSG_DECRYPT_FAILED,
            ) from None
        # The TS writer stores {"api_key": "..."} (and sometimes extra
        # provider-specific fields). Missing api_key on a key-required
        # provider is the same kind of misconfiguration as a missing
        # secret join — fail closed.
        api_key = payload.get("api_key", "")
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=_MSG_MISSING_SECRET,
            )

    pub = row.public_config or {}

    try:
        return LLMSpec(
            # ``provider`` is validated by LLMSpec's Literal. A registry
            # row whose ``provider_template_id`` isn't in the LLMSpec
            # vocabulary will raise here — surface that as a 500
            # because it's a data-integrity problem, not a caller bug.
            provider=provider,  # type: ignore[arg-type]
            model=model,
            api_key=SecretStr(api_key),
            api_base=pub.get("api_base"),
            extra_headers=pub.get("extra_headers"),
            max_tokens=pub.get("max_tokens", 4096),
            timeout=pub.get("timeout", 60.0),
        )
    except ValidationError as exc:
        # E.g. a registry row pointing at an unknown provider literal,
        # or a public_config carrying a typed-incompatible override.
        # Same generic 500 — exc message stays in the chained traceback
        # for ops, never in the response body.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_MSG_MISSING_SECRET,
        ) from exc


__all__ = ["resolve_llm_spec"]
