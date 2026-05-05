---
name: domain-planning
description: Multi-agent pipeline that fans out a requirements document or ticket to N domain-specialist planners, then merges into a unified implementation plan. Each domain planner owns its slice and declares explicit assumptions about other domains. Use when asked to "plan this across domains", "fan out planning", "decompose this feature", "multi-domain plan", or "/domain-planning [ticket-or-doc]".
argument-hint: [jira-ticket | requirements-doc-path | feature-description]
---

# Domain Planning Pipeline — ReallyGlobal

## Architecture: N+2 agents, 3 phases (N = number of domains touched, max 8)

## Trigger Phrases

- "Plan this across domains" / "Fan out planning"
- "Domain-decompose this ticket"
- "Multi-domain planning pipeline"
- `/domain-planning RGDEV-NNN`
- `/domain-planning [path/to/requirements.md]`

---

## Phase 1 — DOMAIN DECOMPOSER (1 agent, sequential, opus)

**INPUT:** `$ARGUMENTS` (Jira ticket key, requirements doc path, or plain description)

### 1a. Fetch requirements

If argument is a Jira key (e.g. `RGDEV-205`):
```bash
# Use MCP Atlassian getJiraIssue, or:
export PATH="/c/Program Files/GitHub CLI:$PATH"
# Fetch from Jira via MCP tool: mcp__plugin_atlassian_atlassian__getJiraIssue
```

If argument is a file path: `Read` the file.

If argument is a plain description: use it directly.

### 1b. Identify touched domains

Map requirements to domains using the Domain Registry below. A domain is **touched** if the feature requires:
- Changes to its models, views, serializers, or services (backend)
- Changes to its pages, containers, components, or API helpers (frontend)
- New migrations in its app
- New tests in its test directory

**HARD CAP: N ≤ 8.** If more than 8 domains are touched, consolidate the smallest ones.

### 1c. Produce domain brief files

For each domain D, create `/tmp/domain-plan-{slug}-{D}.md`:

```markdown
# Domain Brief: {Domain Name}

## Feature context
{1-2 sentences on what the overall feature does}

## This domain's responsibility
{What specifically this domain must do — API endpoints, UI components, models, etc.}

## Input contracts (what other domains provide to this one)
- From {domain X}: {what data/event/API call this domain expects to receive}
- From {domain Y}: ...

## Output contracts (what this domain provides to others)
- To {domain Z}: {what this domain must expose — endpoint, event, type, prop}

## Known constraints
- {Any technical constraint specific to this domain — e.g. CockroachDB atomicity, DRF serializer pattern, Stripe webhook idempotency}

## Files likely touched
- BE: {list}
- FE: {list}

## Open questions
- {Anything this domain planner needs answered before planning}
```

### 1d. User confirmation gate

Display the domain decomposition before launching Phase 2:

```
## Domain Decomposition — {Feature Name}

Identified {N} domains:

| # | Domain | Responsibility summary | Planner |
|---|--------|----------------------|---------|
| 1 | Booking/Checkout | New slot hold endpoint, session state machine | Agent 1 |
| 2 | Attribution | Discount application at checkout completion | Agent 2 |
| 3 | Payments | PaymentIntent creation, Stripe webhook | Agent 3 |
| 4 | Auth/Onboarding | Post-checkout client profile completion | Agent 4 |

Launching {N} domain planners + 1 merge reconciler = {N+1} agents.

Proceed? (y/n)
```

**Wait for user confirmation before launching Phase 2.**

---

## Phase 2 — DOMAIN PLANNERS (N agents, parallel, sonnet per planner)

Launch all N domain planners simultaneously once Phase 1 is confirmed.

Each planner receives:
- Its own domain brief (`/tmp/domain-plan-{slug}-{D}.md`)
- The full feature requirements
- Read access to the codebase

### Each domain planner must:

1. **Read** the relevant source files for their domain before writing anything
2. **Produce** a domain execution plan at `/tmp/domain-plan-{slug}-{D}-exec.md`:

