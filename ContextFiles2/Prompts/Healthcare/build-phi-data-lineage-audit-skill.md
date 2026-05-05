---
title: Build PHI Data Lineage & API Response Audit Skill
persona: HIPAA Principal Engineer
target-skill: phi-data-lineage-audit
complements: phi-pii-leak-scan, hipaa-compliance-audit
---

# Prompt: Build the `phi-data-lineage-audit` Skill

---

## WHO YOU ARE

You are a Principal Engineer with 10 years of experience designing HIPAA-compliant healthcare platforms. You have led security reviews for SOC 2 Type II, HITRUST, and CMS security certifications. You have personally been deposed in a healthcare data breach lawsuit and you know exactly where systems fail. You do not accept "we check for auth" as a HIPAA control. You require evidence.

You are now writing a reusable agent skill for the ReallyGlobal engineering team. Your job is to build a skill that an agent can execute on demand to answer one concrete question: **"For every field that contains PHI or PII in this system, where does it go, who can see it, and is that authorized?"**

---

## WHAT TO BUILD

Create a new Claude Code skill file at:

```
C:\projects\ReallyGlobal\.claude\skills\phi-data-lineage-audit\SKILL.md
```

The skill must be named `phi-data-lineage-audit` and must be **distinct from** the two existing skills:

| Existing skill | What it does | What it does NOT do |
|---|---|---|
| `phi-pii-leak-scan` | Grep for PII patterns in source code (static) | Does not trace data flow end-to-end |
| `hipaa-compliance-audit` | Checks HIPAA technical safeguards checklist | Does not verify what actually comes back from API responses |

Your new skill fills the gap: **data lineage tracing and live API response auditing**.

---

## WHAT THE SKILL MUST DO

### Phase 1 — PHI Field Inventory (source of truth)

The skill must build a complete PHI field map by reading:
- All `models.py` files in `Lumy-Backend/apps/`
- All `serializers.py` files
- All `object_types.py` and `schema.py` files (GraphQL)
- `apps/graphqlapp/schema.py`

For each PHI-bearing model field, the skill must produce a row in a lineage table:

```
Model.field → Serializer/GraphQL type → Endpoint(s) → Auth required? → Frontend store?
```

Classify every field using this tier system (same as `phi-pii-leak-scan`):
- **Tier 1 — Clinical PHI**: notes, risk scores, session issues, appointment reasons
- **Tier 2 — Identity PII**: email, phone, DOB, address, coordinates, OAuth tokens
- **Tier 3 — Credential PII**: NPI number, license numbers, insurance IDs
- **Tier 4 — Financial PII**: Stripe IDs, PayPal IDs, payment intent IDs

### Phase 2 — Serializer Exposure Audit

For every Tier 1 and Tier 2 field, the skill must:

1. Find every `Serializer` that includes the field (explicit or via `fields = '__all__'`)
2. Find every DRF View or ViewSet that uses that serializer
3. Find the URL pattern bound to that view
4. Determine whether the view has `permission_classes` including `IsAuthenticated`
5. Determine whether there is an **ownership check** (not just authentication):
   - Backend: does the queryset filter by `request.user`?
   - GraphQL: does the resolver filter by `info.context.user`?
6. Flag as **IDOR risk** any endpoint that takes a PK/ID parameter without ownership filtering

The skill must specifically check for the "over-fetching" pattern:
```python
fields = '__all__'  # on a serializer for a PHI-containing model
```
This is always a finding, severity MEDIUM or higher.

### Phase 3 — GraphQL Schema PHI Exposure Audit

GraphQL is particularly dangerous for PHI because introspection exposes the full schema.
The skill must:

1. Check whether `GRAPHENE = { "SCHEMA": ... }` has `MIDDLEWARE` including an auth guard
2. Check whether introspection is disabled in non-dev environments
3. For every `DjangoObjectType` in `apps/graphqlapp/` or `apps/*/object_types.py`:
   - List which PHI fields are exposed
   - Verify each corresponding query/mutation resolver checks `info.context.user`
4. Flag any resolver that returns PHI data without filtering by the requesting user's ownership

### Phase 4 — Frontend State Audit

PHI that reaches the frontend must not persist beyond the session. The skill must:

1. Search `RG-Frontend/src/store/` Redux slices for any state keys matching Tier 1 PHI field names
2. Search Apollo Client cache policies for queries that fetch PHI — flag any without `fetchPolicy: 'no-cache'` or `fetchPolicy: 'network-only'`
3. Search `localStorage.setItem` and `sessionStorage.setItem` calls for PHI field names
4. Search `console.log|console.error|console.warn` calls in components/pages that receive PHI data
5. Flag any use of `dangerouslySetInnerHTML` where the data source could be user-generated clinical content

### Phase 5 — De-identification Gap Analysis

HIPAA Safe Harbor (45 CFR 164.514(b)) requires 18 specific identifiers to be removed for data to be considered de-identified. The skill must check:

1. Are any analytics events (Mixpanel) sending Tier 1 or Tier 2 fields?
   - Read `RG-Frontend/src/mixPanelEvents/` — flag any event property that maps to a PHI field
   - Real names, email addresses, provider IDs are Mixpanel anti-patterns under HIPAA
2. Does the Azure Search index contain PHI?
   - Read `CareProvider.to_json()` — list every field it sends to Azure
   - Flag Tier 2+ fields (NPI number, phone, address, coordinates) in the search index
3. Are appointment reasons or session notes ever sent to external services?
   - Check SendGrid email templates and payload construction
   - Check Twilio SMS payloads

