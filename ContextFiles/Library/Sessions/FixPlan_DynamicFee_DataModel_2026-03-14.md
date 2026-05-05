# RGDEV-184 Dynamic Fee Fix Plan

**Date:** 2026-03-14
**Source:** `Audit_DynamicFee_DataModel_Results_2026-03-14.md`
**Status:** Implementation-ready

---

## Priority Legend

| Priority | Meaning |
|---|---|
| P0-CRITICAL | Platform collects zero revenue on this path |
| P1-HIGH | Fee calculated but wrong (no attribution), or structural gap |
| P2-MEDIUM | Analytics/config correctness |
| P3-LOW | Edge cases, hardening |

---

## FIX 1 (P0-CRITICAL): Stripe Capture in cron.py -- Add Fee Calculation

**File:** `lumy_global/cron.py` lines 497-526
**Problem:** `stripe.PaymentIntent.capture(intent_id)` called with no `application_fee_amount`. Platform collects zero fee on every cron-triggered Stripe capture. Logger on line 524 also has 3 format placeholders but only 2 arguments (will raise `TypeError`).

**Before (lines 497-526):**
```python
for appt in to_capture_stripe:
    intent_id = appt.payment_intent_id

    try:
        captured_intent = stripe.PaymentIntent.capture(
            intent_id,
        )

    except stripe.error.StripeError as e:
        logger.error(
            "❌ Stripe error capturing intent %s for appt %s: %s",
            intent_id, appt.id, e.user_message or str(e)
        )
        continue

    except Exception as e:
        logger.exception(
            "❌ Unexpected error capturing Stripe intent %s for appt %s:",
            intent_id, appt.id
        )
        continue

    # 5d) Update appointment status for Stripe
    appt.payment_status = PaymentStatus.COMPLETED
    appt.save(update_fields=["payment_status"])

    logger.info(
        "✅ Successfully captured Stripe PaymentIntent %s for appt %s (fee: %d).",
        intent_id, appt.id
    )
```

**After:**
```python
for appt in to_capture_stripe:
    intent_id = appt.payment_intent_id

    try:
        # 5a) Retrieve PI to get amount
        pi = stripe.PaymentIntent.retrieve(intent_id)
        amount_cents = pi.get("amount", 0)

        # 5b) Determine platform fee percentage based on format
        if appt.format and appt.format.name == "IN PERSON":
            pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            fee_tier = "in_person_standard"
        else:
            pct, fee_tier = get_telehealth_fee(appt.care_provider, appt.client)

        # 5c) Compute the platform fee in minor units (cents)
        application_fee_amount = int(
            (Decimal(amount_cents) * pct).quantize(Decimal("1."), rounding=ROUND_HALF_UP)
        )

        logger.info(
            "Stripe capture fee calculated",
            extra={
                "appointment_id": str(appt.id),
                "fee_tier": fee_tier,
                "fee_pct": str(pct),
                "application_fee_amount": application_fee_amount,
            }
        )

        # 5d) Capture with application fee
        captured_intent = stripe.PaymentIntent.capture(
            intent_id,
            application_fee_amount=application_fee_amount,
        )

    except stripe.error.StripeError as e:
        logger.error(
            "❌ Stripe error capturing intent %s for appt %s: %s",
            intent_id, appt.id, e.user_message or str(e)
        )
        continue

    except Exception as e:
        logger.exception(
            "❌ Unexpected error capturing Stripe intent %s for appt %s:",
            intent_id, appt.id
        )
        continue

    # 5e) Update appointment status for Stripe
    appt.payment_status = PaymentStatus.COMPLETED
    appt.save(update_fields=["payment_status"])

    logger.info(
        "✅ Successfully captured Stripe PaymentIntent %s for appt %s (fee: %d).",
        intent_id, appt.id, application_fee_amount
    )
```

**Why correct:**
- Mirrors the PayPal capture path (lines 438-461) that already works correctly.
- Uses the format gate (in-person vs telehealth) before calling `get_telehealth_fee()`.
- `get_telehealth_fee()` is already imported at line 4 of `cron.py`.
- Fixes the logger format string by providing the third argument (`application_fee_amount`).

