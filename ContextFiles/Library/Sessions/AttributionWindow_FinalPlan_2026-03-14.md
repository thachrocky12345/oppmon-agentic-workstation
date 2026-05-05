# RGDEV-183 Attribution Window — Final Corrected Implementation Plan

**Date**: 2026-03-14
**Sources**:
- `FixPlan_AttributionWindow_DataModel_2026-03-14.md` (DataModel audit)
- `FixPlan_AttributionWindow_UXScenario_2026-03-14.md` (UXScenario audit)
- IMPLEMENTER commit `2c6bc8e` on branch `RGDEV-183/attribution-window`

---

## Summary of IMPLEMENTER's Work

The implementer built:
1. `apps/attribution/utils.py` — `get_telehealth_fee()`, `get_checkout_discount()`, `has_prior_booking()`, `record_attribution_visit()`, `confirm_attribution_if_eligible(appointment)`, `create_attribution_token()`
2. `apps/attribution/views.py` — `TrackAttributionView` (POST /track/)
3. `apps/attribution/urls.py` — single route: `track/`
4. `apps/attribution/models.py` — `ProfileAttributionToken`, `ProviderClientFeeOverride`, enums
5. `apps/attribution/admin.py` — admin registrations with readonly fields, delete protection on `ProviderClientFeeOverride`
6. `apps/attribution/tests/test_window.py` — 7 test cases covering confirm, visit, reset, locked states
7. `apps/attribution/management/commands/expire_attribution_tokens.py` — management command
8. `lumy_global/settings.py` — `CRONJOBS` entry for `expire_attribution_tokens`, `ATTRIBUTED_TELEHEALTH_FEE_PERCENT`, `ATTRIBUTION_WINDOW_DAYS`

---

## Fix Inventory

| # | Fix | Severity | Source | Status in IMPLEMENTER |
|---|-----|----------|--------|-----------------------|
| F1 | `confirm_attribution_if_eligible` — missing `select_for_update`/`atomic`, missing `ProviderClientFeeOverride` creation | CRITICAL | DataModel-1, UX-1 | PARTIAL — function exists but lacks atomicity + fee override |
| F2 | `TrackAttributionView.post()` race condition — not atomic | CRITICAL | DataModel-2 | MISSING — view delegates to `record_attribution_visit()` which also lacks atomicity |
| F3 | Expiry sweep targets CONFIRMED tokens | HIGH | DataModel-3 | PRESENT (BUG) — `status__in=[PENDING, CONFIRMED]` |
| F4 | Wire `expire_attribution_tokens` into CRONJOBS | HIGH | DataModel-4 | DONE — already in settings.py |
| F5 | `create_attribution_token()` — ignores EXPIRED tokens, no atomicity | MEDIUM | DataModel-5 | PRESENT (BUG) — filters only `PENDING, CONFIRMED` |
| F6 | Boundary tests with `timezone.now()` mocking | MEDIUM | DataModel-6 | PARTIAL — tests exist but don't mock `timezone.now()`, no sweep tests |
| F7 | Anonymous visitor attribution (track-anonymous + claim) | CRITICAL | UX-2 | MISSING |
| F8 | `has_prior_booking` inconsistency in booking_link | HIGH | UX-3 | NOT CHANGED |
| F9 | Admin deletion protection for `ProfileAttributionToken` | LOW | UX-6 | MISSING |
| F10 | `record_attribution_visit()` — not atomic, filters by source | MEDIUM | Merged from DataModel-2/5 | PRESENT (BUG) |
| F11 | `checkout-status` endpoint missing from urls.py | HIGH | UX-5 | MISSING — only `track/` registered |

---

## Detailed Fixes

### F1: Harden `confirm_attribution_if_eligible` + create `ProviderClientFeeOverride` (CRITICAL)

**File**: `apps/attribution/utils.py`
**Disposition**: REPLACE implementer's version

The implementer's version:
- Takes `appointment` object (not `provider, client`) — fine as a design choice, KEEP this signature
- Missing `select_for_update()` + `transaction.atomic()` — race condition
- Missing `ProviderClientFeeOverride` creation — the entire fee reduction never applies
- Not idempotent (no check for already-CONFIRMED)

