# RGDEV-185: Fraud & Gaming Guardrails — UX / Scenario / Commercial Audit Results
**Date**: 2026-03-14
**Auditor**: Claude (automated code audit)
**Scope**: 10 scenarios from `Audit_FraudGuardrails_UXScenario_Prompt.md`

---

## Executive Summary

The core guardrail (`has_prior_booking`) is well-designed for the primary gaming vector: it queries ALL appointment statuses (unfiltered `.exists()`) which correctly blocks SCHEDULED, COMPLETED, and CANCELLED relationships. However, the audit identified **2 CRITICAL**, **2 HIGH**, and **3 MEDIUM** gaps that present commercial and operational risk before shipping.

| Severity | Count | Key Themes |
|---|---|---|
| CRITICAL | 2 | Talk Now blind spot; fraud logger is ephemeral |
| HIGH | 2 | No internal/external server-side enforcement; no rate-limit config |
| MEDIUM | 3 | No post-delete re-evaluation; no NO_SHOW status; provider re-registration unaddressed |
| LOW | 1 | Multi-account client attack (low incentive) |

---

## Scenario 1 — Mass Email to Existing Clients

**Status**: PASS (with one caveat)

### Evidence

`has_prior_booking()` in `apps/attribution/utils.py:123-132`:
```python
def has_prior_booking(provider, client):
    from apps.calendar_functionality.models import Appointment
    return Appointment.objects.filter(
        care_provider=provider,
        client=client,
    ).exists()
```

The query is **unfiltered by status** — it matches ANY `Appointment` row for the `(provider, client)` pair regardless of `is_status`. This means SCHEDULED, COMPLETED, and CANCELLED appointments all trigger INELIGIBLE.

The check fires at `/attribution/track/` call time (line 53 of `views.py`), not deferred to checkout. This is the correct design — blocking happens at first contact.

### Appointment status coverage

`APPOINTMENT_STATUS` in `apps/calendar_functionality/constants.py`:
```
SCHEDULED, COMPLETED, CANCELLED
```

**Caveat**: There is no `NO_SHOW` status in the platform. This means no-shows are either left as SCHEDULED or manually changed to CANCELLED. Both are covered by the unfiltered query. However, if a `NO_SHOW` status is added later without updating `has_prior_booking()`, the unfiltered query would still catch it (since it has no status filter). **No current gap, but document the design assumption.**

### Rate limiting

The view uses `throttle_classes = [UserRateThrottle]`, but `DEFAULT_THROTTLE_RATES` is **not configured** in `settings.py`. DRF's `UserRateThrottle` requires a `'user'` key in `DEFAULT_THROTTLE_RATES` to be effective. Without it, the throttle class is instantiated but **does not enforce any limit**.

### Multi-staff/practice check

The query joins on `care_provider=provider` (CareProvider FK), not on practice or organization. Each CareProvider is a separate record. **A booking with staff member A does NOT count as a prior booking for staff member B's attribution link.** This is an accepted limitation for MVP if practices are not yet modeled.

### Residual Risk

| Risk | Severity |
|---|---|
| `UserRateThrottle` is non-functional (no rate config) — no bulk-claim detection | **HIGH** |
| Multi-staff practice bypass | **MEDIUM** (acceptable for MVP if practices not modeled) |

### Remediation

- **HIGH**: Add `DEFAULT_THROTTLE_RATES = {'user': '60/minute'}` (or appropriate rate) to `settings.py`. Without this, a script could call `/attribution/track/` thousands of times in a loop.

---

## Scenario 2 — Talk Now / On-Demand Session History Gap

**Status**: FAIL — **CRITICAL**

### Evidence

`TalkNow` model in `apps/talk_now/models.py`:
```python
class TalkNow(models.Model):
    client = models.ForeignKey(User, ...)           # FK to User, NOT Client
    care_provider = models.ForeignKey(CareProvider, ...)
```

Key findings:

1. **Talk Now sessions live in a separate `TalkNow` model**, NOT in the `Appointment` table.
2. `has_prior_booking()` queries **only** `Appointment.objects.filter(...)`. It does **not** query `TalkNow`.
3. Therefore, a client who had a Talk Now session with a provider — even yesterday — will pass the prior booking check and receive ELIGIBLE attribution.
4. The `TalkNow.client` FK points to `User` (not `Client`), so a cross-table check would need to join `User -> Client` to match the `has_prior_booking` signature which takes a `Client` instance.

### Commercial exposure

If a provider has N existing Talk Now clients and sends them all an external profile link:
- All N receive ELIGIBLE attribution
- Provider pays 12% instead of 15% on all future telehealth sessions with those clients
- **3% revenue leakage per session, per client, indefinitely**

For a provider with 20 Talk Now clients booking 2 sessions/month at $150 avg:
- Monthly leakage: 20 x 2 x $150 x 0.03 = **$180/month per provider**
- Annual: **$2,160 per provider**

### Residual Risk

| Risk | Severity |
|---|---|
| Talk Now sessions not checked by `has_prior_booking()` | **CRITICAL** |

### Remediation

Add a `TalkNow` check to `has_prior_booking()`:
```python
from apps.talk_now.models import TalkNow
talk_now_exists = TalkNow.objects.filter(
    care_provider=provider,
    client__client=client,  # User -> Client reverse
).exists()
```
Note: the FK structure (`TalkNow.client -> User`, not `Client`) requires either adjusting the join or changing the FK. Verify the join path `User.client` (reverse relation from `Client.user`) exists.

---

## Scenario 3 — Genuine New Client False Positive

**Status**: PASS

### Evidence

- `has_prior_booking()` does a simple `Appointment.objects.filter(care_provider=provider, client=client).exists()`. For a brand-new user with zero appointments, this returns `False`.
- No data migrations or admin backfill processes create phantom appointments.
- `BaseModel` has `is_active` but `has_prior_booking()` does not filter on it — this means deactivated appointments (if any) would still trigger INELIGIBLE. This is **correct behavior** (a deactivated appointment still proves a prior relationship).
- No identity deduplication exists (same person, different email = different `Client`). This is an accepted MVP limitation, not a false positive concern.
- Test `test_no_prior_booking_creates_token` in `test_fraud_guardrails.py` covers the happy path.

### Residual Risk

| Risk | Severity |
|---|---|
| No identity deduplication across email addresses | **LOW** (benefits providers, not exploitable for false positives) |

---

## Scenario 4 — Concurrent Registration + Attribution Race Condition

**Status**: PASS

### Evidence

- `/attribution/track/` requires `permission_classes = [IsAuthenticated]`. The endpoint **cannot be called** until the user has a valid JWT, which requires a completed registration + login.
- By the time the JWT is issued, the `User` record is committed to the database.
- `has_prior_booking()` is evaluated at track time (not deferred). For a brand-new user, the Appointment table is empty, so the check returns `False`.
- The token creation uses `ProfileAttributionToken.objects.create(...)` or updates an existing token — both are atomic database operations.
- Idempotency: if `/attribution/track/` is called twice, the second call hits the `existing` branch (line 106-126 in views.py) and refreshes the window. It does not create a duplicate (the `unique_active_attribution_token` partial unique constraint prevents it).

### Residual Risk

| Risk | Severity |
|---|---|
| None identified | — |

---

## Scenario 5 — Provider Re-Registration Attack

**Status**: PARTIAL — accepted residual risk for MVP

### Evidence

- `has_prior_booking()` filters on `care_provider=provider` — the specific `CareProvider` record. A new CareProvider account has a new PK.
- No cross-account identity linking exists. Same person, new email, new account = clean slate.
- All historical clients of the old account would pass the prior booking check against the new account.

### Commercial Impact

Same as Scenario 2 calculation, but requires the provider to re-register (higher friction, more detectable).

### Residual Risk

| Risk | Severity |
|---|---|
| Provider re-registration bypasses all guardrails | **MEDIUM** |

### Remediation

