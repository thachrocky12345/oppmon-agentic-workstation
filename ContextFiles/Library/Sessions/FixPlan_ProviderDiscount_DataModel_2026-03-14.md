# Fix Implementation Plan: RGDEV-186 Provider Discount Data Model

**Date**: 2026-03-14
**Source**: `Audit_ProviderDiscount_DataModel_Results_2026-03-14.md`
**Scope**: Six fixes across `stripe_integration`, `attribution`, and `calendar_functionality` apps

---

## Fix 1 — Stripe Path Missing Discount (CRITICAL)

**Audit Finding**: `PaymentIntentAPIView.post` (line 39, `stripe_integration/views.py`) takes `amount` directly from `request.data` and passes it to `stripe.PaymentIntent.create()` with no server-side discount computation. `get_checkout_discount()` is imported at line 15 but never called in any Stripe view.

**File**: `apps/stripe_integration/views.py`

**Insertion point**: Inside `PaymentIntentAPIView.post`, after line 57 (`appointment_id = request.data.get('appointmentId')`) and before line 58 (`payment_intent = stripe.PaymentIntent.create(...)`).

**Implementation**:

```python
# --- AFTER line 57 (appointment_id = request.data.get('appointmentId')) ---

# Server-side discount computation for attributed first sessions
if appointment_id:
    try:
        appt = Appointment.objects.get(id=appointment_id)
        original_amount = int(amount)  # amount is in cents (integer)
        discount_pct, is_first = get_checkout_discount(
            provider=appt.care_provider,
            client=appt.client,
        )
        if discount_pct:
            # discount_pct is Decimal (e.g. Decimal('0.10') for 10%)
            # amount is in cents (int), compute discount in cents
            discount_cents = int(
                (Decimal(original_amount) * discount_pct).quantize(
                    Decimal('1'), rounding=ROUND_HALF_UP
                )
            )
            amount = original_amount - discount_cents
            logger.info(
                "First-session discount applied to Stripe PaymentIntent",
                extra={
                    "appointment_id": str(appointment_id),
                    "original_cents": original_amount,
                    "discount_pct": str(discount_pct),
                    "discount_cents": discount_cents,
                    "charged_cents": amount,
                },
            )
    except Appointment.DoesNotExist:
        pass  # Fall through with original amount

# --- existing line 58: payment_intent = stripe.PaymentIntent.create(amount=amount, ...) ---
```

**Additional import needed at top of file**: `ROUND_HALF_UP` is already available (imported at line 25).

**Note**: This fix is interdependent with Fix 2. Once Fix 2 lands, the call here changes from `get_checkout_discount()` to `check_checkout_discount()` (read-only version). Apply both fixes together.

**Also applies to `ConfirmPaymentAPIView.post`** (line 193): Same pattern. `amount` is taken from `request.data` at line 197 with no discount logic. Add identical discount block after line 200 (`stripe_customer_id = request.data.get('stripeCustomerId')`), before line 202 (`payment_intent = stripe.PaymentIntent.create(...)`). However, `ConfirmPaymentAPIView` does not receive `appointmentId` in its current request schema. Either:
- (a) Add `appointmentId` to the request body and frontend call, or
- (b) Consolidate `ConfirmPaymentAPIView` and `PaymentIntentAPIView` into a single view (recommended long-term).

For now, add `appointmentId` to `ConfirmPaymentAPIView`'s request contract and apply the same discount block.

---

## Fix 2 — Premature Flag Burn (CRITICAL)

**Audit Finding**: `get_checkout_discount()` (lines 104-111, `attribution/utils.py`) sets `first_session_discount_applied=True` and saves immediately. This is called at PayPal order creation (line 327, `stripe_integration/views.py`) before the buyer approves payment. If the buyer abandons, the flag is permanently burned.

**File**: `apps/attribution/utils.py`

**Implementation**: Split `get_checkout_discount()` into two functions.

### Step 1 — Create read-only `check_checkout_discount()`

Add new function in `apps/attribution/utils.py` (insert before the existing `get_checkout_discount` at line 63):

