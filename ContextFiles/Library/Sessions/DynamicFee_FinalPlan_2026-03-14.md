# RGDEV-184 Dynamic Platform Fee — FINAL CORRECTED PLAN

**Date:** 2026-03-14
**Branch:** `RGDEV-184/dynamic-fee-calculation`
**Inputs:** DataModel fix plan, UXScenario fix plan, implementer branch code audit
**Status:** Ready for implementation

---

## Executive Summary

The implementer built the attribution data model (`apps/attribution/`) with `get_telehealth_fee()`, `get_checkout_discount()`, `create_attribution_token()`, and the `ProviderClientFeeOverride` model. However, **none of the payment paths actually use the dynamic fee system**. All Stripe captures pass zero fee; all PayPal captures use hardcoded `settings.OTHER_PLATFORM_FEE_PERCENT`; Talk Now has no fee at all. The `confirm_attribution_if_eligible()` function was never written, so fee overrides are never created from attribution tokens.

**Total fixes: 14** (6 P0-CRITICAL, 3 P1-HIGH, 3 P2-MEDIUM, 2 P3-LOW)

---

## What the IMPLEMENTER Built (KEEP)

These are correct and remain as-is:

| File | Status | Notes |
|---|---|---|
| `apps/attribution/models.py` | **KEEP** | `ProfileAttributionToken`, `ProviderClientFeeOverride`, `AttributionSource`, `AttributionStatus` — all correct |
| `apps/attribution/utils.py` — `get_telehealth_fee()` | **KEEP (with fixes)** | Core logic correct; needs zero-guard (FIX 3) and label fix (FIX 10) |
| `apps/attribution/utils.py` — `get_checkout_discount()` | **KEEP** | Correct, uses `select_for_update()` |
| `apps/attribution/utils.py` — `create_attribution_token()` | **KEEP** | Correct, extends window on re-visit |
| `apps/attribution/admin.py` | **KEEP** | Admin registration |
| `apps/attribution/tests/test_models.py` | **KEEP** | Model tests |
| `apps/attribution/management/commands/expire_attribution_tokens.py` | **KEEP** | Expiry management command |
| `apps/booking_link/` (entire app) | **KEEP** | Booking link feature, separate ticket |

---

## Implementation Sequence

Fixes are ordered to avoid broken intermediate states. Deploy in this exact order.

---

### PHASE 1: Configuration (prevents zero-fee in all environments)

#### FIX 1 (P0-CRITICAL): `.env.example` — Set non-zero fee defaults

**Source:** UXScenario Fix 2
**File:** `.env.example`, lines 118-119
**Problem:** `OTHER_PLATFORM_FEE_PERCENT=0` and `IN_PERSON_PLATFORM_FEE_PERCENT=0` cause all dev/staging environments to compute 0% platform fee.

**Before:**
```
OTHER_PLATFORM_FEE_PERCENT=0
IN_PERSON_PLATFORM_FEE_PERCENT=0
```

**After:**
```
OTHER_PLATFORM_FEE_PERCENT=0.15
IN_PERSON_PLATFORM_FEE_PERCENT=0.05
```

**Implementer code:** NOT ADDRESSED — `=0` still on branch.

---

#### FIX 2 (P0-CRITICAL): `lumy_global/settings.py` — Cast fee settings to Decimal with defaults

**Source:** UXScenario Fix 4
**File:** `lumy_global/settings.py`, lines 622-623
**Problem:** `OTHER_PLATFORM_FEE_PERCENT` and `IN_PERSON_PLATFORM_FEE_PERCENT` are raw strings with no defaults. If `.env` is missing or empty, code breaks or silently uses `"0"`.

**Before:**
```python
OTHER_PLATFORM_FEE_PERCENT=env("OTHER_PLATFORM_FEE_PERCENT")
IN_PERSON_PLATFORM_FEE_PERCENT=env("IN_PERSON_PLATFORM_FEE_PERCENT")
```

