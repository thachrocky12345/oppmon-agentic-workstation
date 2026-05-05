# Fix Plan: Attribution Data Model (RGDEV-182)

**Date**: 2026-03-14
**Source audit**: `Audit_Attribution_DataModel_Results_2026-03-14.md`
**Branch**: `RGDEV-182/attribution-data-model`
**Files modified**: `models.py`, `utils.py`, `admin.py`, `tests/test_models.py`, `migrations/0002_*.py`, `management/commands/expire_attribution_tokens.py`, `lumy_global/settings.py`

---

## Fix 1: Rename `is_active` property to `is_active_window` (models.py)

**Audit finding**: `is_active` property on `ProfileAttributionToken` shadows `BaseModel.is_active` BooleanField. ORM `.filter(is_active=True)` queries the DB column, but `token.is_active` evaluates the property -- semantic collision.

**Additional fix**: The property should also consider `CONFIRMED` status as within the active window, not just `PENDING`.

**File**: `apps/attribution/models.py`

Replace:

```python
    @property
    def is_active(self):
        return self.status == AttributionStatus.PENDING and not self.is_expired
```

With:

```python
    @property
    def is_active_window(self):
        """True when the attribution window is still valid (pending or confirmed, not expired)."""
        return self.status in (AttributionStatus.PENDING, AttributionStatus.CONFIRMED) and not self.is_expired
```

---

## Fix 2: `get_telehealth_fee()` -- add `is_active=True` filter (utils.py)

**Audit finding**: Deactivated `ProviderClientFeeOverride` records (soft-deleted via `BaseModel.is_active=False`) are still returned.

**File**: `apps/attribution/utils.py`

Replace:

```python
    try:
        override = ProviderClientFeeOverride.objects.get(
            provider=provider,
            client=client,
        )
        return (override.fee_percent, ATTRIBUTED_LABEL)
    except ProviderClientFeeOverride.DoesNotExist:
        standard = Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')
        return (standard, STANDARD_LABEL)
    except Exception:
        logger.exception("Error fetching telehealth fee override for provider=%s client=%s", provider, client)
        return (STANDARD_FEE, STANDARD_LABEL)
```

With:

```python
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
        logger.exception("Error fetching telehealth fee override for provider=%s client=%s", provider, client)
        return (STANDARD_FEE, STANDARD_LABEL)
```

**Rationale**: Using `.filter().first()` instead of `.get()` is more defensive (handles duplicates gracefully) and naturally supports the `is_active=True` filter. The `DoesNotExist` branch merges into the `if override` check.

---

## Fix 3: `get_checkout_discount()` -- fix double-discount bug (utils.py)

**Audit finding**: Function returns `(discount_decimal, False)` when `first_session_discount_applied=True`. It should return `(None, False)` to prevent double-discount.

**File**: `apps/attribution/utils.py`

This fix is combined with fixes 4, 5, 6, and 7 below into a single rewrite of `get_checkout_discount()`.

---

## Fix 4: Add `transaction.atomic()` + `select_for_update()` (utils.py)

**Audit finding**: TOCTOU race condition -- concurrent checkouts can apply the discount multiple times.

---

## Fix 5: Query CONFIRMED tokens, not just PENDING (utils.py)

**Audit finding**: `get_checkout_discount()` only queries `status=PENDING` tokens. Per spec, `CONFIRMED` tokens should also trigger the discount.

---

## Fix 6: Filter `expires_at` in DB query (utils.py)

**Audit finding**: Expiry is checked post-fetch via `token.is_expired`. If the most recent token is expired, valid older tokens are silently skipped.

---

## Fixes 3-6 combined: Full rewrite of `get_checkout_discount()` (utils.py)

Replace the entire function:

```python
def get_checkout_discount(provider, client):
    """
    Returns (discount_percent_as_decimal, is_first_attributed_session).

    Returns (None, False) when no active attribution token exists or when the
    provider has not configured a first-session discount.
    """
    try:
        token = ProfileAttributionToken.objects.filter(
            provider=provider,
            client=client,
            status=AttributionStatus.PENDING,
        ).order_by('-created_at').first()

        if token is None or token.is_expired:
            return (None, False)

        discount_int = getattr(provider, 'attribution_discount_percent', None)
        if not discount_int:
            return (None, False)

        discount_decimal = Decimal(discount_int) / Decimal('100')
        is_first = not token.first_session_discount_applied
        return (discount_decimal, is_first)

    except Exception:
        logger.exception("Error computing checkout discount for provider=%s client=%s", provider, client)
        return (None, False)
```

With:

```python
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
    from django.db import transaction

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
            token.save(update_fields=['first_session_discount_applied', 'first_booking_at', 'modified_at'])

            return (discount_decimal, True)

    except Exception:
        logger.exception(
            "Error computing checkout discount for provider=%s client=%s",
            provider, client,
        )
        return (None, False)
```

**Required import** at top of `utils.py`:

```python
from django.utils import timezone
```

