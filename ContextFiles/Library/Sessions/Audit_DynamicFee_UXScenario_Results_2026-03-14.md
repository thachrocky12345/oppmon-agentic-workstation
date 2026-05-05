# RGDEV-184 Audit Results: Dynamic Platform Fee Calculation at Checkout

**Date:** 2026-03-14
**Auditor:** Claude (automated)
**Scope:** UX / scenario / commercial audit of dynamic fee calculation paths
**Branch audited:** `docker-dev-v2` (primary working tree at `C:\Projects\ReallyGlobal\Lumy-Backend`)

---

## Executive Summary

The dynamic platform fee feature (RGDEV-184) has critical implementation gaps that prevent the attributed 12% fee from ever being applied in production. The fee calculation code (`get_telehealth_fee`) is correctly written and tested, but the upstream wiring required to create the `ProviderClientFeeOverride` record after attribution confirmation does not exist. Additionally, `.env.example` ships with zero-value fee constants that silently eliminate all platform revenue in development, and there is a third payment path (`calendar_functionality/views.py`) that bypasses `get_telehealth_fee` entirely and uses raw `settings.OTHER_PLATFORM_FEE_PERCENT` instead.

**Revenue impact:** All sessions currently charge the standard fee (or 0% if running from `.env.example` defaults). The attributed 12% tier is dead code. Talk Now sessions have no fee split at all.

---

## Finding Summary

| # | Finding | Severity | Commercial Impact |
|---|---------|----------|-------------------|
| F1 | `ProviderClientFeeOverride` never created by production code | **P0 / CRITICAL** | 12% attributed fee is dead code; all sessions charged at standard rate |
| F2 | `.env.example` fee values are `0`; `or '0.15'` guard does not catch `"0"` | **P0 / CRITICAL** | 0% platform fee in all dev/staging environments using `.env.example` |
| F3 | `confirm_attribution_if_eligible()` not in main worktree | **P0 / CRITICAL** | Attribution confirmation function exists only in a worktree branch |
| F4 | `calendar_functionality/views.py` capture path bypasses `get_telehealth_fee()` | **P1 / HIGH** | Third payment path uses raw `settings.OTHER_PLATFORM_FEE_PERCENT`, ignoring attribution |
| F5 | Fee tier not persisted on `Appointment` model | **P1 / HIGH** | Finance cannot report revenue by fee tier; no audit trail |
| F6 | Talk Now sessions bypass dynamic fee entirely | **P1 / HIGH** | Talk Now uses Stripe only, no fee split, no `application_fee_amount` |
| F7 | Stripe `PaymentIntentAPIView` has no `application_fee_amount` | **P1 / HIGH** | Stripe payment path collects full amount with no platform fee split |
| F8 | No fee-preview API endpoint | **P2 / MEDIUM** | Frontend cannot display authoritative fee at checkout |
| F9 | Race condition: fee re-queried at capture time, not locked at authorization | **P2 / MEDIUM** | Mid-session `is_active=False` silently changes charged fee |
| F10 | `IN_PERSON_PLATFORM_FEE_PERCENT=0` in `.env.example` | **P2 / MEDIUM** | In-person sessions compute 0% fee in dev |
| F11 | `OTHER_PLATFORM_FEE_PERCENT` stored as raw string in settings, not `Decimal` | **P3 / LOW** | Type inconsistency with `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` |
| F12 | DB failure fallback correctly returns standard 15% | **PASS** | Revenue protected on error |

---

## Detailed Findings

### F1 -- `ProviderClientFeeOverride` Never Created (P0 / CRITICAL)

**Evidence:**
- `ProviderClientFeeOverride.objects.create` appears ONLY in test files:
  - `apps/attribution/tests/test_models.py` (lines 141, 147, 201, 218)
- Zero production code paths create this record.
- `confirm_attribution_if_eligible()` (found only in worktree `agent-ad3fbd38/apps/attribution/utils.py:175`) sets `token.status = CONFIRMED` but does NOT create a `ProviderClientFeeOverride`.
- `get_telehealth_fee()` queries `ProviderClientFeeOverride.objects.filter(provider=provider, client=client, is_active=True).first()` -- this will always return `None` because the row is never created.

**Impact:**
- The attributed 12% fee path is unreachable in production.
- `get_telehealth_fee()` always falls through to `standard = Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')`.
- Every attributed session is charged at the standard rate (15%).
- Providers who expected reduced fees for attributed clients are overcharged.

**Missing piece:** After `confirm_attribution_if_eligible()` confirms a token, it must also call:
```python
ProviderClientFeeOverride.objects.get_or_create(
    provider=appointment.care_provider,
    client=appointment.client,
    defaults={
        'fee_percent': settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT,
        'source': token.source,
        'original_fee_percent': Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15'),
    },
)
```

