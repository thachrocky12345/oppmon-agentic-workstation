"""Read-only model registry queries.

Mirrors TAG-55's contract:

    get_user_models(user_id, tenant_id)              -> list[ModelRow]
    get_user_model(user_id, tenant_id, model_id=...) -> ModelRow | None
    get_user_model(user_id, tenant_id,
                   provider=..., model_identifier=...) -> ModelRow | None

Schema reality check (see ``models.py`` for the long version): the
ticket's column names predate the current Prisma schema. We honour the
real schema here — ``created_by_id`` (not ``user_id``), ``enabled``
(not ``is_active``), ``model_secrets`` (not ``secret_vault``),
``encrypted_payload``/``nonce`` BYTEA columns and a ``version`` int in
place of ``key_id``.

A user can see a model when ALL of these hold:

  1. ``models.tenant_id`` matches the caller's tenant (hard backstop —
     this is the cross-tenant isolation gate the ticket calls out).
  2. ``models.enabled = TRUE`` and ``models.deleted_at IS NULL``.
  3. Either ``scope = 'TENANT'`` (visible tenant-wide) OR
     ``scope = 'TEAM' AND team_id IN (caller's team memberships)``.

The team-scope check is the SQL equivalent of the TS authz check in
``apps/api/src/lib/authz.ts``: never trust the caller, always join to
``team_members`` for the user's actual memberships.

Bytea → base64 conversion happens here so callers can feed the strings
straight into ``agent_v2.crypto.decrypt_secret`` from TAG-54 with no
further dance.
"""

from __future__ import annotations

from base64 import b64encode
from typing import TYPE_CHECKING, Any

from .models import ModelRow
from .queries import pg_fetch_all, pg_fetch_one

if TYPE_CHECKING:
    from asyncpg import Record


# All reads project the same columns. Keep one canonical SELECT so
# `get_user_model` and `get_user_models` stay byte-identical.
_BASE_SELECT = """
SELECT m.id,
       m.tenant_id,
       m.scope::text          AS scope,
       m.team_id,
       m.created_by_id,
       m.display_name,
       m.provider_template_id,
       m.model_identifier,
       m.public_config,
       m.enabled,
       ms.encrypted_payload   AS secret_ciphertext,
       ms.nonce               AS secret_nonce,
       ms.version             AS secret_version
FROM models m
LEFT JOIN model_secrets ms ON ms.id = m.secret_ref
"""

# Visibility predicate, reused by every query.
# - $1 = tenant_id (hard backstop, never omitted)
# - $2 = user_id   (used only for the TEAM-scope membership subquery)
#
# We intentionally do NOT filter by ``m.created_by_id = $2``: ticket
# wording aside, the schema makes models tenant- or team-scoped, not
# user-owned. A user sees models they didn't personally create as long
# as the team-membership check passes. Personal ownership is metadata.
_VISIBILITY = """
WHERE m.tenant_id = $1
  AND m.enabled = TRUE
  AND m.deleted_at IS NULL
  AND (
        m.scope = 'TENANT'
     OR (m.scope = 'TEAM'
         AND m.team_id IN (SELECT team_id FROM team_members WHERE user_id = $2))
      )
"""


def _row_to_model(row: Record) -> ModelRow:
    """Convert an asyncpg Record into a ``ModelRow``.

    asyncpg returns BYTEA columns as Python ``bytes`` and JSONB as a
    decoded dict (when a codec is registered) or a raw JSON string
    otherwise. We handle both shapes for ``public_config`` to keep the
    helper robust against pool configuration drift.
    """
    data = dict(row)

    # bytea → base64 string (or None)
    ct: bytes | None = data.get("secret_ciphertext")
    nonce: bytes | None = data.get("secret_nonce")
    data["secret_ciphertext"] = b64encode(ct).decode("ascii") if ct else None
    data["secret_nonce"] = b64encode(nonce).decode("ascii") if nonce else None

    # public_config may arrive as str if no jsonb codec is registered.
    cfg = data.get("public_config")
    if isinstance(cfg, str):
        import json  # local import — only needed in the fallback path

        try:
            data["public_config"] = json.loads(cfg)
        except json.JSONDecodeError:
            data["public_config"] = {}
    elif cfg is None:
        data["public_config"] = {}

    return ModelRow(**data)


async def get_user_models(user_id: str, tenant_id: str) -> list[ModelRow]:
    """Return every model the user can see in their tenant.

    Hard guarantees:
      * Only ``tenant_id == $1`` rows are ever returned.
      * Soft-deleted (``deleted_at IS NOT NULL``) rows are excluded.
      * Disabled (``enabled = FALSE``) rows are excluded.
      * TEAM-scoped models are filtered by the user's ``team_members``.
    """
    sql = _BASE_SELECT + _VISIBILITY + " ORDER BY m.display_name ASC"
    rows = await pg_fetch_all(sql, tenant_id, user_id)
    return [_row_to_model(r) for r in rows]


async def get_user_model(
    user_id: str,
    tenant_id: str,
    *,
    model_id: str | None = None,
    provider: str | None = None,
    model_identifier: str | None = None,
) -> ModelRow | None:
    """Look up a single model by id, or by (provider, model_identifier).

    Same visibility rules as ``get_user_models``. Cross-tenant requests
    are caught by the ``tenant_id`` predicate and return ``None`` rather
    than leak existence.

    Raises ``ValueError`` if the caller omits both selectors — the API
    deliberately does NOT auto-pick a model.
    """
    if model_id:
        sql = _BASE_SELECT + _VISIBILITY + " AND m.id = $3 LIMIT 1"
        params: tuple[Any, ...] = (tenant_id, user_id, model_id)
    elif provider and model_identifier:
        sql = (
            _BASE_SELECT
            + _VISIBILITY
            + " AND m.provider_template_id = $3 AND m.model_identifier = $4 LIMIT 1"
        )
        params = (tenant_id, user_id, provider, model_identifier)
    else:
        raise ValueError(
            "get_user_model: must pass model_id or (provider + model_identifier)"
        )

    row = await pg_fetch_one(sql, *params)
    return _row_to_model(row) if row else None


__all__ = ["get_user_model", "get_user_models"]
