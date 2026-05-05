---
name: scope-audit
description: Blast-radius checker for implementation work. Declare a feature scope before starting — the skill maps it to allowed files and flags any changes outside that boundary after implementation. Use when asked to "check scope", "audit blast radius", "what did I touch", "scope check", or "did I touch anything I shouldn't have".
argument-hint: [domain] [feature]   e.g. "attribution portal"  |  "booking checkout"  |  "video session page"
---

# Scope Audit — Declare → Implement → Verify

## Purpose

Enforce the rule: **fix one page, don't touch others.**

Before implementation: declare what you're working on. The skill resolves that to a canonical allowed-file set.
After implementation: diff the branch and flag every file outside the declared scope.

Use this skill:
- Before starting any implementation task to establish the allowed footprint
- After finishing to verify the actual footprint matches
- As a gate before committing — catch cross-domain contamination before it ships

---

## Trigger Phrases

- "scope-audit [feature]" / "check scope [feature]"
- "what's the blast radius of [feature]?"
- "audit what I touched"
- "scope check before commit"
- `/scope-audit [domain] [feature]`

---

## Step 0 — Parse Arguments

```
/scope-audit [domain] [feature]
/scope-audit declare [domain] [feature]   → set scope, do not audit yet
/scope-audit check                         → audit current git diff against declared scope
/scope-audit list                          → show all domain maps
```

If no args: infer from the current branch name and recent git diff.

---

## Step 1 — Resolve Scope

Map the argument to a **primary** file set (allowed to change) and a **shared** file set (allowed with caution — flag but do not block).

Use the Domain Map below. If the argument matches multiple domains, confirm with the user which is intended.

### Domain Map — Backend (`Lumy-Backend/apps/`)

| Domain key | Aliases | Primary paths | Shared paths |
|---|---|---|---|
| `auth` | authentication, login, signup, jwt, social | `apps/authentication/` `apps/social_auth/` | `lumy_global/settings.py` `lumy_global/urls.py` |
| `booking` | checkout, booking-link, book, slot, hold | `apps/booking_link/` | `apps/calendar_functionality/models.py` `apps/stripe_integration/` |
| `attribution` | attribution, referral, discount, affiliate | `apps/attribution/` | `apps/booking_link/views.py` |
| `calendar` | calendar, scheduling, rate, appointment, session | `apps/calendar_functionality/` | `apps/care_provider/models.py` |
| `video` | video, twilio, translation, chat, call | `apps/video_conferencing/` | `apps/calendar_functionality/models.py` |
| `payments` | stripe, payment, invoice, billing | `apps/stripe_integration/` | `apps/booking_link/views.py` `apps/calendar_functionality/` |
| `search` | search, serp, discovery, azure | `apps/serp_result/` | `apps/care_provider/` |
| `content` | cms, pages, manage-pages, navigation | `apps/manage_pages/` | `lumy_global/urls.py` |
| `compliance` | certn, risk, vulnerability, screening | `apps/risk_screening/` | `apps/authentication/` `apps/client/` |
| `providers` | care-provider, provider, profile, taxonomy | `apps/care_provider/` | `apps/authentication/models.py` |
| `clients` | client, patient, user-profile | `apps/client/` | `apps/authentication/models.py` |
| `graphql` | graphql, schema, query, mutation | `apps/graphqlapp/` | All app `object_types.py` `mutations.py` `queries.py` |
| `infra` | settings, config, urls, requirements, ci | `lumy_global/` `requirements.txt` `.env.example` `.github/` | — |
| `seed` | fixtures, seed, fake-data | `fixtures/` `apps/*/management/commands/seed*` | — |

### Domain Map — Frontend (`RG-Frontend/src/`)

