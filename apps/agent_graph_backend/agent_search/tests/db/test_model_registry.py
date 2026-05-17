# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""Tests for `agent_v2.db.model_registry`.

These exercise the SQL shape and Pydantic mapping with a mocked asyncpg
pool — the same pattern used in `test_queries.py`. The dedicated
cross-tenant isolation test lives in
``test_model_registry_isolation.py`` so it's easy to grep / pin in CI.
"""

from __future__ import annotations

import json
from base64 import b64decode, b64encode
from unittest.mock import AsyncMock, MagicMock

import pytest

from agent_search.agent_v2.db import (
    ModelRow,
    get_user_model,
    get_user_models,
)
from agent_search.agent_v2.db import model_registry, pool as pool_mod


# ---- shared fixtures -----------------------------------------------------


def _patch_pool(conn_method: str, return_value):
    """Install a fake pool whose acquired connection answers `conn_method`."""
    fake_conn = MagicMock(name="conn")
    setattr(fake_conn, conn_method, AsyncMock(return_value=return_value))

    acquire_cm = MagicMock(name="acquire_cm")
    acquire_cm.__aenter__ = AsyncMock(return_value=fake_conn)
    acquire_cm.__aexit__ = AsyncMock(return_value=None)

    fake_pool = MagicMock(name="pool")
    fake_pool.acquire = MagicMock(return_value=acquire_cm)
    pool_mod._pool = fake_pool
    return fake_conn


def _row(**overrides) -> dict:
    """Return a row dict shaped like the SELECT in model_registry._BASE_SELECT."""
    base = {
        "id": "mdl_abc",
        "tenant_id": "tnt_alpha",
        "scope": "TENANT",
        "team_id": None,
        "created_by_id": "usr_owner",
        "display_name": "Claude Sonnet 4",
        "provider_template_id": "anthropic",
        "model_identifier": "claude-sonnet-4-20250514",
        "public_config": {"api_base": "https://api.anthropic.com"},
        "enabled": True,
        "secret_ciphertext": b"\x01\x02\x03",
        "secret_nonce": b"\x10\x11\x12",
        "secret_version": 1,
    }
    base.update(overrides)
    return base


# ---- ModelRow shape ------------------------------------------------------


def test_modelrow_fields_match_actual_schema() -> None:
    """ModelRow exposes the real column names — not the ticket's drifted set."""
    fields = set(ModelRow.model_fields.keys())
    assert "created_by_id" in fields  # not "user_id"
    assert "enabled" in fields  # not "is_active"
    assert "secret_version" in fields  # not "secret_key_id"
    assert "scope" in fields
    assert "team_id" in fields
    assert "display_name" in fields
    # And ensure we did NOT accidentally keep ticket-drift names:
    assert "user_id" not in fields
    assert "is_active" not in fields
    assert "secret_key_id" not in fields


# ---- _row_to_model conversion -------------------------------------------


def test_row_to_model_base64_encodes_bytea_secrets() -> None:
    row = _row(secret_ciphertext=b"hello", secret_nonce=b"world")
    m = model_registry._row_to_model(row)
    assert m.secret_ciphertext is not None
    assert m.secret_nonce is not None
    assert b64decode(m.secret_ciphertext) == b"hello"
    assert b64decode(m.secret_nonce) == b"world"


def test_row_to_model_handles_missing_secret() -> None:
    """ollama / fake providers have NULL secret_ref → no joined secret."""
    row = _row(secret_ciphertext=None, secret_nonce=None, secret_version=None)
    m = model_registry._row_to_model(row)
    assert m.secret_ciphertext is None
    assert m.secret_nonce is None
    assert m.secret_version is None


def test_row_to_model_decodes_json_string_public_config() -> None:
    """If the pool has no jsonb codec, public_config arrives as a str."""
    row = _row(public_config=json.dumps({"region": "us-east-1"}))
    m = model_registry._row_to_model(row)
    assert m.public_config == {"region": "us-east-1"}


def test_row_to_model_handles_invalid_json_public_config() -> None:
    row = _row(public_config="{not json")
    m = model_registry._row_to_model(row)
    assert m.public_config == {}


def test_row_to_model_handles_null_public_config() -> None:
    row = _row(public_config=None)
    m = model_registry._row_to_model(row)
    assert m.public_config == {}


# ---- get_user_models -----------------------------------------------------


@pytest.mark.asyncio
async def test_get_user_models_returns_list_of_modelrows() -> None:
    conn = _patch_pool(
        "fetch",
        [
            _row(id="mdl_1", display_name="A"),
            _row(id="mdl_2", display_name="B", secret_ciphertext=None, secret_nonce=None),
        ],
    )
    out = await get_user_models("usr_caller", "tnt_alpha")
    assert len(out) == 2
    assert all(isinstance(m, ModelRow) for m in out)
    assert out[0].id == "mdl_1"
    assert out[1].secret_ciphertext is None
    # Confirm tenant_id is $1 and user_id is $2 (positional binding).
    sql, *params = conn.fetch.await_args.args
    assert params == ["tnt_alpha", "usr_caller"]
    assert "m.tenant_id = $1" in sql


