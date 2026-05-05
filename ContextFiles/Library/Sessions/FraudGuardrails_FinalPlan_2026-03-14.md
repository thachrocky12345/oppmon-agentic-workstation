# RGDEV-185: Fraud & Gaming Guardrails — FINAL CORRECTED PLAN

**Date**: 2026-03-14
**Branch**: `RGDEV-185/fraud-guardrails` (HEAD: `9388654`)
**Merged from**: DataModel audit fix plan + UXScenario audit fix plan
**Status**: Ready for implementation

---

## Executive Summary

| Metric | Count |
|---|---|
| Total fixes | 8 |
| CRITICAL | 1 (TalkNow blind spot — affects TWO files) |
| HIGH | 3 (race condition, CONFIRMED expiry docs, fragile else branch) |
| MEDIUM | 3 (throttle rates, fraud logger, admin override) |
| LOW | 1 (booking_link `_has_prior_booking` field name bug) |
| Cross-ticket items | 1 (Fix 8 affects RGDEV-204/205 booking_link app) |
| Files modified | 5 |
| New files | 1 |

---

## Current State of the IMPLEMENTER's Code

The implementer built the attribution system across two commits (`b471962`, `018ca63`) with a checkout flow in `3a306f2`/`9388654`. Key findings:

### What EXISTS on the branch

| File | What's there | Status |
|---|---|---|
| `apps/attribution/models.py` | `ProfileAttributionToken`, `ProviderClientFeeOverride`, `AttributionStatus`, `AttributionSource` with partial unique constraint | **KEEP** — correct |
| `apps/attribution/utils.py` | `get_telehealth_fee()`, `get_checkout_discount()` (with `select_for_update`), `create_attribution_token()` | **PARTIALLY CORRECT** — `has_prior_booking()` is missing entirely; `create_attribution_token()` has no TalkNow check |
| `apps/attribution/admin.py` | Basic `ModelAdmin` for both models | **NEEDS ENHANCEMENT** — missing `clear_ineligible_to_pending` action |
| `apps/attribution/tests/test_models.py` | 20+ tests for models, properties, utils, management command | **KEEP** — good coverage |
| `apps/attribution/management/commands/expire_attribution_tokens.py` | Expire command filtering `PENDING` and `CONFIRMED` | **NEEDS FIX** — should NOT expire CONFIRMED tokens |
| `apps/attribution/urls.py` | Empty `urlpatterns = []` | OK — no views.py exists; tracking is done via `create_attribution_token()` in utils |
| `apps/booking_link/views.py` | `_has_prior_booking()` helper + checkout views | **NEEDS FIX** — TalkNow blind spot + wrong field name |
| `lumy_global/settings.py` | `REST_FRAMEWORK` without `DEFAULT_THROTTLE_RATES`; `LOGGING` without fraud logger | **NEEDS FIX** |

### What does NOT exist (audit plans assumed it did)

- **No `apps/attribution/views.py`** — The DataModel audit plan wrote fixes for a `TrackAttributionView.post()` that doesn't exist. Attribution tracking is done via `create_attribution_token()` in `utils.py`, called from booking flows. The race condition fix (Fix 2 in DataModel plan) and fragile else branch fix (Fix 4) target code that isn't present. However, the `create_attribution_token()` function in `utils.py` has a similar (milder) race concern.
- **No `fraud_logger`** in any attribution file — logging uses `logging.getLogger(__name__)`.

---

## FINAL FIX LIST

### Fix 1 — TalkNow Blind Spot in `_has_prior_booking()` [CRITICAL]

**Source**: Both audit plans (DataModel Fix 1, UXScenario Fix 1)
**What**: `_has_prior_booking()` in `apps/booking_link/views.py` only checks `Appointment`. Misses all TalkNow sessions. Also has a bug: filters on `is_status__in` which is correct field name but only checks `SCHEDULED`/`COMPLETED`, missing `CANCELLED` (cancelled still means prior relationship).
**Impact**: Provider can game attribution with existing TalkNow clients.

**File**: `apps/booking_link/views.py`

**REPLACE** (current code, lines ~116-127):
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

