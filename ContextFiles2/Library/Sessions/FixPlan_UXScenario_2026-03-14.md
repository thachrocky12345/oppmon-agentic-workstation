# Fix Plan: RGDEV-204 Booking Link — UX/Scenario Audit Findings

**Date:** 2026-03-14
**Branch:** `RGDEV-204/booking-link-core`
**Source:** `Audit_BookingLink_UXScenario_Results_2026-03-14.md`

---

## Scope Exclusions

The following audit findings are **out of scope** for RGDEV-204 and are NOT addressed here:

| Finding | Reason |
|---|---|
| 9.2 — Appointment model booking_link FK | RGDEV-205 scope |
| 9.3 — `record_booking()` method | RGDEV-205/206 scope |
| 8.1 / 9.1 — `fee_tier` in `/resolve/` response | RGDEV-205 scope (attribution tracking) |
| 10.1 — Migration missing | **Stale finding** — `0001_initial.py` already exists and is applied |

---

## Fix 1 — [CRITICAL] Signal fires on CareProvider.post_save but handle changes happen on User.save()

**Finding:** 1.1, 8.3
**Root cause:** The GraphQL mutation `CreateCareProviderMutation` (in `apps/authentication/mutations.py` lines 454-461, 519-526) sets `user_obj.profile_handle = profile_handle` then calls `user_obj.save()`. This saves the **User** model only. The signal in `signals.py` listens to `post_save` on `CareProvider`, which is never triggered by a handle change.

**Fix:** Add a second signal receiver on `User` post_save. The existing `CareProvider` signal stays for initial creation; the new `User` signal handles subsequent handle changes via GraphQL.

**File:** `apps/booking_link/signals.py`

**Change:**

```python
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _connect_signals():
    """Import and connect signals. Called from apps.py ready()."""
    from apps.authentication.models import User
    from apps.care_provider.models import CareProvider
    from .models import BookingLink, SlugRedirect

    def _get_provider_slug(care_provider):
        """Get the profile slug for a provider. Inline to avoid circular import from views."""
        user = care_provider.user
        if hasattr(user, 'profile_handle') and user.profile_handle:
            return user.profile_handle
        from django.utils.text import slugify
        return slugify(user.email.split('@')[0]) or str(user.pk)

    def _sync_slug(care_provider):
        """Core slug sync logic shared by both signal handlers."""
        try:
            bl = care_provider.booking_link
        except BookingLink.DoesNotExist:
            return

        new_slug = _get_provider_slug(care_provider)
        if not new_slug or bl.slug_snapshot == new_slug:
            return

        old_slug = bl.slug_snapshot
        try:
            SlugRedirect.objects.get_or_create(
                old_slug=old_slug, defaults={'booking_link': bl}
            )
            bl.slug_snapshot = new_slug
            bl.save(update_fields=['slug_snapshot', 'modified_at'])
            logger.info(
                "BookingLink slug updated: %s -> %s (provider=%s)",
                old_slug, new_slug, care_provider.pk
            )
        except Exception as exc:
            logger.error("Failed to sync booking link slug: %s", exc)

    @receiver(post_save, sender=CareProvider)
    def sync_booking_link_slug(sender, instance, **kwargs):
        """When a CareProvider is saved, sync slug if handle differs."""
        _sync_slug(instance)

    @receiver(post_save, sender=User)
    def sync_booking_link_slug_on_user_save(sender, instance, **kwargs):
        """When a User is saved (e.g. profile_handle change via GraphQL), sync slug."""
        try:
            cp = instance.care_provider
        except CareProvider.DoesNotExist:
            return
        _sync_slug(cp)
```

**Why this works:**
- When `CreateCareProviderMutation` calls `user_obj.save()` after setting `profile_handle`, the `User` post_save signal fires.
- The handler looks up the user's `CareProvider` via the reverse relation. If no provider exists (client user), it returns immediately.
- The shared `_sync_slug()` logic detects if `slug_snapshot` diverges from the current `profile_handle` and updates it, creating a `SlugRedirect` for the old value.
- The `CareProvider` post_save signal remains for the initial creation path.

**Additional changes in this fix:**
1. `_get_provider_slug()` is inlined in `_connect_signals()` to break the circular import from `views.py` (also fixes finding **10.3**).
2. `SlugRedirect.objects.get_or_create` is changed to match on `old_slug` only with `defaults={'booking_link': bl}` (fixes finding **1.2**).

