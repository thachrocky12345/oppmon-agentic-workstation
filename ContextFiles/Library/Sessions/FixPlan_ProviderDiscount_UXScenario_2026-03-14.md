# Fix Implementation Plan: RGDEV-186 Provider-Funded Client Discount

**Source audit**: `Audit_ProviderDiscount_UXScenario_Results_2026-03-14.md`
**Date**: 2026-03-14

---

## Fix 1: Frontend Completely Unwired (CRITICAL)

**Ticket**: RGDEV-206 (frontend work)

### Backend API Contract (already implemented)

**Endpoint**: `GET /api/v1/attribution/checkout-status/?provider_id=<uuid>`
- **Auth**: `IsAuthenticated` (JWT)
- **View**: `AttributionCheckoutStatusView` (`apps/attribution/views.py:135`)

**Response shape**:

```json
// Discount available
{
  "is_first_attributed_session": true,
  "discount_percent": 10          // int: 5, 10, or 15
}

// No discount (non-attributed, already used, or provider not configured)
{
  "is_first_attributed_session": false,
  "discount_percent": null
}
```

### Frontend Implementation Required (RGDEV-206)

1. **API call**: In the booking/checkout flow, before rendering the payment summary, call:
   ```
   GET /api/v1/attribution/checkout-status/?provider_id={providerId}
   ```
   Use the existing Axios instance with JWT interceptor (`src/store/axiosInstance.ts`).

2. **Price display logic**: When `is_first_attributed_session === true && discount_percent !== null`:
   - Compute `discountAmount = originalPrice * (discount_percent / 100)`
   - Compute `finalPrice = originalPrice - discountAmount`
   - Render a price breakdown:
     ```
     Session fee:                    $100.00
     Welcome discount (10%):         -$10.00   (funded by your provider)
     ─────────────────────────────────────────
     You pay:                         $90.00
     ```

3. **Loading/error states**:
   - Show a skeleton/spinner over the price area while the checkout-status call is in flight.
   - On error (network failure, 4xx, 5xx): fall back to full price display with no discount line. Log the error. Do NOT block checkout.

4. **Stripe amount**: When creating the PaymentIntent, send the **discounted** `amount_in_cents` (after Fix 2 below, the backend will compute authoritatively; the frontend amount is only for display).

5. **PayPal amount**: The PayPal flow already applies discount server-side in `PayPalCreatePaymentAPIView`. The frontend should display the discounted price for consistency but does not need to pass the discounted amount; the backend computes it.

---

## Fix 2: Stripe Skips Discount (CRITICAL)

**Problem**: `PaymentIntentAPIView` (`apps/stripe_integration/views.py:36`) takes `amount` directly from `request.data` with no server-side validation or discount application. The PayPal flow correctly calls `get_checkout_discount()` but the Stripe flow does not.

### Implementation

**File**: `apps/stripe_integration/views.py`, class `PaymentIntentAPIView.post`

Replace the current amount handling (lines 55-63) with server-side computation:

```python
def post(self, request):
    # ... existing mock check ...

    user = request.user
    user_profile = StripeUser.objects.get(user=user)
    appointment_id = request.data.get('appointmentId')
    currency = request.data.get('currency', 'usd')

    if not appointment_id:
        return Response(
            {'error': 'appointmentId is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    appointment = Appointment.objects.get(id=appointment_id)

    # Compute authoritative amount server-side from the appointment rate
    base_amount = appointment.amount_in_cents
    if not base_amount:
        return Response(
            {'error': 'Appointment has no amount set'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Apply first-session attribution discount (mirrors PayPal flow)
    discount_pct, is_attributed = get_checkout_discount(
        provider=appointment.care_provider,
        client=appointment.client,
    )

    discount_amount_cents = 0
    final_amount = base_amount
    if discount_pct:
        discount_amount_cents = int(
            (Decimal(base_amount) * discount_pct).quantize(
                Decimal('1'), rounding=ROUND_HALF_UP
            )
        )
        final_amount = base_amount - discount_amount_cents

    # Persist discount on appointment (see Fix 3)
    if discount_amount_cents > 0:
        appointment.discount_percent_applied = int(discount_pct * 100)
        appointment.discount_amount_cents = discount_amount_cents

    metadata = {}
    if is_attributed and discount_pct:
        metadata['attribution_discount_percent'] = str(int(discount_pct * 100))
        metadata['attribution_discount_amount_cents'] = str(discount_amount_cents)

    payment_intent = stripe.PaymentIntent.create(
        amount=final_amount,
        currency=currency,
        customer=user_profile.stripe_customer_id,
        idempotency_key=f"pi_{appointment_id}_{user.id}",
        metadata=metadata,
    )

    appointment.payment_intent_id = payment_intent.id
    appointment.save()

    return Response({'clientSecret': payment_intent})
```

