# Final Corrected Implementation Plan: RGDEV-182 Attribution Data Model

**Date:** 2026-03-14
**Branch:** `RGDEV-182/attribution-data-model`
**Base commit:** `5fa53d0`
**Sources synthesized:**
- FixPlan_Attribution_DataModel (Plan A) — 13 fixes
- FixPlan_Attribution_UXScenario (Plan B) — 5 fixes
- Audit_Attribution_DataModel_Results — 26 FAILs
- Audit_Attribution_UXScenario_Results — 3 BUGs, 8 GAPs

---

## Conflict Resolutions

### 1. UniqueConstraint on ProfileAttributionToken — MERGED

**Plan A:** Partial unique constraint on `(provider, client)` WHERE `status IN ('pending','confirmed')`. Uses manual filter+create in `create_attribution_token()`.

**Plan B:** Full unique constraint on `(provider, client)`. Uses `update_or_create()` in `create_attribution_token()`.

**Resolution: Plan A wins (partial constraint).** Rationale:
- A full constraint prevents storing historical expired/ineligible tokens for the same pair, breaking re-attribution after expiry.
- The partial constraint allows expired tokens as historical records while preventing two active tokens for the same pair.
- `create_attribution_token()` uses Plan A's manual filter approach (check for existing active token, extend or create), which respects the partial constraint without `update_or_create` trying to match on fields not in the constraint.

**Data migration:** Plan A expires duplicates (keeps newest); Plan B deletes duplicates. Resolution: use Plan A's approach (expire, not delete) to preserve audit trail.

### 2. Broad exception in get_telehealth_fee — RESOLVED

**Plan A says:** Missing, needs to be added.
**Plan B says:** Already exists at line 32-34 with `logger.exception()`.

**Actual code:** Broad exception IS present (line 34-35 of current utils.py). Plan A was wrong.
**Fix needed:** Only the `is_active=True` filter and `.filter().first()` change (Plan A Fix 2).

### 3. get_telehealth_fee docstring warning (Plan B Fix 2) — ADOPTED

Plan B adds an in-person modality warning docstring. This is additive and non-conflicting with Plan A's changes. Included.

### 4. create_attribution_token — MERGED

Plan A uses filter+create with window extension. Plan B uses `update_or_create` with `defaults` that reset status to PENDING. Resolution: Plan A's approach is safer with partial constraints. Added Plan B's conflict resolution comments and `ATTRIBUTION_WINDOW_DAYS` fallback constant.

### 5. Conflict resolution comments (Plan B Fix 5) — ADOPTED

Non-conflicting documentation. Included as code comments on both `models.py` and `utils.py`.

---

## Files to Modify (ordered by dependency)

### File 1: `lumy_global/settings.py`

**Reason:** Cast `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` from string to Decimal so downstream arithmetic works.

**Change only** — replace line 625:

```python
# BEFORE:
ATTRIBUTED_TELEHEALTH_FEE_PERCENT = env('ATTRIBUTED_TELEHEALTH_FEE_PERCENT', default='0.12')

# AFTER:
ATTRIBUTED_TELEHEALTH_FEE_PERCENT = Decimal(env('ATTRIBUTED_TELEHEALTH_FEE_PERCENT', default='0.12'))
```

**Also add** at the top of `settings.py` (if not already present):

```python
from decimal import Decimal
```

**Note:** `grep` confirms no existing `from decimal import Decimal` in settings.py. Must be added near the top imports.

---

### File 2: `apps/attribution/models.py`

**Reason:** Rename `is_active` property to avoid shadowing BaseModel.is_active field; add partial UniqueConstraint; modernize ProviderClientFeeOverride Meta; add conflict resolution comments.

**Complete new content:**

