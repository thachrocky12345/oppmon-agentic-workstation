# TAG-78: Residency & Governance Hardening (EPIC)

## Description

**Suggested Points:** 34 (Epic — rolls up TAG-79 … TAG-86, with TAG-87 / TAG-88 stretch)
**Type:** Epic
**Status:** Open

Foundation references:

- [ADR-0012 — Residency Model](../decisions/ADR-0012-residency-model.md)
- [ADR-0013 — BYO-VPC Upgrade Channel](../decisions/ADR-0013-byo-vpc-upgrade-channel.md)
- [docs/residency/architecture.md](../residency/architecture.md)

Close the gap between "we have a residency story on paper" and "a regulated-
sector buyer can sign a contract on it." The prior residency audit (see
`docs/residency/architecture.md` § "Current status at a glance") identified
nine concrete pillars; three are shipped (✅), two are partially shipped
(🟡), and four are open gaps (🔴). This epic ships the remaining work so
every row in that table flips to ✅ and the matching commit SHA lands next
to it.

The epic is **infrastructure + governance**, not a customer-visible
feature. No single ticket is sexy. Together they are the difference between
"we can show this to a healthcare prospect" and "we can sell to one."

## Objective

After this epic, the following claims are all defensible with a concrete
file or test in the repo:

1. **"Where does my data live?"** — Storage region is asserted at boot and
   the assertion fails the process if the bucket reports a different
   region (TAG-79).
2. **"Who else can see it?"** — Cross-tenant negative tests exist on both
   the Python (TAG-59 ✅) and TS (TAG-81) retrieval surfaces; the build
   fails if the predicate is dropped.
3. **"Can I run this in my own VPC?"** — `tag deploy byo-vpc <bundle.yaml>`
   renders a complete customer stack from a config bundle whose shape is
   locked in by ADR-0013 (TAG-85).
4. **"What leaves the boundary?"** — Telemetry redaction is allowlist-based
   with an ESLint rule + ripgrep CI step that fails on common leak patterns
   (TAG-84).
5. **"Can I see this in the product?"** — A `ResidencyBadge` shows
   deployment mode + endpoint regions + "raw content leaves boundary: no"
   in the chat header and admin pages (TAG-86).

## Architectural Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | One codebase across SaaS / single-tenant / BYO-VPC | ADR-0012. Topology is a config bundle, not a fork. Maintenance cost too high otherwise. |
| 2 | Double tenant predicate (chunk + document) | Defense in depth — one missed WHERE clause can't leak content because the other layer re-filters. Locked by TAG-59 test; TAG-81 ships TS parity. |
| 3 | Pluggable seams for storage / embedding / LLM | The whole BYO-VPC story rests on the customer pointing each seam at their own endpoints. Embedding seam shipped in TAG-60; storage and LLM seams expanded in TAG-79 / TAG-83. |
| 4 | Region pinned at boot, not per-request | Boot-time assertion fails fast and is testable in CI. Per-request would require touching every storage call site. |
| 5 | Telemetry allowlist + lint, not denylist | Denylists are unbounded; allowlists are auditable. Lint enforces it in code review, not by hope. |
| 6 | BYO-VPC upgrades are customer-pulled, semver-pinned, with a separate Security track | ADR-0013. Auto-update is disqualifying for regulated buyers. |
| 7 | No new code outside the seam pattern | Every new provider integration must go through the existing seam (storage Protocol, EmbeddingProvider Protocol, LLMSpec factory). PR review enforces. |

## Sub-Tickets

| Ticket | Title | Points | Layer |
|---|---|---|---|
| [TAG-79](./TAG-79-region-pinned-storage.md) | Pluggable region-pinned storage (S3 + AzureBlob)              | 5 | Backend / Infra |
| [TAG-80](./TAG-80-ts-embedding-baseurl-parity.md) | TS embedding base_url + dim guard parity (TAG-60 backport) | 3 | Backend |
| [TAG-81](./TAG-81-ts-rag-cross-tenant-audit.md) | TS RAG cross-tenant audit + negative test                  | 3 | Backend / Security |
| [TAG-82](./TAG-82-collection-scope-enforcement.md) | Collection scope enforcement (API 403 + UI scope picker) | 5 | Backend + Frontend |
| [TAG-83](./TAG-83-azure-bedrock-llm-clients.md) | Azure OpenAI + Bedrock LLM clients (TS + Python)            | 5 | Backend |
| [TAG-84](./TAG-84-telemetry-redaction-layer.md) | Telemetry redaction layer + CI lint                         | 5 | Observability / CI |
| [TAG-85](./TAG-85-byo-vpc-deployment-package.md) | BYO-VPC deployment package + runbook                       | 5 | DevOps / CLI |
| [TAG-86](./TAG-86-ui-residency-surface.md) | UI residency surface (badge + docs page)                          | 3 | Frontend |

