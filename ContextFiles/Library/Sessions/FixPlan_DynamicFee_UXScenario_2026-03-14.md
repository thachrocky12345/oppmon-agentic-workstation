# RGDEV-184 Fix Implementation Plan: Dynamic Platform Fee

**Date:** 2026-03-14
**Source audit:** `Audit_DynamicFee_UXScenario_Results_2026-03-14.md`
**Branch:** `docker-dev-v2`
**Repo:** `C:\Projects\ReallyGlobal\Lumy-Backend`

---

## Phase 1 -- Revenue-Critical (P0)

### Fix 1: Add `confirm_attribution_if_eligible()` to main worktree and create `ProviderClientFeeOverride`

**Finding:** F1 + F3. The function exists only in worktree `agent-ad3fbd38`. It also never creates the `ProviderClientFeeOverride` row, so `get_telehealth_fee()` always returns the standard 15% rate.

**File:** `apps/attribution/utils.py`

**Action:** Append the following function after `create_attribution_token()` (after line 179):

```python
def confirm_attribution_if_eligible(appointment):
    """
    Called after payment is captured. If a PENDING attribution token exists
    within its window, confirms it AND creates a ProviderClientFeeOverride
    so that get_telehealth_fee() returns the attributed rate for all future
    sessions between this provider-client pair.

    Returns the confirmed token, or None if no eligible token was found.
    """
    token = ProfileAttributionToken.objects.filter(
        provider=appointment.care_provider,
        client=appointment.client,
        status=AttributionStatus.PENDING,
    ).first()

    if token is None:
        return None

    if timezone.now() > token.expires_at:
        token.status = AttributionStatus.EXPIRED
        token.save(update_fields=['status', 'modified_at'])
        return None

    # Confirm the token
    token.status = AttributionStatus.CONFIRMED
    token.first_booking_at = timezone.now()
    token.save(update_fields=['status', 'first_booking_at', 'modified_at'])

    # Create the fee override so get_telehealth_fee() returns the attributed rate
    standard_fee = Decimal(
        getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15'
    )
    ProviderClientFeeOverride.objects.get_or_create(
        provider=appointment.care_provider,
        client=appointment.client,
        defaults={
            'fee_percent': settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT,
            'source': token.source,
            'original_fee_percent': standard_fee,
        },
    )

    logger.info(
        "Attribution confirmed and fee override created",
        extra={
            "appointment_id": str(appointment.id),
            "token_id": str(token.id),
            "source": token.source,
            "fee_percent": str(settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT),
        },
    )

    return token
```

**Why `get_or_create`:** The `unique_fee_override_per_pair` DB constraint enforces one override per provider-client pair. `get_or_create` is idempotent -- repeated calls (e.g., cron retry) will not create duplicates and will not overwrite an existing override.

**Integration point:** Call `confirm_attribution_if_eligible(appointment)` in `PayPalCapturePaymentAPIView.post()` (`apps/stripe_integration/views.py`) immediately after the `capture_authorization()` call succeeds, before the existing `ProfileAttributionToken.objects.filter(...).update(...)` block (line 498). The existing discount-marking block at lines 498-510 can remain as a safety net.

Add to `apps/stripe_integration/views.py` imports:
```python
from apps.attribution.utils import get_checkout_discount, get_telehealth_fee, confirm_attribution_if_eligible
```

Insert after line 487 (`except HTTPError` block ends) and before line 495 (the existing discount safety-net block):
```python
        # Confirm attribution and create fee override for future sessions
        try:
            confirm_attribution_if_eligible(appointment)
        except Exception:
            logger.exception(
                "Failed to confirm attribution after capture",
                extra={"appointment_id": str(appointment.id)},
            )
```

Also call it in `capture_authorized_payments_job()` in `lumy_global/cron.py` after the `capture_authorization()` call (after line ~456). Same pattern:
```python
            try:
                from apps.attribution.utils import confirm_attribution_if_eligible
                confirm_attribution_if_eligible(appt)
            except Exception:
                logger.exception("Failed to confirm attribution in cron", extra={"appointment_id": str(appt.id)})
```

---

### Fix 2: Correct `.env.example` fee values

