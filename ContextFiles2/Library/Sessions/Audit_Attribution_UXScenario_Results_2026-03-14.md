# Attribution Data Model — UX / Scenario / Business-Logic Audit Results

**Date:** 2026-03-14
**Scope ticket:** RGDEV-182
**Branch:** `RGDEV-182/attribution-data-model`
**Implementation commit:** `82d2238` (feat(RGDEV-205): contained checkout flow + attribution fee engine)
**Auditor:** Claude Opus 4.6

---

## Summary

The implementation deviates significantly from the BRD/audit prompt's assumed architecture. There is **no `ProviderClientFeeOverride` model** — the implementation uses a simpler design where `ProfileAttributionToken` is the sole model and `get_telehealth_fee()` computes the fee dynamically from the token at checkout time. There is also no `status` field (pending/confirmed/expired/ineligible) on the token; expiry is checked lazily via `expires_at` comparison. This is a leaner design but has material gaps against the stated business rules.

**Critical findings:** 3 BUGs, 8 GAPs, 4 AMBIGUOUS items, 2 OUT OF SCOPE.

---

## Findings Table

| ID | Section | Status | File : Line(s) | Description |
|----|---------|--------|-----------------|-------------|
| 1.1 | Per-pair scoping | **PASS** | `models.py:44-48` | `UniqueConstraint(fields=['care_provider','client'])` correctly scopes attribution per provider-client pair |
| 1.2 | Multiple pending tokens | **BUG** | `models.py:44-48` | UniqueConstraint on `(care_provider, client)` means a client can only have ONE token across ALL providers — a second provider visit would violate the constraint or require `update_or_create` which overwrites the first. See detail below. |
| 2.1 | Concurrent bookings race | **PASS** | `views.py:370` (BookingLinkAttributionView) | Uses `update_or_create` which handles IntegrityError internally via Django's retry mechanism |
| 2.2 | Token confirm vs expiry race | **OUT OF SCOPE** | — | No `status` field exists; no confirmation step. Expiry is checked lazily at checkout via `expires_at__gt=now` query filter. No race possible in the current design. |
| 2.3 | DB-level unique constraint | **PASS** | `0001_initial.py:55-59` | Migration includes `AddConstraint` with `UniqueConstraint` — enforced at PostgreSQL level |
| 3.1 | Booking-link vs profile conflict | **AMBIGUOUS** | `views.py:370` | `BookingLinkAttributionView` uses `update_or_create` with `defaults={'source': 'BOOKING_LINK'}`, so a booking-link visit OVERWRITES a prior PROFILE token. No PROFILE attribution creation endpoint exists yet. Product decision needed: should profile attribution be upgradeable to booking-link? |
| 3.2 | Source on fee override | **GAP** | — | No `ProviderClientFeeOverride` model exists. Fee is computed dynamically from `ProfileAttributionToken.source`. The source is preserved on the token, but NOT on the Appointment or payment record — no audit trail of which fee tier was applied at payment time. |
| 4.1 | Fail-safe 15% on error | **BUG** | `utils.py:30-46` | `get_telehealth_fee` only catches `ProfileAttributionToken.DoesNotExist`. Any other exception (DatabaseError, OperationalError, MultipleObjectsReturned) will propagate uncaught and crash the checkout flow with a 500. No logging of failures. |
| 4.2 | Fail-safe in both Stripe/PayPal | **GAP** | `stripe_integration/views.py:425-428` | PayPal flow uses hardcoded `settings.OTHER_PLATFORM_FEE_PERCENT` — does NOT call `get_telehealth_fee`. Attribution discounts only apply via the booking-link checkout endpoint. PayPal's existing flow and the Stripe PaymentIntent flow in `stripe_integration/views.py` are separate code paths with no attribution awareness. |
| 5.1 | In-person 5% hard rule | **BUG** | `booking_link/views.py:431` | `get_telehealth_fee(cp, client)` is called unconditionally — no modality check. The booking-link checkout does not pass or check session modality. If an in-person session is booked via the booking-link checkout, it will receive 10% or 12% instead of the required 5%. |
| 5.2 | In-person fee constant | **GAP** | `settings.py:608` | `IN_PERSON_PLATFORM_FEE_PERCENT` exists as an env-based setting but is only used in the PayPal capture flow (`stripe_integration/views.py:426`). The booking-link checkout has no reference to it. |
| 6.1 | Discount reset on cancel | **GAP** | — | No cancellation handler exists anywhere in `apps/attribution/` or `apps/calendar_functionality/` that resets or cleans up `ProfileAttributionToken` when an appointment is cancelled. |
| 6.2 | Discount flag ownership | **GAP** | — | `first_session_discount_applied` field does not exist on any model. Not implemented. |
| 6.3 | Per-pair reset | **GAP** | — | No cancellation handler exists; moot. |
| 6.4 | Cancellation reset test | **GAP** | — | No test exists. |
| 7.1 | `is_expired` timezone | **PASS** | `models.py:57` | Uses `timezone.now()` correctly |
| 7.2 | Expiry scheduler | **AMBIGUOUS** | — | No background job marks tokens expired. Expiry is lazy: `get_telehealth_fee` filters by `expires_at__gt=now`. This is safe for fee calculation but means the DB accumulates stale tokens indefinitely. Acceptable for MVP but should be documented. |
| 8.1 | INELIGIBLE status | **GAP** | `models.py` | No `status` field exists on `ProfileAttributionToken`. No `ineligible` state. The model has only `source`, `created_at`, `expires_at`. Expiry is the only lifecycle transition. |
| 8.2 | Fraud guardrail | **PASS** | `utils.py:12-19`, `views.py:363-367` | `has_prior_booking()` prevents booking-link attribution for clients with prior SCHEDULED/COMPLETED appointments. `BookingLinkClickThrottle` rate-limits click tracking to 60/hour per IP. However, no IP dedup on attribution endpoint itself — see AMBIGUOUS note below. |
| 8.2b | Attribution endpoint rate limit | **AMBIGUOUS** | `views.py:347-369` | `BookingLinkAttributionView` has no throttle class. A malicious authenticated client could spam the attribution endpoint. `update_or_create` prevents duplicate rows, but each call hits the DB. Low severity. |
| 9.1 | Revenue by fee tier | **GAP** | `calendar_functionality/models.py:79-119` | `Appointment` model has no `fee_rate` or `fee_percent` field. The fee is stored only in Stripe `PaymentIntent.metadata['fee_rate']` (views.py:443). If Stripe data is lost or the PI is deleted, historical fee tier is unrecoverable. The `ProfileAttributionToken` may have been deleted (CASCADE on provider/client delete) by that time. |
| 9.2 | Attribution penetration rate | **AMBIGUOUS** | — | Without `fee_rate` on `Appointment`, penetration rate requires joining against Stripe metadata or against `ProfileAttributionToken`. If token expires or is deleted, the metric is lossy. |
| 9.3 | Confirmation timestamp | **PASS** | `models.py:51` | `created_at = auto_now_add=True`. No fixture/loaddata path needed for this model (ORM-only creation). |
| 10.1 | urls.py exists | **PASS** | — | No `apps/attribution/urls.py` exists (correct: no endpoints needed). Attribution endpoints live in `apps/booking_link/urls.py`. App is in `INSTALLED_APPS` (settings.py:96). |
| 10.2 | No client-facing fee view | **PASS** | — | No `views.py` exists in `apps/attribution/`. Fee is returned in checkout response (`fee_rate` field) but only after payment creation — acceptable. |
| 11.1 | Override immutability | **OUT OF SCOPE** | — | No `ProviderClientFeeOverride` model exists. `ProfileAttributionToken` CAN be updated (via `update_or_create` in attribution view). The token's `source` can change from PROFILE to BOOKING_LINK on re-visit. This is mutable by design but needs product clarification on whether that is intended. |
| 11.2 | Provider profile update | **PASS** | `booking_link/signals.py` | `post_save` on `CareProvider` only syncs booking-link slugs. No signal touches `ProfileAttributionToken`. |

