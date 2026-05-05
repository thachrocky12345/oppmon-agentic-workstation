# Audit Prompt: RGDEV-184 — Dynamic Platform Fee Calculation at Checkout

**Ticket scope:** Wire the attribution fee lookup into payment processing so attributed clients are
charged the correct reduced platform fee (12% telehealth instead of 15%). In-person sessions
always stay at 5%.

**Primary files under review:**
- `apps/stripe_integration/views.py` — `PayPalCapturePaymentAPIView` (lines 376-467) where fee branching occurs
- `apps/attribution/utils.py` — `get_telehealth_fee()` (lines 27-60), `confirm_attribution_if_eligible()` (lines 175-197)
- `apps/attribution/models.py` — `ProviderClientFeeOverride`, `ProfileAttributionToken`
- `lumy_global/settings.py` — `OTHER_PLATFORM_FEE_PERCENT`, `IN_PERSON_PLATFORM_FEE_PERCENT`, `ATTRIBUTED_TELEHEALTH_FEE_PERCENT`
- `apps/talk_now/views.py` — `TalkNowCheckout`, `_book_appointment_atomic`

---

## Audit Scenarios

### 1. Provider Payout Correctness — $100 Attributed Telehealth Session

**Scenario:** Client is attributed. Session rate is $100. Expected split: client pays $100, platform
takes $12, provider receives $88.

**What to verify:**
- In `PayPalCapturePaymentAPIView.post()`, confirm the `platform_fee` calculation is:
  `platform_fee = (Decimal('100.00') * Decimal('0.1200')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)` = `Decimal('12.00')`.
- Confirm that `capture_authorization()` in `apps/stripe_integration/utils.py` passes `platform_fee`
  to PayPal as the partner fee, meaning PayPal sends `$88.00` to the provider and `$12.00` to the
  platform (via the `platform_fees` field in PayPal's `/v2/payments/authorizations/{id}/capture`
  request body). Inspect `capture_authorization()` to verify this split is performed server-side
  at PayPal rather than being computed client-side.
- Confirm Stripe's equivalent: `PaymentIntentAPIView` does NOT call `get_telehealth_fee()` — it
  only creates the intent for the full `amount`. Check where the platform fee is deducted for
  Stripe payments. If there is no `application_fee_amount` in the `stripe.PaymentIntent.create()`
  call (line 58-66 of `views.py`), the Stripe path has no fee split at all and only PayPal
  enforces the split server-side. Document whether this is intentional.

**Expected outcome:** Math is correct. Payout and platform fee are enforced at PayPal's capture
layer, not computed client-side. Stripe path gap (if present) must be documented as a known risk.

---

### 2. In-Person Hard Rule — Attributed Client, In-Person Session

**Scenario:** Provider has an attributed client (active `ProviderClientFeeOverride` with
`fee_percent=0.12`). Client books an in-person session. Fee must be 5%, not 12%.

**What to verify in `PayPalCapturePaymentAPIView.post()`:**
- Line 427: `if appointment.format and appointment.format.name == "IN PERSON":` — confirm the
  guard uses `appointment.format.name` (not `appointment.format_id` or a string on appointment
  itself), and that "IN PERSON" is the exact canonical string stored in `FormatType.name`.
- Confirm that when `appointment.format` is `None` (format not set), the code falls through to
  `get_telehealth_fee()` rather than defaulting to in-person. This means a null `format` field is
  treated as telehealth — document whether that is the intended fallback.
- Confirm `settings.IN_PERSON_PLATFORM_FEE_PERCENT` is set to `0.05` in `.env.example` (current
  value is `0` — this is a misconfiguration that must be corrected before production).
- `get_telehealth_fee()` docstring explicitly warns callers to gate on format before calling it.
  Verify that ALL other call sites (not just `PayPalCapturePaymentAPIView`) also perform this gate.
  Search: `grep -n "get_telehealth_fee" apps/`.

**Expected outcome:** In-person sessions cannot receive the 12% attributed fee under any path.
The `format.name == "IN PERSON"` guard is the sole enforcement mechanism — there is no secondary
check inside `get_telehealth_fee()` itself.

---

### 3. Talk Now (On-Demand) Sessions — Fee Path Tracing

**Scenario:** Client has an active attribution with a provider. Client initiates a Talk Now
on-demand call. Does the attributed 12% fee apply?

**What to verify:**
- `TalkNowCheckout` (`apps/talk_now/views.py`, line 748) creates a Stripe Checkout Session.
  Confirm it does NOT call `get_telehealth_fee()`. The amount passed in the session is whatever
  the client submits; there is no fee-split logic in `TalkNowCheckout`.
- `_book_appointment_atomic()` (line 480) creates the `Appointment` and calls `_charge_payment()`
  which calls `charge_talknow_payment()`. `charge_talknow_payment()` uses `stripe.PaymentIntent`
  capture. Confirm there is NO `application_fee_amount` in the PaymentIntent.