### Phase 6 — Consent Lifecycle Verification

Before PHI is collected or disclosed, informed consent must exist and be recorded. The skill must:

1. Verify `tandc_consent` on `Client` model exists and is `True` before any PHI read is served to the client
2. Verify `is_email_verified` on `User` is checked before allowing PHI-level profile operations
3. Identify whether re-consent is required when:
   - A new data processing activity is added (e.g., AI translation feature)
   - A new third-party BAA vendor is integrated
4. Check that the consent timestamp is recorded (not just a boolean flag)
5. Flag if there is no mechanism to withdraw consent and delete PHI (right to erasure)

### Phase 7 — Breach Surface Scoring

For every API endpoint that returns Tier 1 or Tier 2 PHI, compute a breach surface score:

```
Breach Surface Score = (PHI Tier * 3) + (Missing Ownership Check * 5) + (Missing Auth * 10) + (Over-fetch * 2)
```

Rank endpoints from highest to lowest breach surface score. The top 5 are the "crown jewel" endpoints that need hardening first.

---

## SKILL OUTPUT FORMAT

The skill must produce a report at:
```
ContextFiles2/Library/Sessions/phi-data-lineage-audit_Results_{YYYY-MM-DD}.md
```

Report structure:

```markdown
# PHI Data Lineage Audit — {DATE}

## Executive Summary
One paragraph written for a non-technical compliance officer explaining:
- How many PHI fields were traced
- How many have confirmed authorization controls
- How many have gaps
- Top 3 risks in plain English

## PHI Field Lineage Table
| Field | Tier | Model | Serializer | Endpoint | Auth? | Ownership Check? | Frontend Cached? | Breach Score |
|---|---|---|---|---|---|---|---|---|
| Notes.notes | 1 | video_conferencing | NotesSerializer | GET /api/v1/notes/ | YES | NO (IDOR) | NO | 18 |
...

## Critical Findings (Score >= 15)
### [CRIT-001] IDOR on /api/v1/notes/
- **Risk**: Any authenticated user can read any session notes by guessing the note ID
- **Evidence**: `apps/video_conferencing/views.py:LINE` — no user ownership filter on queryset
- **HIPAA section**: 164.312(a)(1) — Access Control
- **Fix**: Add `.filter(care_provider__user=request.user)` to queryset

## High Findings (Score 8–14)
...

## De-identification Gaps
...

## Consent Lifecycle Gaps
...

## Breach Surface Ranking (Top 10 Endpoints)
...

## Remediation Priority Matrix
| Priority | Finding | Effort | HIPAA Section |
|---|---|---|---|
| P0 — Fix this week | ... | ... | ... |
| P1 — Fix this sprint | ... | ... | ... |
| P2 — Fix this quarter | ... | ... | ... |
```

---

## SKILL INVOCATION PATTERN

The skill should support these invocations:

```
/phi-data-lineage-audit
/phi-data-lineage-audit --tier 1            # Clinical PHI only
/phi-data-lineage-audit --phase serializers # Run only Phase 2
/phi-data-lineage-audit --phase frontend    # Run only Phase 4
/phi-data-lineage-audit --phase mixpanel    # Run only Phase 5, Mixpanel section
/phi-data-lineage-audit --breach-surface    # Generate breach surface ranking only
/phi-data-lineage-audit --fix               # After reporting, attempt safe auto-fixes
```

---

## QUALITY REQUIREMENTS FOR THE SKILL

When you write the skill, apply these standards:

1. **Every grep command must use real field names from the actual models** — read `apps/*/models.py` before writing the skill and embed the real field names in the grep patterns.

2. **All file paths must be absolute or relative to `C:\Projects\ReallyGlobal\`** — not generic.

3. **Every expected finding must include the known gotchas** already documented in `phi-pii-leak-scan` (OAuth tokens as plaintext, `to_json()` sending to Azure, `profile_handle` PII leakage). Do not duplicate the documentation — reference the existing skill and extend it.

4. **The breach surface score formula must be embedded** in the skill with worked examples.

5. **The consent lifecycle section must reference real model fields**: `tandc_consent` on `apps/client/models.py`, `is_email_verified` on `apps/authentication/models.py`.

6. **The Mixpanel audit section must enumerate real event files** from `RG-Frontend/src/mixPanelEvents/` — read that directory before writing the skill.

7. **The skill must close with a "what this skill does NOT cover" section** so future engineers know its boundaries:
   - It does not test for SQL injection or XSS (see `security-code-review`)
   - It does not run HIPAA technical safeguards checklist end-to-end (see `hipaa-compliance-audit`)
   - It does not test runtime behavior under load or against a live database

---

## WHEN TO RUN THIS SKILL

Embed this guidance in the skill's frontmatter:

- **Trigger**: Before any PR that adds a new model field, serializer, GraphQL type, or API endpoint touching PHI
- **Trigger**: Before any new external service integration that could receive user data
- **Trigger**: Before any AI/ML feature launch that processes session content or transcripts (e.g., the realtime translation feature — RGDEV-166 — must pass this audit before going to production because audio transcripts are Tier 1 PHI)
- **Frequency**: Every PR touching PHI-adjacent code; full scan quarterly

---

## DELIVERABLE

Write the complete `SKILL.md` file. It must be self-contained — an agent with no prior context must be able to execute it from scratch.

After writing the skill, run Phase 1 and Phase 2 immediately against the current codebase and produce the first lineage table so the user can validate that the skill works.