**No Django signals exist** for attribution models (grep returned zero results for `post_save.*attribution` or `attribution.*signal`).

---

### F2 -- `.env.example` Fee Values Are `0` (P0 / CRITICAL)

**Evidence:**
- `.env.example` line 117-118:
  ```
  OTHER_PLATFORM_FEE_PERCENT=0
  IN_PERSON_PLATFORM_FEE_PERCENT=0
  ```
- `settings.py` line 622: `OTHER_PLATFORM_FEE_PERCENT=env("OTHER_PLATFORM_FEE_PERCENT")` -- raw string, no default.
- `get_telehealth_fee()` line 53: `standard = Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')`
  - The `or '0.15'` guard only fires for **falsy** values (empty string, `None`).
  - The string `"0"` is **truthy** in Python, so `Decimal("0")` is returned.
  - Result: **0% platform fee** on all standard telehealth sessions.

**Impact:**
- Any developer or staging environment running from `.env.example` will compute a **zero platform fee**.
- PayPal `capture_authorization()` is called with `platform_fee=Decimal("0.00")`.
- The platform collects **$0** revenue on every session.
- This is a silent misconfiguration -- no error, no warning, no assertion.

**Correct values:**
```
OTHER_PLATFORM_FEE_PERCENT=0.15
IN_PERSON_PLATFORM_FEE_PERCENT=0.05
```

---

### F3 -- `confirm_attribution_if_eligible()` Not in Main Worktree (P0 / CRITICAL)

**Evidence:**
- The function exists ONLY in `.claude/worktrees/agent-ad3fbd38/apps/attribution/utils.py:175`.
- The main worktree's `apps/attribution/utils.py` ends at line 180 with `create_attribution_token()`.
- No import or call to `confirm_attribution_if_eligible` appears in the main worktree codebase.

**Impact:**
- Even if someone were to call `confirm_attribution_if_eligible()`, the function does not exist in the production branch.
- The entire attribution confirmation flow is incomplete.

---

### F4 -- `calendar_functionality/views.py` Capture Path Bypasses `get_telehealth_fee()` (P1 / HIGH)

**Evidence:**
- `apps/calendar_functionality/views.py` lines 794-814 contain a PayPal capture path that computes the fee directly:
  ```python
  if appointment.format and appointment.format.name == "IN PERSON":
      pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
  else:
      pct = Decimal(str(settings.OTHER_PLATFORM_FEE_PERCENT))
  ```
- This path uses `settings.OTHER_PLATFORM_FEE_PERCENT` directly instead of calling `get_telehealth_fee()`.
- Attribution overrides are completely ignored on this path.

**Impact:**
- Sessions captured via this code path will never receive the attributed 12% fee, even if `ProviderClientFeeOverride` rows existed.
- Three separate capture paths exist with inconsistent fee logic:
  1. `PayPalCapturePaymentAPIView` -- calls `get_telehealth_fee()` (correct)
  2. `capture_authorized_payments_job` (cron.py) -- calls `get_telehealth_fee()` (correct)
  3. `calendar_functionality/views.py` -- uses raw settings (broken)

**Recommendation:** Refactor all three paths to call `get_telehealth_fee()` for consistency.

---

### F5 -- Fee Tier Not Persisted on `Appointment` Model (P1 / HIGH)

**Evidence:**
- `Appointment` model (`apps/calendar_functionality/models.py:79-133`) has fields: `payment_intent_id`, `payment_method_id`, `amount_in_cents`, `currency`, `payment_status`, `paypal_order_id`, `paypal_auth_id`, `paypal_status`.
- **No `fee_tier`, `fee_pct_applied`, or `platform_fee_amount_cents` field exists.**
- Fee tier is logged via `logger.info()` in `PayPalCapturePaymentAPIView` (line 464) and `cron.py` (line 448), but logs are ephemeral.
- `BookingAttribution` model (`booking_link/models.py:146`) has a `fee_tier` DecimalField, but this only covers booking-link attribution, not profile attribution via PayPal capture.

**Impact:**
- Finance cannot produce a revenue report by fee tier.
- Dispute resolution has no database record of what fee was applied to a specific transaction.
- The only audit trail is application logs, which are rotated and ephemeral.

**Query that is currently impossible:**
```python
Appointment.objects.values('fee_tier').annotate(
    total=Sum('amount_in_cents'),
    count=Count('id'),
)
```

**Recommendation:** Add to `Appointment`:
- `fee_tier_label = CharField(max_length=30, blank=True, default='')`
- `fee_pct_applied = DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)`
- `platform_fee_cents = IntegerField(null=True, blank=True)`

Set these at capture time before calling `capture_authorization()`.

---

### F6 -- Talk Now Sessions Bypass Dynamic Fee Entirely (P1 / HIGH)