**BEFORE** (implementer, lines ~160-180):
```python
def confirm_attribution_if_eligible(appointment):
    """
    Called after payment is captured. Confirms pending token if within window.
    Returns confirmed token or None.
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

    token.status = AttributionStatus.CONFIRMED
    token.first_booking_at = timezone.now()
    token.save(update_fields=['status', 'first_booking_at', 'modified_at'])
    return token
```

**AFTER**:
```python
def confirm_attribution_if_eligible(appointment):
    """
    Transition a PENDING attribution token to CONFIRMED on first booking.

    Called after successful payment capture (Stripe or PayPal).

    Returns the confirmed token, or None if:
    - No PENDING token exists for the pair
    - The token's window has expired (marks it EXPIRED and returns None)

    Side-effect: creates a ProviderClientFeeOverride so the reduced
    telehealth fee applies to all future sessions for this pair.

    Idempotent: if already CONFIRMED with fee override, returns token
    without modification.
    """
    provider = appointment.care_provider
    client = appointment.client

    with transaction.atomic():
        token = (
            ProfileAttributionToken.objects
            .select_for_update()
            .filter(
                provider=provider,
                client=client,
                status=AttributionStatus.PENDING,
            )
            .order_by('-created_at')
            .first()
        )

        if token is None:
            # Check for already-confirmed (idempotent)
            confirmed = ProfileAttributionToken.objects.filter(
                provider=provider,
                client=client,
                status=AttributionStatus.CONFIRMED,
            ).first()
            return confirmed  # None if no confirmed token either

        # Token exists but window has lapsed -- expire it
        if token.is_expired:
            token.status = AttributionStatus.EXPIRED
            token.save(update_fields=['status', 'modified_at'])
            return None

        # Within window -- confirm
        token.status = AttributionStatus.CONFIRMED
        token.first_booking_at = timezone.now()
        token.save(update_fields=['status', 'first_booking_at', 'modified_at'])

        # Create fee override so get_telehealth_fee() returns the reduced rate
        attributed_fee = Decimal(str(
            getattr(settings, 'ATTRIBUTED_TELEHEALTH_FEE_PERCENT', '0.12')
        ))
        ProviderClientFeeOverride.objects.get_or_create(
            provider=provider,
            client=client,
            defaults={
                'fee_percent': attributed_fee,
                'source': token.source,
                'original_fee_percent': STANDARD_FEE,
            },
        )

        logger.info(
            "Attribution confirmed: provider=%s client=%s source=%s",
            provider.id, client.id, token.source,
        )
        return token
```

**Required import change** at top of `utils.py` — add `IntegrityError`:
```python
from django.db import transaction, IntegrityError
```

---

### F2: Race condition in `record_attribution_visit()` (CRITICAL)

**File**: `apps/attribution/utils.py`
**Disposition**: REPLACE implementer's version

The implementer's `record_attribution_visit()` has two bugs:
1. No `transaction.atomic()` + `select_for_update()` — concurrent POSTs can create duplicates
2. Filters by `source=AttributionSource.PROFILE` — misses tokens created via other sources (booking_link). Should filter by `(provider, client)` only.

**BEFORE** (implementer):
```python
def record_attribution_visit(provider, client, referer=None):
    window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', DEFAULT_ATTRIBUTION_WINDOW_DAYS)
    new_expires_at = timezone.now() + timedelta(days=window_days)

    existing = ProfileAttributionToken.objects.filter(
        provider=provider,
        client=client,
        source=AttributionSource.PROFILE,
    ).order_by('-created_at').first()

    if existing is None:
        token = ProfileAttributionToken.objects.create(
            provider=provider,
            client=client,
            source=AttributionSource.PROFILE,
            status=AttributionStatus.PENDING,
            expires_at=new_expires_at,
            referer=referer or '',
        )
        return token
    elif existing.status in (AttributionStatus.CONFIRMED, AttributionStatus.INELIGIBLE):
        return existing  # locked
    else:
        existing.expires_at = new_expires_at
        existing.status = AttributionStatus.PENDING
        if referer:
            existing.referer = referer
        existing.save(update_fields=['expires_at', 'status', 'referer', 'modified_at'])
        return existing
```

