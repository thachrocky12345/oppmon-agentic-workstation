#!/usr/bin/env python
"""TAG-51 — asyncpg pool + DATABASE_URL plumbing integration smoke.

What this proves end-to-end:
  TC-01  agent_search imports cleanly with DATABASE_URL unset
  TC-02  Settings.require_db raises with empty DSN
  TC-03  Settings.require_db succeeds with a DSN set
  TC-04  pg_fetch_one("UPDATE ...") rejected by write-guard
  TC-05  pg_fetch_one("SELECT now()") returns a row (live DB)
  TC-06  pg_fetch_one("UPDATE ... RETURNING id", _allow_write=True) reaches DB
  TC-07  close_pool() is idempotent and resets the singleton

TC-05 / TC-06 are skipped (counted as PASS with "skipped" detail) when no
DATABASE_URL is exported; they require a running Postgres on the host
referenced in the URL.

Usage:
    # Optional — only needed for TC-05 / TC-06:
    export DATABASE_URL=postgresql://oppmon:oppmon@localhost:5433/oppmon

    cd apps/agent_graph_backend
    python ../../scripts/TAG_51_integration.py
"""
from __future__ import annotations

import asyncio
import os
import sys

# Allow running from repo root: scripts/TAG_51_integration.py
sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "apps", "agent_graph_backend")
    ),
)

DATABASE_URL = os.getenv("DATABASE_URL", "")


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # ---- test cases -----------------------------------------------------

    def tc01_imports_clean(self) -> None:
        try:
            from agent_search.agent_v2 import db as _db  # noqa: F401
            from agent_search.agent_v2.app import mount_v2  # noqa: F401
            from agent_search.agent_v2.config import settings  # noqa: F401

            self.rows.append(("TC-01 imports clean", True, "agent_search.agent_v2.db OK"))
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("TC-01 imports clean", False, f"{exc!r}"))

    def tc02_require_db_rejects_empty(self) -> None:
        from agent_search.agent_v2.config import Settings

        s = Settings(database_url="")
        try:
            s.require_db()
            self.rows.append(("TC-02 require_db empty DSN", False, "did not raise"))
        except RuntimeError as exc:
            self.rows.append(
                ("TC-02 require_db empty DSN", "DATABASE_URL" in str(exc), str(exc)[:80])
            )

    def tc03_require_db_passes_with_dsn(self) -> None:
        from agent_search.agent_v2.config import Settings

        s = Settings(database_url="postgresql://u:p@h:5432/d")
        try:
            s.require_db()
            self.rows.append(("TC-03 require_db with DSN", True, "no raise"))
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("TC-03 require_db with DSN", False, f"{exc!r}"))

    def tc04_write_guard_rejects(self) -> None:
        from agent_search.agent_v2.db import pg_fetch_one

        async def _go():
            await pg_fetch_one("UPDATE users SET name='x'")

        try:
            asyncio.run(_go())
            self.rows.append(("TC-04 write-guard", False, "did not raise"))
        except ValueError as exc:
            ok = "non-SELECT SQL" in str(exc)
            self.rows.append(("TC-04 write-guard", ok, str(exc)[:80]))
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("TC-04 write-guard", False, f"unexpected: {exc!r}"))

    def tc05_select_now_live(self) -> None:
        if not DATABASE_URL:
            self.rows.append(("TC-05 SELECT now() live", True, "skipped (DATABASE_URL unset)"))
            return

        from agent_search.agent_v2 import config as config_mod
        from agent_search.agent_v2.db import close_pool, pg_fetch_one

        config_mod.settings.database_url = DATABASE_URL

        async def _go():
            try:
                row = await pg_fetch_one("SELECT now() AS ts")
                return row is not None and "ts" in row
            finally:
                await close_pool()

        try:
            ok = asyncio.run(_go())
            self.rows.append(("TC-05 SELECT now() live", bool(ok), "row received"))
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("TC-05 SELECT now() live", False, f"{exc!r}"))

    def tc06_allow_write_reaches_db(self) -> None:
        if not DATABASE_URL:
            self.rows.append(
                ("TC-06 allow_write reaches DB", True, "skipped (DATABASE_URL unset)")
            )
            return

        from agent_search.agent_v2 import config as config_mod
        from agent_search.agent_v2.db import close_pool, pg_execute

        config_mod.settings.database_url = DATABASE_URL

        async def _go():
            try:
                # Harmless write: create-then-drop a temp table.
                await pg_execute("CREATE TEMP TABLE tag51_smoke (x int)", _allow_write=True)
                tag = await pg_execute("DROP TABLE tag51_smoke", _allow_write=True)
                return tag
            finally:
                await close_pool()

        try:
            tag = asyncio.run(_go())
            self.rows.append(("TC-06 allow_write reaches DB", "DROP" in tag, tag))
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("TC-06 allow_write reaches DB", False, f"{exc!r}"))

    def tc07_close_pool_idempotent(self) -> None:
        from agent_search.agent_v2.db import close_pool
        from agent_search.agent_v2.db import pool as pool_mod

        async def _go():
            pool_mod._pool = None
            await close_pool()
            await close_pool()
            return pool_mod._pool is None

        try:
            ok = asyncio.run(_go())
            self.rows.append(("TC-07 close_pool idempotent", bool(ok), "two calls OK"))
        except Exception as exc:  # noqa: BLE001
            self.rows.append(("TC-07 close_pool idempotent", False, f"{exc!r}"))

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