```python
from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.authentication.models import BaseModel
from apps.care_provider.models import CareProvider
from apps.client.models import Client


class AttributionSource(models.TextChoices):
    PROFILE = 'profile', 'Profile'
    BOOKING_LINK = 'booking_link', 'Booking Link'


class AttributionStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    CONFIRMED = 'confirmed', 'Confirmed'
    EXPIRED = 'expired', 'Expired'
    INELIGIBLE = 'ineligible', 'Ineligible'


# ATTRIBUTION SOURCE CONFLICT RESOLUTION (see RGDEV-205 for full implementation):
#
# When a client visits a provider's profile AND later clicks their booking link
# (or vice versa), only one ProfileAttributionToken exists per active pair
# (enforced by unique_active_attribution_token partial constraint). The `source`
# field records the most recent attribution touchpoint.
#
# Current behavior (via create_attribution_token in utils.py):
#   - If an active token exists, its window is extended but source is NOT changed.
#   - A new token is only created if no active (pending/confirmed) token exists.
#
# Product decision needed (RGDEV-205):
#   Option A: "Last touch wins" — overwrite source on re-visit.
#   Option B: "Lowest fee wins" — only upgrade (profile -> booking_link), never downgrade.
#   Option C: "First touch wins" — never overwrite once created (current behavior).
#   Option D: Add a `priority` field to AttributionSource for explicit ordering.
#
# Until RGDEV-205 resolves this, the default is Option C (first touch wins).


class ProfileAttributionToken(BaseModel):
    provider = models.ForeignKey(
        CareProvider,
        on_delete=models.CASCADE,
        related_name='attribution_tokens',
        db_index=True,
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name='attribution_tokens',
        db_index=True,
    )
    source = models.CharField(
        max_length=20,
        choices=AttributionSource.choices,
        default=AttributionSource.PROFILE,
    )
    status = models.CharField(
        max_length=20,
        choices=AttributionStatus.choices,
        default=AttributionStatus.PENDING,
    )
    expires_at = models.DateTimeField()
    first_booking_at = models.DateTimeField(null=True, blank=True)
    first_session_discount_applied = models.BooleanField(default=False)
    referer = models.URLField(max_length=2000, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'client'],
                condition=models.Q(status__in=['pending', 'confirmed']),
                name='unique_active_attribution_token',
            ),
        ]
        indexes = [
            models.Index(fields=['provider', 'client', 'status']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f"Attribution({self.provider_id} -> {self.client_id}, {self.status})"

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at

    @property
    def is_active_window(self):
        """True when the attribution window is still valid (pending or confirmed, not expired)."""
        return self.status in (AttributionStatus.PENDING, AttributionStatus.CONFIRMED) and not self.is_expired


class ProviderClientFeeOverride(BaseModel):
    provider = models.ForeignKey(
        CareProvider,
        on_delete=models.CASCADE,
        related_name='fee_overrides',
        db_index=True,
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name='fee_overrides',
        db_index=True,
    )
    fee_percent = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        help_text='Reduced telehealth fee for this provider-client pair (e.g. 0.1200)',
    )
    source = models.CharField(
        max_length=20,
        choices=AttributionSource.choices,
        default=AttributionSource.PROFILE,
    )
    original_fee_percent = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal('0.1500'),
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'client'],
                name='unique_fee_override_per_pair',
            ),
        ]
        indexes = [
            models.Index(fields=['provider', 'client']),
        ]

    def __str__(self):
        return f"FeeOverride({self.provider_id} -> {self.client_id}, {self.fee_percent})"
```

**Changes from current:**
1. Renamed `is_active` property to `is_active_window`; now considers CONFIRMED status too
2. Added partial `UniqueConstraint` on ProfileAttributionToken `(provider, client)` for active tokens only
3. Modernized ProviderClientFeeOverride from `unique_together` to `UniqueConstraint`
4. Added conflict resolution comments above ProfileAttributionToken

---

### File 3: `apps/attribution/utils.py`

**Reason:** Fix `get_telehealth_fee` (is_active filter, .filter().first()); fix `get_checkout_discount` (double-discount, atomic, CONFIRMED status, DB expiry filter); add `create_attribution_token`.

**Complete new content:**

