# Fix Implementation Plan: RGDEV-183 Attribution Window UX/Scenario Gaps

**Date**: 2026-03-14
**Source**: [Audit_AttributionWindow_UXScenario_Results_2026-03-14.md](Audit_AttributionWindow_UXScenario_Results_2026-03-14.md)
**Scope**: Backend only (frontend integration deferred to RGDEV-206)

---

## Fix 1: `confirm_attribution_if_eligible` + ProviderClientFeeOverride creation (CRITICAL)

**Audit findings**: 1b, 1c, 4 (checkout-status never positive)
**Root cause**: The `confirm_attribution_if_eligible()` function exists only in an unmerged worktree. No code transitions tokens from PENDING to CONFIRMED. No code creates `ProviderClientFeeOverride` records. This is the single root cause of three audit findings.

**File**: `apps/attribution/utils.py`

**Implementation**: Add the following function after `create_attribution_token()`:

```python
def confirm_attribution_if_eligible(provider, client):
    """
    Transition a PENDING attribution token to CONFIRMED and create the
    ProviderClientFeeOverride record that drives the 12% fee tier.

    Called from the payment capture flow (Stripe and PayPal) when a booking
    is completed. This is the ONLY code path that creates fee overrides.

    Returns:
        (token, fee_override, confirmed) tuple:
        - token: the ProfileAttributionToken (or None)
        - fee_override: the ProviderClientFeeOverride (or None)
        - confirmed: bool — True if this call performed the transition

    Idempotent: if token is already CONFIRMED and fee override exists,
    returns them without modification.
    """
    from decimal import Decimal

    token = ProfileAttributionToken.objects.filter(
        provider=provider,
        client=client,
        status=AttributionStatus.PENDING,
        expires_at__gt=timezone.now(),
    ).select_for_update().first()

    if token is None:
        # Check for already-confirmed (idempotent)
        confirmed_token = ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
            status=AttributionStatus.CONFIRMED,
        ).first()
        if confirmed_token:
            existing_override = ProviderClientFeeOverride.objects.filter(
                provider=provider,
                client=client,
                is_active=True,
            ).first()
            return (confirmed_token, existing_override, False)
        return (None, None, False)

    # Transition PENDING -> CONFIRMED
    token.status = AttributionStatus.CONFIRMED
    token.first_booking_at = timezone.now()
    token.save(update_fields=['status', 'first_booking_at', 'modified_at'])

    # Create the fee override that drives the 12% tier
    attributed_fee = Decimal(str(
        getattr(settings, 'ATTRIBUTED_TELEHEALTH_FEE_PERCENT', '0.12')
    ))
    standard_fee = Decimal(str(
        getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15')
    ))

    fee_override, _ = ProviderClientFeeOverride.objects.get_or_create(
        provider=provider,
        client=client,
        defaults={
            'fee_percent': attributed_fee,
            'source': token.source,
            'original_fee_percent': standard_fee,
        },
    )

    logger.info(
        "Attribution confirmed: provider=%s client=%s token=%s fee_override=%s",
        provider.id, client.id, token.id, fee_override.id,
    )

    return (token, fee_override, True)
```

**Wiring into payment capture**: After `confirm_attribution_if_eligible` is added to `utils.py`, import and call it from both:
- `apps/stripe_integration/views.py` — in the payment capture/success handler
- `apps/stripe_integration/views.py` — in the PayPal order capture handler

The call site pattern:

```python
from apps.attribution.utils import confirm_attribution_if_eligible

# After payment is successfully captured:
confirm_attribution_if_eligible(
    provider=appointment.care_provider,
    client=appointment.client,
)
```

The function is wrapped in `transaction.atomic()` via `select_for_update()` and is idempotent, so it is safe to call on every payment capture without conditional guards.