**Migration needed:** No
**Test additions:**

```python
class UserSaveSignalTests(TestCase):
    """Signal: sync_booking_link_slug on User post_save (the critical fix)."""

    def setUp(self):
        self.user, self.cp = _create_provider_user()
        self.bl = BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )

    def test_user_save_with_new_handle_updates_slug(self):
        """Simulates the GraphQL mutation path: user.profile_handle change + user.save()."""
        self.user.profile_handle = 'new-handle'
        self.user.save()

        self.bl.refresh_from_db()
        self.assertEqual(self.bl.slug_snapshot, 'new-handle')
        self.assertTrue(
            SlugRedirect.objects.filter(old_slug='dr-jane-doe', booking_link=self.bl).exists()
        )

    def test_user_save_no_handle_change_is_noop(self):
        self.user.first_name = 'Updated'
        self.user.save()

        self.bl.refresh_from_db()
        self.assertEqual(self.bl.slug_snapshot, 'dr-jane-doe')
        self.assertEqual(SlugRedirect.objects.count(), 0)

    def test_user_save_client_user_is_noop(self):
        """Client users (no CareProvider) should not trigger signal errors."""
        client_user = User.objects.create_user(
            email='client@test.com', password='testpass123', user_type='CLIENT'
        )
        client_user.first_name = 'ClientName'
        client_user.save()  # Should not raise

    def test_handle_cycle_a_b_a_creates_redirects(self):
        """Provider changes handle A->B->A. Both redirects should exist."""
        self.user.profile_handle = 'handle-b'
        self.user.save()
        self.user.profile_handle = 'dr-jane-doe'
        self.user.save()

        self.bl.refresh_from_db()
        self.assertEqual(self.bl.slug_snapshot, 'dr-jane-doe')
        self.assertTrue(SlugRedirect.objects.filter(old_slug='handle-b').exists())
        # 'dr-jane-doe' was also recorded as old_slug when switching to 'handle-b'
        self.assertTrue(SlugRedirect.objects.filter(old_slug='dr-jane-doe').exists())
```

**Update existing test:** The existing `SlugRedirectSignalTests.test_signal_creates_redirect_on_handle_change` test currently does `user.save()` then `cp.save()` and only expects the signal to fire on `cp.save()`. After this fix, the signal fires on `user.save()` too. The test should be updated to verify the user-save path is sufficient:

```python
def test_signal_creates_redirect_on_handle_change(self):
    self.user.profile_handle = 'new-handle'
    self.user.save()
    # No need to save CareProvider — User post_save is sufficient

    self.bl.refresh_from_db()
    self.assertEqual(self.bl.slug_snapshot, 'new-handle')
    self.assertTrue(
        SlugRedirect.objects.filter(old_slug='dr-jane-doe', booking_link=self.bl).exists()
    )
```

---

## Fix 2 — [HIGH] No rate limiting on /track-click/

**Finding:** 4.1
**Root cause:** The endpoint has `permission_classes = [AllowAny]` and no throttle. No global DRF throttle is configured in `settings.py`.

**File:** `apps/booking_link/views.py`

**Change:** Add a throttle class to `BookingLinkTrackClickView`.

```python
# At top of views.py, add import:
from rest_framework.throttling import AnonRateThrottle

# New class before BookingLinkTrackClickView:
class BookingLinkClickThrottle(AnonRateThrottle):
    rate = '60/hour'

# Modify BookingLinkTrackClickView:
class BookingLinkTrackClickView(APIView):
    """POST /api/v1/booking-link/track-click/<pk>/ — Atomic click increment."""
    permission_classes = [AllowAny]
    throttle_classes = [BookingLinkClickThrottle]
    ...
```

**Why this works:** DRF per-view throttle classes work without any global `DEFAULT_THROTTLE_CLASSES` setting. The `AnonRateThrottle` uses the client IP as the cache key. 60/hour is generous for legitimate use but blocks naive scripted inflation.

**Migration needed:** No

**Test additions:**

```python
@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class BookingLinkTrackClickThrottleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user, self.cp = _create_provider_user()
        self.bl = BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )

    def test_track_click_throttled_after_limit(self):
        url = f'/api/v1/booking-link/track-click/{self.bl.pk}/'
        for _ in range(60):
            self.client.post(url)
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
```

---

## Fix 3 — [MEDIUM] og_title falls back to full email address (privacy leak)

