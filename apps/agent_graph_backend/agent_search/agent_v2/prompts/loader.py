# Copyright (c) 2024 Oppmon. All rights reserved.
# SPDX-License-Identifier: MIT

"""TAG-72 — Filesystem-backed prompt loader.

This module owns the public ``get_prompt(slug) -> str`` API the rest of
``agent_v2`` will use (TAG-73 onwards) to pull LLM-facing strings out of
the codebase and into reviewable ``.md`` files.

Design contract (locked in by the TAG-70 epic):

  * One file per slug. The slug ``system.web_planner`` lives at
    ``prompts/system/web_planner.md`` — dot becomes path separator.
  * Frontmatter YAML at the top of every file declares ``slug``,
    ``version``, ``status``, ``placeholders`` and optional
    ``notion_page_id`` / ``owner`` / ``updated_at`` for observability.
  * A separate ``_schema.yaml`` enumerates the *required* slugs plus
    smoke-check rules (``min_chars`` / ``max_chars`` / ``must_contain``
    / ``must_not_contain``). The two enumerations must be in 1:1
    correspondence — orphan files and orphan schema entries both
    crash :func:`warm_cache`.
  * Status enum is ``draft`` / ``ready`` / ``active`` / ``deprecated``;
    only ``active`` resolves through :func:`get_prompt`. The others
    raise :class:`PromptInactive` so a half-promoted draft can't slip
    into the request path.
  * ``{placeholder}``-style substitution only — :func:`render_prompt`
    forbids both missing and extra kwargs vs the file's declared
    placeholder list. No Jinja, no logic.

The loader is deliberately *synchronous* and *cached*. The whole prompt
catalog is small (≤ 100 entries), the request path reads it many times
per turn, and there is no operational benefit to async I/O here. After
:func:`warm_cache` the disk is not touched again unless someone calls
:func:`get_prompt.cache_clear` (tests do; production never).
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml


# ---------------------------------------------------------------------------
# Module-level state (resolved once at import).
#
# Tests that need to exercise an alternate prompt catalog monkeypatch these
# three names AND call ``get_prompt.cache_clear()`` so the next call
# re-resolves against the patched paths. See ``tests/prompts/test_loader.py``.
# ---------------------------------------------------------------------------

_ROOT: Path = Path(__file__).parent
"""Root of the production prompt catalog.

Patched by tests; in the running container this resolves to
``agent_search/agent_v2/prompts/`` and never changes.
"""

_SCHEMA: dict[str, Any] = yaml.safe_load((_ROOT / "_schema.yaml").read_text(encoding="utf-8")) or {}
"""Parsed contents of ``_schema.yaml``.

Cached at import. If the schema file is missing or malformed the import
itself fails — that's the desired behaviour for the loader (a bad schema
is a deploy-time bug, not a runtime branch).
"""

_SLUG_TO_SPEC: dict[str, dict[str, Any]] = {
    s["slug"]: s for s in (_SCHEMA.get("slugs") or [])
}
"""Slug → spec lookup. Built once at module import."""


# ---------------------------------------------------------------------------
# Public exception hierarchy.
#
# All loader errors derive from existing built-ins so callers that just
# want to ``except Exception`` keep working, but specific catches stay
# precise. The names are exported from ``__init__.py``.
# ---------------------------------------------------------------------------


class PromptNotFound(KeyError):
    """Raised when the slug is unknown or the file doesn't exist on disk."""


class PromptSchemaError(ValueError):
    """Raised when a prompt fails the ``_schema.yaml`` enforcement check."""


class PromptInactive(RuntimeError):
    """Raised when a prompt exists but its ``status`` is not ``active``.

    Distinct from :class:`PromptNotFound` because the operator-facing
    response is different — an inactive prompt is a deliberately staged
    edit, not a missing file.
    """


# ---------------------------------------------------------------------------
# Prompt record.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Prompt:
    """Parsed prompt with frontmatter metadata.

    ``frozen=True`` so a downstream caller can safely cache the record
    by identity. The dataclass is intentionally narrow — observability
    fields (``notion_page_id`` / ``owner`` / ``updated_at``) are
    forwarded as-is; tag-76 CI is responsible for shape-checking them.
    """

    slug: str
    version: int
    status: str
    body: str
    placeholders: tuple[str, ...]
    notion_page_id: str | None
    owner: str | None
    updated_at: str | None