```python
import logging
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import (
    ProviderClientFeeOverride,
    ProfileAttributionToken,
    AttributionSource,
    AttributionStatus,
)

logger = logging.getLogger(__name__)

# Standard fee as fallback
STANDARD_FEE = Decimal('0.1500')
STANDARD_LABEL = 'standard'
ATTRIBUTED_LABEL = 'attributed'

# Default attribution window (days) if not configured in settings
DEFAULT_ATTRIBUTION_WINDOW_DAYS = 60


def get_telehealth_fee(provider, client):
    """
    Returns (fee_percent, fee_tier_label) for TELEHEALTH sessions only.

    Checks for an active ProviderClientFeeOverride first; falls back to the
    standard platform fee. Returns the standard rate on any error so billing
    never breaks.

    WARNING -- CALLER MUST CHECK MODALITY:
        This function MUST NOT be called for in-person sessions.
        In-person sessions always use settings.IN_PERSON_PLATFORM_FEE_PERCENT (5%).
        Callers must gate on session format before calling this function:

            if appointment.format and appointment.format.name == "IN PERSON":
                fee = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            else:
                fee, label = get_telehealth_fee(provider, client)
    """
    try:
        override = ProviderClientFeeOverride.objects.filter(
            provider=provider,
            client=client,
            is_active=True,
        ).first()
        if override:
            return (override.fee_percent, ATTRIBUTED_LABEL)
        standard = Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')
        return (standard, STANDARD_LABEL)
    except Exception:
        logger.exception(
            "Error fetching telehealth fee override for provider=%s client=%s",
            provider, client,
        )
        return (STANDARD_FEE, STANDARD_LABEL)


def get_checkout_discount(provider, client):
    """
    Returns (discount_percent_as_decimal, is_first_attributed_session).

    Returns (None, False) when:
    - no active attribution token exists
    - token is expired
    - first-session discount was already applied
    - provider has not configured a first-session discount

    Uses select_for_update() inside transaction.atomic() to prevent
    concurrent checkouts from applying the discount twice.
    """
    try:
        with transaction.atomic():
            token = (
                ProfileAttributionToken.objects
                .select_for_update()
                .filter(
                    provider=provider,
                    client=client,
                    status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
                    expires_at__gt=timezone.now(),
                )
                .order_by('-created_at')
                .first()
            )

            if token is None:
                return (None, False)

            # Prevent double-discount
            if token.first_session_discount_applied:
                return (None, False)

            discount_int = getattr(provider, 'attribution_discount_percent', None)
            if not discount_int:
                return (None, False)

            discount_decimal = Decimal(discount_int) / Decimal('100')

            # Atomically mark discount as applied
            token.first_session_discount_applied = True
            token.first_booking_at = token.first_booking_at or timezone.now()
            token.save(update_fields=[
                'first_session_discount_applied',
                'first_booking_at',
                'modified_at',
            ])

            return (discount_decimal, True)

    except Exception:
        logger.exception(
            "Error computing checkout discount for provider=%s client=%s",
            provider, client,
        )
        return (None, False)


def create_attribution_token(provider, client, source=None, referer=None):
    """
    Create or retrieve an active attribution token for a provider-client pair.

    Uses settings.ATTRIBUTION_WINDOW_DAYS to compute expires_at.
    Returns (token, created) tuple.

    If an active (pending/confirmed, non-expired) token already exists for the
    pair, its expiry window is extended and the existing token is returned.
    A new token is only created when no active token exists.

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

**Changes from current:**
1. `get_telehealth_fee`: switched from `.get()` to `.filter(is_active=True).first()`; added in-person modality docstring warning
2. `get_checkout_discount`: complete rewrite — queries PENDING+CONFIRMED; filters `expires_at__gt=now()` in DB; returns `(None, False)` when `first_session_discount_applied=True`; wraps in `transaction.atomic()` + `select_for_update()`; atomically marks discount as applied
3. Added `create_attribution_token()` using `ATTRIBUTION_WINDOW_DAYS`
4. Added imports: `timedelta`, `transaction`, `timezone`, `AttributionSource`

---

### File 4: `apps/attribution/admin.py`

**Reason:** Harden readonly fields to prevent staff from modifying financial/attribution data; disable delete on fee overrides.

**Complete new content:**

```python
from django.contrib import admin

from .models import ProfileAttributionToken, ProviderClientFeeOverride


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


