# Fix Implementation Plan -- RGDEV-185 Fraud Guardrails Data Model Audit

**Date**: 2026-03-14
**Source audit**: `Audit_FraudGuardrails_DataModel_Results_2026-03-14.md`
**Branch**: `f748096` (feat/attribution fraud guardrails)
**Status**: Ready for implementation

---

## Fix 1 -- TalkNow Blind Spot (CRITICAL)

**Audit finding**: #1 -- `has_prior_booking()` only queries `Appointment`, missing `TalkNow` (and legacy `Session`).

**FK mismatch**: `TalkNow.client` is FK to `settings.AUTH_USER_MODEL` (User), NOT `Client`. The join must go through `client.user`.

**File**: `apps/attribution/utils.py`

**Current code** (lines 123-132):
```python
def has_prior_booking(provider, client):
    """
    Returns True if client has any appointment with this provider (any status,
    including cancelled -- cancelled means they already had a relationship).
    """
    from apps.calendar_functionality.models import Appointment
    return Appointment.objects.filter(
        care_provider=provider,
        client=client,
    ).exists()
```

**Fixed code**:
```python
def has_prior_booking(provider, client):
    """
    Returns True if client has any prior relationship with this provider:
    - Any Appointment (any status, including cancelled)
    - Any completed TalkNow call (ACCEPTED or LEAVE status)
    - Any legacy Session record

    Note: TalkNow.client is FK to User (not Client), so we join via client.user.
    """
    from apps.calendar_functionality.models import Appointment, Session
    from apps.talk_now.models import TalkNow

    if Appointment.objects.filter(
        care_provider=provider,
        client=client,
    ).exists():
        return True

    # TalkNow.client -> User (not Client), so use client.user for the join.
    # Only ACCEPTED and LEAVE represent completed calls; INCOMING/REJECTED/MISSED
    # are attempts that never connected -- no real relationship established.
    if TalkNow.objects.filter(
        care_provider=provider,
        client=client.user,
        current_status__in=['ACCEPTED', 'LEAVE'],
    ).exists():
        return True

    # Legacy Session model -- may have historical data even though no new rows
    # are created (Session.objects.create has zero call sites as of this audit).
    if Session.objects.filter(
        care_provider=provider,
        client=client,
    ).exists():
        return True

    return False
```

**Required tests** (add to `apps/attribution/tests/test_fraud_guardrails.py`):

```python
def test_talknow_accepted_blocks_attribution(self):
    """A completed TalkNow call (ACCEPTED) counts as a prior relationship."""
    from apps.talk_now.models import TalkNow
    TalkNow.objects.create(
        care_provider=self.provider,
        client=self.client.user,       # FK to User, not Client
        initiated_by=self.client.user,
        room_name='test-room-accepted',
        current_status='ACCEPTED',
    )
    self.assertTrue(has_prior_booking(self.provider, self.client))

def test_talknow_leave_blocks_attribution(self):
    """A completed TalkNow call (LEAVE) counts as a prior relationship."""
    from apps.talk_now.models import TalkNow
    TalkNow.objects.create(
        care_provider=self.provider,
        client=self.client.user,
        initiated_by=self.client.user,
        room_name='test-room-leave',
        current_status='LEAVE',
    )
    self.assertTrue(has_prior_booking(self.provider, self.client))

def test_talknow_incoming_does_not_block(self):
    """An unanswered TalkNow call (INCOMING) is not a real relationship."""
    from apps.talk_now.models import TalkNow
    TalkNow.objects.create(
        care_provider=self.provider,
        client=self.client.user,
        initiated_by=self.client.user,
        room_name='test-room-incoming',
        current_status='INCOMING',
    )
    self.assertFalse(has_prior_booking(self.provider, self.client))

def test_talknow_rejected_does_not_block(self):
    """A rejected TalkNow call is not a prior relationship."""
    from apps.talk_now.models import TalkNow
    TalkNow.objects.create(
        care_provider=self.provider,
        client=self.client.user,
        initiated_by=self.client.user,
        room_name='test-room-rejected',
        current_status='REJECTED',
    )
    self.assertFalse(has_prior_booking(self.provider, self.client))
```

---

## Fix 2 -- Race Condition in TrackAttributionView.post() (HIGH)

**Audit finding**: #3 -- No `transaction.atomic()` or `select_for_update()` around the guardrail check + token creation/update. Contrast with `get_checkout_discount()` in the same file which correctly uses both.

**File**: `apps/attribution/views.py`

