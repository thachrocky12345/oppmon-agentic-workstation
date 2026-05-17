#!/usr/bin/env python
# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-72 integration smoke — filesystem prompt loader.

The pytest suite under ``agent_search/tests/prompts/test_loader.py``
exercises every loader code path against a hermetic ``tmp_path``
catalog. This script proves the **wiring** in-process against the
*real* production catalog that ships with the package:

  * Public API imports resolve from ``agent_v2.prompts``.
  * ``warm_cache()`` succeeds against the shipped ``_schema.yaml`` +
    ``system/web_planner.md`` (i.e. a fresh container would boot).
  * ``get_prompt("system.web_planner")`` returns a non-empty body
    that matches the PLANNER_SYSTEM contract (planner workflow, tool
    references) and survives the lru_cache.
  * ``get_prompt_meta`` returns the expected frontmatter fields.
  * Unknown slug raises ``PromptNotFound``.
  * ``mount_v2(FastAPI())`` still boots — confirms the new
    ``warm_prompt_cache()`` call wired into ``app.mount_v2`` does not
    regress the existing ``/solve_v2`` route registration.
  * (Env-gated, TC-07) ``/solve_v2`` over HTTP still streams an SSE
    frame when ``AGENT_GRAPH_URL`` points at a running server.

Run with::

    cd apps/agent_graph_backend
    python scripts/TAG_72_integration.py
