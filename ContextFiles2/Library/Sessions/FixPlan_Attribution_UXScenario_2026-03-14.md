# Fix Plan: Attribution UX/Scenario Audit — RGDEV-182

**Date:** 2026-03-14
**Source:** `Audit_Attribution_UXScenario_Results_2026-03-14.md`
**Branch:** `RGDEV-182/attribution-data-model`
**Scope:** `apps/attribution/models.py`, `apps/attribution/utils.py`, `apps/attribution/admin.py`, `apps/attribution/tests/`

---

## Audit vs Actual Code: Reconciliation Note

The audit report was based on an earlier commit (`82d2238` in the RGDEV-205 worktree) which had a simpler design. The **current** code on `RGDEV-182/attribution-data-model` (`ff4001d`) already contains:

- `ProviderClientFeeOverride` model with `unique_together = [('provider', 'client')]`
- `AttributionStatus` enum with `PENDING`, `CONFIRMED`, `EXPIRED`, `INELIGIBLE`
- `ProfileAttributionToken.status` field
- `ProfileAttributionToken.first_session_discount_applied` field
- `get_telehealth_fee()` already has a broad `except Exception` catch (line 32-34)

Several audit findings are **already resolved** in the current code. The fixes below address the remaining gaps.

---

## Deferred (Out of Scope for RGDEV-182)

| Item | Deferred To |
|------|-------------|
| PayPal flow attribution | RGDEV-184 |
| First-session discount mechanism | RGDEV-186 |
| INELIGIBLE status fraud guardrail | RGDEV-183+ |
| Cancellation handler | RGDEV-185+ |
| Fee stored on Appointment model | RGDEV-184+ |
| Booking link vs profile conflict resolution | RGDEV-205 |
| Attribution endpoint rate limiting | RGDEV-183 |

---

## Fix 1: BUG — `get_telehealth_fee()` exception logging lacks `exc_info=True`

**Status in current code:** The broad `except Exception` catch exists (line 32-34), but uses `logger.exception()` which implicitly includes `exc_info=True`. **This is already correct.**

**Verification:** `logger.exception()` in Python always logs the traceback. No change needed.

**Verdict: NO FIX REQUIRED** — already implemented correctly.

---

## Fix 2: BUG — In-person sessions could receive attribution discounts

**Current state:** `get_telehealth_fee()` accepts `(provider, client)` and returns the fee override regardless of session modality. If a caller passes an in-person session, they'd get an attribution discount (e.g., 12%) instead of the hard 5%.

**Decision: Add a docstring guard + `ValueError` raise, NOT a modality parameter.**

**Rationale:** Adding a `modality` parameter to `get_telehealth_fee()` would require every existing caller to pass modality and would couple the fee engine to the session model. The safer approach is:
1. The function name already says "telehealth" — it should never be called for in-person.
2. Add an explicit docstring warning.
3. Callers are responsible for checking modality before calling (they already know the modality from the booking/appointment context).
4. This matches the existing pattern throughout the codebase where callers check `appointment.format.name == "IN PERSON"` before choosing the fee path (see `calendar_functionality/views.py`, `stripe_integration/views.py`, `cron.py`).

### Corrected code — `apps/attribution/utils.py`

```python
def get_telehealth_fee(provider, client):
    """
    Returns (fee_percent, fee_tier_label) for TELEHEALTH sessions only.

    Checks for a ProviderClientFeeOverride first; falls back to the standard
    platform fee. Returns the standard rate on any error so billing never breaks.

    WARNING — CALLER MUST CHECK MODALITY:
        This function MUST NOT be called for in-person sessions.
        In-person sessions always use settings.IN_PERSON_PLATFORM_FEE_PERCENT (5%).
        Callers must gate on session format before calling this function:

            if appointment.format and appointment.format.name == "IN PERSON":
                fee = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
            else:
                fee, label = get_telehealth_fee(provider, client)
    """
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

### Test — `apps/attribution/tests/test_models.py`

Add to `GetTelehealthFeeTests`:

```python
def test_docstring_warns_against_in_person_usage(self):
    """Verify the docstring includes the in-person modality warning."""
    self.assertIn('MUST NOT be called for in-person', get_telehealth_fee.__doc__)
```

---

## Fix 3: GAP — `create_attribution_token()` helper is missing

**Current state:** No centralized function exists for creating `ProfileAttributionToken` instances. Callers would need to manually compute `expires_at`, risking inconsistent expiry windows.

**Fix:** Add a `create_attribution_token()` utility to `apps/attribution/utils.py` that encapsulates the expiry calculation.

### New code — append to `apps/attribution/utils.py`

```python
from datetime import timedelta

# Default attribution window (days) if not configured in settings
DEFAULT_ATTRIBUTION_WINDOW_DAYS = 60


