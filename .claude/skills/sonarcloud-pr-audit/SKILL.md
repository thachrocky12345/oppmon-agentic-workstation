---
name: sonarcloud-pr-audit
description: Pull SonarCloud quality gate results and issues for a PR, evaluate every issue, and fix all fixable ones. Use when asked to "check sonar", "sonar results", "fix sonar issues", "PR quality gate", or automatically after any git push to a PR branch.
argument-hint: [repo] [pr-number] [--fix | --eval-only]
---

# SonarCloud PR Audit — Scan → Eval → Fix

## MANDATORY: Auto-Run After Every Push

After any `git push` to a branch with an open PR, run this skill **automatically** without being asked:

1. Fetch quality gate + all issues
2. Evaluate every issue (severity, type, file:line, rule)
3. Fix all BLOCKER and CRITICAL issues immediately
4. Fix MAJOR issues unless they require architectural decisions
5. Report results to the user

Do NOT wait for the user to ask. This is non-negotiable.

---

## Step 1 — Parse Arguments

```
/sonarcloud-pr-audit [repo] [pr-number] [--fix | --eval-only]
```

| Argument | Values | Default |
|---|---|---|
| `repo` | `be`, `backend`, `Lumy-Backend` → backend · `fe`, `frontend`, `RG-Frontend` → frontend | Infer from current git branch/dir |
| `pr-number` | Integer PR number | Infer from `gh pr view --json number` |
| `--fix` | Fix all fixable issues and push | Default behavior |
| `--eval-only` | Report issues, do not write any code | Only when user explicitly requests |

**Infer repo from CWD:**
- CWD contains `Lumy-Backend` → backend
- CWD contains `RG-Frontend` → frontend

**Infer PR from current branch:**
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr view --json number --jq '.number'
```

---

## Step 2 — Acquire SONAR_TOKEN

Try each method in order, stop at first success:

### Method A: Environment variable
```bash
echo "${#SONAR_TOKEN} chars"
```
If length > 0 → use it.

### Method B: Read from PR comment (no token needed)
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh api repos/reallyhq/{REPO}/issues/{PR}/comments \
  --jq '.[] | select(.user.login | test("sonar"; "i")) | .body'
```
Parse the quality gate pass/fail badge and issue counts from the comment markdown.
This gives: gate status, new issue count, hotspot count, coverage %, duplication %.
**It does NOT give file:line detail** — skip to Step 4 with summary-only data.

### Method C: Wait for SonarCloud analysis (if not yet posted)
```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"
gh pr checks {PR} -R reallyhq/{REPO}
```
If SonarCloud check shows `pending` → wait 30 seconds and retry (max 5 retries = 2.5 min).
If it shows `pass` or `fail` → proceed to Method B to read the comment.

### Method D: Static audit from changed files
If all above fail: read every changed file in the PR and apply the rule tables in Step 6
to identify likely issues. Clearly label this section **"Static audit (no SonarCloud data)"**.

---

## Step 3 — Fetch Quality Gate Status (requires SONAR_TOKEN)

```bash
MSYS_NO_PATHCONV=1 curl -sSf \
  -H "Authorization: Bearer ${SONAR_TOKEN}" \
  "https://sonarcloud.io/api/qualitygates/project_status?projectKey=${PROJECT_KEY}&pullRequest=${PR}" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
s = d['projectStatus']
print('Gate:', s['status'])
for c in s.get('conditions', []):
    print(f'  {c[\"status\"]:6} {c[\"metricKey\"]:40} actual={c.get(\"actualValue\",\"?\")} threshold={c.get(\"errorThreshold\",\"?\")}')
"
```

**Ratings map:** 1=A 2=B 3=C 4=D 5=E

---

## Step 4 — Fetch All Issues (requires SONAR_TOKEN)

```bash
MSYS_NO_PATHCONV=1 curl -sSf \
  -H "Authorization: Bearer ${SONAR_TOKEN}" \
  "https://sonarcloud.io/api/issues/search?componentKeys=${PROJECT_KEY}&pullRequest=${PR}&resolved=false&ps=500&p=1&s=SEVERITY&asc=false" \
  -o /tmp/sonar-issues.json

python3 -c "
import json
with open('/tmp/sonar-issues.json') as f:
    data = json.load(f)
issues = data.get('issues', [])
print(f'Total: {data[\"total\"]}')
for i in issues:
    file = i['component'].split('/')[-1]
    print(f'  [{i[\"severity\"]:8}] [{i[\"type\"]:20}] {file}:{i.get(\"line\",\"?\")} — {i[\"rule\"]} — {i[\"message\"][:80]}')
"
```

If `total > 500`, paginate: fetch `&p=2`, `&p=3`, etc. until all collected.

---

## Step 5 — Evaluate Issues

Classify every issue:

| Severity | Action |
|---|---|
| BLOCKER | Fix immediately — do not ship |
| CRITICAL | Fix immediately — do not ship |
| MAJOR | Fix unless architectural (flag if so) |
| MINOR | Fix if trivial (one-liner); log otherwise |
| INFO | Log only; do not fix |

Classify by type:
- **BUG** — broken logic; fix always
- **VULNERABILITY** — security hole; fix always
- **SECURITY_HOTSPOT** — review and either fix or mark safe with comment
- **CODE_SMELL** — fix if BLOCKER/CRITICAL/MAJOR; use judgment for MINOR

Build this summary table before fixing:

```
| Severity | Type | File | Line | Rule | Message | Action |
|---|---|---|---|---|---|---|
| BLOCKER | BUG | views.py | 42 | python:S1481 | unused var | FIX |
| MAJOR | CODE_SMELL | serializers.py | 17 | python:S1192 | literal ×4 | FIX |
| MINOR | CODE_SMELL | utils.py | 88 | python:S125 | commented code | SKIP |
```