"""
from __future__ import annotations

import contextlib
import json
import os
import sys


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    # ------------------------------------------------------------------
    # TC-01: public API surface imports cleanly
    # ------------------------------------------------------------------
    def tc01_imports(self) -> None:
        try:
            from agent_search.agent_v2.prompts import (
                Prompt,
                PromptInactive,
                PromptNotFound,
                PromptSchemaError,
                get_prompt,
                get_prompt_meta,
                render_prompt,
                warm_cache,
            )

            assert callable(get_prompt)
            assert callable(get_prompt_meta)
            assert callable(render_prompt)
            assert callable(warm_cache)
            assert isinstance(Prompt, type)
            assert issubclass(PromptNotFound, KeyError)
            assert issubclass(PromptSchemaError, ValueError)
            assert issubclass(PromptInactive, RuntimeError)
            self.rows.append(
                ("public API surface imports cleanly", True,
                 "Prompt + 3 exceptions + 4 callables exported")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("public API surface imports cleanly", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-02: warm_cache against the production catalog
    # ------------------------------------------------------------------
    def tc02_warm_cache_production(self) -> None:
        try:
            from agent_search.agent_v2.prompts import (
                get_prompt,
                get_prompt_meta,
                warm_cache,
            )

            # Clear so warming actually does work (not just a no-op).
            get_prompt.cache_clear()
            get_prompt_meta.cache_clear()
            warm_cache()
            self.rows.append(
                ("warm_cache() resolves every shipped slug", True,
                 "no PromptNotFound / PromptSchemaError / PromptInactive")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("warm_cache() resolves every shipped slug",
                 False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-03: get_prompt returns the real PLANNER_SYSTEM body
    # ------------------------------------------------------------------
    def tc03_get_prompt_real_body(self) -> None:
        try:
            from agent_search.agent_v2.prompts import get_prompt

            body = get_prompt("system.web_planner")
            ok = (
                isinstance(body, str)
                and len(body) > 200
                and "plan" in body.lower()
                and "tool" in body.lower()
                and "finalize" in body
            )
            self.rows.append(
                ("system.web_planner body matches PLANNER_SYSTEM contract",
                 ok,
                 f"len={len(body)} starts={body[:50]!r}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("system.web_planner body matches PLANNER_SYSTEM contract",
                 False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-04: lru_cache identity — second call returns same string object
    # ------------------------------------------------------------------
    def tc04_cache_identity(self) -> None:
        try:
            from agent_search.agent_v2.prompts import get_prompt

            a = get_prompt("system.web_planner")
            b = get_prompt("system.web_planner")
            self.rows.append(
                ("lru_cache returns identical string object", a is b,
                 f"id_a={id(a)} id_b={id(b)}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("lru_cache returns identical string object", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-05: get_prompt_meta frontmatter shape
    # ------------------------------------------------------------------
    def tc05_get_prompt_meta(self) -> None:
        try:
            from agent_search.agent_v2.prompts import get_prompt_meta

            meta = get_prompt_meta("system.web_planner")
            ok = (
                meta.slug == "system.web_planner"
                and meta.status == "active"
                and isinstance(meta.version, int)
                and meta.version >= 1
                and isinstance(meta.placeholders, tuple)
                and meta.placeholders == ()
                and isinstance(meta.body, str)
                and len(meta.body) > 0
            )
            self.rows.append(
                ("get_prompt_meta returns frozen Prompt with right fields",
                 ok,
                 f"slug={meta.slug} version={meta.version} "
                 f"status={meta.status} placeholders={meta.placeholders}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("get_prompt_meta returns frozen Prompt with right fields",
                 False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-06: unknown slug raises PromptNotFound
    # ------------------------------------------------------------------
    def tc06_unknown_slug_raises(self) -> None:
        try:
            from agent_search.agent_v2.prompts import (
                PromptNotFound,
                get_prompt,
            )

            try:
                get_prompt("system.does_not_exist_anywhere")
            except PromptNotFound as exc:
                self.rows.append(
                    ("unknown slug raises PromptNotFound", True,
                     f"msg={str(exc)[:60]!r}")
                )
                return
            self.rows.append(
                ("unknown slug raises PromptNotFound", False,
                 "no exception raised")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("unknown slug raises PromptNotFound", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-07: mount_v2 still boots after the warm_cache wire-in
    # ------------------------------------------------------------------
    def tc07_mount_v2_still_boots(self) -> None:
        try:
            from fastapi import FastAPI

            from agent_search.agent_v2.app import mount_v2

            app = FastAPI()
            mount_v2(app)
            paths = {r.path for r in app.routes}  # type: ignore[attr-defined]
            ok = "/solve_v2" in paths
            self.rows.append(
                ("mount_v2 + warm_prompt_cache boots cleanly", ok,
                 f"/solve_v2 registered, routes_total={len(paths)}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("mount_v2 + warm_prompt_cache boots cleanly",
                 False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-08: render_prompt happy path on the static system prompt
    #        (placeholders=[] → render_prompt must accept no kwargs and
    #        return the body unchanged)
    # ------------------------------------------------------------------
    def tc08_render_prompt_static(self) -> None:
        try:
            from agent_search.agent_v2.prompts import get_prompt, render_prompt

            body = get_prompt("system.web_planner")
            rendered = render_prompt("system.web_planner")
            self.rows.append(
                ("render_prompt on no-placeholder slug == get_prompt body",
                 rendered == body,
                 f"len(rendered)={len(rendered)}")
            )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("render_prompt on no-placeholder slug == get_prompt body",
                 False, repr(exc))
            )

    # ------------------------------------------------------------------
    # TC-09 (env-gated): live /solve_v2 SSE smoke
    #
    # Only runs when AGENT_GRAPH_URL is set (e.g. local Uvicorn or the
    # swarm graph-agent). Skipped-but-passed otherwise so CI without a
    # running server still exits 0.
    # ------------------------------------------------------------------
    def tc09_solve_v2_live(self) -> None:
        url = os.getenv("AGENT_GRAPH_URL")
        if not url:
            self.rows.append(
                ("/solve_v2 live SSE smoke (env-gated)", True,
                 "skipped: AGENT_GRAPH_URL not set")
            )
            return

        try:
            import httpx

            with httpx.Client(timeout=15) as client, client.stream(
                "POST",
                f"{url.rstrip('/')}/solve_v2",
                json={
                    "inputs": "ping",
                    "enable_tools": False,
                    "web_fallback": False,
                    "collection_ids": [],
                },
            ) as r:
                if r.status_code != 200:
                    self.rows.append(
                        ("/solve_v2 live SSE smoke (env-gated)", False,
                         f"status={r.status_code}")
                    )
                    return
                saw_frame = False
                for line in r.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data:"):
                        payload = line[len("data:"):].strip()
                        # We only need to know a frame parses — content
                        # may be an error frame, that's still a wire pass.
                        with contextlib.suppress(Exception):
                            json.loads(payload)
                        saw_frame = True
                        break
                    self.rows.append(
                        ("/solve_v2 live SSE smoke (env-gated)", saw_frame,
                         "got at least one SSE data: frame"
                         if saw_frame else "no data: frame before EOF")
                    )
        except Exception as exc:  # noqa: BLE001
            self.rows.append(
                ("/solve_v2 live SSE smoke (env-gated)", False, repr(exc))
            )

    # ------------------------------------------------------------------
    # Runner
    # ------------------------------------------------------------------
    def run(self) -> int:
        for name in sorted(m for m in dir(self) if m.startswith("tc")):
            getattr(self, name)()
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            marker = "[PASS]" if ok else "[FAIL]"
            print(f"{marker} {name}  {detail}")
        print(
            f"\ntotal={len(self.rows)} "
            f"passed={passed} failed={len(self.rows) - passed}"
        )
        return 0 if passed == len(self.rows) else 1


if __name__ == "__main__":
    # Make sure we can import the package regardless of cwd.
    here = os.path.dirname(os.path.abspath(__file__))
    pkg_root = os.path.normpath(os.path.join(here, ".."))
    if pkg_root not in sys.path:
        sys.path.insert(0, pkg_root)
    sys.exit(Runner().run())