**Current code** (lines 32-132, simplified structure):
```python
def post(self, request):
    # ... provider/client extraction (lines 32-50) ...

    # GUARDRAIL 1: Prior booking check
    if has_prior_booking(provider, client):          # line 53 -- NOT inside transaction
        ProfileAttributionToken.objects.filter(
            ...
        ).update(status=AttributionStatus.INELIGIBLE)   # line 55-59
        return Response(...)

    # GUARDRAIL 2: Confirmed check                   # line 75 -- NOT inside transaction
    # GUARDRAIL 3: Ineligible check                  # line 87 -- NOT inside transaction

    # Create or refresh                              # line 106 -- NOT inside transaction
    existing = ProfileAttributionToken.objects.filter(
        provider=provider, client=client,
    ).order_by('-created_at').first()
    # ... create or update ...
```

**Fixed code** -- wrap from line 52 onward in `transaction.atomic()` and use `select_for_update()` on the token query:
```python
def post(self, request):
    from apps.care_provider.models import CareProvider

    provider_id = request.data.get('provider_id')
    referer = request.data.get('referer', '')

    if not provider_id:
        return Response({'error': 'provider_id required'}, status=400)

    try:
        provider = CareProvider.objects.get(id=provider_id)
    except CareProvider.DoesNotExist:
        return Response({'error': 'provider not found'}, status=404)

    try:
        client = request.user.client
    except Exception:
        return Response({'error': 'client profile not found'}, status=400)

    with transaction.atomic():
        # GUARDRAIL 1: Prior booking history blocks attribution
        if has_prior_booking(provider, client):
            ProfileAttributionToken.objects.select_for_update().filter(
                provider=provider,
                client=client,
                status=AttributionStatus.PENDING,
            ).update(status=AttributionStatus.INELIGIBLE)

            fraud_logger.info(
                "Attribution blocked -- existing relationship",
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

        # GUARDRAIL 2: Confirmed attribution cannot be re-attributed
        confirmed = ProfileAttributionToken.objects.select_for_update().filter(
            provider=provider,
            client=client,
            status=AttributionStatus.CONFIRMED,
        ).first()
        if confirmed:
            return Response(
                {'attributed': True, 'already_confirmed': True},
                status=200,
            )

        # GUARDRAIL 3: INELIGIBLE cannot be cleared
        ineligible = ProfileAttributionToken.objects.select_for_update().filter(
            provider=provider,
            client=client,
            status=AttributionStatus.INELIGIBLE,
        ).first()
        if ineligible:
            fraud_logger.warning(
                "Attribution visit on INELIGIBLE token -- ignoring",
                extra={"provider_id": provider.id, "client_id": client.id},
            )
            return Response(
                {'attributed': False, 'reason': 'ineligible'},
                status=200,
            )

        # Create or refresh window
        window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', 60)
        new_expires_at = timezone.now() + timedelta(days=window_days)

        existing = ProfileAttributionToken.objects.select_for_update().filter(
            provider=provider,
            client=client,
            status__in=[AttributionStatus.PENDING, AttributionStatus.EXPIRED],
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
            existing.save(update_fields=['expires_at', 'status', 'referer', 'modified_at'])
            token = existing

    return Response({
        'attributed': True,
        'expires_at': token.expires_at.isoformat(),
    }, status=200)
```

**Required import** -- add at top of `views.py`:
```python
from django.db import transaction
```

**Note**: `transaction` is already imported in `utils.py` but not in `views.py`. Must be added.

---

## Fix 3 -- CONFIRMED Expiry Filter (HIGH)

**Audit finding**: #8 -- The CONFIRMED guardrail check has no `expires_at__gt=timezone.now()` filter. Expired CONFIRMED tokens permanently block re-attribution.

**Product decision**: CONFIRMED attributions should lock forever. Once a client-provider relationship is confirmed via a completed booking, that attribution is permanent. The fee override (`ProviderClientFeeOverride`) has its own `is_active` flag for deactivation. Re-attributing a confirmed pair would create conflicting fee records.

**Action**: No code change. Add a documenting comment to make the intent explicit.

**File**: `apps/attribution/views.py`, Guardrail 2 block

**Current code** (lines 74-84):
```python
        # GUARDRAIL 2: Confirmed attribution cannot be re-attributed
        confirmed = ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
            status=AttributionStatus.CONFIRMED,
        ).first()
```

**Fixed code** (documentation-only change, already incorporated in Fix 2 above):
```python
        # GUARDRAIL 2: Confirmed attribution cannot be re-attributed.
        # No expires_at filter intentionally: once confirmed, the attribution is
        # permanent. The fee override (ProviderClientFeeOverride) has is_active
        # for deactivation. Expired CONFIRMED tokens still block re-attribution
        # to prevent duplicate fee overrides for the same provider-client pair.
        confirmed = ProfileAttributionToken.objects.select_for_update().filter(
            provider=provider,
            client=client,
            status=AttributionStatus.CONFIRMED,
        ).first()
```