**IMPORTANT PREREQUISITE:** `application_fee_amount` on capture only works when the original PaymentIntent was created with `transfer_data` (Stripe Connect). If the original PI was created without `transfer_data`, Stripe will reject the `application_fee_amount` parameter. This means FIX 1 depends on FIX 3 (enabling `transfer_data` at PI creation time). Until FIX 3 is deployed, this fix will cause a `StripeError` on capture. **Deploy FIX 3 first, then FIX 1.**

**Test:**
1. Create a test appointment with a Stripe PaymentIntent (manual capture mode) and `transfer_data`.
2. Set `start_date_time` to 6 hours from now.
3. Run `capture_authorized_payments_job()`.
4. Assert: `stripe.PaymentIntent.capture()` was called with `application_fee_amount` > 0.
5. Assert: log message includes the fee amount (no `TypeError`).
6. Assert: appointment status updated to `PaymentStatus.COMPLETED`.
7. With an attributed client: assert fee uses `get_telehealth_fee()` return value (12%) not the standard (15%).

---

## FIX 2 (P0-CRITICAL): Talk Now Payment Path -- Add Fee Calculation

**File:** `apps/talk_now/views.py`
**Problem:** Three paths create/capture Stripe payments with zero platform fee:
- `_handle_payment_intent()` (line 139): captures PI with no `application_fee_amount`
- `_handle_setup_intent()` (line 176): creates PI with no `application_fee_amount` or `transfer_data`
- `TalkNowCheckout.post()` (line 864): creates checkout session with no `application_fee_amount` in `payment_intent_data`

### FIX 2a: Add import

**File:** `apps/talk_now/views.py` line 12 (after existing imports)
**Add:**
```python
from apps.attribution.utils import get_telehealth_fee
```

### FIX 2b: `_handle_payment_intent()` -- add fee to capture

**File:** `apps/talk_now/views.py` lines 133-152
**Problem:** The function receives `payment` (a `TalkNowPayment`) but has no access to provider/client to calculate the fee. The `TalkNow` record links to these via `care_provider` and `client`.

**Change function signature and body:**

**Before:**
```python
def _handle_payment_intent(payment, s_intent_id):
    """Handle the PaymentIntent (pi_*) capture/status path."""
    pi = stripe.PaymentIntent.retrieve(s_intent_id)
    status_now = pi.get("status")

    if status_now == "requires_capture":
        captured = stripe.PaymentIntent.capture(s_intent_id)
```

**After:**
```python
def _handle_payment_intent(payment, s_intent_id, provider=None, client=None):
    """Handle the PaymentIntent (pi_*) capture/status path."""
    pi = stripe.PaymentIntent.retrieve(s_intent_id)
    status_now = pi.get("status")

    if status_now == "requires_capture":
        capture_kwargs = {}
        if provider and client:
            amount_cents = pi.get("amount", 0)
            pct, fee_tier = get_telehealth_fee(provider, client)
            application_fee = int(
                (Decimal(amount_cents) * pct).quantize(Decimal("1."), rounding=ROUND_HALF_UP)
            )
            capture_kwargs["application_fee_amount"] = application_fee
        captured = stripe.PaymentIntent.capture(s_intent_id, **capture_kwargs)
```

### FIX 2c: `_handle_setup_intent()` -- add fee to PI creation

**File:** `apps/talk_now/views.py` lines 155-196

**Before:**
```python
def _handle_setup_intent(payment, s_intent_id, amount, currency):
```

**After:**
```python
def _handle_setup_intent(payment, s_intent_id, amount, currency, provider=None, client=None):
```

And where the PI is created (line 176):

**Before:**
```python
    pi2 = stripe.PaymentIntent.create(
        amount=amount_minor, currency=currency_norm, customer=customer_id,
        payment_method=pm_id, off_session=True, confirm=True,
        metadata={"talknow_payment_id": str(payment.id), "charged_from_setup_intent": s_intent_id},
    )
```