**Dependencies resolved by this fix**:
- Finding 1b: PENDING-to-CONFIRMED transition now wired
- Finding 1c: `ProviderClientFeeOverride` records now created on confirmation
- Finding 4 (checkout-status): `AttributionCheckoutStatusView` filters for `status=CONFIRMED` — once tokens reach CONFIRMED, the endpoint returns positive results. No change needed in the view itself.

---

## Fix 2: Anonymous visitor attribution via signed token (CRITICAL)

**Audit findings**: 3a, 4 (persistence bridge — backend half)
**Root cause**: `TrackAttributionView` requires `IsAuthenticated`. The most common attribution scenario (anonymous visitor discovers provider externally, clicks link, lands on platform without an account) produces zero server-side attribution.

**Files to modify**:
- `apps/attribution/views.py` — add two new views
- `apps/attribution/urls.py` — register new endpoints

### 2a. New view: `TrackAnonymousAttributionView`

**Endpoint**: `POST /api/v1/attribution/track-anonymous/`
**Auth**: `AllowAny` (unauthenticated)
**Throttle**: `AnonRateThrottle` (rate-limited to prevent abuse)

```python
import hashlib
import hmac
import json
import time

from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle


class AnonymousAttributionThrottle(AnonRateThrottle):
    """Tight rate limit for unauthenticated attribution tracking."""
    rate = '30/hour'


class TrackAnonymousAttributionView(APIView):
    """
    POST /api/v1/attribution/track-anonymous/
    Body: {"provider_id": <int>, "referer": <url, optional>}

    Returns a signed token encoding {provider_id, referer, timestamp}.
    No DB write — the token is stored client-side and redeemed after login
    via /api/v1/attribution/claim/.

    The token is HMAC-signed with SECRET_KEY and has a 24-hour expiry.
    The 24-hour window is for the claim operation only (user must register
    and claim within 24h of visiting). The 60-day attribution window starts
    when the claim is processed.
    """
    permission_classes = [AllowAny]
    throttle_classes = [AnonymousAttributionThrottle]

    CLAIM_EXPIRY_SECONDS = 24 * 60 * 60  # 24 hours

    def post(self, request):
        from apps.care_provider.models import CareProvider

        provider_id = request.data.get('provider_id')
        referer = request.data.get('referer', '')

        if not provider_id:
            return Response({'error': 'provider_id required'}, status=400)

        # Validate provider exists (prevents signing tokens for nonexistent IDs)
        if not CareProvider.objects.filter(id=provider_id).exists():
            return Response({'error': 'provider not found'}, status=404)

        timestamp = int(time.time())
        payload = json.dumps({
            'provider_id': int(provider_id),
            'referer': referer[:2000],  # cap length
            'ts': timestamp,
        }, separators=(',', ':'), sort_keys=True)

        signature = hmac.new(
            settings.SECRET_KEY.encode('utf-8'),
            payload.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()

        return Response({
            'attribution_token': payload,
            'signature': signature,
            'expires_in': self.CLAIM_EXPIRY_SECONDS,
        }, status=200)
```

### 2b. New view: `ClaimAttributionView`

**Endpoint**: `POST /api/v1/attribution/claim/`
**Auth**: `IsAuthenticated` (user has now registered/logged in)

