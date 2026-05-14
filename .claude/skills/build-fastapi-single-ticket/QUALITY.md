# Phase 5 — Quality Gate (FastAPI / Python)

This service has no Sonar. The quality gate is four small, fast checks
run on changed paths only.

## The four checks

| # | Check | Command | Pass criterion |
|---|---|---|---|
| 1 | Unit test pass + coverage | `pytest agent_search/tests/ --cov=agent_search --cov-report=term-missing` | 0 failures, ≥ 80 % on new/changed code |
| 2 | Lint | `ruff check <changed-paths>` | 0 issues on changed paths |
| 3 | Type check (optional but encouraged) | `pyright <changed-paths>` | 0 errors on changed paths |
| 4 | Secret grep | regex below | 0 matches |

Run all four from `apps/agent_graph_backend/`.

## Install the toolchain (one-time per env)

```bash
pip install pytest pytest-asyncio pytest-cov ruff pyright
```

These are not in `requirements-v2.txt` (runtime image stays slim). Add
them to a sibling `requirements-test.txt` if your team prefers a pinned
dev manifest.

## Ruff configuration

Place at `apps/agent_graph_backend/ruff.toml` (or rely on defaults):

```toml
line-length = 100
target-version = "py311"

[lint]
select = [
    "E",   # pycodestyle errors
    "F",   # pyflakes
    "W",   # pycodestyle warnings
    "B",   # flake8-bugbear
    "UP",  # pyupgrade
    "SIM", # flake8-simplify
    "I",   # isort
]
ignore = [
    "E501",  # line length — handled by formatter
]

[lint.per-file-ignores]
"agent_search/tests/**" = ["B018", "F841"]  # tests may have unused exprs

[format]
quote-style = "double"
```

Then:

```bash
ruff check agent_search/agent_v2/<your-paths>/
ruff format --check agent_search/agent_v2/<your-paths>/   # formatting only
```

## Pyright configuration

`apps/agent_graph_backend/pyrightconfig.json`:

```json
{
  "include": ["agent_search"],
  "exclude": ["**/__pycache__", "**/.venv"],
  "pythonVersion": "3.11",
  "typeCheckingMode": "basic",
  "useLibraryCodeForTypes": true,
  "reportMissingImports": "error",
  "reportMissingTypeStubs": "warning",
  "reportPrivateImportUsage": "warning"
}
```

`basic` is forgiving; you can promote to `strict` for new modules. Use
`# pyright: ignore[<rule>]` sparingly with a comment explaining why.

## Secret grep

```bash
# Run from repo root or apps/agent_graph_backend/
PATTERNS='sk-[A-Za-z0-9_-]{20,}|csk-[A-Za-z0-9_-]{20,}|tvly-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|sk-ant-[A-Za-z0-9_-]{30,}|github_pat_[A-Za-z0-9_]{20,}'

grep -rEn "$PATTERNS" agent_search/ scripts/ docs/jira/ \
  --include="*.py" --include="*.md" --include="*.yaml" --include="*.yml" \
  && { echo "SECRETS FOUND — abort"; exit 1; } || echo "no secrets"
```

If a regex false-positives on documentation showing an example shape
(e.g. `sk-ant-xxxxxxxxxx...`), prefer to mask the example (`sk-ant-<redacted>`)
rather than weakening the regex.

## Common ruff issues and fixes

| Code | Meaning | Fix |
|---|---|---|
| F401 | Unused import | Remove it. If re-export is intentional, add `__all__`. |
| F811 | Redefinition | Rename or merge. |
| B008 | Function call as default arg | Use `field(default_factory=...)` or `None` + check. |
| UP007 | Use `X \| Y` not `Union[X, Y]` | Update typing. |
| SIM108 | Use ternary | `x = a if cond else b`. |
| I001 | Import order | `ruff check --fix` auto-sorts. |
| E712 | `== True`/`== False` | Use `is True`/`is False` or just `if x:`. |

## Common pyright issues

| Pattern | Fix |
|---|---|
| `reportUnknownMemberType` on third-party | Add stubs, or cast: `cast(SomeType, value)`. |
| `reportPossiblyUnboundVariable` | Initialize before the branch: `x: int = 0`. |
| `reportGeneralTypeIssues` on async fixture | Annotate return as `AsyncIterator[X]` with `yield`. |
| `reportPrivateUsage` on test-private access | Mark test file in pyright `executionEnvironments` or `# pyright: ignore`. |

## What to NOT touch

- **Existing violations in files you didn't change.** File a follow-up
  ticket. Each ticket cleans only its own code.
- **`# noqa` to silence ruff.** Refactor instead. The only acceptable
  `# noqa` is `# noqa: BLE001` on top-level integration-script error
  reporters that intentionally catch broad `Exception`.
- **`# type: ignore` without a reason.** Always use `# pyright: ignore[<rule>]`
  with a comment explaining the third-party limitation.

## Quality gate output for the test plan

Capture this block and paste into Phase 6:

```
$ ruff check agent_search/agent_v2/<paths>/
All checks passed!

$ pyright agent_search/agent_v2/<paths>/
0 errors, 2 warnings, 0 informations

$ pytest agent_search/tests/ --cov=agent_search --cov-report=term-missing
======================== N passed in M.MMs =========================
TOTAL                                 X      Y    Z%

$ secret grep: no secrets
```
