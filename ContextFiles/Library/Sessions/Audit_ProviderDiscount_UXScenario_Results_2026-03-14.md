# Audit Results: RGDEV-186 -- Provider-Funded Client Discount (Checkout Logic)

**Date**: 2026-03-14
**Ticket**: RGDEV-186
**Audit type**: UX correctness, scenario coverage, commercial accuracy

---

## 1. Checkout Display -- Frontend Wiring

**Verdict**: NOT IMPLEMENTED

**Evidence**:
- Backend endpoint exists: `GET /api/v1/attribution/checkout-status/?provider_id=<id>` (`apps/attribution/views.py:135`, `AttributionCheckoutStatusView`). Returns `is_first_attributed_session` (bool) and `discount_percent` (int or null).
- **Zero frontend references** to `checkout-status`, `attribution_discount`, `discount_percent`, or `discount_amount` exist anywhere in `RG-Frontend/src/`. Grep across the entire frontend source returned no matches.
- The three files that match "discount" in the frontend are: `landing-screen.tsx` (privacy policy text mentioning "attribution" generically), `PageContent.tsx` (attribution warning for page management), and `PrivacyPolicyPage.tsx` -- none related to checkout pricing.
- No checkout price breakdown component exists that renders original price, discount line, and final charge.

**Gaps found**:

1. **No frontend component calls `/attribution/checkout-status/`**. The backend API exists but is completely unwired on the client side.
2. **No discount display in checkout UI**. Clients booking a discounted session see the full price, not the discounted price. The discount is applied silently on the server side during PayPal order creation.
3. **No loading/error state handling** for discount check -- the call is never made.
4. **Silent under-charge risk**: The client sees $100, pays $90 (via PayPal), and has no explanation why the amounts differ.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **CRITICAL** | Add an API call to `/attribution/checkout-status/` in the booking flow before rendering the payment summary. |
| 2 | **CRITICAL** | Build a checkout price breakdown component showing: original price, "Welcome discount: -$X.XX (funded by your provider)", and final charge. |
| 3 | **HIGH** | Add loading spinner and error fallback (show full price on failure) around the checkout-status call. |
| 4 | **HIGH** | Ensure the Stripe PaymentIntent `amount` also applies the discount (currently only PayPal flow applies it). |

---

## 2. Provider Revenue Impact and Earnings Breakdown

**Verdict**: NOT IMPLEMENTED

**Evidence**:
- The `Appointment` model (`apps/calendar_functionality/models.py:79`) has no `discount_amount`, `discount_percent`, or `discount_funded_by` field. It stores `amount_in_cents` and `payment_intent_id` only.
- No earnings/payout/statement view exists that shows discount line items. Grep for "earning|payout|statement" across `apps/` returned only `care_provider/queries.py`, `care_provider/tasks.py`, and `care_provider/object_types.py` -- none contain discount-related logic.
- The `PayPalCapturePaymentAPIView` computes platform fee on `total_amount` (the already-discounted PayPal authorization amount) at line 452-462, which is correct -- platform fee is on discounted amount. However, no record of the discount amount or percentage is stored on the appointment or any financial record.
- Stripe metadata on the PaymentIntent does not include discount information (line 58-63 of `stripe_integration/views.py` shows no metadata parameter).

**Gaps found**:

1. **No discount_amount field on Appointment or any financial model**. The dollar value of the discount is computed transiently in `PayPalCreatePaymentAPIView` but never persisted.
2. **No provider earnings view shows discount impact**. Providers cannot see "you funded $X in discounts this month."
3. **No Stripe metadata records the discount**. If a dispute arises, there is no Stripe-side evidence of the discount.
4. **Platform fee is correctly calculated on discounted amount** (for PayPal). This is the one positive finding.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **CRITICAL** | Add `discount_percent_applied` (IntegerField, nullable) and `discount_amount_cents` (IntegerField, nullable) to the Appointment model. Persist at checkout time. |
| 2 | **HIGH** | Build a provider earnings breakdown that queries appointments with non-null discount fields and sums discount_amount per period. |
| 3 | **HIGH** | Add `metadata={'attribution_discount_percent': X, 'attribution_discount_amount': Y}` to `stripe.PaymentIntent.create()` calls. |

---

## 3. Discount Enablement Flow -- Provider Dashboard UX