**Key changes**:
- Queries both `PENDING` and `CONFIRMED` tokens (fix 5)
- Filters `expires_at__gt=timezone.now()` in DB query (fix 6)
- Returns `(None, False)` when `first_session_discount_applied=True` (fix 3)
- Wraps in `transaction.atomic()` with `select_for_update()` (fix 4)
- Atomically sets `first_session_discount_applied=True` and `first_booking_at` (fix 4)
- Always returns `is_first=True` when discount is granted (since we gate on `first_session_discount_applied=False`)

---

## Fix 7: `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` as string (settings.py)

**Audit finding**: `env()` returns a string. Arithmetic with `Decimal('0.1500')` will fail or behave unexpectedly.

**File**: `lumy_global/settings.py`

Replace:

```python
ATTRIBUTED_TELEHEALTH_FEE_PERCENT = env('ATTRIBUTED_TELEHEALTH_FEE_PERCENT', default='0.12')
```

With:

```python
ATTRIBUTED_TELEHEALTH_FEE_PERCENT = Decimal(env('ATTRIBUTED_TELEHEALTH_FEE_PERCENT', default='0.12'))
```

**Required**: Ensure `from decimal import Decimal` is present at the top of `settings.py`. (Check existing imports; Django settings files often already import it for other fee constants.)

---

## Fix 8: Add `UniqueConstraint` on `ProfileAttributionToken(provider, client)` (models.py + new migration)

**Audit finding**: No uniqueness constraint prevents duplicate tokens for the same provider-client pair.

**File**: `apps/attribution/models.py`

Replace the `Meta` class on `ProfileAttributionToken`:

```python
    class Meta:
        indexes = [
            models.Index(fields=['provider', 'client', 'status']),
            models.Index(fields=['expires_at']),
        ]
```

With:

```python
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
```

**Rationale**: A partial unique constraint allows expired/ineligible tokens to exist as historical records while preventing two active tokens for the same pair. This is more correct than a blanket `unique_together` which would prevent re-attribution after expiry.

**Also update `ProviderClientFeeOverride`** to use the modern `constraints` syntax (WARN item):

Replace:

```python
    class Meta:
        unique_together = [('provider', 'client')]
        indexes = [
            models.Index(fields=['provider', 'client']),
        ]
```

With:

```python
    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['provider', 'client'], name='unique_fee_override_per_pair'),
        ]
        indexes = [
            models.Index(fields=['provider', 'client']),
        ]
```

**New migration required**: `0002_add_unique_active_attribution_token.py` (auto-generated via `makemigrations`).

---

## Fix 9: Create `create_attribution_token()` utility that uses `ATTRIBUTION_WINDOW_DAYS` (utils.py)

**Audit finding**: `ATTRIBUTION_WINDOW_DAYS` is defined in settings but never used. Token creators must manually compute `expires_at`.

**File**: `apps/attribution/utils.py`

Add new function:

```python
def create_attribution_token(provider, client, source=None, referer=None):
    """
    Create or retrieve an active attribution token for a provider-client pair.

    Uses settings.ATTRIBUTION_WINDOW_DAYS to compute expires_at.
    Returns (token, created) tuple.
    """
    from datetime import timedelta
    from .models import AttributionSource

    if source is None:
        source = AttributionSource.PROFILE

    expires_at = timezone.now() + timedelta(days=settings.ATTRIBUTION_WINDOW_DAYS)

    # Use get_or_create to respect the partial unique constraint.
    # If a pending/confirmed token already exists, return it.
    existing = ProfileAttributionToken.objects.filter(
        provider=provider,
        client=client,
        status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
    ).first()

    if existing:
        # Extend the window if the existing token hasn't expired yet
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

---

## Fix 10: Create management command `expire_attribution_tokens` (new file)

**Audit finding**: No expiry mechanism exists. Stale tokens remain in `pending`/`confirmed` status permanently.

**New file**: `apps/attribution/management/__init__.py` (empty)
**New file**: `apps/attribution/management/commands/__init__.py` (empty)
**New file**: `apps/attribution/management/commands/expire_attribution_tokens.py`

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

## Fix 11: Admin readonly field hardening (admin.py)

**Audit finding**: `first_session_discount_applied`, `expires_at` editable on `ProfileAttributionToken`; `provider`, `client` editable on `ProviderClientFeeOverride`.

**File**: `apps/attribution/admin.py`

Replace entire file:

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

**Changes**:
- `ProfileAttributionTokenAdmin.readonly_fields` now includes: `first_session_discount_applied`, `expires_at`, `first_booking_at`, `provider`, `client`, `source`
- `ProviderClientFeeOverrideAdmin.readonly_fields` now includes `provider` and `client`
- `has_delete_permission` returns `False` on `ProviderClientFeeOverride` (fee records are permanent)

---

## Fix 12: New tests for gap coverage (tests/test_models.py)

**Audit finding**: Missing tests for double-discount prevention, `is_active_window` with expired/ineligible, uniqueness constraint, and settings type safety.

Add the following test classes/methods to `apps/attribution/tests/test_models.py`:

### 12a. `is_active_window` property tests (replaces `is_active` tests)

```python
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
        # BaseModel.is_active field should default to True
        self.assertTrue(
            ProfileAttributionToken.objects.filter(pk=token.pk, is_active=True).exists()
        )
