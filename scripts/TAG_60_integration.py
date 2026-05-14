#!/usr/bin/env python
"""TAG-60 — ``EmbeddingProvider`` integration smoke.

Exercises the provider seam in-process: no DB, no server. Two
case-classes:

  * **Offline (always run)** — fake provider determinism + dim,
    factory wiring, dim-mismatch guardrail, missing-key guardrail.
    Proves the wire shape works without network.
  * **Live OpenAI (opt-in)** — actually round-trip against OpenAI's
    embeddings endpoint with the operator's pool key. Skipped when
    ``OPENAI_EMBED_API_KEY`` (or ``OPENAI_API_KEY``) is unset, so a
    dev with no key gets a green run.

The live cases are the only honest way to prove the dim defaults match
the live API contract — apps/api was confirmed at
``text-embedding-3-small`` / 1536-d but a vendor change could drift.

Usage:
    cd apps/agent_graph_backend
    python ../../scripts/TAG_60_integration.py

To run live cases:
    set OPENAI_API_KEY=sk-...                # Windows
    export OPENAI_API_KEY=sk-...             # POSIX
    python ../../scripts/TAG_60_integration.py
"""

from __future__ import annotations

import asyncio
import os
import sys

sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "apps", "agent_graph_backend")
    ),
)

from agent_search.agent_v2 import config as config_mod  # noqa: E402
from agent_search.agent_v2.rag.embedding import (  # noqa: E402
    EmbeddingProvider,
    FakeEmbeddingProvider,
    OpenAIEmbeddingProvider,
    create_embedding_provider,
)


def _has_live_key() -> bool:
    return bool(
        os.environ.get("OPENAI_API_KEY")
        or os.environ.get("OPENAI_EMBED_API_KEY")
    )


class Runner:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    def _add(self, name: str, ok: bool, detail: str) -> None:
        self.rows.append((name, bool(ok), detail))

    # ---- offline cases ----

    def tc01_protocol_satisfied(self) -> None:
        f = FakeEmbeddingProvider(dim=8)
        o_attrs = hasattr(OpenAIEmbeddingProvider, "embed_query")
        # ``EmbeddingProvider`` is a runtime_checkable Protocol so
        # isinstance works on the fake.
        is_proto = isinstance(f, EmbeddingProvider)
        self._add(
            "TC-01 Protocol satisfied",
            is_proto and o_attrs,
            f"fake_isinstance={is_proto} openai_has_embed={o_attrs}",
        )

    def tc02_fake_determinism(self) -> None:
        async def _run() -> tuple[list[float], list[float]]:
            p = FakeEmbeddingProvider(dim=16)
            v1 = await p.embed_query("the quick brown fox")
            v2 = await p.embed_query("the quick brown fox")
            return v1, v2

        v1, v2 = asyncio.run(_run())
        self._add(
            "TC-02 fake deterministic",
            v1 == v2 and len(v1) == 16,
            f"len={len(v1)} equal={v1 == v2}",
        )

    def tc03_factory_returns_fake(self) -> None:
        original_provider = config_mod.settings.embedding_provider
        original_dim = config_mod.settings.embedding_dim
        try:
            config_mod.settings.embedding_provider = "fake"  # type: ignore[assignment]
            config_mod.settings.embedding_dim = 1536
            p = create_embedding_provider()
            ok = isinstance(p, FakeEmbeddingProvider) and p.dim == 16
            self._add(
                "TC-03 factory -> fake (1536 clamped to 16)",
                ok,
                f"type={type(p).__name__} dim={p.dim}",
            )
        finally:
            config_mod.settings.embedding_provider = original_provider  # type: ignore[assignment]
            config_mod.settings.embedding_dim = original_dim

    def tc04_empty_key_raises(self) -> None:
        try:
            OpenAIEmbeddingProvider(
                api_key="",
                model="text-embedding-3-small",
                dim=1536,
            )
            self._add("TC-04 empty key raises", False, "no exception")
        except RuntimeError as exc:
            self._add(
                "TC-04 empty key raises",
                "api_key required" in str(exc),
                str(exc)[:120],
            )

    def tc05_fake_dim_too_large(self) -> None:
        try:
            FakeEmbeddingProvider(dim=64)
            self._add("TC-05 fake dim>32 raises", False, "no exception")
        except RuntimeError as exc:
            self._add(
                "TC-05 fake dim>32 raises",
                "dim must be 1..32" in str(exc),
                str(exc)[:120],
            )

    # ---- live cases (skipped without key) ----

    def tc06_live_openai_returns_expected_dim(self) -> None:
        if not _has_live_key():
            self._add(
                "TC-06 live openai returns 1536-d vector",
                True,
                "skipped (no OPENAI_API_KEY)",
            )
            return

        async def _run() -> tuple[bool, int, str]:
            p = OpenAIEmbeddingProvider(
                api_key=(
                    os.environ.get("OPENAI_EMBED_API_KEY")
                    or os.environ["OPENAI_API_KEY"]
                ),
                model="text-embedding-3-small",
                dim=1536,
            )
            vec = await p.embed_query("hello world")
            return len(vec) == 1536, len(vec), f"first3={vec[:3]}"

        ok, n, detail = asyncio.run(_run())
        self._add("TC-06 live openai returns 1536-d vector", ok, f"dim={n} {detail}")

    def tc07_live_dim_mismatch_guard(self) -> None:
        """Construct with a deliberately wrong ``dim`` (3072) but request
        the 1536-d model — must raise the dim-mismatch guard."""
        if not _has_live_key():
            self._add(
                "TC-07 live dim mismatch guard",
                True,
                "skipped (no OPENAI_API_KEY)",
            )
            return

        async def _run() -> tuple[bool, str]:
            p = OpenAIEmbeddingProvider(
                api_key=(
                    os.environ.get("OPENAI_EMBED_API_KEY")
                    or os.environ["OPENAI_API_KEY"]
                ),
                model="text-embedding-3-small",
                dim=3072,  # wrong on purpose
            )
            try:
                await p.embed_query("trigger mismatch")
            except RuntimeError as exc:
                return "embedding dim mismatch" in str(exc), str(exc)[:120]
            return False, "no exception"

        ok, detail = asyncio.run(_run())
        self._add("TC-07 live dim mismatch guard", ok, detail)

    # ---- driver ----

    def run(self) -> int:
        names = [m for m in dir(self) if m.startswith("tc")]
        for name in sorted(names):
            try:
                getattr(self, name)()
            except Exception as exc:  # noqa: BLE001
                self._add(name, False, f"crash: {type(exc).__name__}: {exc}")
        passed = sum(1 for _, ok, _ in self.rows if ok)
        for name, ok, detail in self.rows:
            tag = "[PASS]" if ok else "[FAIL]"
            print(f"{tag} {name} | {detail}")
        failed = len(self.rows) - passed
        print(f"\ntotal={len(self.rows)} passed={passed} failed={failed}")
        return 0 if passed == len(self.rows) else 1


if __name__ == "__main__":
    sys.exit(Runner().run())
