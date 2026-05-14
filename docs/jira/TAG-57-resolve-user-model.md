# TAG-57: Resolve `LLMSpec` from `{model, provider, user}`

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Glue ticket: given an authenticated `JWTClaims` and a request body's
`{model, provider}` fields, fetch the matching `models` row, decrypt its
`secret_vault` row, and return a ready-to-build `LLMSpec`.

## Objective

```python
async def resolve_llm_spec(user: JWTClaims, *, model: str, provider: str) -> LLMSpec
```

with the following failure surface:

| Failure | HTTP |
|---|---|
| User has no model matching `(provider, model)` | 403 (or 404 — see Implementation Notes) |
| Model row found but `is_active=false` | 403 |
| `secret_vault` join missing (key required) | 500 (configuration bug) |
| Decrypt fails | 500 |

## Requirements

### Implementation

`agent_v2/auth/resolve.py`:

```python
from fastapi import HTTPException, status
from .types import JWTClaims
from ..crypto.vault import decrypt_secret, VaultError
from ..db.model_registry import get_user_model, ModelRow
from ..llm.spec import LLMSpec

_PROVIDERS_REQUIRING_KEY = {"anthropic","openai","openai_compatible","cerebras","azure_openai","bedrock"}

async def resolve_llm_spec(user: JWTClaims, *, model: str, provider: str) -> LLMSpec:
    row: ModelRow | None = await get_user_model(
        user_id=user.sub,
        tenant_id=user.tenant_id,
        provider=provider,
        model_identifier=model,
    )
    if row is None:
        # 403, not 404, to avoid leaking model-existence to a different tenant
        raise HTTPException(status.HTTP_403_FORBIDDEN, "model not available for this user")

    api_key = ""
    if provider in _PROVIDERS_REQUIRING_KEY:
        if not (row.secret_ciphertext and row.secret_nonce):
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "model misconfigured: missing secret")
        try:
            api_key = decrypt_secret(row.secret_ciphertext, row.secret_nonce, row.secret_key_id)
        except VaultError:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "secret decrypt failed")

    pub = row.public_config or {}
    return LLMSpec(
        provider=provider,                       # type-narrowed by Literal in LLMSpec
        model=model,
        api_key=api_key,
        api_base=pub.get("api_base"),
        extra_headers=pub.get("extra_headers"),
        max_tokens=pub.get("max_tokens", 4096),
        timeout=pub.get("timeout", 60.0),
    )
```

### Why 403, not 404

If we returned 404 for "model not owned by you" we would confirm to one tenant
the existence of another tenant's model name. 403 with a generic message keeps the
existence side-channel closed.

### Lifecycle of plaintext

- Plaintext key lives inside `LLMSpec.api_key: SecretStr` for the duration of
  one `/solve` request.
- After `build_client(spec)` returns, the spec falls out of scope.
- The `LLMClient` itself holds the key inside the provider SDK; do not log the
  client's `repr` either.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/auth/test_resolve.py` | owned active anthropic model | returns spec, key decrypted |
| `tests/auth/test_resolve.py` | not-owned model id | 403 |
| `tests/auth/test_resolve.py` | inactive model | 403 |
| `tests/auth/test_resolve.py` | misconfigured (no secret row, anthropic) | 500 |
| `tests/auth/test_resolve.py` | ollama model (no key needed) | spec has empty key, no 500 |
| `tests/auth/test_resolve.py` | cross-tenant attempt | 403, NOT 404 |
| `tests/auth/test_resolve.py` | error response does NOT contain ciphertext or nonce | grep |

## Acceptance Criteria

- [ ] All seven tests pass.
- [ ] Cross-tenant attempts return 403 with generic message.
- [ ] Plaintext key never reaches `HTTPException.detail`.
- [ ] `LLMSpec` carries the resolved provider/model.

## Dependencies

**Depends on:** TAG-54, TAG-55, TAG-56
**Blocks:** TAG-58

## Risk Factors

| Risk | Mitigation |
|---|---|
| Side-channel via different status codes | Uniform 403 for any "not yours". |
| Plaintext key in log via FastAPI exception handler | `HTTPException.detail` strings are fixed; no `f"...{api_key}..."` anywhere. |
| Decrypt OOM on huge ciphertext | DB column size capped at insert time by `apps/api`; agent_search trusts that bound. |