**WITH**:
```python
def _has_prior_booking(client, care_provider):
    """
    C4: Fraud guardrail -- check if this client has any prior relationship with
    this provider (appointment, Talk Now call, or legacy session).

    Any prior interaction means they are not a 'new' referral.

    Note: TalkNow.client is FK to User (not Client), so we join via client.user.
    Only ACCEPTED and LEAVE TalkNow statuses represent completed calls;
    INCOMING/REJECTED/MISSED are attempts that never connected.
    """
    from apps.calendar_functionality.models import Appointment, Session
    from apps.talk_now.models import TalkNow

    if not client or not care_provider:
        return False

    # Any appointment (any status including CANCELLED — cancelled means prior relationship)
    if Appointment.objects.filter(
        client=client,
        care_provider=care_provider,
    ).exists():
        return True

    # TalkNow.client -> User (not Client), so use client.user
    if TalkNow.objects.filter(
        care_provider=care_provider,
        client=client.user,
        current_status__in=['ACCEPTED', 'LEAVE'],
    ).exists():
        return True

    # Legacy Session model
    if Session.objects.filter(
        client=client,
        care_provider=care_provider,
    ).exists():
        return True

    return False
```

**Key changes**:
1. Added TalkNow check with `client.user` FK join (TalkNow.client is FK to User, not Client)
2. Added Session legacy model check
3. Removed `is_status__in` filter on Appointment — any status counts as prior relationship
4. Added status filter on TalkNow — only ACCEPTED/LEAVE (completed calls)

---

### Fix 2 — TalkNow Blind Spot in `create_attribution_token()` [CRITICAL]

**Source**: DataModel Fix 1 (adapted — the audit targeted a non-existent `has_prior_booking` in utils.py, but the real gap is that `create_attribution_token()` has NO prior-booking check at all)
**What**: `create_attribution_token()` in `utils.py` creates tokens without checking for prior relationships. The prior-booking check only happens at checkout time in `_has_prior_booking()`. This means PENDING tokens get created for clients who already have a relationship — they'll be caught at checkout, but the token's existence is misleading and wastes the unique constraint slot.

**Decision**: Add a prior-booking guard to `create_attribution_token()` as defense-in-depth. This is a belt-and-suspenders approach: the checkout guardrail in `_has_prior_booking()` is the primary defense.

**File**: `apps/attribution/utils.py`

**ADD** after the imports block (line ~16):
```python
fraud_logger = logging.getLogger('attribution.fraud')
```

**ADD** new function before `create_attribution_token()`:
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
    # are attempts that never connected — no real relationship established.
    if TalkNow.objects.filter(
        care_provider=provider,
        client=client.user,
        current_status__in=['ACCEPTED', 'LEAVE'],
    ).exists():
        return True

    # Legacy Session model — may have historical data
    if Session.objects.filter(
        care_provider=provider,
        client=client,
    ).exists():
        return True

    return False
```

**MODIFY** `create_attribution_token()` — add prior-booking guard at the top of the function body, after the `source` default:

**Current** (after `source = AttributionSource.PROFILE`):
```python
    window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', DEFAULT_ATTRIBUTION_WINDOW_DAYS)
```

**Replace with**:
```python
    # Defense-in-depth: block token creation for clients with prior relationship.
    # Primary guardrail is at checkout (_has_prior_booking in booking_link/views.py).
    if has_prior_booking(provider, client):
        fraud_logger.info(
            "Attribution token blocked — existing relationship",
            extra={
                "provider_id": str(provider.id),
                "client_id": str(client.id),
                "referer": referer or '',
            }
        )
        return (None, False)

    window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', DEFAULT_ATTRIBUTION_WINDOW_DAYS)
```

**Callers of `create_attribution_token()` must handle `(None, False)` return.** Currently the function is called from booking_link views — check and handle gracefully.

---

### Fix 3 — CONFIRMED Tokens Must NOT Be Expired [HIGH]

**Source**: DataModel Fix 3 (product decision: CONFIRMED = permanent)
**What**: `expire_attribution_tokens` management command filters `status__in=[PENDING, CONFIRMED]` and expires both. CONFIRMED tokens represent a permanent attribution relationship and should never be swept.

**File**: `apps/attribution/management/commands/expire_attribution_tokens.py`

**REPLACE** (line ~27):
```python
        qs = ProfileAttributionToken.objects.filter(
            status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
            expires_at__lte=now,
        )
```

**WITH**:
```python
        # Only expire PENDING tokens. CONFIRMED tokens represent permanent
        # attribution relationships and must NOT be swept, even past expires_at.
        # The fee override (ProviderClientFeeOverride) has is_active for deactivation.
        qs = ProfileAttributionToken.objects.filter(
            status=AttributionStatus.PENDING,
            expires_at__lte=now,
        )