**Key changes**:
- `amount` is computed server-side from `appointment.amount_in_cents` -- never trusted from the client.
- `get_checkout_discount()` is called identically to the PayPal flow.
- Discount metadata is included in Stripe PaymentIntent for audit trail.
- Add `from decimal import Decimal, ROUND_HALF_UP` to imports (already present for PayPal section).

**Security note**: The frontend-supplied `amount` parameter is now ignored. The frontend should still display the correct price for UX consistency, but the backend is the authority.

---

## Fix 3: No Financial Audit Trail (CRITICAL)

**Problem**: The `Appointment` model has no fields to record discount details. The discount amount is computed transiently and never persisted.

### Implementation

**Step 1: Add fields to Appointment model**

**File**: `apps/calendar_functionality/models.py`, class `Appointment` (line 79)

Add after `currency` (line 111):

```python
discount_percent_applied = models.IntegerField(
    null=True, blank=True,
    help_text='Attribution discount percentage applied at checkout (e.g. 5, 10, 15)',
)
discount_amount_cents = models.IntegerField(
    null=True, blank=True,
    help_text='Attribution discount dollar amount in cents applied at checkout',
)
```

**Step 2: Generate and run migration**

```bash
python manage.py makemigrations calendar_functionality -n add_discount_fields_to_appointment
python manage.py migrate
```

**Step 3: Populate at checkout time**

In `PayPalCreatePaymentAPIView.post` (`apps/stripe_integration/views.py:290`), after the discount is computed (around line 335), persist on the appointment:

```python
if discount_pct:
    discount_amount = (original_amount * discount_pct).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP,
    )
    amount = str(original_amount - discount_amount)
    # Persist discount audit trail
    appt.discount_percent_applied = int(discount_pct * 100)
    appt.discount_amount_cents = int(discount_amount * 100)
    appt.save(update_fields=['discount_percent_applied', 'discount_amount_cents', 'modified_at'])
```

In `PaymentIntentAPIView.post` (Stripe flow -- see Fix 2 above), the same fields are populated.

**Step 4: Add discount metadata to PayPal order payload**

In `PayPalCreatePaymentAPIView.post`, after the payload is constructed (around line 383), add to the purchase unit:

```python
if is_attributed_first_session and discount_amount > 0:
    payload['purchase_units'][0]['custom_id'] = (
        f'attr_discount_{discount_pct}_{discount_amount}'
    )
```

---

## Fix 4: No Discount Snapshotting (HIGH)

**Problem**: `get_checkout_discount()` reads `provider.attribution_discount_percent` dynamically at checkout time (line 98 of `utils.py`). If the provider changes this value between token creation and checkout, the client gets a different discount than was in effect when attributed.

### Implementation

**Step 1: Add snapshot field to ProfileAttributionToken**

**File**: `apps/attribution/models.py`, class `ProfileAttributionToken` (line 43)

Add after `first_session_discount_applied` (line 68):

```python
discount_percent_at_creation = models.IntegerField(
    null=True, blank=True,
    help_text='Snapshot of provider.attribution_discount_percent at token creation time',
)
```

**Step 2: Migration**

```bash
python manage.py makemigrations attribution -n add_discount_snapshot_to_token
python manage.py migrate
```

**Step 3: Populate at token creation**

**File**: `apps/attribution/utils.py`, function `create_attribution_token` (line 135)

In the `ProfileAttributionToken.objects.create()` call (line 172), add:

```python
token = ProfileAttributionToken.objects.create(
    provider=provider,
    client=client,
    source=source,
    expires_at=expires_at,
    referer=referer or '',
    discount_percent_at_creation=getattr(provider, 'attribution_discount_percent', None),
)
```

Also in `TrackAttributionView.post` (`apps/attribution/views.py:112`), where tokens are created directly:

```python
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

**Step 4: Use snapshot in get_checkout_discount**

**File**: `apps/attribution/utils.py`, function `get_checkout_discount` (line 63)

Replace line 98:

```python
# OLD: reads live from provider
discount_int = getattr(provider, 'attribution_discount_percent', None)

# NEW: prefer snapshotted value, fall back to live
discount_int = token.discount_percent_at_creation
if discount_int is None:
    # Fallback for tokens created before this migration
    discount_int = getattr(provider, 'attribution_discount_percent', None)
```

**Step 5: Use snapshot in AttributionCheckoutStatusView**

**File**: `apps/attribution/views.py`, line 170

Replace:

```python
# OLD
discount_pct = provider.attribution_discount_percent

# NEW: prefer snapshot, fall back to live
discount_pct = token.discount_percent_at_creation
if discount_pct is None:
    discount_pct = provider.attribution_discount_percent
```

**Step 6: Backfill existing tokens**

Management command to populate `discount_percent_at_creation` for tokens that were created before this migration:

```python
# One-time data migration or management command
from apps.attribution.models import ProfileAttributionToken
for token in ProfileAttributionToken.objects.filter(discount_percent_at_creation__isnull=True):
    token.discount_percent_at_creation = getattr(
        token.provider, 'attribution_discount_percent', None
    )
    token.save(update_fields=['discount_percent_at_creation', 'modified_at'])
```

---

## Fix 5: No Cancellation Reset (HIGH)

**Problem**: When an appointment is cancelled before the session occurs, `first_session_discount_applied` stays `True` on the `ProfileAttributionToken`. The client permanently loses their one-time discount.

### Implementation

**File**: `apps/calendar_functionality/views.py`, class `AppointmentCancelView.post` (line 1360)

**Location**: After `appointment.save()` (line 1440), before the slot release loop (line 1456).

Add the following block:

```python
# Reset first-session discount if the session hasn't occurred yet
# so the client can use the discount on a re-booking.
if start_date_time > timezone.now():
    try:
        from apps.attribution.models import ProfileAttributionToken, AttributionStatus
        ProfileAttributionToken.objects.filter(
            provider=appointment.care_provider,
            client=appointment.client,
            status__in=[
                AttributionStatus.PENDING,
                AttributionStatus.CONFIRMED,
            ],
            first_session_discount_applied=True,
        ).update(first_session_discount_applied=False)
    except Exception:
        logger.exception(
            "Failed to reset attribution discount on cancellation",
            extra={"appointment_id": str(appointment.id)},
        )
```

**Logic**:
- `start_date_time > timezone.now()` -- only reset if the session has NOT yet occurred. If the session already happened and is being cancelled post-facto, the discount was legitimately consumed.
- The filter uses `provider` + `client` from the appointment to find the exact token.
- Both provider-initiated and client-initiated cancellations reset the discount (the handler processes both user types).

**Also reset discount fields on the cancelled appointment** (if Fix 3 is implemented):

```python
# Clear the discount fields on the cancelled appointment itself
if appointment.discount_amount_cents:
    appointment.discount_percent_applied = None
    appointment.discount_amount_cents = None
    appointment.save(update_fields=[
        'discount_percent_applied', 'discount_amount_cents', 'modified_at',
    ])