**Verdict**: NOT IMPLEMENTED (backend field exists, no frontend UI)

**Evidence**:
- Backend model field exists: `CareProvider.attribution_discount_percent` (`apps/care_provider/models.py:1061`) -- `IntegerField(null=True, blank=True, choices=[(5, '5%'), (10, '10%'), (15, '15%')])`.
- The field is NOT exposed in any serializer. Grep for `attribution_discount_percent` across `apps/care_provider/serializers.py` returned zero matches.
- No frontend component references `attribution_discount` anywhere in `RG-Frontend/src/`.
- The field is accessible only via Django Admin (visible in `apps/attribution/admin.py` but actually on the CareProvider model, manageable via the CareProvider admin).
- No confirmation dialog, warning text, or revenue impact calculator exists.

**Gaps found**:

1. **No provider-facing UI to enable/configure the discount**. The field can only be set via Django Admin or direct API manipulation.
2. **No serializer exposes the field** for provider profile CRUD.
3. **No confirmation/warning UX** explaining "this discount is funded from your payout."
4. **No validation** beyond Django choices -- but Django choices constraint `[(5, '5%'), (10, '10%'), (15, '15%')]` is adequate for backend enforcement.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **HIGH** | Add `attribution_discount_percent` to the provider profile serializer and build a settings UI with a dropdown (None / 5% / 10% / 15%). |
| 2 | **HIGH** | Add a confirmation step with revenue impact example: "For a $100 session, you will receive $X.XX after platform fees." |
| 3 | **MEDIUM** | Add help text on the UI control: "This discount is funded from your payout, not the platform." |

---

## 4. Post-Cancellation Discount Reset Logic

**Verdict**: NOT IMPLEMENTED

**Evidence**:
- The cancellation handler is in `apps/calendar_functionality/views.py` (around line 1360-1510). It sets `appointment.is_status = "CANCELLED"`, cancels the Stripe PaymentIntent, releases slots, and sends emails.
- **There is zero attribution logic in the cancellation handler.** No reference to `ProfileAttributionToken`, `first_session_discount_applied`, or any discount reset.
- Grep for `first_session_discount_applied.*False` and `reset.*discount` across all `apps/` returned only the model default and test setup code -- no production code resets the flag.
- The `get_checkout_discount()` function in `utils.py:105` sets `first_session_discount_applied = True` atomically at order creation time, but nothing ever sets it back to `False`.
- Similarly, `PayPalCapturePaymentAPIView` (line 500-505) has a "safety net" that bulk-updates `first_session_discount_applied=True` at capture time but never resets it.

**Gaps found**:

1. **Cancellation does not reset `first_session_discount_applied`**. If a client books a discounted session and cancels before it occurs, the discount is permanently consumed. The client cannot receive the discount on re-booking.
2. **No distinction between "cancelled before session" and "cancelled after session"** in the context of discount eligibility.
3. **No test case for cancel-then-rebook discount preservation**.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **CRITICAL** | In the cancellation handler, when `appointment.is_status` is set to `"CANCELLED"` and the session has not yet occurred (`start_date_time > now`), reset `first_session_discount_applied = False` on the corresponding `ProfileAttributionToken`. |
| 2 | **HIGH** | Add test: book discounted session -> cancel before session -> re-book -> assert discount still applies. |
| 3 | **MEDIUM** | Consider whether provider-initiated cancellation should also reset the discount. BRD likely intends both cases to reset. |

---

## 5. Partial Refund Scenario -- Discount Flag Preservation

**Verdict**: NOT IMPLEMENTED (no refund handler exists)

**Evidence**:
- No Stripe webhook handler exists in the codebase. Grep for `webhook|stripe_webhook|StripeWebhook` returned only unrelated files (verification, cron).
- No refund processing view exists. The cancellation handler calls `stripe.PaymentIntent.cancel()` (void, not refund) and `AppointmentPaymentVoidView` also voids authorizations -- neither is a refund.
- There is no code path that distinguishes full refund from partial refund.
- Since `first_session_discount_applied` is never reset (see Area 4), partial refund preservation is moot -- the flag stays `True` regardless.

**Gaps found**:

1. **No refund handler exists at all** -- neither full nor partial.
2. **No Stripe webhook integration** to receive refund events.
3. **No distinction between full and partial refund** for discount flag management.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **HIGH** | Implement a refund processing endpoint or Stripe webhook handler. When handling refunds, distinguish full vs partial and apply BRD rules for discount flag reset. |
| 2 | **MEDIUM** | For partial refund: ensure `first_session_discount_applied` remains `True`. For full refund of a session that occurred: clarify BRD intent (likely keep `True`). |

---

## 6. Provider Changes Discount Percentage Mid-Window

**Verdict**: FAIL -- dynamic read, no snapshotting

**Evidence**:
- `get_checkout_discount()` in `utils.py:98` reads the discount dynamically from the provider at checkout time:
  ```python
  discount_int = getattr(provider, 'attribution_discount_percent', None)
  ```
- The `ProfileAttributionToken` model (`models.py:43-69`) has no field to snapshot the discount percentage at token creation time. Fields are: `provider`, `client`, `source`, `status`, `expires_at`, `first_booking_at`, `first_session_discount_applied`, `referer`.
- `create_attribution_token()` in `utils.py:135-179` does not read or store `attribution_discount_percent`.
- `AttributionCheckoutStatusView` also reads dynamically: `discount_pct = provider.attribution_discount_percent` (line 170).

**Impact**: A provider could set 15%, attract attributed clients, then reduce to 5% before those clients book. The clients receive 5% instead of the 15% that was in effect when they were attributed.

**Gaps found**:

1. **Discount percentage is not snapshotted on the token at creation time.** It is always read from the current provider profile at checkout.
2. **No test validates behavior when provider changes discount after token creation.**
3. **Potential commercial risk**: Provider could bait-and-switch, or conversely, a provider could unintentionally give a higher discount than intended if they increase the percentage after attribution.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **HIGH** | Add `discount_percent_at_creation` (IntegerField, nullable) to `ProfileAttributionToken`. Populate at token creation. Use this value in `get_checkout_discount()` instead of the live provider field. |
| 2 | **MEDIUM** | Add test: create token at 10%, change provider to 5%, call `get_checkout_discount()`, assert returns 10% (snapshotted value). |

---

## 7. No Discount Configured -- Clean Neutral State

**Verdict**: PARTIAL PASS

**Evidence**:
- `AttributionCheckoutStatusView` (line 164-168): When no CONFIRMED token with `first_session_discount_applied=False` exists, returns `{'is_first_attributed_session': False, 'discount_percent': None}`.
- When token exists but `provider.attribution_discount_percent` is `None`, the view returns `{'is_first_attributed_session': True, 'discount_percent': None}` -- this is a **problem**. It tells the frontend "this IS a first attributed session" but with null discount, which is confusing.
- `get_checkout_discount()` (line 98-100) handles `None` correctly: `if not discount_int: return (None, False)`. Note: `0` would also evaluate falsy here, so `0` is handled the same as `None`.
- Frontend is irrelevant since no frontend component exists (see Area 1).
- Test exists: `test_no_discount_when_provider_not_configured` confirms `(None, False)` from `get_checkout_discount()`.

**Gaps found**:

1. **`AttributionCheckoutStatusView` returns `is_first_attributed_session=True` with `discount_percent=None`** when a token exists but provider has no discount configured. This is semantically misleading and could cause frontend rendering bugs if/when the UI is built.
2. **No test for the checkout-status view** with a valid token but `attribution_discount_percent=None`.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **MEDIUM** | In `AttributionCheckoutStatusView`, check `provider.attribution_discount_percent` before returning `is_first_attributed_session=True`. If discount is None, return `is_first_attributed_session=False`. |
| 2 | **LOW** | Add test case for checkout-status endpoint: valid token + no provider discount -> `is_first_attributed_session=False`. |

---

## 8. Concurrent Checkouts -- Locking and Scalability

**Verdict**: PASS (with minor observation)

**Evidence**:
- `get_checkout_discount()` uses `transaction.atomic()` + `select_for_update()` (line 77-111 of `utils.py`). This acquires a row-level lock on the specific `ProfileAttributionToken` row.
- The filter includes `provider=provider, client=client` -- each attributed client has their own token row, so 50 different clients lock 50 different rows. No contention.
- The `unique_active_attribution_token` constraint (`models.py:73-76`) ensures only one active token per (provider, client) pair: `UniqueConstraint(fields=['provider', 'client'], condition=Q(status__in=['pending', 'confirmed']))`.
- The pattern is check-and-set within a single `atomic()` block: read `first_session_discount_applied`, if False set to True and save. This prevents double-application for the same client.
- No `nowait=True` is configured, so if the same client somehow fires two concurrent checkout requests, the second will block (not error). This is acceptable behavior.