**After:**
```python
OTHER_PLATFORM_FEE_PERCENT = Decimal(env("OTHER_PLATFORM_FEE_PERCENT", default="0.15"))
IN_PERSON_PLATFORM_FEE_PERCENT = Decimal(env("IN_PERSON_PLATFORM_FEE_PERCENT", default="0.05"))
```

**Note:** `from decimal import Decimal` is already present (used for `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` on line 626).

**Implementer code:** NOT ADDRESSED — raw strings still on branch.

---

#### FIX 3 (P0-CRITICAL): `apps/attribution/utils.py` — Zero-value guard in `get_telehealth_fee()`

**Source:** UXScenario Fix 3
**File:** `apps/attribution/utils.py`, line 53
**Problem:** The `or '0.15'` guard does not catch string `"0"` because `"0"` is truthy in Python. With `.env.example` setting `=0`, the fee is `Decimal("0")`.

**Before:**
```python
standard = Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')
return (standard, STANDARD_LABEL)
```

**After:**
```python
raw = getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15'
standard = Decimal(str(raw))
if standard <= 0:
    logger.warning(
        "OTHER_PLATFORM_FEE_PERCENT is <= 0 (%s), using hardcoded 0.15",
        raw,
    )
    standard = STANDARD_FEE
return (standard, STANDARD_LABEL)
```

**Implementer code:** NOT ADDRESSED — `or '0.15'` guard still on branch.

---

### PHASE 2: Stripe Connect prerequisite (must land before any Stripe fee fix)

#### FIX 4 (P0-CRITICAL): `apps/stripe_integration/views.py` — Add `transfer_data` + `capture_method` to `PaymentIntentAPIView`

**Source:** DataModel Fix 3e + UXScenario Fix 7 (deduplicated)
**File:** `apps/stripe_integration/views.py`, `PaymentIntentAPIView.post()`, lines 58-63
**Problem:** `application_fee_amount` at capture time requires the PI to have been created with `transfer_data` (Stripe Connect requirement). Currently, the PI is created without `transfer_data` or `capture_method`.

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
        provider_stripe_id = None
        try:
            appointment_obj = Appointment.objects.select_related(
                'care_provider__user__stripeUser'
            ).get(id=appointment_id)
            provider_stripe_id = appointment_obj.care_provider.user.stripeUser.stripe_customer_id
        except Exception:
            logger.warning(
                "Could not resolve provider Stripe Connect ID for appointment %s",
                appointment_id,
            )

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

**Implementer code:** NOT ADDRESSED — no `transfer_data` or `capture_method` on branch.

---

### PHASE 3: Enable fee collection on all capture paths

#### FIX 5 (P0-CRITICAL): `lumy_global/cron.py` — Add fee calculation to Stripe capture

**Source:** DataModel Fix 1 (deduplicated with UXScenario)
**File:** `lumy_global/cron.py`, lines 486-519
**Problem:** `stripe.PaymentIntent.capture(intent_id)` called with no `application_fee_amount`. Platform collects zero fee on every cron-triggered Stripe capture. Logger on line 519 has 3 format placeholders but only 2 arguments (will raise `TypeError`).

**Dependency:** FIX 4 must be deployed first. PIs created before FIX 4 lack `transfer_data` and cannot accept `application_fee_amount` at capture — add a backwards-compat guard.

**Add import at top of file (after existing imports):**
```python
from apps.attribution.utils import get_telehealth_fee
```

