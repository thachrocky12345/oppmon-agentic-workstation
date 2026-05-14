# TAG-72: `prompts/` Directory + Filesystem Loader

## Description

**Suggested Points:** 3
**Type:** Story
**Epic:** [TAG-70](./TAG-70-prompt-storage-notion-epic.md)
**Status:** Open

Build the filesystem layer that TAG-73 will call from the planner. Package
layout, frontmatter parser, schema enforcement, and `get_prompt(slug)`.

## Required Reading

- `docs/prompts/inventory.md` (TAG-71 output).
- `docs/prompts/_schema.yaml` (TAG-71 output).
- TAG-70 epic, "Decisions locked in" — especially #2 (one file per slug),
  #3 (frontmatter contract), #5 (status enum), #6 (one `active` per slug),
  #8 (sync, cached, package-relative).

## Open Questions (raise before coding)

1. Should the `prompts/` directory live INSIDE the Python package
   (`agent_search/agent_v2/prompts/`) or at the repo root (`prompts/`)?
   Inside-package = automatically packaged into the wheel/image. Repo-root =
   easier for non-Python tools (Notion sync) to find. **Recommendation:** inside
   the package; the Notion sync worker addresses the path explicitly.
2. Does any prompt need to be loadable BEFORE config is parsed? (i.e. is
   there a circular import risk?) If yes, loader must not import `..config`.

## Objective

```python
from agent_v2.prompts import get_prompt
body: str = get_prompt("system.rag_planner")
```

with frontmatter stripped, validated, and the file's `status` known to be
`active`. Cached after first read.

## Requirements

### File format

```markdown
---
slug: system.rag_planner
version: 3
status: active                  # draft | ready | active | deprecated
notion_page_id: 1234abcd-...    # nullable for prompts authored in-repo
owner: alice@example.com
updated_at: 2026-04-12T14:32:00Z
placeholders: []                # list of allowed {placeholder} tokens
---

You are a research planner that answers ONLY from the provided document collections.
...
```

### Directory layout

```
agent_search/agent_v2/prompts/
├── __init__.py              # re-exports get_prompt, PromptNotFound, etc.
├── _schema.yaml             # source of truth for required slugs
├── loader.py
├── system/
│   ├── web_planner.md
│   ├── rag_planner.md
│   └── history_summarizer.md
├── tools/
│   └── ...
└── templates/
    └── ...
```

`_schema.yaml` shape:

```yaml
slugs:
  - slug: system.web_planner
    placeholders: []
    min_chars: 200
    max_chars: 8000
    must_contain: ["plan", "tool"]      # smoke checks
    must_not_contain: ["sk-", "csk-", "tvly-"]
  - slug: system.rag_planner
    placeholders: []
    min_chars: 300
    max_chars: 8000
    must_contain: ["citation", "[[doc_id:chunk_id]]"]
    must_not_contain: ["sk-", "csk-", "tvly-"]
  ...
```

### Loader

`agent_v2/prompts/loader.py`:

```python
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any
import yaml

_ROOT = Path(__file__).parent
_SCHEMA = yaml.safe_load((_ROOT / "_schema.yaml").read_text())
_SLUG_TO_SPEC = {s["slug"]: s for s in _SCHEMA["slugs"]}

class PromptNotFound(KeyError): ...
class PromptSchemaError(ValueError): ...
class PromptInactive(RuntimeError): ...

@dataclass(frozen=True)
class Prompt:
    slug: str
    version: int
    body: str
    placeholders: tuple[str, ...]
    notion_page_id: str | None
    owner: str | None
    updated_at: str | None

def _path_for(slug: str) -> Path:
    # "system.rag_planner" -> "system/rag_planner.md"
    rel = slug.replace(".", "/") + ".md"
    return _ROOT / rel

def _parse(path: Path) -> Prompt:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---"):
        raise PromptSchemaError(f"{path}: missing frontmatter")
    _, fm, body = text.split("---", 2)
    meta = yaml.safe_load(fm) or {}
    body = body.lstrip("\n")
    return Prompt(
        slug=meta["slug"],
        version=int(meta["version"]),
        body=body,
        placeholders=tuple(meta.get("placeholders") or []),
        notion_page_id=meta.get("notion_page_id"),
        owner=meta.get("owner"),
        updated_at=meta.get("updated_at"),
    )

def _validate(prompt: Prompt, spec: dict[str, Any]) -> None:
    if len(prompt.body) < spec.get("min_chars", 0):
        raise PromptSchemaError(f"{prompt.slug}: body too short")
    if len(prompt.body) > spec.get("max_chars", 1_000_000):
        raise PromptSchemaError(f"{prompt.slug}: body too long")
    for needle in spec.get("must_contain", []):
        if needle not in prompt.body:
            raise PromptSchemaError(f"{prompt.slug}: missing '{needle}'")
    for needle in spec.get("must_not_contain", []):
        if needle in prompt.body:
            raise PromptSchemaError(f"{prompt.slug}: contains banned '{needle}'")
    if set(prompt.placeholders) != set(spec.get("placeholders", [])):
        raise PromptSchemaError(f"{prompt.slug}: placeholder mismatch")

@lru_cache(maxsize=256)
def get_prompt(slug: str) -> str:
    if slug not in _SLUG_TO_SPEC:
        raise PromptNotFound(slug)
    path = _path_for(slug)
    if not path.exists():
        raise PromptNotFound(slug)
    prompt = _parse(path)
    if prompt.status != "active":
        raise PromptInactive(f"{slug} status={prompt.status}")
    _validate(prompt, _SLUG_TO_SPEC[slug])
    return prompt.body

def get_prompt_meta(slug: str) -> Prompt:
    """Same as get_prompt but returns the full record for observability."""
    ...

def warm_cache() -> None:
    """Call from app startup to fail fast on any malformed prompt."""
    for slug in _SLUG_TO_SPEC:
        get_prompt(slug)        # raises if anything is wrong
```

