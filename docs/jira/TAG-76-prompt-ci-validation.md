# TAG-76: CI Validation for Prompts

## Description

**Suggested Points:** 3
**Type:** Story / QA
**Epic:** [TAG-70](./TAG-70-prompt-storage-notion-epic.md)
**Status:** Open

The merge gate. Every PR that touches `prompts/` (whether from a human or
TAG-75's sync worker) runs this validation suite. Without it, a typo in a
prompt can take the planner down on next deploy.

## Required Reading

- TAG-72 loader (`warm_cache` is the kernel of this validation).
- TAG-71 inventory + `_schema.yaml`.
- TAG-75 sync worker — understand what shape PRs arrive in.
- Existing CI patterns in `.github/workflows/`.

## Open Questions (raise before coding)

1. Should the smoke test run against a real LLM (Anthropic + Cerebras free tier)
   or only the `FakeLLMClient`? Real LLM gives the strongest signal that the
   prompt actually elicits a tool call; fake LLM is free and deterministic.
   **Default:** fake LLM in PR CI, real LLM in a nightly gate.
2. Is there an existing `secrets-scan` workflow we should add to the prompt
   files' scope, or is a custom regex in this ticket the only check?

## Objective

A workflow `.github/workflows/prompt-validation.yml` that triggers on every
PR touching `prompts/**` or `agent_v2/prompts/**`, with the four checks below
all required-green before merge.

## Requirements

### Checks

| # | Check | What it does |
|---|---|---|
| 1 | **Schema conformance** | Run TAG-72's `warm_cache()`. Crash = fail. |
| 2 | **One-active-per-slug** | For every slug, count files with `status: active`. != 1 = fail. |
| 3 | **Secrets grep** | Regex over `prompts/**` for `sk-[A-Za-z0-9]{20,}`, `csk-[A-Za-z0-9]{20,}`, `tvly-[A-Za-z0-9]{20,}`, AWS-style `AKIA[0-9A-Z]{16}`, and a generic high-entropy detector (Shannon entropy > 4.5 on lines ≥ 32 chars). |
| 4 | **Smoke planner turn** | Build a `PlannerAgent` with the new prompts + `FakeLLMClient`. Run one fake turn and assert a tool call comes back in the expected shape. |
| 5 | **Version monotonicity** | Compare PR's `version` against `main`'s. New file: any version OK. Existing file: PR version > main version OR identical content. |
| 6 | **Slug ↔ schema sync** | Every `.md` file under `prompts/` (except `_*`) appears in `_schema.yaml`, and vice versa. |
| 7 | **No inline prompts** | The agent-code grep from TAG-73 — re-run here to catch regressions. |

### Workflow

```yaml
name: prompt-validation
on:
  pull_request:
    paths:
      - "apps/agent_graph_backend/agent_search/agent_v2/prompts/**"
      - "prompts/**"
      - "docs/prompts/_schema.yaml"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 2 }            # need main for version diff
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r apps/agent_graph_backend/requirements-v2.txt
      - run: python scripts/validate_prompts.py
```

### Script

`scripts/validate_prompts.py`:

```python
def main() -> int:
    failures: list[str] = []
    failures += check_schema_conformance()        # 1
    failures += check_one_active_per_slug()       # 2
    failures += check_no_secrets()                # 3
    failures += smoke_planner_turn()              # 4
    failures += check_version_monotonic()         # 5
    failures += check_slug_schema_sync()          # 6
    failures += check_no_inline_prompts_in_code() # 7
    if failures:
        for f in failures: print(f"FAIL: {f}")
        return 1
    print("all prompt checks passed")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

Each `check_*` function returns `list[str]` of failure messages (empty = pass).
No exceptions swallowed; unexpected errors crash with traceback.

### Secret regex details

```python
SECRET_PATTERNS = [
    (re.compile(r"sk-[A-Za-z0-9_-]{20,}"),     "OpenAI key"),
    (re.compile(r"csk-[A-Za-z0-9_-]{20,}"),    "Cerebras key"),
    (re.compile(r"tvly-[A-Za-z0-9_-]{20,}"),   "Tavily key"),
    (re.compile(r"AKIA[0-9A-Z]{16}"),          "AWS access key"),
    (re.compile(r"sk-ant-[A-Za-z0-9_-]{30,}"), "Anthropic key"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{20,}"), "GitHub PAT"),
]

def check_no_secrets():
    failures = []
    for path in Path("prompts").rglob("*.md"):
        text = path.read_text(encoding="utf-8")
        for pattern, label in SECRET_PATTERNS:
            for m in pattern.finditer(text):
                failures.append(f"{path}: {label} match: '{m.group()[:10]}...'")
        # entropy
        for line in text.splitlines():
            if len(line) >= 32 and shannon_entropy(line) > 4.5:
                failures.append(f"{path}: high-entropy line: '{line[:20]}...'")
    return failures
```

### Smoke planner turn

```python
def smoke_planner_turn():
    # Build PlannerAgent with FakeLLMClient that always returns a tool_call.
    # Verify the planner consumes get_prompt("system.web_planner") without error
    # and dispatches the tool_call.
    ...
```

Goal: catch "prompt body has a `{token}` that breaks `.format()`" before deploy.

### Version monotonicity rule

```
For each changed file F in PR:
    if F is new on this PR:
        require frontmatter `version >= 1`
    else:
        main_version = parse_version(git show main:F)
        pr_version   = parse_version(F)
        require pr_version >= main_version
        if content_differs and pr_version == main_version:
            fail "version not bumped"
```

### Required check

Make this workflow a required status check on the `main` branch in repo
settings. Without that, the gate is advisory.

## Edge Cases

- A PR that ONLY changes `_schema.yaml` (adds a new slug) — checks 1, 2, 6 may
  fail because the file doesn't exist yet. Allow this by treating slug add +
  file add as one atomic PR (both must arrive together; TAG-75 ensures they do).
- A PR that removes a slug — `_schema.yaml` and the `.md` file both gone in
  one PR; cross-references in code (TAG-73 sites) must also be updated.
  Currently we have no static analyzer for slug references in Python — `rg`
  for the slug string is a soft check (mention in PR template).
- Generic high-entropy detector false-positive on a legitimate cryptographic
  example in a prompt (rare). Allow an inline `<!-- noqa-secrets -->` marker
  to suppress; lines marked are excluded from the secrets check.
- Smoke planner turn requires network if the loader pulls from `_schema.yaml`
  files — none does, so the smoke should be hermetic.

## Tests

| File | Test | Assertion |
|---|---|---|
| `scripts/tests/test_validate_prompts.py` | golden-good fixture passes | exit 0 |
| `scripts/tests/test_validate_prompts.py` | malformed frontmatter fails | exit 1 |
| `scripts/tests/test_validate_prompts.py` | two-actives fails | |
| `scripts/tests/test_validate_prompts.py` | OpenAI key in body fails | |
| `scripts/tests/test_validate_prompts.py` | version regression fails | |
| `scripts/tests/test_validate_prompts.py` | orphan slug fails | |
| `scripts/tests/test_validate_prompts.py` | schema/file sync mismatch fails | |
| `scripts/tests/test_validate_prompts.py` | high-entropy line fails | |
| `scripts/tests/test_validate_prompts.py` | noqa-secrets marker suppresses | |
| `scripts/tests/test_validate_prompts.py` | smoke planner turn passes on valid prompts | |

## Acceptance Criteria

- [ ] Workflow runs on every relevant PR.
- [ ] Required status check on `main`.
- [ ] All 10 tests pass.
- [ ] Day-zero seed passes the workflow (no false fails).
- [ ] An intentional bad prompt PR (manual test) is correctly blocked.

## Story Points Justification

3 pts: seven distinct checks + tests for each + workflow wiring. Each check
is small; aggregate is real.

## Dependencies

**Depends on:** TAG-72, TAG-73 (for the no-inline check).
**Blocks:** none directly, but practically gates TAG-75's first end-to-end test.

## Risk Factors

| Risk | Mitigation |
|---|---|
| False positive on entropy detector blocks legit edits | `<!-- noqa-secrets -->` escape hatch; reviewed line-by-line. |
| Smoke planner turn flaky (e.g. depends on `FakeLLMClient` impl detail) | Use a fully scripted fake that returns a fixed tool_call; no randomness. |
| Required-check bypass via admin merge | Branch protection explicitly disallows admin override; documented in CONTRIBUTING. |
| Validation runtime > 5 min | Each check is <30s on the current corpus; budget headroom. |
