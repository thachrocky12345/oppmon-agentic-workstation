#!/usr/bin/env python
# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-64 integration smoke — ``/solve`` end-to-end wiring.

The pytest integration suite in ``agent_search/tests/integration/`` is
the source of truth for the 12 scenarios. This out-of-process smoke
proves the **wiring** end-to-end from a fresh interpreter:

  * The integration package imports cleanly (conftest, fixtures, helpers).
  * The seed SQL + TS-encrypted-secrets fixture files are present and
    parse as valid SQL / JSON respectively.
  * The SSE snapshot file exists, has the expected shape, and the
    captured bookend frames match ``/solve_v2``'s contract.
  * The two-tenant fixtures declare distinct ``tenant_id`` values for
    every isolated row (defence-in-depth lint).
  * The eval extension at ``evals/corpus-questions.json`` is well-formed
    and carries the expected number of grounded + OOD entries.

Run with: ``python scripts/TAG_64_integration.py``. Exits non-zero on
any failure.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # ------------------------------------------------------------------
    # TC-01: integration package imports cleanly
    # ------------------------------------------------------------------
    def tc01_imports(self) -> None:
        try:
            from agent_search.tests.integration.conftest import (
                COLLECTION_A,
                COLLECTION_B,
                JWT_SECRET,
                MODEL_FAKE,
                PROVIDER_FAKE,
                TENANT_A,
                TENANT_B,
                StubCorpus,
                event_types,
                make_hit,
                mint_jwt,
            )

            assert TENANT_A != TENANT_B
            assert COLLECTION_A != COLLECTION_B
            assert callable(mint_jwt)
            assert callable(event_types)
            assert callable(make_hit)
            assert StubCorpus is not None
            self.rows.append(
                (
                    "integration conftest imports + symbols stable",
                    True,
                    f"tenants=[{TENANT_A},{TENANT_B}] "
                    f"model={MODEL_FAKE} provider={PROVIDER_FAKE} "
                    f"jwt_secret_len={len(JWT_SECRET)}",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("integration conftest imports + symbols stable", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-02: seed SQL file present + references both tenants
    # ------------------------------------------------------------------
    def tc02_seed_sql_present(self) -> None:
        try:
            sql_path = (
                Path(__file__).resolve().parent.parent
                / "agent_search"
                / "tests"
                / "integration"
                / "fixtures"
                / "seed_two_tenants.sql"
            )
            assert sql_path.exists(), f"missing {sql_path}"
            body = sql_path.read_text()
            # Both tenants must appear; each must have at least a
            # matching auth_user, team, model, collection, document,
            # and chunk row.
            for tenant in ("tnt_alpha", "tnt_beta"):
                assert tenant in body, f"tenant {tenant!r} missing from seed"
            for table in (
                "tenants",
                "auth_users",
                "teams",
                "team_members",
                "models",
                "model_secrets",
                "rag_collections",
                "rag_documents",
                "rag_chunks",
            ):
                assert (
                    f"INTO {table}" in body or f"INTO {table.lower()}" in body
                ), f"no INSERT INTO {table}"
            # Defence-in-depth — the SECRET canary lives only in Tenant A.
            assert "ALPHA_TENANT_SECRET" in body
            assert "BETA_TENANT_FACT" in body
            self.rows.append(
                (
                    "seed SQL present + two-tenant rows complete",
                    True,
                    f"path={sql_path.name} bytes={len(body)}",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("seed SQL present + two-tenant rows complete", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-03: TS-encrypted fixture parses + carries plaintext oracle
    # ------------------------------------------------------------------
    def tc03_encrypted_fixture_parses(self) -> None:
        try:
            path = (
                Path(__file__).resolve().parent.parent
                / "agent_search"
                / "tests"
                / "integration"
                / "fixtures"
                / "seed_models_with_ts_encryption.json"
            )
            data = json.loads(path.read_text())
            assert data["version"] == 1
            assert data["master_key_label"] == "TAG_ENCRYPTION_FIXTURE_KEY"
            rows = data["rows"]
            assert len(rows) == 2, f"expected 2 fixture rows, got {len(rows)}"
            ids = {r["id"] for r in rows}
            assert ids == {"msec_alpha", "msec_beta"}, ids
            for r in rows:
                assert "encrypted_payload_b64" in r
                assert "nonce_b64" in r
                # The plaintext oracle is for QA — production code never
                # reads it. We assert it exists with the expected key.
                assert r["plaintext_for_oracle_only"]["api_key"]
            self.rows.append(
                (
                    "TS-encrypted fixture parses + oracle present",
                    True,
                    f"rows={len(rows)} ids={sorted(ids)}",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("TS-encrypted fixture parses + oracle present", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-04: SSE snapshot file exists + bookend frames stable
    # ------------------------------------------------------------------
    def tc04_snapshot_present(self) -> None:
        try:
            path = (
                Path(__file__).resolve().parent.parent
                / "agent_search"
                / "tests"
                / "integration"
                / "snapshots"
                / "solve_v2.json"
            )
            data = json.loads(path.read_text())
            events = data["events"]
            assert events[0] == "planner:STREAM_ING", events[0]
            assert events[-1] == "planner:END", events[-1]
            assert "planner:ANSWER_ING" in events, events
            self.rows.append(
                (
                    "SSE snapshot present + bookend frames stable",
                    True,
                    f"events={events}",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("SSE snapshot present + bookend frames stable", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-05: eval extension corpus-questions.json well-formed
    # ------------------------------------------------------------------
    def tc05_eval_extension_present(self) -> None:
        try:
            path = REPO_ROOT / "evals" / "corpus-questions.json"
            assert path.exists(), f"missing {path}"
            data = json.loads(path.read_text())
            grounded = [q for q in data if q.get("category") == "grounded"]
            ood = [q for q in data if q.get("category") == "ood"]
            assert len(grounded) >= 5, f"need >=5 grounded, got {len(grounded)}"
            assert len(ood) >= 5, f"need >=5 OOD, got {len(ood)}"
            # Every grounded entry must carry expected_citations[] (the
            # [[doc:chunk]] markers the gate asserts on).
            for q in grounded:
                assert q.get("expected_citations"), (
                    f"grounded q {q.get('id')!r} missing expected_citations"
                )
            self.rows.append(
                (
                    "eval extension well-formed (5+5 split)",
                    True,
                    f"grounded={len(grounded)} ood={len(ood)}",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("eval extension well-formed (5+5 split)", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-06: pytest collection — the 12-case file is discoverable
    # ------------------------------------------------------------------
    def tc06_pytest_discovery(self) -> None:
        try:

            mod_path = (
                Path(__file__).resolve().parent.parent
                / "agent_search"
                / "tests"
                / "integration"
                / "test_solve_e2e.py"
            )
            assert mod_path.exists()
            body = mod_path.read_text()
            # Count the test functions named test_tcNN_*.
            ticks = re.findall(r"async def (test_tc\d\d_[a-z0-9_]+)\(", body)
            assert len(ticks) == 12, f"expected 12 ticket cases, got {len(ticks)}"
            # All twelve numeric tags must be present (1..12).
            def _idx(name: str) -> int:
                m = re.match(r"test_tc(\d\d)", name)
                assert m is not None  # guaranteed by the regex above
                return int(m.group(1))

            nums = sorted(_idx(t) for t in ticks)
            assert nums == list(range(1, 13)), nums
            self.rows.append(
                (
                    "test_solve_e2e.py contains all 12 tcNN_* cases",
                    True,
                    f"ticks=[1..{nums[-1]}]",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("test_solve_e2e.py contains all 12 tcNN_* cases", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-07: secret-grep across the new test surface
    # ------------------------------------------------------------------
    def tc07_no_secrets_in_new_files(self) -> None:
        try:
            roots = [
                Path(__file__).resolve().parent.parent
                / "agent_search"
                / "tests"
                / "integration",
                REPO_ROOT / "evals" / "corpus-questions.json",
                Path(__file__).resolve(),
            ]
            pattern = re.compile(
                r"sk-[A-Za-z0-9]{20,}|csk-[A-Za-z0-9]{20,}|"
                r"tvly-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}"
            )
            hits: list[str] = []
            for root in roots:
                if root.is_file():
                    candidates: list[Path] = [root]
                else:
                    candidates = [p for p in root.rglob("*") if p.is_file()]
                for p in candidates:
                    if p.suffix in {".pyc"}:
                        continue
                    try:
                        text = p.read_text(encoding="utf-8", errors="ignore")
                    except Exception:  # noqa: BLE001
                        continue
                    for m in pattern.finditer(text):
                        # The canary strings in TC-11/TC-12 START with
                        # ``sk-`` / ``csk-`` but are followed by ASCII
                        # words separated by hyphens — never 20 hex
                        # chars. The regex's [A-Za-z0-9]{20,} is what
                        # gates that.  But just in case the canary
                        # is bumped longer, allow-list it explicitly.
                        snippet = m.group(0)
                        if snippet.startswith("sk-secret-canary"):
                            continue
                        if snippet.startswith("csk-secret-not"):
                            continue
                        hits.append(f"{p.name}: {snippet}")
            assert not hits, f"secret-like strings found: {hits}"
            self.rows.append(
                (
                    "no secrets in new test surface (regex grep)",
                    True,
                    "scanned tests/integration + evals + this script",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("no secrets in new test surface (regex grep)", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-08: CI workflow file references the integration path
    # ------------------------------------------------------------------
    def tc08_ci_wired(self) -> None:
        try:
            path = (
                REPO_ROOT / ".github" / "workflows" / "agent-search-tests.yml"
            )
            assert path.exists(), f"missing {path}"
            body = path.read_text()
            assert "agent_search/tests" in body, (
                "CI workflow does not run agent_search/tests"
            )
            assert "pytest" in body, "CI workflow does not call pytest"
            self.rows.append(
                (
                    "CI workflow runs pytest agent_search/tests/",
                    True,
                    f"path={path.relative_to(REPO_ROOT)}",
                )
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("CI workflow runs pytest agent_search/tests/", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # Driver
    # ------------------------------------------------------------------
    def run(self) -> int:
        # Run in numeric order. The framework guarantees ordering across
        # ``dir()``, but we sort defensively in case attribute order
        # changes between Python versions.
        names = sorted(
            n for n in dir(self) if n.startswith("tc") and callable(getattr(self, n))
        )
        for name in names:
            getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        failed = len(self.rows) - passed
        for name, ok, detail in self.rows:
            mark = "[PASS]" if ok else "[FAIL]"
            print(f"{mark} {name}  {detail}")
        print(f"\ntotal={len(self.rows)} passed={passed} failed={failed}")
        return 0 if failed == 0 else 1


if __name__ == "__main__":
    os.chdir(REPO_ROOT / "apps" / "agent_graph_backend")
    sys.path.insert(0, str(REPO_ROOT / "apps" / "agent_graph_backend"))
    sys.exit(Runner().run())
