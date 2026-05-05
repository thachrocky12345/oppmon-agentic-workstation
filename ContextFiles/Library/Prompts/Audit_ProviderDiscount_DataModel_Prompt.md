# Audit Prompt: RGDEV-186 — Provider-Funded Client Discount, Checkout Logic

**Scope**: Data model correctness, race conditions, payment integration gaps, security, and financial auditability for the provider-funded first-session discount feature.

**Files under review**:
- `apps/attribution/models.py` — `ProfileAttributionToken`, `ProviderClientFeeOverride`
- `apps/attribution/utils.py` — `get_checkout_discount`, `get_telehealth_fee`
- `apps/care_provider/models.py` — `CareProvider.attribution_discount_percent`
- `apps/stripe_integration/views.py` — `PaymentIntentAPIView`, `PayPalCapturePaymentAPIView`
- `apps/attribution/views.py` — `TrackAttributionView`
- `apps/attribution/urls.py`

---

## Context: What the Feature Does

A care provider can configure `attribution_discount_percent` (5, 10, or 15) on their `CareProvider` record. When a new client arrives via provider attribution (profile visit or booking link), and checks out for their **first session**, `get_checkout_discount()` is called. It returns `(discount_decimal, True)` if a valid, non-expired, non-already-applied `ProfileAttributionToken` exists. The discount reduces the client-facing session charge; the provider absorbs the cost of that reduction.

`ProviderClientFeeOverride` separately stores a reduced telehealth platform fee for the attributed pair (e.g. 12% instead of 15%), used by `get_telehealth_fee()` during payment capture.

---

## Issue 1 — Discount Math: Platform Fee Must Be Applied to the Discounted Amount

**The question**: When `get_checkout_discount()` returns `Decimal('0.10')` for a $100 session, the client is charged $90. The platform fee must then be 12% of $90 = $10.80 — not 12% of $100 = $12.

**What to audit**:

1. Locate every call site that invokes `get_checkout_discount()`. As of the current codebase this function exists in `apps/attribution/utils.py` but has **no call sites in `apps/stripe_integration/views.py` or any payment view**. Confirm whether the discount is being applied to the `amount` passed to `stripe.PaymentIntent.create()` (line 58–63 of `stripe_integration/views.py`) or the PayPal `create_order` payload (line 338–354).

2. In `PaymentIntentAPIView.post`, `amount` is taken directly from `request.data.get('amount')` with no server-side discount computation. Determine whether the frontend is expected to pre-apply the discount, or whether the backend should compute and apply it. If the frontend computes the discounted amount, there is no server-side enforcement — a client can trivially send any `amount`.

3. In `PayPalCapturePaymentAPIView.post`, `total_amount` is read from the PayPal authorization response (`auth["amount"]["value"]`). The platform fee is then computed as `total_amount * pct`. If the PayPal order was created client-side with a pre-discounted amount, the platform fee math is correct only if `pct` reflects the attributed fee. Verify the capture path calls `get_telehealth_fee()` (it does, line 431), but confirm whether `get_checkout_discount()` is invoked anywhere in the PayPal order-creation or capture flow.

4. **Expected finding**: `get_checkout_discount()` is imported nowhere in `stripe_integration/views.py`. It is not imported in any payment view. The function exists and works correctly in isolation but is not wired into any checkout endpoint. Confirm this is the case, and document whether checkout discount application is deferred entirely to the frontend or is simply not implemented server-side.

---

## Issue 2 — Double-Discount Race Condition

**The question**: If two concurrent checkout requests arrive for the same `(provider, client)` pair, could both calls to `get_checkout_discount()` pass the `first_session_discount_applied` check before either sets the flag?

**What is in the code**:

`get_checkout_discount()` in `apps/attribution/utils.py` lines 77–113 uses:
```python
with transaction.atomic():
    token = (
        ProfileAttributionToken.objects
        .select_for_update()
        .filter(...)
        .first()
    )
```

`select_for_update()` acquires a row-level exclusive lock in PostgreSQL. The flag is then set and saved within the same atomic block.

**What to audit**:

1. Confirm `transaction.atomic()` is applied at the correct scope — it wraps both the `select_for_update` query AND the `token.save()`. Verify no `savepoint` or nested `atomic()` block could release the lock prematurely.

2. The `select_for_update()` filter includes `expires_at__gt=timezone.now()` and `status__in=[PENDING, CONFIRMED]`. Confirm the index `Index(fields=['provider', 'client', 'status'])` on `ProfileAttributionToken` covers this query. If the row doesn't exist, `select_for_update` returns nothing and both concurrent calls return `(None, False)` — that case is safe. The lock only matters when a row exists and `first_session_discount_applied=False`.