**AFTER**:
```python
def record_attribution_visit(provider, client, source=None, referer=None):
    """
    Creates or refreshes the 60-day attribution window.

    Window reset logic (BRD edge case): if a PENDING or EXPIRED token exists,
    update expires_at to now + ATTRIBUTION_WINDOW_DAYS (re-start clock).
    If CONFIRMED or INELIGIBLE: do nothing (lock).
    If None: create new token.

    Wrapped in transaction.atomic() + select_for_update() to prevent race
    conditions from concurrent requests.
    """
    if source is None:
        source = AttributionSource.PROFILE

    window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', DEFAULT_ATTRIBUTION_WINDOW_DAYS)
    new_expires_at = timezone.now() + timedelta(days=window_days)

    try:
        with transaction.atomic():
            existing = (
                ProfileAttributionToken.objects
                .select_for_update()
                .filter(provider=provider, client=client)
                .order_by('-created_at')
                .first()
            )

            if existing is None:
                token = ProfileAttributionToken.objects.create(
                    provider=provider,
                    client=client,
                    source=source,
                    status=AttributionStatus.PENDING,
                    expires_at=new_expires_at,
                    referer=referer or '',
                )
                return token

            if existing.status in (AttributionStatus.CONFIRMED, AttributionStatus.INELIGIBLE):
                return existing  # locked

            # PENDING or EXPIRED — re-start clock
            existing.expires_at = new_expires_at
            existing.status = AttributionStatus.PENDING
            if referer:
                existing.referer = referer
            existing.save(update_fields=['expires_at', 'status', 'referer', 'modified_at'])
            return existing

    except IntegrityError:
        # Concurrent create hit the partial unique constraint
        token = ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
            status=AttributionStatus.PENDING,
        ).first()
        return token
```

---

### F3: Expiry sweep targeting CONFIRMED tokens (HIGH)

**File**: `apps/attribution/management/commands/expire_attribution_tokens.py`
**Disposition**: FIX implementer's code

**BEFORE** (implementer, line 29):
```python
        qs = ProfileAttributionToken.objects.filter(
            status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
            expires_at__lte=now,
        )
```

**AFTER**:
```python
        qs = ProfileAttributionToken.objects.filter(
            status=AttributionStatus.PENDING,
            expires_at__lte=now,
        )
```

Also fix the `update()` call to set `modified_at` (bulk update bypasses `auto_now`):

**BEFORE**:
```python
        updated = qs.update(status=AttributionStatus.EXPIRED)
```

**AFTER**:
```python
        updated = qs.update(
            status=AttributionStatus.EXPIRED,
            modified_at=now,
        )
```

---

### F4: CRONJOBS entry — ALREADY DONE

**File**: `lumy_global/settings.py`
**Disposition**: KEEP — implementer already added `('0 3 * * *', CALL_COMMAND_PATH, ['expire_attribution_tokens'])` to CRONJOBS.

---

### F5: `create_attribution_token()` — EXPIRED token handling + atomicity (MEDIUM)

**File**: `apps/attribution/utils.py`
**Disposition**: REPLACE implementer's version

The implementer's version:
- Filters only `status__in=[PENDING, CONFIRMED]` — EXPIRED tokens are invisible, causing orphan rows
- No `transaction.atomic()` + `select_for_update()`

**BEFORE** (implementer):
```python
def create_attribution_token(provider, client, source=None, referer=None):
    if source is None:
        source = AttributionSource.PROFILE

    window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', DEFAULT_ATTRIBUTION_WINDOW_DAYS)
    expires_at = timezone.now() + timedelta(days=window_days)

    existing = ProfileAttributionToken.objects.filter(
        provider=provider,
        client=client,
        status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
    ).first()

    if existing:
        if not existing.is_expired:
            existing.expires_at = expires_at
            existing.save(update_fields=['expires_at', 'modified_at'])
        return (existing, False)

    token = ProfileAttributionToken.objects.create(
        provider=provider,
        client=client,
        source=source,
        expires_at=expires_at,
        referer=referer or '',
    )
    return (token, True)
```