**Gaps found**:

1. **No load/concurrency test exists.** The `test_discount_sets_flag_atomically` test verifies sequential idempotency but not true concurrent access.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **LOW** | Consider adding a concurrent test using `threading` or `TransactionTestCase` to validate that two simultaneous `get_checkout_discount()` calls for the same token result in exactly one discount application. |

---

## 9. Non-Attributed Client -- Discount Isolation

**Verdict**: PASS

**Evidence**:
- `AttributionCheckoutStatusView` (line 157-162) filters by **both** `provider=provider` and `client=client`, plus `status=CONFIRMED` and `first_session_discount_applied=False`. This correctly scopes to the specific (client, provider) pair.
- A non-attributed client (no token at all) gets `{'is_first_attributed_session': False, 'discount_percent': None}` (line 164-168).
- A client attributed to Provider A but booking with Provider B: the filter `provider=provider_B, client=client` returns no token, so no discount. Correct.
- `get_checkout_discount()` in `utils.py` also filters by both `provider` and `client` (line 82-83).
- Endpoint requires `IsAuthenticated` (line 142), and uses `request.user.client` to identify the client (line 153). A client cannot impersonate another client.
- Test `test_checkout_status_view_no_attribution` confirms no-token returns the correct neutral response.

**Gaps found**:

1. **No test for cross-provider isolation** (client attributed to Provider A, checking discount for Provider B).

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **LOW** | Add test: client attributed to Provider A, calls checkout-status for Provider B -> `is_first_attributed_session=False`. |

---

## 10. Finance Reporting -- Audit Trail and Dispute Resolution

**Verdict**: FAIL

**Evidence**:
- **No `discount_amount` or `discount_percent` is stored on the Appointment model** (`apps/calendar_functionality/models.py:79-129`). The model has `amount_in_cents`, `payment_intent_id`, `paypal_order_id`, `paypal_auth_id` -- but no discount fields.
- The `ProfileAttributionToken` stores `first_session_discount_applied` (bool) but not **which discount percentage was applied** or the **dollar amount of the discount**.
- No Stripe metadata includes discount information (PaymentIntent creation at line 58-63 of `stripe_integration/views.py` passes no metadata).
- PayPal order payload (line 351-383) does not include discount metadata either -- the amount is already reduced but the payload does not explain why.
- Django Admin for `ProfileAttributionToken` shows `first_session_discount_applied` as a filter/display field, but this only shows True/False, not the amount.
- No management command or admin view exists for exporting discount usage per provider per period.
- Provider consent is implicitly recorded via the `attribution_discount_percent` field on CareProvider, but there is no timestamp of when the value was changed (no audit trail on the field itself, and `BaseModel` only has `created_at`/`modified_at` for the CareProvider record).

**Gaps found**:

1. **No persistent record of discount amount or percentage applied** at the transaction level.
2. **No audit trail on when provider changed `attribution_discount_percent`**. The `modified_at` on CareProvider updates on any save, not specifically discount changes.
3. **No Stripe or PayPal metadata** records the discount.
4. **No finance export or reporting tool** for discount usage.
5. **Dispute resolution is weak**: In a dispute, one can only show that `first_session_discount_applied=True` on the token and that the provider currently has `attribution_discount_percent=X`, but cannot prove what value was applied at the time of the transaction or the dollar amount.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **CRITICAL** | Persist `discount_percent_applied` and `discount_amount_cents` on the Appointment at checkout time. |
| 2 | **HIGH** | Add a `DiscountAuditLog` model or use django-auditlog to track changes to `attribution_discount_percent`. |
| 3 | **HIGH** | Include discount metadata in Stripe PaymentIntent and PayPal order payloads. |
| 4 | **MEDIUM** | Build a Django management command or admin report: provider ID, client ID, appointment ID, discount %, discount $, date. |

---

## Additional Finding: PayPal Authentication Gap

**Verdict**: SECURITY CONCERN