---

## Step 6 — Fix Issues

For each issue marked FIX:

1. Read the file at the reported line (±10 lines for context)
2. Look up the rule in the tables below
3. Apply the minimal correct fix
4. Do NOT refactor surrounding code

After fixing ALL issues in a file, move to the next file. Batch by file to minimize re-reads.

Commit all fixes in a single commit:
```bash
git add <changed files>
git commit -m "fix(sonar): resolve BLOCKER/CRITICAL/MAJOR issues on PR #{PR}

Rules fixed: {comma-separated rule IDs}
"
```

Then push:
```bash
git push
```

---

## Step 7 — Report

After fixing (or if `--eval-only`):

```
## SonarCloud Audit — PR #{PR} ({REPO})

**Quality Gate:** ✅ PASSED / ❌ FAILED

### Issues Found
| Severity | Count |
|---|---|
| 🔴 BLOCKER | N |
| 🟠 CRITICAL | N |
| 🟡 MAJOR | N |
| 🔵 MINOR | N |
| ⚪ INFO | N |

**Security Hotspots:** N
**Coverage:** N%
**Duplication:** N%

### Actions Taken
- Fixed N issues (list rules: S1192, S1481, ...)
- Skipped N issues (list reasons)
- Flagged N issues requiring human review

### Remaining Issues
| File | Line | Rule | Severity | Message |
|---|---|---|---|---|
```

---

## Rule Tables

### Python / Django Rules
| Rule | What it means | Fix |
|---|---|---|
| `S1192` | String literal duplicated ≥3× | Extract to module-level constant |
| `S3516` | Method always returns same value | Simplify — remove dead branches |
| `S6418` | Hard-coded secret | Move to `env("VAR")` |
| `S1481` | Unused local variable | Delete it |
| `S1186` | Empty method/function body | Add `pass` + comment, or delete |
| `S125` | Commented-out code | Delete the comment block |
| `S1066` | Collapsible `if` statements | Merge with `and` |
| `S3776` | Cognitive complexity > threshold | Extract helper method |
| `S5754` | Broad exception caught | Catch specific exception type |
| `S112` | Generic exception raised | Raise specific exception |
| `S1172` | Unused function parameter | Prefix with `_` or remove |
| `S1854` | Dead store (assigned but never read) | Remove assignment |
| `S2201` | Return value of function not used | Assign or explicitly discard with `_=` |

### Python Security Hotspots
| Rule | What it means | Fix |
|---|---|---|
| `S2068` | Hardcoded credential | Move to `os.environ.get()` |
| `S4507` | Debug features enabled | `env("DEBUG", default=False)` |
| `S5122` | CORS wildcard | Explicit origin list from env |
| `S4502` | CSRF disabled | Exempt only with auth guard |
| `S1313` | Wildcard ALLOWED_HOSTS | Explicit host list from env |
| `S1523` | `eval()` | Replace with `ast.literal_eval()` or typed cast |
| `S4721` | Unsafe subprocess | `shell=False`, validate inputs |
| `S2245` | Pseudorandom (non-crypto) | `secrets` module for auth tokens; mark safe for non-security |
| `S4790` | Weak hash MD5/SHA1 | SHA-256+; mark safe if non-security (e.g. ETag) |
| `S5332` | Clear-text HTTP | HTTPS; mark safe for localhost/dev env only |
| `S4830` | Unauthenticated WebSocket | Auth check in `connect()` |
| `S2077` | SQL injection risk | Parameterized query; mark safe if already parameterized |
| `S5146` | Open redirect | Validate redirect URL against allowlist |
| Django ORM stale read | `save()` does not refresh the in-memory instance — read `obj.field` after `save()` returns the pre-save Python value if the field was mutated in a transaction. Use `refresh_from_db(fields=[...])` after save when the response is built from the saved object. | Call `obj.refresh_from_db(fields=['status', ...])` immediately after `obj.save(update_fields=[...])` before constructing any response |

### TypeScript / React Rules
| Rule | What it means | Fix |
|---|---|---|
| `typescript:S6544` | `any` type used | Replace with specific type or `unknown` |
| `typescript:S1186` | Empty arrow function body | Add comment explaining intent |
| `typescript:S1854` | Dead store | Remove unused assignment |
| `typescript:S1481` | Unused variable | Delete or prefix `_` |
| `typescript:S3776` | Cognitive complexity | Extract helper |
| `typescript:S6481` | `useEffect` missing dependency | Add to deps array or move inside effect |
| `typescript:S6478` | `useCallback` missing dependency | Add to deps array |
| `javascript:S1192` | String literal duplicated | Extract to constant |
| `javascript:S125` | Commented-out code | Delete it |
| `javascript:S3512` | Template literal preference | Replace `+` concat with template literal |
| `javascript:S2201` | Return value unused | Assign or discard |
| `Web:S5725` | Resource loaded from untrusted origin | Add `integrity` + `crossorigin` attrs |
| `Web:S6827` | Missing `aria-label` | Add descriptive `aria-label` |

---

## Constants

| Constant | Value |
|---|---|
| Backend project key | `reallyhq_Lumy-Backend` |
| Frontend project key | `reallyhq_RG-Frontend` |
| SonarCloud API base | `https://sonarcloud.io/api/` |
| GitHub CLI path | `export PATH="/c/Program Files/GitHub CLI:$PATH"` |
| Backend repo | `reallyhq/Lumy-Backend` |
| Frontend repo | `reallyhq/RG-Frontend` |
