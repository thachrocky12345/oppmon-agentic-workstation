# RGDEV-184 Data Model Audit Results

**Date:** 2026-03-14
**Auditor:** Claude (automated)
**Scope:** All fee calculation logic across `Lumy-Backend`
**Ticket:** RGDEV-184 -- Dynamic Platform Fee Calculation at Checkout

---

## Executive Summary

The audit identified **3 critical bugs**, **3 high-severity gaps**, **3 medium issues**, and **2 low-severity items**. The most severe finding -- that `is_active` filtering on `ProviderClientFeeOverride` was initially feared missing -- is actually a **false alarm**: `BaseModel` does provide `is_active`. However, the Stripe capture path in `cron.py`, Talk Now payments, and multiple `calendar_functionality` capture paths all bypass `get_telehealth_fee()` entirely, meaning the platform collects **zero fee** on those payment paths.

---

## Finding 1: Stripe Capture Path in cron.py Has NO Fee Calculation

**Severity: CRITICAL**

**Finding:** The Stripe capture loop in `capture_authorized_payments_job()` (lines 497-526 of `lumy_global/cron.py`) calls `stripe.PaymentIntent.capture(intent_id)` with no arguments -- no `application_fee_amount`, no `transfer_data`, no fee calculation of any kind. It does not call `get_telehealth_fee()` and does not apply the in-person gate.

**Evidence:**
```
# cron.py lines 500-503
captured_intent = stripe.PaymentIntent.capture(
    intent_id,
)
```

**Contrast with PayPal path** (same function, lines 438-461): PayPal path correctly applies format gate, calls `get_telehealth_fee()`, computes `platform_fee`, and passes it to `capture_authorization()`.

**Additional bug on line 524:** The log message has a format string mismatch:
```python
logger.info(
    "Successfully captured Stripe PaymentIntent %s for appt %s (fee: %d).",
    intent_id, appt.id
)
```
Three format placeholders (`%s`, `%s`, `%d`) but only two arguments. This will raise a `TypeError` at runtime, crashing the logging call (though the capture itself would have already succeeded).

**Risk:** Every Stripe-paid scheduled appointment captured via cron has **zero platform fee applied**. The platform receives nothing from these payments.

**Recommended Action:** Add fee calculation identical to the PayPal path: format gate, `get_telehealth_fee()` call, pass `application_fee_amount` to `stripe.PaymentIntent.capture()`. Fix the logger format string.

---

## Finding 2: Talk Now Payment Path Has NO Fee Calculation

**Severity: CRITICAL**

**Finding:** Neither `TalkNowCheckout` nor `charge_talknow_payment()` in `apps/talk_now/views.py` calls `get_telehealth_fee()` or reads any platform fee constant. The entire Talk Now payment flow -- Stripe Checkout Sessions, PaymentIntent capture, and SetupIntent charge -- applies **zero platform fee**.

**Evidence:**
- `_handle_payment_intent()` (line 133-152): Calls `stripe.PaymentIntent.capture(s_intent_id)` with no `application_fee_amount`.
- `_handle_setup_intent()` (line 155-196): Creates `stripe.PaymentIntent.create()` with no `application_fee_amount` or `transfer_data`.
- `TalkNowCheckout.post()` (line 773-903): Creates `stripe.checkout.Session` with `payment_intent_data` containing `capture_method: "manual"` but no `application_fee_amount` or `transfer_data`.

**Risk:** The platform collects no fee on any Talk Now session. All revenue from Talk Now goes entirely to the Stripe account with no platform split.

**Recommended Action:** Add fee calculation to the Talk Now checkout flow. Since Talk Now is inherently telehealth (video), the in-person gate is less critical but should still be implemented for safety.

---

## Finding 3: calendar_functionality/views.py Has Multiple Capture Paths Without get_telehealth_fee()

**Severity: CRITICAL**

**Finding:** There are at least **four** additional Stripe capture call sites in `apps/calendar_functionality/views.py` that bypass `get_telehealth_fee()`:

1. **Line 890:** `stripe.PaymentIntent.capture(payment_intent_id)` -- appointment booking with immediate capture (within 6 hours). Uses hardcoded `settings.OTHER_PLATFORM_FEE_PERCENT` via raw fee calculation (line 860), does NOT call `get_telehealth_fee()`, so attributed clients get standard rate instead of reduced rate. The `application_fee_amount` is calculated but the commented-out code shows it was **never passed** to Stripe (lines 874-876 are commented out).

2. **Line 1235:** `stripe.PaymentIntent.capture(new_appointment.payment_intent_id)` -- reschedule flow, Stripe branch. No fee calculation at all, no `application_fee_amount`.

3. **Lines 3274-3280:** `stripe.PaymentIntent.capture(appointment.payment_intent_id)` -- another capture path with `application_fee_amount` and `transfer_data` **commented out** (lines 3276-3279).

4. **verification/views.py line 961-975:** The verification checkout actually DOES pass `application_fee_amount` and `transfer_data` correctly. However, it uses `settings.OTHER_PLATFORM_FEE_PERCENT` directly instead of `get_telehealth_fee()`, so attributed clients get standard rate.

**Evidence:**
```
# calendar_functionality/views.py line 860 (uses hardcoded setting, not get_telehealth_fee)
pct = Decimal(str(settings.OTHER_PLATFORM_FEE_PERCENT))
```
```
# calendar_functionality/views.py lines 874-876 (fee calculated but NEVER PASSED to Stripe)
#     application_fee_amount=application_fee_amount,
# transfer_data={'destination': care_provider_profile.stripe_customer_id},
```

**Risk:** Platform fee is calculated in some paths but never actually applied to Stripe. In other paths, fee is not calculated at all. Attributed clients never get their reduced rate through any Stripe path.

**Recommended Action:** Centralize all fee calculation through `get_telehealth_fee()`. Uncomment and fix the `application_fee_amount`/`transfer_data` parameters in all Stripe capture calls.

---

## Finding 4: `is_active` Field on ProviderClientFeeOverride -- FALSE ALARM

**Severity: NONE (resolved)**

**Finding:** The initial concern that `ProviderClientFeeOverride` lacks `is_active` is **incorrect**. `BaseModel` in `apps/authentication/models.py` (line 53) defines:

```python
class BaseModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    modified_at = models.DateTimeField(auto_now=True, db_index=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True
```

`ProviderClientFeeOverride` inherits from `BaseModel` (line 97 of `apps/attribution/models.py`), so `is_active` is inherited.

**Migration evidence confirms:** `apps/attribution/migrations/0001_initial.py` line 24 includes `('is_active', models.BooleanField(default=True))` in the `ProviderClientFeeOverride` creation.

**Verdict:** `get_telehealth_fee()` filtering on `is_active=True` is correct and functional. New overrides default to `is_active=True`. Overrides can be soft-deleted by setting `is_active=False`.

**However:** The `unique_fee_override_per_pair` constraint (line 128-132 of `models.py`) is **unconditional** -- it does not have a `condition=Q(is_active=True)` partial index. This means once an override exists for a `(provider, client)` pair, you cannot create a new one even after deactivating the old one. You must update the existing row rather than create a new one. This is a design limitation but not a bug -- as long as the application layer handles it correctly by reactivating/updating rather than creating.

---

## Finding 5: ATTRIBUTED_TELEHEALTH_FEE_PERCENT Setting Is Unused

**Severity: MEDIUM**

**Finding:** `settings.py` defines `ATTRIBUTED_TELEHEALTH_FEE_PERCENT = Decimal(env('ATTRIBUTED_TELEHEALTH_FEE_PERCENT', default='0.12'))` (line 627), but this setting is **never read by any application code**. The only reference outside `settings.py` is a test assertion in `test_models.py` line 416 that checks it is a `Decimal`.

`get_telehealth_fee()` reads `override.fee_percent` directly from the DB row, not from this setting. There is no code that uses this setting to populate `fee_percent` when creating `ProviderClientFeeOverride` rows.

**Evidence:** Codebase-wide search for `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` returns only `settings.py` (definition) and `test_models.py` (type assertion).