- Talk Now payments go through **Stripe only** (not PayPal). The PayPal capture path (where
  `get_telehealth_fee()` is called) is never hit for Talk Now.
- **Finding to surface:** Talk Now sessions are currently NOT subject to dynamic fee calculation.
  The attributed 12% fee is only applied through `PayPalCapturePaymentAPIView`. If Talk Now
  sessions should also receive the reduced fee, a new code path is needed.
- Confirm whether Talk Now appointment records set `appointment.format` to anything. If format is
  set and format is not "IN PERSON", the appointment would technically be eligible for
  `get_telehealth_fee()` if a PayPal capture path were added in the future.

**Expected outcome:** Document that Talk Now sessions bypass `get_telehealth_fee()` entirely. This
is either intentional (Talk Now is treated as a flat fee product) or a gap. The BRD intent must
be confirmed by product.

---

### 4. Fee Displayed at Checkout vs Fee Charged — Race Condition

**Scenario:** Client sees a fee breakdown on the checkout page. Between page load and payment
capture, the fee lookup returns a different value.

**What to verify:**
- The PayPal flow: (1) `PayPalCreatePaymentAPIView` creates an AUTHORIZE order for the full
  session amount with no fee split. (2) The client approves at PayPal. (3)
  `PayPalCapturePaymentAPIView` later calls `get_telehealth_fee()` at capture time. The fee shown
  on the frontend checkout page is computed client-side or returned by a separate fee-preview
  endpoint — NOT locked at authorization time.
- Confirm whether a fee-preview API endpoint exists. Search: `grep -rn "fee_preview\|checkout_fee\|platform_fee" apps/`. If no preview endpoint exists, the frontend cannot reliably display the exact fee that will be charged.
- **Race condition:** If `ProviderClientFeeOverride.is_active` is set to `False` between checkout
  page load and payment capture, the displayed fee (12%) will differ from the charged fee (15%).
  This is not a security issue (the client pays less) but is a billing accuracy issue.
- JWT access tokens have a 1-day lifetime (`ACCESS_TOKEN_LIFETIME = timedelta(days=1)` in
  `settings.py`). Token expiry does not affect this race — the risk is data state change, not
  auth expiry.

**Expected outcome:** Confirm whether the platform has a fee-preview endpoint that the frontend
calls at checkout page load. If not, document the race condition risk and recommend locking the
fee tier at authorization time (store it in `paypal_auth_id` metadata or a separate
`AppointmentFeeSnapshot` model).

---

### 5. Finance Reconciliation — Fee Tier Queryability

**Scenario:** Finance team needs to pull a report showing how much revenue was collected at each
fee tier (standard 15%, attributed 12%, in-person 5%).

**What to verify:**
- `PayPalCapturePaymentAPIView` logs `fee_tier` to the Django application logger (lines 436-443)
  but does NOT persist it to the database. Check: does `Appointment` have a `fee_tier` field?
  (Answer from model inspection: No. `Appointment` has `paypal_status`, `amount_in_cents`,
  `payment_intent_id`, etc., but no `fee_tier` or `platform_fee_applied` column.)
- `booking_link/models.py` has an `Attribution` model with a `fee_tier` `DecimalField` that
  stores the fee as a decimal (e.g., `0.10`). Confirm this is populated for booking-link
  attribution checkouts (see `booking_link/views.py` line 672). Is it populated for profile
  attribution as well?
- The `ProviderClientFeeOverride` model stores `fee_percent` and `original_fee_percent` but no
  per-transaction record.
- **Gap:** There is no per-appointment fee tier record. Finance cannot produce a revenue report
  by fee tier without joining log files (which are ephemeral). Recommend adding
  `fee_tier_label = CharField` and `platform_fee_amount_cents = IntegerField` to `Appointment`,
  set at capture time.

**Query to demonstrate the gap:**
```python
# Currently IMPOSSIBLE — no fee_tier on Appointment:
Appointment.objects.values('fee_tier').annotate(
    total=Sum('amount_in_cents'),
    count=Count('id'),
)
```

**Expected outcome:** Fee tier is logged but not persisted per transaction. Finance reconciliation
requires a schema change. This is a P1 gap for a revenue-affecting feature.

---

### 6. ProviderClientFeeOverride Deactivated Mid-Session

**Scenario:** `ProviderClientFeeOverride` has `is_active=True` when the client loads the checkout
page. An admin sets `is_active=False` before the PayPal capture fires.

**What to verify:**
- `get_telehealth_fee()` queries `ProviderClientFeeOverride.objects.filter(..., is_active=True).first()`
  at the moment `PayPalCapturePaymentAPIView.post()` is called. This is a live DB query at capture
  time, not cached at checkout load.