**Finding:** F2 + F10. `OTHER_PLATFORM_FEE_PERCENT=0` and `IN_PERSON_PLATFORM_FEE_PERCENT=0` cause all dev/staging environments to compute a 0% platform fee.

**File:** `.env.example`, lines 117-118

**Action:** Change:
```
OTHER_PLATFORM_FEE_PERCENT=0
IN_PERSON_PLATFORM_FEE_PERCENT=0
```
To:
```
OTHER_PLATFORM_FEE_PERCENT=0.15
IN_PERSON_PLATFORM_FEE_PERCENT=0.05
```

---

### Fix 3: Replace the `or '0.15'` guard with a proper Decimal comparison

**Finding:** F2 (secondary). The `or '0.15'` guard in `get_telehealth_fee()` does not catch the string `"0"` because `"0"` is truthy in Python.

**File:** `apps/attribution/utils.py`, line 53

**Current code:**
```python
standard = Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')
```

**Replace with:**
```python
raw = getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15'
standard = Decimal(str(raw))
if standard <= 0:
    logger.warning(
        "OTHER_PLATFORM_FEE_PERCENT is <= 0 (%s), using hardcoded 0.15",
        raw,
    )
    standard = STANDARD_FEE
```

This catches both `None`/empty (via the `or` guard) AND explicit zero values (via the `<= 0` comparison). It logs a warning so misconfiguration is visible.

---

### Fix 4: Cast fee settings to `Decimal` with defaults in `settings.py`

**Finding:** F11. `OTHER_PLATFORM_FEE_PERCENT` and `IN_PERSON_PLATFORM_FEE_PERCENT` are stored as raw strings with no defaults.

**File:** `lumy_global/settings.py`, lines 622-623

**Current code:**
```python
OTHER_PLATFORM_FEE_PERCENT=env("OTHER_PLATFORM_FEE_PERCENT")
IN_PERSON_PLATFORM_FEE_PERCENT=env("IN_PERSON_PLATFORM_FEE_PERCENT")
```

**Replace with:**
```python
OTHER_PLATFORM_FEE_PERCENT = Decimal(env("OTHER_PLATFORM_FEE_PERCENT", default="0.15"))
IN_PERSON_PLATFORM_FEE_PERCENT = Decimal(env("IN_PERSON_PLATFORM_FEE_PERCENT", default="0.05"))
```

**Note:** `from decimal import Decimal` is already present at the top of `settings.py` (used for `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` on line 626). Verify this import exists; if not, add it.

---

## Phase 2 -- Fee Consistency (P1)

### Fix 5: Refactor `calendar_functionality/views.py` capture path to use `get_telehealth_fee()`

**Finding:** F4. The third capture path in `calendar_functionality/views.py` (lines 794-804) uses raw `settings.OTHER_PLATFORM_FEE_PERCENT` instead of `get_telehealth_fee()`, bypassing attribution overrides.

**File:** `apps/calendar_functionality/views.py`, lines ~794-804

**Current code:**
```python
if (
    appointment.format
    and appointment.format.name == "IN PERSON"
):
    pct = Decimal(
        str(settings.IN_PERSON_PLATFORM_FEE_PERCENT)
    )
else:
    pct = Decimal(
        str(settings.OTHER_PLATFORM_FEE_PERCENT)
    )
```

**Replace with:**
```python
if (
    appointment.format
    and appointment.format.name == "IN PERSON"
):
    pct = Decimal(
        str(settings.IN_PERSON_PLATFORM_FEE_PERCENT)
    )
    fee_tier = "in_person_standard"
else:
    pct, fee_tier = get_telehealth_fee(
        appointment.care_provider, appointment.client
    )
```

**Add import** at top of `apps/calendar_functionality/views.py`:
```python
from apps.attribution.utils import get_telehealth_fee
```

Also add the `confirm_attribution_if_eligible` call after capture succeeds on this path (after line ~814, after `appointment.save()`):
```python
try:
    from apps.attribution.utils import confirm_attribution_if_eligible
    confirm_attribution_if_eligible(appointment)
except Exception:
    logger.exception("Failed to confirm attribution in calendar capture")
```

---

### Fix 6: Add fee audit fields to `Appointment` model