# ---------------------------------------------------------------------------
# Path / parse helpers.
# ---------------------------------------------------------------------------


def _path_for(slug: str) -> Path:
    """Translate a slug to its ``.md`` path on disk.

    ``"system.web_planner"`` → ``<_ROOT>/system/web_planner.md``.

    The path-segment count therefore equals the dot-segment count, so a
    deeply nested slug like ``tool.web_planner.add_node.description``
    becomes ``tool/web_planner/add_node/description.md`` — fine on every
    platform we target (POSIX + Windows, both fall back to forward
    slashes via :class:`pathlib.Path`).
    """
    rel = slug.replace(".", "/") + ".md"
    return _ROOT / rel


def _parse(path: Path) -> Prompt:
    """Read + frontmatter-parse a single prompt file.

    The frontmatter delimiter is ``---`` on its own line, matching what
    Markdown tooling (Jekyll, Hugo, MkDocs) expects so prompt files are
    previewable in standard editors.
    """
    # ``utf-8-sig`` strips a stray BOM if a Windows editor inserts one;
    # the ticket calls this out as an edge case. On non-BOM files the
    # codec is a no-op.
    text = path.read_text(encoding="utf-8-sig")
    if not text.startswith("---"):
        raise PromptSchemaError(f"{path}: missing frontmatter delimiter")

    parts = text.split("---", 2)
    if len(parts) < 3:
        raise PromptSchemaError(f"{path}: malformed frontmatter (need two '---' delimiters)")

    _, fm_text, body = parts
    try:
        meta = yaml.safe_load(fm_text) or {}
    except yaml.YAMLError as exc:
        raise PromptSchemaError(f"{path}: frontmatter YAML parse error: {exc}") from exc

    if not isinstance(meta, dict):
        raise PromptSchemaError(f"{path}: frontmatter must be a YAML mapping")

    for required in ("slug", "version", "status"):
        if required not in meta:
            raise PromptSchemaError(f"{path}: frontmatter missing required key '{required}'")

    body = body.lstrip("\n")
    if not body:
        raise PromptSchemaError(f"{path}: empty body after frontmatter")

    try:
        version = int(meta["version"])
    except (TypeError, ValueError) as exc:
        raise PromptSchemaError(f"{path}: 'version' must be an integer") from exc

    placeholders = meta.get("placeholders") or []
    if not isinstance(placeholders, list):
        raise PromptSchemaError(f"{path}: 'placeholders' must be a list")

    return Prompt(
        slug=str(meta["slug"]),
        version=version,
        status=str(meta["status"]),
        body=body,
        placeholders=tuple(str(p) for p in placeholders),
        notion_page_id=meta.get("notion_page_id"),
        owner=meta.get("owner"),
        updated_at=meta.get("updated_at"),
    )


def _validate(prompt: Prompt, spec: dict[str, Any]) -> None:
    """Apply ``_schema.yaml`` rules to a parsed prompt.

    Order matters for the test cases — size before substring rules so a
    pathologically short body doesn't masquerade as a banned-substring
    failure.
    """
    if prompt.slug != spec["slug"]:
        # The on-disk frontmatter slug must match the schema slug. This
        # catches a copy-paste mistake where the file body is moved but
        # the frontmatter wasn't updated.
        raise PromptSchemaError(
            f"{prompt.slug}: frontmatter slug does not match schema slug {spec['slug']!r}"
        )

    min_chars = int(spec.get("min_chars", 0))
    if len(prompt.body) < min_chars:
        raise PromptSchemaError(
            f"{prompt.slug}: body too short ({len(prompt.body)} < {min_chars})"
        )

    max_chars = int(spec.get("max_chars", 1_000_000))
    if len(prompt.body) > max_chars:
        raise PromptSchemaError(
            f"{prompt.slug}: body too long ({len(prompt.body)} > {max_chars})"
        )

    for needle in spec.get("must_contain", []) or []:
        if needle not in prompt.body:
            raise PromptSchemaError(f"{prompt.slug}: missing required substring {needle!r}")

    for needle in spec.get("must_not_contain", []) or []:
        if needle in prompt.body:
            raise PromptSchemaError(f"{prompt.slug}: contains banned substring {needle!r}")

    declared = set(prompt.placeholders)
    expected = set(spec.get("placeholders", []) or [])
    if declared != expected:
        raise PromptSchemaError(
            f"{prompt.slug}: placeholder mismatch — frontmatter={sorted(declared)} "
            f"schema={sorted(expected)}"
        )