| Domain key | Aliases | Primary paths | Shared paths |
|---|---|---|---|
| `auth` | authentication, login, signup, onboarding | `src/pages/auth/` `src/store/slices/authSlice*` `src/contexts/auth*` | `src/store/axiosInstance*` `src/store/apolloClient*` |
| `booking` | checkout, book, slot, booking-link | `src/pages/book/` `src/containers/checkout/` `src/restapis/bookingLink*` `src/store/slices/checkoutSlice*` | `src/components/PaymentPage/` |
| `attribution` | attribution, referral, discount | `src/pages/care-provider/attribution*` `src/components/CareProvider/Attribution/` `src/store/slices/attributionSlice*` `src/restapis/attribution*` | `src/components/PaymentPage/` |
| `calendar` | calendar, scheduling, appointment, availability | `src/pages/client-calendar*` `src/pages/care-provider/calendar*` `src/containers/calendar/` `src/components/Calendar/` | `src/restapis/calendar*` |
| `video` | video, call, session, twilio, translation | `src/pages/session/` `src/components/Call/` `src/hooks/useRealtime*` `src/hooks/useTwilio*` `src/utils/audioUtils*` | `src/pages/client-calendar*` |
| `payments` | stripe, payment, paypal, billing | `src/components/PaymentPage/` `src/restapis/stripe*` `src/restapis/paypal*` | `src/containers/checkout/steps/PaymentCapture*` |
| `search` | search, discovery, serp | `src/pages/search/` `src/containers/search/` `src/store/slices/searchSlice*` | `src/components/CareProvider/` |
| `providers` | provider-profile, provider-portal, care-provider | `src/pages/care-provider/` `src/components/CareProvider/` (excl. Attribution/) | `src/store/slices/providerSlice*` |
| `clients` | client-portal, client-profile | `src/pages/client/` `src/components/Client/` | `src/store/slices/clientSlice*` |
| `content` | cms, pages, blog, nav | `src/pages/content/` `src/components/CMS/` | `src/store/slices/cmsSlice*` |
| `e2e` | playwright, e2e, tests | `e2e/` | — |
| `shared` | store, hooks, lib, types, i18n | `src/store/` `src/lib/` `src/hooks/` `src/i18n/` `src/types/` | — |
| `infra` | config, next, package, ci | `next.config.js` `package.json` `tsconfig.json` `.github/` `sonar*.properties` | — |

---

## Step 2 — Declare Scope (pre-implementation)

When called with `declare` or before implementation begins:

1. Resolve the domain(s) and feature from arguments
2. Print the allowed file set:

```
## Scope Declared: Attribution Portal (FE)

### Primary paths (changes expected here):
  src/pages/care-provider/attribution*
  src/components/CareProvider/Attribution/
  src/store/slices/attributionSlice*
  src/restapis/attribution*

### Shared paths (allowed with caution — flag if touched):
  src/components/PaymentPage/

### Out of scope (any change here is a violation):
  Everything else

### Scope saved to: /tmp/scope-audit-current.json
```

Save scope to `/tmp/scope-audit-current.json`:
```json
{
  "declared_at": "2026-03-20T05:00:00Z",
  "feature": "Attribution Portal",
  "domain": "attribution",
  "repo": "RG-Frontend",
  "primary": ["src/pages/care-provider/attribution", "src/components/CareProvider/Attribution/", "src/store/slices/attributionSlice", "src/restapis/attribution"],
  "shared": ["src/components/PaymentPage/"]
}
```

---

## Step 3 — Audit (post-implementation)

When called with `check` or after implementation:

### 3a. Get changed files

```bash
# Against branch base
git diff --name-only origin/main...HEAD

# Or against staged changes only
git diff --name-only --cached

# Or against last commit
git diff --name-only HEAD~1..HEAD
```

### 3b. Classify each changed file

For each file in the diff:

| Category | Condition | Action |
|---|---|---|
| ✅ In scope | Matches a primary path | Pass |
| ⚠️ Shared | Matches a shared path | Flag — note what changed and why |
| ❌ Out of scope | Matches neither | VIOLATION — must justify or revert |
| ℹ️ Infra | `*.md`, `CLAUDE.md`, skill files, `.gitignore` | Informational — not a violation |