**After:**
```python
    create_kwargs = dict(
        amount=amount_minor, currency=currency_norm, customer=customer_id,
        payment_method=pm_id, off_session=True, confirm=True,
        metadata={"talknow_payment_id": str(payment.id), "charged_from_setup_intent": s_intent_id},
    )
    if provider and client:
        pct, fee_tier = get_telehealth_fee(provider, client)
        application_fee = int(
            (Decimal(amount_minor) * pct).quantize(Decimal("1."), rounding=ROUND_HALF_UP)
        )
        from apps.care_provider.models import CareProvider as CP
        provider_stripe_id = getattr(provider, 'stripe_customer_id', None)
        if provider_stripe_id:
            create_kwargs["application_fee_amount"] = application_fee
            create_kwargs["transfer_data"] = {"destination": provider_stripe_id}
    pi2 = stripe.PaymentIntent.create(**create_kwargs)
```

### FIX 2d: `charge_talknow_payment()` -- pass provider/client through

**File:** `apps/talk_now/views.py` lines 199-216

The function needs to resolve the `TalkNow` record to get provider/client, then pass them to the handler functions.

**Before:**
```python
    if kind == "payment":
        return _handle_payment_intent(payment, s_intent_id)
    return _handle_setup_intent(payment, s_intent_id, amount, currency)
```

**After:**
```python
    # Resolve provider/client from TalkNow record
    provider = None
    client_obj = None
    try:
        from .models import TalkNow as TN
        tn = TN.objects.filter(talk_now_payment=payment).select_related('care_provider', 'client').first()
        if tn:
            provider = tn.care_provider
            from apps.client.models import Client as CL
            client_obj = CL.objects.filter(user=tn.client).first()
    except Exception:
        pass  # Fall through without fee -- better than breaking payment

    if kind == "payment":
        return _handle_payment_intent(payment, s_intent_id, provider=provider, client=client_obj)
    return _handle_setup_intent(payment, s_intent_id, amount, currency, provider=provider, client=client_obj)
```

### FIX 2e: `TalkNowCheckout.post()` -- add fee to checkout session

**File:** `apps/talk_now/views.py` lines 864-868 (inside `payment_intent_data`)

This requires resolving the provider/client at checkout time. The checkout happens before `TalkNow` is created, so provider/client must come from request data or meta_data.

**Design decision:** Talk Now is always telehealth (video), so the in-person gate is not needed. However, at checkout time we may not have provider/client resolved. The fee should be applied at capture time (FIX 2b/2c) rather than at checkout creation, since checkout uses `capture_method: "manual"`. The capture-time fix is the correct approach for Talk Now.

**No change needed at checkout creation time** -- the fee is applied at capture via FIX 2b.

**PREREQUISITE:** Same as FIX 1 -- `transfer_data` must be set at PI creation time for `application_fee_amount` to work at capture. For Talk Now, the `payment_intent_data` in the checkout session (line 864) needs `transfer_data` added. This requires knowing the provider's Stripe Connect account ID at checkout time.

**Add to `payment_intent_data` (line 864-868) if provider is known:**
```python
# After resolving care_provider from meta_data or request:
if care_provider_stripe_id:
    extra_kwargs["payment_intent_data"]["transfer_data"] = {
        "destination": care_provider_stripe_id
    }
```

**Note:** This is a larger refactor because `TalkNowCheckout` currently has no concept of which provider the payment is for. The provider is only linked when `StartCallView` creates the `TalkNow` record. **Recommended approach:** Add `care_provider_id` to the checkout request body, resolve the provider's Stripe Connect ID, and include it in `transfer_data` at checkout creation. This enables both `application_fee_amount` at capture and proper Stripe Connect routing.

**Test:**
1. Create a TalkNow payment via checkout with a known provider.
2. Trigger capture via `charge_talknow_payment()`.
3. Assert: Stripe PI has `application_fee_amount` set.
4. With attributed client: assert fee uses attributed rate.

---

## FIX 3 (P0-CRITICAL): calendar_functionality/views.py -- Enable Stripe Connect Fee Split

**File:** `apps/calendar_functionality/views.py`
**Problem:** Four Stripe paths have `application_fee_amount`/`transfer_data` commented out or missing.

### FIX 3a: Add import