# ---------------------------------------------------------------------------
# Public API.
# ---------------------------------------------------------------------------


@lru_cache(maxsize=256)
def get_prompt(slug: str) -> str:
    """Return the *body* of an active prompt, fully validated.

    Raises:
        PromptNotFound: slug not in schema, or file missing on disk.
        PromptInactive: slug is in schema but its status is not ``active``.
        PromptSchemaError: file exists but fails schema/frontmatter rules.

    The body string is cached per-slug via :func:`functools.lru_cache`,
    so the AC "no I/O on second access" check passes by patching
    ``Path.read_text`` and asserting zero calls on the warm path.
    """
    if slug not in _SLUG_TO_SPEC:
        raise PromptNotFound(slug)
    path = _path_for(slug)
    if not path.exists():
        raise PromptNotFound(slug)
    prompt = _parse(path)
    if prompt.status != "active":
        raise PromptInactive(f"{slug}: status={prompt.status!r}")
    _validate(prompt, _SLUG_TO_SPEC[slug])
    return prompt.body


@lru_cache(maxsize=256)
def get_prompt_meta(slug: str) -> Prompt:
    """Return the full :class:`Prompt` record (body + frontmatter).

    Used by :func:`render_prompt` (placeholder enforcement) and by future
    observability code that wants to emit ``prompt.version`` /
    ``prompt.updated_at`` on every LLM call. Same caching semantics as
    :func:`get_prompt`.
    """
    if slug not in _SLUG_TO_SPEC:
        raise PromptNotFound(slug)
    path = _path_for(slug)
    if not path.exists():
        raise PromptNotFound(slug)
    prompt = _parse(path)
    if prompt.status != "active":
        raise PromptInactive(f"{slug}: status={prompt.status!r}")
    _validate(prompt, _SLUG_TO_SPEC[slug])
    return prompt


def render_prompt(slug: str, /, **kwargs: object) -> str:
    """Return ``get_prompt(slug).format(**kwargs)`` with strict kwarg checking.

    A missing or extra placeholder raises :class:`PromptSchemaError`
    *before* ``str.format`` runs, so an accidental ``{tenant_id}`` in a
    prompt body can never be silently swallowed by a caller that
    forgot to pass it.

    ``slug`` is positional-only so a stray ``slug="..."`` kwarg can't
    collide with a placeholder named ``slug``.
    """
    meta = get_prompt_meta(slug)
    declared = set(meta.placeholders)
    provided = set(kwargs)
    missing = declared - provided
    extra = provided - declared
    if missing or extra:
        raise PromptSchemaError(
            f"{slug}: placeholder mismatch — missing={sorted(missing)} extra={sorted(extra)}"
        )
    return meta.body.format(**kwargs)


def warm_cache() -> None:
    """Eagerly resolve every schema slug. Crash on the first failure.

    Called from :func:`agent_v2.app.mount_v2` so a malformed prompt file
    takes the container down with a clear traceback instead of failing
    on the first request that happens to hit the broken slug.

    Also checks the *reverse* direction: any ``.md`` file under
    ``_ROOT`` whose slug is NOT in ``_schema.yaml`` is an orphan and
    fails the warmup. This is the "two-way sync" property the TAG-70
    epic locked in.
    """
    # Forward sweep: every schema slug resolves cleanly.
    for slug in _SLUG_TO_SPEC:
        get_prompt(slug)

    # Reverse sweep: every .md file on disk has a schema entry.
    for md_path in _ROOT.rglob("*.md"):
        # ``rel.with_suffix("").parts`` joined with "." reconstructs the
        # slug. e.g. system/web_planner.md → ("system", "web_planner") → "system.web_planner".
        rel = md_path.relative_to(_ROOT)
        slug = ".".join(rel.with_suffix("").parts)
        if slug not in _SLUG_TO_SPEC:
            raise PromptSchemaError(
                f"orphan prompt file {md_path} — slug {slug!r} not in _schema.yaml"
            )


__all__ = [
    "Prompt",
    "PromptInactive",
    "PromptNotFound",
    "PromptSchemaError",
    "get_prompt",
    "get_prompt_meta",
    "render_prompt",
    "warm_cache",
]