```

**IMPLEMENTER code verdict**: REPLACED — this is a bug in the implementer's code.

---

### Fix 4 — Race Condition in `create_attribution_token()` [HIGH]

**Source**: DataModel Fix 2 (adapted for actual code location)
**What**: `create_attribution_token()` does a read-then-write without `transaction.atomic()` or `select_for_update()`. Concurrent requests can both see no existing token and both try to create, hitting the partial unique constraint (which is good — it prevents corruption — but causes a 500 error instead of graceful handling).

**File**: `apps/attribution/utils.py`

**REPLACE** the body of `create_attribution_token()` from `window_days = ...` onward:

**Current**:
```python
    window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', DEFAULT_ATTRIBUTION_WINDOW_DAYS)
    expires_at = timezone.now() + timedelta(days=window_days)

    # If a pending/confirmed token already exists, extend its window
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

**WITH** (includes the prior-booking guard from Fix 2):
```python
    # Defense-in-depth: block token creation for clients with prior relationship.
    if has_prior_booking(provider, client):
        fraud_logger.info(
            "Attribution token blocked — existing relationship",
            extra={
                "provider_id": str(provider.id),
                "client_id": str(client.id),
                "referer": referer or '',
            }
        )
        return (None, False)

    window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', DEFAULT_ATTRIBUTION_WINDOW_DAYS)
    expires_at = timezone.now() + timedelta(days=window_days)

    with transaction.atomic():
        # select_for_update prevents concurrent requests from both creating tokens
        existing = ProfileAttributionToken.objects.select_for_update().filter(
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

**IMPLEMENTER code verdict**: REPLACED — wraps in `transaction.atomic()` + `select_for_update()`.

---

### Fix 5 — DEFAULT_THROTTLE_RATES Missing [MEDIUM]

**Source**: Both audit plans (DataModel Fix 5, UXScenario Fix 2)
**What**: `REST_FRAMEWORK` in settings.py has no `DEFAULT_THROTTLE_RATES`. Any view using `UserRateThrottle` will raise `ImproperlyConfigured`. The `BookingLinkAnonThrottle` in booking_link/views.py sets its own `rate = '120/hour'` so it works, but any future use of the base throttle classes will break.

**File**: `lumy_global/settings.py`

**REPLACE**:
```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication"
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}
```

**WITH**:
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

**IMPLEMENTER code verdict**: REPLACED — this was missing entirely.

**Impact note**: This is a global DRF setting. All views using `UserRateThrottle` or `AnonRateThrottle` will now be rate-limited at these defaults. Views needing custom rates (like `BookingLinkAnonThrottle`) already override with `rate = '120/hour'` and are unaffected.

---

### Fix 6 — Fraud Logger Configuration [MEDIUM]

**Source**: Both audit plans (DataModel Fix 6, UXScenario Fix 5)
**What**: No dedicated `attribution.fraud` logger configuration. Fraud events propagate to root logger only.

**Decision**: Use the DataModel plan's approach (stdout + file handler) since it's simpler and works well with Docker log aggregation. The UXScenario plan's separate file (`logs/attribution_fraud.log`) adds operational complexity (directory creation, volume mounts) for minimal benefit over structured stdout.

**File**: `lumy_global/settings.py`

**REPLACE** the LOGGING dict:
```python
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    "formatters": {
        'colored': {
            '()': ColoredFormatter,
            'format': "%(log_color)s%(levelname)-8s%(reset)s  %(message)s"
            ,
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
        }
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
        }
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'DEBUG',
    },
}
```

**WITH**:
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

**Caveat**: The `fraud` formatter expects `%(provider_id)s`, `%(client_id)s`, `%(referer)s` in the `extra` dict. All call sites (Fix 2 and Fix 7) must include all three. If a call site omits one, the formatter will raise `KeyError`. Acceptable given only 2-3 call sites.

---

### Fix 7 — Admin Override for INELIGIBLE [MEDIUM]

**Source**: UXScenario Fix 4
**What**: No mechanism for staff to manually clear a disputed INELIGIBLE determination.

**File**: `apps/attribution/admin.py`

**REPLACE** entire file:
```python
from django.contrib import admin