**Required test**:
```python
def test_expired_confirmed_token_still_blocks(self):
    """CONFIRMED tokens block re-attribution permanently, even past expires_at."""
    ProfileAttributionToken.objects.create(
        provider=self.provider,
        client=self.client,
        source='profile',
        status=AttributionStatus.CONFIRMED,
        expires_at=timezone.now() - timedelta(days=30),  # expired
    )
    response = self.client_http.post(
        '/api/v1/attribution/track/',
        {'provider_id': self.provider.id},
        format='json',
    )
    self.assertEqual(response.status_code, 200)
    self.assertTrue(response.data['already_confirmed'])
```

---

## Fix 4 -- Fragile Else Branch (HIGH)

**Audit finding**: #7 -- The token refresh query at views.py line 106-109 uses `filter(provider=provider, client=client)` with no status filter. The `else` branch at line 120-127 unconditionally sets `status = PENDING`, which would re-activate INELIGIBLE or CONFIRMED tokens if the guardrails above were ever re-ordered or a new status added.

**File**: `apps/attribution/views.py`, lines 106-109

**Current code**:
```python
        existing = ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
        ).order_by('-created_at').first()
```

**Fixed code** (already incorporated in Fix 2 above):
```python
        existing = ProfileAttributionToken.objects.select_for_update().filter(
            provider=provider,
            client=client,
            status__in=[AttributionStatus.PENDING, AttributionStatus.EXPIRED],
        ).order_by('-created_at').first()
```

This ensures only PENDING and EXPIRED tokens can be refreshed. CONFIRMED and INELIGIBLE tokens are excluded at the query level, making the code safe against future status additions or guardrail re-ordering.

**Required test**:
```python
def test_ineligible_token_not_reactivated_on_visit(self):
    """
    If has_prior_booking() returns False (e.g., appointment hard-deleted)
    but an INELIGIBLE token exists, the token must NOT be re-activated.
    Guardrail 3 catches this, but the explicit status filter on the refresh
    query is a defense-in-depth safeguard.
    """
    ProfileAttributionToken.objects.create(
        provider=self.provider,
        client=self.client,
        source='profile',
        status=AttributionStatus.INELIGIBLE,
        expires_at=timezone.now() + timedelta(days=30),
    )
    response = self.client_http.post(
        '/api/v1/attribution/track/',
        {'provider_id': self.provider.id},
        format='json',
    )
    self.assertEqual(response.status_code, 200)
    self.assertEqual(response.data['reason'], 'ineligible')
    # Verify token status was NOT changed
    token = ProfileAttributionToken.objects.get(
        provider=self.provider, client=self.client,
    )
    self.assertEqual(token.status, AttributionStatus.INELIGIBLE)
```

---

## Fix 5 -- DEFAULT_THROTTLE_RATES Missing (MEDIUM)

**Audit finding**: #6 (sub-item) -- `UserRateThrottle` is configured on `TrackAttributionView` (line 30) but `DEFAULT_THROTTLE_RATES` is absent from `REST_FRAMEWORK` in `settings.py`. DRF will raise `ImproperlyConfigured` at runtime because `UserRateThrottle` requires a `'user'` key in `DEFAULT_THROTTLE_RATES`.

**File**: `lumy_global/settings.py`, lines 248-253

**Current code**:
```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication"
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}
```

**Fixed code**:
```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication"
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_RATES': {
        'user': '300/hour',
        'anon': '120/hour',
    },
}
```

**Rate justification**:
- `user: 300/hour` -- Authenticated users viewing provider profiles. A heavy browsing session might hit 50-100 profiles/hour; 300 provides 3x headroom. Attribution tracking is one POST per profile view, so this rate limits gaming attempts while allowing legitimate exploration.
- `anon: 120/hour` -- Unauthenticated requests. The attribution endpoint requires `IsAuthenticated` so this rate only applies to other DRF views, but must be defined to prevent `ImproperlyConfigured` if `AnonRateThrottle` is added elsewhere.

---

## Fix 6 -- fraud_logger Ephemerality (MEDIUM)

**Audit finding**: #9 -- `fraud_logger` (`logging.getLogger('attribution.fraud')`) has no dedicated handler. Logs propagate to root and are written to `logger.logs` (a single file mixed with all other output). In Docker, this file is ephemeral. The `verbose` formatter also discards `extra` fields.

**Decision**: Accept log ephemerality. The critical fraud signal (INELIGIBLE status) is persisted in the database via `ProfileAttributionToken.status`. The logger provides operational visibility, not the source of truth.

**Improvement**: Add a dedicated `attribution.fraud` logger with a JSON-ish formatter so `extra` fields (provider_id, client_id, referer) actually appear in output. Use stdout (console) so Docker log aggregation tools (CloudWatch, Datadog, etc.) can capture fraud events without requiring volume mounts.