3. The broad `except Exception` on line 115 silently swallows all errors including `OperationalError` (deadlock) and returns `(None, False)`. A deadlock between two concurrent checkouts would silently deny the discount to the second requester without surfacing the conflict. Audit whether this is the intended behavior and whether there is any logging or alerting.

4. **Test gap**: There are no tests in `apps/attribution/tests/` that use `threading` or `TransactionTestCase` (which allows actual concurrent DB access) to verify the race condition is blocked. The existing tests in `test_models.py` test sequential double-calls but not concurrent ones.

---

## Issue 3 — `first_session_discount_applied` Flag Set Before Payment Capture

**The question**: `get_checkout_discount()` sets `first_session_discount_applied = True` and saves the token **at the time it is called** (lines 105–111). If this is called during checkout initiation (before payment capture), and then the payment fails or is abandoned, the flag is permanently set and the client can never receive the discount — even if they retry.

**What to audit**:

1. Find every location where `get_checkout_discount()` is called. As noted in Issue 1, it currently has no call sites in payment views. If it is intended to be called at payment-intent creation time (before the card is charged), the flag is set prematurely. It must only be set after a successful `stripe.PaymentIntent` status of `succeeded` or a PayPal capture response with `status=COMPLETED`.

2. Check whether there is a Stripe webhook handler (in `stripe_integration/` or elsewhere) that processes `payment_intent.succeeded` events. If there is, `get_checkout_discount()` should be called from within that webhook handler, not from the payment-intent creation endpoint.

3. Check whether the PayPal capture endpoint (`PayPalCapturePaymentAPIView`) sets any attribution flag after a successful `capture_authorization()` call (lines 453–465). Currently it does not.

4. **Expected finding**: No webhook handler calls `get_checkout_discount()`. No payment success callback sets the flag. The function is not called from any payment path at all, meaning the discount is either applied entirely in the frontend or the wiring is simply missing.

---

## Issue 4 — Cancellation/Refund Reset of `first_session_discount_applied`

**The question**: If the first session is cancelled before it occurs, or fully refunded, should `first_session_discount_applied` be reset to `False` so the client can still use their first-session discount on a future booking?

**What to audit**:

1. Search for appointment cancellation handlers — views, signals, and management commands — in `apps/calendar_functionality/` and `apps/stripe_integration/`. Look for any code that touches `ProfileAttributionToken.first_session_discount_applied`.

2. Search for Stripe refund or dispute webhook handlers. Check `stripe_integration/` for any `charge.refunded`, `payment_intent.canceled`, or `refund.created` event processing.

3. Check `lumy_global/cron.py` which already processes appointments. It excludes `CANCELLED` appointments but does not interact with attribution tokens.

4. Check `apps/attribution/management/commands/expire_attribution_tokens.py` to see whether it resets the flag on cancellation.

5. **Expected finding**: No cancellation handler resets `first_session_discount_applied`. The product decision needed here is: is a cancelled-before-occurrence session considered "used"? If a client books and is charged but cancels before the session date, does the provider still pay? If the refund policy covers 100% refund, the discount was never consumed. Define the policy and implement a corresponding signal or webhook handler.

---

## Issue 5 — `attribution_discount_percent` Integer-to-Decimal Conversion

**The question**: `CareProvider.attribution_discount_percent` is `IntegerField` with choices `(5, '5%'), (10, '10%'), (15, '15%')`. In `get_checkout_discount()`, line 102:

```python
discount_decimal = Decimal(discount_int) / Decimal('100')
```

**What to audit**:

1. `Decimal(discount_int)` where `discount_int` is a Python `int` (e.g., `10`) produces `Decimal('10')`. Dividing by `Decimal('100')` produces `Decimal('0.1')`. This is exact — no floating-point rounding error. Confirm by checking `Decimal(10) / Decimal('100') == Decimal('0.1')`. This is correct.

2. The risk would arise if `discount_int` were a float (e.g., `10.0`). `Decimal(10.0)` produces `Decimal('10.000000000000000555111512312578270211815834045410156250')`. Confirm that `getattr(provider, 'attribution_discount_percent', None)` returns a Python `int` from an `IntegerField` (it does in Django). This is safe as long as the field type is never changed to `FloatField`.

3. Confirm the `choices` constraint is enforced at the serializer level for provider profile updates. If a provider could set `attribution_discount_percent = 7` via a direct API call (bypassing choices validation), `Decimal(7) / Decimal('100')` still works correctly, but the value would be outside the advertised fee tiers. Verify the serializer for `CareProvider` validates this field against `[5, 10, 15, None]`.

---

## Issue 6 — Non-Attributed Clients Receiving the Discount

