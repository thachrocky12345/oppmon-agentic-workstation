# Final Corrected Plan: RGDEV-186 Provider-Funded Client Discount

**Date**: 2026-03-14
**Branch**: `RGDEV-186/provider-discount`
**Commit**: `8fc7f14`
**Sources**: DataModel fix plan, UXScenario fix plan, implementer code review

---

## Summary of IMPLEMENTER's Work (commit 8fc7f14)

The implementer built:

1. **`AttributionCheckoutStatusView`** (`apps/attribution/views.py`) — GET endpoint returning discount eligibility. **KEEP with corrections.**
2. **PayPal discount application** (`apps/stripe_integration/views.py`) — `PayPalCreatePaymentAPIView.post` calls `get_checkout_discount()` before creating the PayPal order. **KEEP with corrections.**
3. **PayPal capture safety net** (`apps/stripe_integration/views.py`) — `PayPalCapturePaymentAPIView.post` marks `first_session_discount_applied=True` after capture. **KEEP with corrections.**
4. **Tests** (`apps/attribution/tests/test_provider_discount.py`) — unit tests for `get_checkout_discount()` and `AttributionCheckoutStatusView`. **KEEP, extend.**
5. **URL registration** (`apps/attribution/urls.py`) — added `checkout-status/` path. **KEEP as-is.**

### What the implementer did NOT build (gaps)

- Stripe path discount (PaymentIntentAPIView/ConfirmPaymentAPIView)
- Split of `get_checkout_discount()` into read-only check + post-capture mark
- PayPal endpoint authentication
- `expires_at` filter on checkout-status view
- PENDING status inclusion in checkout-status view
- Cancellation discount reset
- Appointment discount audit trail fields
- Discount snapshot on `ProfileAttributionToken`
- Stripe webhook for payment confirmation

---

## Deduplicated Fix List

Both audit plans overlap substantially. Below is the deduplicated, ordered list.

| # | Severity | Fix | DataModel | UXScenario | Cross-ticket |
|---|----------|-----|-----------|------------|-------------|
| 1 | CRITICAL | PayPal endpoints unauthenticated | DM-Fix3 | UX-Fix6 | No |
| 2 | CRITICAL | Split `get_checkout_discount()` into check + mark | DM-Fix2 | — | No |
| 3 | CRITICAL | Stripe path missing discount | DM-Fix1 | UX-Fix2 | No |
| 4 | CRITICAL | Audit trail fields on Appointment | — | UX-Fix3 | No |
| 5 | HIGH | checkout-status missing `expires_at` filter | DM-Fix4 | — | No |
| 6 | MEDIUM | checkout-status PENDING/CONFIRMED mismatch | DM-Fix5 | — | No |
| 7 | HIGH | Discount snapshot on ProfileAttributionToken | — | UX-Fix4 | No |
| 8 | HIGH | Cancellation never resets discount flag | DM-Fix6 | UX-Fix5 | No |
| 9 | MEDIUM | checkout-status semantic fix (discount=None -> False) | — | UX-Additional | No |
| 10 | MEDIUM | Stripe webhook for post-capture mark | DM-Fix2-Step5 | — | No |

**Cross-ticket items**:
- Fix 1 (PayPal auth) also affects any future PayPal endpoint work. Not specific to another RGDEV ticket, but it is a pre-existing security hole.
- Fix 10 (Stripe webhook) is infrastructure that benefits all Stripe payment flows (RGDEV-184 dynamic fees, future refund handling).
- Frontend wiring (UX-Fix1) is explicitly deferred to **RGDEV-206**.

---

## Implementation Sequence

### Phase 1: Security (no dependencies)

#### Fix 1 — Restore PayPal Authentication (CRITICAL)

**Files**: `apps/stripe_integration/views.py`
**IMPLEMENTER code**: INCORRECT (left auth commented out)
**Action**: REPLACE