@admin.register(ProviderClientFeeOverride)
class ProviderClientFeeOverrideAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'provider', 'client', 'fee_percent', 'source',
        'original_fee_percent', 'created_at',
    ]
    list_filter = ['source']
    search_fields = [
        'provider__user__email',
        'client__user__email',
    ]
    readonly_fields = [
        'provider', 'client',
        'fee_percent', 'source', 'original_fee_percent',
        'created_at', 'modified_at',
    ]

    def has_delete_permission(self, request, obj=None):
        return False
```

**Changes from current:**
1. ProfileAttributionTokenAdmin: `readonly_fields` now includes `first_session_discount_applied`, `expires_at`, `first_booking_at`, `provider`, `client`, `source`
2. ProviderClientFeeOverrideAdmin: `readonly_fields` now includes `provider` and `client`
3. ProviderClientFeeOverrideAdmin: `has_delete_permission` returns `False`

---

### File 5: `apps/attribution/tests/test_models.py`

**Reason:** Update existing tests for renamed property; add comprehensive test coverage for all fixes.

**Complete new content:**

```python
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.authentication.models import User
from apps.care_provider.models import CareProvider
from apps.client.models import Client
from apps.attribution.models import (
    ProfileAttributionToken,
    ProviderClientFeeOverride,
    AttributionSource,
    AttributionStatus,
)
from apps.attribution.utils import (
    get_telehealth_fee,
    get_checkout_discount,
    create_attribution_token,
)


class AttributionTestMixin:
    """Shared setup for attribution tests."""

    def _create_user(self, email, user_type):
        return User.objects.create_user(
            email=email,
            password='testpass123',
            user_type=user_type,
        )

    def _create_provider(self):
        user = self._create_user('provider@test.com', 'care_provider')
        return CareProvider.objects.create(user=user)

    def _create_client(self):
        user = self._create_user('client@test.com', 'client')
        return Client.objects.create(user=user)

    def setUp(self):
        self.provider = self._create_provider()
        self.client_obj = self._create_client()


# ---------------------------------------------------------------------------
# Model property tests
# ---------------------------------------------------------------------------

