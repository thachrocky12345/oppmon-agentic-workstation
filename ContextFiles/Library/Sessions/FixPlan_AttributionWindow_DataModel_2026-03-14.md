# Fix Plan: RGDEV-183 Attribution Window Data Model

**Date**: 2026-03-14
**Source**: `Audit_AttributionWindow_DataModel_Results_2026-03-14.md`
**Scope**: `apps/attribution/` in `Lumy-Backend` (main working tree)

---

## Fix 1: Add `confirm_attribution_if_eligible()` to main tree (CRITICAL / P0)

**File**: `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\utils.py`

**Location**: Append after `create_attribution_token()` (after line 179).

**Implementation**:

```python
def confirm_attribution_if_eligible(provider, client):
    """
    Transition a PENDING attribution token to CONFIRMED on first booking.

    Called after successful payment capture (Stripe or PayPal).

    Returns the confirmed token, or None if:
    - No PENDING token exists for the pair
    - The token's window has expired (marks it EXPIRED and returns None)

    Side-effect: creates a ProviderClientFeeOverride so the reduced
    telehealth fee applies to all future sessions for this pair.
    """
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
            return None

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
        ProviderClientFeeOverride.objects.get_or_create(
            provider=provider,
            client=client,
            defaults={
                'fee_percent': settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT,
                'source': token.source,
            },
        )

        logger.info(
            "Attribution confirmed: provider=%s client=%s source=%s",
            provider.id, client.id, token.source,
        )
        return token
```

**Why `select_for_update()` + `transaction.atomic()`**: Two concurrent payment confirmations (e.g., Stripe webhook retry + PayPal IPN) for the same (provider, client) could both read the same PENDING token. The lock serializes them so only the first caller transitions to CONFIRMED; the second sees CONFIRMED and the `status=PENDING` filter returns None.

**Wiring into payment flows** (separate task, noted here for completeness):
- `lumy_global/cron.py` `capture_authorized_payments_job()`: call after successful capture
- `apps/stripe_integration/views.py` Stripe/PayPal capture endpoints: call after payment confirmed

---

## Fix 2: Race condition in `TrackAttributionView.post()` (CRITICAL / P0)

**File**: `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\views.py`

**Current code (lines 102-127)**: The read-then-write block is not atomic. Two concurrent POSTs for the same (provider, client) can both read `existing = None` and both call `create()`. The partial unique constraint raises an unhandled `IntegrityError` resulting in a 500.

**Fix**: Wrap lines 102-127 in `transaction.atomic()` + `select_for_update()`, and catch `IntegrityError`.

Replace the block starting at line 102 (`# Create or refresh window`) through line 127 (`token = existing`) with:

```python
        # Create or refresh window
        window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', 60)
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
                        source='profile',
                        status=AttributionStatus.PENDING,
                        expires_at=new_expires_at,
                        referer=referer or '',
                    )
                else:
                    # PENDING or EXPIRED -- re-start clock
                    existing.expires_at = new_expires_at
                    existing.status = AttributionStatus.PENDING
                    if referer:
                        existing.referer = referer
                    existing.save(update_fields=['expires_at', 'status', 'referer', 'modified_at'])
                    token = existing
        except IntegrityError:
            # Concurrent create hit the partial unique constraint.
            # The other request won -- return the token it created.
            token = ProfileAttributionToken.objects.filter(
                provider=provider,
                client=client,
                status=AttributionStatus.PENDING,
            ).first()
            if token is None:
                return Response({'error': 'attribution conflict, please retry'}, status=409)
```

**Required import** (add to top of views.py):

```python
from django.db import transaction, IntegrityError
```

---

## Fix 3: Expiry sweep targeting CONFIRMED tokens (HIGH / P1)

**File**: `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\management\commands\expire_attribution_tokens.py`

**Current code (line 29-31)**:

```python
qs = ProfileAttributionToken.objects.filter(
    status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
    expires_at__lte=now,
)
```

**Fix**: Change to target only PENDING tokens. CONFIRMED is a terminal state per BRD.

```python
qs = ProfileAttributionToken.objects.filter(
    status=AttributionStatus.PENDING,
    expires_at__lte=now,
)
```

**Also fix line 39** to update `modified_at` (bulk `.update()` bypasses `auto_now`):

```python
updated = qs.update(
    status=AttributionStatus.EXPIRED,
    modified_at=timezone.now(),
)
```

---

## Fix 4: Wire `expire_attribution_tokens` into CRONJOBS (HIGH / P1)

**File**: `C:\Projects\ReallyGlobal\Lumy-Backend\lumy_global\settings.py`

**Location**: Inside the `CRONJOBS` list (lines 499-517), add a new entry before the closing `]`.

**Add**:

```python
    ('0 3 * * *', CALL_COMMAND_PATH, ['expire_attribution_tokens']),
```

This runs the management command daily at 03:00 server time. The existing `CALL_COMMAND_PATH` variable (line 497, value `'django.core.management.call_command'`) is already defined and used by other entries (`fetch_certn_orders`, `refresh_talk_now_ids`, `generate_sitemap`).

**Full entry in context** (insert after the `generate_sitemap` entry, before line 517's `]`):

```python
CRONJOBS = [
    # ... existing 11 entries ...
    ('0 0 * * *',
     CALL_COMMAND_PATH,
     ['generate_sitemap'],
     {'dest': '/var/www/html/Lumy-Frontend/src/pages'}
    ),
    ('0 3 * * *', CALL_COMMAND_PATH, ['expire_attribution_tokens']),  # <-- NEW
]
```

---

## Fix 5: Align `create_attribution_token()` with view behavior (MEDIUM / P2)

**File**: `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\utils.py`

**Problem**: `create_attribution_token()` (lines 135-179) filters only `status__in=[PENDING, CONFIRMED]`, so an EXPIRED token is invisible to it. If the only token for a pair is EXPIRED, the function creates a new row instead of resetting the existing one. This causes orphan EXPIRED rows and diverges from the view's behavior (which resets EXPIRED->PENDING on the same row).

**Fix**: Query without status filter (matching the view), handle EXPIRED tokens by resetting them. Also wrap in `transaction.atomic()` + `select_for_update()` to fix the same race condition as Fix 2.

Replace lines 135-179 with:

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
        token and visits via booking link, the source is NOT overwritten. This
        preserves the original attribution source. See RGDEV-205 for the
        product decision on conflict resolution (lowest-fee-wins vs
        last-touch-wins vs explicit priority).
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

            # PENDING (active) -- extend window
            # PENDING (expired) or EXPIRED -- reset to PENDING with new window
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

**Required import** (add `IntegrityError` to the existing `from django.db import transaction` line):

```python
from django.db import transaction, IntegrityError
```

---

## Fix 6: Boundary tests with `timezone.now()` mocking (MEDIUM / P2)

**File**: Create `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\tests\test_window.py`

**6 test cases needed**, all using `@patch('django.utils.timezone.now')`:

### Mock pattern

```python
from unittest.mock import patch
from datetime import datetime, timedelta
from django.utils import timezone
from django.test import TestCase

MOCK_NOW = 'django.utils.timezone.now'

class AttributionWindowBoundaryTests(TestCase):
    """Tests that mock timezone.now() to verify exact boundary behavior."""

    def _set_now(self, mock_now, dt):
        mock_now.return_value = dt
```

### Test 1: Confirm at Day 59 (within window) -- should succeed

```python
    @patch(MOCK_NOW)
    def test_confirm_day_59_within_window(self, mock_now):
        """Token created Day 0, confirmation at Day 59 -> CONFIRMED."""
        day_0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self._set_now(mock_now, day_0)
        # Create token (expires Day 60)
        token, _ = create_attribution_token(self.provider, self.client)

        # Advance to Day 59
        self._set_now(mock_now, day_0 + timedelta(days=59))
        result = confirm_attribution_if_eligible(self.provider, self.client)
        self.assertIsNotNone(result)
        self.assertEqual(result.status, AttributionStatus.CONFIRMED)
```

### Test 2: Confirm at Day 61 (past window) -- should return None and mark EXPIRED

```python
    @patch(MOCK_NOW)
    def test_confirm_day_61_past_window(self, mock_now):
        """Token created Day 0, confirmation at Day 61 -> EXPIRED, returns None."""
        day_0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self._set_now(mock_now, day_0)
        token, _ = create_attribution_token(self.provider, self.client)

        self._set_now(mock_now, day_0 + timedelta(days=61))
        result = confirm_attribution_if_eligible(self.provider, self.client)
        self.assertIsNone(result)
        token.refresh_from_db()
        self.assertEqual(token.status, AttributionStatus.EXPIRED)
```

### Test 3: Window reset Day 45, confirm at Day 70 (within reset window) -- should succeed

```python
    @patch(MOCK_NOW)
    def test_window_reset_day45_confirm_day70(self, mock_now):
        """Day 0 create, Day 45 re-visit (reset to Day 105), Day 70 confirm -> CONFIRMED."""
        day_0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self._set_now(mock_now, day_0)
        token, _ = create_attribution_token(self.provider, self.client)

        # Day 45: re-visit resets window to Day 105
        self._set_now(mock_now, day_0 + timedelta(days=45))
        token, _ = create_attribution_token(self.provider, self.client)

        # Day 70: within reset window (expires Day 105)
        self._set_now(mock_now, day_0 + timedelta(days=70))
        result = confirm_attribution_if_eligible(self.provider, self.client)
        self.assertIsNotNone(result)
        self.assertEqual(result.status, AttributionStatus.CONFIRMED)
```

### Test 4: Expiry sweep skips CONFIRMED tokens

```python
    @patch(MOCK_NOW)
    def test_expiry_sweep_skips_confirmed(self, mock_now):
        """CONFIRMED token past expires_at must NOT be expired by sweep."""
        day_0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self._set_now(mock_now, day_0)
        token, _ = create_attribution_token(self.provider, self.client)

        # Confirm at Day 30
        self._set_now(mock_now, day_0 + timedelta(days=30))
        confirm_attribution_if_eligible(self.provider, self.client)

        # Run sweep at Day 90 (past expires_at)
        self._set_now(mock_now, day_0 + timedelta(days=90))
        call_command('expire_attribution_tokens')

        token.refresh_from_db()
        self.assertEqual(token.status, AttributionStatus.CONFIRMED)  # NOT expired
```

### Test 5: Window reset then expiry sweep ordering (Day 62 after Day 45 reset)

```python
    @patch(MOCK_NOW)
    def test_sweep_respects_reset_window(self, mock_now):
        """Day 0 create, Day 45 reset -> expires Day 105. Sweep at Day 62 must NOT expire."""
        day_0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self._set_now(mock_now, day_0)
        create_attribution_token(self.provider, self.client)

        # Day 45: reset extends to Day 105
        self._set_now(mock_now, day_0 + timedelta(days=45))
        create_attribution_token(self.provider, self.client)

        # Day 62: sweep runs -- token should NOT be expired (expires Day 105)
        self._set_now(mock_now, day_0 + timedelta(days=62))
        call_command('expire_attribution_tokens')

        token = ProfileAttributionToken.objects.get(
            provider=self.provider, client=self.client, status=AttributionStatus.PENDING
        )
        self.assertEqual(token.status, AttributionStatus.PENDING)
```

### Test 6: Concurrent POST /track/ produces 200 (not 500)

```python
    def test_concurrent_track_no_500(self):
        """Two simultaneous POST /track/ for same pair must not raise 500."""
        from django.test import RequestFactory
        from unittest.mock import patch as mock_patch

        # Force the race: first request reads None, second request also reads None,
        # first creates, second hits IntegrityError
        original_filter = ProfileAttributionToken.objects.filter

        call_count = {'n': 0}
        def delayed_filter(*args, **kwargs):
            qs = original_filter(*args, **kwargs)
            call_count['n'] += 1
            return qs

        # Use APIClient for both requests; the IntegrityError path should return 200 or 409
        self.client_http.force_authenticate(user=self.user)
        response = self.client_http.post(
            '/api/v1/attribution/track/',
            {'provider_id': self.provider.id},
            format='json',
        )
        self.assertIn(response.status_code, [200])

        # Second call for same pair should also succeed (returns existing)
        response2 = self.client_http.post(
            '/api/v1/attribution/track/',
            {'provider_id': self.provider.id},
            format='json',
        )
        self.assertIn(response2.status_code, [200])
```

---

## Execution Order

| Step | Fix | Files Modified | Depends On |
|---|---|---|---|
| 1 | Fix 3: Expiry sweep CONFIRMED bug | `expire_attribution_tokens.py` | None |
| 2 | Fix 4: Wire CRONJOBS | `settings.py` | None |
| 3 | Fix 2: Race condition in view | `views.py` | None |
| 4 | Fix 5: Align `create_attribution_token()` | `utils.py` | None |
| 5 | Fix 1: Add `confirm_attribution_if_eligible()` | `utils.py` | Fix 4 (same file, clean base) |
| 6 | Fix 6: Boundary tests | `tests/test_window.py` (new) | Fixes 1, 3, 5 |

Steps 1-4 are independent and can be done in any order. Fix 5 and Fix 1 both modify `utils.py` so do them sequentially. Fix 6 depends on the functions existing.

---

## Verification Checklist

After all fixes are applied:

- [ ] `python manage.py test apps.attribution` -- all tests pass
- [ ] `python manage.py expire_attribution_tokens --dry-run` -- reports only PENDING tokens
- [ ] Manual: create token, advance clock past 60 days, run sweep -- token is EXPIRED
- [ ] Manual: create token, call `confirm_attribution_if_eligible()` within window -- token is CONFIRMED, `ProviderClientFeeOverride` row created
- [ ] Manual: CONFIRMED token past `expires_at`, run sweep -- token remains CONFIRMED
- [ ] Manual: two rapid POST /track/ calls for same pair -- both return 200
- [ ] `python manage.py crontab show` -- `expire_attribution_tokens` appears in schedule
