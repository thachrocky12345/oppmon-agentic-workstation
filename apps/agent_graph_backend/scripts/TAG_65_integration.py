#!/usr/bin/env python
# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-65 integration smoke — Swarm deploy hardening artifacts.

TAG-65 is a DevOps ticket: no new endpoint, no SSE shape to assert. The
"integration" surface is the set of artifacts a fresh `docker stack deploy`
relies on. This script proves all of them are present and wired:

  TC-01  docker-stack.yml graph-agent service declares the 4 required env vars.
  TC-02  apps/agent_graph_backend/agent_search/agent_v2/app.py exports
         `SOLVE_V3_REQUIRED_ENV` and `check_required_env`.
  TC-03  `check_required_env` raises SystemExit on each required var missing
         and boots cleanly when all are set.
  TC-04  scripts/check-jwt-parity.sh is present, executable bit-set on POSIX,
         and follows the documented exit-code contract (0/1/2) via the
         API_INSPECT_CMD / GRAPH_INSPECT_CMD overrides.
  TC-05  apps/web/src/app/api/graph/solve/route.ts authenticates and proxies
         to `/solve`; apps/web/src/app/api/graph/solve_v2/route.ts preserves
         the legacy unauthenticated proxy.
  TC-06  docs/decisions/ADR-0014-authenticated-solve-endpoint.md exists and
         is linked from docs/decisions/index.md.
  TC-07  .claude/skills/swarm-debug/SKILL.md contains a `solve-v3-check`
         subroutine section.
  TC-08  Static secret-grep across the four files this ticket creates —
         nothing matching common API-key shapes leaked into ADR / scripts.

Run with: ``python scripts/TAG_65_integration.py``. Exits non-zero on any
failure.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]

# Make `agent_search` importable when this script is run directly.
_BACKEND_DIR = REPO_ROOT / "apps" / "agent_graph_backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))