**Finding:** F5. No fee tier, percentage, or platform fee amount is persisted on the `Appointment` model, making financial reporting impossible.

**File:** `apps/calendar_functionality/models.py`, class `Appointment` (line 79)

**Action:** Add three fields after `paypal_status` (line 124):

```python
    # Fee audit trail (populated at capture time)
    fee_tier_label = models.CharField(
        max_length=30, blank=True, default='',
        help_text='Fee tier applied: standard, attributed, in_person_standard',
    )
    fee_pct_applied = models.DecimalField(
        max_digits=5, decimal_places=4, null=True, blank=True,
        help_text='Actual fee percentage applied at capture (e.g. 0.1500)',
    )
    platform_fee_cents = models.IntegerField(
        null=True, blank=True,
        help_text='Platform fee in minor currency units charged at capture',
    )
```

**Migration:** Run `python manage.py makemigrations calendar_functionality -n add_fee_audit_fields`.

**Populate at capture time:** In all three capture paths, set these fields before `appointment.save()`:

```python
appointment.fee_tier_label = fee_tier        # str: 'standard', 'attributed', 'in_person_standard'
appointment.fee_pct_applied = pct            # Decimal
appointment.platform_fee_cents = int(
    (platform_fee * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
)
appointment.save(update_fields=[
    'paypal_status', 'payment_status',
    'fee_tier_label', 'fee_pct_applied', 'platform_fee_cents',
])
```

Apply this pattern in:
1. `PayPalCapturePaymentAPIView.post()` -- `apps/stripe_integration/views.py` (before line 482)
2. `capture_authorized_payments_job()` -- `lumy_global/cron.py` (before the `appt.save()` at ~line 459)
3. `calendar_functionality/views.py` capture path (before the `appointment.save()` at ~line 818)

---

### Fix 7: Add `application_fee_amount` to Stripe `PaymentIntentAPIView`

**Finding:** F7. `PaymentIntentAPIView.post()` creates a Stripe PaymentIntent with no `application_fee_amount`, so Stripe-based payments have zero platform fee split.

**File:** `apps/stripe_integration/views.py`, lines 58-63

**Prerequisite:** This fix requires that the provider's Stripe account is a **Connected Account** using Stripe Connect. If the current integration uses direct charges (not Connect), adding `application_fee_amount` will fail. **Verify Stripe Connect is configured before applying this fix.** If Stripe is only used for Talk Now (not scheduled sessions), this fix may be deferred pending product decision (see Fix 8).

**Action (if Stripe Connect is active):**

```python
        # Compute platform fee
        appointment = Appointment.objects.get(id=appointment_id)
        if appointment.format and appointment.format.name == "IN PERSON":
            pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            fee_tier = "in_person_standard"
        else:
            pct, fee_tier = get_telehealth_fee(
                appointment.care_provider, appointment.client
            )
        fee_amount = int(
            (Decimal(str(amount)) * pct).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
        )

        payment_intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            customer=user_profile.stripe_customer_id,
            application_fee_amount=fee_amount,
            idempotency_key=f"pi_{appointment_id}_{user.id}",
        )
```

**Note:** Move the `Appointment.objects.get(id=appointment_id)` call before the `stripe.PaymentIntent.create()` call (it currently happens after on line 64).

---

### Fix 8: Talk Now fee policy decision + implementation

**Finding:** F6. Talk Now sessions bypass dynamic fee entirely. `charge_talknow_payment()` calls `stripe.PaymentIntent.capture()` with no `application_fee_amount`.

**File:** `apps/talk_now/views.py`

**Action:** This requires a **product decision** first:

- **Option A (Talk Now is flat-fee, no split):** Document this as intentional. Add a code comment in `charge_talknow_payment()` explaining that Talk Now is exempt from platform fee splits. No code change.
- **Option B (Talk Now should have fee splits):** Add `application_fee_amount` to the `stripe.PaymentIntent.create()` call in `_handle_setup_intent()` (line 176) and to the `stripe.PaymentIntent.capture()` call in `_handle_payment_intent()` (line 139). This requires looking up the appointment associated with the TalkNowPayment to get provider/client for `get_telehealth_fee()`.