**Change 1a** — `PayPalCreatePaymentAPIView` (uncomment auth):

```python
# BEFORE (implementer code):
class PayPalCreatePaymentAPIView(APIView):
    # authentication_classes = [JWTAuthentication]
    # permission_classes = [IsAuthenticated]

# AFTER:
class PayPalCreatePaymentAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
```

**Change 1b** — `PayPalCapturePaymentAPIView` (add auth):

```python
# BEFORE (implementer code):
class PayPalCapturePaymentAPIView(APIView):
    """
    Given an appointment_id, fetch its PayPal authorization ID,
    ...
    """
    def post(self, request):

# AFTER:
class PayPalCapturePaymentAPIView(APIView):
    """
    Given an appointment_id, fetch its PayPal authorization ID,
    ...
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
```

**Change 1c** — Ownership check in `PayPalCapturePaymentAPIView.post`, after appointment lookup:

```python
# AFTER: appointment = Appointment.objects.get(id=appointment_id)
# ADD:
if appointment.client.user != request.user:
    return Response(
        {"detail": "Not authorized for this appointment."},
        status=status.HTTP_403_FORBIDDEN,
    )
```

**Change 1d** — Ownership check in `PayPalCreatePaymentAPIView.post`, after appointment lookup:

```python
# AFTER: appt = Appointment.objects.get(id=appointment_id)
# ADD:
if appt.client.user != request.user:
    return Response(
        {"detail": "Not authorized for this appointment."},
        status=status.HTTP_403_FORBIDDEN,
    )
```

---

### Phase 2: Core Logic Split (other fixes depend on this)

#### Fix 2 — Split `get_checkout_discount()` into `check_checkout_discount()` + `mark_discount_applied()` (CRITICAL)

**File**: `apps/attribution/utils.py`
**IMPLEMENTER code**: Has the original monolithic `get_checkout_discount()`. **KEEP but deprecate.**
**Action**: ADD two new functions, deprecate old.

**Change 2a** — Add `check_checkout_discount()` before `get_checkout_discount()`:

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

        # Prefer snapshot, fall back to live value (Fix 7)
        discount_int = getattr(token, 'discount_percent_at_creation', None)
        if discount_int is None:
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

**Change 2b** — Add `mark_discount_applied()` after `check_checkout_discount()`:

```python
def mark_discount_applied(provider, client, discount_amount_cents=None):
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
            token.save(update_fields=update_fields)
            return True

    except Exception:
        logger.exception(
            "Error marking discount applied for provider=%s client=%s",
            provider, client,
        )
        return False
```

**Change 2c** — Add `reset_discount_on_cancellation()` (used by Fix 8):

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

**Change 2d** — Deprecate old `get_checkout_discount()`:

```python
# BEFORE (implementer code, first line of function):
def get_checkout_discount(provider, client):
    """
    Returns (discount_percent_as_decimal, is_first_attributed_session).
    ...

# AFTER:
def get_checkout_discount(provider, client):
    """
    DEPRECATED — use check_checkout_discount() + mark_discount_applied().
    This function sets the flag at call time, which burns it before payment
    capture. Retained temporarily for backward compatibility.

    Returns (discount_percent_as_decimal, is_first_attributed_session).
    ...
```

**Change 2e** — Update PayPal order creation call site:

```python
# BEFORE (implementer code, in PayPalCreatePaymentAPIView.post):
from apps.attribution.utils import get_checkout_discount, get_telehealth_fee
...
discount_pct, is_attributed_first_session = get_checkout_discount(
    provider=appt.care_provider,
    client=appt.client,
)

# AFTER:
from apps.attribution.utils import check_checkout_discount, get_telehealth_fee, mark_discount_applied
...
discount_pct, is_attributed_first_session = check_checkout_discount(
    provider=appt.care_provider,
    client=appt.client,
)
```

**Change 2f** — Update PayPal capture safety net to use `mark_discount_applied()`:

```python
# BEFORE (implementer code, in PayPalCapturePaymentAPIView.post):
try:
    from apps.attribution.models import ProfileAttributionToken, AttributionStatus
    ProfileAttributionToken.objects.filter(
        provider=appointment.care_provider,
        client=appointment.client,
        status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
        first_session_discount_applied=False,
    ).update(first_session_discount_applied=True)
except Exception:
    logger.exception(
        "Failed to mark attribution discount as used after capture",
        extra={"appointment_id": str(appointment.id)},
    )

# AFTER:
from apps.attribution.utils import mark_discount_applied
mark_discount_applied(
    provider=appointment.care_provider,
    client=appointment.client,
)
```

**Change 2g** — Update import at top of `stripe_integration/views.py`:

```python
# BEFORE:
from apps.attribution.utils import get_checkout_discount, get_telehealth_fee

# AFTER:
from apps.attribution.utils import check_checkout_discount, mark_discount_applied, get_telehealth_fee
```

---

### Phase 3: Stripe Discount Application

#### Fix 3 — Stripe Path Missing Discount (CRITICAL)

**File**: `apps/stripe_integration/views.py`, class `PaymentIntentAPIView.post`
**IMPLEMENTER code**: Takes `amount` from `request.data`, passes directly to Stripe. **REPLACE.**
**Action**: Compute amount server-side from appointment, apply discount.

```python
# BEFORE (implementer code, inside PaymentIntentAPIView.post, after mock block):
user = request.user
user_profile = StripeUser.objects.get(user=user)
amount = request.data.get('amount')  # Amount in cents
currency = request.data.get('currency', 'usd')
appointment_id = request.data.get('appointmentId')
payment_intent = stripe.PaymentIntent.create(
    amount=amount,
    currency=currency,
    customer=user_profile.stripe_customer_id,
    idempotency_key=f"pi_{appointment_id}_{user.id}",
)
appointment = Appointment.objects.get(id=appointment_id)
appointment.payment_intent_id = payment_intent.id
appointment.save()
return Response({'clientSecret': payment_intent})

# AFTER:
user = request.user
user_profile = StripeUser.objects.get(user=user)
currency = request.data.get('currency', 'usd')
appointment_id = request.data.get('appointmentId')

if not appointment_id:
    return Response(
        {'error': 'appointmentId is required'},
        status=status.HTTP_400_BAD_REQUEST,
    )

appointment = Appointment.objects.get(id=appointment_id)

# Server-side authoritative amount
base_amount = appointment.amount_in_cents
if not base_amount:
    # Fallback to client-supplied amount (backward compat)
    base_amount = int(request.data.get('amount', 0))
if not base_amount:
    return Response(
        {'error': 'Appointment has no amount set'},
        status=status.HTTP_400_BAD_REQUEST,
    )

# Apply first-session attribution discount
final_amount = base_amount
discount_pct, is_attributed = check_checkout_discount(
    provider=appointment.care_provider,
    client=appointment.client,
)

metadata = {}
discount_amount_cents = 0
if discount_pct:
    discount_amount_cents = int(
        (Decimal(base_amount) * discount_pct).quantize(
            Decimal('1'), rounding=ROUND_HALF_UP
        )
    )
    final_amount = base_amount - discount_amount_cents
    metadata['attribution_discount_percent'] = str(int(discount_pct * 100))
    metadata['attribution_discount_amount_cents'] = str(discount_amount_cents)
    logger.info(
        "First-session discount applied to Stripe PaymentIntent",
        extra={
            "appointment_id": str(appointment_id),
            "original_cents": base_amount,
            "discount_pct": str(discount_pct),
            "discount_cents": discount_amount_cents,
            "charged_cents": final_amount,
        },
    )

    # Persist audit trail on appointment (Fix 4 fields)
    appointment.discount_percent_applied = int(discount_pct * 100)
    appointment.discount_amount_cents = discount_amount_cents

payment_intent = stripe.PaymentIntent.create(
    amount=final_amount,
    currency=currency,
    customer=user_profile.stripe_customer_id,
    idempotency_key=f"pi_{appointment_id}_{user.id}",
    metadata=metadata,
)
appointment.payment_intent_id = payment_intent.id
appointment.save()

# Mark discount as used after PI is successfully created
if discount_pct and discount_amount_cents > 0:
    mark_discount_applied(
        provider=appointment.care_provider,
        client=appointment.client,
        discount_amount_cents=discount_amount_cents,
    )

return Response({'clientSecret': payment_intent})
```