### 3c. Produce the audit report

```
## Scope Audit Report
Declared scope: Attribution Portal (FE)
Audit run: 2026-03-20 05:30

### Changed files: 9

✅ IN SCOPE (6)
  src/pages/care-provider/attribution.tsx
  src/components/CareProvider/Attribution/DiscountSettings.tsx
  src/components/CareProvider/Attribution/AttributedClientsList.tsx
  src/restapis/attribution.ts
  src/store/slices/attributionSlice.ts
  src/types/attribution.ts         ← types file, mapped to attribution domain

⚠️ SHARED — justify (1)
  src/components/PaymentPage/PaymentPage.tsx
  → Reason required: "Updated originalPrice prop to fix double-discount (reviewer blocker)"
  → Acceptable if: change is minimal, limited to the shared interface point, and reviewed

❌ OUT OF SCOPE — VIOLATIONS (1)
  src/components/CareProvider/Profile/ProfileCard.tsx
  → NOT in attribution domain. Revert or move to a separate PR.

ℹ️ INFRA (1)
  CLAUDE.md  → documentation change, not a violation

### Verdict: ❌ FAIL — 1 violation, 1 shared file requiring justification

### Action required:
1. Revert `src/components/CareProvider/Profile/ProfileCard.tsx` or open a separate PR for it
2. Add a comment in the PR describing why PaymentPage.tsx was touched
```

---

## Step 4 — Violation Protocol

If violations are found:

1. **Show the violation** with full file path and what changed (`git diff HEAD -- {file}`)
2. **Offer three options:**
   - **A — Revert the file:** `git checkout HEAD -- {file}` (stash the change)
   - **B — Move to a new branch/PR:** create `fix/{domain}-{file-slug}` branch, cherry-pick the change, open a separate PR
   - **C — Justify in place:** User explains why — add a comment to the PR body documenting the cross-domain touch and its justification

3. **Never block silently** — always surface the violation and let the user decide.

---

## Step 5 — Shared File Protocol

For shared file touches:

1. Show the diff (`git diff HEAD -- {file}`)
2. Check if the change is:
   - **Interface-only** (adding a prop, extending a type) → generally acceptable
   - **Logic change** (modifying existing behavior) → higher risk, flag for review
   - **Incidental** (formatting, import re-order triggered by linter) → acceptable, note it
3. Write a one-line justification that will appear in the PR body

---

## Step 6 — Pre-Commit Hook Mode

When run as a pre-commit check (no args, CWD is a git repo):

```bash
# Auto-infer scope from branch name
BRANCH=$(git branch --show-current)
# Map branch name to domain: feat/booking-* → booking, RGDEV-190/attribution-* → attribution
# Read /tmp/scope-audit-current.json if it exists
# Run audit against staged files (git diff --cached --name-only)
# If violations: print report and exit 1 (blocks commit)
# If clean: print ✅ and exit 0
```

---

## Domain Overlap Rules

Some features legitimately touch multiple domains. Handle these known overlaps:

| Feature | Primary domain | Allowed secondary |
|---|---|---|
| Checkout payment flow | booking | payments |
| Attribution discount at checkout | attribution | booking, payments |
| Post-booking email | booking | calendar |
| Video session join | video | calendar |
| Provider onboarding | providers | auth |
| Certn background check | compliance | auth, providers |
| GraphQL schema update | graphql | any (schema changes ripple) |
| Migration | infra | the specific app being migrated |

When a feature matches an overlap pattern, both primary and secondary are considered in-scope.

---

## Constants

| Constant | Value |
|---|---|
| Backend local | `C:\projects\ReallyGlobal\Lumy-Backend` |
| Frontend local | `C:\projects\ReallyGlobal\RG-Frontend` |
| Scope state file | `/tmp/scope-audit-current.json` |
| GitHub CLI path | `export PATH="/c/Program Files/GitHub CLI:$PATH"` |