- If `is_active` is set to `False` between checkout and capture, `get_telehealth_fee()` finds no
  override and returns `(standard_fee, 'standard')` → client gets charged 15% platform fee.
- The client saw 12% at checkout and is charged 15% — a billing discrepancy favoring the platform.
- There is no `select_for_update()` or locking on the fee lookup during capture (unlike
  `get_checkout_discount()` which uses `select_for_update()` to prevent double discount).
- **Mitigation:** The fee should be locked at authorization time and stored on the appointment
  record. At capture time, read the stored fee rather than re-querying.

**Expected outcome:** Mid-session deactivation currently produces a silent fee change. Document
as a known race condition. The fix is to persist the fee at PayPal authorization time.

---

### 7. First Booking vs Subsequent Bookings — Permanent Reduced Fee

**Scenario:** Client's first booking confirms attribution. All future telehealth sessions with the
same provider should be at 12%.

**What to verify:**
- `confirm_attribution_if_eligible()` (utils.py, line 175) sets `token.status = CONFIRMED` after
  the first payment capture. This does NOT automatically create a `ProviderClientFeeOverride`.
- Search the entire codebase for where `ProviderClientFeeOverride` is created:
  `grep -rn "ProviderClientFeeOverride.objects.create" apps/`
  Result: Only in test files (`test_models.py`). There is no production code path that creates a
  `ProviderClientFeeOverride` after attribution is confirmed.
- `get_telehealth_fee()` checks for an active `ProviderClientFeeOverride`. If it is never created
  by production code, the attributed fee (12%) is never actually applied in production, regardless
  of attribution confirmation.
- **Critical gap:** The mechanism to persist "this pair is permanently attributed" does not exist
  in production code. `confirm_attribution_if_eligible()` confirms the token but does not create
  the fee override. Either: (a) the fee override is created in a signal or post-capture hook not
  yet implemented, or (b) the BRD intends the override to be created manually by an admin.
- Check for a Django signal: `grep -rn "post_save.*ProviderClientFeeOverride\|ProviderClientFeeOverride.*signal" apps/`
- Check for a post-capture hook called after `capture_authorization()` in views.py.

**Expected outcome:** Confirm whether `ProviderClientFeeOverride` creation is wired up. If not,
the dynamic fee calculation code is present but will never return the 12% rate in production
because the override rows will not exist. This is the most critical correctness issue in RGDEV-184.

---

### 8. Error Handling for Finance Safety — DB Down at Capture Time

**Scenario:** PostgreSQL is unavailable when `PayPalCapturePaymentAPIView.post()` calls
`get_telehealth_fee()`. Should default to 15% (standard), not 12% (attributed).

**What to verify:**
- `get_telehealth_fee()` wraps the entire DB query in `try/except Exception` (lines 45-60 of
  `utils.py`). On any exception, it returns `(STANDARD_FEE, STANDARD_LABEL)` where
  `STANDARD_FEE = Decimal('0.1500')`.
- This is the correct safe default: failing open to 15% (standard) rather than 12% (attributed)
  means the platform never loses revenue due to a DB error.
- Verify that `STANDARD_FEE` is hardcoded as `Decimal('0.1500')` (line 19 of utils.py) and does
  NOT read from `settings.OTHER_PLATFORM_FEE_PERCENT` in the fallback path. This means a DB
  failure will always return 15%, even if `OTHER_PLATFORM_FEE_PERCENT` is set to a different
  value in `.env`. This is intentional and correct.
- Verify the exception is logged via `logger.exception()` (line 56 of utils.py) so a DB failure
  during fee lookup is visible in application logs.

**Expected outcome:** DB failure correctly falls back to standard rate. Revenue is protected.
Hardcoded fallback is safer than reading from settings at failure time.

---

### 9. Fee Tier Audit Trail — Dispute Resolution

**Scenario:** A dispute is raised 6 months after a session. Finance needs to determine what fee
tier was applied and why.

**What to verify:**
- `Appointment` model fields (from models.py): `payment_intent_id`, `paypal_auth_id`,
  `paypal_status`, `amount_in_cents`. There is NO `fee_tier`, `fee_percent_applied`, or
  `platform_fee_amount_cents` field.
- `PayPalCapturePaymentAPIView` logs `fee_tier` and `fee_pct` to Django's logger with
  `appointment_id` as context (lines 436-443). This log is the only record of what fee was applied
  to each transaction.
- If logs are rotated or lost, there is no database record of the fee tier. The `ProviderClientFeeOverride`
  record (if it exists) shows the current fee, not the historical fee that was active at capture time.
- `booking_link/models.py` `Attribution.fee_tier` only covers booking-link attribution, not profile
  attribution via `PayPalCapturePaymentAPIView`.