---

## Prioritised Fix List

### BUGs (must fix before RGDEV-183)

#### BUG-1: `get_telehealth_fee` lacks broad exception handling (ID 4.1)

**File:** `apps/attribution/utils.py:28-46`
**Risk:** Any DB error (connection timeout, unexpected MultipleObjectsReturned) crashes checkout with 500 instead of falling back to 15%.

**Proposed fix:**
```python
def get_telehealth_fee(care_provider, client):
    from apps.attribution.models import ProfileAttributionToken
    import logging
    logger = logging.getLogger(__name__)
    now = timezone.now()
    try:
        token = ProfileAttributionToken.objects.get(
            care_provider=care_provider,
            client=client,
            expires_at__gt=now,
        )
    except ProfileAttributionToken.DoesNotExist:
        return Decimal('0.15')
    except Exception:
        logger.error(
            "Attribution fee lookup failed for provider=%s client=%s, defaulting to 15%%",
            care_provider.pk, client.pk, exc_info=True,
        )
        return Decimal('0.15')

    if token.source == 'BOOKING_LINK' and not has_prior_booking(care_provider, client):
        return Decimal('0.10')
    if token.source == 'PROFILE':
        return Decimal('0.12')
    return Decimal('0.15')
```

**Test needed:** `test_get_telehealth_fee_returns_standard_on_db_error` — patch `ProfileAttributionToken.objects.get` to raise `OperationalError`, assert return is `Decimal('0.15')`.

---

#### BUG-2: In-person sessions receive attribution discount (ID 5.1)

**File:** `apps/booking_link/views.py:431`
**Risk:** An in-person session booked through a booking link gets 10% fee instead of the mandatory 5%.

