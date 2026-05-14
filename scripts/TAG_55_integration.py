#!/usr/bin/env python
"""TAG-55 — read-only model registry queries integration smoke.

What this proves end-to-end:
  TC-01  agent_search imports cleanly + `ModelRow` / `get_user_model*`
         are on the public db surface
  TC-02  get_user_model raises ValueError without a selector
  TC-03  Built SQL contains the mandatory predicates:
            - m.tenant_id = $1
            - m.enabled = TRUE
            - m.deleted_at IS NULL
            - scope/team_members visibility clause
  TC-04 (live DB) get_user_models returns tenant A's enabled models
  TC-05 (live DB) cross-tenant isolation: tenant B querying tenant A's
                  model_id returns None
  TC-06 (live DB) get_user_model by (provider, model_identifier) returns
                  the seeded row with base64-encoded secrets
  TC-07 (live DB) disabled / soft-deleted models are excluded
  TC-08 (live DB) TEAM-scope model is visible to team members, invisible
                  to non-members in the same tenant

TC-04..TC-08 are skipped (counted as PASS with "skipped" detail) when
``DATABASE_URL`` is unset or unreachable. They INSERT into the live
``tenants/users/teams/team_members/model_secrets/models`` tables with a
unique ``tag55test_<ts>_`` prefix and DELETE in a ``finally`` so a
failed run leaves no orphans.

Usage:
    # Optional — only needed for TC-04..TC-08:
    export DATABASE_URL=postgresql://oppmon:oppmon@localhost:5433/oppmon

    cd apps/agent_graph_backend
    python ../../scripts/TAG_55_integration.py
"""

from __future__ import annotations

import asyncio
import os
import sys
import time
from base64 import b64decode

# Allow running from repo root: scripts/TAG_55_integration.py
sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "apps", "agent_graph_backend")
    ),
)

DATABASE_URL = os.getenv("DATABASE_URL", "")
_PREFIX = f"tag55test_{int(time.time())}_"


def _id(label: str) -> str:
    """Generate a deterministic-but-unique id for a seed row."""
    return f"{_PREFIX}{label}"