**Evidence:**
- `TalkNowCheckout` (`apps/talk_now/views.py:748`) creates a Stripe Checkout Session. No call to `get_telehealth_fee()`.
- `charge_talknow_payment()` (`apps/talk_now/views.py:200`) captures via `stripe.PaymentIntent.capture()` (line 139) with **no `application_fee_amount`**.
- Talk Now uses **Stripe only** -- never hits the PayPal capture path where `get_telehealth_fee()` is called.
- `_book_appointment_atomic()` (line 480) creates the Appointment with `format_id=slots_details["format_id"]`, so a format is set, but the fee split is never computed.

**Impact:**
- Talk Now sessions generate **zero platform revenue** through fee splits.
- If a client has an active attribution with a provider, the attributed 12% fee is not applied to Talk Now sessions.
- This may be intentional (Talk Now as a flat-fee product), but must be confirmed by product.

---

### F7 -- Stripe `PaymentIntentAPIView` Has No `application_fee_amount` (P1 / HIGH)

**Evidence:**
- `PaymentIntentAPIView.post()` (`apps/stripe_integration/views.py:58-63`):
  ```python
  payment_intent = stripe.PaymentIntent.create(
      amount=amount,
      currency=currency,
      customer=user_profile.stripe_customer_id,
      idempotency_key=f"pi_{appointment_id}_{user.id}",
  )
  ```
- No `application_fee_amount` parameter.
- No call to `get_telehealth_fee()`.
- `application_fee_amount` usage in calendar_functionality/views.py is mostly **commented out** (lines 690, 700, 875, 3276).

**Impact:**
- Stripe-based payments have no server-side fee split at all.
- Only PayPal enforce the platform fee via `capture_authorization()` with `platform_fees`.
- Stripe payments collect the full amount to the connected account with no platform take.

**Scope clarification needed:** Is Stripe used for regular session payments, or only for Talk Now? If Stripe handles any scheduled sessions, the platform loses 100% of its fee on those transactions.

---

### F8 -- No Fee-Preview API Endpoint (P2 / MEDIUM)

**Evidence:**
- Searched for `fee_preview`, `checkout_fee`, and `platform_fee` across all apps.
- No dedicated fee-preview endpoint exists.
- The fee is computed at PayPal capture time (`PayPalCapturePaymentAPIView.post()`), not at checkout page load.
- The frontend has no way to request the authoritative fee that will be charged.

**Impact:**
- The checkout page cannot display a reliable fee breakdown.
- Any fee displayed client-side may diverge from what is actually charged at capture.

---

### F9 -- Race Condition: Fee Not Locked at Authorization (P2 / MEDIUM)

**Evidence:**
- `PayPalCreatePaymentAPIView.post()` creates an AUTHORIZE order with no fee information attached.
- `PayPalCapturePaymentAPIView.post()` re-queries `get_telehealth_fee()` at capture time via a live DB query.
- If `ProviderClientFeeOverride.is_active` is set to `False` between authorization and capture, the fee silently changes from 12% to 15%.
- No `select_for_update()` on the fee lookup during capture (unlike `get_checkout_discount()` which does use `select_for_update()`).

**Impact:**
- Billing discrepancy: client sees 12% at checkout, charged 15%.
- Favors the platform (overcharge), which is a trust and compliance risk.

**Mitigation:** Lock fee at authorization time by storing it on the appointment record or in PayPal order metadata.

---

### F10 -- `IN_PERSON_PLATFORM_FEE_PERCENT=0` in `.env.example` (P2 / MEDIUM)

**Evidence:**
- `.env.example` line 118: `IN_PERSON_PLATFORM_FEE_PERCENT=0`
- Used in `PayPalCapturePaymentAPIView` (line 456): `pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))`
- Results in `Decimal("0")` -- 0% platform fee for all in-person sessions.

**Impact:** Same class of bug as F2, but limited to in-person sessions. Should be `0.05`.

---

### F11 -- `OTHER_PLATFORM_FEE_PERCENT` Type Inconsistency (P3 / LOW)

**Evidence:**
- `settings.py` line 622: `OTHER_PLATFORM_FEE_PERCENT=env("OTHER_PLATFORM_FEE_PERCENT")` -- stored as a raw string.
- `settings.py` line 626: `ATTRIBUTED_TELEHEALTH_FEE_PERCENT = Decimal(env(...))` -- pre-cast to Decimal.
- `get_telehealth_fee()` compensates by wrapping: `Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')`.
- `calendar_functionality/views.py` uses `Decimal(str(settings.OTHER_PLATFORM_FEE_PERCENT))` -- also compensates.

**Impact:** Fragile but currently functional. New call sites may forget to wrap with `Decimal()`.