**AFTER**:
```python
def create_attribution_token(provider, client, source=None, referer=None):
    """
    Create or retrieve an active attribution token for a provider-client pair.

    Uses settings.ATTRIBUTION_WINDOW_DAYS to compute expires_at.
    Returns (token, created) tuple.

    If an active (pending/confirmed, non-expired) token already exists for the
    pair, its expiry window is extended and the existing token is returned.
    If an expired token exists, it is reset to PENDING with a new window.
    A new token is only created when no token exists at all.

    Note on source conflict resolution:
        Currently uses "first touch wins" -- if a client already has a PROFILE
        token and visits via booking link, the source is NOT overwritten.
        See RGDEV-205 for the product decision on conflict resolution.
    """
    if source is None:
        source = AttributionSource.PROFILE

    window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', DEFAULT_ATTRIBUTION_WINDOW_DAYS)
    expires_at = timezone.now() + timedelta(days=window_days)

    try:
        with transaction.atomic():
            existing = (
                ProfileAttributionToken.objects
                .select_for_update()
                .filter(provider=provider, client=client)
                .order_by('-created_at')
                .first()
            )

            if existing is None:
                token = ProfileAttributionToken.objects.create(
                    provider=provider,
                    client=client,
                    source=source,
                    expires_at=expires_at,
                    referer=referer or '',
                )
                return (token, True)

            # CONFIRMED -- do not modify, return as-is
            if existing.status == AttributionStatus.CONFIRMED:
                return (existing, False)

            # INELIGIBLE -- do not modify, return as-is
            if existing.status == AttributionStatus.INELIGIBLE:
                return (existing, False)

            # PENDING (active or expired) or EXPIRED -- reset to PENDING with new window
            existing.expires_at = expires_at
            existing.status = AttributionStatus.PENDING
            existing.save(update_fields=['expires_at', 'status', 'modified_at'])
            return (existing, False)

    except IntegrityError:
        # Concurrent create hit the partial unique constraint
        token = ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
            status=AttributionStatus.PENDING,
        ).first()
        return (token, False)
```

---

### F6: Boundary tests with `timezone.now()` mocking (MEDIUM)

**File**: `apps/attribution/tests/test_window.py`
**Disposition**: EXTEND — implementer's tests are good but need additions

The implementer's tests cover:
- confirm within window (KEEP)
- confirm past window (KEEP)
- window reset + confirm (KEEP)
- CONFIRMED locked (KEEP)
- INELIGIBLE locked (KEEP)
- new token creation (KEEP)

**ADD** the following test cases to the existing file:

```python
from unittest.mock import patch
from django.core.management import call_command

MOCK_NOW = 'django.utils.timezone.now'


class ExpirySweepTests(WindowTestMixin, TestCase):
    """Tests for the expire_attribution_tokens management command."""

    @patch(MOCK_NOW)
    def test_sweep_skips_confirmed_tokens(self, mock_now):
        """CONFIRMED token past expires_at must NOT be expired by sweep."""
        from datetime import datetime
        day_0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        mock_now.return_value = day_0

        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            source=AttributionSource.PROFILE,
            status=AttributionStatus.CONFIRMED,
            expires_at=day_0 + timedelta(days=60),
            first_booking_at=day_0 + timedelta(days=30),
        )

        # Run sweep at Day 90 (past expires_at)
        mock_now.return_value = day_0 + timedelta(days=90)
        call_command('expire_attribution_tokens')

        token.refresh_from_db()
        self.assertEqual(token.status, AttributionStatus.CONFIRMED)

    @patch(MOCK_NOW)
    def test_sweep_respects_reset_window(self, mock_now):
        """Day 0 create, Day 45 reset -> expires Day 105. Sweep at Day 62 must NOT expire."""
        from datetime import datetime
        day_0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        mock_now.return_value = day_0

        record_attribution_visit(self.provider, self.client_obj)

        # Day 45: reset extends to Day 105
        mock_now.return_value = day_0 + timedelta(days=45)
        record_attribution_visit(self.provider, self.client_obj)

        # Day 62: sweep runs -- token should NOT be expired
        mock_now.return_value = day_0 + timedelta(days=62)
        call_command('expire_attribution_tokens')

        token = ProfileAttributionToken.objects.get(
            provider=self.provider, client=self.client_obj,
        )
        self.assertEqual(token.status, AttributionStatus.PENDING)

    @patch(MOCK_NOW)
    def test_sweep_expires_pending_past_window(self, mock_now):
        """PENDING token past expires_at -> sweep marks EXPIRED."""
        from datetime import datetime
        day_0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        mock_now.return_value = day_0

        record_attribution_visit(self.provider, self.client_obj)

        # Day 61: sweep runs
        mock_now.return_value = day_0 + timedelta(days=61)
        call_command('expire_attribution_tokens')

        token = ProfileAttributionToken.objects.get(
            provider=self.provider, client=self.client_obj,
        )
        self.assertEqual(token.status, AttributionStatus.EXPIRED)


class ConfirmCreatesOverrideTests(WindowTestMixin, TestCase):
    """Tests that confirm_attribution_if_eligible creates ProviderClientFeeOverride."""

    @override_settings(ATTRIBUTION_WINDOW_DAYS=60, ATTRIBUTED_TELEHEALTH_FEE_PERCENT=Decimal('0.12'))
    def test_confirm_creates_fee_override(self):
        """Confirming a token creates a ProviderClientFeeOverride row."""
        from apps.attribution.models import ProviderClientFeeOverride

        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            source=AttributionSource.PROFILE,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() + timedelta(days=30),
        )

        appt = self._make_appointment_stub(self.provider, self.client_obj)
        result = confirm_attribution_if_eligible(appt)

        self.assertIsNotNone(result)
        override = ProviderClientFeeOverride.objects.filter(
            provider=self.provider, client=self.client_obj,
        ).first()
        self.assertIsNotNone(override)
        self.assertEqual(override.fee_percent, Decimal('0.12'))

    @override_settings(ATTRIBUTION_WINDOW_DAYS=60, ATTRIBUTED_TELEHEALTH_FEE_PERCENT=Decimal('0.12'))
    def test_confirm_idempotent(self):
        """Calling confirm twice does not create duplicate fee overrides."""
        from apps.attribution.models import ProviderClientFeeOverride

        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            source=AttributionSource.PROFILE,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() + timedelta(days=30),
        )

        appt = self._make_appointment_stub(self.provider, self.client_obj)
        confirm_attribution_if_eligible(appt)
        # Second call — token is now CONFIRMED, should return it without creating another override
        result2 = confirm_attribution_if_eligible(appt)

        self.assertIsNotNone(result2)
        self.assertEqual(
            ProviderClientFeeOverride.objects.filter(
                provider=self.provider, client=self.client_obj,
            ).count(),
            1,
        )
```

**Required imports at top** (add to existing imports):
```python
from decimal import Decimal
from unittest.mock import patch
from django.core.management import call_command
```

---

### F7: Anonymous visitor attribution — track-anonymous + claim (CRITICAL)

**File**: `apps/attribution/views.py`
**Disposition**: ADD new views

**File**: `apps/attribution/urls.py`
**Disposition**: ADD new routes

This is entirely new code. The implementer did not build anonymous attribution.

#### F7a: Add to `apps/attribution/views.py` — new imports and views

Add imports at top:
```python
import hashlib
import hmac
import json
import time

from django.db import transaction, IntegrityError
from rest_framework.permissions import AllowAny
```

Add two new view classes after `TrackAttributionView`:

```python
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

        if not CareProvider.objects.filter(id=provider_id).exists():
            return Response({'error': 'provider not found'}, status=404)

        timestamp = int(time.time())
        payload = json.dumps({
            'provider_id': int(provider_id),
            'referer': referer[:2000],
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


class ClaimAttributionView(APIView):
    """
    POST /api/v1/attribution/claim/
    Body: {"attribution_token": <json_string>, "signature": <hex>}

    Validates the HMAC signature, checks the 24-hour claim window,
    then creates/refreshes an attribution token (same as TrackAttributionView).
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

        try:
            data = json.loads(token_payload)
            provider_id = data['provider_id']
            referer = data.get('referer', '')
            timestamp = data['ts']
        except (json.JSONDecodeError, KeyError):
            return Response({'error': 'malformed token'}, status=400)

        elapsed = int(time.time()) - timestamp
        if elapsed > self.CLAIM_EXPIRY_SECONDS or elapsed < 0:
            return Response(
                {'error': 'token expired', 'expired': True},
                status=400,
            )

        try:
            provider = CareProvider.objects.get(id=provider_id)
        except CareProvider.DoesNotExist:
            return Response({'error': 'provider not found'}, status=404)

        try:
            client = request.user.client
        except Exception:
            return Response({'error': 'client profile not found'}, status=400)

        # Same guardrail logic as TrackAttributionView
        if has_prior_booking(provider, client):
            ProfileAttributionToken.objects.filter(
                provider=provider,
                client=client,
                status=AttributionStatus.PENDING,
            ).update(status=AttributionStatus.INELIGIBLE)

            fraud_logger.info(
                "Attribution claim blocked — existing relationship",
                extra={"provider_id": provider.id, "client_id": client.id},
            )
            return Response(
                {'attributed': False, 'reason': 'existing_relationship'},
                status=200,
            )

        token = record_attribution_visit(provider, client, referer=referer)

        if token.status == AttributionStatus.CONFIRMED:
            return Response(
                {'attributed': True, 'already_confirmed': True},
                status=200,
            )

        if token.status == AttributionStatus.INELIGIBLE:
            return Response(
                {'attributed': False, 'reason': 'ineligible'},
                status=200,
            )

        return Response({
            'attributed': True,
            'expires_at': token.expires_at.isoformat(),
        }, status=200)
```

Also add `settings` import near top of views.py:
```python
from django.conf import settings
```

#### F7b: Update `apps/attribution/urls.py`

**BEFORE** (implementer):
```python
from django.urls import path
from . import views

urlpatterns = [
    path('track/', views.TrackAttributionView.as_view(), name='attribution-track'),
]
```

**AFTER**:
```python
from django.urls import path
from . import views

urlpatterns = [
    path('track/', views.TrackAttributionView.as_view(), name='attribution-track'),
    path('track-anonymous/', views.TrackAnonymousAttributionView.as_view(), name='attribution-track-anonymous'),
    path('claim/', views.ClaimAttributionView.as_view(), name='attribution-claim'),
]
```

---

### F8: `has_prior_booking` inconsistency in booking_link (HIGH)

**File**: `apps/booking_link/views.py`
**Disposition**: REPLACE local function with delegation to canonical version

**BEFORE** (implementer, lines 117-130):
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

**AFTER**:
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

---

### F9: Admin deletion protection for `ProfileAttributionToken` (LOW)

**File**: `apps/attribution/admin.py`
**Disposition**: ADD method to existing admin class