**File:** `apps/calendar_functionality/views.py` (top of file, after line 30)
**Add:**
```python
from apps.attribution.utils import get_telehealth_fee
```

### FIX 3b: Booking flow immediate capture (lines 854-890)

Replace hardcoded fee with `get_telehealth_fee()` and pass fee to Stripe capture.

**Before (lines 854-890):**
```python
                    if (
                        appointment.format
                        and appointment.format.name == "IN PERSON"
                    ):
                        pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
                    else:
                        pct = Decimal(str(settings.OTHER_PLATFORM_FEE_PERCENT))

                    raw_fee = (Decimal(amount_cents) * pct).quantize(
                        Decimal("1."), rounding=ROUND_HALF_UP
                    )
                    application_fee_amount = int(raw_fee)

                    # payment_intent = stripe.PaymentIntent.create(
                    #     ...
                    #     application_fee_amount=application_fee_amount,
                    # transfer_data={'destination': care_provider_profile.stripe_customer_id},
                    #     ...
                    # )

                    ...

                    now = timezone.now()
                    cutoff = now + timedelta(hours=6)
                    if appointment.start_date_time <= cutoff:
                        try:
                            stripe.PaymentIntent.capture(payment_intent_id)
```

**After:**
```python
                    if (
                        appointment.format
                        and appointment.format.name == "IN PERSON"
                    ):
                        pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
                        fee_tier = "in_person_standard"
                    else:
                        pct, fee_tier = get_telehealth_fee(
                            appointment.care_provider, appointment.client
                        )

                    raw_fee = (Decimal(amount_cents) * pct).quantize(
                        Decimal("1."), rounding=ROUND_HALF_UP
                    )
                    application_fee_amount = int(raw_fee)

                    # (PI was already created by frontend via PaymentIntentAPIView --
                    #  transfer_data must be added at PI creation time; see FIX 3e)

                    ...

                    now = timezone.now()
                    cutoff = now + timedelta(hours=6)
                    if appointment.start_date_time <= cutoff:
                        try:
                            stripe.PaymentIntent.capture(
                                payment_intent_id,
                                application_fee_amount=application_fee_amount,
                            )
```

### FIX 3c: Reschedule capture (line 1197-1237)

**Before (lines 1205-1209 and 1233-1237):**
```python
                    pct = (
                        Decimal(settings.IN_PERSON_PLATFORM_FEE_PERCENT)
                        if new_appointment.format.name == "IN PERSON"
                        else Decimal(settings.OTHER_PLATFORM_FEE_PERCENT)
                    )
```
```python
                elif new_appointment.payment_intent_id:
                    try:
                        stripe.PaymentIntent.capture(new_appointment.payment_intent_id)
```

**After (lines 1205-1209):**
```python
                    if new_appointment.format and new_appointment.format.name == "IN PERSON":
                        pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
                        fee_tier = "in_person_standard"
                    else:
                        pct, fee_tier = get_telehealth_fee(
                            new_appointment.care_provider, new_appointment.client
                        )
```

**After (lines 1233-1237):**
```python
                elif new_appointment.payment_intent_id:
                    try:
                        pi = stripe.PaymentIntent.retrieve(new_appointment.payment_intent_id)
                        amt = pi.get("amount", 0)
                        if new_appointment.format and new_appointment.format.name == "IN PERSON":
                            s_pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
                        else:
                            s_pct, _ = get_telehealth_fee(
                                new_appointment.care_provider, new_appointment.client
                            )
                        s_fee = int(
                            (Decimal(amt) * s_pct).quantize(Decimal("1."), rounding=ROUND_HALF_UP)
                        )
                        stripe.PaymentIntent.capture(
                            new_appointment.payment_intent_id,
                            application_fee_amount=s_fee,
                        )
```

### FIX 3d: Manual capture view (lines 3274-3280)

**Before:**
```python
            captured_intent = stripe.PaymentIntent.capture(
                appointment.payment_intent_id,
                # application_fee_amount=application_fee,  # The platform fee (20%)
                # transfer_data={
                #     "destination": stripe_user.stripe_customer_id,  # User's Stripe account
                # }
            )
```