**Recommendation:** Cast in `settings.py`:
```python
OTHER_PLATFORM_FEE_PERCENT = Decimal(env("OTHER_PLATFORM_FEE_PERCENT", default="0.15"))
IN_PERSON_PLATFORM_FEE_PERCENT = Decimal(env("IN_PERSON_PLATFORM_FEE_PERCENT", default="0.05"))
```

---

### F12 -- DB Failure Fallback (PASS)

**Evidence:**
- `get_telehealth_fee()` lines 55-60: `except Exception` returns `(STANDARD_FEE, STANDARD_LABEL)` where `STANDARD_FEE = Decimal('0.1500')`.
- Hardcoded fallback, does NOT read from `settings.OTHER_PLATFORM_FEE_PERCENT`.
- Exception logged via `logger.exception()`.

**Assessment:** Correct. Revenue is protected on DB failure. The hardcoded `Decimal('0.1500')` is intentionally independent of the settings value, preventing a cascading configuration failure.

---

## Call Sites for `get_telehealth_fee()` -- Completeness Check

| Call Site | File | In-Person Guard? | Status |
|-----------|------|-------------------|--------|
| `PayPalCapturePaymentAPIView.post()` | `stripe_integration/views.py:459` | Yes (line 455) | Correct |
| `capture_authorized_payments_job()` | `lumy_global/cron.py:443` | Yes (line 439) | Correct |
| `calendar_functionality/views.py:802` | `calendar_functionality/views.py` | N/A -- does not call `get_telehealth_fee()` | **BROKEN** -- uses raw settings |
| Talk Now paths | `talk_now/views.py` | N/A -- no fee logic | **MISSING** |
| `PaymentIntentAPIView` | `stripe_integration/views.py:58` | N/A -- no fee logic | **MISSING** |

---

## Prioritized Remediation Plan

### Phase 1 -- Revenue-Critical (P0)

1. **Fix `.env.example`:** Set `OTHER_PLATFORM_FEE_PERCENT=0.15` and `IN_PERSON_PLATFORM_FEE_PERCENT=0.05`.
2. **Wire `ProviderClientFeeOverride` creation** into `confirm_attribution_if_eligible()` after token confirmation.
3. **Merge `confirm_attribution_if_eligible()`** from worktree `agent-ad3fbd38` into the main branch.
4. **Call `confirm_attribution_if_eligible()`** in `PayPalCapturePaymentAPIView.post()` after successful capture.
5. **Add startup validation** (Django `AppConfig.ready()` or system check) asserting all fee constants are in range `(0, 1)`.

### Phase 2 -- Fee Consistency (P1)

6. **Refactor `calendar_functionality/views.py`** capture path to call `get_telehealth_fee()` instead of raw `settings.OTHER_PLATFORM_FEE_PERCENT`.
7. **Add `fee_tier_label`, `fee_pct_applied`, `platform_fee_cents`** to `Appointment` model. Populate at capture time.
8. **Decide Talk Now fee policy** with product. If Talk Now should have attribution fees, add `application_fee_amount` to the Stripe PaymentIntent or create a parallel fee-split mechanism.
9. **Cast `OTHER_PLATFORM_FEE_PERCENT` and `IN_PERSON_PLATFORM_FEE_PERCENT`** to `Decimal` in `settings.py`.

### Phase 3 -- Robustness (P2)

10. **Lock fee at authorization time:** Store fee tier on appointment or in PayPal order metadata at `PayPalCreatePaymentAPIView` time. Read stored fee at capture time instead of re-querying.
11. **Add fee-preview endpoint** so the frontend can display the authoritative fee.
12. **Add `select_for_update()` to fee lookup** during capture for consistency with `get_checkout_discount()`.

---

## Files Reviewed

| File | Path |
|------|------|
| Audit prompt | `ContextFiles/Library/Prompts/Audit_DynamicFee_UXScenario_Prompt.md` |
| Fee utilities | `apps/attribution/utils.py` |
| Attribution models | `apps/attribution/models.py` |
| Stripe/PayPal views | `apps/stripe_integration/views.py` |
| PayPal utils | `apps/stripe_integration/utils.py` |
| Talk Now views | `apps/talk_now/views.py` |
| Calendar models | `apps/calendar_functionality/models.py` |
| Calendar views (capture path) | `apps/calendar_functionality/views.py` (lines 790-814) |
| Booking link models | `apps/booking_link/models.py` |
| Cron capture job | `lumy_global/cron.py` (lines 420-480) |
| Settings | `lumy_global/settings.py` |
| Environment template | `.env.example` |
| Worktree utils | `.claude/worktrees/agent-ad3fbd38/apps/attribution/utils.py` |
| Fee calculation tests | `apps/attribution/tests/test_fee_calculation.py` |
| Attribution model tests | `apps/attribution/tests/test_models.py` |