async def _seed(conn) -> dict[str, str]:
    """Insert two tenants, users, a team, model_secrets and models.

    Returns a dict of ids the test cases reference. All IDs share the
    ``_PREFIX`` so cleanup is a single DELETE per table.
    """
    ids = {
        "tnt_a": _id("tnt_a"),
        "tnt_b": _id("tnt_b"),
        "usr_a1": _id("usr_a1"),  # tenant-A user in the team
        "usr_a2": _id("usr_a2"),  # tenant-A user NOT in the team
        "usr_b1": _id("usr_b1"),  # tenant-B user (cross-tenant attacker)
        "team_a": _id("team_a"),
        "tm_a1": _id("tm_a1"),
        "sec_a_anthropic": _id("sec_a_anthropic"),
        "mdl_a_tenant": _id("mdl_a_tenant"),  # tenant-scope, enabled
        "mdl_a_team": _id("mdl_a_team"),  # team-scope, enabled
        "mdl_a_disabled": _id("mdl_a_disabled"),  # tenant-scope, disabled
        "mdl_a_deleted": _id("mdl_a_deleted"),  # tenant-scope, soft-deleted
    }

    # tenants
    for key, slug in [("tnt_a", "alpha"), ("tnt_b", "bravo")]:
        await conn.execute(
            "INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) "
            "VALUES ($1, $2, $3, TRUE, NOW(), NOW())",
            ids[key],
            f"TAG55 {key}",
            f"{_PREFIX}{slug}",
        )

    # users
    for key, tenant in [
        ("usr_a1", "tnt_a"),
        ("usr_a2", "tnt_a"),
        ("usr_b1", "tnt_b"),
    ]:
        await conn.execute(
            "INSERT INTO users (id, email, name, role, tenant_id, is_active, created_at, updated_at) "
            "VALUES ($1, $2, $3, 'MEMBER', $4, TRUE, NOW(), NOW())",
            ids[key],
            f"{ids[key]}@example.com",
            f"TAG55 {key}",
            ids[tenant],
        )

    # team + team_members
    await conn.execute(
        "INSERT INTO teams (id, name, tenant_id, created_at, updated_at) "
        "VALUES ($1, $2, $3, NOW(), NOW())",
        ids["team_a"],
        f"{_PREFIX}team_a",
        ids["tnt_a"],
    )
    await conn.execute(
        "INSERT INTO team_members (id, user_id, team_id, role, created_at) "
        "VALUES ($1, $2, $3, 'MEMBER', NOW())",
        ids["tm_a1"],
        ids["usr_a1"],
        ids["team_a"],
    )

    # model_secrets (bytea ciphertext + nonce that the queries will b64 encode)
    await conn.execute(
        "INSERT INTO model_secrets (id, tenant_id, encrypted_payload, nonce, version, created_at) "
        "VALUES ($1, $2, $3, $4, 7, NOW())",
        ids["sec_a_anthropic"],
        ids["tnt_a"],
        b"\xde\xad\xbe\xef",
        b"\x01" * 24,
    )

    # models (tenant A)
    common = {
        "tenant_id": ids["tnt_a"],
        "secret_ref": ids["sec_a_anthropic"],
        "created_by_id": ids["usr_a1"],
        "provider": "anthropic",
    }

    # TENANT-scope, enabled, has secret
    await conn.execute(
        "INSERT INTO models "
        "(id, tenant_id, scope, team_id, display_name, provider_template_id, "
        " model_identifier, public_config, secret_ref, enabled, created_by_id, "
        " created_at, updated_at) "
        "VALUES ($1,$2,'TENANT',NULL,$3,$4,$5,$6::jsonb,$7,TRUE,$8,NOW(),NOW())",
        ids["mdl_a_tenant"],
        common["tenant_id"],
        f"{_PREFIX}claude tenant-scope",
        common["provider"],
        "claude-sonnet-4-20250514",
        '{"api_base": "https://api.anthropic.com"}',
        common["secret_ref"],
        common["created_by_id"],
    )

    # TEAM-scope, enabled — visible only to team members
    await conn.execute(
        "INSERT INTO models "
        "(id, tenant_id, scope, team_id, display_name, provider_template_id, "
        " model_identifier, public_config, secret_ref, enabled, created_by_id, "
        " created_at, updated_at) "
        "VALUES ($1,$2,'TEAM',$3,$4,$5,$6,$7::jsonb,$8,TRUE,$9,NOW(),NOW())",
        ids["mdl_a_team"],
        common["tenant_id"],
        ids["team_a"],
        f"{_PREFIX}claude team-only",
        common["provider"],
        "claude-3-opus-20240229",
        "{}",
        common["secret_ref"],
        common["created_by_id"],
    )

    # disabled (enabled=FALSE) — must be excluded
    await conn.execute(
        "INSERT INTO models "
        "(id, tenant_id, scope, team_id, display_name, provider_template_id, "
        " model_identifier, public_config, enabled, created_by_id, "
        " created_at, updated_at) "
        "VALUES ($1,$2,'TENANT',NULL,$3,$4,$5,$6::jsonb,FALSE,$7,NOW(),NOW())",
        ids["mdl_a_disabled"],
        common["tenant_id"],
        f"{_PREFIX}claude disabled",
        common["provider"],
        "claude-disabled",
        "{}",
        common["created_by_id"],
    )

    # soft-deleted (deleted_at NOT NULL) — must be excluded
    await conn.execute(
        "INSERT INTO models "
        "(id, tenant_id, scope, team_id, display_name, provider_template_id, "
        " model_identifier, public_config, enabled, created_by_id, "
        " created_at, updated_at, deleted_at) "
        "VALUES ($1,$2,'TENANT',NULL,$3,$4,$5,$6::jsonb,TRUE,$7,NOW(),NOW(),NOW())",
        ids["mdl_a_deleted"],
        common["tenant_id"],
        f"{_PREFIX}claude deleted",
        common["provider"],
        "claude-deleted",
        "{}",
        common["created_by_id"],
    )
    return ids