**The question**: Can a client with no valid attribution token receive the discount? Can a provider with `attribution_discount_percent=10` accidentally give a discount to a random client?

**What to audit**:

1. `get_checkout_discount()` requires `ProfileAttributionToken` with `status__in=[PENDING, CONFIRMED]` and `expires_at__gt=now`. A non-attributed client has no token, so `token` is `None` and `(None, False)` is returned immediately. This guard is correct for any checkout flow that actually calls this function.

2. However, note that `TrackAttributionView` (in `apps/attribution/views.py`) creates a PENDING token for any authenticated client who POSTs with a valid `provider_id`. The check for existing relationships (`has_prior_booking`) covers clients who already have an appointment. But a **new client who never visited the provider's profile externally** could call `POST /api/v1/attribution/track/` directly with a `provider_id` and receive a PENDING token, then receive the discount at checkout.

3. Evaluate whether `TrackAttributionView` should be restricted to only fire on external referrals (e.g., requiring a valid `referer` header or a signed token in the URL). Currently, any authenticated client can create an attribution token for any provider by calling the endpoint directly. The fraud guardrail is only the `has_prior_booking` check.

4. The `referer` field is stored but not validated or enforced as a prerequisite. Determine whether a non-empty `referer` should be required for a PENDING token to be eligible for the discount.

---

## Issue 7 — Checkout Status Endpoint Scoping

**The question**: The issue description references `GET /api/v1/attribution/checkout-status/?provider_id=X`. Audit whether this endpoint exists and whether it is scoped to the requesting client only.

**What to audit**:

1. Review `apps/attribution/urls.py`. The current file contains only one route: `path('track/', views.TrackAttributionView.as_view(), ...)`. There is **no `checkout-status/` endpoint registered**.

2. Search all `urls.py` files for `checkout-status` or `checkout_status`. If it does not exist, document that the endpoint described in the ticket has not been implemented yet.

3. If it is added in the future, the view must scope the query to `request.user.client` — it must not accept a `client_id` parameter from the request body. The query must be:
   ```python
   token = ProfileAttributionToken.objects.filter(
       provider_id=provider_id,
       client=request.user.client,  # enforced from auth, not from request data
       status__in=[PENDING, CONFIRMED],
       expires_at__gt=timezone.now(),
   ).first()
   ```
   Without this scoping, a client could probe attribution status for any (provider, client) pair by supplying arbitrary IDs.

4. Confirm `IsAuthenticated` is on any future checkout-status view.

---

## Issue 8 — Stripe vs PayPal Discount Coverage

**The question**: Are both payment paths applying the first-session discount amount?

**What to audit**:

1. **Stripe path** (`PaymentIntentAPIView.post`): Takes `amount` from `request.data`. Does not call `get_checkout_discount()`. Does not call `get_telehealth_fee()`. There is no server-side discount computation.

2. **PayPal path** (`PayPalCreatePaymentAPIView.post`): Takes `amount` from `request.data`. Does not call `get_checkout_discount()`. Has no authentication or permission classes (lines 291–293: both `authentication_classes` and `permission_classes` are commented out). The amount passed to PayPal is entirely frontend-controlled.

3. **PayPal capture** (`PayPalCapturePaymentAPIView.post`): This is the one view that calls `get_telehealth_fee()` server-side, using it to compute the platform fee split. It does not call `get_checkout_discount()`. The total amount captured is whatever was authorized — set by the frontend at order creation time.

4. **Gap**: Neither payment path enforces the discounted session price server-side. The discount is only expressed via the frontend-supplied amount. Determine whether this is an intentional architecture (trust frontend amount) or a missing server-side enforcement layer.

5. **Security note**: `PayPalCreatePaymentAPIView` has no `authentication_classes` or `permission_classes`. Any unauthenticated request can create a PayPal order. This is independent of the discount issue but is a significant security gap.

---

## Issue 9 — Discount Amount Not Stored for Financial Reconciliation

**The question**: Is `discount_amount` stored anywhere for provider billing reconciliation?

**What to audit**:

1. Review `ProfileAttributionToken` fields: `first_session_discount_applied` (bool), `first_booking_at` (datetime). There is no `discount_amount_applied` field storing the dollar value of the discount granted.

2. Review `ProviderClientFeeOverride` fields: `fee_percent`, `original_fee_percent`, `source`. There is no `sessions_discounted` count or `total_discount_value` field.

3. Check the `Appointment` model in `apps/calendar_functionality/models.py` for any field that stores the discount applied to that specific appointment. Search for `discount` in that model.

4. **Expected gap**: No dollar-value discount is persisted on any model. Finance can reconstruct discount amounts only by comparing the charged amount to the provider's listed session rate — an indirect and brittle reconciliation path.