**After:**
```python
            # Calculate fee
            pi = stripe.PaymentIntent.retrieve(appointment.payment_intent_id)
            amount_cents = pi.get("amount", 0)
            if appointment.format and appointment.format.name == "IN PERSON":
                cap_pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            else:
                cap_pct, _ = get_telehealth_fee(
                    appointment.care_provider, appointment.client
                )
            application_fee = int(
                (Decimal(amount_cents) * cap_pct).quantize(Decimal("1."), rounding=ROUND_HALF_UP)
            )

            captured_intent = stripe.PaymentIntent.capture(
                appointment.payment_intent_id,
                application_fee_amount=application_fee,
            )
```

### FIX 3e: PaymentIntentAPIView -- Add `transfer_data` at PI Creation

**File:** `apps/stripe_integration/views.py` lines 58-63
**Problem:** `application_fee_amount` at capture time requires the PI to have been created with `transfer_data` (Stripe Connect requirement). Currently, `PaymentIntentAPIView` creates PIs without `transfer_data`.

**Before:**
```python
        payment_intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            customer=user_profile.stripe_customer_id,
            idempotency_key=f"pi_{appointment_id}_{user.id}",
        )
```

**After:**
```python
        # Resolve provider's Stripe Connect account for fee split
        try:
            appointment_obj = Appointment.objects.select_related(
                'care_provider__user__stripeUser'
            ).get(id=appointment_id)
            provider_stripe_id = appointment_obj.care_provider.user.stripeUser.stripe_customer_id
        except Exception:
            provider_stripe_id = None

        create_kwargs = dict(
            amount=amount,
            currency=currency,
            customer=user_profile.stripe_customer_id,
            capture_method='manual',
            idempotency_key=f"pi_{appointment_id}_{user.id}",
        )
        if provider_stripe_id:
            create_kwargs["transfer_data"] = {"destination": provider_stripe_id}

        payment_intent = stripe.PaymentIntent.create(**create_kwargs)
```

**Why correct:** Stripe requires `transfer_data` at PI creation time for Connect split payments. Without this, `application_fee_amount` on capture will fail. This is the root prerequisite for all Stripe fee fixes.

**Test:**
1. Create appointment, trigger PaymentIntentAPIView.
2. Assert: Stripe PI has `transfer_data.destination` = provider's Stripe Connect ID.
3. Capture the PI with `application_fee_amount`.
4. Assert: Stripe reports the fee correctly split.
5. With attributed client: assert 12% fee. With standard client: assert 15% fee. With in-person: assert 5% fee.

---

## FIX 4 (P1-HIGH): verification/views.py -- Replace Hardcoded Fee with get_telehealth_fee()

**File:** `apps/verification/views.py` lines 955-958
**Problem:** Uses `settings.OTHER_PLATFORM_FEE_PERCENT` directly. Attributed clients get standard rate (15%) instead of attributed rate (12%).

**Add import (top of file):**
```python
from apps.attribution.utils import get_telehealth_fee
```

**Before:**
```python
            if format_instance.name == "IN PERSON":
                pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            else:
                pct = Decimal(str(settings.OTHER_PLATFORM_FEE_PERCENT))
```

**After:**
```python
            if format_instance.name == "IN PERSON":
                pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            else:
                pct, _fee_tier = get_telehealth_fee(care_provider, client)
```

Where `care_provider` and `client` are the appointment's provider and client objects (already available in context at this point in the verification checkout flow).

**Why correct:** Verification checkout is the only path that actually passes `application_fee_amount` to Stripe. Making it attribution-aware ensures attributed clients get their reduced rate on verification payments.

**Test:**
1. Create verification checkout for attributed client.
2. Assert: `application_fee_amount` reflects 12% not 15%.
3. For non-attributed client: assert 15%.
4. For in-person: assert 5%.

---

## FIX 5 (P2-MEDIUM): Fee Tier Label -- Distinguish Attribution Source

**File:** `apps/attribution/utils.py` line 52
**Problem:** Returns `"attributed"` for all overrides. BRD requires `"attributed_profile"` and `"attributed_booking_link"`.