**Risk:** Confusing dead configuration. Operators may change this setting expecting it to affect attributed fees, but it has no effect.

**Recommended Action:** Either (a) use it as the default `fee_percent` when creating new `ProviderClientFeeOverride` rows, or (b) remove it from `settings.py` with a comment explaining that fee percentages are stored per-override in the DB.

---

## Finding 6: Fee Tier Label Does Not Distinguish Attribution Source

**Severity: MEDIUM**

**Finding:** `get_telehealth_fee()` returns `"attributed"` as the label for all overrides, regardless of the `source` field (`profile` vs `booking_link`). The BRD specifies four distinct labels: `"in_person_standard"`, `"attributed_profile"`, `"attributed_booking_link"`, `"standard"`.

**Evidence:** `apps/attribution/utils.py` line 22: `ATTRIBUTED_LABEL = 'attributed'`. The `source` field on `ProviderClientFeeOverride` (line 115-119 of `models.py`) stores `AttributionSource.PROFILE` or `AttributionSource.BOOKING_LINK` and could provide the distinction.

**Risk:** Analytics and audit trails cannot distinguish between profile-attributed and booking-link-attributed sessions. The data is available but not surfaced.

**Recommended Action:** Modify `get_telehealth_fee()` to read `override.source` and return `f"attributed_{override.source}"` (yielding `"attributed_profile"` or `"attributed_booking_link"`).

---

## Finding 7: Float Arithmetic in PayPal Order Creation

**Severity: MEDIUM**

**Finding:** `PayPalCreatePaymentAPIView.post()` (lines 365-380 of `apps/stripe_integration/views.py`) constructs the PayPal order amount using `f"{float(amount):.2f}"`. The `amount` variable comes from `request.data.get("amount")` which is a string, converted through discount calculation as a `Decimal`, then back to string, then to `float` for formatting.

**Evidence:**
```python
# stripe_integration/views.py line 365
"value": f"{float(amount):.2f}"
```

This appears three times (lines 365, 374, 377) in the PayPal order payload.

**Risk:** Float conversion introduces IEEE 754 rounding. For most 2-decimal values this is safe, but edge cases like `amount="0.30"` could theoretically produce `0.29999...` before formatting. The `:.2f` format specifier mitigates this in practice, but using `Decimal` formatting would be strictly correct.

**Recommended Action:** Replace `f"{float(amount):.2f}"` with `str(Decimal(str(amount)).quantize(Decimal("0.01")))` for strict decimal safety.

---

## Finding 8: Stripe Fee Split Not Implemented Platform-Wide

**Severity: HIGH**

**Finding:** Across the entire codebase, Stripe `application_fee_amount` and `transfer_data` are:
- **Commented out** in `calendar_functionality/views.py` (lines 874-876, 3276-3279)
- **Active only** in `verification/views.py` (lines 970-973) for the verification checkout
- **Never used** in `cron.py` Stripe capture, `talk_now/views.py`, or `stripe_integration/views.py`

This means the platform currently has **no mechanism** to collect its fee from Stripe payments on standard appointments. The `PaymentIntentAPIView` (line 58-63) creates PaymentIntents without `transfer_data` or `application_fee_amount`.

**Evidence:** The commented-out code in `calendar_functionality/views.py` (line 700-702) shows that `application_fee_amount` and `transfer_data` were once planned but never activated:
```python
#         application_fee_amount= application_fee_amount,
#         transfer_data= {
#             'destination': care_provider_profile.stripe_customer_id,
#         },
```

**Risk:** The platform collects zero revenue from Stripe-based payments for standard appointment bookings. Only PayPal payments have working fee collection. Only verification checkout (a separate product) passes fees to Stripe.

**Recommended Action:** Enable `application_fee_amount` and `transfer_data` in all Stripe payment creation and capture paths. This requires confirming that providers have Stripe Connect accounts (see `care_provider.stripe_customer_id` and `StripeUser.stripe_customer_id`).

---

## Finding 9: Webhook Handler Exists in verification/views.py -- Separate Fee Path

**Severity: HIGH**