- For MVP: accept risk, document it. Re-registration requires creating a new Stripe Connect account, new Certn verification, etc. — high friction.
- Post-MVP: add detection via shared phone number, licence number, or Stripe bank account fingerprint. Flag for manual review.

---

## Scenario 6 — Internal Navigation Attribution Bypass

**Status**: FAIL — **HIGH**

### Evidence

1. **No server-side Referer/Origin validation.** The `referer` field in the request body is client-supplied (line 36 of views.py: `referer = request.data.get('referer', '')`). It is stored but not validated or used for internal/external classification.

2. **The endpoint requires authentication** (`IsAuthenticated`), so unauthenticated actors cannot pre-seed tokens. This is good.

3. **Internal vs external enforcement is entirely frontend-side.** The frontend simply does not call `/attribution/track/` during internal navigation. However:
   - No frontend code was found that calls `/attribution/track/` at all (grep for `attribution/track` returned zero frontend hits). This means the frontend integration is either not yet built, or is handled via a different mechanism (e.g., URL parameter detection on page load that has not been implemented yet).
   - A browser console `fetch('/api/v1/attribution/track/', {method: 'POST', body: JSON.stringify({provider_id: 123})})` with valid auth cookies would succeed.

4. **No test exists** that verifies rejection of internal-context calls.

### Residual Risk

| Risk | Severity |
|---|---|
| Any authenticated user can call `/attribution/track/` from any context (Postman, browser console, extension) | **HIGH** |
| Frontend integration for calling `/attribution/track/` appears to be missing entirely | **HIGH** (feature incomplete) |

### Remediation

- **Minimum (MVP)**: Document the frontend-only enforcement as an accepted risk. Ensure the frontend integration is built to call `/attribution/track/` only on external link landing.
- **Post-MVP**: Add server-side validation — e.g., require a signed token in the external link URL that is validated server-side, rather than relying on the frontend to self-police.

---

## Scenario 7 — INELIGIBLE Status UX at Checkout

**Status**: PARTIAL

### Evidence

1. **The checkout endpoint** (`/api/v1/attribution/checkout-status/`) only returns discount info for `CONFIRMED` tokens (line 157-162 of views.py). An INELIGIBLE token is simply not found by this query, so the response is `{is_first_attributed_session: False, discount_percent: None}`.

2. **The client sees the standard fee.** There is no special INELIGIBLE message or error. The checkout flow behaves identically to a non-attributed booking. This is the correct design — INELIGIBLE should be invisible.

3. **The provider is NOT notified** that their attribution attempt was blocked. The only record is the `attribution.fraud` log (see Scenario 8 for issues with that).

4. **No provider dashboard visibility** into INELIGIBLE counts was found. There is no aggregate reporting endpoint.

5. **Information leakage**: The `/attribution/track/` response DOES return `{'attributed': False, 'reason': 'existing_relationship'}` or `{'reason': 'ineligible'}`. If the provider instructs clients to check their browser network tab, the reason is visible. However, this is a low-risk scenario.

6. **No frontend code** currently calls either `/attribution/track/` or `/attribution/checkout-status/`. The UX for both ELIGIBLE and INELIGIBLE paths appears unbuilt on the frontend.

### Residual Risk

| Risk | Severity |
|---|---|
| Frontend checkout integration not yet built — cannot verify end-to-end UX | **MEDIUM** |
| Response body reveals `reason: 'existing_relationship'` to the calling client | **LOW** |

### Remediation

- Build frontend integration to call `/attribution/checkout-status/` during checkout.
- Consider removing `reason` from the `/attribution/track/` response body (return only `attributed: false`).

---

## Scenario 8 — Fraud Logger Alerting and Operational Visibility

**Status**: FAIL — **CRITICAL**

### Evidence

1. **Logger configuration** in `settings.py` (lines 523-560):
   ```python
   LOGGING = {
       'handlers': {
           'console': { 'class': 'logging.StreamHandler' },
           'file': {
               'class': 'logging.handlers.RotatingFileHandler',
               'filename': os.path.join(BASE_DIR, "logger.logs"),
           }
       },
       'root': {
           'handlers': ['console', 'file'],
           'level': 'DEBUG',
       },
   }
   ```

