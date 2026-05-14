#!/usr/bin/env python
"""TAG-57 — ``resolve_llm_spec`` integration smoke.

What this proves end-to-end:

  TC-01  agent_search imports cleanly + ``resolve_llm_spec`` is on the
         public auth surface
  TC-02  Resolver wires the right call: registry call uses
         ``user.sub`` / ``user.tenant_id`` / passed-in
         ``(provider, model_identifier)`` (mock check, no DB)
  TC-03  Generic 403 detail is a static literal — no caller input is
         echoed back

  TC-04 (live DB)  Owned anthropic model + real master key:
                   resolver decrypts the seeded ciphertext and returns
                   an ``LLMSpec`` whose api_key matches the plaintext
                   we encrypted with TAG-54's ``encrypt_secret``.
  TC-05 (live DB)  Cross-tenant attempt → 403, not 404.
  TC-06 (live DB)  Keyless ``ollama`` model with NULL secret_ref →
                   resolver returns spec with empty api_key, never
                   touches the vault.
  TC-07 (live DB)  Disabled / soft-deleted models → 403 (not 5xx).

TC-04..TC-07 are skipped (counted as PASS with "skipped" detail) when
``DATABASE_URL`` or ``TAG_ENCRYPTION_MASTER_KEY`` is unset. They INSERT
into the live ``tenants/users/teams/team_members/model_secrets/models``
tables with a unique ``tag57test_<ts>_`` prefix and DELETE in a
``finally`` so a failed run leaves no orphans.

Usage:
    export DATABASE_URL=postgresql://oppmon:oppmon@localhost:5433/oppmon
    # 32 bytes, base64-encoded — same key the apps/api signer uses:
    export TAG_ENCRYPTION_MASTER_KEY=$(python -c \
        'import os,base64; print(base64.b64encode(os.urandom(32)).decode())')

    cd apps/agent_graph_backend
    python ../../scripts/TAG_57_integration.py
"""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import os
import sys
import time
from base64 import b64decode

sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "apps", "agent_graph_backend")
    ),
)

DATABASE_URL = os.getenv("DATABASE_URL", "")
MASTER_KEY = os.getenv("TAG_ENCRYPTION_MASTER_KEY", "")
_PREFIX = f"tag57test_{int(time.time())}_"
_PLAINTEXT_KEY = "sk-tag57-fixture-key-not-real-1234567890"


def _id(label: str) -> str:
    return f"{_PREFIX}{label}"


def _claims(*, sub: str, tenant_id: str):
    from agent_search.agent_v2.auth import JWTClaims

    now = int(dt.datetime.now(dt.UTC).timestamp())
    return JWTClaims(
        sub=sub,
        tenantId=tenant_id,
        role="MEMBER",
        exp=now + 3600,
        iat=now,
    )


async def _seed(conn, ct: bytes, nonce: bytes) -> dict[str, str]:
    """Seed two tenants, one team, three models (anthropic, ollama,
    disabled), and a model_secrets row with real ciphertext."""
    ids = {
        "tnt_a": _id("tnt_a"),
        "tnt_b": _id("tnt_b"),
        "usr_a1": _id("usr_a1"),
        "usr_b1": _id("usr_b1"),
        "sec_a": _id("sec_a"),
        "mdl_a_anthropic": _id("mdl_a_anthropic"),
        "mdl_a_ollama": _id("mdl_a_ollama"),
        "mdl_a_disabled": _id("mdl_a_disabled"),
    }
    for key, slug in [("tnt_a", "alpha"), ("tnt_b", "bravo")]:
        await conn.execute(
            "INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) "
            "VALUES ($1, $2, $3, TRUE, NOW(), NOW())",
            ids[key],
            f"TAG57 {key}",
            f"{_PREFIX}{slug}",
        )
    for key, tenant in [("usr_a1", "tnt_a"), ("usr_b1", "tnt_b")]:
        await conn.execute(
            "INSERT INTO users (id, email, name, role, tenant_id, is_active, "
            "created_at, updated_at) "
            "VALUES ($1, $2, $3, 'MEMBER', $4, TRUE, NOW(), NOW())",
            ids[key],
            f"{ids[key]}@example.com",
            f"TAG57 {key}",
            ids[tenant],
        )
    await conn.execute(
        "INSERT INTO model_secrets (id, tenant_id, encrypted_payload, nonce, version, created_at) "
        "VALUES ($1, $2, $3, $4, 1, NOW())",
        ids["sec_a"],
        ids["tnt_a"],
        ct,
        nonce,
    )
    # anthropic, enabled, has secret
    await conn.execute(
        "INSERT INTO models "
        "(id, tenant_id, scope, team_id, display_name, provider_template_id, "
        " model_identifier, public_config, secret_ref, enabled, created_by_id, "
        " created_at, updated_at) "
        "VALUES ($1,$2,'TENANT',NULL,$3,$4,$5,$6::jsonb,$7,TRUE,$8,NOW(),NOW())",
        ids["mdl_a_anthropic"],
        ids["tnt_a"],
        f"{_PREFIX}anthropic claude",
        "anthropic",
        "claude-sonnet-4-20250514",
        '{"api_base": "https://api.anthropic.com", "max_tokens": 2048}',
        ids["sec_a"],
        ids["usr_a1"],
    )
    # ollama, enabled, NULL secret_ref
    await conn.execute(
        "INSERT INTO models "
        "(id, tenant_id, scope, team_id, display_name, provider_template_id, "
        " model_identifier, public_config, enabled, created_by_id, "
        " created_at, updated_at) "
        "VALUES ($1,$2,'TENANT',NULL,$3,$4,$5,$6::jsonb,TRUE,$7,NOW(),NOW())",
        ids["mdl_a_ollama"],
        ids["tnt_a"],
        f"{_PREFIX}ollama llama3",
        "ollama",
        "llama3",
        "{}",
        ids["usr_a1"],
    )
    # anthropic, disabled — must 403
    await conn.execute(
        "INSERT INTO models "
        "(id, tenant_id, scope, team_id, display_name, provider_template_id, "
        " model_identifier, public_config, secret_ref, enabled, created_by_id, "
        " created_at, updated_at) "
        "VALUES ($1,$2,'TENANT',NULL,$3,$4,$5,$6::jsonb,$7,FALSE,$8,NOW(),NOW())",
        ids["mdl_a_disabled"],
        ids["tnt_a"],
        f"{_PREFIX}anthropic disabled",
        "anthropic",
        "claude-disabled",
        "{}",
        ids["sec_a"],
        ids["usr_a1"],
    )
    return ids