```python
def check_checkout_discount(provider, client):
    """
    READ-ONLY check. Returns (discount_percent_as_decimal, True) if a
    first-session attribution discount is available, WITHOUT marking the
    flag. Call mark_discount_applied() after successful payment capture.

    Returns (None, False) when no discount is available.
    """
    try:
        token = (
            ProfileAttributionToken.objects
            .filter(
                provider=provider,
                client=client,
                status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
                expires_at__gt=timezone.now(),
            )
            .order_by('-created_at')
            .first()
        )
        if token is None or token.first_session_discount_applied:
            return (None, False)

        discount_int = getattr(provider, 'attribution_discount_percent', None)
        if not discount_int:
            return (None, False)

        discount_decimal = Decimal(discount_int) / Decimal('100')
        return (discount_decimal, True)

    except Exception:
        logger.exception(
            "Error checking checkout discount for provider=%s client=%s",
            provider, client,
        )
        return (None, False)
```

### Step 2 — Create `mark_discount_applied()`

Add new function in `apps/attribution/utils.py` (after `check_checkout_discount`):

```python
def mark_discount_applied(provider, client, discount_amount=None):
    """
    Atomically marks the first-session discount as used. Call ONLY after
    successful payment capture (Stripe webhook or PayPal capture response).

    Returns True if a token was marked, False otherwise.
    """
    try:
        with transaction.atomic():
            token = (
                ProfileAttributionToken.objects
                .select_for_update()
                .filter(
                    provider=provider,
                    client=client,
                    status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
                    expires_at__gt=timezone.now(),
                    first_session_discount_applied=False,
                )
                .order_by('-created_at')
                .first()
            )
            if token is None:
                return False

            token.first_session_discount_applied = True
            token.first_booking_at = token.first_booking_at or timezone.now()
            update_fields = [
                'first_session_discount_applied',
                'first_booking_at',
                'modified_at',
            ]
            # Persist discount amount if field exists (see Fix 9 in audit)
            if discount_amount is not None and hasattr(token, 'discount_amount'):
                token.discount_amount = discount_amount
                update_fields.append('discount_amount')
            token.save(update_fields=update_fields)
            return True

    except Exception:
        logger.exception(
            "Error marking discount applied for provider=%s client=%s",
            provider, client,
        )
        return False
```

### Step 3 — Deprecate old `get_checkout_discount()`

Add a deprecation docstring to the existing function. Do NOT delete it yet (callers may exist in worktrees). Mark it:

```python
def get_checkout_discount(provider, client):
    """
    DEPRECATED — use check_checkout_discount() + mark_discount_applied().
    This function sets the flag at call time, which burns it before payment capture.
    Retained temporarily for backward compatibility.
    """
    # ... existing body unchanged ...
```

### Step 4 — Update call sites

**PayPal order creation** (`stripe_integration/views.py`, line 327):
Replace `get_checkout_discount(...)` with `check_checkout_discount(...)`. The discount amount is computed identically; the only change is the function name.

```python
# Line 327 — BEFORE:
discount_pct, is_attributed_first_session = get_checkout_discount(
    provider=appt.care_provider,
    client=appt.client,
)

# AFTER:
discount_pct, is_attributed_first_session = check_checkout_discount(
    provider=appt.care_provider,
    client=appt.client,
)
```

**PayPal capture** (`stripe_integration/views.py`, lines 498-510):
Replace the existing `ProfileAttributionToken.objects.filter(...).update(...)` safety-net block with a call to `mark_discount_applied()`:

```python
# Lines 498-510 — REPLACE with:
from apps.attribution.utils import mark_discount_applied
mark_discount_applied(
    provider=appointment.care_provider,
    client=appointment.client,
)
```

**Stripe path** (Fix 1 above):
Use `check_checkout_discount()` at PaymentIntent creation. Add `mark_discount_applied()` call in a Stripe webhook handler for `payment_intent.succeeded` (new endpoint, see below).

### Step 5 — Add Stripe webhook for payment confirmation