2. **There is no dedicated `attribution.fraud` logger configuration.** The `fraud_logger = logging.getLogger('attribution.fraud')` in views.py inherits from the root logger. This means:
   - Output goes to `console` (stdout → Docker container stdout → ephemeral) and `file` (`logger.logs` in the project directory → ephemeral in Docker unless volume-mounted).
   - **No log aggregator** (Datadog, CloudWatch, Sentry) is configured.
   - **No alerting** is configured for per-provider INELIGIBLE spikes.

3. **INELIGIBLE events are NOT persisted to the database.** The `ProfileAttributionToken` status field is set to `INELIGIBLE`, which IS database-persisted. So the token record itself serves as a persistent audit trail. However:
   - There is no timestamp on when the INELIGIBLE determination was made (only `modified_at` which is auto-updated on any save).
   - There is no dedicated audit log table with referer, IP, user-agent, etc.

4. **No runbook** exists for incident response to coordinated gaming.

5. **No baseline** INELIGIBLE rate has been established.

### Residual Risk

| Risk | Severity |
|---|---|
| Fraud logs are container-ephemeral; no monitoring or alerting | **CRITICAL** |
| No spike detection for mass email campaigns | **HIGH** |
| No incident response runbook | **MEDIUM** |

### Remediation

- **Immediate**: The INELIGIBLE status IS persisted on `ProfileAttributionToken` records, so retrospective auditing is possible via Django ORM queries. This partially mitigates the logging gap.
- **Before shipping**: Add a dedicated `attribution.fraud` handler that routes to a persistent, monitored destination (Sentry, CloudWatch, or at minimum a volume-mounted log file).
- **Post-launch**: Create a scheduled query or management command that counts INELIGIBLE tokens per provider per day and alerts above threshold.

---

## Scenario 9 — Client Multi-Account Attack

**Status**: OUT OF SCOPE (documented)

### Evidence

- The fee reduction (15% -> 12%) benefits the **provider**, not the client. The client pays the same session rate regardless of attribution status.
- There is no client-facing discount or incentive to appear as a "new" client. The `first_session_discount` is provider-configured and optional.
- Platform controls that incidentally detect multi-accounting: Twilio Verify (phone number), Certn (identity check), Stripe (card fingerprint). These run during onboarding, before attribution is resolved.

### Residual Risk

| Risk | Severity |
|---|---|
| Multi-account client gaming | **LOW** — no direct client financial incentive |

### Remediation

None required for MVP. If provider-to-client kickback schemes emerge, revisit.

---

## Scenario 10 — INELIGIBLE Token Re-evaluation After Appointment Deletion

**Status**: PARTIAL

### Evidence

1. **INELIGIBLE is stored statically** on the `ProfileAttributionToken.status` field. It is NOT re-evaluated dynamically on subsequent calls (Guardrail 3 in views.py, lines 87-100, returns immediately if an INELIGIBLE token exists).

2. **No post-delete signal** on `Appointment` touches attribution records. The `manage_pages/signals.py` only handles `CareProvider`, `Slot`, and `ManagePages` signals. Deleting an appointment has no cascade effect on attribution tokens.

3. **Soft delete**: `BaseModel` has `is_active` but `has_prior_booking()` does not filter on `is_active`. Setting `is_active=False` on an appointment does NOT change the INELIGIBLE determination. The query remains `Appointment.objects.filter(care_provider=provider, client=client).exists()` — which matches regardless of `is_active`.

4. **No manual override** mechanism exists on `ProfileAttributionToken`. An admin would need to use the Django admin or a shell command to change the status.

5. **No cascade behavior**: deleting an appointment does not reverse fee adjustments on completed sessions.

### Residual Risk

| Risk | Severity |
|---|---|
| No admin override for disputed INELIGIBLE tokens | **MEDIUM** |
| Soft-deleted appointments still trigger INELIGIBLE (could be a feature or a bug depending on intent) | **LOW** (likely correct — deactivated appointments still prove a relationship) |

### Remediation

