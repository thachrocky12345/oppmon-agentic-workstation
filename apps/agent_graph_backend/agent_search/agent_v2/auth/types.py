# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Typed JWT claim shape.

Mirrors `packages/shared/src/types.ts:JWTClaims` and the wire format produced
by `apps/api/src/lib/jwt.ts:signToken`. The Express signer emits camelCase
field names (e.g. `tenantId`) so we accept those via Pydantic field aliases
and expose snake_case attributes in Python.

Unknown fields (`teams`, `tv`, `isSystem`) are ignored — TAG-52's scope is
single-tenant identity. TAG-53+ can extend this model if/when team-scoped
authz lands in `agent_search`.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class JWTClaims(BaseModel):
    """Decoded HS256 JWT issued by apps/api.

    Fields:
        sub: cuid2 user id (subject).
        tenant_id: tenant the user belongs to (wire: `tenantId`).
        role: tenant-level role (e.g. ``"TENANT_ADMIN"``, ``"MEMBER"``,
            ``"VIEWER"``). Validated as a free-form string here; higher layers
            (TAG-53 `require_role`) enforce concrete values.
        email: optional contact email. Express always emits it; kept optional
            so JWTs minted by future flows (e.g. service tokens) still verify.
        exp: expiration epoch seconds (validated by PyJWT before this model
            is constructed).
        iat: issued-at epoch seconds.
    """

    # Accept wire-format camelCase aliases AND snake_case for ergonomic
    # construction in tests.
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    sub: str
    tenant_id: str = Field(alias="tenantId")
    role: str
    email: str | None = None
    exp: int
    iat: int


__all__ = ["JWTClaims"]