**Required total:** 34 points (matches epic budget).

### Stretch sub-tickets

| Ticket | Title | Points | Layer |
|---|---|---|---|
| [TAG-87](./TAG-87-soc2-hipaa-evidence-pack.md) | SOC2 / HIPAA evidence pack generator | 5 | Compliance / Reporting |
| [TAG-88](./TAG-88-tenant-export-purge.md) | Tenant data export + purge (GDPR Art. 17) | 5 | Backend / Compliance |

Stretch tickets ship after the required eight close. They are filed so the
work is sized, not committed to.

## Cut Lines (NOT in this epic)

- **Customer-managed encryption keys (CMEK / BYOK).** Seam left open in
  ADR-0012, no timeline. Separate epic.
- **Cross-region replication.** Single region per deployment is the
  supported shape.
- **Multi-region active-active for BYO-VPC.** Not supported.
- **Migrating SaaS tenants between regions.** Out of scope. Done via export
  (TAG-88, stretch) + reseed.
- **Per-tenant rate limiting and cost attribution.** Already covered by
  other epics.

## Critical Non-Negotiables

1. **No app code is touched in the planning sprint.** This epic ticket
   plus its child tickets plus the docs land first. Code ships per-story.
2. **Every retrieval surface MUST have its own cross-tenant negative
   test.** This is process, enforced by PR review against TAG-78 and by
   the redaction lint from TAG-84.
3. **Decrypted secrets MUST NOT cross the request boundary** (carried
   forward from TAG-50 epic). Re-asserted by TAG-85 BYO-VPC bundle tests.
4. **No `:latest` image tag.** No floating tag. No auto-update. Locked by
   ADR-0013 and enforced by the manifest feed structure in TAG-85.
5. **`docs/residency/architecture.md` "Current status" table is the
   source of truth.** Every story's Acceptance Criteria require flipping
   that row from 🟡/🔴 to ✅ with the merged commit SHA.

## Dependencies

**Depends on:**

- [TAG-50 epic](./TAG-50-authenticated-solve-endpoint-epic.md) — the `/solve`
  endpoint and seam patterns this epic hardens.
- [TAG-59](./TAG-59-corpus-search.md) — the cross-tenant test pattern TAG-81 mirrors.
- [TAG-60](./TAG-60-embedding-provider.md) — the embedding seam pattern TAG-80 backports.

**Blocks:**

- Regulated-sector buyer pilots (healthcare, public sector).
- BYO-VPC GA.

## Risk Factors

| Risk | Mitigation |
|---|---|
| Scope creep — "while we're at it" features keep getting attached to TAG-78 | Cut Lines section is explicit; PRs adding scope must split into a new ticket. |
| Doc drift — `docs/residency/architecture.md` claims something that has since regressed | Every story's AC requires updating the matching pillar row from 🟡/🔴 to ✅ with the merged SHA. Re-audit on every quarter close. |
| Redaction lint false negatives (logs slip through under a different field name) | TAG-84's allowlist is positive; new fields can't appear in logs without adding them to the allowlist (i.e. the lint *fails closed*). |
| BYO-VPC bundle complexity scares off customers | TAG-85 ships a runbook `docs/runbooks/deployment/byo-vpc.md` with a worked example for both AWS and Azure. |
| TS / Python parity drift over time | TAG-81 and TAG-80 PR templates require linking to the Python source file being mirrored. Diff in PR description is mandatory. |
| Region-pinned storage check breaks dev environments using local disk | TAG-79 keeps `LocalDiskStorage` as the dev default; the region assertion only fires for `S3Storage` and `AzureBlobStorage`. |

## Acceptance Criteria (Epic)

- [ ] All eight required sub-tickets (TAG-79..TAG-86) merged.
- [ ] `docs/residency/architecture.md` "Current status" table shows ✅ for
      every required pillar with merged commit SHAs.
- [ ] CI fails on a synthetic PR that drops the `tenant_id` predicate from
      either `corpus_search.py` (TAG-59) or `apps/api/src/services/rag.ts`
      (TAG-81).
- [ ] CI fails on a synthetic PR that logs `chunk.content` (TAG-84 ESLint
      rule + ripgrep step).
- [ ] `tag deploy byo-vpc --dry-run sample-bundle.yaml` renders a valid
      stack manifest (TAG-85).
- [ ] A walkthrough of `docs/residency/index.md` answers the four
      procurement questions (where, who else, BYO-VPC, what leaves) from
      ADR-0012's Context section.
- [ ] `apps/web` shows a residency badge in the chat header that matches
      the deployment's actual configuration (TAG-86).
- [ ] Stretch tickets TAG-87, TAG-88 are sized but optional — not blockers.