**Finding:** 6.3
**Root cause:** `_build_og_meta()` line 48: `provider_name = f"{user.first_name} {user.last_name}".strip() or user.email`. The email fallback exposes PII in public OG tags.

**File:** `apps/booking_link/views.py`, line 48

**Change:**

```python
# Before:
provider_name = f"{user.first_name} {user.last_name}".strip() or user.email

# After:
provider_name = f"{user.first_name} {user.last_name}".strip() or "a provider"
```

**Why this works:** The OG title becomes "Book a session with a provider" instead of exposing the email. The email is still available internally via the User model but is not leaked into public metadata.

**Migration needed:** No

**Test additions:**

```python
def test_og_meta_no_name_does_not_expose_email(self):
    user, cp = _create_provider_user(
        email='secret@example.com', profile_handle='anon-doc'
    )
    user.first_name = ''
    user.last_name = ''
    user.save()
    bl = BookingLink.objects.create(
        care_provider=cp, slug_snapshot='anon-doc', is_active=True
    )
    resp = self.client.get('/api/v1/booking-link/og-meta/anon-doc/')
    self.assertNotIn('secret@example.com', resp.data['og_title'])
    self.assertIn('a provider', resp.data['og_title'])
```

---

## Fix 4 — [MEDIUM] Email fallback in slug not run through slugify()

**Finding:** 7.2
**Root cause:** `_get_provider_slug()` falls back to `user.email.split('@')[0]` which can contain dots, plus signs, and other characters invalid for a `<slug:slug>` URL pattern.

**File:** `apps/booking_link/views.py`, lines 16-22 (and the inlined copy in `signals.py` from Fix 1)

**Change:**

```python
# Before:
def _get_provider_slug(care_provider):
    user = care_provider.user
    if hasattr(user, 'profile_handle') and user.profile_handle:
        return user.profile_handle
    return user.email.split('@')[0]

# After:
from django.utils.text import slugify

def _get_provider_slug(care_provider):
    user = care_provider.user
    if hasattr(user, 'profile_handle') and user.profile_handle:
        return user.profile_handle
    return slugify(user.email.split('@')[0]) or str(user.pk)
```

**Why this works:** `slugify()` strips/converts non-slug characters (dots, plus signs). The `or str(user.pk)` fallback handles the edge case where the entire email prefix is stripped (e.g., `+++@example.com`).

**Migration needed:** No

**Test additions:**

```python
def test_generate_email_with_dots_produces_valid_slug(self):
    user, cp = _create_provider_user(
        email='jane.doe+tag@test.com', profile_handle=None
    )
    self.client.force_authenticate(user=user)
    resp = self.client.post(self.url)
    self.assertEqual(resp.status_code, status.HTTP_200_OK)
    slug = resp.data['slug_snapshot']
    # Should not contain dots or plus signs
    self.assertNotIn('.', slug)
    self.assertNotIn('+', slug)
    self.assertTrue(len(slug) > 0)
```

---

## Fix 5 — [MEDIUM] /generate/ reactivation refreshes slug without creating SlugRedirect

**Finding:** 10.5
**Root cause:** Lines 96-100 of `views.py`: when reactivating a deactivated link, `slug_snapshot` is overwritten with the current handle without recording the old value in `SlugRedirect`. QR codes or links using the old slug break.

**File:** `apps/booking_link/views.py`, lines 96-100

**Change:**

```python
# Before:
if not created and not bl.is_active:
    bl.is_active = True
    bl.slug_snapshot = slug
    bl.save(update_fields=['is_active', 'slug_snapshot', 'modified_at'])

# After:
if not created and not bl.is_active:
    bl.is_active = True
    if bl.slug_snapshot != slug:
        SlugRedirect.objects.get_or_create(
            old_slug=bl.slug_snapshot, defaults={'booking_link': bl}
        )
        bl.slug_snapshot = slug
    bl.save(update_fields=['is_active', 'slug_snapshot', 'modified_at'])
```