```python
class ClaimAttributionView(APIView):
    """
    POST /api/v1/attribution/claim/
    Body: {"attribution_token": <json_string>, "signature": <hex>}

    Validates the HMAC signature, checks the 24-hour claim window,
    then calls the existing record_attribution logic (same as
    TrackAttributionView but sourced from a pre-login visit).
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    CLAIM_EXPIRY_SECONDS = 24 * 60 * 60

    def post(self, request):
        from apps.care_provider.models import CareProvider

        token_payload = request.data.get('attribution_token', '')
        signature = request.data.get('signature', '')

        if not token_payload or not signature:
            return Response(
                {'error': 'attribution_token and signature required'},
                status=400,
            )

        # Verify HMAC signature
        expected_sig = hmac.new(
            settings.SECRET_KEY.encode('utf-8'),
            token_payload.encode('utf-8'),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected_sig, signature):
            fraud_logger.warning(
                "Attribution claim — invalid signature",
                extra={'user_id': request.user.id},
            )
            return Response({'error': 'invalid token'}, status=400)

        # Parse payload
        try:
            data = json.loads(token_payload)
            provider_id = data['provider_id']
            referer = data.get('referer', '')
            timestamp = data['ts']
        except (json.JSONDecodeError, KeyError):
            return Response({'error': 'malformed token'}, status=400)

        # Check 24-hour claim window
        elapsed = int(time.time()) - timestamp
        if elapsed > self.CLAIM_EXPIRY_SECONDS or elapsed < 0:
            return Response(
                {'error': 'token expired', 'expired': True},
                status=400,
            )

        # Resolve provider
        try:
            provider = CareProvider.objects.get(id=provider_id)
        except CareProvider.DoesNotExist:
            return Response({'error': 'provider not found'}, status=404)

        # Resolve client
        try:
            client = request.user.client
        except Exception:
            return Response({'error': 'client profile not found'}, status=400)

        # Delegate to the same guardrail + creation logic as TrackAttributionView
        # --- GUARDRAIL 1: Prior booking blocks attribution ---
        if has_prior_booking(provider, client):
            ProfileAttributionToken.objects.filter(
                provider=provider,
                client=client,
                status=AttributionStatus.PENDING,
            ).update(status=AttributionStatus.INELIGIBLE)

            fraud_logger.info(
                "Attribution claim blocked — existing relationship",
                extra={
                    "provider_id": provider.id,
                    "client_id": client.id,
                    "referer": referer,
                }
            )
            return Response(
                {'attributed': False, 'reason': 'existing_relationship'},
                status=200,
            )

        # --- GUARDRAIL 2: Confirmed attribution locked ---
        confirmed = ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
            status=AttributionStatus.CONFIRMED,
        ).first()
        if confirmed:
            return Response(
                {'attributed': True, 'already_confirmed': True},
                status=200,
            )

        # --- GUARDRAIL 3: INELIGIBLE locked ---
        ineligible = ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
            status=AttributionStatus.INELIGIBLE,
        ).first()
        if ineligible:
            fraud_logger.warning(
                "Attribution claim on INELIGIBLE token — ignoring",
                extra={"provider_id": provider.id, "client_id": client.id},
            )
            return Response(
                {'attributed': False, 'reason': 'ineligible'},
                status=200,
            )

        # Create or refresh window (same logic as TrackAttributionView)
        window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', 60)
        new_expires_at = timezone.now() + timedelta(days=window_days)

        existing = ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
        ).order_by('-created_at').first()

        if existing is None:
            token = ProfileAttributionToken.objects.create(
                provider=provider,
                client=client,
                source='profile',
                status=AttributionStatus.PENDING,
                expires_at=new_expires_at,
                referer=referer or '',
            )
        else:
            existing.expires_at = new_expires_at
            existing.status = AttributionStatus.PENDING
            if referer:
                existing.referer = referer
            existing.save(update_fields=[
                'expires_at', 'status', 'referer', 'modified_at',
            ])
            token = existing

        return Response({
            'attributed': True,
            'expires_at': token.expires_at.isoformat(),
        }, status=200)
```

### 2c. Refactoring note

The guardrail + token creation logic is now duplicated between `TrackAttributionView.post()` and `ClaimAttributionView.post()`. After both are working, extract the shared logic into a private function in `utils.py`:

```python
def record_attribution_visit(provider, client, referer=''):
    """
    Shared attribution recording logic. Returns Response-ready dict.
    Used by both TrackAttributionView (authenticated) and
    ClaimAttributionView (post-login claim of anonymous visit).
    """
    # ... guardrails 1-3 + create/refresh logic ...
```