def create_attribution_token(provider, client, source=None, referer=None):
    """
    Creates or updates a ProfileAttributionToken for the given provider-client pair.

    Uses update_or_create so that a re-visit refreshes the expiry window and
    potentially upgrades the source (e.g., profile -> booking_link).

    The expiry window is controlled by settings.ATTRIBUTION_WINDOW_DAYS
    (default: 60 days).

    Returns (token, created) tuple.
    """
    from apps.attribution.models import AttributionSource

    if source is None:
        source = AttributionSource.PROFILE

    window_days = getattr(settings, 'ATTRIBUTION_WINDOW_DAYS', DEFAULT_ATTRIBUTION_WINDOW_DAYS)
    expires_at = timezone.now() + timedelta(days=window_days)

    token, created = ProfileAttributionToken.objects.update_or_create(
        provider=provider,
        client=client,
        defaults={
            'source': source,
            'expires_at': expires_at,
            'status': AttributionStatus.PENDING,
            'referer': referer,
        },
    )
    return (token, created)
```

**Required import additions** at the top of `utils.py`:

```python
from datetime import timedelta
from django.utils import timezone
```

### Test — `apps/attribution/tests/test_models.py`

Add a new test class:

```python
from apps.attribution.utils import create_attribution_token
from apps.attribution.models import AttributionSource


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

    def test_update_or_create_refreshes_expiry(self):
        """Second call for same pair updates expiry instead of creating duplicate."""
        token1, created1 = create_attribution_token(self.provider, self.client_obj)
        self.assertTrue(created1)

        # Simulate re-visit — should update, not create
        token2, created2 = create_attribution_token(
            self.provider, self.client_obj,
            source=AttributionSource.BOOKING_LINK,
        )
        self.assertFalse(created2)
        self.assertEqual(token1.pk, token2.pk)
        self.assertEqual(token2.source, AttributionSource.BOOKING_LINK)

    def test_different_providers_create_separate_tokens(self):
        """A client can have tokens for multiple providers."""
        provider2_user = User.objects.create_user(
            email='provider2@test.com', password='testpass123', user_type='care_provider',
        )
        provider2 = CareProvider.objects.create(user=provider2_user)

        token1, _ = create_attribution_token(self.provider, self.client_obj)
        token2, _ = create_attribution_token(provider2, self.client_obj)

        self.assertNotEqual(token1.pk, token2.pk)
        self.assertEqual(ProfileAttributionToken.objects.filter(client=self.client_obj).count(), 2)
```

---

## Fix 4: GAP — No token uniqueness per provider-client on `ProfileAttributionToken`

**Current state:** `ProfileAttributionToken` has compound indexes on `(provider, client, status)` and `(expires_at)` but **no unique constraint** on `(provider, client)`. The `unique_together` constraint only exists on `ProviderClientFeeOverride`.

This means multiple `ProfileAttributionToken` rows can exist for the same provider-client pair, which `get_checkout_discount()` handles via `.order_by('-created_at').first()` — a soft dedup. But this is fragile: it accumulates stale rows and makes reasoning about token state harder.

**Fix:** Add a `UniqueConstraint` on `(provider, client)` to `ProfileAttributionToken.Meta`. This pairs with Fix 3's `update_or_create` to guarantee exactly one token per pair.

### Corrected code — `apps/attribution/models.py`

Replace the `ProfileAttributionToken.Meta` class:

```python
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['provider', 'client'],
                name='unique_attribution_per_provider_client',
            ),
        ]
        indexes = [
            models.Index(fields=['provider', 'client', 'status']),
            models.Index(fields=['expires_at']),
        ]
```

**Migration required:** A new migration will be generated. If duplicate `(provider, client)` rows already exist in any environment, they must be deduplicated before the migration can apply. Add a `RunPython` data migration step that keeps the most recent token per pair and deletes the rest.

### Data migration — `apps/attribution/migrations/0002_unique_token_per_pair.py`

```python
from django.db import migrations, models


