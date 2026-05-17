# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-72 — Filesystem prompt-loader unit tests.

Covers the 10 cases mandated by the ticket plus the AC4 "no I/O after
warmup" check. Tests work by pointing the loader at a per-test temp
directory built with the same shape as the production catalog. The
production ``_schema.yaml`` and ``system/web_planner.md`` are NEVER
touched — production prompts are exercised end-to-end in
``scripts/TAG_72_integration.py``.

Patching contract:
  * ``loader._ROOT`` → tmp_path
  * ``loader._SCHEMA`` → parsed test schema dict
  * ``loader._SLUG_TO_SPEC`` → derived lookup
  * ``loader.get_prompt.cache_clear()`` between cases
  * ``loader.get_prompt_meta.cache_clear()`` between cases
"""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
import yaml

from agent_search.agent_v2.prompts import loader as loader_mod
from agent_search.agent_v2.prompts import (
    PromptInactive,
    PromptNotFound,
    PromptSchemaError,
    get_prompt,
    get_prompt_meta,
    render_prompt,
    warm_cache,
)


# ---------------------------------------------------------------------------
# Fixture: a hermetic prompt catalog under tmp_path.
# ---------------------------------------------------------------------------


def _write_prompt(
    root: Path,
    *,
    slug: str,
    body: str,
    status: str = "active",
    version: int = 1,
    placeholders: list[str] | None = None,
) -> Path:
    """Materialise one prompt .md file under ``root`` for the given slug.

    Mirrors the slug→path algorithm in ``_path_for`` so a test can
    assert the loader resolves the exact file it wrote.
    """
    rel = Path(*slug.split(".")).with_suffix(".md")
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    frontmatter = {
        "slug": slug,
        "version": version,
        "status": status,
        "placeholders": placeholders or [],
    }
    text = "---\n" + yaml.safe_dump(frontmatter) + "---\n" + body
    path.write_text(text, encoding="utf-8")
    return path


@pytest.fixture
def patched_loader(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Point the loader at an empty tmp catalog. Tests fill it in.

    Returns a small helper namespace so tests can write prompts +
    install the schema without re-patching the module each time.
    """
    schema: dict[str, Any] = {"slugs": []}

    def install_schema(spec_list: list[dict[str, Any]]) -> None:
        nonlocal schema
        schema = {"slugs": spec_list}
        monkeypatch.setattr(loader_mod, "_SCHEMA", schema)
        monkeypatch.setattr(
            loader_mod,
            "_SLUG_TO_SPEC",
            {s["slug"]: s for s in spec_list},
        )

    monkeypatch.setattr(loader_mod, "_ROOT", tmp_path)
    install_schema([])
    # Clear both caches before AND after to insulate from sibling tests
    # whose module state may leak via the lru_cache wrappers.
    loader_mod.get_prompt.cache_clear()
    loader_mod.get_prompt_meta.cache_clear()

    yield SimpleNamespace(
        root=tmp_path,
        write_prompt=lambda **kw: _write_prompt(tmp_path, **kw),
        install_schema=install_schema,
    )

    loader_mod.get_prompt.cache_clear()
    loader_mod.get_prompt_meta.cache_clear()


# ---------------------------------------------------------------------------
# 1. Happy path
# ---------------------------------------------------------------------------


def test_get_prompt_returns_body(patched_loader) -> None:
    patched_loader.install_schema([
        {
            "slug": "system.demo",
            "placeholders": [],
            "min_chars": 5,
            "max_chars": 100,
            "must_contain": ["hello"],
            "must_not_contain": ["sk-"],
        }
    ])
    patched_loader.write_prompt(slug="system.demo", body="hello world\n")

    body = get_prompt("system.demo")
    assert body == "hello world\n"


# ---------------------------------------------------------------------------
# 2. Unknown slug
# ---------------------------------------------------------------------------