5. **Recommendation to evaluate**: Add a `discount_amount` `DecimalField(null=True)` to `ProfileAttributionToken` (set when `first_session_discount_applied` is set to True) and/or an `applied_provider_discount` field on `Appointment`. This is required for: provider statements showing how much they funded in discounts, platform reporting on discount program ROI, dispute resolution if a client claims a discount was not applied.

---

## Issue 10 — Serializer Validation and Unauthenticated Access

**The question**: Is `provider_id` validated before DB queries? Can an unauthenticated user call any attribution endpoint?

**What to audit**:

1. `TrackAttributionView` has `permission_classes = [IsAuthenticated]`. An unauthenticated request returns 401 before reaching the view body. `provider_id` is validated with `CareProvider.objects.get(id=provider_id)` returning 404 on miss. The client is resolved from `request.user.client` — no client-supplied `client_id`. This is correctly scoped.

2. `PayPalCreatePaymentAPIView` has both `authentication_classes` and `permission_classes` commented out (lines 291–293). This endpoint is fully unauthenticated. `provider_id` is not referenced here (only `merchant_id` for the PayPal payee), but any caller can create orders against any merchant.

3. `PayPalCapturePaymentAPIView` has no `authentication_classes` or `permission_classes` defined. It is also unauthenticated. It accepts `appointment_id` and looks up the appointment — no ownership check that the appointment belongs to `request.user`.

4. For the future `checkout-status` endpoint: validate that `provider_id` is a valid integer before querying, return 404 (not 400) if the provider does not exist (do not leak whether the ID was valid or not — use a constant-time response if provider enumeration is a concern), and enforce `IsAuthenticated` plus client-scoping as described in Issue 7.

5. Check `apps/attribution/views.py` for any missing `throttle_classes` on views other than `TrackAttributionView` (which already has `UserRateThrottle`).

---

## Summary Checklist for the Implementing Engineer

| # | Issue | Severity | Status Based on Code Review |
|---|---|---|---|
| 1 | Platform fee computed on discounted amount | Critical | `get_checkout_discount()` has no call sites in any payment view — discount not applied server-side |
| 2 | Race condition in double-discount | Medium | `select_for_update()` + `transaction.atomic()` present and correct; no concurrent test coverage |
| 3 | Flag set before payment capture | High | Flag is set when `get_checkout_discount()` is called; no payment-success callback wires to it |
| 4 | Cancellation reset of flag | Medium | No cancellation handler resets `first_session_discount_applied`; product policy undefined |
| 5 | Integer-to-Decimal conversion | Low | Conversion is correct (`Decimal(int) / Decimal('100')`); no float risk |
| 6 | Non-attributed clients bypassing guard | Medium | `TrackAttributionView` can be called directly by any authenticated client without a genuine referral |
| 7 | Checkout-status endpoint scoping | High | Endpoint does not exist yet; must be scoped to `request.user.client` when implemented |
| 8 | PayPal path discount enforcement | High | PayPal create-order endpoint is unauthenticated; no server-side discount enforcement on either path |
| 9 | Discount amount not stored | Medium | No `discount_amount` field on any model; reconciliation is not possible without it |
| 10 | Serializer validation / unauthenticated access | High | `PayPalCreatePaymentAPIView` and `PayPalCapturePaymentAPIView` have no authentication |

---

## Targeted Test Cases to Write

1. `test_platform_fee_uses_discounted_amount` — Mock a $100 session with 10% discount; assert Stripe `amount` passed to `create()` is 9000 cents and platform fee is computed on $90, not $100.
2. `test_concurrent_checkout_only_one_discount` — Use `TransactionTestCase` with two threads calling `get_checkout_discount()` simultaneously; assert only one returns a discount.
3. `test_flag_not_set_on_payment_failure` — Call the checkout endpoint, simulate Stripe failure, assert `first_session_discount_applied` is still `False`.
4. `test_cancellation_resets_discount_flag` — Cancel an appointment before it occurs; assert `first_session_discount_applied` is reset (if policy decision supports this).
5. `test_direct_track_call_without_referral_is_blocked` — A client calls `TrackAttributionView` directly with no referrer; assert the token is not eligible for a discount (requires policy enforcement to be added).
6. `test_checkout_status_scoped_to_own_client` — Client A cannot retrieve the checkout-status for Client B's attribution with Provider X.
7. `test_paypal_create_order_requires_auth` — Unauthenticated POST to PayPal create-order returns 401.
8. `test_discount_amount_stored_on_token` — After discount is applied, assert `ProfileAttributionToken.discount_amount` equals `session_rate * discount_percent`.