**Before:**
```python
ATTRIBUTED_LABEL = 'attributed'
...
        if override:
            return (override.fee_percent, ATTRIBUTED_LABEL)
```

**After:**
```python
...
        if override:
            label = f"attributed_{override.source}"
            return (override.fee_percent, label)
```

Remove the `ATTRIBUTED_LABEL` constant (line 21) or keep for backwards compat and only change the return.

**Why correct:** `override.source` stores `'profile'` or `'booking_link'` (from `AttributionSource` choices). This produces `"attributed_profile"` or `"attributed_booking_link"`, matching the BRD requirement for four distinct labels: `"in_person_standard"`, `"attributed_profile"`, `"attributed_booking_link"`, `"standard"`.

**Test:**
1. Create `ProviderClientFeeOverride` with `source=AttributionSource.PROFILE`.
2. Call `get_telehealth_fee(provider, client)`.
3. Assert: label == `"attributed_profile"`.
4. Change override source to `BOOKING_LINK`.
5. Assert: label == `"attributed_booking_link"`.
6. Delete override. Assert: label == `"standard"`.

---

## FIX 6 (P2-MEDIUM): Use ATTRIBUTED_TELEHEALTH_FEE_PERCENT as Default

**File:** `apps/attribution/utils.py` (inside `get_telehealth_fee()`)
**Problem:** `settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT` is defined (0.12) but never used. When creating `ProviderClientFeeOverride` rows, the `fee_percent` must come from somewhere -- currently it's set by whatever creates the override. The setting should serve as the default when no explicit fee is configured on the override.

**Design decision:** The setting should be used as the default `fee_percent` value when creating new `ProviderClientFeeOverride` records. This belongs in the code that creates overrides, not in `get_telehealth_fee()` itself (which correctly reads `override.fee_percent` from the DB).

**File:** Wherever `ProviderClientFeeOverride.objects.create()` is called. Search for creation sites:

```python
# In the attribution signal/view that creates overrides:
ProviderClientFeeOverride.objects.create(
    provider=provider,
    client=client,
    fee_percent=settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT,  # Use the setting
    source=source,
    original_fee_percent=Decimal(str(settings.OTHER_PLATFORM_FEE_PERCENT)),
)
```

**Also update the model default:**
**File:** `apps/attribution/models.py` line 110
```python
# Consider adding default to the field:
fee_percent = models.DecimalField(
    max_digits=5,
    decimal_places=4,
    default=Decimal('0.1200'),  # Or reference settings at migration time
    help_text='Reduced telehealth fee for this provider-client pair (e.g. 0.1200)',
)
```

**Test:**
1. Trigger attribution flow that creates a `ProviderClientFeeOverride`.
2. Assert: `fee_percent` == `Decimal('0.12')` (from `ATTRIBUTED_TELEHEALTH_FEE_PERCENT`).
3. Change env var to `0.10`, restart, create new override.
4. Assert: new override has `fee_percent` == `Decimal('0.10')`.

---

## FIX 7 (P2-MEDIUM): Float Arithmetic in PayPal Order Creation

**File:** `apps/stripe_integration/views.py` lines 365, 374, 377
**Problem:** `f"{float(amount):.2f}"` converts Decimal through float, risking IEEE 754 rounding.

**Before (3 occurrences):**
```python
"value": f"{float(amount):.2f}"
```

**After:**
```python
"value": str(Decimal(str(amount)).quantize(Decimal("0.01")))
```

**Why correct:** Keeps the entire calculation in Decimal space. No float intermediate.

**Test:**
1. Call `PayPalCreatePaymentAPIView.post()` with `amount="0.30"`.
2. Assert: PayPal payload contains `"value": "0.30"` (not `"0.29"` or `"0.30000..."`).

---

## FIX 8 (P3-LOW): Partial Unique Constraint on ProviderClientFeeOverride

**File:** `apps/attribution/models.py` lines 127-132
**Problem:** The `unique_fee_override_per_pair` constraint is unconditional. After deactivating an override (`is_active=False`), you cannot create a new one for the same pair.

**Before:**
```python
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'client'],
                name='unique_fee_override_per_pair',
            ),
        ]
```