class ProfileAttributionTokenTests(AttributionTestMixin, TestCase):

    def test_is_expired_returns_true_when_past(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            expires_at=timezone.now() - timedelta(days=1),
        )
        self.assertTrue(token.is_expired)

    def test_is_expired_returns_false_when_future(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertFalse(token.is_expired)


class ProfileAttributionTokenPropertyTests(AttributionTestMixin, TestCase):

    def test_is_active_window_true_when_pending_and_not_expired(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertTrue(token.is_active_window)

    def test_is_active_window_true_when_confirmed_and_not_expired(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.CONFIRMED,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertTrue(token.is_active_window)

    def test_is_active_window_false_when_expired_status(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.EXPIRED,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertFalse(token.is_active_window)

    def test_is_active_window_false_when_ineligible(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.INELIGIBLE,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertFalse(token.is_active_window)

    def test_is_active_window_false_when_pending_but_past_expiry(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() - timedelta(days=1),
        )
        self.assertFalse(token.is_active_window)

    def test_base_model_is_active_field_not_shadowed(self):
        """Verify BaseModel.is_active BooleanField is accessible and independent."""
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.EXPIRED,
            expires_at=timezone.now() - timedelta(days=1),
        )
        # BaseModel.is_active field should default to True and be queryable via ORM
        self.assertTrue(
            ProfileAttributionToken.objects.filter(pk=token.pk, is_active=True).exists()
        )


# ---------------------------------------------------------------------------
# Unique constraint tests
# ---------------------------------------------------------------------------

class ProviderClientFeeOverrideTests(AttributionTestMixin, TestCase):

    def test_unique_together_raises_integrity_error(self):
        ProviderClientFeeOverride.objects.create(
            provider=self.provider,
            client=self.client_obj,
            fee_percent=Decimal('0.1200'),
        )
        with self.assertRaises(IntegrityError):
            ProviderClientFeeOverride.objects.create(
                provider=self.provider,
                client=self.client_obj,
                fee_percent=Decimal('0.1000'),
            )


class ProfileAttributionTokenUniqueConstraintTests(AttributionTestMixin, TestCase):

    def test_duplicate_active_tokens_raises_integrity_error(self):
        ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() + timedelta(days=30),
        )
        with self.assertRaises(IntegrityError):
            ProfileAttributionToken.objects.create(
                provider=self.provider,
                client=self.client_obj,
                status=AttributionStatus.CONFIRMED,
                expires_at=timezone.now() + timedelta(days=30),
            )

    def test_expired_token_allows_new_active_token(self):
        ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.EXPIRED,
            expires_at=timezone.now() - timedelta(days=1),
        )
        # Should not raise -- expired tokens are excluded from the partial unique constraint
        token2 = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.assertIsNotNone(token2.pk)


# ---------------------------------------------------------------------------
# get_telehealth_fee tests
# ---------------------------------------------------------------------------

class GetTelehealthFeeTests(AttributionTestMixin, TestCase):

    @override_settings(OTHER_PLATFORM_FEE_PERCENT='0.15')
    def test_returns_standard_rate_when_no_override(self):
        fee, label = get_telehealth_fee(self.provider, self.client_obj)
        self.assertEqual(fee, Decimal('0.15'))
        self.assertEqual(label, 'standard')

    def test_returns_override_rate_when_override_exists(self):
        ProviderClientFeeOverride.objects.create(
            provider=self.provider,
            client=self.client_obj,
            fee_percent=Decimal('0.1200'),
        )
        fee, label = get_telehealth_fee(self.provider, self.client_obj)
        self.assertEqual(fee, Decimal('0.1200'))
        self.assertEqual(label, 'attributed')

    @patch('apps.attribution.utils.ProviderClientFeeOverride.objects')
    def test_returns_standard_rate_on_db_exception(self, mock_objects):
        mock_objects.filter.side_effect = Exception('DB connection error')
        fee, label = get_telehealth_fee(self.provider, self.client_obj)
        self.assertEqual(fee, Decimal('0.1500'))
        self.assertEqual(label, 'standard')

    def test_deactivated_override_returns_standard_fee(self):
        override = ProviderClientFeeOverride.objects.create(
            provider=self.provider,
            client=self.client_obj,
            fee_percent=Decimal('0.1200'),
        )
        override.is_active = False
        override.save()

        fee, label = get_telehealth_fee(self.provider, self.client_obj)
        self.assertEqual(label, 'standard')

    def test_docstring_warns_against_in_person_usage(self):
        """Verify the docstring includes the in-person modality warning."""
        self.assertIn('MUST NOT be called for in-person', get_telehealth_fee.__doc__)


# ---------------------------------------------------------------------------
# get_checkout_discount tests
# ---------------------------------------------------------------------------

class GetCheckoutDiscountTests(AttributionTestMixin, TestCase):

    def test_returns_none_when_no_token(self):
        discount, is_first = get_checkout_discount(self.provider, self.client_obj)
        self.assertIsNone(discount)
        self.assertFalse(is_first)

    def test_returns_discount_when_token_and_provider_discount(self):
        ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.provider.attribution_discount_percent = 10
        self.provider.save()

        discount, is_first = get_checkout_discount(self.provider, self.client_obj)
        self.assertEqual(discount, Decimal('0.10'))
        self.assertTrue(is_first)

    def test_returns_none_when_token_expired(self):
        ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() - timedelta(days=1),
        )
        self.provider.attribution_discount_percent = 10
        self.provider.save()

        discount, is_first = get_checkout_discount(self.provider, self.client_obj)
        self.assertIsNone(discount)
        self.assertFalse(is_first)

    def test_returns_none_when_no_provider_discount(self):
        ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() + timedelta(days=30),
        )
        discount, is_first = get_checkout_discount(self.provider, self.client_obj)
        self.assertIsNone(discount)
        self.assertFalse(is_first)


class ConfirmedTokenCheckoutTests(AttributionTestMixin, TestCase):

    def test_confirmed_token_returns_discount(self):
        ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.CONFIRMED,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.provider.attribution_discount_percent = 15
        self.provider.save()

        discount, is_first = get_checkout_discount(self.provider, self.client_obj)
        self.assertEqual(discount, Decimal('0.15'))
        self.assertTrue(is_first)