```

**Required tests**:
1. Book discounted session -> cancel before session time -> re-book -> discount still applies.
2. Book discounted session -> session occurs -> cancel after session -> re-book -> discount does NOT re-apply.
3. Provider-initiated cancellation before session -> discount resets.

---

## Fix 6: PayPal Auth Commented Out (CRITICAL)

**Problem**: `PayPalCreatePaymentAPIView` (line 290-292) has authentication commented out. `PayPalCapturePaymentAPIView` (line 404) has no authentication at all. Any unauthenticated user can create PayPal orders, capture authorizations, and consume a client's one-time discount flag.

### Implementation

**File**: `apps/stripe_integration/views.py`

**Fix 6a**: Uncomment auth on `PayPalCreatePaymentAPIView` (line 290-292):

```python
class PayPalCreatePaymentAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
```

**Fix 6b**: Add auth to `PayPalCapturePaymentAPIView` (line 404):

```python
class PayPalCapturePaymentAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]
```

**Fix 6c**: Validate authenticated user owns the appointment.

In `PayPalCreatePaymentAPIView.post`, after fetching the appointment (line 325):

```python
appt = Appointment.objects.get(id=appointment_id)

# Verify the authenticated user is the client on this appointment
if appt.client.user != request.user:
    return Response(
        {"detail": "Not authorized for this appointment."},
        status=status.HTTP_403_FORBIDDEN,
    )
```

In `PayPalCapturePaymentAPIView.post`, after fetching the appointment (line 426):

```python
appointment = Appointment.objects.get(id=appointment_id)

# Verify the authenticated user is the client on this appointment
if appointment.client.user != request.user:
    return Response(
        {"detail": "Not authorized for this appointment."},
        status=status.HTTP_403_FORBIDDEN,
    )
```

**Risk note**: If any frontend code currently calls these endpoints without a JWT (e.g., the PayPal callback redirect), it will break. Verify the frontend PayPal integration passes the JWT header on both create and capture calls. The PayPal SDK's `createOrder` and `onApprove` callbacks should use the authenticated Axios instance.

---

## Additional Fix: checkout-status View Semantic Correction (MEDIUM)

**Problem**: `AttributionCheckoutStatusView` returns `is_first_attributed_session=True` with `discount_percent=None` when a token exists but the provider has no discount configured. This is misleading.

**File**: `apps/attribution/views.py`, line 170-173

Replace:

```python
discount_pct = provider.attribution_discount_percent
return Response({
    'is_first_attributed_session': True,
    'discount_percent': discount_pct,
})
```

With:

```python
# Use snapshot if available (Fix 4), else live value
discount_pct = token.discount_percent_at_creation
if discount_pct is None:
    discount_pct = provider.attribution_discount_percent

# If no discount is configured, report as non-discounted session
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

## Implementation Order

| Priority | Fix | Effort | Dependencies |
|----------|-----|--------|-------------|
| 1 | Fix 6: PayPal auth restore | Small (5 lines) | None -- security fix, do first |
| 2 | Fix 3: Discount audit trail fields | Small (migration + 2 fields) | None |
| 3 | Fix 2: Stripe discount application | Medium (refactor PaymentIntentAPIView) | Fix 3 (to persist) |
| 4 | Fix 4: Discount snapshotting | Medium (migration + 3 file changes) | None |
| 5 | Fix 5: Cancellation reset | Small (10 lines in cancel handler) | Fix 3 (to clear fields) |
| 6 | Fix 1: Frontend wiring | Large (new component + API call) | Fixes 2-4 should land first; RGDEV-206 |
| 7 | Additional: checkout-status semantics | Trivial | Fix 4 (snapshot field) |

---

## Files Modified

| File | Fixes |
|------|-------|
| `apps/calendar_functionality/models.py` | Fix 3 (add fields) |
| `apps/attribution/models.py` | Fix 4 (add snapshot field) |
| `apps/attribution/utils.py` | Fix 4 (use snapshot in get_checkout_discount) |
| `apps/attribution/views.py` | Fix 4, Additional (use snapshot in checkout-status) |
| `apps/stripe_integration/views.py` | Fix 2, Fix 3, Fix 6 |
| `apps/calendar_functionality/views.py` | Fix 5 (cancellation handler) |
| `RG-Frontend/` (RGDEV-206) | Fix 1 (checkout UI) |

## Migrations Required

1. `calendar_functionality`: add `discount_percent_applied`, `discount_amount_cents` to `Appointment`
2. `attribution`: add `discount_percent_at_creation` to `ProfileAttributionToken`