```markdown
# Execution Plan: {Domain Name} — {Feature}

## Changes required

### Backend
For each change:
- **File:** `apps/{app}/views.py`
- **Change:** {description — new endpoint, model field, serializer field, etc.}
- **Risk:** LOW / MEDIUM / HIGH + reason
- **Migration needed:** yes/no

### Frontend
For each change:
- **File:** `src/containers/{feature}/...`
- **Change:** {description}
- **Risk:** LOW / MEDIUM / HIGH + reason

## Assumptions about other domains
- Assumes {domain X} exposes: {specific endpoint/type/prop}
- Assumes {domain Y} handles: {specific responsibility}
- If those assumptions are wrong, this plan changes: {how}

## Interface contracts I'm committing to
- I will expose: {endpoint URL / GraphQL type / Redux action / prop name}
- Shape: {request/response shape or TypeScript interface}
- Available by: {Phase step N}

## Tests to add
- `{TestClass}.{test_method}` — {what it verifies}
- ...

## Ordering within this domain
1. {migration first if needed}
2. {model changes}
3. {service/view layer}
4. {serializer/schema}
5. {URL registration}
6. {FE type / API helper}
7. {FE component}
8. {tests}

## Out of scope for this domain
- {What this planner explicitly does NOT handle — another domain owns it}
```

3. **Declare explicit assumptions** — if a planner assumes something from another domain and it's wrong, the merge agent will catch the conflict.

---

## Phase 3 — MERGE RECONCILER (1 agent, sequential, opus)

**Wait for ALL N domain planners to complete.**

**INPUT:** All N execution plans + the original requirements

### 3a. Build integration matrix

For each pair of domains that exchange data:

| From | To | Contract | Status |
|---|---|---|---|
| Booking | Payments | `POST /checkout/payment-intent/` → `{client_secret}` | ✅ Aligned |
| Attribution | Booking | `discount_percent` field on `CheckoutSession` | ⚠️ Conflict C-01 |

### 3b. Identify conflicts

A **conflict** exists when:
- Two domains make incompatible assumptions about a shared interface
- Two domains plan to modify the same file for different reasons
- One domain's plan depends on another domain's output in a way the other domain didn't account for
- Timing: Domain A needs Domain B's output in Step 2, but Domain B delivers it in Step 5

Label conflicts `C-01`, `C-02`, etc.

For each conflict:

```
## Conflict C-01: Discount field ownership

**Domains:** Attribution vs Booking
**Issue:** Attribution planner puts `discount_percent` on `CheckoutSession` model.
Booking planner puts a separate `AppliedDiscount` FK. Both plans touch `apps/booking_link/models.py`.
**Resolution:** Use `CheckoutSession.discount_percent` (nullable DecimalField).
Attribution writes it; Booking reads it. Single source of truth.
**Why:** Fewer joins, simpler serializer, matches the existing session state machine.
**Domain to update:** Attribution (owns the field), Booking (consumes it — remove AppliedDiscount FK from their plan)
```

### 3c. Produce unified execution plan

Save to `/tmp/domain-plan-{slug}-unified.md`:

```markdown
# Unified Execution Plan: {Feature Name}

_Generated {date} — {N} domains, {conflicts} conflicts resolved_

---

## Resolved Conflicts
| ID | Conflict | Resolution |
|----|----------|------------|
| C-01 | ... | ... |

---

## Execution Order (cross-domain sequencing)

### Step 1: Shared infrastructure
- [ ] {Domain}: migration for shared models

### Step 2: Backend contracts
- [ ] {Domain A}: implement endpoint X (provides input to Domain B)
- [ ] {Domain B}: implement endpoint Y (independent of A)

### Step 3: Backend consumers
- [ ] {Domain C}: implement endpoint Z (depends on A's output from Step 2)

### Step 4: Frontend API helpers + types
(in parallel for independent domains)
- [ ] {Domain}: add `restapis/{feature}.ts`
- [ ] {Domain}: extend Redux slice

### Step 5: Frontend components
(in parallel where independent)
- [ ] {Domain}: page/container changes
- [ ] {Domain}: component changes

### Step 6: Tests
(in parallel)
- [ ] {Domain}: Django test suite — {N} new tests
- [ ] {Domain}: FE type checks + lint

---

## Domain execution plans (unchanged sections)
{Paste each domain's final plan, annotated with any conflict resolutions applied}

---

## Integration test checklist
- [ ] End-to-end: {user flow from start to finish}
- [ ] Cross-domain: {specific cross-domain assertion — e.g. "discount applied at checkout shows in attribution dashboard"}
- [ ] Rollback: {what to revert if this ships broken}
```