**Note**: Since we are using the interim approach (mark at PI creation rather than webhook), the flag burn happens after Stripe accepts the PI. This is acceptable because the PI is already committed. The webhook (Fix 10) can be added later for full robustness.

**Also for `ConfirmPaymentAPIView.post`**: This view also takes `amount` from `request.data`. Add `appointmentId` to its request contract and apply the same discount pattern. For now, add a TODO comment if the full refactor is deferred:

```python
# In ConfirmPaymentAPIView.post, after the mock block:
# TODO(RGDEV-186): Add appointmentId to request, compute amount server-side,
# apply check_checkout_discount() + mark_discount_applied() like PaymentIntentAPIView.
```

---

### Phase 4: Data Model Additions

#### Fix 4 — Audit Trail Fields on Appointment (CRITICAL)

**File**: `apps/calendar_functionality/models.py`, class `Appointment`
**IMPLEMENTER code**: No changes. **ADD fields.**

After the `currency` field (around line 111):

```python
# ADD after currency field:
discount_percent_applied = models.IntegerField(
    null=True, blank=True,
    help_text='Attribution discount percentage applied at checkout (e.g. 5, 10, 15)',
)
discount_amount_cents = models.IntegerField(
    null=True, blank=True,
    help_text='Attribution discount amount in cents applied at checkout',
)
```

**Migration**:
```bash
python manage.py makemigrations calendar_functionality -n add_discount_fields_to_appointment
python manage.py migrate
```

**Also update PayPal order creation** to persist audit trail (in `PayPalCreatePaymentAPIView.post`):

```python
# AFTER discount calculation, ADD:
if discount_pct:
    discount_amount = (original_amount * discount_pct).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP,
    )
    amount = str(original_amount - discount_amount)
    # Persist audit trail
    appt.discount_percent_applied = int(discount_pct * 100)
    appt.discount_amount_cents = int(discount_amount * 100)
    appt.save(update_fields=['discount_percent_applied', 'discount_amount_cents'])
```

---

#### Fix 7 — Discount Snapshot on ProfileAttributionToken (HIGH)

**File**: `apps/attribution/models.py`, class `ProfileAttributionToken`
**IMPLEMENTER code**: No snapshot field. **ADD.**

After `first_session_discount_applied` field:

```python
# ADD:
discount_percent_at_creation = models.IntegerField(
    null=True, blank=True,
    help_text='Snapshot of provider.attribution_discount_percent at token creation time',
)
```

**Migration**:
```bash
python manage.py makemigrations attribution -n add_discount_snapshot_to_token
python manage.py migrate
```

**Update `create_attribution_token()` in `utils.py`** to populate at creation:

```python
# BEFORE (in ProfileAttributionToken.objects.create call):
token = ProfileAttributionToken.objects.create(
    provider=provider,
    client=client,
    source=source,
    expires_at=expires_at,
    referer=referer or '',
)

# AFTER:
token = ProfileAttributionToken.objects.create(
    provider=provider,
    client=client,
    source=source,
    expires_at=expires_at,
    referer=referer or '',
    discount_percent_at_creation=getattr(provider, 'attribution_discount_percent', None),
)
```

**Update `TrackAttributionView.post`** in `views.py` (both the create and existing-token paths):