- **Gap:** For audit purposes, the fee tier applied at capture must be persisted on the appointment
  or payment record. Recommend: add `fee_tier_label`, `fee_pct_applied`, `platform_fee_cents` to
  `Appointment`. These should be set inside `PayPalCapturePaymentAPIView` before calling
  `capture_authorization()`.

**Expected outcome:** No database-level audit trail currently exists for the fee tier applied per
transaction. Log-based audit trail is insufficient for financial dispute resolution. Schema change
required.

---

### 10. Settings Consistency — Fee Constants in .env.example

**Scenario:** Developer sets up the backend from `.env.example`. All fee constants must be correct
type (Decimal) and non-zero.

**What to verify in `.env.example` (current values):**
```
OTHER_PLATFORM_FEE_PERCENT=0          # BUG: should be 0.15
IN_PERSON_PLATFORM_FEE_PERCENT=0      # BUG: should be 0.05
ATTRIBUTED_TELEHEALTH_FEE_PERCENT=0.12  # correct
ATTRIBUTION_WINDOW_DAYS=60              # correct
```
- `OTHER_PLATFORM_FEE_PERCENT=0` means a developer running from `.env.example` will compute a 0%
  platform fee on all standard telehealth sessions. This is a silent misconfiguration.
- `IN_PERSON_PLATFORM_FEE_PERCENT=0` means in-person sessions will also compute a 0% fee.
- `settings.py` reads `OTHER_PLATFORM_FEE_PERCENT` via `env("OTHER_PLATFORM_FEE_PERCENT")` with
  no default (line 622). If the variable is present but set to `"0"`, `get_telehealth_fee()`
  does: `Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')`. The
  `or '0.15'` guard only fires for falsy values. The string `"0"` is truthy, so it evaluates to
  `Decimal("0")` — a 0% fee. The `or` guard does NOT protect against a zero value.
- `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` is loaded in `settings.py` line 626 as:
  `Decimal(env('ATTRIBUTED_TELEHEALTH_FEE_PERCENT', default='0.12'))` — this is correct Decimal
  construction.
- `OTHER_PLATFORM_FEE_PERCENT` is loaded via bare `env("OTHER_PLATFORM_FEE_PERCENT")` (line 622)
  without `Decimal()` wrapping in settings.py. It is a raw string. Inside `get_telehealth_fee()`,
  it is wrapped: `Decimal(getattr(settings, ...) or '0.15')`. This works but the type is
  inconsistent with `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` which is pre-cast to Decimal in settings.

**Required fixes:**
1. `.env.example`: Set `OTHER_PLATFORM_FEE_PERCENT=0.15` and `IN_PERSON_PLATFORM_FEE_PERCENT=0.05`.
2. `settings.py`: Wrap `OTHER_PLATFORM_FEE_PERCENT` with `Decimal()` for consistency:
   `OTHER_PLATFORM_FEE_PERCENT = Decimal(env("OTHER_PLATFORM_FEE_PERCENT", default="0.15"))`.
3. Add a startup assertion or test that validates all three fee constants are non-zero and
   within the range `(0, 1)`.

**Expected outcome:** `.env.example` is safe to use for development without silently computing 0%
fees. All fee constants are consistently typed as `Decimal` in `settings.py`.

---

## Summary of Critical Findings

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| 7 | `ProviderClientFeeOverride` is never created by production code; attributed 12% fee cannot be applied | P0 | Implement post-capture hook to create override on first confirmed booking |
| 5 | Fee tier is not persisted on `Appointment`; finance cannot report by tier without log files | P1 | Add `fee_tier_label`, `platform_fee_cents` to `Appointment` |
| 9 | No database audit trail for fee applied per transaction | P1 | Add `fee_pct_applied` to `Appointment` |
| 3 | Talk Now sessions bypass `get_telehealth_fee()` entirely (Stripe only, no PayPal capture) | P1 | Confirm with product whether Talk Now should receive attributed fee |
| 10 | `.env.example` has `OTHER_PLATFORM_FEE_PERCENT=0` and `IN_PERSON_PLATFORM_FEE_PERCENT=0` | P1 | Fix `.env.example` values; add Decimal wrapping in settings |
| 4 | Fee displayed at checkout is not locked; mid-session deactivation can cause displayed/charged divergence | P2 | Store fee at PayPal authorization time |
| 6 | `ProviderClientFeeOverride.is_active=False` between checkout and capture silently switches to 15% | P2 | Lock fee at authorization; document known race |
| 1 | Stripe payment path has no `application_fee_amount`; only PayPal enforces the split server-side | P2 | Confirm Stripe path is out of scope or add equivalent split |
| 2 | `IN_PERSON_PLATFORM_FEE_PERCENT` relies on exact `"IN PERSON"` string match on `FormatType.name` | P2 | Add test asserting canonical format name; document null-format fallback behavior |
| 8 | DB failure correctly falls back to standard 15% rate | Pass | No action needed |
