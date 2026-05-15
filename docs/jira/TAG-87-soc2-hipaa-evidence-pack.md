# TAG-87: SOC2 / HIPAA Evidence Pack Generator (STRETCH)

## Description

**Suggested Points:** 5
**Type:** Story (stretch)
**Epic:** [TAG-78](./TAG-78-residency-governance-hardening-epic.md)
**Status:** Open — stretch (filed for sizing, not committed)

Once TAG-79..TAG-86 ship, the platform has the *substance* of a SOC2 /
HIPAA-friendly residency story. What it doesn't have is a **single
artifact** an auditor can read in 30 minutes. This story builds a
generator that pulls the relevant evidence into a PDF.

## Objective

Ship a `tag evidence soc2` / `tag evidence hipaa` CLI command that
generates a PDF (or signed HTML bundle) containing:

- Audit log samples (last 30 days, redacted, with timestamp range).
- Retention proofs (DB row counts pre/post purge schedule).
- Cross-tenant negative test results (CI artifact from TAG-59 + TAG-81).
- Redaction-lint output (TAG-84 CI artifact).
- Region-pin assertion results (TAG-79 boot log lines).
- BYO-VPC bundle hash (TAG-85, if applicable).
- Software inventory (image digests + signatures).

## Requirements

### Output format

- Primary: PDF rendered from a Markdown template via `marked` + a PDF
  generator (the repo already pulls `pdf-parse` for ingestion — pair
  with `pdfkit` or `puppeteer` for output).
- Secondary: signed HTML bundle for customers who prefer it.

### Templates

Two templates under `packages/cli/src/commands/evidence/templates/`:

- `soc2.md.tmpl` — SOC2 Type II control mapping (CC6.1, CC6.6, CC7.2, etc.).
- `hipaa.md.tmpl` — HIPAA Technical Safeguards (164.312(a), (b), (c), (e)).

Each template references the same underlying evidence sources but maps
to different control IDs.

### Evidence sources

| Source | Fetched from | Window |
|---|---|---|
| Audit log samples | `audit_log` table (control plane) | last 30 days |
| Retention proofs | row counts before/after retention job | most recent run |
| Cross-tenant tests | GitHub Actions CI artifact (TAG-59 + TAG-81 jobs) | latest main |
| Redaction lint | GitHub Actions CI artifact (TAG-84 jobs) | latest main |
| Region pin asserts | structured log line from app startup | last successful boot |
| BYO-VPC bundle hash | `tag deploy byo-vpc --print-hash` | current |
| Image digests | docker registry API | per release tag |

The generator MUST be able to run against either the local dev DB (with
fixtures) or production (read-only, audit-logged).

### Signing

The output PDF / HTML bundle is signed with Ed25519. The signing key is
held by the release process (NOT the runtime; we don't want signing keys
on production app servers).

## Implementation Notes

- The command lives in `packages/cli/` alongside `tag deploy byo-vpc`.
- The PDF rendering is heavy; allow a `--draft` flag that emits Markdown
  only (no PDF) for fast iteration.
- The audit log samples MUST be redacted via the TAG-84 allowlist before
  inclusion. Otherwise the evidence pack is itself a leak.
- The CI artifact fetch needs a GitHub PAT scoped to read-only artifact
  access. Document setup in the runbook.

## Tests

| File | Test | Assertion |
|---|---|---|
| `packages/cli/src/commands/evidence/soc2.test.ts` | mocked sources → renders Markdown | sections present |
| `packages/cli/src/commands/evidence/soc2.test.ts` | mocked sources → renders PDF | file is a valid PDF |
| `packages/cli/src/commands/evidence/soc2.test.ts` | audit samples are redacted | no denylist fields in output |
| `packages/cli/src/commands/evidence/hipaa.test.ts` | control mapping correct | each 164.312 section present |
| `packages/cli/src/commands/evidence/signing.test.ts` | signed bundle verifies | signature valid |
| `packages/cli/src/commands/evidence/signing.test.ts` | tampered bundle fails verify | signature invalid |

## Acceptance Criteria

- [ ] `tag evidence soc2 --output evidence-pack.pdf` produces a valid PDF.
- [ ] `tag evidence hipaa --output evidence-pack.pdf` produces a valid PDF
      mapped to 164.312 controls.
- [ ] Output is signed with Ed25519 and verifies with the public key
      shipped in `packages/shared`.
- [ ] Audit log samples in the output contain only allowlist fields
      (TAG-84).
- [ ] All six tests pass.
- [ ] A runbook section is added to `docs/runbooks/compliance/evidence-pack.md`
      explaining how to run the command and where the keys live.

## Dependencies

**Depends on:**
- [TAG-84](./TAG-84-telemetry-redaction-layer.md) (audit samples must be redactable)
- [TAG-78 epic](./TAG-78-residency-governance-hardening-epic.md) core stories done

**Blocks:** — (compliance artifact, not a feature blocker)

## Risk Factors

| Risk | Mitigation |
|---|---|
| Auditors disagree on the SOC2 / HIPAA control mapping | The template is editable; ship a v1 and iterate with the first real audit. |
| PDF rendering fragile across platforms | `--draft` Markdown-only mode for iteration; PDF is the final step. |
| Audit log samples leak content if redaction has gaps | TAG-84 covers this; the test asserts denylist fields don't appear. |
| Signing key management | Keys live in the release pipeline secret store, NOT the application. Documented separately. |
| Stretch — may not ship this sprint | This is acknowledged stretch; epic does not block on it. |