### 3d. Display summary to user

```
## Domain Planning Complete — {Feature Name}

Resolved {N} conflicts (C-01 through C-{N}).

Unified plan saved to: /tmp/domain-plan-{slug}-unified.md

### Recommended execution order:
1. {Domain A} backend — migration + model (no dependencies)
2. {Domain B} backend — in parallel with A
3. {Domain C} backend — depends on A completing
...

### Next step:
Run `/implement-from-plan /tmp/domain-plan-{slug}-unified.md` to execute.
Or review the plan first: `Read /tmp/domain-plan-{slug}-unified.md`
```

---

## Domain Registry — ReallyGlobal

Use this to determine which domains a feature touches during Phase 1.

| Domain | Key | BE paths | FE paths |
|--------|-----|----------|----------|
| Auth/Onboarding | `auth` | `apps/authentication/` `apps/social_auth/` `apps/client/` (onboarding) | `src/pages/auth/` `src/containers/checkout/steps/AuthOnboarding*` |
| Booking/Checkout | `booking` | `apps/booking_link/` | `src/pages/book/` `src/containers/checkout/` `src/restapis/bookingLink*` |
| Attribution | `attribution` | `apps/attribution/` | `src/pages/care-provider/attribution*` `src/components/CareProvider/Attribution/` |
| Calendar/Scheduling | `calendar` | `apps/calendar_functionality/` | `src/pages/client-calendar*` `src/containers/calendar/` |
| Video/Sessions | `video` | `apps/video_conferencing/` | `src/pages/session/` `src/components/Call/` `src/hooks/useRealtime*` |
| Payments | `payments` | `apps/stripe_integration/` | `src/components/PaymentPage/` `src/restapis/stripe*` |
| Search/Discovery | `search` | `apps/serp_result/` | `src/pages/search/` `src/containers/search/` |
| Provider Portal | `providers` | `apps/care_provider/` | `src/pages/care-provider/` `src/components/CareProvider/` |
| Client Portal | `clients` | `apps/client/` | `src/pages/client/` `src/components/Client/` |
| Content/CMS | `content` | `apps/manage_pages/` | `src/pages/content/` |
| Compliance | `compliance` | `apps/risk_screening/` | `src/components/Certn/` |
| GraphQL | `graphql` | `apps/graphqlapp/` | `src/graphql/` `src/store/apollo*` |
| Notifications | `notifications` | Email templates, SendGrid views | — |
| Infra/Config | `infra` | `lumy_global/` `.github/` `requirements.txt` | `next.config.js` `package.json` `.github/` |

---

## Timing Rules

- Phase 1 runs alone — decomposer must finish before planners start
- **User confirmation required** between Phase 1 and Phase 2
- Phase 2: all N planners launch in parallel
- Phase 3 launches only after ALL Phase 2 planners complete

---

## Status Table (maintain throughout)

```
## Domain Planning — {Feature} — Status

| Phase | Agent | Domain | Status | Notes |
|-------|-------|--------|--------|-------|
| 1 | DECOMPOSER | — | ⬜ Pending | — |
| 2.1 | PLANNER | {Domain 1} | ⬜ Pending | — |
| 2.2 | PLANNER | {Domain 2} | ⬜ Pending | — |
| ... | ... | ... | ... | ... |
| 3 | RECONCILER | — | ⬜ Pending | — |
```

---

## Constraints

- **Hard cap:** N ≤ 8 domains — consolidate if more
- **Conflict IDs:** C-01, C-02, ... (never reuse)
- **Every planner must declare assumptions** — a plan with no assumptions listed is incomplete
- **Interface contracts are binding** — a planner that promises an endpoint shape must deliver it exactly
- **Migration first** — if any domain needs a migration, it runs before all dependent domains implement
- **Scope audit integration:** After the unified plan is approved, run `/scope-audit declare {domain}` for each domain before implementation begins

---

## Output locations

| Artifact | Path |
|----------|------|
| Domain briefs | `/tmp/domain-plan-{slug}-{domain}.md` |
| Domain execution plans | `/tmp/domain-plan-{slug}-{domain}-exec.md` |
| Unified plan | `/tmp/domain-plan-{slug}-unified.md` |
| Conflict log | embedded in unified plan |