def deduplicate_tokens(apps, schema_editor):
    """Keep the most recent token per (provider, client) pair, delete the rest."""
    Token = apps.get_model('attribution', 'ProfileAttributionToken')
    from django.db.models import Max

    # Find pairs with duplicates
    dupes = (
        Token.objects.values('provider_id', 'client_id')
        .annotate(max_id=Max('id'), cnt=models.Count('id'))
        .filter(cnt__gt=1)
    )
    for dupe in dupes:
        Token.objects.filter(
            provider_id=dupe['provider_id'],
            client_id=dupe['client_id'],
        ).exclude(id=dupe['max_id']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('attribution', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(deduplicate_tokens, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='profileattributiontoken',
            constraint=models.UniqueConstraint(
                fields=['provider', 'client'],
                name='unique_attribution_per_provider_client',
            ),
        ),
    ]
```

### Test — add to `ProfileAttributionTokenTests`

```python
def test_unique_constraint_prevents_duplicate_pair(self):
    """Only one token per (provider, client) pair is allowed."""
    ProfileAttributionToken.objects.create(
        provider=self.provider,
        client=self.client_obj,
        expires_at=timezone.now() + timedelta(days=30),
    )
    with self.assertRaises(IntegrityError):
        ProfileAttributionToken.objects.create(
            provider=self.provider,
            client=self.client_obj,
            expires_at=timezone.now() + timedelta(days=60),
        )
```

---

## Fix 5: AMBIGUOUS — Booking link vs profile conflict resolution guidance

**Current state:** No documentation exists explaining how conflicts between booking-link and profile attribution should be resolved when both exist for the same provider-client pair.

**Decision:** Add code comments documenting the intended resolution rule so that the RGDEV-205 implementer has clear guidance. The rule (per business logic): **booking-link attribution wins because it has the lower fee (10% < 12%)**, and `update_or_create` naturally upgrades PROFILE to BOOKING_LINK on re-visit.

### Code comment — `apps/attribution/models.py`

Add above `ProfileAttributionToken` class:

```python
# ATTRIBUTION SOURCE CONFLICT RESOLUTION (see RGDEV-205 for full implementation):
#
# When a client visits a provider's profile AND later clicks their booking link
# (or vice versa), only one ProfileAttributionToken exists per pair (enforced by
# unique_attribution_per_provider_client constraint). The `source` field records
# the most recent attribution touchpoint.
#
# Current behavior (via update_or_create in create_attribution_token):
#   - The LAST attribution event wins: source is overwritten, expiry is refreshed.
#   - A booking_link visit after a profile visit UPGRADES the source (10% < 12%).
#   - A profile visit after a booking_link visit DOWNGRADES the source (12% > 10%).
#
# Product decision needed (RGDEV-205):
#   Option A: "Last touch wins" — current behavior, simplest.
#   Option B: "Lowest fee wins" — only upgrade, never downgrade.
#             Requires: if existing.source == BOOKING_LINK, skip update.
#   Option C: "First touch wins" — never overwrite once created.
#             Requires: use get_or_create instead of update_or_create.
#   Option D: Add a `priority` field to AttributionSource for explicit ordering.
#
# Until RGDEV-205 resolves this, the default is Option A (last touch wins).
```

### Code comment — `apps/attribution/utils.py`

Add inside `create_attribution_token()` docstring:

```python
    Note on source conflict resolution:
        Currently uses "last touch wins" — if a client already has a PROFILE
        token and visits via booking link, the source is overwritten to
        BOOKING_LINK (lowering the fee from 12% to 10%). This may or may not
        be the desired behavior. See RGDEV-205 for the product decision on
        conflict resolution (lowest-fee-wins vs first-touch-wins vs
        explicit priority).
```

---

## Summary of All Changes

| Fix | File | Change Type | Lines Changed |
|-----|------|-------------|---------------|
| Fix 2 | `apps/attribution/utils.py` | Docstring expansion on `get_telehealth_fee()` | ~10 lines added |
| Fix 3 | `apps/attribution/utils.py` | New `create_attribution_token()` function + imports | ~35 lines added |
| Fix 4 | `apps/attribution/models.py` | Replace `indexes` with `constraints` + `indexes` in `ProfileAttributionToken.Meta` | ~8 lines changed |
| Fix 4 | `apps/attribution/migrations/0002_*.py` | New data + schema migration | ~30 lines (new file) |
| Fix 5 | `apps/attribution/models.py` | Block comment above `ProfileAttributionToken` | ~15 lines added |
| Fix 5 | `apps/attribution/utils.py` | Docstring addition in `create_attribution_token()` | ~7 lines added |
| Tests | `apps/attribution/tests/test_models.py` | 7 new test methods across 2 new + 1 existing test class | ~70 lines added |

**Total:** ~175 lines added/changed across 4 files (1 new migration file).

---

## Implementation Order

1. **Fix 4** first — add the `UniqueConstraint` + dedup migration (model change must land before `create_attribution_token` relies on `update_or_create` safety)
2. **Fix 5** — add conflict resolution comments to `models.py` (while editing the same file)
3. **Fix 3** — add `create_attribution_token()` utility (depends on Fix 4's constraint)
4. **Fix 2** — expand `get_telehealth_fee()` docstring (independent, can be done anytime)
5. **Tests** — add all new test methods last (they validate Fixes 2-4)

---

## Acceptance Criteria

- [ ] `ProfileAttributionToken` has `UniqueConstraint` on `(provider, client)` enforced at DB level
- [ ] Migration includes deduplication step before adding constraint
- [ ] `create_attribution_token()` exists and uses `settings.ATTRIBUTION_WINDOW_DAYS` (default 60)
- [ ] `create_attribution_token()` uses `update_or_create` to handle re-visits
- [ ] `get_telehealth_fee()` docstring clearly warns against in-person usage
- [ ] Conflict resolution guidance for RGDEV-205 is documented in code comments
- [ ] All 7 new tests pass
- [ ] `python manage.py test apps.attribution` passes with zero failures
