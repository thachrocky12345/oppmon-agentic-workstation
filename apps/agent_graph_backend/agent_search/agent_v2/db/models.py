"""Pydantic row models for ``agent_v2.db.model_registry`` reads.

The ticket spec for TAG-55 references column names that pre-date the
current Prisma schema. The actual ``models`` and ``model_secrets``
tables (see ``packages/database/prisma/schema.prisma``) use:

  models.created_by_id     (NOT user_id)        — owner FK
  models.enabled           (NOT is_active)      — soft-disable flag
  models.scope             (TENANT | TEAM)      — visibility scope
  models.team_id           (nullable)           — set when scope=TEAM
  models.secret_ref → model_secrets.id          — NOT secret_vault
  models.deleted_at        (soft delete)
  model_secrets.encrypted_payload BYTEA         — NOT text ciphertext
  model_secrets.nonce            BYTEA          — NOT text
  model_secrets.version          INT            — NOT key_id text

This row model reflects the **actual** schema. The query helper in
``model_registry.py`` base64-encodes the bytea fields before returning
them so downstream callers can hand them straight to
``agent_v2.crypto.decrypt_secret`` (TAG-54) without further conversion.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class ModelRow(BaseModel):
    """A registered model joined with its (optional) encrypted secret.

    ``secret_ciphertext`` / ``secret_nonce`` are base64-encoded strings
    (already in the shape ``decrypt_secret`` wants) or ``None`` when the
    provider has no secret (e.g. ollama, fake).

    ``secret_version`` is the rotation generation from
    ``model_secrets.version`` — metadata only today, reserved for the
    eventual ``key_id`` selection logic.
    """

    # Silence Pydantic v2 "model_" namespace warnings for our field names.
    model_config = ConfigDict(protected_namespaces=())

    id: str
    tenant_id: str
    scope: str  # "TENANT" or "TEAM"
    team_id: str | None
    created_by_id: str
    display_name: str
    provider_template_id: str | None  # nullable in YAML-override mode
    model_identifier: str
    public_config: dict[str, Any]
    enabled: bool
    secret_ciphertext: str | None
    secret_nonce: str | None
    secret_version: int | None


__all__ = ["ModelRow"]