**Finding:** A Stripe webhook handler exists at `apps/verification/views.py` line 1021-1036 (`StripeWebhookView`). It processes `checkout.session.completed` events. This is a separate code path from the cron job. It does **not** perform any fee calculation -- it handles session completion for verification payments.

There is **no** Stripe webhook handler for standard appointment payments (`payment_intent.succeeded` or `payment_intent.captured`). The only mechanism for capturing standard Stripe appointment payments is the cron job in `cron.py`, which (per Finding 1) applies no fee.

**Risk:** If a Stripe PaymentIntent is captured outside the cron window (e.g., via a manual API call or Stripe Dashboard), there is no webhook to reconcile the payment status or apply fees.

---

## Finding 10: calendar_functionality/views.py Uses Hardcoded Settings Instead of get_telehealth_fee()

**Severity: HIGH**

**Finding:** The appointment booking flow in `calendar_functionality/views.py` (line 854-865) calculates fees using `settings.IN_PERSON_PLATFORM_FEE_PERCENT` and `settings.OTHER_PLATFORM_FEE_PERCENT` directly, rather than calling `get_telehealth_fee()`. This means attributed clients who should get 12% are charged the standard 15%.

**Evidence:**
```python
# calendar_functionality/views.py lines 858-860
if appointment.format and appointment.format.name == "IN PERSON":
    pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
else:
    pct = Decimal(str(settings.OTHER_PLATFORM_FEE_PERCENT))
```

Same pattern in `verification/views.py` lines 955-958.

**Risk:** Attribution fee overrides are never applied in the main booking flow or verification flow. All clients pay the standard rate through Stripe regardless of attribution status.

**Recommended Action:** Replace `Decimal(str(settings.OTHER_PLATFORM_FEE_PERCENT))` with `get_telehealth_fee(provider, client)` in all paths, maintaining the in-person gate.

---

## Finding 11: Idempotency Gaps in Capture Paths

**Severity: LOW**

**Finding:** The PayPal capture path in `cron.py` queries `paypal_status="authorized"` and sets it to `"captured"` after success. `CRONTAB_LOCK_JOBS = True` should prevent concurrent runs, but in multi-process deployments (e.g., multiple workers), there is no row-level lock (`select_for_update()`) protecting against double-capture.

The Stripe capture path queries `payment_status=PaymentStatus.PENDING` and sets to `PaymentStatus.COMPLETED`. Same risk. Additionally, `stripe.PaymentIntent.capture()` is idempotent (capturing an already-captured intent is a no-op in Stripe), so the Stripe side is safe, but the DB update could race.

The `PaymentIntentAPIView` correctly uses `idempotency_key=f"pi_{appointment_id}_{user.id}"` for creation, but no idempotency key is used for capture operations.

**Risk:** Low in practice due to `CRONTAB_LOCK_JOBS` and Stripe's built-in idempotency, but not fully protected in horizontal scaling scenarios.

---

## Finding 12: to_minor_units() Does Not Handle Non-2-Decimal Currencies

**Severity: LOW**

**Finding:** `to_minor_units()` in `apps/talk_now/views.py` (line 51-56) always multiplies by 100, which is correct for USD/EUR/GBP but incorrect for JPY (0 decimals, should multiply by 1) or BHD/TND (3 decimals, should multiply by 1000).

**Evidence:**
```python
def to_minor_units(amount_decimal):
    return int((amount_decimal * 100).to_integral_value())
```

The code comment acknowledges this: "Extend if you need 0/3-decimal currencies (e.g., JPY/TND)."

**Risk:** Low -- the platform likely only operates in USD currently. Would become a bug if multi-currency support is expanded.

---

## Gap Matrix: Payment Path Coverage