**BEFORE** (implementer's `ProfileAttributionTokenAdmin`): No `has_delete_permission` override.

**ADD** to `ProfileAttributionTokenAdmin`:
```python
    def has_delete_permission(self, request, obj=None):
        return False
```

---

### F10: `TrackAttributionView` missing `checkout-status` route (HIGH)

**File**: `apps/attribution/urls.py` (also addressed in F7b)
**Disposition**: ADD — the implementer's views.py has no `AttributionCheckoutStatusView`

Looking back at the commit history, `AttributionCheckoutStatusView` was created in RGDEV-205 (`3a306f2`). It should be wired into the attribution URL conf.

**Check**: Does `AttributionCheckoutStatusView` exist on RGDEV-183 branch?

This needs to be checked at implementation time. If the class exists in `views.py`, add:
```python
path('checkout-status/', views.AttributionCheckoutStatusView.as_view(), name='attribution-checkout-status'),
```

If it does NOT exist on RGDEV-183 (it was added in RGDEV-205), then this is a **cross-ticket dependency**: RGDEV-205 must merge first or the route is added after RGDEV-205 merges.

**CROSS-TICKET**: RGDEV-205 owns `AttributionCheckoutStatusView`. Defer URL registration to that branch.

---

## Implementation Sequence

| Step | Fix | Files Modified | Depends On |
|------|-----|---------------|------------|
| 1 | F3: Expiry sweep CONFIRMED bug | `management/commands/expire_attribution_tokens.py` | None |
| 2 | F2: `record_attribution_visit()` atomicity + source filter | `utils.py` | None |
| 3 | F5: `create_attribution_token()` EXPIRED handling + atomicity | `utils.py` | F2 (same file) |
| 4 | F1: `confirm_attribution_if_eligible` hardening + fee override | `utils.py` | F3 (same file, clean base) |
| 5 | F7: Anonymous attribution views + URL routes | `views.py`, `urls.py` | None |
| 6 | F8: `has_prior_booking` alignment | `booking_link/views.py` | None |
| 7 | F9: Admin delete protection | `admin.py` | None |
| 8 | F6: Additional boundary tests | `tests/test_window.py` | F1, F3 |

Steps 1, 5, 6, 7 are independent. Steps 2-4 are sequential (same file). Step 8 depends on F1 and F3.

---

## Cross-Ticket Dependencies

| Item | Affects | Notes |
|------|---------|-------|
| `confirm_attribution_if_eligible` call site in payment capture | **RGDEV-184** (Dynamic Fee), **RGDEV-205** (Checkout) | Must be imported and called from `apps/stripe_integration/views.py` after payment capture. Currently NOT wired (implementer did not touch stripe views for attribution confirmation). |
| `AttributionCheckoutStatusView` URL registration | **RGDEV-205** | View exists in RGDEV-205 branch, not in RGDEV-183. URL route deferred to RGDEV-205. |
| `_has_prior_booking` alignment (F8) | **RGDEV-185** (Fraud Guardrails) | Booking_link guardrail change affects fraud detection scope. |
| `ProviderClientFeeOverride` usage in fee calculation | **RGDEV-184** (Dynamic Fee) | `get_telehealth_fee()` reads from `ProviderClientFeeOverride`. Fee calculation correctness depends on F1 creating override records. |

---

## Files Changed Summary

| File | Action |
|------|--------|
| `apps/attribution/utils.py` | REPLACE 3 functions (F1, F2, F5); add `IntegrityError` import |
| `apps/attribution/views.py` | ADD 3 new views + imports (F7) |
| `apps/attribution/urls.py` | ADD 2 new routes (F7b) |
| `apps/attribution/admin.py` | ADD `has_delete_permission` to `ProfileAttributionTokenAdmin` (F9) |
| `apps/attribution/management/commands/expire_attribution_tokens.py` | FIX queryset filter + update call (F3) |
| `apps/attribution/tests/test_window.py` | ADD 5 new test cases (F6) |
| `apps/booking_link/views.py` | REPLACE `_has_prior_booking` function (F8) |

**Not modified** (KEPT as-is from implementer):
- `apps/attribution/models.py` — correct
- `lumy_global/settings.py` — CRONJOBS entry correct, settings correct

---

## Verification Checklist

- [ ] `python manage.py test apps.attribution` — all tests pass
- [ ] `python manage.py expire_attribution_tokens --dry-run` — reports only PENDING tokens
- [ ] CONFIRMED token past `expires_at` + run sweep — token remains CONFIRMED
- [ ] Create token, call `confirm_attribution_if_eligible(appt)` within window — token CONFIRMED, `ProviderClientFeeOverride` row created
- [ ] Call `confirm_attribution_if_eligible(appt)` twice — idempotent, single override row
- [ ] Two rapid POST /track/ for same pair — both return 200 (no 500)
- [ ] POST /track-anonymous/ without auth — 200 with signed token
- [ ] POST /claim/ with valid signed token after login — attribution created
- [ ] POST /claim/ with expired token (>24h) — 400
- [ ] `python manage.py crontab show` — `expire_attribution_tokens` appears
- [ ] Admin: cannot delete `ProfileAttributionToken` records

---

*Generated by PRINCIPAL MERGE agent for RGDEV-183*
*Date: 2026-03-14*