@pytest.mark.asyncio
async def test_get_user_models_sql_enforces_enabled_and_not_deleted() -> None:
    conn = _patch_pool("fetch", [])
    await get_user_models("usr_caller", "tnt_alpha")
    sql = conn.fetch.await_args.args[0]
    assert "m.enabled = TRUE" in sql
    assert "m.deleted_at IS NULL" in sql


@pytest.mark.asyncio
async def test_get_user_models_sql_includes_team_membership_subquery() -> None:
    """TEAM-scope rows are gated on team_members — never on a caller claim."""
    conn = _patch_pool("fetch", [])
    await get_user_models("usr_caller", "tnt_alpha")
    sql = conn.fetch.await_args.args[0]
    assert "scope = 'TENANT'" in sql
    assert "scope = 'TEAM'" in sql
    assert "team_members" in sql
    assert "user_id = $2" in sql


@pytest.mark.asyncio
async def test_get_user_models_returns_empty_list_when_no_rows() -> None:
    _patch_pool("fetch", [])
    out = await get_user_models("usr_caller", "tnt_alpha")
    assert out == []


# ---- get_user_model: by model_id ----------------------------------------


@pytest.mark.asyncio
async def test_get_user_model_by_model_id_returns_row() -> None:
    conn = _patch_pool("fetchrow", _row(id="mdl_specific"))
    out = await get_user_model(
        "usr_caller", "tnt_alpha", model_id="mdl_specific"
    )
    assert out is not None
    assert out.id == "mdl_specific"
    sql, *params = conn.fetchrow.await_args.args
    # Bound order is (tenant_id, user_id, model_id).
    assert params == ["tnt_alpha", "usr_caller", "mdl_specific"]
    assert "m.id = $3" in sql


@pytest.mark.asyncio
async def test_get_user_model_by_model_id_missing_returns_none() -> None:
    _patch_pool("fetchrow", None)
    out = await get_user_model("usr_caller", "tnt_alpha", model_id="mdl_ghost")
    assert out is None


# ---- get_user_model: by (provider, model_identifier) --------------------


@pytest.mark.asyncio
async def test_get_user_model_by_provider_and_identifier_returns_row() -> None:
    conn = _patch_pool(
        "fetchrow",
        _row(provider_template_id="openai", model_identifier="gpt-4o"),
    )
    out = await get_user_model(
        "usr_caller",
        "tnt_alpha",
        provider="openai",
        model_identifier="gpt-4o",
    )
    assert out is not None
    assert out.provider_template_id == "openai"
    assert out.model_identifier == "gpt-4o"
    sql, *params = conn.fetchrow.await_args.args
    assert params == ["tnt_alpha", "usr_caller", "openai", "gpt-4o"]
    assert "m.provider_template_id = $3" in sql
    assert "m.model_identifier = $4" in sql


@pytest.mark.asyncio
async def test_get_user_model_by_provider_only_raises() -> None:
    """provider without model_identifier is incomplete → reject."""
    with pytest.raises(ValueError, match="must pass"):
        await get_user_model(
            "usr_caller", "tnt_alpha", provider="openai"
        )


@pytest.mark.asyncio
async def test_get_user_model_by_identifier_only_raises() -> None:
    with pytest.raises(ValueError, match="must pass"):
        await get_user_model(
            "usr_caller", "tnt_alpha", model_identifier="gpt-4o"
        )


@pytest.mark.asyncio
async def test_get_user_model_with_no_selector_raises() -> None:
    with pytest.raises(ValueError, match="must pass"):
        await get_user_model("usr_caller", "tnt_alpha")


# ---- bytea round-trip via decrypt_secret-friendly shape -----------------


def test_secret_ciphertext_is_b64_decryptable() -> None:
    """secret_ciphertext / secret_nonce must be the exact strings that
    `decrypt_secret` expects (base64). This is the seam to TAG-54."""
    raw_ct = b"\x00\x01\x02\x03\x04"
    raw_nonce = b"\x10\x11\x12\x13\x14"
    m = model_registry._row_to_model(
        _row(secret_ciphertext=raw_ct, secret_nonce=raw_nonce)
    )
    # The downstream caller would pass these strings unchanged to
    # decrypt_secret(ciphertext_b64, nonce_b64).
    assert m.secret_ciphertext == b64encode(raw_ct).decode("ascii")
    assert m.secret_nonce == b64encode(raw_nonce).decode("ascii")


# ---- write-guard interaction --------------------------------------------


@pytest.mark.asyncio
async def test_queries_are_select_only_so_write_guard_does_not_trip() -> None:
    """Sanity: model_registry SQL must start with SELECT; otherwise the
    read-only guard in `queries.py` would raise ValueError."""
    _patch_pool("fetch", [])
    await get_user_models("u", "t")  # would raise if SQL didn't start with SELECT

    _patch_pool("fetchrow", None)
    await get_user_model("u", "t", model_id="m")
    await get_user_model("u", "t", provider="p", model_identifier="i")
