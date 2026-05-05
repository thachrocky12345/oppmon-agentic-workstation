# RGDEV-185: Fraud & Gaming Guardrails — Fix Implementation Plan
**Date**: 2026-03-14
**Source**: `Audit_FraudGuardrails_UXScenario_Results_2026-03-14.md`
**Ticket**: RGDEV-185
**Status**: Ready for implementation

---

## Fix 1 — Talk Now Blind Spot (CRITICAL)

**Audit finding**: `has_prior_booking()` queries only the `Appointment` table. Talk Now sessions live in a separate `TalkNow` model and are not checked, allowing providers to game the attribution system with existing Talk Now clients.

**Revenue exposure**: ~$180/month per provider with 20 Talk Now clients.

### File: `apps/attribution/utils.py`

**Current code** (lines 123-132):
```python
def has_prior_booking(provider, client):
    """
    Returns True if client has any appointment with this provider (any status,
    including cancelled — cancelled means they already had a relationship).
    """
    from apps.calendar_functionality.models import Appointment
    return Appointment.objects.filter(
        care_provider=provider,
        client=client,
    ).exists()
```

**Replace with**:
```python
def has_prior_booking(provider, client):
    """
    Returns True if client has any appointment OR Talk Now session with this
    provider (any status, including cancelled — any prior interaction means
    they already had a relationship).
    """
    from apps.calendar_functionality.models import Appointment
    from apps.talk_now.models import TalkNow

    # Check scheduled/completed/cancelled appointments
    if Appointment.objects.filter(
        care_provider=provider,
        client=client,
    ).exists():
        return True

    # Check Talk Now sessions.
    # TalkNow.client is FK to User (not Client), so we join through
    # client.user to match. TalkNow.care_provider is FK to CareProvider.
    # Client.user is a OneToOneField with related_name="client",
    # so User.client reverse works.
    if TalkNow.objects.filter(
        care_provider=provider,
        client=client.user,      # TalkNow.client -> User; client.user -> User
    ).exists():
        return True

    return False
```

**Join path explanation**:
- `client` parameter is a `Client` instance (FK from `ProfileAttributionToken.client`)
- `Client.user` is a `OneToOneField(User, related_name="client")` — so `client.user` gives the `User` instance
- `TalkNow.client` is `ForeignKey(User, ...)` — so we filter `TalkNow.client = client.user`
- `TalkNow.care_provider` is `ForeignKey(CareProvider, ...)` — matches directly

**Tests to add** (in `apps/attribution/tests/test_fraud_guardrails.py`):
```python
def test_has_prior_booking_detects_talk_now_session(self):
    """Talk Now sessions should block attribution (RGDEV-185 fix)."""
    from apps.talk_now.models import TalkNow
    TalkNow.objects.create(
        client=self.client_user,        # User instance
        care_provider=self.provider,    # CareProvider instance
        room_name="test-room-123",
        current_status="ACCEPTED",
        initiated_by=self.client_user,
    )
    self.assertTrue(has_prior_booking(self.provider, self.client))

def test_has_prior_booking_no_talk_now_no_appointment(self):
    """No Talk Now and no Appointment should return False."""
    self.assertFalse(has_prior_booking(self.provider, self.client))
```

---

## Fix 2 — UserRateThrottle Non-Functional (HIGH)

**Audit finding**: `TrackAttributionView` declares `throttle_classes = [UserRateThrottle]`, but `REST_FRAMEWORK` in `settings.py` has no `DEFAULT_THROTTLE_RATES` key. DRF's `UserRateThrottle` requires `DEFAULT_THROTTLE_RATES['user']` to enforce any limit. Without it, the throttle is instantiated but does nothing.

**Secondary issue**: The view only has `UserRateThrottle`. Unauthenticated requests are already blocked by `IsAuthenticated`, but adding `AnonRateThrottle` provides defense-in-depth against auth bypass or future endpoint changes.

### File: `lumy_global/settings.py`

**Add to the `REST_FRAMEWORK` dict** (currently at line 248):

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

**Rationale for rates**:
- `user: 300/hour` — allows normal browsing (a client visiting ~5 provider profiles/minute) while blocking scripted mass-claim attacks. This is per-user, keyed by authenticated user ID.
- `anon: 120/hour` — lower rate for unauthenticated requests. Although attribution endpoints require auth, this provides a global safety net for all DRF views.

### File: `apps/attribution/views.py`

**Current** (line 9, 30):
```python
from rest_framework.throttling import UserRateThrottle
...
    throttle_classes = [UserRateThrottle]
```

**Replace with**:
```python
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
...
    throttle_classes = [AnonRateThrottle, UserRateThrottle]
```

**Impact note**: `DEFAULT_THROTTLE_RATES` is a global DRF setting. All views using `UserRateThrottle` or `AnonRateThrottle` anywhere in the project will now be rate-limited. Audit other views that use these classes to ensure the `300/hour` and `120/hour` rates are appropriate. Views needing custom rates can override with `throttle_scope` and `DEFAULT_THROTTLE_RATES['<scope>']`.

