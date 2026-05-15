# TAG-84: Telemetry Redaction Layer + CI Lint

## Description

**Suggested Points:** 5
**Type:** Story
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open

There is currently no allowlist on what fields leave the boundary in logs,
metrics, or outbound events. Today a debug `logger.info({ chunk })` would
ship chunk content to whatever log store Arkon (or the customer's
collector) is hooked into — exactly the kind of leak procurement is asking
us to rule out.

This story closes the gap with **defense in depth across three layers**:

1. **Library:** a positive allowlist filter wrapping every Pino logger and
   every outbound event/metric path.
2. **Lint:** an ESLint rule that fails on direct field references known to
   contain customer content.
3. **CI:** a ripgrep step that fails the build on patterns like
   `chunk.content`, `document.filePath`, raw tool args in log calls.

## Objective

Ship `packages/observability/src/redaction.ts` (the runtime filter), the
ESLint rule, the CI ripgrep step, and a residency policy document at
`docs/residency/redaction-policy.md` enumerating exactly which fields are
on the allowlist and why.

```ts
// packages/observability/src/redaction.ts
export const TELEMETRY_ALLOWLIST = new Set([
  "tenant_id", "user_id", "request_id", "model", "provider", "duration_ms",
  "status_code", "route", "error_class",  // ... full list lives in redaction-policy.md
]);

export function redact<T extends object>(obj: T): Partial<T> { ... }
export function wrapLogger(logger: Logger): Logger { ... }
export function wrapMetric(metric: Histogram | Counter): WrappedMetric { ... }
```

## Requirements

### Runtime filter

- Allowlist is **positive** (named fields pass; everything else is
  dropped or replaced with `[REDACTED]`).
- The wrap happens at logger / metric construction time. We do NOT trust
  individual call sites to remember to pass redacted args.
- Nested objects are filtered recursively. Arrays of objects are
  filtered element-wise.
- Strings are passed through if and only if the *key* is in the
  allowlist. The filter does not try to inspect string contents for PII
  (that's a separate problem; this one is leak prevention by field
  name, which is auditable).

### ESLint rule

Add a custom rule under `packages/observability/eslint-plugin-redaction/`
(or wherever the repo keeps shared lint plugins; check
`packages/tsconfig` for prior art).

The rule flags any call to `logger.*` / `metric.*` / `tracer.*` whose
argument expression mentions known content fields:

- `chunk.content` / `chunk.text`
- `document.filePath` / `document.body` / `document.raw`
- `message.content` (chat messages)
- `tool.args` / `tool.rawArgs`
- `embedding.vector`

The list MUST match the denylist in `docs/residency/redaction-policy.md`.

### CI ripgrep step

Add a step in the CI workflow (`.github/workflows/...`) that runs:

```bash
rg --type ts --type js -n \
  -e 'logger\.[a-z]+\([^)]*chunk\.content' \
  -e 'logger\.[a-z]+\([^)]*document\.filePath' \
  -e 'logger\.[a-z]+\([^)]*message\.content' \
  -e 'logger\.[a-z]+\([^)]*tool\.args' \
  apps/ packages/ \
  && exit 1 || exit 0
```

Inverted logic: the step fails if any match is found. This is the
fail-closed third layer of defense.

### Policy document

Create `docs/residency/redaction-policy.md` with:

- The full allowlist with one-line justifications per field.
- The full denylist (content fields the lint flags).
- Process for adding a new field to the allowlist (PR review +
  named approver).
- How to add a redactor for a structured field that we DO need partly
  (e.g. log the first 32 chars of `error.message` but not full body).

## Implementation Notes

- Use Pino's `redact` config option as the underlying mechanism for
  logger wrapping; the wrap function should configure it from the
  allowlist.
- For metrics (prom-client), wrap label values; metric *names* are
  expected to be static so they don't need filtering.
- The ESLint rule can start with simple identifier-match logic — false
  positives are easier to live with than false negatives here. Document
  how to suppress with `// eslint-disable-next-line redaction/no-content-fields`
  (and require a comment explaining why).
- For the CI step, prefer ripgrep over ad-hoc grep; ripgrep handles
  `.gitignore` and runs faster on the repo.
- The `redact` function should be pure and unit-testable. The wrap
  functions are integration-tested.

## Tests

| File | Test | Assertion |
|---|---|---|
| `packages/observability/src/redaction.test.ts` | allowlist field passes | value matches |
| `packages/observability/src/redaction.test.ts` | non-allowlist field replaced | `[REDACTED]` |
| `packages/observability/src/redaction.test.ts` | nested objects filtered recursively | inner field also redacted |
| `packages/observability/src/redaction.test.ts` | arrays of objects filtered element-wise | each element scrubbed |
| `packages/observability/src/redaction.test.ts` | `wrapLogger` round-trip | logged output contains only allowlist fields |
| `packages/observability/src/redaction.test.ts` | metric label filtering | bad labels dropped |
| `packages/observability/eslint-plugin-redaction/test.ts` | `logger.info({ chunk })` → error | rule fires |
| `packages/observability/eslint-plugin-redaction/test.ts` | `logger.info({ tenant_id })` → ok | rule does not fire |
| CI smoke (in PR description) | adding a deliberate `logger.info({ chunk: { content: "x" } })` to a test file fails the CI ripgrep step | exit code != 0 |

## Acceptance Criteria

- [ ] `packages/observability/src/redaction.ts` ships with `redact`,
      `wrapLogger`, `wrapMetric`.
- [ ] Every existing Pino logger in `apps/api`, `apps/web`,
      `packages/agent-engine`, `packages/guardrails` is wrapped (audit
      checklist in PR description).
- [ ] ESLint rule active in the repo lint config; CI runs it.
- [ ] CI ripgrep step active and fails on a synthetic offending PR.
- [ ] `docs/residency/redaction-policy.md` ships with allowlist + denylist
      + add-field process.
- [ ] `docs/residency/architecture.md` "Telemetry redaction" row flipped
      to ✅ with the merged commit SHA.

## Dependencies

**Depends on:** — (foundational)
**Blocks:** [TAG-85](./TAG-85-byo-vpc-deployment-package.md), [TAG-87](./TAG-87-soc2-hipaa-evidence-pack.md)

## Risk Factors

| Risk | Mitigation |
|---|---|
| Allowlist too narrow → debugging becomes painful | Start with a generous list of safe fields (request_id, route, status, duration, tenant_id, user_id, model, provider, error_class). Tighten over time. |
| Lint rule has false positives that block PRs | Allow `// eslint-disable-next-line` with a mandatory inline comment; track suppressions in a follow-up. |
| Wrapping existing loggers misses one | The CI ripgrep step is the third line of defense. If wrapping fails, the lint catches it; if the lint fails, ripgrep catches it. |
| Metric labels can carry unbounded cardinality even if filtered | Out of scope for this story — addressed by existing prom-client config or follow-up. |