**Recommended immediate action:** Add a code comment and a `logger.info` noting no fee split is applied, so this is tracked:

In `_handle_payment_intent()` (line 138), before the capture:
```python
# NOTE: Talk Now payments currently have no application_fee_amount (platform fee split).
# Product decision pending (RGDEV-184 / F6). If Talk Now should have fee splits,
# add application_fee_amount here and in _handle_setup_intent().
logger.info("Talk Now capture: no platform fee split applied", extra={"payment_id": str(payment.id)})
```

---

## Phase 3 -- Robustness (P2)

### Fix 9: Lock fee at authorization time (race condition)

**Finding:** F9. Fee is re-queried at capture time via a live DB query. If `ProviderClientFeeOverride.is_active` changes between authorization and capture, the fee silently changes.

**File:** `apps/stripe_integration/views.py` -- `PayPalCreatePaymentAPIView.post()`

**Action:** Store the fee tier on the appointment at authorization time so the capture path can use the stored value instead of re-querying.

After Fix 6 adds `fee_tier_label` and `fee_pct_applied` to `Appointment`, modify `PayPalCreatePaymentAPIView.post()` to compute and store the fee at order creation time:

In `PayPalCreatePaymentAPIView.post()`, after the `appointment_id` lookup (line ~324-326):
```python
        # Lock fee at authorization time
        if appointment_id:
            try:
                appt = Appointment.objects.get(id=appointment_id)
                if appt.format and appt.format.name == "IN PERSON":
                    lock_pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
                    lock_tier = "in_person_standard"
                else:
                    lock_pct, lock_tier = get_telehealth_fee(appt.care_provider, appt.client)
                appt.fee_pct_applied = lock_pct
                appt.fee_tier_label = lock_tier
                appt.save(update_fields=['fee_pct_applied', 'fee_tier_label'])
            except Appointment.DoesNotExist:
                pass
```

Then in `PayPalCapturePaymentAPIView.post()`, read the stored fee instead of re-querying:
```python
        if appointment.fee_pct_applied is not None:
            pct = appointment.fee_pct_applied
            fee_tier = appointment.fee_tier_label
        elif appointment.format and appointment.format.name == "IN PERSON":
            pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            fee_tier = "in_person_standard"
        else:
            pct, fee_tier = get_telehealth_fee(appointment.care_provider, appointment.client)
```

This makes the fee immutable once authorization is created. The fallback (re-query) handles appointments created before the migration.

---

### Fix 10: Fee-preview API endpoint

**Finding:** F8. No endpoint exists for the frontend to query the authoritative fee before checkout.

**File:** New view in `apps/attribution/views.py` (or `apps/stripe_integration/views.py`)

**Action:** Add a simple GET endpoint:

```python
class FeePreviewAPIView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        appointment_id = request.query_params.get('appointment_id')
        if not appointment_id:
            return Response({"detail": "appointment_id required"}, status=400)

        appointment = get_object_or_404(Appointment, id=appointment_id)

        if appointment.format and appointment.format.name == "IN PERSON":
            pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            tier = "in_person_standard"
        else:
            pct, tier = get_telehealth_fee(appointment.care_provider, appointment.client)

        return Response({
            "fee_percent": str(pct),
            "fee_tier": tier,
        })
```

**URL:** Register in `apps/stripe_integration/urls.py`:
```python
path('fee-preview/', FeePreviewAPIView.as_view(), name='fee-preview'),
```

**Priority:** P2 -- frontend can display fee but no current UI depends on this. Ship after P0/P1 fixes.

---

### Fix 11: Startup validation for fee constants

**Finding:** Defensive measure. No assertion prevents fee constants from being zero or negative.

**File:** `apps/attribution/apps.py` (or create a Django system check)

**Action:** Add a `ready()` hook:

```python
from django.apps import AppConfig
from django.core.checks import Error, register

class AttributionConfig(AppConfig):
    name = 'apps.attribution'

    def ready(self):
        from django.conf import settings
        from decimal import Decimal

        fee_vars = {
            'OTHER_PLATFORM_FEE_PERCENT': getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', None),
            'IN_PERSON_PLATFORM_FEE_PERCENT': getattr(settings, 'IN_PERSON_PLATFORM_FEE_PERCENT', None),
            'ATTRIBUTED_TELEHEALTH_FEE_PERCENT': getattr(settings, 'ATTRIBUTED_TELEHEALTH_FEE_PERCENT', None),
        }
        for name, val in fee_vars.items():
            if val is None:
                continue
            d = Decimal(str(val))
            if not (Decimal('0') < d < Decimal('1')):
                import logging
                logging.getLogger(__name__).error(
                    "FATAL: %s=%s is outside (0, 1). Platform fees will be incorrect.",
                    name, val,
                )
```

---

## Execution Order

| Step | Fix | Severity | Estimated Effort | Dependencies |
|------|-----|----------|-----------------|--------------|
| 1 | Fix 2: `.env.example` values | P0 | 5 min | None |
| 2 | Fix 4: Cast settings to Decimal | P0 | 5 min | None |
| 3 | Fix 3: `or '0.15'` guard | P0 | 10 min | None |
| 4 | Fix 1: `confirm_attribution_if_eligible` + `ProviderClientFeeOverride` creation | P0 | 30 min | None |
| 5 | Fix 6: Add fee audit fields to Appointment | P1 | 20 min | None (migration) |
| 6 | Fix 5: calendar_functionality capture path | P1 | 15 min | Fix 4 |
| 7 | Fix 7: Stripe PaymentIntent fee | P1 | 20 min | Stripe Connect verification |
| 8 | Fix 8: Talk Now decision | P1 | 10 min (comment) or 30 min (impl) | Product decision |
| 9 | Fix 11: Startup validation | P2 | 10 min | None |
| 10 | Fix 9: Lock fee at auth time | P2 | 30 min | Fix 6 |
| 11 | Fix 10: Fee-preview endpoint | P2 | 20 min | None |

---

## Testing Plan

### Unit tests (add to `apps/attribution/tests/`)

1. **`test_confirm_attribution_creates_fee_override`**: Create a PENDING token, call `confirm_attribution_if_eligible()`, assert `ProviderClientFeeOverride` exists with correct `fee_percent` and `source`.
2. **`test_confirm_attribution_idempotent`**: Call twice, assert only one override row (DB constraint).
3. **`test_confirm_attribution_expired_token`**: Expired token -> no override created, token status set to EXPIRED.
4. **`test_confirm_attribution_no_token`**: No token -> returns None, no override.
5. **`test_get_telehealth_fee_zero_guard`**: Set `OTHER_PLATFORM_FEE_PERCENT=0`, assert `get_telehealth_fee()` returns `Decimal('0.1500')` (hardcoded fallback).
6. **`test_fee_audit_fields_populated_after_capture`**: Mock PayPal capture, assert `appointment.fee_tier_label`, `fee_pct_applied`, `platform_fee_cents` are set.

### Integration tests

7. **End-to-end PayPal flow**: Create appointment -> authorize -> capture -> verify attribution confirmed AND fee override created AND fee audit fields populated.
8. **Calendar capture path**: Same flow via `calendar_functionality/views.py` path -> verify `get_telehealth_fee()` is called (not raw settings).

---

## Files Modified (Summary)

| File | Changes |
|------|---------|
| `.env.example` | Fix fee values (0 -> 0.15, 0 -> 0.05) |
| `lumy_global/settings.py` | Cast fee settings to Decimal with defaults |
| `apps/attribution/utils.py` | Add `confirm_attribution_if_eligible()`, fix `or '0.15'` guard |
| `apps/attribution/apps.py` | Add startup validation for fee constants |
| `apps/stripe_integration/views.py` | Import + call `confirm_attribution_if_eligible`, add `application_fee_amount` to PaymentIntent, lock fee at auth time |
| `apps/calendar_functionality/models.py` | Add `fee_tier_label`, `fee_pct_applied`, `platform_fee_cents` to Appointment |
| `apps/calendar_functionality/views.py` | Replace raw settings with `get_telehealth_fee()`, populate fee audit fields |
| `lumy_global/cron.py` | Call `confirm_attribution_if_eligible`, populate fee audit fields |
| `apps/talk_now/views.py` | Add documentation comment + logger (pending product decision) |
| `apps/attribution/tests/` | New test cases |
