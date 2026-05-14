# TAG-55: Read-Only Model Registry Queries

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-50](./TAG-50-authenticated-solve-endpoint-epic.md)
**Status:** Open

Expose the small set of read-only queries `agent_search` needs to look up a
user's registered models and their decrypted secrets — without ever joining or
exposing rows that belong to a different tenant.

## Objective

Two functions:

```python
async def get_user_models(user_id: str, tenant_id: str) -> list[ModelRow]
async def get_user_model(user_id: str, tenant_id: str, *, model_id: str | None = None,
                         provider: str | None = None, model_identifier: str | None = None) -> ModelRow | None
```

backed by `pg_fetch_all` / `pg_fetch_one` from TAG-51. Both ALWAYS filter by
`tenant_id` in the SQL WHERE clause — never trust caller filters alone.

## Requirements

### Schema reference

From `packages/database/prisma/schema.prisma` (verify column names before writing SQL):

```
models
  id              cuid
  tenant_id       fk → tenants
  user_id         fk → users (owner)
  provider_template_id  string   -- "anthropic" | "openai" | "cerebras" | ...
  model_identifier      string   -- "claude-sonnet-4-20250514" etc
  public_config         jsonb    -- api_base, region, deployment_name, ...
  secret_config_id      fk → secret_vault (nullable for ollama / fake)
  is_active             bool
  created_at, updated_at

secret_vault
  id              cuid
  ciphertext      text
  nonce           text
  key_id          text
```

### Python row model

```python
# agent_v2/db/models.py
from pydantic import BaseModel
from typing import Any

class ModelRow(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    provider_template_id: str
    model_identifier: str
    public_config: dict[str, Any]
    secret_ciphertext: str | None
    secret_nonce: str | None
    secret_key_id: str | None
    is_active: bool
```

### Queries

`agent_v2/db/model_registry.py`:

```python
_BASE_SELECT = """
SELECT m.id, m.tenant_id, m.user_id,
       m.provider_template_id, m.model_identifier,
       m.public_config, m.is_active,
       sv.ciphertext AS secret_ciphertext,
       sv.nonce      AS secret_nonce,
       sv.key_id     AS secret_key_id
FROM models m
LEFT JOIN secret_vault sv ON sv.id = m.secret_config_id
"""

async def get_user_models(user_id: str, tenant_id: str) -> list[ModelRow]:
    rows = await pg_fetch_all(
        _BASE_SELECT + " WHERE m.tenant_id = $1 AND m.user_id = $2 AND m.is_active = true",
        tenant_id, user_id,
    )
    return [ModelRow(**dict(r)) for r in rows]

async def get_user_model(
    user_id: str, tenant_id: str, *,
    model_id: str | None = None,
    provider: str | None = None,
    model_identifier: str | None = None,
) -> ModelRow | None:
    if model_id:
        sql = _BASE_SELECT + " WHERE m.tenant_id=$1 AND m.user_id=$2 AND m.id=$3 AND m.is_active=true"
        row = await pg_fetch_one(sql, tenant_id, user_id, model_id)
    elif provider and model_identifier:
        sql = _BASE_SELECT + (
            " WHERE m.tenant_id=$1 AND m.user_id=$2 "
            "AND m.provider_template_id=$3 AND m.model_identifier=$4 "
            "AND m.is_active=true LIMIT 1"
        )
        row = await pg_fetch_one(sql, tenant_id, user_id, provider, model_identifier)
    else:
        raise ValueError("must pass model_id or (provider + model_identifier)")
    return ModelRow(**dict(row)) if row else None
```

### Cross-tenant isolation test (MANDATORY, do not skip)

```python
# tests/db/test_model_registry_isolation.py
async def test_tenant_b_cannot_read_tenant_a_model(seed_two_tenants):
    a_user, a_model, b_user, _ = seed_two_tenants
    # User B asking by GUESSED model id of tenant A
    got = await get_user_model(
        user_id=b_user.id, tenant_id=b_user.tenant_id, model_id=a_model.id,
    )
    assert got is None  # tenant filter MUST prevent the row from returning
```

## Implementation Notes

- `tenant_id` is the WHERE-clause backstop. The caller passes both `user_id` AND
  `tenant_id`, both derived from the JWT, never from the request body.
- `LEFT JOIN secret_vault` because some providers (ollama, fake) have no secret.
- Use parameterized queries (asyncpg `$1, $2`) — never string-interpolate.
- Do NOT cache the result across requests (different users hit the same code path).

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/db/test_model_registry.py` | `get_user_models` happy path | returns the seeded model |
| `tests/db/test_model_registry.py` | inactive model excluded | not in list |
| `tests/db/test_model_registry.py` | `get_user_model` by `(provider, identifier)` | matches |
| `tests/db/test_model_registry_isolation.py` | **cross-tenant** | returns `None` |
| `tests/db/test_model_registry.py` | model with no secret | `secret_ciphertext is None` |

## Acceptance Criteria

- [ ] Cross-tenant test passes (blocks merge).
- [ ] Queries always include `tenant_id` filter.
- [ ] Only `is_active=true` rows returned.
- [ ] No raw SQL interpolation (asyncpg parameter binding only).

## Dependencies

**Depends on:** TAG-51, TAG-54
**Blocks:** TAG-57

## Risk Factors

| Risk | Mitigation |
|---|---|
| Schema column drift vs Prisma | Add a compile-time check in CI that parses `schema.prisma` and confirms column names exist. |
| Forgotten tenant filter | Cross-tenant test must run on every PR. |
| N+1 queries | Single join, single round-trip. |