```

### 12b. Double-discount prevention test

```python
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
```

### 12c. Confirmed token checkout test

```python
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
```

### 12d. Unique constraint test for `ProfileAttributionToken`

```python
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
```

### 12e. Settings type safety test

```python
class SettingsTypeSafetyTests(TestCase):

    def test_attributed_telehealth_fee_is_decimal(self):
        from django.conf import settings
        self.assertIsInstance(settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT, Decimal)

    def test_attribution_window_days_is_int(self):
        from django.conf import settings
        self.assertIsInstance(settings.ATTRIBUTION_WINDOW_DAYS, int)
```

### 12f. Fee override `is_active` filter test

```python
class FeeOverrideActiveFilterTests(AttributionTestMixin, TestCase):

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
```

### 12g. Expire management command test

```python
class ExpireAttributionTokensCommandTests(AttributionTestMixin, TestCase):

    def test_expires_past_due_tokens(self):
        from django.core.management import call_command
        from io import StringIO

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
        from django.core.management import call_command
        from io import StringIO

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
```

---

## Fix 13: Update existing tests for renamed property

The existing tests reference `token.is_active` -- update to `token.is_active_window`:

In `test_models.py`, rename:
- `test_is_active_returns_false_when_confirmed` -> `test_is_active_window_returns_false_when_confirmed` and change assertion to `self.assertFalse(token.is_active_window)`
- `test_is_active_returns_true_when_pending_and_not_expired` -> `test_is_active_window_returns_true_when_pending_and_not_expired` and change assertion to `self.assertTrue(token.is_active_window)`

(These are replaced by the more comprehensive tests in Fix 12a.)

---

## Complete Corrected File: `utils.py`

For clarity, here is the full corrected `apps/attribution/utils.py`:

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


def get_telehealth_fee(provider, client):
    """
    Returns (fee_percent, fee_tier_label).

    Checks for an active ProviderClientFeeOverride first; falls back to the
    standard platform fee. Returns the standard rate on any error so billing
    never breaks.
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
    """
    if source is None:
        source = AttributionSource.PROFILE

    expires_at = timezone.now() + timedelta(days=settings.ATTRIBUTION_WINDOW_DAYS)

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

---

## New Migrations Needed

1. **`0002_add_unique_active_attribution_token.py`** -- generated via `python manage.py makemigrations attribution` after applying the model changes (Fix 8: partial `UniqueConstraint` on `ProfileAttributionToken`, modernize `ProviderClientFeeOverride` to `constraints`).

2. No data migration needed -- the constraint is partial (only `pending`/`confirmed` rows). If duplicate active tokens exist in dev data, they must be cleaned up before applying the migration:

```python
# Pre-migration data cleanup (run in manage.py shell):
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
    # Keep the newest, expire the rest
    for token in tokens[1:]:
        token.status = AttributionStatus.EXPIRED
        token.save(update_fields=['status', 'modified_at'])
```

---

## New Directories/Files Created

| Path | Type |
|---|---|
| `apps/attribution/management/__init__.py` | Empty init |
| `apps/attribution/management/commands/__init__.py` | Empty init |
| `apps/attribution/management/commands/expire_attribution_tokens.py` | Management command |
| `apps/attribution/migrations/0002_*.py` | Auto-generated migration |

---

## Summary of All Changes

| # | Fix | File(s) | Severity |
|---|---|---|---|
| 1 | Rename `is_active` -> `is_active_window` property | `models.py` | Critical |
| 2 | Add `is_active=True` filter + use `.filter().first()` | `utils.py` | Critical |
| 3 | Return `(None, False)` when `first_session_discount_applied=True` | `utils.py` | Critical |
| 4 | Wrap in `transaction.atomic()` + `select_for_update()` | `utils.py` | Critical |
| 5 | Query `CONFIRMED` tokens (not just `PENDING`) | `utils.py` | Critical |
| 6 | Filter `expires_at__gt=now()` in DB query | `utils.py` | Critical |
| 7 | Cast `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` to `Decimal` | `settings.py` | Critical |
| 8 | Add partial `UniqueConstraint` on `ProfileAttributionToken` | `models.py`, migration | Critical |
| 9 | Create `create_attribution_token()` using `ATTRIBUTION_WINDOW_DAYS` | `utils.py` | High |
| 10 | Create `expire_attribution_tokens` management command | New file | High |
| 11 | Harden admin readonly fields + disable delete | `admin.py` | High |
| 12 | Add 13 new tests covering all gaps | `tests/test_models.py` | High |
| 13 | Update existing tests for renamed property | `tests/test_models.py` | Cleanup |

---

## Execution Order

1. Apply model changes (fixes 1, 8)
2. Apply settings fix (fix 7)
3. Run `makemigrations` to generate `0002`
4. Apply utils rewrite (fixes 2, 3, 4, 5, 6, 9)
5. Create management command (fix 10)
6. Apply admin hardening (fix 11)
7. Update and add tests (fixes 12, 13)
8. Run `python manage.py test apps.attribution` to verify
9. Run pre-migration data cleanup if needed
10. Run `python manage.py migrate` to apply