```python
# In the token creation block:
token = ProfileAttributionToken.objects.create(
    provider=provider,
    client=client,
    source='profile',
    status=AttributionStatus.PENDING,
    expires_at=new_expires_at,
    referer=referer or '',
    discount_percent_at_creation=getattr(provider, 'attribution_discount_percent', None),
)
```

**`check_checkout_discount()` already uses snapshot** (see Change 2a above — `getattr(token, 'discount_percent_at_creation', None)` with fallback).

---

### Phase 5: Checkout-Status View Corrections

#### Fix 5 + Fix 6 + Fix 9 — Combined checkout-status filter and semantics (HIGH + MEDIUM + MEDIUM)

**File**: `apps/attribution/views.py`, class `AttributionCheckoutStatusView.get`
**IMPLEMENTER code**: Filters `status=AttributionStatus.CONFIRMED` only, no `expires_at` filter, returns `discount_percent=None` with `is_first_attributed_session=True` when provider has no discount. **REPLACE filter + response logic.**

```python
# BEFORE (implementer code):
token = ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
    status=AttributionStatus.CONFIRMED,
    first_session_discount_applied=False,
).first()

if not token:
    return Response({
        'is_first_attributed_session': False,
        'discount_percent': None,
    })

discount_pct = provider.attribution_discount_percent
return Response({
    'is_first_attributed_session': True,
    'discount_percent': discount_pct,
})

# AFTER:
token = ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
    status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
    first_session_discount_applied=False,
    expires_at__gt=timezone.now(),
).first()

if not token:
    return Response({
        'is_first_attributed_session': False,
        'discount_percent': None,
    })

# Prefer snapshot, fall back to live value
discount_pct = getattr(token, 'discount_percent_at_creation', None)
if discount_pct is None:
    discount_pct = provider.attribution_discount_percent

# If no discount configured, report as non-discounted
if not discount_pct:
    return Response({
        'is_first_attributed_session': False,
        'discount_percent': None,
    })

return Response({
    'is_first_attributed_session': True,
    'discount_percent': discount_pct,
})
```

---

### Phase 6: Cancellation Reset

#### Fix 8 — Cancellation Never Resets Discount Flag (HIGH)

**File**: `apps/calendar_functionality/views.py`
**IMPLEMENTER code**: No changes. **ADD.**

**Change 8a** — In the main cancellation handler (after `appointment.save()` around line 1440):

```python
# After: appointment.save()
# ADD:
# Reset first-session discount if the session hasn't occurred yet
if start_date_time > timezone.now():
    try:
        from apps.attribution.utils import reset_discount_on_cancellation
        reset_discount_on_cancellation(
            appointment.care_provider, appointment.client
        )
        # Clear audit trail fields on the cancelled appointment
        if getattr(appointment, 'discount_amount_cents', None):
            appointment.discount_percent_applied = None
            appointment.discount_amount_cents = None
            appointment.save(update_fields=[
                'discount_percent_applied', 'discount_amount_cents',
            ])
    except Exception:
        logger.exception(
            "Failed to reset attribution discount on cancellation for appointment=%s",
            appointment.id,
        )
```

**Change 8b** — In `AppointmentPaymentVoidView.post` (after `appointment.save(update_fields=[...])` around line 3406):

```python
# After: appointment.save(update_fields=[...])
# ADD:
try:
    from apps.attribution.utils import reset_discount_on_cancellation
    if appointment.start_date_time and appointment.start_date_time > timezone.now():
        reset_discount_on_cancellation(
            appointment.care_provider, appointment.client
        )
except Exception:
    logger.exception(
        "Failed to reset attribution discount on payment void for appointment=%s",
        appointment.id,
    )
```

---

### Phase 7: Stripe Webhook (MEDIUM, can be deferred)

#### Fix 10 — Stripe Webhook for Post-Capture Mark (MEDIUM)

**File**: NEW `apps/stripe_integration/webhooks.py`
**IMPLEMENTER code**: None. **ADD.**