from .models import ProfileAttributionToken, ProviderClientFeeOverride
```

(current imports)

**WITH**:
```python
import logging

from django.contrib import admin, messages
from django.utils import timezone

from .models import AttributionStatus, ProfileAttributionToken, ProviderClientFeeOverride

fraud_logger = logging.getLogger('attribution.fraud')
```

**REPLACE** the `ProfileAttributionTokenAdmin` class:
```python
@admin.register(ProfileAttributionToken)
class ProfileAttributionTokenAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'provider', 'client', 'source', 'status',
        'expires_at', 'first_booking_at', 'first_session_discount_applied',
        'created_at',
    ]
    list_filter = ['status', 'source', 'first_session_discount_applied']
    search_fields = [
        'provider__user__email',
        'client__user__email',
    ]
    readonly_fields = [
        'created_at', 'modified_at',
        'first_session_discount_applied', 'expires_at',
        'first_booking_at', 'provider', 'client', 'source',
    ]
```

**WITH**:
```python
@admin.register(ProfileAttributionToken)
class ProfileAttributionTokenAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'provider', 'client', 'source', 'status',
        'expires_at', 'first_booking_at', 'first_session_discount_applied',
        'created_at',
    ]
    list_filter = ['status', 'source', 'first_session_discount_applied']
    search_fields = [
        'provider__user__email',
        'client__user__email',
    ]
    readonly_fields = [
        'created_at', 'modified_at',
        'first_session_discount_applied', 'expires_at',
        'first_booking_at', 'provider', 'client', 'source',
    ]
    actions = ['clear_ineligible_to_pending']

    @admin.action(description="Clear INELIGIBLE -> PENDING (disputed cases only)")
    def clear_ineligible_to_pending(self, request, queryset):
        """
        Admin action: manually transition INELIGIBLE tokens back to PENDING.

        Use case: a prior appointment was created in error (data migration,
        test data, admin mistake) and the INELIGIBLE determination is disputed.

        Only operates on tokens with status=INELIGIBLE. Skips all others.
        Logs the override for audit trail via the attribution.fraud logger.
        """
        ineligible_qs = queryset.filter(status=AttributionStatus.INELIGIBLE)
        count = ineligible_qs.count()

        if count == 0:
            self.message_user(
                request,
                "No INELIGIBLE tokens in selection — nothing changed.",
                messages.WARNING,
            )
            return

        for token in ineligible_qs:
            fraud_logger.warning(
                "Admin override: INELIGIBLE -> PENDING",
                extra={
                    "provider_id": str(token.provider_id),
                    "client_id": str(token.client_id),
                    "referer": f"admin_override_by_{request.user.email}",
                },
            )

        ineligible_qs.update(
            status=AttributionStatus.PENDING,
            modified_at=timezone.now(),
        )

        self.message_user(
            request,
            f"Cleared {count} INELIGIBLE token(s) to PENDING.",
            messages.SUCCESS,
        )
```

**IMPLEMENTER code verdict**: Enhanced — base admin was correct, adding action.

---

### Fix 8 — booking_link `_has_prior_booking` Status Filter Bug [LOW / CROSS-TICKET]

**Source**: Discovered during merge analysis (commit `9388654` title says "correct _has_prior_booking status filter")
**What**: The `is_status__in=["SCHEDULED", "COMPLETED"]` filter in the original `_has_prior_booking()` intentionally excluded `CANCELLED`. But per product requirements, **cancelled appointments still indicate a prior relationship** — the client and provider already interacted. Excluding CANCELLED allows a provider to cancel an appointment and then re-attribute the client.

**This is already addressed by Fix 1** (which removes the `is_status__in` filter entirely). Noting it here for completeness.

**Cross-ticket note**: This fix is in `apps/booking_link/views.py` which belongs to RGDEV-204/205 (booking link feature). The change is safe and backwards-compatible.

---

## Implementation Sequence

All fixes should be applied in a single commit. No migration needed (all changes are Python logic and config).

| Order | Fix | File(s) | IMPLEMENTER Code |
|---|---|---|---|
| 1 | Fix 5: DEFAULT_THROTTLE_RATES | `lumy_global/settings.py` | REPLACED |
| 2 | Fix 6: Fraud logger config | `lumy_global/settings.py` | REPLACED |
| 3 | Fix 2+4: TalkNow guard + race condition in utils | `apps/attribution/utils.py` | REPLACED (function body) |
| 4 | Fix 3: CONFIRMED expiry exclusion | `apps/attribution/management/commands/expire_attribution_tokens.py` | REPLACED |
| 5 | Fix 1+8: TalkNow blind spot in booking_link | `apps/booking_link/views.py` | REPLACED |
| 6 | Fix 7: Admin override action | `apps/attribution/admin.py` | ENHANCED |
| 7 | New tests | `apps/attribution/tests/test_fraud_guardrails.py` (new file) | NEW |

---

## New Test File

**File**: `apps/attribution/tests/test_fraud_guardrails.py`

```python
"""
Tests for RGDEV-185 Fraud & Gaming Guardrails.

Covers:
- TalkNow blind spot in has_prior_booking()
- CONFIRMED tokens not expired by management command
- create_attribution_token() blocks on prior relationship
"""
from datetime import timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.authentication.models import User
from apps.care_provider.models import CareProvider
from apps.client.models import Client
from apps.attribution.models import (
    ProfileAttributionToken,
    AttributionStatus,
)
from apps.attribution.utils import has_prior_booking, create_attribution_token