**File**: `lumy_global/settings.py`, LOGGING config (lines 522-560)

**Current code**:
```python
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    "formatters": {
        'colored': {
            '()': ColoredFormatter,
            'format': "%(log_color)s%(levelname)-8s%(reset)s  %(message)s",
            'log_colors': { ... },
        },
        'verbose': {
            'format': '%(asctime)s [%(levelname)s] %(module)s - %(message)s'
        }
    },
    'handlers': {
        'console': { ... },
        'file': { ... }
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'DEBUG',
    },
}
```

**Fixed code**:
```python
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    "formatters": {
        'colored': {
            '()': ColoredFormatter,
            'format': "%(log_color)s%(levelname)-8s%(reset)s  %(message)s",
            'log_colors': {
                'DEBUG': 'green',
                'INFO': 'green',
                'WARNING': 'yellow',
                'ERROR': 'red',
                'CRITICAL': 'red,bg_white',
            },
        },
        'verbose': {
            'format': '%(asctime)s [%(levelname)s] %(module)s - %(message)s'
        },
        'fraud': {
            'format': '%(asctime)s [FRAUD %(levelname)s] %(message)s | provider=%(provider_id)s client=%(client_id)s referer=%(referer)s'
        },
    },
    'handlers': {
        'console': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'colored'
        },
        'file': {
            'level': 'DEBUG',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(BASE_DIR, "logger.logs"),
            'formatter': 'verbose'
        },
        'fraud_console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'fraud',
        },
    },
    'loggers': {
        'attribution.fraud': {
            'handlers': ['fraud_console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'DEBUG',
    },
}
```

**Key changes**:
1. New `fraud` formatter that renders `%(provider_id)s`, `%(client_id)s`, `%(referer)s` from `extra` dict.
2. New `fraud_console` handler using the `fraud` formatter -- writes to stdout for container log aggregation.
3. New `attribution.fraud` logger entry with `propagate: False` to prevent duplicate output in the root logger.
4. Fraud events still go to the `file` handler (via explicit listing) for local debugging.

**Caveat**: The `fraud` formatter will raise `KeyError` if a `fraud_logger` call omits any of `provider_id`, `client_id`, `referer` from `extra`. All current call sites include all three. Future call sites must follow the same pattern, or use `logging.LoggerAdapter` with defaults. This is acceptable given the small surface area (2 call sites as of this audit).

---

## Implementation Sequence

All six fixes should be applied in a single commit on the `feat/attribution-fraud-guardrails` branch. No migration is needed (all changes are Python logic and config).

| Order | Fix | Files modified |
|-------|-----|----------------|
| 1 | Fix 5: DEFAULT_THROTTLE_RATES | `lumy_global/settings.py` |
| 2 | Fix 6: fraud_logger config | `lumy_global/settings.py` |
| 3 | Fix 1: TalkNow blind spot | `apps/attribution/utils.py` |
| 4 | Fix 4: Fragile else branch | `apps/attribution/views.py` (included in Fix 2) |
| 5 | Fix 2: Race condition (transaction.atomic) | `apps/attribution/views.py` |
| 6 | Fix 3: CONFIRMED expiry documentation | `apps/attribution/views.py` (included in Fix 2) |
| 7 | New tests for all fixes | `apps/attribution/tests/test_fraud_guardrails.py` |

**Commit message**: `fix(attribution): close TalkNow blind spot, add atomicity, harden token refresh query (RGDEV-185)`

---

## Deferred Items (Not In Scope)

| Item | Reason | Tracked |
|------|--------|---------|
| Provider account switching / identity dedup | Product decision needed | Audit finding #5 |
| Server-side referer validation | Product decision needed | Audit finding #6 |
| Source conflict resolution (first-touch vs lowest-fee) | Deferred to RGDEV-205 | models.py comment block |
| Race condition concurrency tests (TransactionTestCase + threading) | Complex test infrastructure; manual verification sufficient for now | Audit finding #10d |

---

## Verification Checklist

After applying all fixes:

- [ ] `python manage.py test apps.attribution` -- all existing + new tests pass
- [ ] `python manage.py test apps.talk_now` -- no regressions from TalkNow import
- [ ] `python manage.py check` -- no system check errors
- [ ] Manual: POST to `/api/v1/attribution/track/` with a provider who has a TalkNow ACCEPTED call with the client -- should return `existing_relationship`
- [ ] Manual: Concurrent POST requests (two tabs, fast click) -- second request should not create a duplicate token
- [ ] Manual: Verify `[FRAUD INFO]` line appears in `docker compose logs backend` output with provider_id/client_id fields
- [ ] Manual: Verify no `ImproperlyConfigured` error when hitting the throttled endpoint