| Payment Path | Location | Fee Calculated? | Uses get_telehealth_fee()? | Fee Passed to Gateway? | Severity |
|---|---|---|---|---|---|
| PayPal manual capture | stripe_integration/views.py:455-462 | YES | YES | YES (capture_authorization) | OK |
| PayPal scheduled capture | cron.py:438-461 | YES | YES | YES (capture_authorization) | OK |
| Stripe scheduled capture | cron.py:497-526 | **NO** | **NO** | **NO** | **CRITICAL** |
| Stripe booking (immediate) | calendar_functionality/views.py:854-890 | Calculated but... | **NO** (uses settings) | **NO** (commented out) | **CRITICAL** |
| Stripe reschedule | calendar_functionality/views.py:1233-1237 | **NO** | **NO** | **NO** | **CRITICAL** |
| Stripe manual capture view | calendar_functionality/views.py:3274-3280 | **NO** | **NO** | **NO** (commented out) | **CRITICAL** |
| Talk Now Checkout | talk_now/views.py:773-903 | **NO** | **NO** | **NO** | **CRITICAL** |
| Talk Now PI capture | talk_now/views.py:133-152 | **NO** | **NO** | **NO** | **CRITICAL** |
| Talk Now SetupIntent charge | talk_now/views.py:155-196 | **NO** | **NO** | **NO** | **CRITICAL** |
| Verification checkout | verification/views.py:950-975 | YES | **NO** (uses settings) | YES (application_fee_amount) | **HIGH** |

---

## Deliverable Summary

### 1. is_active Verdict
**BaseModel DOES provide `is_active`** (default=True). The `get_telehealth_fee()` query is correct and functional. The migration confirms the field exists in the database. The unique constraint is unconditional (design limitation, not bug).

### 2. Fee Tier Label Gap
`"attributed"` does NOT satisfy the BRD requirement for four distinct labels. The `source` field on `ProviderClientFeeOverride` contains the data needed to return `"attributed_profile"` or `"attributed_booking_link"`, but `get_telehealth_fee()` does not read it.

### 3. Circular Import Verdict
**No circular import exists.** `apps/attribution` does not import from `apps/stripe_integration`. The dependency is one-directional: `stripe_integration` -> `attribution`. `cron.py` imports from both but is not imported by either at module level.

### 4. Stripe Fee Split Gap
The platform currently has **no working Stripe Connect fee split** for standard appointments. `application_fee_amount` and `transfer_data` are commented out in all standard appointment paths. Only the verification checkout (a separate product) passes fees to Stripe. PayPal is the only payment method with working platform fee collection for standard appointments.

### 5. ATTRIBUTED_TELEHEALTH_FEE_PERCENT
Defined in settings but **never used** by any application code. Dead configuration.

---

## Recommended Fixes (Ranked by Risk)

| Priority | Fix | Files | Effort |
|---|---|---|---|
| P0 | Add fee calculation to Stripe capture in cron.py (format gate + get_telehealth_fee + application_fee_amount) | lumy_global/cron.py:497-526 | Small |
| P0 | Fix logger format string bug in cron.py line 524 (3 placeholders, 2 args) | lumy_global/cron.py:524 | Trivial |
| P0 | Enable application_fee_amount + transfer_data in calendar_functionality booking flow | apps/calendar_functionality/views.py:874-876 | Medium |
| P0 | Enable application_fee_amount + transfer_data in calendar_functionality capture views | apps/calendar_functionality/views.py:3276-3279 | Medium |
| P0 | Add fee calculation to reschedule capture path | apps/calendar_functionality/views.py:1235 | Small |
| P1 | Add fee calculation to Talk Now checkout and charge paths | apps/talk_now/views.py | Medium |
| P1 | Replace hardcoded settings with get_telehealth_fee() in calendar_functionality and verification | Multiple files | Medium |
| P2 | Update get_telehealth_fee() to return source-specific labels | apps/attribution/utils.py:52 | Trivial |
| P2 | Replace float(amount) with Decimal formatting in PayPal order creation | apps/stripe_integration/views.py:365,374,377 | Trivial |
| P2 | Either use or remove ATTRIBUTED_TELEHEALTH_FEE_PERCENT from settings | lumy_global/settings.py:627 | Trivial |
| P3 | Make unique_fee_override_per_pair a partial index with condition=Q(is_active=True) | apps/attribution/models.py:128-132 | Small |
| P3 | Add select_for_update() to cron capture queries for horizontal scaling safety | lumy_global/cron.py:392-409 | Small |