Since no Stripe webhook handler exists in the codebase (confirmed in audit finding #4), create a minimal one.

**New file**: `apps/stripe_integration/webhooks.py`

```python
import stripe
import logging
from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from apps.calendar_functionality.models import Appointment
from apps.attribution.utils import mark_discount_applied

logger = logging.getLogger(__name__)

@csrf_exempt
@require_POST
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE', '')
    endpoint_secret = getattr(settings, 'STRIPE_WEBHOOK_SECRET', '')

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except (ValueError, stripe.error.SignatureVerificationError):
        return HttpResponse(status=400)

    if event['type'] == 'payment_intent.succeeded':
        pi = event['data']['object']
        pi_id = pi['id']
        try:
            appointment = Appointment.objects.get(payment_intent_id=pi_id)
            mark_discount_applied(
                provider=appointment.care_provider,
                client=appointment.client,
            )
        except Appointment.DoesNotExist:
            logger.warning("Webhook: no appointment for PI %s", pi_id)

    return HttpResponse(status=200)
```

**URL registration** in `lumy_global/urls.py`:
```python
from apps.stripe_integration.webhooks import stripe_webhook
urlpatterns += [
    path('api/v1/stripe/webhook/', stripe_webhook, name='stripe-webhook'),
]
```

**New setting** in `lumy_global/settings.py`:
```python
STRIPE_WEBHOOK_SECRET = env('STRIPE_WEBHOOK_SECRET', default='')
```

**Interim alternative** (if webhook infrastructure is deferred): Call `mark_discount_applied()` synchronously inside `PaymentIntentAPIView.post` immediately after `stripe.PaymentIntent.create()` returns successfully, since the PI is in `requires_payment_method` state. Then call it again in `ConfirmPaymentAPIView.post` after `stripe.PaymentIntent.confirm()` succeeds. This is less robust than a webhook but eliminates the premature-burn timing issue.

---

## Fix 3 — PayPal Endpoints Unauthenticated (CRITICAL)

**Audit Finding**: `PayPalCreatePaymentAPIView` (lines 291-292) has `authentication_classes` and `permission_classes` commented out. `PayPalCapturePaymentAPIView` (line 404) has neither defined. Both are fully unauthenticated.

**File**: `apps/stripe_integration/views.py`

### Change 1 — `PayPalCreatePaymentAPIView` (line 290-292)

```python
# BEFORE (lines 290-292):
class PayPalCreatePaymentAPIView(APIView):
    # authentication_classes = [JWTAuthentication]
    # permission_classes = [IsAuthenticated]

# AFTER:
class PayPalCreatePaymentAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
```

Uncomment lines 291 and 292.

### Change 2 — `PayPalCapturePaymentAPIView` (line 404)

```python
# BEFORE (line 404):
class PayPalCapturePaymentAPIView(APIView):

# AFTER:
class PayPalCapturePaymentAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
```

Insert two lines after the class declaration, before the docstring.

### Change 3 — Add ownership check to `PayPalCapturePaymentAPIView.post`

After the appointment lookup (line 426), add:

```python
# After: appointment = Appointment.objects.get(id=appointment_id) (line 426)
# Add ownership check:
if appointment.client.user != request.user:
    return Response(
        {"detail": "You are not authorized to capture this payment."},
        status=status.HTTP_403_FORBIDDEN,
    )
```

### Frontend impact

The frontend must send the JWT `Authorization: Bearer <token>` header with PayPal payment requests. Verify that the Axios instance used for PayPal calls includes the auth interceptor. Check `RG-Frontend/src/store/axiosInstance.ts` — if PayPal calls use a separate Axios instance or `fetch()` without auth headers, update them.

---

## Fix 4 — checkout-status Missing `expires_at` Filter (HIGH)

**Audit Finding**: `AttributionCheckoutStatusView` (line 157-162, `attribution/views.py`) does not filter by `expires_at__gt=timezone.now()`. An expired CONFIRMED token with `first_session_discount_applied=False` would falsely report a discount is available.

**File**: `apps/attribution/views.py`

**Exact change** at lines 157-162:

```python
# BEFORE:
token = ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
    status=AttributionStatus.CONFIRMED,
    first_session_discount_applied=False,
).first()

# AFTER:
token = ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
    status=AttributionStatus.CONFIRMED,
    first_session_discount_applied=False,
    expires_at__gt=timezone.now(),
).first()
```

This aligns with `get_checkout_discount()` (line 85 of `utils.py`) which already checks `expires_at__gt=timezone.now()`.

**Import needed**: `timezone` is already imported at line 5 of `views.py`.

---

## Fix 5 — checkout-status PENDING/CONFIRMED Mismatch (MEDIUM)

**Audit Finding**: `AttributionCheckoutStatusView` (line 160) filters `status=AttributionStatus.CONFIRMED` only. But `get_checkout_discount()` (line 84, `utils.py`) accepts `status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED]`. A PENDING token qualifies for the discount server-side but the frontend would show full price.

**File**: `apps/attribution/views.py`

**Exact change** at lines 157-162 (combined with Fix 4):

```python
# BEFORE:
token = ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
    status=AttributionStatus.CONFIRMED,
    first_session_discount_applied=False,
).first()

# AFTER (combines Fix 4 + Fix 5):
token = ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
    status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
    first_session_discount_applied=False,
    expires_at__gt=timezone.now(),
).first()
```

This makes the checkout-status endpoint's eligibility query exactly match `get_checkout_discount()` / `check_checkout_discount()`, ensuring the frontend and backend agree on discount availability.

---

## Fix 6 — No Cancellation Reset (HIGH)

**Audit Finding**: Cancellation handler (`calendar_functionality/views.py`, line 1421-1440) sets `is_status="CANCELLED"` and cancels the Stripe PI, but never resets `first_session_discount_applied`. The `AppointmentPaymentVoidView` (line 3317-3428) also does not touch attribution.

**File**: `apps/calendar_functionality/views.py`

### Change 1 — Main cancellation handler (around line 1440)

After `appointment.save()` at line 1440, add the attribution flag reset:

```python
# After line 1440: appointment.save()
# Add attribution discount reset:
try:
    from apps.attribution.models import ProfileAttributionToken, AttributionStatus
    ProfileAttributionToken.objects.filter(
        provider=appointment.care_provider,
        client=appointment.client,
        status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
        first_session_discount_applied=True,
    ).update(first_session_discount_applied=False)
except Exception:
    import logging
    logging.getLogger(__name__).exception(
        "Failed to reset attribution discount on cancellation for appointment=%s",
        appointment.id,
    )
```

### Change 2 — `AppointmentPaymentVoidView` (around line 3406)

After `appointment.save(update_fields=[...])` at line 3399-3406, add the same reset block:

```python
# After line 3406: appointment.save(update_fields=[...])
# Add attribution discount reset:
try:
    from apps.attribution.models import ProfileAttributionToken, AttributionStatus
    ProfileAttributionToken.objects.filter(
        provider=appointment.care_provider,
        client=appointment.client,
        status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
        first_session_discount_applied=True,
    ).update(first_session_discount_applied=False)
except Exception:
    logger.exception(
        "Failed to reset attribution discount on payment void for appointment=%s",
        appointment.id,
    )
```

### Scope guard

Only reset the flag when the session has NOT yet occurred. If the session already took place (past `start_date_time`), the discount was legitimately consumed. Add a time check:

```python
if appointment.start_date_time and appointment.start_date_time > timezone.now():
    # Session hasn't happened yet — reset the discount flag
    ProfileAttributionToken.objects.filter(
        provider=appointment.care_provider,
        client=appointment.client,
        status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
        first_session_discount_applied=True,
    ).update(first_session_discount_applied=False)
```

### Alternative: Extract to utility

To avoid duplicating the reset logic, add a utility in `apps/attribution/utils.py`:

```python
def reset_discount_on_cancellation(provider, client):
    """
    Resets first_session_discount_applied=False for the provider-client pair.
    Call when an appointment is cancelled BEFORE the session occurs.
    Returns the number of tokens reset.
    """
    try:
        return ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
            status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
            first_session_discount_applied=True,
        ).update(first_session_discount_applied=False)
    except Exception:
        logger.exception(
            "Failed to reset attribution discount for provider=%s client=%s",
            provider, client,
        )
        return 0
```

Then call `reset_discount_on_cancellation(appointment.care_provider, appointment.client)` from both cancellation handlers, guarded by the time check.

---

## Execution Order

These fixes have dependencies. Recommended implementation order:

| Order | Fix | Reason |
|-------|-----|--------|
| 1 | Fix 3 (PayPal auth) | Security — eliminates unauthenticated access. No code dependencies. |
| 2 | Fix 2 (split functions) | Creates `check_checkout_discount()` and `mark_discount_applied()` that Fixes 1 and 6 depend on. |
| 3 | Fix 1 (Stripe discount) | Uses `check_checkout_discount()` from Fix 2. |
| 4 | Fix 4 + Fix 5 (checkout-status) | Single edit to the same filter block. No dependencies on other fixes. |
| 5 | Fix 6 (cancellation reset) | Uses `reset_discount_on_cancellation()` or inline reset. Can optionally call `mark_discount_applied` in reverse. |

**Testing**: Each fix should include unit tests. The existing test files at `apps/attribution/tests/test_provider_discount.py` and `apps/attribution/tests/test_models.py` provide the patterns to follow.

---

## Files Modified by This Plan

| File | Fixes |
|------|-------|
| `apps/attribution/utils.py` | 2, 6 |
| `apps/attribution/views.py` | 4, 5 |
| `apps/stripe_integration/views.py` | 1, 2, 3 |
| `apps/stripe_integration/webhooks.py` (NEW) | 2 |
| `apps/calendar_functionality/views.py` | 6 |
| `lumy_global/urls.py` | 2 (webhook route) |
| `lumy_global/settings.py` | 2 (webhook secret) |