---

## Fix 3 — No Frontend Integration (HIGH)

**Audit finding**: No frontend code calls `/api/v1/attribution/track/` or `/api/v1/attribution/checkout-status/`. The backend guardrails exist but the end-to-end feature is incomplete.

**This fix is documentation only for RGDEV-185 (backend readiness).** Frontend implementation is tracked in RGDEV-205 (attribution tracking) and RGDEV-206 (checkout display).

### What the frontend must do

#### A. Attribution tracking call (RGDEV-205)

**When**: A client arrives on a provider's public profile page via an external link (e.g., provider shares `https://really.global/provider/<slug>` on social media, email, or their website).

**How to detect "external"**: Check `document.referrer`. If it does NOT match `*.really.global` or is empty (direct link), treat it as an external visit.

**API call**:
```typescript
// Only fire on external visits to provider profile pages
if (!document.referrer.includes('really.global')) {
  await axios.post('/api/v1/attribution/track/', {
    provider_id: providerId,
    referer: document.referrer || 'direct',
  });
}
```

**Response handling**:
- `{ attributed: true, expires_at: "..." }` — attribution recorded, no UI needed
- `{ attributed: false, reason: "existing_relationship" }` — silently ignore, do not display
- `{ attributed: false, reason: "ineligible" }` — silently ignore
- `{ attributed: true, already_confirmed: true }` — attribution already locked in, no action needed

**Do NOT call this endpoint**:
- During internal navigation (client browses from search results, category pages, etc.)
- On page refreshes of an already-visited profile
- From provider-side views

#### B. Checkout discount display (RGDEV-206)

**When**: During the booking checkout flow, after the client has selected a session type and time.

**API call**:
```typescript
const { data } = await axios.get('/api/v1/attribution/checkout-status/', {
  params: { provider_id: providerId },
});
```

**Response handling**:
- `{ is_first_attributed_session: true, discount_percent: 10 }` — display discounted price to the client (e.g., "10% off your first session")
- `{ is_first_attributed_session: false, discount_percent: null }` — show standard price, no discount messaging

### Backend readiness checklist

| Endpoint | Ready | Notes |
|---|---|---|
| `POST /api/v1/attribution/track/` | Yes | Auth required, guardrails active |
| `GET /api/v1/attribution/checkout-status/` | Yes | Returns discount info for CONFIRMED tokens |
| Talk Now check in `has_prior_booking()` | **No** | Blocked on Fix 1 above |
| Rate throttle functional | **No** | Blocked on Fix 2 above |

---

## Fix 4 — No Admin Override for INELIGIBLE (MEDIUM)

**Audit finding**: INELIGIBLE status is immutable by design. No mechanism exists for staff to manually override a disputed INELIGIBLE determination (e.g., an appointment was erroneously created and then deleted, or a data migration created phantom records).

### File: `apps/attribution/admin.py`

**Add** the `can_clear_ineligible` admin action to `ProfileAttributionTokenAdmin`:

```python
from django.contrib import admin, messages
from django.utils import timezone

from .models import AttributionStatus, ProfileAttributionToken, ProviderClientFeeOverride


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

    @admin.action(description="Clear INELIGIBLE → PENDING (disputed cases only)")
    def clear_ineligible_to_pending(self, request, queryset):
        """
        Admin action: manually transition INELIGIBLE tokens back to PENDING.

        Use case: a prior appointment was created in error (data migration,
        test data, admin mistake) and the INELIGIBLE determination is disputed.

        Only operates on tokens with status=INELIGIBLE. Skips all others.
        Logs the override for audit trail.
        """
        import logging
        fraud_logger = logging.getLogger('attribution.fraud')

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
                    "token_id": token.id,
                    "provider_id": token.provider_id,
                    "client_id": token.client_id,
                    "overridden_by": request.user.email,
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

**Note**: This does NOT add `overridden_by`, `override_reason`, or `override_at` fields to the model. Those would require a migration and are deferred to a follow-up ticket. For now, the admin action logs the override via `attribution.fraud` logger (which will be persistent after Fix 5) and the `modified_at` timestamp records when the change occurred.

**Post-MVP enhancement**: Add `overridden_by = models.ForeignKey(User, null=True)`, `override_reason = models.TextField(null=True)`, and `override_at = models.DateTimeField(null=True)` fields to `ProfileAttributionToken` for a first-class audit trail.

---

## Fix 5 — Fraud Logger Persistence (MEDIUM)

**Audit finding**: `fraud_logger = logging.getLogger('attribution.fraud')` in `views.py` inherits from the root logger. Output goes to `console` (ephemeral container stdout) and `file` (`logger.logs` — ephemeral in Docker unless volume-mounted). No dedicated handler, no monitoring, no alerting.

The INELIGIBLE status IS persisted on `ProfileAttributionToken` records (database), so retrospective auditing is possible. But operational alerting and forensic detail (referer, IP, user-agent) are lost when containers restart.

### File: `lumy_global/settings.py`

**Current LOGGING dict** (lines 523-560):

```python
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    "formatters": {
        'colored': { ... },
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

**Add** a dedicated `attribution_fraud_file` handler and `attribution.fraud` logger to the LOGGING dict:

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
            'format': '%(asctime)s [%(levelname)s] %(name)s — %(message)s [%(funcName)s:%(lineno)d]'
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
        'attribution_fraud_file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': os.path.join(BASE_DIR, 'logs', 'attribution_fraud.log'),
            'maxBytes': 10 * 1024 * 1024,   # 10 MB
            'backupCount': 10,               # keep 10 rotated files (100 MB total)
            'formatter': 'fraud',
        },
    },
    'loggers': {
        'attribution.fraud': {
            'handlers': ['attribution_fraud_file', 'console'],
            'level': 'INFO',
            'propagate': False,    # do NOT also send to root logger's file handler
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'DEBUG',
    },
}
```

### Directory creation

The `logs/` directory must exist. Add to the backend entrypoint or Dockerfile:

```bash
mkdir -p logs
```

Or add a startup check in `settings.py` below the LOGGING dict:

```python
# Ensure fraud log directory exists
_fraud_log_dir = os.path.join(BASE_DIR, 'logs')
os.makedirs(_fraud_log_dir, exist_ok=True)
```

### Docker volume mount

To persist fraud logs across container restarts, add a volume mount in `docker-compose.yml`:

```yaml
backend:
  volumes:
    - ./Lumy-Backend/logs:/app/logs