**Why this works:** Before overwriting `slug_snapshot`, we preserve the old value as a redirect. Uses `get_or_create` with `defaults` (matching Fix 1's pattern) to handle the case where the redirect already exists.

**Migration needed:** No

**Test additions:**

```python
def test_generate_reactivation_creates_redirect_for_old_slug(self):
    """Reactivation with a new handle should preserve the old slug as a redirect."""
    self.client.post(self.url)
    bl = BookingLink.objects.get(care_provider=self.cp)
    bl.is_active = False
    bl.save()

    # Change handle while link is deactivated
    self.user.profile_handle = 'new-handle'
    self.user.save()

    resp = self.client.post(self.url)
    self.assertEqual(resp.status_code, status.HTTP_200_OK)
    bl.refresh_from_db()
    self.assertEqual(bl.slug_snapshot, 'new-handle')
    self.assertTrue(bl.is_active)
    self.assertTrue(
        SlugRedirect.objects.filter(old_slug='dr-jane-doe', booking_link=bl).exists()
    )
```

---

## Fix 6 — [MEDIUM] Broad except Exception handlers mask real errors

**Finding:** 10.4
**Root cause:** Multiple views use bare `except Exception:` which catches DB errors, connection failures, and programming errors, returning misleading 404s.

**File:** `apps/booking_link/views.py`, lines 79, 115, 134, 189

**Changes (4 locations):**

```python
# Line 79 (BookingLinkGenerateView):
# Before: except Exception:
# After:
except AttributeError:

# Line 115 (BookingLinkMyView):
# Before: except Exception:
# After:
except (AttributeError, BookingLink.DoesNotExist):

# Line 134 (BookingLinkDeactivateView):
# Before: except Exception:
# After:
except (AttributeError, BookingLink.DoesNotExist):

# Line 189 (BookingLinkQrView):
# Before: except Exception:
# After:
except (BookingLink.DoesNotExist, AttributeError):
```

**Why `AttributeError`:** `request.user.care_provider` raises `AttributeError` when the user has no related `CareProvider` (the reverse OneToOneField accessor). `BookingLink.DoesNotExist` covers `cp.booking_link` access failures. This pattern lets real DB errors and programming bugs propagate as 500s with proper tracebacks.

**Migration needed:** No

**Test additions:** Existing tests already cover the 404 cases. No additional tests needed, but we should verify that the existing tests still pass (they will, since the specific exceptions are subsets of `Exception`).

---

## Fix 7 — [MEDIUM] Move `_get_provider_slug()` from views.py to utils.py

**Finding:** 10.3
**Root cause:** `signals.py` imports `_get_provider_slug` from `views.py`, creating tight coupling and circular-import risk. Also, the bare `except Exception` on signal line 35 swallows `ImportError`.

**File:** `apps/booking_link/utils.py` (add function), `apps/booking_link/views.py` (remove function, update import)

**Changes:**

1. **`utils.py`** — Add the function:

```python
from django.utils.text import slugify


def get_provider_slug(care_provider):
    """Get the profile slug for a provider. Falls back to slugified email prefix."""
    user = care_provider.user
    if hasattr(user, 'profile_handle') and user.profile_handle:
        return user.profile_handle
    return slugify(user.email.split('@')[0]) or str(user.pk)
```

2. **`views.py`** — Replace the local function with an import:

```python
# Remove _get_provider_slug function definition (lines 16-22)
# Add import:
from .utils import get_provider_slug
# Update all references from _get_provider_slug to get_provider_slug
```

3. **`signals.py`** — The inlined version from Fix 1 should also import from `utils.py` instead:

```python
from .utils import get_provider_slug
# Use get_provider_slug(care_provider) in _sync_slug()
```

4. **`signals.py`** — Narrow the exception handler (line 35):

```python
# Before:
except Exception as exc:

# After:
from django.db import IntegrityError
except IntegrityError as exc:
```

**Why this works:** `utils.py` has no imports from the booking_link app (only `qrcode`), so there is no circular dependency risk. The narrowed exception handler lets `ImportError`, `AttributeError`, and other programming errors propagate properly.

**Migration needed:** No
**Test additions:** None needed; existing tests exercise the function through the views.

---

## Fix 8 — [MEDIUM] Soft-deleted providers still resolve via booking link

**Finding:** 3.3
**Root cause:** `_resolve_slug()` and `_build_og_meta()` do not check whether the provider or user is deactivated. A banned/deactivated provider's booking link still resolves.

**File:** `apps/booking_link/views.py`, in `_build_og_meta()`

**Change:** Add provider-active check at the top of `_build_og_meta()`:

```python
def _build_og_meta(booking_link, redirect_to=None):
    """Build OG metadata dict for a booking link."""
    cp = booking_link.care_provider
    user = cp.user

    # Treat link as inactive if provider or user is deactivated
    if not getattr(cp, 'is_active', True) or not getattr(user, 'is_active', True):
        return {
            'booking_link_id': str(booking_link.id),
            'care_provider_id': cp.id,
            'provider_slug': booking_link.slug_snapshot,
            'is_active': False,
            'redirect_to': redirect_to,
            'og_title': 'Provider not found',
            'og_description': '',
            'og_image': None,
            'og_url': f'https://really.global/book/{booking_link.slug_snapshot}',
            'provider_name': None,
            'provider_photo_url': None,
        }

    # ... rest of existing logic
```

**Why this works:** Uses `getattr` with default `True` for safety. When a provider is soft-deleted (is_active=False on CareProvider or User), the booking link resolves to an "inactive" response, same shape as when the link itself is deactivated.

**Migration needed:** No

**Test additions:**

```python
def test_resolve_deactivated_provider_returns_inactive(self):
    """Soft-deleted provider's booking link should show as inactive."""
    self.cp.is_active = False
    self.cp.save()
    resp = self.client.get('/api/v1/booking-link/resolve/dr-jane-doe/')
    self.assertEqual(resp.status_code, status.HTTP_200_OK)
    self.assertFalse(resp.data['is_active'])
    self.assertEqual(resp.data['og_title'], 'Provider not found')

def test_resolve_deactivated_user_returns_inactive(self):
    """Deactivated user's booking link should show as inactive."""
    self.user.is_active = False
    self.user.save()
    resp = self.client.get('/api/v1/booking-link/resolve/dr-jane-doe/')
    self.assertEqual(resp.status_code, status.HTTP_200_OK)
    self.assertFalse(resp.data['is_active'])
```

---

## Fix 9 — [MEDIUM] ResolveBookingLinkSerializer is dead code

**Finding:** 10.2
**Root cause:** `ResolveBookingLinkSerializer` is defined in `serializers.py` but never imported or used by any view. The `/resolve/` and `/og-meta/` views return raw dicts from `_build_og_meta()`.

**File:** `apps/booking_link/serializers.py`

**Change:** Delete the `ResolveBookingLinkSerializer` class (lines 24-33). It is unused and its field list does not match the actual response shape (missing `provider_name`, `provider_photo_url`).

**Why:** Dead code creates confusion about the API contract. If serialization is needed later (for RGDEV-205), it should be built to match the actual response shape at that time.

**Migration needed:** No
**Test additions:** None.

---

## Implementation Order

| Order | Fix | Severity | Files Modified |
|---|---|---|---|
| 1 | Fix 7 — Move `_get_provider_slug` to utils.py | MEDIUM | `utils.py`, `views.py`, `signals.py` |
| 2 | Fix 4 — slugify email fallback | MEDIUM | `utils.py` (already moved) |
| 3 | Fix 1 — User post_save signal | CRITICAL | `signals.py` |
| 4 | Fix 5 — Reactivation creates SlugRedirect | MEDIUM | `views.py` |
| 5 | Fix 3 — og_title email privacy leak | MEDIUM | `views.py` |
| 6 | Fix 6 — Narrow exception handlers | MEDIUM | `views.py` |
| 7 | Fix 8 — Soft-deleted provider check | MEDIUM | `views.py` |
| 8 | Fix 2 — Rate limiting on /track-click/ | HIGH | `views.py` |
| 9 | Fix 9 — Remove dead serializer | MEDIUM | `serializers.py` |

**Rationale:** Fix 7 is first because Fixes 1 and 4 depend on the function being in `utils.py`. Fix 1 (the critical signal bug) comes next. The remaining fixes are independent and ordered by risk.

---

## Files Modified Summary

| File | Fixes Applied |
|---|---|
| `apps/booking_link/utils.py` | Fix 7 (add `get_provider_slug`), Fix 4 (slugify email) |
| `apps/booking_link/signals.py` | Fix 1 (User post_save signal), Fix 7 (import from utils), narrowed exception |
| `apps/booking_link/views.py` | Fix 3 (og_title), Fix 5 (reactivation redirect), Fix 6 (exceptions), Fix 7 (import), Fix 8 (soft-delete check), Fix 2 (throttle) |
| `apps/booking_link/serializers.py` | Fix 9 (remove dead code) |
| `apps/booking_link/tests.py` | All new test cases |

**Total new migrations:** 0
**Total new test cases:** ~10-12