def test_unknown_slug_raises(patched_loader) -> None:
    with pytest.raises(PromptNotFound):
        get_prompt("system.does_not_exist")


# ---------------------------------------------------------------------------
# 3. Inactive status
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("status", ["draft", "ready", "deprecated"])
def test_inactive_status_raises(patched_loader, status: str) -> None:
    patched_loader.install_schema([
        {
            "slug": "system.staged",
            "placeholders": [],
            "min_chars": 1,
            "max_chars": 100,
        }
    ])
    patched_loader.write_prompt(slug="system.staged", body="anything", status=status)

    with pytest.raises(PromptInactive) as excinfo:
        get_prompt("system.staged")
    assert status in str(excinfo.value)


# ---------------------------------------------------------------------------
# 4. Missing required substring
# ---------------------------------------------------------------------------


def test_missing_must_contain_raises(patched_loader) -> None:
    patched_loader.install_schema([
        {
            "slug": "system.demo",
            "placeholders": [],
            "min_chars": 1,
            "max_chars": 100,
            "must_contain": ["plan"],
        }
    ])
    patched_loader.write_prompt(slug="system.demo", body="no required word here")

    with pytest.raises(PromptSchemaError) as excinfo:
        get_prompt("system.demo")
    assert "plan" in str(excinfo.value)


# ---------------------------------------------------------------------------
# 5. Banned substring
# ---------------------------------------------------------------------------


def test_must_not_contain_raises(patched_loader) -> None:
    patched_loader.install_schema([
        {
            "slug": "system.demo",
            "placeholders": [],
            "min_chars": 1,
            "max_chars": 100,
            "must_not_contain": ["sk-"],
        }
    ])
    patched_loader.write_prompt(
        slug="system.demo", body="this body contains sk-leaked-key by mistake"
    )

    with pytest.raises(PromptSchemaError) as excinfo:
        get_prompt("system.demo")
    assert "sk-" in str(excinfo.value)


# ---------------------------------------------------------------------------
# 6. render_prompt — missing kwarg
# ---------------------------------------------------------------------------


def test_render_prompt_missing_kwarg_raises(patched_loader) -> None:
    patched_loader.install_schema([
        {
            "slug": "template.greet",
            "placeholders": ["name"],
            "min_chars": 1,
            "max_chars": 100,
        }
    ])
    patched_loader.write_prompt(
        slug="template.greet", body="hello {name}", placeholders=["name"]
    )

    with pytest.raises(PromptSchemaError) as excinfo:
        render_prompt("template.greet")
    assert "name" in str(excinfo.value)


# ---------------------------------------------------------------------------
# 7. render_prompt — extra kwarg
# ---------------------------------------------------------------------------


def test_render_prompt_extra_kwarg_raises(patched_loader) -> None:
    patched_loader.install_schema([
        {
            "slug": "template.greet",
            "placeholders": ["name"],
            "min_chars": 1,
            "max_chars": 100,
        }
    ])
    patched_loader.write_prompt(
        slug="template.greet", body="hello {name}", placeholders=["name"]
    )

    with pytest.raises(PromptSchemaError) as excinfo:
        render_prompt("template.greet", name="alice", surprise="boo")
    assert "surprise" in str(excinfo.value)


def test_render_prompt_happy_path(patched_loader) -> None:
    """Companion to the missing/extra cases — proves the success path."""
    patched_loader.install_schema([
        {
            "slug": "template.greet",
            "placeholders": ["name"],
            "min_chars": 1,
            "max_chars": 100,
        }
    ])
    patched_loader.write_prompt(
        slug="template.greet", body="hello {name}", placeholders=["name"]
    )

    out = render_prompt("template.greet", name="alice")
    assert out == "hello alice"


# ---------------------------------------------------------------------------
# 8. lru_cache identity
# ---------------------------------------------------------------------------