**Proposed fix (option A — gate in checkout view):**
```python
# After resolving cp and client, before fee calc:
is_in_person = False
if data.get('format_id'):
    from apps.calendar_functionality.models import FormatType
    fmt = FormatType.objects.filter(pk=data['format_id']).first()
    if fmt and fmt.name == 'IN PERSON':
        is_in_person = True

if is_in_person:
    fee_rate = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
else:
    fee_rate = get_telehealth_fee(cp, client)
```

**Proposed fix (option B — guard in utility):**
Add a `modality` parameter to `get_telehealth_fee` that returns `Decimal('0.05')` immediately for in-person.

**Test needed:** `test_in_person_session_uses_5pct_even_with_attribution` — create a BOOKING_LINK token, book in-person, assert `fee_rate == '0.05'`.

---

#### BUG-3: UniqueConstraint blocks multi-provider attribution (ID 1.2)

**File:** `apps/attribution/models.py:44-48`
**Risk:** The constraint `unique_attribution_per_provider_client` is on `(care_provider, client)`, which is correct for preventing duplicate tokens for the SAME pair. However, the audit prompt's concern in 1.2 is about whether the constraint prevents tokens for DIFFERENT providers. Since the constraint includes `care_provider`, different providers create different constraint tuples — so this is actually **PASS on re-analysis**. A client CAN have tokens for Provider A and Provider B simultaneously.

**Reclassification: PASS** (the unique constraint is on the pair, not on client alone).

---

### High-Impact GAPs

#### GAP-1: No fee_rate stored on Appointment (ID 9.1, 3.2)

**Risk:** Historical revenue-by-tier reporting is impossible from the Django database alone. The fee is only in Stripe metadata.

**Proposed fix:** Add `applied_fee_rate = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)` to `Appointment` model. Set it at checkout time alongside the PaymentIntent creation.

---

#### GAP-2: PayPal flow does not use `get_telehealth_fee` (ID 4.2)

**Risk:** Attribution discounts only apply through the booking-link checkout. The existing PayPal capture flow uses a flat `OTHER_PLATFORM_FEE_PERCENT` setting with no attribution awareness.

**Proposed fix:** In `PayPalCapturePaymentAPIView`, replace the flat setting lookup with `get_telehealth_fee()` for telehealth sessions. Keep the in-person 5% gate.

---

#### GAP-3: No `first_session_discount_applied` field (ID 6.1, 6.2, 6.3, 6.4)

**Risk:** The BRD mentions a first-session discount reset on cancellation. The entire first-session discount mechanism is unimplemented.

**Proposed fix:** Defer to a follow-up ticket. Document as out-of-scope for RGDEV-182 if product confirms.

---

#### GAP-4: No INELIGIBLE status or lifecycle states (ID 8.1)

**Risk:** Dead concept in the BRD with no implementation path. Future developers may assume it exists.

**Proposed fix:** Either add a `status` CharField with choices `(ACTIVE, EXPIRED, INELIGIBLE)` and a lazy expiry check, or explicitly document that token lifecycle is managed solely via `expires_at` and deletion.

---

#### GAP-5: No cancellation handler resets attribution (ID 6.1)

**Risk:** If a client books (consuming the attribution token's benefit), then cancels before the session, the token may have already expired by the time they rebook, losing the discount permanently. This may or may not be intended.

**Proposed fix:** Add a `post_save` signal on `Appointment` that, when `is_status` changes to `CANCELLED`, extends the `expires_at` on the related `ProfileAttributionToken` to give the client a fresh 60-day window.

---

## Product Decisions Required

1. **Booking-link vs profile conflict resolution (ID 3.1):** Current `update_or_create` overwrites PROFILE tokens with BOOKING_LINK. Is upgrade-only (profile -> booking_link = 12% -> 10%) intended, or should the lower fee always win regardless of visit order?

2. **INELIGIBLE status trigger (ID 8.1):** What conditions make a token ineligible? Fraud detection? Provider opt-out? Or is this concept deferred entirely?

3. **First-session discount (ID 6.1-6.4):** Is this in scope for RGDEV-182 or a separate ticket? The entire mechanism is unimplemented.

4. **Token mutability (ID 11.1):** Is it acceptable that `BookingLinkAttributionView.update_or_create` can change an existing token's source and reset its expiry? This means a PROFILE token can be silently upgraded to BOOKING_LINK, changing the fee from 12% to 10%.

---

## Overall Assessment

The RGDEV-182 data model is **structurally sound for the core use case** (booking-link attribution with per-pair scoping and lazy expiry). The design is simpler than the BRD assumed — no `ProviderClientFeeOverride`, no status lifecycle, no first-session discount — which reduces complexity but creates gaps against the full specification.

**Highest-priority change before RGDEV-183:** Add broad exception handling to `get_telehealth_fee()` (BUG-1). Without this, any database hiccup during fee lookup crashes the entire checkout flow instead of safely defaulting to 15%. This is a one-line fix (`except Exception:` with logging) that eliminates the most dangerous fail-open scenario.

**Second priority:** Add an in-person modality gate (BUG-2) to prevent attribution discounts from being applied to in-person sessions, which violates the hard 5% business rule.