Then both views simply call `record_attribution_visit()` and return the result. This is a follow-up cleanup, not a blocker.

### 2d. URL registration

**File**: `apps/attribution/urls.py`

Add to `urlpatterns`:

```python
path('track-anonymous/', views.TrackAnonymousAttributionView.as_view(), name='attribution-track-anonymous'),
path('claim/', views.ClaimAttributionView.as_view(), name='attribution-claim'),
```

### 2e. Imports needed in views.py

Add to the imports block at the top of `apps/attribution/views.py`:

```python
import hashlib
import hmac
import json
import time

from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
```

### 2f. Frontend contract (for RGDEV-206)

The frontend flow:

1. Anonymous user lands on provider profile page (e.g., `/provider/123?ref=external`)
2. Frontend POSTs to `/api/v1/attribution/track-anonymous/` with `{provider_id: 123, referer: document.referrer}`
3. Response: `{attribution_token: "...", signature: "...", expires_in: 86400}`
4. Frontend stores `attribution_token` + `signature` in `sessionStorage` (or `localStorage` for cross-tab)
5. After registration/login completes, frontend POSTs to `/api/v1/attribution/claim/` with `{attribution_token, signature}`
6. Frontend clears stored token on success
7. If user was already authenticated, frontend calls existing `/api/v1/attribution/track/` directly (no change)

---

## Fix 3: `has_prior_booking` inconsistency (HIGH)

**Audit finding**: 10b
**Root cause**: Two independent implementations with different semantics:
- `apps/attribution/utils.py:has_prior_booking()` — includes ALL appointment statuses (including CANCELLED)
- `apps/booking_link/views.py:_has_prior_booking()` — only includes `SCHEDULED` and `COMPLETED`

**Decision**: `attribution/utils.py` is canonical. A cancelled appointment still means the client and provider have a prior relationship. The booking_link version should align.

**File**: `apps/booking_link/views.py`

**Change**: Replace the local `_has_prior_booking` function with an import from the canonical source.

Before:
```python
def _has_prior_booking(client, care_provider):
    """
    C4: Fraud guardrail -- check if this client has booked with this provider before.
    If they have, they are not a 'new' booking-link referral and should not incur
    the booking-link platform fee.
    """
    from apps.calendar_functionality.models import Appointment
    if not client or not care_provider:
        return False
    return Appointment.objects.filter(
        client=client,
        care_provider=care_provider,
        is_status__in=["SCHEDULED", "COMPLETED"],
    ).exists()
```

After:
```python
def _has_prior_booking(client, care_provider):
    """
    C4: Fraud guardrail -- check if this client has booked with this provider before.
    Delegates to the canonical implementation in attribution.utils which includes
    ALL appointment statuses (including cancelled — cancelled means a prior relationship).

    Note: argument order differs from attribution.utils.has_prior_booking (provider, client)
    vs booking_link convention (client, care_provider). This wrapper preserves the
    local call-site argument order.
    """
    if not client or not care_provider:
        return False
    from apps.attribution.utils import has_prior_booking
    return has_prior_booking(provider=care_provider, client=client)
```

**Why a wrapper instead of direct import at call sites**: The `booking_link` code calls `_has_prior_booking(client, care_provider)` (client-first argument order), while the attribution version uses `has_prior_booking(provider, client)` (provider-first). Changing all call sites is riskier and unnecessary. The wrapper translates the argument order and adds the `None` guard.

**Test impact**: Any booking_link tests that rely on CANCELLED appointments NOT being treated as prior bookings will need updating. This is the correct behavior change.

---

## Fix 4: checkout-status never positive (CRITICAL)

**Audit finding**: Scenario 6 / finding 4
**Root cause**: Same as Fix 1. `AttributionCheckoutStatusView.get()` filters for `status=AttributionStatus.CONFIRMED`. Since no tokens ever reach CONFIRMED status, this always returns `is_first_attributed_session: False`.