def test_cache_returns_same_string_object(patched_loader) -> None:
    patched_loader.install_schema([
        {
            "slug": "system.demo",
            "placeholders": [],
            "min_chars": 1,
            "max_chars": 100,
        }
    ])
    patched_loader.write_prompt(slug="system.demo", body="cached body")

    a = get_prompt("system.demo")
    b = get_prompt("system.demo")
    # ``lru_cache`` returns the same Python string object on a hit, so an
    # ``is`` check is the cheapest proof the cache is wired.
    assert a is b


def test_no_io_on_second_access(patched_loader, monkeypatch: pytest.MonkeyPatch) -> None:
    """AC4: zero ``Path.read_text`` calls on the warm path."""
    patched_loader.install_schema([
        {
            "slug": "system.demo",
            "placeholders": [],
            "min_chars": 1,
            "max_chars": 100,
        }
    ])
    patched_loader.write_prompt(slug="system.demo", body="cached body")

    # Prime the cache; from here on read_text must never be called.
    get_prompt("system.demo")

    call_count = 0
    real_read_text = Path.read_text

    def counting_read_text(self: Path, *args, **kwargs):
        nonlocal call_count
        call_count += 1
        return real_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", counting_read_text)

    for _ in range(5):
        get_prompt("system.demo")
    assert call_count == 0


# ---------------------------------------------------------------------------
# 9. warm_cache raises on first broken prompt
# ---------------------------------------------------------------------------


def test_warm_cache_raises_on_broken_prompt(patched_loader) -> None:
    patched_loader.install_schema([
        {
            "slug": "system.good",
            "placeholders": [],
            "min_chars": 1,
            "max_chars": 100,
        },
        {
            "slug": "system.bad",
            "placeholders": [],
            "min_chars": 1,
            "max_chars": 100,
            "must_contain": ["NEVER_PRESENT_TOKEN"],
        },
    ])
    patched_loader.write_prompt(slug="system.good", body="ok body")
    patched_loader.write_prompt(slug="system.bad", body="also missing the token")

    with pytest.raises(PromptSchemaError) as excinfo:
        warm_cache()
    assert "system.bad" in str(excinfo.value)


# ---------------------------------------------------------------------------
# 10. Orphan file → warm_cache raises
# ---------------------------------------------------------------------------


def test_warm_cache_rejects_orphan_file(patched_loader) -> None:
    patched_loader.install_schema([
        {
            "slug": "system.known",
            "placeholders": [],
            "min_chars": 1,
            "max_chars": 100,
        }
    ])
    patched_loader.write_prompt(slug="system.known", body="ok")
    # Drop an extra file whose slug is NOT in the schema.
    patched_loader.write_prompt(slug="system.stranger", body="ok")

    with pytest.raises(PromptSchemaError) as excinfo:
        warm_cache()
    assert "system.stranger" in str(excinfo.value)
    assert "orphan" in str(excinfo.value).lower()


# ---------------------------------------------------------------------------
# Extras — guard the production catalog itself stays loadable.
# ---------------------------------------------------------------------------


def test_production_catalog_warms_cleanly() -> None:
    """The shipped _schema.yaml + .md files must always warm without errors.

    Runs against the REAL module-level state (no patching). If this
    fails, a real merge has broken the prompt catalog and the container
    will refuse to boot.
    """
    loader_mod.get_prompt.cache_clear()
    loader_mod.get_prompt_meta.cache_clear()
    warm_cache()  # must not raise


def test_get_prompt_meta_returns_dataclass(patched_loader) -> None:
    patched_loader.install_schema([
        {
            "slug": "system.demo",
            "placeholders": [],
            "min_chars": 1,
            "max_chars": 100,
        }
    ])
    patched_loader.write_prompt(slug="system.demo", body="hello", version=7)

    meta = get_prompt_meta("system.demo")
    assert meta.slug == "system.demo"
    assert meta.version == 7
    assert meta.status == "active"
    assert meta.body == "hello"
    assert meta.placeholders == ()
