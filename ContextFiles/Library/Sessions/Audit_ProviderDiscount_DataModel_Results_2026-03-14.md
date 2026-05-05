# Audit Results: RGDEV-186 — Provider-Funded Client Discount, Checkout Logic

**Date**: 2026-03-14
**Auditor**: Claude (automated)
**Scope**: Data model correctness, race conditions, payment integration gaps, security, financial auditability

---

## Summary of Findings

| # | Issue | Severity | Verdict |
|---|---|---|---|
| 1 | Discount not applied on Stripe path | **CRITICAL** | `get_checkout_discount()` is called ONLY in `PayPalCreatePaymentAPIView` (line 327). The Stripe `PaymentIntentAPIView` takes `amount` directly from `request.data` with zero server-side discount logic. |
| 2 | Race condition (double-discount) | LOW | `select_for_update()` + `transaction.atomic()` correctly prevents concurrent double-application. No concurrent test exists but the code is sound. |
| 3 | Flag set at order creation, not payment capture | **CRITICAL** | `get_checkout_discount()` marks `first_session_discount_applied=True` when called at PayPal order creation (line 327 of `stripe_integration/views.py`). If the buyer never approves or payment fails, the flag is burned. |
| 4 | No cancellation/refund reset of flag | **HIGH** | Cancellation handler (`calendar_functionality/views.py:1422`) sets `is_status="CANCELLED"` but never resets `first_session_discount_applied`. No refund handler touches attribution. |
| 5 | Integer-to-Decimal conversion | LOW | Correct. `Decimal(int) / Decimal('100')` is exact. No float risk. |
| 6 | Non-attributed clients can self-attribute | **MEDIUM** | Any authenticated client can POST to `/api/v1/attribution/track/` with any `provider_id` to create a PENDING token. Only guardrail is `has_prior_booking`. No referrer validation enforced. |
| 7 | checkout-status endpoint scoping | **MEDIUM** | Endpoint EXISTS and is correctly scoped to `request.user.client`. But filters only `status=CONFIRMED`, while `get_checkout_discount()` also accepts `PENDING` tokens — status mismatch. |
| 8 | Stripe vs PayPal discount coverage | **CRITICAL** | PayPal path applies discount server-side. Stripe path does NOT. Complete asymmetry. |
| 9 | Discount amount not persisted | **HIGH** | No `discount_amount` field on any model. The computed value is logged but not stored. Finance reconciliation impossible. |
| 10 | PayPal endpoints unauthenticated | **CRITICAL** | `PayPalCreatePaymentAPIView` (line 291-292) has `authentication_classes` and `permission_classes` commented out. `PayPalCapturePaymentAPIView` (line 404) has neither defined. Both are fully unauthenticated. |

---

## Detailed Findings

### Issue 1 — Discount Not Applied on Stripe Path

**Severity: CRITICAL**

**Evidence**:
- `apps/stripe_integration/views.py:15` — `get_checkout_discount` is imported
- `apps/stripe_integration/views.py:58-63` — `PaymentIntentAPIView.post` takes `amount = request.data.get('amount')` and passes it directly to `stripe.PaymentIntent.create(amount=amount, ...)` with no discount computation
- `apps/stripe_integration/views.py:327` — `get_checkout_discount()` IS called, but only inside `PayPalCreatePaymentAPIView.post` (lines 320-347)

**Impact**: For Stripe payments, the discount is entirely frontend-controlled. A client can submit any `amount` value. There is no server-side enforcement that the discounted amount matches the provider's rate minus the attribution discount.

**Call sites for `get_checkout_discount()` across entire codebase** (excluding worktrees and tests):
1. `apps/stripe_integration/views.py:327` — PayPal order creation only
2. `apps/attribution/utils.py:63` — function definition

The function is imported at `stripe_integration/views.py:15` but never invoked in any Stripe payment view.

---

### Issue 2 — Race Condition (Double-Discount)

**Severity: LOW**

**Evidence** (`apps/attribution/utils.py:77-111`):
```python
with transaction.atomic():
    token = (
        ProfileAttributionToken.objects
        .select_for_update()
        .filter(...)
        .order_by('-created_at')
        .first()
    )
    # ... check + set flag + save within same atomic block
```

**Verdict**: The `select_for_update()` within `transaction.atomic()` is correctly scoped. Both the read and the write (`token.save()`) occur within the same atomic block. No nested savepoints or premature releases.

**Remaining concern**: The broad `except Exception` at line 115 silently swallows `OperationalError` (deadlock) and returns `(None, False)`. A deadlock would silently deny the discount without any user-facing error. The `logger.exception()` at line 116 does log the error, which mitigates this somewhat.