class FraudGuardrailTestMixin:
    """Shared setup for fraud guardrail tests."""

    def _create_user(self, email, user_type):
        return User.objects.create_user(
            email=email,
            password='testpass123',
            user_type=user_type,
        )

    def setUp(self):
        self.provider_user = self._create_user('provider@test.com', 'care_provider')
        self.provider = CareProvider.objects.create(user=self.provider_user)
        self.client_user = self._create_user('client@test.com', 'client')
        self.client_obj = Client.objects.create(user=self.client_user)


class HasPriorBookingTalkNowTests(FraudGuardrailTestMixin, TestCase):
    """Tests for TalkNow detection in has_prior_booking()."""

    def test_talknow_accepted_blocks_attribution(self):
        from apps.talk_now.models import TalkNow
        TalkNow.objects.create(
            care_provider=self.provider,
            client=self.client_user,       # FK to User, not Client
            initiated_by=self.client_user,
            room_name='test-room-accepted',
            current_status='ACCEPTED',
        )
        self.assertTrue(has_prior_booking(self.provider, self.client_obj))

    def test_talknow_leave_blocks_attribution(self):
        from apps.talk_now.models import TalkNow
        TalkNow.objects.create(
            care_provider=self.provider,
            client=self.client_user,
            initiated_by=self.client_user,
            room_name='test-room-leave',
            current_status='LEAVE',
        )
        self.assertTrue(has_prior_booking(self.provider, self.client_obj))

    def test_talknow_incoming_does_not_block(self):
        from apps.talk_now.models import TalkNow
        TalkNow.objects.create(
            care_provider=self.provider,
            client=self.client_user,
            initiated_by=self.client_user,
            room_name='test-room-incoming',
            current_status='INCOMING',
        )
        self.assertFalse(has_prior_booking(self.provider, self.client_obj))

    def test_talknow_rejected_does_not_block(self):
        from apps.talk_now.models import TalkNow
        TalkNow.objects.create(
            care_provider=self.provider,
            client=self.client_user,
            initiated_by=self.client_user,
            room_name='test-room-rejected',
            current_status='REJECTED',
        )
        self.assertFalse(has_prior_booking(self.provider, self.client_obj))

    def test_talknow_missed_does_not_block(self):
        from apps.talk_now.models import TalkNow
        TalkNow.objects.create(
            care_provider=self.provider,
            client=self.client_user,
            initiated_by=self.client_user,
            room_name='test-room-missed',
            current_status='MISSED',
        )
        self.assertFalse(has_prior_booking(self.provider, self.client_obj))

    def test_appointment_any_status_blocks(self):
        from apps.calendar_functionality.models import Appointment
        Appointment.objects.create(
            care_provider=self.provider,
            client=self.client_obj,
            is_status='CANCELLED',
            start_date_time=timezone.now(),
            end_date_time=timezone.now() + timedelta(hours=1),
        )
        self.assertTrue(has_prior_booking(self.provider, self.client_obj))

    def test_no_prior_returns_false(self):
        self.assertFalse(has_prior_booking(self.provider, self.client_obj))