**Evidence**:
- `PayPalCreatePaymentAPIView` (line 290-293 of `stripe_integration/views.py`) has authentication **commented out**:
  ```python
  class PayPalCreatePaymentAPIView(APIView):
      # authentication_classes = [JWTAuthentication]
      # permission_classes = [IsAuthenticated]
  ```
- `PayPalCapturePaymentAPIView` (line 404-412) also has **no authentication classes** defined at all.
- This means **any unauthenticated user** can create PayPal orders and capture PayPal authorizations by calling the public API.
- The `get_checkout_discount()` call inside `PayPalCreatePaymentAPIView` (line 327-328) uses `appt.care_provider` and `appt.client` from the appointment record. An unauthenticated attacker who knows an appointment ID could trigger the discount flag to be marked as applied, **consuming the client's one-time discount without their knowledge**.
- The capture endpoint (`PayPalCapturePaymentAPIView`) is also unauthenticated and could allow unauthorized payment captures.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **CRITICAL** | Uncomment and enforce `JWTAuthentication` + `IsAuthenticated` on `PayPalCreatePaymentAPIView`. |
| 2 | **CRITICAL** | Add `authentication_classes` and `permission_classes` to `PayPalCapturePaymentAPIView`. |
| 3 | **CRITICAL** | Validate that the authenticated user is the client associated with the appointment before applying the discount. |

---

## Additional Finding: Stripe Flow Missing Discount Application

**Evidence**:
- `PaymentIntentAPIView` (line 36-67 of `stripe_integration/views.py`) creates a Stripe PaymentIntent with `amount=request.data.get('amount')` -- it takes the amount directly from the frontend with **no server-side discount application**.
- Only the PayPal flow (`PayPalCreatePaymentAPIView`, line 320-345) calls `get_checkout_discount()` and adjusts the amount.
- If a client pays via Stripe, the discount is never applied. They pay full price.

| Gap | Severity | Recommended Fix |
|-----|----------|-----------------|
| 1 | **CRITICAL** | Add `get_checkout_discount()` logic to `PaymentIntentAPIView` to apply the discount before creating the Stripe PaymentIntent. Do not trust the amount from the frontend. |

---

## Summary Table

| Area | Verdict | Gap Count | Highest Severity |
|------|---------|-----------|-----------------|
| 1. Checkout display | Not Implemented | 4 | CRITICAL |
| 2. Provider revenue impact | Not Implemented | 3 | CRITICAL |
| 3. Discount enablement flow | Not Implemented (backend only) | 3 | HIGH |
| 4. Post-cancellation reset | Not Implemented | 3 | CRITICAL |
| 5. Partial refund | Not Implemented | 3 | HIGH |
| 6. Mid-window % change | Fail | 2 | HIGH |
| 7. No discount configured | Partial Pass | 2 | MEDIUM |
| 8. Concurrent checkouts | Pass | 1 | LOW |
| 9. Non-attributed client | Pass | 1 | LOW |
| 10. Finance reporting | Fail | 4 | CRITICAL |
| -- PayPal auth (bonus) | Security Concern | 3 | CRITICAL |
| -- Stripe discount (bonus) | Not Implemented | 1 | CRITICAL |

**Total gaps**: 30
**CRITICAL**: 12
**HIGH**: 10
**MEDIUM**: 5
**LOW**: 3

---

## Executive Summary

The provider-funded discount feature has solid backend primitives -- the `ProfileAttributionToken` model, `get_checkout_discount()` with row-level locking, and the `AttributionCheckoutStatusView` API are well-designed and tested. However, the feature is **commercially incomplete and has critical gaps**:

1. **The frontend is entirely unwired** -- no checkout UI shows the discount to clients, and the backend API goes uncalled.
2. **The discount only applies to PayPal payments**, not Stripe. Stripe payments ignore the discount entirely.
3. **PayPal payment endpoints are unauthenticated** -- a critical security exposure that also enables discount flag manipulation.
4. **No financial audit trail** -- the discount amount is never persisted, making dispute resolution and monthly reporting impossible.
5. **Cancellation does not reset the discount** -- clients who cancel lose their one-time discount permanently.
6. **The discount percentage is read dynamically**, not snapshotted -- providers can change it retroactively.
7. **No provider dashboard UI** exists to configure the discount -- it can only be set via Django Admin.

The locking mechanism (Area 8) and attribution isolation (Area 9) are well-implemented and represent the strongest parts of the feature.