- Document that INELIGIBLE is immutable by design. This is the safer default.
- Add a Django admin action or management command to manually override a token status, with an audit trail field (e.g., `overridden_by`, `override_reason`, `override_at`).

---

## Summary of All Findings

| # | Scenario | Status | Severity | Key Gap |
|---|---|---|---|---|
| 1 | Mass email attack | PASS | HIGH | `UserRateThrottle` non-functional (no config) |
| 2 | Talk Now blind spot | FAIL | **CRITICAL** | `has_prior_booking()` does not query `TalkNow` table |
| 3 | New client false positive | PASS | LOW | No identity dedup (accepted) |
| 4 | Race condition | PASS | — | Auth requirement prevents race |
| 5 | Provider re-registration | PARTIAL | MEDIUM | No cross-account identity linking |
| 6 | Internal navigation bypass | FAIL | **HIGH** | No server-side internal/external enforcement |
| 7 | INELIGIBLE UX at checkout | PARTIAL | MEDIUM | Frontend integration not yet built |
| 8 | Fraud logger | FAIL | **CRITICAL** | Logs ephemeral, no alerting, no monitoring |
| 9 | Client multi-account | OUT OF SCOPE | LOW | No client incentive |
| 10 | Post-delete re-evaluation | PARTIAL | MEDIUM | No admin override, immutable by design |

---

## Recommended Action Items (Priority Order)

1. **CRITICAL — Talk Now gap (Scenario 2)**: Extend `has_prior_booking()` to also query the `TalkNow` model. This is the only active revenue-leakage vector that a provider can exploit with zero friction.

2. **CRITICAL — Fraud logger (Scenario 8)**: Configure `attribution.fraud` to route to a persistent, monitored destination before launch. The INELIGIBLE token records in the database provide partial coverage, but no alerting exists.

3. **HIGH — Rate throttle (Scenario 1)**: Add `DEFAULT_THROTTLE_RATES` to settings.py. Without this, the `UserRateThrottle` on the view is decorative only.

4. **HIGH — Internal/external enforcement (Scenario 6)**: At minimum, document the frontend-only enforcement. Ideally, implement a signed token in external links that is validated server-side.

5. **HIGH — Frontend integration (Scenarios 6, 7)**: No frontend code calls `/attribution/track/` or `/attribution/checkout-status/`. The backend guardrails exist but the end-to-end feature is incomplete.

6. **MEDIUM — Admin override (Scenario 10)**: Add a Django admin action for manual INELIGIBLE overrides with audit trail.

7. **MEDIUM — Provider re-registration (Scenario 5)**: Accept for MVP, create a follow-up ticket for post-launch detection.

---

## Files Reviewed

| File | Purpose |
|---|---|
| `Lumy-Backend/apps/attribution/views.py` | TrackAttributionView, AttributionCheckoutStatusView |
| `Lumy-Backend/apps/attribution/utils.py` | `has_prior_booking()`, `get_telehealth_fee()`, `get_checkout_discount()` |
| `Lumy-Backend/apps/attribution/models.py` | ProfileAttributionToken, ProviderClientFeeOverride, AttributionStatus |
| `Lumy-Backend/apps/attribution/urls.py` | URL routing |
| `Lumy-Backend/apps/attribution/tests/test_fraud_guardrails.py` | Existing test coverage |
| `Lumy-Backend/apps/talk_now/models.py` | TalkNow model (separate from Appointment) |
| `Lumy-Backend/apps/calendar_functionality/models.py` | Appointment model |
| `Lumy-Backend/apps/calendar_functionality/constants.py` | APPOINTMENT_STATUS choices |
| `Lumy-Backend/apps/calendar_functionality/enum.py` | PaymentStatus choices |
| `Lumy-Backend/apps/authentication/models.py` | BaseModel (is_active field) |
| `Lumy-Backend/apps/manage_pages/signals.py` | Only existing signals (no Appointment signals) |
| `Lumy-Backend/lumy_global/settings.py` | LOGGING config |
| `RG-Frontend/src/` (full search) | No frontend calls to attribution endpoints found |