**Test gap**: No `TransactionTestCase` with concurrent threads exists. Tests in `test_models.py` (lines 326-339) test sequential double-calls only.

---

### Issue 3 — Flag Set Before Payment Capture (Premature Flag Burn)

**Severity: CRITICAL**

**Evidence**:
- `apps/stripe_integration/views.py:327-330` — `get_checkout_discount()` is called inside `PayPalCreatePaymentAPIView.post`, which creates a PayPal order in `AUTHORIZE` mode. At this point, the buyer has NOT yet approved or paid.
- `apps/attribution/utils.py:105-111` — Inside `get_checkout_discount()`, `first_session_discount_applied = True` is set and saved immediately.
- The buyer must then approve the order on PayPal, and the capture happens later in `PayPalCapturePaymentAPIView.post` (line 482).

**Failure scenario**:
1. Client initiates PayPal checkout -> `get_checkout_discount()` is called -> flag set to `True`
2. Client abandons PayPal approval screen (never approves)
3. Flag remains `True` permanently
4. Client retries checkout -> `get_checkout_discount()` returns `(None, False)` because flag is already `True`
5. Client loses their first-session discount forever

**Safety net at capture** (`stripe_integration/views.py:498-510`): There IS a safety-net `update()` call after capture that marks `first_session_discount_applied=True` for any remaining `False` tokens. But this only helps if the flag was NOT set at order creation — which it always is, since `get_checkout_discount()` sets it at line 327.

**Fix needed**: `get_checkout_discount()` should be split into two operations:
1. A read-only check at order creation (returns discount amount without setting flag)
2. A flag-setting operation called only after successful payment capture

---

### Issue 4 — No Cancellation/Refund Reset

**Severity: HIGH**

**Evidence**:
- `apps/calendar_functionality/views.py:1421-1440` — Cancellation handler sets `appointment.is_status = "CANCELLED"`, cancels Stripe PaymentIntent, but does NOT touch `ProfileAttributionToken.first_session_discount_applied`
- `apps/calendar_functionality/views.py:3319-3425` — `cancel-payment` endpoint cancels Stripe PI and voids PayPal auth but does NOT reset the attribution flag
- `apps/attribution/management/commands/expire_attribution_tokens.py` — Only changes status to `EXPIRED`. Does not reset `first_session_discount_applied`.
- `lumy_global/cron.py` — Contains `capture_authorized_payments_job` (PayPal capture cron). Does not interact with attribution tokens.
- Searched entire `apps/calendar_functionality/` for "attribution" — zero matches.

**No webhook handlers exist**: No Stripe webhook handler processes `payment_intent.succeeded`, `charge.refunded`, or `payment_intent.canceled` events. The codebase has no Stripe webhook endpoint.

**Product decision needed**: If a session is cancelled before occurrence and fully refunded, should `first_session_discount_applied` be reset to `False`?

---

### Issue 5 — Integer-to-Decimal Conversion

**Severity: LOW**

**Evidence** (`apps/attribution/utils.py:98-102`):
```python
discount_int = getattr(provider, 'attribution_discount_percent', None)
# ...
discount_decimal = Decimal(discount_int) / Decimal('100')
```

- `CareProvider.attribution_discount_percent` is `IntegerField` (`apps/care_provider/models.py:1061`). Django returns a Python `int`.
- `Decimal(10) / Decimal('100')` = `Decimal('0.1')` — exact, no floating-point error.
- Safe as long as field type remains `IntegerField`.

**Serializer validation gap**: `CareProviderSerializer` (`apps/care_provider/serializers.py:6`) uses `Meta.exclude = ["user"]` with no explicit field-level validators. The `choices=[(5, '5%'), (10, '10%'), (15, '15%')]` on the model field provides DB-level enforcement on forms/admin, but DRF's `ModelSerializer` with `exclude` will include `attribution_discount_percent` and honor the `choices` as validation. A direct API call with `attribution_discount_percent=7` would be rejected by DRF's choices validator. This is acceptable.

---

### Issue 6 — Non-Attributed Clients Can Self-Attribute

**Severity: MEDIUM**

**Evidence** (`apps/attribution/views.py:32-132`):
- Any authenticated client can POST to `/api/v1/attribution/track/` with `{"provider_id": <any_valid_id>}` to create a PENDING token
- Guardrails: `has_prior_booking` (blocks if client already has an appointment with provider), CONFIRMED status lock, INELIGIBLE status lock
- `referer` field is stored but NOT validated or required. A client can omit it or provide any URL.

**Attack vector**: A client who discovers a provider's ID (visible in URLs) can call `POST /api/v1/attribution/track/` directly, creating a PENDING attribution token. If they then book, they get the first-session discount — even without arriving via an external referral.