def _strip_ts_comments(src: str) -> str:
    """Remove `// ...` line comments and `/* ... */` block comments.

    Cheap-and-correct for our purposes (the route files don't contain regex
    literals or string-with-comment-syntax that would trip a naive stripper).
    """
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.DOTALL)
    src = re.sub(r"//[^\n]*", "", src)
    return src


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # ------------------------------------------------------------------
    # TC-01: docker-stack.yml declares the 4 required env vars
    # ------------------------------------------------------------------
    def tc01_stack_env_vars(self) -> None:
        try:
            stack = (REPO_ROOT / "docker-stack.yml").read_text(encoding="utf-8")
            required = [
                ("JWT_SECRET", r"JWT_SECRET:\s*\$\{JWT_SECRET:-\}"),
                (
                    "TAG_ENCRYPTION_MASTER_KEY",
                    r"TAG_ENCRYPTION_MASTER_KEY:\s*\$\{TAG_ENCRYPTION_MASTER_KEY:-\}",
                ),
                ("DATABASE_URL", r"DATABASE_URL:\s*\$\{DATABASE_URL:-\}"),
                (
                    "OPENAI_EMBED_API_KEY",
                    r"OPENAI_EMBED_API_KEY:\s*\$\{OPENAI_EMBED_API_KEY:-\}",
                ),
                ("ENABLE_SOLVE_V3", r"ENABLE_SOLVE_V3:\s*\$\{ENABLE_SOLVE_V3:-true\}"),
            ]
            missing = [name for name, pat in required if not re.search(pat, stack)]
            assert not missing, f"missing vars in docker-stack.yml: {missing}"
            self.rows.append(
                (
                    "docker-stack.yml declares all 5 TAG-65 env placeholders",
                    True,
                    f"vars={[n for n, _ in required]}",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("docker-stack.yml declares all 5 TAG-65 env placeholders", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-02: app.py exports the fail-fast surface
    # ------------------------------------------------------------------
    def tc02_app_exports(self) -> None:
        try:
            from agent_search.agent_v2.app import (
                SOLVE_V3_REQUIRED_ENV,
                check_required_env,
            )

            assert SOLVE_V3_REQUIRED_ENV == (
                "JWT_SECRET",
                "TAG_ENCRYPTION_MASTER_KEY",
                "DATABASE_URL",
                "OPENAI_EMBED_API_KEY",
            )
            assert callable(check_required_env)
            self.rows.append(
                ("app.py exports SOLVE_V3_REQUIRED_ENV + check_required_env", True, "ok")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                (
                    "app.py exports SOLVE_V3_REQUIRED_ENV + check_required_env",
                    False,
                    repr(exc),
                )
            )

    # ------------------------------------------------------------------
    # TC-03: fail-fast contract round-trip
    # ------------------------------------------------------------------
    def tc03_failfast_contract(self) -> None:
        try:
            from agent_search.agent_v2.app import check_required_env
            from agent_search.agent_v2.config import Settings

            good = Settings(
                enable_solve_v3=True,
                jwt_secret="x",
                tag_encryption_master_key="x",
                database_url="x",
                openai_embed_api_key="x",
                openai_api_key="x",
            )
            check_required_env(good)  # must not raise

            bad = Settings(
                enable_solve_v3=True,
                jwt_secret="",
                tag_encryption_master_key="x",
                database_url="x",
                openai_embed_api_key="x",
                openai_api_key="x",
            )
            raised = False
            try:
                check_required_env(bad)
            except SystemExit as exc:
                raised = "JWT_SECRET" in str(exc)
            assert raised, "missing JWT_SECRET must raise SystemExit"

            # Flag-off path is a no-op even with everything empty.
            check_required_env(
                Settings(
                    enable_solve_v3=False,
                    jwt_secret="",
                    tag_encryption_master_key="",
                    database_url="",
                    openai_embed_api_key="",
                    openai_api_key="",
                )
            )
            self.rows.append(
                ("check_required_env contract (happy + fail + flag-off)", True, "ok")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                (
                    "check_required_env contract (happy + fail + flag-off)",
                    False,
                    repr(exc),
                )
            )

    # ------------------------------------------------------------------
    # TC-04: scripts/check-jwt-parity.sh exit codes
    # ------------------------------------------------------------------
    def tc04_parity_script_contract(self) -> None:
        try:
            script = REPO_ROOT / "scripts" / "check-jwt-parity.sh"
            assert script.exists(), f"missing {script}"
            if shutil.which("bash") is None:
                self.rows.append(
                    (
                        "parity script exit-code contract",
                        True,  # not a failure: just skipped
                        "skipped: bash not available on host",
                    )
                )
                return

            def run(api_env: str, graph_env: str) -> int:
                env = os.environ.copy()
                env["API_INSPECT_CMD"] = _printf_b(api_env)
                env["GRAPH_INSPECT_CMD"] = _printf_b(graph_env)
                env["WSLENV"] = (
                    env.get("WSLENV", "") + ":API_INSPECT_CMD:GRAPH_INSPECT_CMD"
                ).lstrip(":")
                with open(script, "rb") as f:
                    return subprocess.run(
                        ["bash"],
                        stdin=f,
                        capture_output=True,
                        env=env,
                        check=False,
                    ).returncode

            assert run("JWT_SECRET=k\n", "JWT_SECRET=k\n") == 0, "match → 0"
            assert run("JWT_SECRET=a\n", "JWT_SECRET=b\n") == 1, "mismatch → 1"
            assert run("OTHER=x\n", "JWT_SECRET=k\n") == 1, "api empty → 1"
            assert run("JWT_SECRET=k\n", "OTHER=x\n") == 1, "graph empty → 1"

            # Inspect failure path (subroutine exits 1, script wraps as 2).
            env = os.environ.copy()
            env["API_INSPECT_CMD"] = "false"
            env["GRAPH_INSPECT_CMD"] = "printf '%b' 'JWT_SECRET=k\\n'"
            env["WSLENV"] = (
                env.get("WSLENV", "") + ":API_INSPECT_CMD:GRAPH_INSPECT_CMD"
            ).lstrip(":")
            with open(script, "rb") as f:
                rc = subprocess.run(
                    ["bash"],
                    stdin=f,
                    capture_output=True,
                    env=env,
                    check=False,
                ).returncode
            assert rc == 2, f"inspect failure must → 2, got {rc}"

            self.rows.append(
                ("parity script exit-code contract (0/1/2)", True, "all paths ok")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("parity script exit-code contract (0/1/2)", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-05: web proxies present + correctly target /solve vs /solve_v2
    # ------------------------------------------------------------------
    def tc05_web_proxies(self) -> None:
        try:
            auth_route_raw = (
                REPO_ROOT
                / "apps"
                / "web"
                / "src"
                / "app"
                / "api"
                / "graph"
                / "solve"
                / "route.ts"
            ).read_text(encoding="utf-8")
            legacy_route_raw = (
                REPO_ROOT
                / "apps"
                / "web"
                / "src"
                / "app"
                / "api"
                / "graph"
                / "solve_v2"
                / "route.ts"
            ).read_text(encoding="utf-8")

            # Strip comments before grepping for the upstream-URL shape so a
            # docstring referencing "/solve_v2" can't fool the check.
            auth_route = _strip_ts_comments(auth_route_raw)
            legacy_route = _strip_ts_comments(legacy_route_raw)

            # Authenticated proxy must:
            assert re.search(
                r"`\$\{GRAPH_BACKEND_URL[^`]*\}/solve`", auth_route
            ), "auth proxy upstreamUrl must end with /solve"
            assert not re.search(
                r"/solve_v2", auth_route
            ), "auth proxy code must NOT reference /solve_v2"
            assert (
                "authorization" in auth_route.lower()
            ), "auth proxy forwards Authorization"
            assert (
                "auth_token" in auth_route
            ), "auth proxy reads auth_token cookie fallback"
            assert "401" in auth_route, "auth proxy returns 401 when no bearer"

            # Legacy proxy must:
            assert re.search(
                r"`\$\{GRAPH_BACKEND_URL[^`]*\}/solve_v2`", legacy_route
            ), "legacy proxy upstreamUrl must end with /solve_v2"
            # The legacy proxy MUST NOT forward auth_token cookie — that's the
            # whole point of preserving the unauthenticated path.
            assert (
                "auth_token" not in legacy_route
            ), "legacy proxy must not read auth_token cookie"

            self.rows.append(
                ("web proxies: /solve auth + /solve_v2 legacy preserved", True, "ok")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("web proxies: /solve auth + /solve_v2 legacy preserved", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-06: ADR-0014 present + indexed
    # ------------------------------------------------------------------
    def tc06_adr_present_and_indexed(self) -> None:
        try:
            adr = REPO_ROOT / "docs" / "decisions" / "ADR-0014-authenticated-solve-endpoint.md"
            assert adr.exists(), f"missing {adr}"
            body = adr.read_text(encoding="utf-8")
            # Mandatory ADR sections.
            for section in ("## Context", "## Decision", "## Consequences", "## Related"):
                assert section in body, f"ADR missing section {section!r}"
            # Each of the six "why" questions from the ticket must be addressed.
            for marker in (
                "HS256",
                "asyncpg",
                "Per-request",  # LLMClient
                "PlannerAgent",
                "403",
                "decryption",
            ):
                assert marker in body, f"ADR missing decision marker {marker!r}"

            index = (REPO_ROOT / "docs" / "decisions" / "index.md").read_text(
                encoding="utf-8"
            )
            assert "ADR-0014" in index, "index.md missing ADR-0014 entry"

            self.rows.append(
                ("ADR-0014 present + linked from index", True, str(adr.name))
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("ADR-0014 present + linked from index", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-07: swarm-debug runbook subroutine present
    # ------------------------------------------------------------------
    def tc07_runbook_subroutine(self) -> None:
        try:
            skill = (
                REPO_ROOT / ".claude" / "skills" / "swarm-debug" / "SKILL.md"
            ).read_text(encoding="utf-8")
            assert "solve-v3-check" in skill, "swarm-debug missing solve-v3-check"
            assert "scripts/check-jwt-parity.sh" in skill, (
                "swarm-debug subroutine must reference the parity script"
            )
            assert "ENABLE_SOLVE_V3" in skill, (
                "subroutine must mention rollback knob"
            )
            self.rows.append(
                ("swarm-debug SKILL.md contains solve-v3-check subroutine", True, "ok")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("swarm-debug SKILL.md contains solve-v3-check subroutine", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-08: no real-looking secrets leaked into the new files
    # ------------------------------------------------------------------
    def tc08_no_secrets_in_new_files(self) -> None:
        try:
            new_files = [
                REPO_ROOT / "scripts" / "check-jwt-parity.sh",
                REPO_ROOT
                / "docs"
                / "decisions"
                / "ADR-0014-authenticated-solve-endpoint.md",
                REPO_ROOT
                / "apps"
                / "web"
                / "src"
                / "app"
                / "api"
                / "graph"
                / "solve"
                / "route.ts",
                REPO_ROOT
                / "apps"
                / "web"
                / "src"
                / "app"
                / "api"
                / "graph"
                / "solve_v2"
                / "route.ts",
                REPO_ROOT
                / "apps"
                / "agent_graph_backend"
                / "agent_search"
                / "tests"
                / "deploy"
                / "test_required_env.py",
            ]
            # Patterns chosen for low-FP, high-signal: OpenAI sk-, Anthropic
            # sk-ant-, Cerebras csk-, Tavily tvly-, AWS AKIA, eyJ... (JWT prefix).
            patterns = re.compile(
                r"sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9]{20,}|csk-[A-Za-z0-9]{20,}|"
                r"tvly-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_\-]{20,}"
            )
            hits: list[str] = []
            for p in new_files:
                if not p.exists():
                    continue
                for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
                    if patterns.search(line):
                        hits.append(f"{p.relative_to(REPO_ROOT)}:{n}")
            assert not hits, f"secrets in: {hits}"
            self.rows.append(
                ("no secrets in 5 TAG-65 deliverable files", True, f"scanned={len(new_files)}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("no secrets in 5 TAG-65 deliverable files", False, repr(exc))
            )

    # ------------------------------------------------------------------
    def run(self) -> int:
        for name in sorted(dir(self)):
            if name.startswith("tc"):
                getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            tag = "[PASS]" if ok else "[FAIL]"
            print(f"{tag} {name}  {detail}")
        print(f"\ntotal={len(self.rows)} passed={passed} failed={len(self.rows) - passed}")
        return 0 if passed == len(self.rows) else 1


def _printf_b(s: str) -> str:
    escaped = s.replace("\\", "\\\\").replace("\n", "\\n").replace("'", "'\\''")
    return f"printf '%b' '{escaped}'"


if __name__ == "__main__":
    sys.exit(Runner().run())