**After:**
```python
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'client'],
                name='unique_fee_override_per_pair',
                condition=models.Q(is_active=True),
            ),
        ]
```

**Migration required:** Generate with `python manage.py makemigrations attribution`.

**Why correct:** Allows soft-delete + recreate pattern. Only one active override per (provider, client) pair, but historical deactivated rows can coexist.

**Test:**
1. Create override for (provider_A, client_B). Assert: exists.
2. Deactivate it (`is_active=False`).
3. Create new override for (provider_A, client_B). Assert: succeeds.
4. Try creating a second active override for same pair. Assert: `IntegrityError`.

---

## FIX 9 (P3-LOW): Add select_for_update() to Cron Capture Queries

**File:** `lumy_global/cron.py` lines 392-409
**Problem:** No row-level lock on appointment queries before capture. In horizontal scaling, concurrent cron runs could double-capture.

**Before:**
```python
    to_capture_paypal = Appointment.objects.filter(
        start_date_time__gte=window_start,
        ...
    )
    ...
    to_capture_stripe = Appointment.objects.filter(
        ...
    )
```

**After (wrap each capture loop in `transaction.atomic()` with `select_for_update()`):**
```python
    with transaction.atomic():
        to_capture_paypal = list(Appointment.objects.select_for_update().filter(
            start_date_time__gte=window_start,
            ...
        ))
        for appt in to_capture_paypal:
            ...

    with transaction.atomic():
        to_capture_stripe = list(Appointment.objects.select_for_update().filter(
            ...
        ))
        for appt in to_capture_stripe:
            ...
```

**Why correct:** `select_for_update()` acquires row-level locks, preventing concurrent workers from processing the same appointment.

**Test:**
1. Simulate concurrent cron runs (two threads calling `capture_authorized_payments_job()`).
2. Assert: each appointment is captured exactly once.

---

## Implementation Sequence

| Phase | Fixes | Rationale |
|---|---|---|
| **Phase 1** | FIX 3e (PaymentIntentAPIView `transfer_data`) | Prerequisite for all Stripe capture fixes |
| **Phase 2** | FIX 3b, 3c, 3d (calendar Stripe captures) + FIX 1 (cron Stripe capture) | Enable fee collection on all Stripe paths |
| **Phase 3** | FIX 4 (verification `get_telehealth_fee`) | Attributed rate on verification |
| **Phase 4** | FIX 2 (Talk Now) | Requires design decision on provider resolution at checkout |
| **Phase 5** | FIX 5 (fee tier label) + FIX 6 (ATTRIBUTED setting) + FIX 7 (float) | Non-blocking improvements |
| **Phase 6** | FIX 8 (partial constraint) + FIX 9 (select_for_update) | Hardening |

**Estimated total effort:** 3-4 days of implementation + testing.

---

## Files Modified Summary

| File | Fixes Applied |
|---|---|
| `lumy_global/cron.py` | FIX 1, FIX 9 |
| `apps/talk_now/views.py` | FIX 2a-2e |
| `apps/calendar_functionality/views.py` | FIX 3a-3d |
| `apps/stripe_integration/views.py` | FIX 3e, FIX 7 |
| `apps/verification/views.py` | FIX 4 |
| `apps/attribution/utils.py` | FIX 5 |
| `apps/attribution/models.py` | FIX 6, FIX 8 |

---

## Risk Notes

1. **Stripe Connect prerequisite:** ALL Stripe fee fixes depend on providers having Stripe Connect accounts with `transfer_data` at PI creation. If a provider lacks a Stripe Connect ID, the PI creation will fail. Add a guard: if `provider_stripe_id` is None, skip `transfer_data` and log a warning (platform collects no fee but payment still works).

2. **Backwards compatibility:** Existing uncaptured PaymentIntents (created without `transfer_data`) cannot have `application_fee_amount` added at capture time. These must be captured without fees. The cron fix should check `pi.get("transfer_data")` before adding `application_fee_amount`.

3. **Talk Now design gap:** `TalkNowCheckout` has no concept of which provider the session is for. Adding `care_provider_id` to the checkout request is a frontend+backend change. Until resolved, Talk Now payments will not have fees applied.