class ConfirmedTokenExpiryTests(FraudGuardrailTestMixin, TestCase):
    """CONFIRMED tokens must NOT be expired by the management command."""

    def test_confirmed_token_not_expired_by_command(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.CONFIRMED,
            expires_at=timezone.now() - timedelta(days=30),
        )

        out = StringIO()
        call_command('expire_attribution_tokens', stdout=out)

        token.refresh_from_db()
        self.assertEqual(token.status, AttributionStatus.CONFIRMED)

    def test_pending_token_still_expired_by_command(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() - timedelta(days=1),
        )

        out = StringIO()
        call_command('expire_attribution_tokens', stdout=out)

        token.refresh_from_db()
        self.assertEqual(token.status, AttributionStatus.EXPIRED)


class CreateAttributionTokenGuardrailTests(FraudGuardrailTestMixin, TestCase):
    """create_attribution_token() should block on prior relationships."""

    def test_blocks_when_prior_appointment_exists(self):
        from apps.calendar_functionality.models import Appointment
        Appointment.objects.create(
            care_provider=self.provider,
            client=self.client_obj,
            is_status='COMPLETED',
            start_date_time=timezone.now(),
            end_date_time=timezone.now() + timedelta(hours=1),
        )
        token, created = create_attribution_token(self.provider, self.client_obj)
        self.assertIsNone(token)
        self.assertFalse(created)

    def test_blocks_when_prior_talknow_exists(self):
        from apps.talk_now.models import TalkNow
        TalkNow.objects.create(
            care_provider=self.provider,
            client=self.client_user,
            initiated_by=self.client_user,
            room_name='test-room-block',
            current_status='ACCEPTED',
        )
        token, created = create_attribution_token(self.provider, self.client_obj)
        self.assertIsNone(token)
        self.assertFalse(created)

    def test_creates_when_no_prior_relationship(self):
        token, created = create_attribution_token(self.provider, self.client_obj)
        self.assertIsNotNone(token)
        self.assertTrue(created)
        self.assertEqual(token.status, AttributionStatus.PENDING)
```

---

## Verification Checklist

After applying all fixes:

- [ ] `python manage.py test apps.attribution` — all existing + new tests pass
- [ ] `python manage.py test apps.booking_link` — no regressions
- [ ] `python manage.py test apps.talk_now` — no regressions from TalkNow import
- [ ] `python manage.py check` — no system check errors
- [ ] Verify `expire_attribution_tokens` command skips CONFIRMED tokens
- [ ] Verify `[FRAUD INFO]` line appears in stdout with provider_id/client_id fields

---

## Cross-Ticket Items

| Item | Affected Ticket | Description |
|---|---|---|
| Fix 1/8: `_has_prior_booking()` in booking_link | RGDEV-204/205 | The function lives in `apps/booking_link/views.py`. Changes are backward-compatible but the booking_link team should be aware. |
| Fix 5: `DEFAULT_THROTTLE_RATES` | ALL DRF views | Global setting — affects every view using `UserRateThrottle` or `AnonRateThrottle`. Existing `BookingLinkAnonThrottle` already overrides with `rate = '120/hour'` so unaffected. |
| `create_attribution_token()` now returns `(None, False)` | Any caller | Callers must handle `None` token. Currently called from booking_link flows — verify graceful handling. |

---

## Deferred Items (Not In Scope)

| Item | Reason | Tracking |
|---|---|---|
| Provider account switching / identity dedup | Product decision needed | Audit finding |
| Server-side referer validation | Product decision needed | Audit finding |
| Source conflict resolution (first-touch vs lowest-fee) | Deferred to RGDEV-205 | Comment in models.py |
| `overridden_by` / `override_reason` fields on model | Requires migration; logging sufficient for MVP | Post-MVP enhancement |
| Frontend integration for attribution tracking | Separate tickets | RGDEV-205, RGDEV-206 |

---

## Commit Message

```
fix(attribution): close TalkNow blind spot, protect CONFIRMED tokens, add atomicity (RGDEV-185)

- Add TalkNow + legacy Session checks to has_prior_booking() and _has_prior_booking()
- Exclude CONFIRMED tokens from expire_attribution_tokens command
- Wrap create_attribution_token() in transaction.atomic() + select_for_update()
- Add DEFAULT_THROTTLE_RATES to REST_FRAMEWORK settings
- Configure dedicated attribution.fraud logger with structured formatter
- Add clear_ineligible_to_pending admin action
- Remove is_status filter on Appointment (any status = prior relationship)
```