**Before (lines 486-519):**
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
            # 5a) Retrieve PI to get amount and check for transfer_data
            pi = stripe.PaymentIntent.retrieve(intent_id)
            amount_cents = pi.get("amount", 0)

            capture_kwargs = {}

            # Only add application_fee if PI was created with transfer_data
            if pi.get("transfer_data"):
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
                capture_kwargs["application_fee_amount"] = application_fee_amount

                logger.info(
                    "Stripe capture fee calculated",
                    extra={
                        "appointment_id": str(appt.id),
                        "fee_tier": fee_tier,
                        "fee_pct": str(pct),
                        "application_fee_amount": application_fee_amount,
                    }
                )
            else:
                application_fee_amount = 0
                logger.warning(
                    "Stripe PI %s has no transfer_data — capturing without application_fee",
                    intent_id,
                )

            # 5d) Capture with application fee (if available)
            captured_intent = stripe.PaymentIntent.capture(
                intent_id,
                **capture_kwargs,
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

**Implementer code:** NOT ADDRESSED — zero-fee capture and broken logger still on branch.

---

#### FIX 6 (P0-CRITICAL): `apps/calendar_functionality/views.py` — Replace hardcoded fee with `get_telehealth_fee()` in all Stripe capture paths

**Source:** DataModel Fix 3b/3c/3d + UXScenario Fix 5 (deduplicated)
**File:** `apps/calendar_functionality/views.py`
**Problem:** Four Stripe paths use hardcoded `settings.OTHER_PLATFORM_FEE_PERCENT` instead of `get_telehealth_fee()`. Additionally, `application_fee_amount` and `transfer_data` are commented out in the PI creation path, and Stripe captures pass no fee.

**Add import at top of file:**
```python
from apps.attribution.utils import get_telehealth_fee
```

##### FIX 6a: PayPal capture in booking flow (lines ~797-804)

**Before:**
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

**After:**
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

##### FIX 6b: Stripe capture in booking flow (lines ~858-890)

**Before:**
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

                        ...

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

                        ...

                        if appointment.start_date_time <= cutoff:
                            try:
                                pi = stripe.PaymentIntent.retrieve(payment_intent_id)
                                capture_kwargs = {}
                                if pi.get("transfer_data"):
                                    capture_kwargs["application_fee_amount"] = application_fee_amount
                                stripe.PaymentIntent.capture(payment_intent_id, **capture_kwargs)
```

##### FIX 6c: Reschedule capture — PayPal fee calculation (lines ~1206-1208)

**Before:**
```python
                        pct = (
                            Decimal(settings.IN_PERSON_PLATFORM_FEE_PERCENT)
                            if new_appointment.format.name == "IN PERSON"
                            else Decimal(settings.OTHER_PLATFORM_FEE_PERCENT)
                        )
```

**After:**
```python
                        if new_appointment.format and new_appointment.format.name == "IN PERSON":
                            pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
                            fee_tier = "in_person_standard"
                        else:
                            pct, fee_tier = get_telehealth_fee(
                                new_appointment.care_provider, new_appointment.client
                            )
```

##### FIX 6d: Reschedule capture — Stripe path (lines ~1233-1235)

**Before:**
```python
                elif new_appointment.payment_intent_id:
                    try:
                        stripe.PaymentIntent.capture(new_appointment.payment_intent_id)
```

**After:**
```python
                elif new_appointment.payment_intent_id:
                    try:
                        pi = stripe.PaymentIntent.retrieve(new_appointment.payment_intent_id)
                        s_capture_kwargs = {}
                        if pi.get("transfer_data"):
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
                            s_capture_kwargs["application_fee_amount"] = s_fee
                        stripe.PaymentIntent.capture(
                            new_appointment.payment_intent_id, **s_capture_kwargs
                        )
```

##### FIX 6e: Manual capture view (lines ~3257-3280)

**Before:**
```python
            application_fee = int(total_amount * 0.20)  # 20% fee for the platform
            user_amount = total_amount - application_fee  # 80% for the user
            ...
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
            # Calculate dynamic fee
            if appointment.format and appointment.format.name == "IN PERSON":
                cap_pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            else:
                cap_pct, _ = get_telehealth_fee(
                    appointment.care_provider, appointment.client
                )
            application_fee = int(
                (Decimal(total_amount) * cap_pct).quantize(Decimal("1."), rounding=ROUND_HALF_UP)
            )
            user_amount = total_amount - application_fee

            ...
            pi = stripe.PaymentIntent.retrieve(appointment.payment_intent_id)
            capture_kwargs = {}
            if pi.get("transfer_data"):
                capture_kwargs["application_fee_amount"] = application_fee
            captured_intent = stripe.PaymentIntent.capture(
                appointment.payment_intent_id,
                **capture_kwargs,
            )
```

**Implementer code for all FIX 6 sub-fixes:** NOT ADDRESSED — all hardcoded fees and commented-out code still on branch.

---

#### FIX 7 (P1-HIGH): `apps/stripe_integration/views.py` — PayPal capture uses hardcoded fee

**Source:** UXScenario Fix 5 (PayPal path), DataModel implicit
**File:** `apps/stripe_integration/views.py`, `PayPalCapturePaymentAPIView.post()`, lines ~470-477
**Problem:** PayPal capture uses raw `settings.OTHER_PLATFORM_FEE_PERCENT` instead of `get_telehealth_fee()`. Attributed clients get 15% instead of 12%.

**Add import (if not already present):**
```python
from apps.attribution.utils import get_telehealth_fee
```

**Before:**
```python
        if appointment.format and appointment.format.name == "IN PERSON":
            pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
        else:
            pct = Decimal(str(settings.OTHER_PLATFORM_FEE_PERCENT))
```

**After:**
```python
        if appointment.format and appointment.format.name == "IN PERSON":
            pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            fee_tier = "in_person_standard"
        else:
            pct, fee_tier = get_telehealth_fee(appointment.care_provider, appointment.client)
```

**Implementer code:** NOT ADDRESSED — hardcoded fee still on branch.

---

#### FIX 8 (P1-HIGH): `apps/verification/views.py` — Replace hardcoded fee

**Source:** DataModel Fix 4
**File:** `apps/verification/views.py`, lines 956-958
**Problem:** Uses `settings.OTHER_PLATFORM_FEE_PERCENT` directly. Attributed clients get standard rate.

**Add import at top of file:**
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

**Note:** `care_provider` and `client` must be resolved from the verification checkout context. Verify these variables are in scope at line 956.

**Implementer code:** NOT ADDRESSED.

---

### PHASE 4: Attribution confirmation (creates the fee override rows)

#### FIX 9 (P0 — effectively): `apps/attribution/utils.py` — Add `confirm_attribution_if_eligible()`

**Source:** UXScenario Fix 1
**File:** `apps/attribution/utils.py`
**Problem:** No function exists to confirm a pending attribution token and create the `ProviderClientFeeOverride` row. Without this, `get_telehealth_fee()` always returns the standard rate because no override rows are ever created.

**Action:** Append after `create_attribution_token()` (after the last line of the file):

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
        str(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')
    )
    if standard_fee <= 0:
        standard_fee = STANDARD_FEE

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

**Implementer code:** NOT PRESENT — function does not exist on branch.

---

#### FIX 9b: Call `confirm_attribution_if_eligible` in capture paths

**Source:** UXScenario Fix 1 (integration points)

Add call in `apps/stripe_integration/views.py` `PayPalCapturePaymentAPIView.post()`, after `capture_authorization()` succeeds:

```python
from apps.attribution.utils import get_telehealth_fee, confirm_attribution_if_eligible

# After capture_resp = capture_authorization(...)
try:
    confirm_attribution_if_eligible(appointment)
except Exception:
    logger.exception(
        "Failed to confirm attribution after PayPal capture",
        extra={"appointment_id": str(appointment.id)},
    )
```

Add call in `lumy_global/cron.py` PayPal capture loop, after `appt.save()` (after line ~479):

```python
try:
    from apps.attribution.utils import confirm_attribution_if_eligible
    confirm_attribution_if_eligible(appt)
except Exception:
    logger.exception("Failed to confirm attribution in cron", extra={"appointment_id": str(appt.id)})
```

Add same call in `apps/calendar_functionality/views.py` after each successful capture path.

---

### PHASE 5: Talk Now fee (requires product decision)

#### FIX 10 (P1-HIGH): `apps/talk_now/views.py` — Add fee to Talk Now payments

**Source:** DataModel Fix 2 + UXScenario Fix 8 (deduplicated)
**File:** `apps/talk_now/views.py`
**Problem:** Three paths create/capture Stripe payments with zero platform fee.

**Recommended immediate action:** Add documentation + logger warning until product decision is made. Talk Now's architecture makes fee splits complex because:
1. `TalkNow.client` is FK to `User`, not `Client` — fee lookup must route through `client.user`
2. `TalkNowCheckout` has no concept of which provider the session is for at checkout time
3. Checkout creates PI with `capture_method: "manual"` but no `transfer_data`

**Add to `_handle_payment_intent()` before the capture line (line 137):**
```python
# NOTE: Talk Now payments currently have no application_fee_amount (platform fee split).
# Product decision pending (RGDEV-184). If Talk Now should have fee splits,
# add application_fee_amount here and transfer_data at checkout creation.
logger.info("Talk Now capture: no platform fee split applied", extra={"payment_id": str(payment.id)})
```

**Full implementation (when product decision is made):** Follow DataModel Fix 2a-2e — add `provider`/`client` params to `_handle_payment_intent()` and `_handle_setup_intent()`, resolve via `TalkNow` model in `charge_talknow_payment()`, add `transfer_data` to checkout session.

**Implementer code:** NOT ADDRESSED.

---

### PHASE 6: Analytics and correctness improvements

#### FIX 11 (P2-MEDIUM): `apps/attribution/utils.py` — Fee tier label should include source

**Source:** DataModel Fix 5
**File:** `apps/attribution/utils.py`, line 52
**Problem:** Returns `"attributed"` for all overrides. BRD requires `"attributed_profile"` and `"attributed_booking_link"`.

**Before:**
```python
        if override:
            return (override.fee_percent, ATTRIBUTED_LABEL)
```

**After:**
```python
        if override:
            label = f"attributed_{override.source}"
            return (override.fee_percent, label)
```

**Implementer code:** `ATTRIBUTED_LABEL = 'attributed'` constant still on branch. This fix bypasses it for the dynamic label.

---

#### FIX 12 (P2-MEDIUM): `apps/stripe_integration/views.py` — Float-to-Decimal in PayPal order

**Source:** DataModel Fix 7
**File:** `apps/stripe_integration/views.py`, `PayPalCreatePaymentAPIView.post()`, lines 365, 374, 377
**Problem:** `f"{float(amount):.2f}"` converts Decimal through float, risking IEEE 754 rounding.

**Before (3 occurrences):**
```python
"value": f"{float(amount):.2f}"
```

**After:**
```python
"value": str(Decimal(str(amount)).quantize(Decimal("0.01")))
```

**Implementer code:** NOT ADDRESSED.

---

#### FIX 13 (P2-MEDIUM): `apps/attribution/apps.py` — Startup validation for fee constants

**Source:** UXScenario Fix 11
**File:** `apps/attribution/apps.py`
**Problem:** No assertion prevents fee constants from being zero or negative.

**Before:**
```python
class AttributionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.attribution'
    verbose_name = 'Attribution'
```

**After:**
```python
class AttributionConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.attribution'
    verbose_name = 'Attribution'

    def ready(self):
        from django.conf import settings
        from decimal import Decimal
        import logging

        fee_vars = {
            'OTHER_PLATFORM_FEE_PERCENT': getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', None),
            'IN_PERSON_PLATFORM_FEE_PERCENT': getattr(settings, 'IN_PERSON_PLATFORM_FEE_PERCENT', None),
            'ATTRIBUTED_TELEHEALTH_FEE_PERCENT': getattr(settings, 'ATTRIBUTED_TELEHEALTH_FEE_PERCENT', None),
        }
        log = logging.getLogger(__name__)
        for name, val in fee_vars.items():
            if val is None:
                continue
            d = Decimal(str(val))
            if not (Decimal('0') < d < Decimal('1')):
                log.error(
                    "FATAL: %s=%s is outside (0, 1). Platform fees will be incorrect.",
                    name, val,
                )
```

**Implementer code:** NOT ADDRESSED.

---

### PHASE 7: Hardening

#### FIX 14 (P3-LOW): `apps/attribution/models.py` — Partial unique constraint on `ProviderClientFeeOverride`

**Source:** DataModel Fix 8
**File:** `apps/attribution/models.py`, lines 127-132
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

**Migration required:** `python manage.py makemigrations attribution`

**Note:** The `ProviderClientFeeOverride` model inherits from `BaseModel` which includes `is_active`. Verify `is_active` field exists on the model (it's inherited, not explicit).

**Implementer code:** Unconditional constraint on branch.

---

## Deferred / Not Included

These items from the audit plans are **deferred** to separate work:

| Item | Reason | Ticket |
|---|---|---|
| Fee audit fields on `Appointment` model (`fee_tier_label`, `fee_pct_applied`, `platform_fee_cents`) | New model fields + migration + populate in all capture paths — significant scope, does not block fee correctness | New ticket recommended |
| Lock fee at authorization time (race condition) | Depends on fee audit fields | Same new ticket |
| Fee-preview API endpoint | P2, no frontend dependency yet | New ticket recommended |
| `select_for_update()` on cron capture queries | P3 hardening, only relevant at scale | New ticket |
| PayPal cron capture path — `get_telehealth_fee()` (lines 439-441 of `cron.py`) | PayPal cron already works but uses hardcoded fee — same pattern as FIX 7 | Include in FIX 5 scope |

---

## Cross-Ticket Items

| Item | Affected Ticket | Description |
|---|---|---|
| `confirm_attribution_if_eligible()` | **RGDEV-205** (Checkout Flow) | The checkout endpoint in `apps/booking_link/views.py` should also call this after successful payment capture |
| `transfer_data` at PI creation | **RGDEV-183** (Stripe Connect onboarding) | Providers must have Stripe Connect accounts before `transfer_data` can be set. If onboarding is incomplete, fee splits silently fail |
| Talk Now fee policy | **New ticket needed** | Product decision required: should Talk Now sessions have platform fees? |
| Fee audit fields on Appointment | **New ticket needed** | Financial reporting depends on persisting fee tier/percent/amount at capture time |
| `.env.example` zero values | **All tickets** | Affects every dev environment — anyone using `.env.example` as their `.env` gets zero fees |

---

## Summary Table

| Fix | Priority | File(s) | Implementer Status | Action |
|---|---|---|---|---|
| FIX 1 | P0 | `.env.example` | NOT DONE | Change `=0` to `=0.15` / `=0.05` |
| FIX 2 | P0 | `settings.py` | NOT DONE | Add Decimal cast + defaults |
| FIX 3 | P0 | `attribution/utils.py` | NOT DONE | Add zero-value guard |
| FIX 4 | P0 | `stripe_integration/views.py` | NOT DONE | Add `transfer_data` + `capture_method` |
| FIX 5 | P0 | `cron.py` | NOT DONE | Add fee calc to Stripe capture |
| FIX 6 | P0 | `calendar_functionality/views.py` | NOT DONE | Replace hardcoded fee in 5 paths |
| FIX 7 | P1 | `stripe_integration/views.py` | NOT DONE | Use `get_telehealth_fee()` in PayPal capture |
| FIX 8 | P1 | `verification/views.py` | NOT DONE | Use `get_telehealth_fee()` |
| FIX 9 | P0-eff | `attribution/utils.py` + integration | NOT DONE | Add `confirm_attribution_if_eligible()` |
| FIX 10 | P1 | `talk_now/views.py` | NOT DONE | Add logger + doc (full impl deferred) |
| FIX 11 | P2 | `attribution/utils.py` | NOT DONE | Dynamic fee tier label |
| FIX 12 | P2 | `stripe_integration/views.py` | NOT DONE | Float->Decimal in PayPal |
| FIX 13 | P2 | `attribution/apps.py` | NOT DONE | Startup fee validation |
| FIX 14 | P3 | `attribution/models.py` | NOT DONE | Partial unique constraint |

**Estimated total effort:** 4-5 days (Phases 1-4: 2 days, Phases 5-7: 2-3 days)