async def _cleanup(conn) -> None:
    """Drop every row this run inserted, in FK order. Safe to call twice."""
    # children → parents
    for table in (
        "models",
        "model_secrets",
        "team_members",
        "teams",
        "users",
        "tenants",
    ):
        if table == "tenants":
            col = "slug"
            await conn.execute(
                f"DELETE FROM {table} WHERE {col} LIKE $1",  # noqa: S608 — table name from constant tuple
                _PREFIX + "%",
            )
        else:
            await conn.execute(
                f"DELETE FROM {table} WHERE id LIKE $1",  # noqa: S608 — same
                _PREFIX + "%",
            )


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # ---- static analysis -------------------------------------------------

    def tc01_imports_clean(self) -> None:
        try:
            from agent_search.agent_v2.db import (  # noqa: F401
                ModelRow,
                get_user_model,
                get_user_models,
            )

            self.rows.append(
                (
                    "TC-01 imports clean",
                    True,
                    "ModelRow / get_user_model* on db public surface",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("TC-01 imports clean", False, f"{exc!r}"))

    def tc02_get_user_model_requires_selector(self) -> None:
        from agent_search.agent_v2.db import get_user_model

        async def _go():
            await get_user_model("u", "t")  # no model_id, no (provider, identifier)

        try:
            asyncio.run(_go())
            self.rows.append(("TC-02 selector required", False, "did not raise"))
        except ValueError as exc:
            ok = "must pass" in str(exc)
            self.rows.append(("TC-02 selector required", ok, str(exc)[:80]))
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("TC-02 selector required", False, f"unexpected: {exc!r}"))

    def tc03_sql_has_required_predicates(self) -> None:
        """Read the module source and confirm the visibility clause is intact."""
        from agent_search.agent_v2.db import model_registry

        sql = model_registry._BASE_SELECT + model_registry._VISIBILITY
        checks = {
            "tenant_id = $1": "m.tenant_id = $1" in sql,
            "enabled = TRUE": "m.enabled = TRUE" in sql,
            "deleted_at IS NULL": "m.deleted_at IS NULL" in sql,
            "TENANT scope": "scope = 'TENANT'" in sql,
            "TEAM subquery": "team_members" in sql and "user_id = $2" in sql,
        }
        missing = [k for k, v in checks.items() if not v]
        ok = not missing
        detail = "all predicates present" if ok else f"missing: {missing}"
        self.rows.append(("TC-03 SQL predicates", ok, detail))

    # ---- live DB tests ---------------------------------------------------

    def _skip_if_no_db(self, name: str) -> bool:
        if not DATABASE_URL:
            self.rows.append((name, True, "skipped (DATABASE_URL unset)"))
            return True
        return False

    def _run_live(self, name: str, coro_factory) -> None:
        """Common scaffold: configure pool, seed, run, cleanup."""
        if self._skip_if_no_db(name):
            return

        from agent_search.agent_v2 import config as config_mod
        from agent_search.agent_v2.db import close_pool, get_pool

        config_mod.settings.database_url = DATABASE_URL

        async def _go():
            pool = await get_pool()
            async with pool.acquire() as conn:
                ids = await _seed(conn)
            try:
                return await coro_factory(ids)
            finally:
                async with pool.acquire() as conn:
                    await _cleanup(conn)
                await close_pool()

        try:
            ok, detail = asyncio.run(_go())
            self.rows.append((name, bool(ok), detail))
        except Exception as exc:  # noqa: BLE001
            # Best-effort cleanup in case _seed failed mid-way.
            try:
                asyncio.run(self._best_effort_cleanup())
            except Exception:  # noqa: BLE001, S110
                pass
            self.rows.append((name, False, f"{exc!r}"))

    async def _best_effort_cleanup(self) -> None:
        from agent_search.agent_v2 import config as config_mod
        from agent_search.agent_v2.db import close_pool, get_pool

        config_mod.settings.database_url = DATABASE_URL
        pool = await get_pool()
        try:
            async with pool.acquire() as conn:
                await _cleanup(conn)
        finally:
            await close_pool()

    def tc04_live_get_user_models_happy_path(self) -> None:
        async def _check(ids):
            from agent_search.agent_v2.db import get_user_models

            out = await get_user_models(user_id=ids["usr_a1"], tenant_id=ids["tnt_a"])
            seen = {m.id for m in out}
            expect_visible = {ids["mdl_a_tenant"], ids["mdl_a_team"]}
            expect_hidden = {ids["mdl_a_disabled"], ids["mdl_a_deleted"]}
            ok = expect_visible.issubset(seen) and not (expect_hidden & seen)
            return ok, f"visible={len(expect_visible & seen)} hidden_leaked={len(expect_hidden & seen)}"

        self._run_live("TC-04 get_user_models happy path", _check)

    def tc05_live_cross_tenant_returns_none(self) -> None:
        async def _check(ids):
            from agent_search.agent_v2.db import get_user_model

            got = await get_user_model(
                user_id=ids["usr_b1"],
                tenant_id=ids["tnt_b"],
                model_id=ids["mdl_a_tenant"],  # tenant A's model id
            )
            ok = got is None
            return ok, "None (isolated)" if ok else f"LEAK: {got!r}"

        self._run_live("TC-05 cross-tenant returns None", _check)

    def tc06_live_get_user_model_by_provider_returns_b64_secrets(self) -> None:
        async def _check(ids):
            from agent_search.agent_v2.db import get_user_model

            got = await get_user_model(
                user_id=ids["usr_a1"],
                tenant_id=ids["tnt_a"],
                provider="anthropic",
                model_identifier="claude-sonnet-4-20250514",
            )
            if got is None:
                return False, "row not found"
            if got.secret_ciphertext is None or got.secret_nonce is None:
                return False, "secrets missing"
            ct = b64decode(got.secret_ciphertext)
            nonce = b64decode(got.secret_nonce)
            ok = ct == b"\xde\xad\xbe\xef" and nonce == b"\x01" * 24 and got.secret_version == 7
            return ok, f"ct_len={len(ct)} nonce_len={len(nonce)} version={got.secret_version}"

        self._run_live("TC-06 (provider, identifier) -> b64 secrets", _check)

    def tc07_live_disabled_and_deleted_excluded(self) -> None:
        async def _check(ids):
            from agent_search.agent_v2.db import get_user_model

            disabled = await get_user_model(
                user_id=ids["usr_a1"],
                tenant_id=ids["tnt_a"],
                model_id=ids["mdl_a_disabled"],
            )
            deleted = await get_user_model(
                user_id=ids["usr_a1"],
                tenant_id=ids["tnt_a"],
                model_id=ids["mdl_a_deleted"],
            )
            ok = disabled is None and deleted is None
            return ok, f"disabled={disabled is None} deleted={deleted is None}"

        self._run_live("TC-07 disabled + deleted excluded", _check)

    def tc08_live_team_scope_visibility(self) -> None:
        async def _check(ids):
            from agent_search.agent_v2.db import get_user_model

            seen_by_member = await get_user_model(
                user_id=ids["usr_a1"],  # in team_a
                tenant_id=ids["tnt_a"],
                model_id=ids["mdl_a_team"],
            )
            seen_by_nonmember = await get_user_model(
                user_id=ids["usr_a2"],  # NOT in team_a, same tenant
                tenant_id=ids["tnt_a"],
                model_id=ids["mdl_a_team"],
            )
            ok = seen_by_member is not None and seen_by_nonmember is None
            return (
                ok,
                f"member_sees={seen_by_member is not None} "
                f"nonmember_blocked={seen_by_nonmember is None}",
            )

        self._run_live("TC-08 team-scope visibility", _check)

    # ---- runner ----------------------------------------------------------

    def run(self) -> int:
        for name in sorted(m for m in dir(self) if m.startswith("tc")):
            try:
                getattr(self, name)()
            except Exception as exc:  # noqa: BLE001 — top-level reporter
                self.rows.append((name, False, f"EXCEPTION: {exc!r}"))
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            print(f"{'[PASS]' if ok else '[FAIL]'} {name} | {detail}")
        print(
            f"\ntotal={len(self.rows)} passed={passed} "
            f"failed={len(self.rows) - passed}"
        )
        return 0 if passed == len(self.rows) else 1


if __name__ == "__main__":
    sys.exit(Runner().run())