**Rate limiting**: `UserRateThrottle` is applied (line 30), which limits abuse volume but does not prevent the fundamental issue.

---

### Issue 7 — Checkout Status Endpoint

**Severity: MEDIUM**

**Status**: The endpoint EXISTS.

**Evidence**:
- `apps/attribution/urls.py:7` — `path('checkout-status/', views.AttributionCheckoutStatusView.as_view(), name='attribution-checkout-status')`
- `apps/attribution/views.py:135-174` — `AttributionCheckoutStatusView` is implemented

**Correct behaviors**:
- `permission_classes = [IsAuthenticated]` (line 142)
- Client scoped via `request.user.client` (line 153) — no client_id from request data
- Returns `provider.attribution_discount_percent` (int) — not the discount amount

**Status filter mismatch (BUG)**:
- `AttributionCheckoutStatusView` (line 160) filters: `status=AttributionStatus.CONFIRMED`
- `get_checkout_discount()` (line 84) filters: `status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED]`
- A PENDING token would qualify for a discount via `get_checkout_discount()` but the checkout-status endpoint would report `is_first_attributed_session=False`. The frontend would show full price, but the backend (PayPal path) would apply the discount server-side. This creates a confusing UX mismatch.

**Missing `first_session_discount_applied` filter on checkout-status**: The view checks `first_session_discount_applied=False` (line 161), which is correct. But it does NOT check `expires_at__gt=timezone.now()`. An expired token with `status=CONFIRMED` and `first_session_discount_applied=False` would incorrectly show as eligible.

---

### Issue 8 — Stripe vs PayPal Discount Asymmetry

**Severity: CRITICAL**

**Evidence**:

| Path | Discount applied server-side? | Amount source |
|---|---|---|
| `PaymentIntentAPIView.post` (Stripe) | NO | `request.data.get('amount')` — frontend-controlled |
| `PayPalCreatePaymentAPIView.post` | YES (line 327) | Server computes `original_amount - discount_amount` |
| `PayPalCapturePaymentAPIView.post` | N/A (captures authorized amount) | PayPal authorization amount |
| `ConfirmPaymentAPIView.post` (Stripe) | NO | `request.data.get('amount')` — frontend-controlled |

The Stripe path has zero server-side discount enforcement. A malicious client could submit `amount=1` for a $100 session.

Additionally, the Stripe `PaymentIntentAPIView` does not call `get_telehealth_fee()` either — the platform fee split is not computed server-side for Stripe payments.

---

### Issue 9 — Discount Amount Not Stored

**Severity: HIGH**

**Evidence**:
- `ProfileAttributionToken` fields: `first_session_discount_applied` (bool), `first_booking_at` (datetime). No `discount_amount` field.
- `ProviderClientFeeOverride` fields: `fee_percent`, `original_fee_percent`, `source`. No `sessions_discounted` or `total_discount_value`.
- `Appointment` model (`apps/calendar_functionality/models.py`): Searched for "discount" — zero matches. No discount-related field exists.
- The computed `discount_amount` is logged at `stripe_integration/views.py:342` (`extra={"discount_amount": str(discount_amount)}`) but this is ephemeral log data, not queryable.

**Impact**: Finance cannot query "how much has Provider X funded in discounts this month?" without parsing application logs. Provider statements, platform reporting, and dispute resolution all require a stored discount amount.

---

### Issue 10 — PayPal Endpoints Unauthenticated

**Severity: CRITICAL**

**Evidence**:

**PayPalCreatePaymentAPIView** (`stripe_integration/views.py:290-293`):
```python
class PayPalCreatePaymentAPIView(APIView):
    # authentication_classes = [JWTAuthentication]
    # permission_classes = [IsAuthenticated]
```
Both lines are commented out. Any unauthenticated request can create a PayPal order.

**PayPalCapturePaymentAPIView** (`stripe_integration/views.py:404`):
```python
class PayPalCapturePaymentAPIView(APIView):
    # No authentication_classes or permission_classes defined at all
```
Any unauthenticated request can capture an authorized PayPal payment.

**Compound risk with discount**: Because `PayPalCreatePaymentAPIView` is unauthenticated AND calls `get_checkout_discount()` (line 327), an attacker can:
1. Create a PayPal order with any `appointment_id`
2. Trigger `get_checkout_discount()` which marks `first_session_discount_applied=True`
3. The legitimate client's discount is burned without any payment occurring

**Additional concern**: The capture endpoint (`PayPalCapturePaymentAPIView`) accepts `appointment_id` and performs no ownership check. Any caller can capture any appointment's PayPal authorization.

---

## Additional Findings

### A. checkout-status vs get_checkout_discount Status Filter Mismatch

**Severity: MEDIUM**