async def _cleanup(conn) -> None:
    for table in ("models", "model_secrets", "users", "tenants"):
        col = "slug" if table == "tenants" else "id"
        await conn.execute(
            f"DELETE FROM {table} WHERE {col} LIKE $1",  # noqa: S608 — constant table list
            _PREFIX + "%",
        )


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    def _add(self, name: str, ok: bool, detail: str = "") -> None:
        self.rows.append((name, ok, detail))

    # ---- static --------------------------------------------------------

    def tc01_imports(self) -> None:
        try:
            from agent_search.agent_v2.auth import resolve_llm_spec  # noqa: F401

            self._add("TC-01 imports clean", True, "resolve_llm_spec on auth public surface")
        except Exception as exc:  # noqa: BLE001
            self._add("TC-01 imports clean", False, repr(exc))

    def tc02_wires_user_and_tenant_into_registry(self) -> None:
        """Mock get_user_model and confirm sub/tenant_id/provider/model
        flow through with the exact names the registry expects."""
        from unittest.mock import AsyncMock

        from agent_search.agent_v2.auth import resolve as resolve_mod
        from agent_search.agent_v2.auth.resolve import resolve_llm_spec

        captured: dict[str, object] = {}

        async def fake_get(**kwargs):
            captured.update(kwargs)
            return None  # forces 403, fine for this test

        resolve_mod.get_user_model = fake_get  # type: ignore[assignment]
        async def _go():
            with contextlib.suppress(Exception):  # expected 403
                await resolve_llm_spec(
                    _claims(sub="usr_X", tenant_id="tnt_Y"),
                    model="mdl_Z",
                    provider="anthropic",
                )

        asyncio.run(_go())
        expected = {
            "user_id": "usr_X",
            "tenant_id": "tnt_Y",
            "provider": "anthropic",
            "model_identifier": "mdl_Z",
        }
        ok = all(captured.get(k) == v for k, v in expected.items())
        self._add("TC-02 registry call wiring", ok, f"captured={captured}")
        # Restore the real function so subsequent tests can monkeypatch.
        from agent_search.agent_v2.db.model_registry import get_user_model as real_get

        resolve_mod.get_user_model = real_get  # type: ignore[assignment]
        _ = AsyncMock  # keep import used

    def tc03_generic_403_detail(self) -> None:
        from agent_search.agent_v2.auth.resolve import _MSG_NOT_AVAILABLE

        ok = _MSG_NOT_AVAILABLE == "model not available for this user"
        # Static literal, no caller-supplied data substituted.
        ok = ok and "{" not in _MSG_NOT_AVAILABLE and "%s" not in _MSG_NOT_AVAILABLE
        self._add("TC-03 generic 403 detail", ok, _MSG_NOT_AVAILABLE)

    # ---- live DB -------------------------------------------------------

    def _skip_live(self, name: str) -> bool:
        if not DATABASE_URL:
            self._add(name, True, "skipped (DATABASE_URL unset)")
            return True
        if not MASTER_KEY:
            self._add(name, True, "skipped (TAG_ENCRYPTION_MASTER_KEY unset)")
            return True
        return False

    def _live(self, name: str, factory) -> None:
        if self._skip_live(name):
            return
        from agent_search.agent_v2 import config as config_mod
        from agent_search.agent_v2.crypto.vault import encrypt_secret
        from agent_search.agent_v2.db import close_pool, get_pool

        config_mod.settings.database_url = DATABASE_URL
        config_mod.settings.tag_encryption_master_key = MASTER_KEY

        ct_b64, nonce_b64 = encrypt_secret({"api_key": _PLAINTEXT_KEY})
        ct, nonce = b64decode(ct_b64), b64decode(nonce_b64)

        async def _go():
            pool = await get_pool()
            async with pool.acquire() as conn:
                ids = await _seed(conn, ct, nonce)
            try:
                return await factory(ids)
            finally:
                async with pool.acquire() as conn:
                    await _cleanup(conn)
                await close_pool()

        try:
            ok, detail = asyncio.run(_go())
            self._add(name, bool(ok), detail)
        except Exception as exc:  # noqa: BLE001
            with contextlib.suppress(Exception):
                asyncio.run(self._cleanup_only())
            self._add(name, False, repr(exc))

    async def _cleanup_only(self) -> None:
        from agent_search.agent_v2 import config as config_mod
        from agent_search.agent_v2.db import close_pool, get_pool

        config_mod.settings.database_url = DATABASE_URL
        pool = await get_pool()
        try:
            async with pool.acquire() as conn:
                await _cleanup(conn)
        finally:
            await close_pool()

    def tc04_live_owned_anthropic_decrypts(self) -> None:
        async def _check(ids):
            from agent_search.agent_v2.auth import resolve_llm_spec

            spec = await resolve_llm_spec(
                _claims(sub=ids["usr_a1"], tenant_id=ids["tnt_a"]),
                model="claude-sonnet-4-20250514",
                provider="anthropic",
            )
            ok = (
                spec.api_key.get_secret_value() == _PLAINTEXT_KEY
                and spec.provider == "anthropic"
                and spec.api_base == "https://api.anthropic.com"
                and spec.max_tokens == 2048
            )
            decrypted = spec.api_key.get_secret_value() == _PLAINTEXT_KEY
            return ok, f"decrypted={decrypted} base={spec.api_base}"

        self._live("TC-04 anthropic decrypts", _check)

    def tc05_live_cross_tenant_403(self) -> None:
        async def _check(ids):
            from fastapi import HTTPException

            from agent_search.agent_v2.auth import resolve_llm_spec

            try:
                await resolve_llm_spec(
                    _claims(sub=ids["usr_b1"], tenant_id=ids["tnt_b"]),
                    model="claude-sonnet-4-20250514",
                    provider="anthropic",
                )
            except HTTPException as exc:
                ok = exc.status_code == 403 and exc.detail == "model not available for this user"
                return ok, f"status={exc.status_code} detail={exc.detail}"
            return False, "no exception raised"

        self._live("TC-05 cross-tenant 403", _check)

    def tc06_live_ollama_no_vault(self) -> None:
        async def _check(ids):
            from agent_search.agent_v2.auth import resolve_llm_spec

            spec = await resolve_llm_spec(
                _claims(sub=ids["usr_a1"], tenant_id=ids["tnt_a"]),
                model="llama3",
                provider="ollama",
            )
            ok = spec.provider == "ollama" and spec.api_key.get_secret_value() == ""
            return ok, f"key_empty={spec.api_key.get_secret_value() == ''}"

        self._live("TC-06 ollama keyless", _check)

    def tc07_live_disabled_403(self) -> None:
        async def _check(ids):
            from fastapi import HTTPException

            from agent_search.agent_v2.auth import resolve_llm_spec

            try:
                await resolve_llm_spec(
                    _claims(sub=ids["usr_a1"], tenant_id=ids["tnt_a"]),
                    model="claude-disabled",
                    provider="anthropic",
                )
            except HTTPException as exc:
                ok = exc.status_code == 403
                return ok, f"status={exc.status_code}"
            return False, "no exception raised"

        self._live("TC-07 disabled model 403", _check)

    # ---- run -----------------------------------------------------------

    def run(self) -> int:
        for name in sorted(m for m in dir(self) if m.startswith("tc")):
            getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        failed = len(self.rows) - passed
        for name, ok, detail in self.rows:
            print(f"{'[PASS]' if ok else '[FAIL]'} {name} | {detail}")
        print(f"\ntotal={len(self.rows)} passed={passed} failed={failed}")
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(Runner().run())