class DoubleDiscountPreventionTests(AttributionTestMixin, TestCase):

    def test_returns_none_when_discount_already_applied(self):
        ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.CONFIRMED,
            expires_at=timezone.now() + timedelta(days=30),
            first_session_discount_applied=True,
        )
        self.provider.attribution_discount_percent = 10
        self.provider.save()

        discount, is_first = get_checkout_discount(self.provider, self.client_obj)
        self.assertIsNone(discount)
        self.assertFalse(is_first)

    def test_discount_sets_flag_atomically(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.CONFIRMED,
            expires_at=timezone.now() + timedelta(days=30),
        )
        self.provider.attribution_discount_percent = 10
        self.provider.save()

        discount, is_first = get_checkout_discount(self.provider, self.client_obj)
        self.assertEqual(discount, Decimal('0.10'))
        self.assertTrue(is_first)

        # After applying, the flag should be set
        token.refresh_from_db()
        self.assertTrue(token.first_session_discount_applied)
        self.assertIsNotNone(token.first_booking_at)

        # Second call should return None
        discount2, is_first2 = get_checkout_discount(self.provider, self.client_obj)
        self.assertIsNone(discount2)
        self.assertFalse(is_first2)


# ---------------------------------------------------------------------------
# create_attribution_token tests
# ---------------------------------------------------------------------------

class CreateAttributionTokenTests(AttributionTestMixin, TestCase):

    def test_creates_token_with_default_expiry(self):
        token, created = create_attribution_token(self.provider, self.client_obj)
        self.assertTrue(created)
        self.assertEqual(token.source, AttributionSource.PROFILE)
        self.assertEqual(token.status, AttributionStatus.PENDING)
        expected_min = timezone.now() + timedelta(days=59)
        expected_max = timezone.now() + timedelta(days=61)
        self.assertTrue(expected_min < token.expires_at < expected_max)

    @override_settings(ATTRIBUTION_WINDOW_DAYS=30)
    def test_creates_token_with_custom_window(self):
        token, created = create_attribution_token(self.provider, self.client_obj)
        expected_min = timezone.now() + timedelta(days=29)
        expected_max = timezone.now() + timedelta(days=31)
        self.assertTrue(expected_min < token.expires_at < expected_max)

    def test_creates_token_with_booking_link_source(self):
        token, created = create_attribution_token(
            self.provider, self.client_obj,
            source=AttributionSource.BOOKING_LINK,
            referer='https://example.com/booking/dr-smith',
        )
        self.assertTrue(created)
        self.assertEqual(token.source, AttributionSource.BOOKING_LINK)
        self.assertEqual(token.referer, 'https://example.com/booking/dr-smith')

    def test_existing_active_token_extends_expiry(self):
        """Second call for same pair extends expiry instead of creating duplicate."""
        token1, created1 = create_attribution_token(self.provider, self.client_obj)
        self.assertTrue(created1)

        # Simulate re-visit -- should return existing, not create
        token2, created2 = create_attribution_token(
            self.provider, self.client_obj,
            source=AttributionSource.BOOKING_LINK,
        )
        self.assertFalse(created2)
        self.assertEqual(token1.pk, token2.pk)
        # Source should NOT change (first touch wins)
        token2.refresh_from_db()
        self.assertEqual(token2.source, AttributionSource.PROFILE)

    def test_different_providers_create_separate_tokens(self):
        """A client can have tokens for multiple providers."""
        provider2_user = User.objects.create_user(
            email='provider2@test.com', password='testpass123', user_type='care_provider',
        )
        provider2 = CareProvider.objects.create(user=provider2_user)

        token1, _ = create_attribution_token(self.provider, self.client_obj)
        token2, _ = create_attribution_token(provider2, self.client_obj)

        self.assertNotEqual(token1.pk, token2.pk)
        self.assertEqual(
            ProfileAttributionToken.objects.filter(client=self.client_obj).count(), 2
        )


# ---------------------------------------------------------------------------
# Settings type safety tests
# ---------------------------------------------------------------------------

class SettingsTypeSafetyTests(TestCase):

    def test_attributed_telehealth_fee_is_decimal(self):
        from django.conf import settings
        self.assertIsInstance(settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT, Decimal)

    def test_attribution_window_days_is_int(self):
        from django.conf import settings
        self.assertIsInstance(settings.ATTRIBUTION_WINDOW_DAYS, int)