- `AttributionCheckoutStatusView.get` (views.py:160): `status=AttributionStatus.CONFIRMED`
- `get_checkout_discount` (utils.py:84): `status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED]`

A client with a PENDING token would see "no discount available" on the checkout page (frontend queries checkout-status) but the PayPal backend would still apply the discount. This is a consistency bug.

### B. checkout-status Missing expires_at Check

**Severity: MEDIUM**

`AttributionCheckoutStatusView` (views.py:157-162) does NOT filter by `expires_at__gt=timezone.now()`. An expired CONFIRMED token with `first_session_discount_applied=False` would falsely report a discount is available, but `get_checkout_discount()` would then reject it (because it checks `expires_at__gt=timezone.now()` at line 85).

### C. Broad Exception Handling in get_checkout_discount

**Severity: LOW**

`apps/attribution/utils.py:115` — `except Exception` catches ALL exceptions including `OperationalError`, `IntegrityError`, `DatabaseError`. A database connectivity issue during checkout would silently deny the discount. The `logger.exception()` at line 116-119 logs the error, which is acceptable for a "fail-safe" design (never break checkout), but the discount denial is invisible to the user.

### D. PayPal Amount Rounding via float()

**Severity: LOW**

`stripe_integration/views.py:365`: `f"{float(amount):.2f}"` — The discounted `amount` (a string representation of a Decimal) is cast to `float` before formatting. For typical session prices ($50-$500), `float()` precision is sufficient. For amounts like `$99.99 * 0.85 = $84.9915`, the `Decimal.quantize()` at line 332 already rounds to 2 decimal places, so the subsequent `float()` conversion is safe. However, the pattern is fragile — the `amount` variable is a string, and `Decimal(amount)` would be safer than `float(amount)`.

---

## Prioritized Remediation Plan

### P0 — Must Fix Before Launch

1. **Wire `get_checkout_discount()` into Stripe path** (Issue 1, 8): Add discount computation to `PaymentIntentAPIView.post` — do not trust frontend-supplied `amount` as the sole source of truth.

2. **Restore authentication on PayPal endpoints** (Issue 10): Uncomment `authentication_classes` and `permission_classes` on `PayPalCreatePaymentAPIView` (line 291-292). Add them to `PayPalCapturePaymentAPIView` (line 404). Add ownership check: appointment must belong to `request.user`.

3. **Move flag-setting to post-capture** (Issue 3): Split `get_checkout_discount()` into:
   - `check_checkout_discount(provider, client)` — read-only, returns `(discount_decimal, True)` without setting flag
   - `mark_discount_applied(provider, client)` — sets `first_session_discount_applied=True`, called only after confirmed payment

### P1 — Should Fix Before Launch

4. **Add `discount_amount` field** (Issue 9): Add `discount_amount = DecimalField(max_digits=10, decimal_places=2, null=True)` to `ProfileAttributionToken`. Set it when `first_session_discount_applied` is marked True.

5. **Add cancellation reset handler** (Issue 4): When an appointment is cancelled before occurrence and the payment is refunded/voided, reset `first_session_discount_applied=False` on the corresponding `ProfileAttributionToken`.

6. **Fix checkout-status filter mismatch** (Finding A, B): Update `AttributionCheckoutStatusView` to use `status__in=[PENDING, CONFIRMED]` and add `expires_at__gt=timezone.now()` filter, matching `get_checkout_discount()`.

### P2 — Should Fix

7. **Validate attribution referrer** (Issue 6): Require a non-empty `referer` for PENDING tokens to be eligible for discount, or add a signed token to the attribution URL.

8. **Add concurrent discount test** (Issue 2): Write a `TransactionTestCase` with `threading` to verify `select_for_update` blocks double-application under concurrency.

---

## Files Examined

| File | Path |
|---|---|
| Audit prompt | `ContextFiles/Library/Prompts/Audit_ProviderDiscount_DataModel_Prompt.md` |
| Attribution models | `apps/attribution/models.py` |
| Attribution utils | `apps/attribution/utils.py` |
| Attribution views | `apps/attribution/views.py` |
| Attribution URLs | `apps/attribution/urls.py` |
| Attribution tests | `apps/attribution/tests/test_provider_discount.py` |
| Attribution tests (models) | `apps/attribution/tests/test_models.py` |
| Expire tokens command | `apps/attribution/management/commands/expire_attribution_tokens.py` |
| Stripe/PayPal views | `apps/stripe_integration/views.py` |
| CareProvider model | `apps/care_provider/models.py` (line 1061) |
| CareProvider serializer | `apps/care_provider/serializers.py` |
| Calendar views (cancellation) | `apps/calendar_functionality/views.py` (lines 1370-1450, 3319-3425) |
| Cron jobs | `lumy_global/cron.py` |