(Note: the snippet above stores `status` on the `Prompt` dataclass — add the
field; omitted here for brevity.)

### Startup wire-up

`agent_v2/app.py` `mount_v2()`:

```python
from .prompts import warm_cache
warm_cache()                    # crashes the process on any prompt error
```

Container fails to boot if any prompt is malformed. Operators see this in
`docker service ps` immediately.

### Render helper

For prompts with placeholders:

```python
def render_prompt(slug: str, **kwargs) -> str:
    body = get_prompt(slug)
    declared = get_prompt_meta(slug).placeholders
    missing = set(declared) - set(kwargs)
    extra   = set(kwargs) - set(declared)
    if missing or extra:
        raise PromptSchemaError(f"{slug}: placeholders {missing=} {extra=}")
    return body.format(**kwargs)
```

`{placeholder}`-style substitution only; no Jinja, no logic. Templating
intentionally minimal.

## Edge Cases

- **Empty body after frontmatter** → `PromptSchemaError`.
- **File exists but slug not in `_schema.yaml`** → `PromptSchemaError("orphan slug")`
  at warm_cache time. (Two-way sync: every file ⇔ schema.)
- **Slug in `_schema.yaml` but no file** → `PromptNotFound` at warm_cache time.
- **`updated_at` malformed** → tolerated (warn, don't fail) — observability only.
- **`version` regresses** (new file has lower number than git history) →
  not caught by loader; TAG-76 CI handles it.
- **File contains Unicode BOM** → `read_text(encoding="utf-8-sig")` or
  strip explicitly.

## Tests

| File | Test | Assertion |
|---|---|---|
| `tests/prompts/test_loader.py` | happy path returns body | matches |
| `tests/prompts/test_loader.py` | unknown slug → `PromptNotFound` | |
| `tests/prompts/test_loader.py` | inactive slug → `PromptInactive` | |
| `tests/prompts/test_loader.py` | missing required substring → `PromptSchemaError` | |
| `tests/prompts/test_loader.py` | banned substring → `PromptSchemaError` | |
| `tests/prompts/test_loader.py` | placeholder declared but missing in kwargs (`render_prompt`) | error |
| `tests/prompts/test_loader.py` | extra kwargs vs declared placeholders | error |
| `tests/prompts/test_loader.py` | `lru_cache` hit returns same object | identity check |
| `tests/prompts/test_loader.py` | `warm_cache` raises on first broken prompt | |
| `tests/prompts/test_loader.py` | orphan file (in dir, not in schema) | warm_cache raises |

## Acceptance Criteria

- [ ] `get_prompt("system.web_planner")` returns the current planner system
      prompt body, validated against schema.
- [ ] `warm_cache()` is called at `mount_v2()`; broken prompts crash startup.
- [ ] All 10 tests pass.
- [ ] No I/O outside `lru_cache` after warmup (verified by patching `Path.read_text`
      and asserting zero calls on second access).

## Story Points Justification

3 pts: ~150 LOC + tests; frontmatter parsing is straightforward but the
schema-driven validation has enough surface area to deserve coverage.

## Dependencies

**Depends on:** TAG-71.
**Blocks:** TAG-73, TAG-76.

## Risk Factors

| Risk | Mitigation |
|---|---|
| Cache hides a file edit during development | `warm_cache` runs at startup; dev reloader picks up changes. For tests, `get_prompt.cache_clear()` between cases. |
| YAML parser pulls in heavy dep | Use `PyYAML` (already a transitive dep via pydantic-settings). No new top-level dep. |
| Encoding bug on Windows checkout | Force `encoding="utf-8"` everywhere; CI lint forbids `read_text()` without explicit encoding. |