# ---------------------------------------------------------------------------
# Management command tests
# ---------------------------------------------------------------------------

class ExpireAttributionTokensCommandTests(AttributionTestMixin, TestCase):

    def test_expires_past_due_tokens(self):
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
        self.assertIn('Expired 1', out.getvalue())

    def test_does_not_expire_future_tokens(self):
        token = ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() + timedelta(days=30),
        )

        out = StringIO()
        call_command('expire_attribution_tokens', stdout=out)

        token.refresh_from_db()
        self.assertEqual(token.status, AttributionStatus.PENDING)

    def test_dry_run_does_not_modify(self):
        ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            status=AttributionStatus.PENDING,
            expires_at=timezone.now() - timedelta(days=1),
        )

        out = StringIO()
        call_command('expire_attribution_tokens', '--dry-run', stdout=out)

        self.assertIn('DRY RUN', out.getvalue())
        token = ProfileAttributionToken.objects.get(
            provider=self.provider, client=self.client_obj,
        )
        self.assertEqual(token.status, AttributionStatus.PENDING)
```

**Changes from current:**
1. Removed `test_is_active_returns_false_when_confirmed` and `test_is_active_returns_true_when_pending_and_not_expired` (replaced by `ProfileAttributionTokenPropertyTests`)
2. Updated mock target in `test_returns_standard_rate_on_db_exception` from `.get` to `.filter` (matches new code)
3. Added 20 new test methods across 7 new test classes
4. Added imports for `call_command`, `StringIO`, `create_attribution_token`, `AttributionSource`

---

## New Files to Create

### File 6: `apps/attribution/management/__init__.py`

```python
```

(empty file)

### File 7: `apps/attribution/management/commands/__init__.py`

```python
```

(empty file)

### File 8: `apps/attribution/management/commands/expire_attribution_tokens.py`

```python
"""
Management command to bulk-expire attribution tokens past their expires_at.

Usage:
    python manage.py expire_attribution_tokens
    python manage.py expire_attribution_tokens --dry-run

Schedule via cron or APScheduler (daily).
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.attribution.models import ProfileAttributionToken, AttributionStatus


class Command(BaseCommand):
    help = 'Expire attribution tokens that are past their expires_at datetime.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report count without updating.',
        )

    def handle(self, *args, **options):
        now = timezone.now()
        qs = ProfileAttributionToken.objects.filter(
            status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
            expires_at__lte=now,
        )
        count = qs.count()

        if options['dry_run']:
            self.stdout.write(f'[DRY RUN] {count} tokens would be expired.')
            return

        updated = qs.update(status=AttributionStatus.EXPIRED)
        self.stdout.write(self.style.SUCCESS(f'Expired {updated} attribution tokens.'))
```

---

## Migrations Required

### Migration: `apps/attribution/migrations/0002_attribution_constraints.py`

**Must be auto-generated** via `python manage.py makemigrations attribution` after applying model changes. It will contain:

1. **Data cleanup (RunPython):** Deduplicate active tokens — keep newest per `(provider, client)` pair, expire the rest. This runs BEFORE the constraint is added.

2. **AddConstraint:** `unique_active_attribution_token` — partial unique on `(provider, client)` WHERE `status IN ('pending', 'confirmed')` on `ProfileAttributionToken`.

3. **RemoveConstraint/AddConstraint:** Replace `unique_together` with `UniqueConstraint` named `unique_fee_override_per_pair` on `ProviderClientFeeOverride`.

**Pre-migration data cleanup script** (run in `manage.py shell` if data exists before migration):

```python
from django.db.models import Count
from apps.attribution.models import ProfileAttributionToken, AttributionStatus

dupes = (
    ProfileAttributionToken.objects
    .filter(status__in=['pending', 'confirmed'])
    .values('provider', 'client')
    .annotate(cnt=Count('id'))
    .filter(cnt__gt=1)
)
for d in dupes:
    tokens = ProfileAttributionToken.objects.filter(
        provider_id=d['provider'],
        client_id=d['client'],
        status__in=['pending', 'confirmed'],
    ).order_by('-created_at')
    for token in tokens[1:]:
        token.status = AttributionStatus.EXPIRED
        token.save(update_fields=['status', 'modified_at'])
```

---

## Implementation Order

| Step | Action | Files |
|------|--------|-------|
| 1 | Add `from decimal import Decimal` import to settings.py | `lumy_global/settings.py` |
| 2 | Cast `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` to Decimal | `lumy_global/settings.py` |
| 3 | Apply model changes (rename property, add constraint, modernize Meta) | `apps/attribution/models.py` |
| 4 | Run `python manage.py makemigrations attribution` | generates `0002_*.py` |
| 5 | Run pre-migration data cleanup if any dev data exists | shell script |
| 6 | Run `python manage.py migrate` | applies `0002` |
| 7 | Create management command dirs + file | `apps/attribution/management/...` |
| 8 | Rewrite utils.py | `apps/attribution/utils.py` |
| 9 | Harden admin.py | `apps/attribution/admin.py` |
| 10 | Update and add tests | `apps/attribution/tests/test_models.py` |
| 11 | Run `python manage.py test apps.attribution` | verify all pass |

---

## Complete Summary of All Fixes

| # | Fix | Source | File(s) | Severity |
|---|-----|--------|---------|----------|
| 1 | Rename `is_active` -> `is_active_window`, include CONFIRMED | Plan A Fix 1 | `models.py` | Critical |
| 2 | Add `is_active=True` filter + `.filter().first()` on fee lookup | Plan A Fix 2 | `utils.py` | Critical |
| 3 | Return `(None, False)` when `first_session_discount_applied=True` | Plan A Fix 3 | `utils.py` | Critical |
| 4 | Wrap checkout discount in `transaction.atomic()` + `select_for_update()` | Plan A Fix 4 | `utils.py` | Critical |
| 5 | Query CONFIRMED tokens in checkout discount | Plan A Fix 5 | `utils.py` | Critical |
| 6 | Filter `expires_at__gt=now()` in DB query | Plan A Fix 6 | `utils.py` | Critical |
| 7 | Cast `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` to `Decimal` | Plan A Fix 7 | `settings.py` | Critical |
| 8 | Add partial `UniqueConstraint` on ProfileAttributionToken | Plan A Fix 8 + Plan B Fix 4 (merged) | `models.py`, migration | Critical |
| 9 | Modernize ProviderClientFeeOverride to `UniqueConstraint` | Plan A Fix 8 | `models.py`, migration | Cleanup |
| 10 | Create `create_attribution_token()` using `ATTRIBUTION_WINDOW_DAYS` | Plan A Fix 9 + Plan B Fix 3 (merged) | `utils.py` | High |
| 11 | Create `expire_attribution_tokens` management command | Plan A Fix 10 | New file | High |
| 12 | Harden admin readonly fields + disable delete | Plan A Fix 11 | `admin.py` | High |
| 13 | Add in-person modality warning docstring | Plan B Fix 2 | `utils.py` | Medium |
| 14 | Add conflict resolution comments | Plan B Fix 5 | `models.py`, `utils.py` | Documentation |
| 15 | Add 20 new tests covering all gaps | Plan A Fix 12 + Plan B tests (merged) | `tests/test_models.py` | High |
| 16 | Update existing tests for renamed property | Plan A Fix 13 | `tests/test_models.py` | Cleanup |

---

## Out of Scope (deferred)

| Item | Ticket |
|------|--------|
| PayPal flow attribution awareness | RGDEV-184 |
| First-session discount UI (provider configuration) | RGDEV-186 |
| INELIGIBLE fraud guardrail triggers | RGDEV-183+ |
| Cancellation handler (reset discount on cancel) | RGDEV-185+ |
| `fee_rate` / `applied_fee_percent` stored on Appointment | RGDEV-184+ |
| Booking link vs profile source conflict resolution | RGDEV-205 |
| Attribution endpoint rate limiting | RGDEV-183 |
| In-person modality gate in booking_link/views.py | RGDEV-183 (caller-side, not data model) |
| Fee validators (MinValue/MaxValue on fee_percent) | RGDEV-183+ |