This is lower priority because Fix 3 uses the interim approach (mark at PI creation). The webhook provides a more robust guarantee.

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

`STRIPE_WEBHOOK_SECRET` is already in `settings.py`.

---

## Files Changed Summary

| File | Fixes | Action |
|------|-------|--------|
| `apps/stripe_integration/views.py` | 1, 2e-g, 3 | MODIFY (PayPal auth, import changes, Stripe discount) |
| `apps/attribution/utils.py` | 2a-d, 7 (token creation), 8 (reset util) | MODIFY (add 3 functions, deprecate 1, update 1) |
| `apps/attribution/views.py` | 5, 6, 7 (snapshot usage), 9 | MODIFY (filter + response logic) |
| `apps/attribution/models.py` | 7 | MODIFY (add snapshot field) |
| `apps/calendar_functionality/models.py` | 4 | MODIFY (add 2 fields) |
| `apps/calendar_functionality/views.py` | 8 | MODIFY (cancel + void handlers) |
| `apps/stripe_integration/webhooks.py` | 10 | NEW (Stripe webhook) |
| `lumy_global/urls.py` | 10 | MODIFY (webhook route) |
| `apps/attribution/tests/test_provider_discount.py` | — | EXTEND (new tests for split functions, cancellation, Stripe) |

---

## IMPLEMENTER Code Disposition

| Component | Verdict | Notes |
|-----------|---------|-------|
| `AttributionCheckoutStatusView` structure | **KEEP** | Filter and response logic REPLACED (Fixes 5/6/7/9) |
| `TrackAttributionView` | **KEEP** | Add `discount_percent_at_creation` to create call (Fix 7) |
| PayPal discount in `PayPalCreatePaymentAPIView` | **KEEP** | Change `get_checkout_discount` -> `check_checkout_discount` (Fix 2e) |
| PayPal capture safety net | **KEEP** | Replace inline update with `mark_discount_applied()` (Fix 2f) |
| `get_checkout_discount()` body | **KEEP** | Deprecate, add two new functions alongside (Fix 2) |
| `PaymentIntentAPIView.post` | **REPLACE** | Server-side amount + discount (Fix 3) |
| Tests | **KEEP** | Extend with new test cases |
| URL registration | **KEEP** | No changes needed |

---

## Tests to Add

1. `test_check_checkout_discount_readonly` — verify `check_checkout_discount` does NOT set `first_session_discount_applied`
2. `test_mark_discount_applied_atomic` — verify `mark_discount_applied` sets flag, returns True
3. `test_mark_discount_applied_idempotent` — calling twice returns False on second call
4. `test_checkout_status_includes_pending` — PENDING tokens qualify
5. `test_checkout_status_rejects_expired` — expired tokens excluded
6. `test_checkout_status_no_discount_configured` — returns `is_first_attributed_session=False`
7. `test_stripe_discount_applied` — PaymentIntentAPIView computes correct discounted amount
8. `test_cancellation_resets_discount` — cancel before session time resets flag
9. `test_cancellation_no_reset_after_session` — cancel after session keeps flag
10. `test_paypal_auth_required` — unauthenticated request returns 401/403
11. `test_discount_snapshot_used_over_live` — token.discount_percent_at_creation preferred

---

## Cross-Ticket Items

| Item | Affected Ticket | Impact |
|------|----------------|--------|
| PayPal auth restoration (Fix 1) | All PayPal payment tickets | Security — any PayPal endpoint work is insecure until this lands |
| Stripe webhook (Fix 10) | RGDEV-184 (dynamic fees), future refund handling | Infrastructure — webhook needed for reliable post-payment processing |
| Frontend wiring | **RGDEV-206** | Explicitly out of scope for RGDEV-186; blocked on Fixes 3-7 landing first |
| `ConfirmPaymentAPIView` refactor | No ticket yet | Needs `appointmentId` in request to compute server-side amount; create follow-up ticket |