**Resolution**: This is **entirely resolved by Fix 1**. Once `confirm_attribution_if_eligible()` is wired into the payment capture flow and transitions tokens to CONFIRMED, the checkout-status endpoint will return positive results.

**No code changes needed in the view itself.**

**Dependency chain**:
```
Fix 1 (confirm_attribution_if_eligible)
  └── creates ProviderClientFeeOverride (finding 1c resolved)
  └── transitions token to CONFIRMED (finding 1b resolved)
      └── checkout-status returns positive (finding 4 resolved)
          └── get_telehealth_fee returns 12% (fee tier resolved)
```

---

## Fix 5: Attribution URL registration (CHECK)

**Audit finding**: Scenario 1a (URL mechanism check)

**Status**: ALREADY REGISTERED. Confirmed at `lumy_global/urls.py` line 64:

```python
path("api/v1/attribution/", include("apps.attribution.urls")),
```

The existing `urls.py` in the attribution app registers:
- `track/` -> `TrackAttributionView`
- `checkout-status/` -> `AttributionCheckoutStatusView`

**Action needed**: Only the two NEW endpoints from Fix 2 need to be added to `apps/attribution/urls.py` (see Fix 2d above). No change to `lumy_global/urls.py`.

---

## Additional Fixes (from audit, lower priority)

### Fix 6: Admin deletion protection for ProfileAttributionToken (LOW)

**Audit finding**: 7c
**File**: `apps/attribution/admin.py`

Add to `ProfileAttributionTokenAdmin`:

```python
def has_delete_permission(self, request, obj=None):
    return False
```

This matches the existing protection on `ProviderClientFeeOverrideAdmin` (line 42-43) and prevents accidental audit trail loss.

---

## Implementation Order

| Step | Fix | Files | Blocked by |
|------|-----|-------|------------|
| 1 | Fix 1: `confirm_attribution_if_eligible` | `apps/attribution/utils.py`, `apps/stripe_integration/views.py` | Nothing |
| 2 | Fix 2: Anonymous attribution endpoints | `apps/attribution/views.py`, `apps/attribution/urls.py` | Nothing |
| 3 | Fix 3: `has_prior_booking` alignment | `apps/booking_link/views.py` | Nothing |
| 4 | Fix 6: Admin deletion protection | `apps/attribution/admin.py` | Nothing |
| 5 | Fix 4: (no-op) | Verified by Fix 1 | Fix 1 |

Steps 1-4 are independent and can be implemented in parallel. Fix 4 (checkout-status) requires no code change -- it is verified by testing after Fix 1 is deployed.

---

## Test Plan

| Fix | Test |
|-----|------|
| Fix 1 | Create PENDING token -> call `confirm_attribution_if_eligible` -> assert token status=CONFIRMED, `ProviderClientFeeOverride` exists, `get_telehealth_fee` returns 12%. Call again -> assert idempotent (no duplicate override). |
| Fix 2a | POST to `track-anonymous/` without auth -> 200 with signed token. POST with invalid `provider_id` -> 404. Rate limit triggers after 30 requests. |
| Fix 2b | POST to `claim/` with valid signed token -> attribution created. Invalid signature -> 400. Expired token (>24h) -> 400. Prior booking -> blocked. |
| Fix 3 | Create appointment with status=CANCELLED -> `_has_prior_booking` returns True (previously returned False). |
| Fix 4 | After Fix 1: create PENDING token, confirm it, call `checkout-status` -> `is_first_attributed_session: True`. |
| Fix 6 | Attempt to delete `ProfileAttributionToken` in admin -> denied. |

---

*Generated for RGDEV-183 -- 60-Day Attribution Window Fix Plan*
*Source audit: Audit_AttributionWindow_UXScenario_Results_2026-03-14.md*
*Scope: Backend only (RGDEV-206 covers frontend)*
*Date: 2026-03-14*