```

### Key design decisions

| Decision | Rationale |
|---|---|
| `propagate: False` | Prevents duplicate entries in the general `logger.logs` file. Fraud events go ONLY to the dedicated file + console. |
| `maxBytes: 10MB, backupCount: 10` | Caps total disk usage at ~100 MB. Fraud logs are low-volume (one line per INELIGIBLE determination or admin override). |
| `level: INFO` | Both `fraud_logger.info()` (blocked attribution) and `fraud_logger.warning()` (admin override) are captured. |
| Separate formatter (`fraud`) | Includes `funcName` and `lineno` for forensic tracing without the color codes that the console formatter uses. |

### Post-MVP: Monitoring integration

When a log aggregator is adopted (Sentry, Datadog, CloudWatch), add a second handler to `attribution.fraud`:

```python
'attribution_fraud_sentry': {
    'level': 'WARNING',
    'class': 'sentry_sdk.integrations.logging.EventHandler',
},
```

And create a scheduled management command or cron job to detect spikes:

```python
# management/commands/check_attribution_fraud_spikes.py
# Query: ProfileAttributionToken.objects.filter(
#     status='ineligible',
#     modified_at__gte=timezone.now() - timedelta(hours=24),
# ).values('provider').annotate(count=Count('id')).filter(count__gte=10)
# Alert if any provider has >= 10 INELIGIBLE tokens in 24 hours.
```

---

## Implementation Order

| Step | Fix | Severity | Effort | Dependencies |
|---|---|---|---|---|
| 1 | Fix 1 — Talk Now blind spot | CRITICAL | Small (1 function + 2 tests) | None |
| 2 | Fix 2 — Throttle rates | HIGH | Trivial (2 lines in settings, 1 import in views) | None |
| 3 | Fix 5 — Fraud logger persistence | MEDIUM | Small (settings dict + mkdir) | None |
| 4 | Fix 4 — Admin override | MEDIUM | Small (1 admin action) | Fix 5 (so overrides are logged to persistent file) |
| 5 | Fix 3 — Frontend docs | HIGH | Zero code (documentation only) | Fix 1 + Fix 2 (backend must be ready first) |

**Total estimated effort**: ~2-3 hours for backend fixes (Fixes 1, 2, 4, 5). Frontend integration (Fix 3) is separate tickets RGDEV-205/206.

---

## Files Modified

| File | Fixes |
|---|---|
| `apps/attribution/utils.py` | Fix 1 |
| `apps/attribution/views.py` | Fix 2 |
| `apps/attribution/admin.py` | Fix 4 |
| `apps/attribution/tests/test_fraud_guardrails.py` | Fix 1 (new tests) |
| `lumy_global/settings.py` | Fix 2, Fix 5 |
| `docker-compose.yml` | Fix 5 (volume mount) |

---

## Accepted Residual Risks (No Fix Required for MVP)

| Risk | Severity | Rationale |
|---|---|---|
| Provider re-registration bypasses guardrails (Scenario 5) | MEDIUM | High friction (new Stripe Connect, new Certn). Detect post-MVP via shared phone/licence/bank fingerprint. |
| Multi-staff practice bypass (Scenario 1 caveat) | MEDIUM | Practices not yet modeled. Each CareProvider is independent. |
| Multi-account client (Scenario 9) | LOW | No client financial incentive. Twilio Verify + Certn provide incidental dedup. |
| `reason` field in track response reveals determination (Scenario 7) | LOW | Requires browser dev tools. Consider removing in a future cleanup pass. |
