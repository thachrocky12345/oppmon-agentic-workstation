# Fix Plan: RGDEV-204 Booking Link Data Model Audit Fixes

**Date**: 2026-03-14
**Source**: `Audit_BookingLink_DataModel_Results_2026-03-14.md`
**Scope**: CRITICAL (#1-#3), HIGH (#4-#7), quick-win MEDIUM (#12, #13, #21)
**Out of scope**: attribution tracking (RGDEV-205), booking_count increment (RGDEV-205/206), rate limiting (#11), response envelope (#8/#9/#10)

---

## Execution Order

The changes must be applied in this sequence to avoid breaking intermediate states:

1. **Phase 1 — Model changes** (findings #1, #2, #6, #16, #17) -> new migration
2. **Phase 2 — Signal fix** (findings #4, #5) -> no migration
3. **Phase 3 — View/serializer fixes** (findings #3, #7, #12, #21) -> no migration, URL change
4. **Phase 4 — Test fixes** (findings #13, #14, #15) + test updates for changed APIs

---

## Phase 1: Model Changes

**New migration required**: `0002_fix_slug_constraints_and_counters.py`

### Finding #1 — `slug_snapshot` must be `unique=True`

**File**: `apps/booking_link/models.py` line 20

**Before**:
```python
slug_snapshot = models.SlugField(max_length=255, db_index=True)
```

**After**:
```python
slug_snapshot = models.SlugField(max_length=255, unique=True)
```

Also add collision-avoidance in `_get_provider_slug()` (see Phase 3, Finding #21 combined).

### Finding #2 — `SlugRedirect.old_slug` scoped unique constraint

**File**: `apps/booking_link/models.py` lines 31-45

**Before**:
```python
class SlugRedirect(models.Model):
    """
    Records old slugs when a provider changes their profile handle,
    so old Booking Link URLs still resolve via the /resolve/ endpoint.
    """
    old_slug = models.SlugField(max_length=255, unique=True, db_index=True)
    booking_link = models.ForeignKey(
        BookingLink,
        on_delete=models.CASCADE,
        related_name='slug_redirects',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"SlugRedirect({self.old_slug} -> {self.booking_link_id})"
```

**After**:
```python
class SlugRedirect(models.Model):
    """
    Records old slugs when a provider changes their profile handle,
    so old Booking Link URLs still resolve via the /resolve/ endpoint.
    old_slug is globally unique to prevent ambiguous redirects — a given
    slug string can only ever redirect to one booking link.
    """
    old_slug = models.SlugField(max_length=255, unique=True)
    booking_link = models.ForeignKey(
        BookingLink,
        on_delete=models.CASCADE,
        related_name='slug_redirects',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['old_slug', 'booking_link'],
                name='unique_old_slug_per_booking_link',
            ),
        ]

    def __str__(self):
        return f"SlugRedirect({self.old_slug} -> {self.booking_link_id})"
```

**Design decision**: Keep `old_slug` globally unique (`unique=True`) because a slug can only meaningfully redirect to ONE provider. If Provider A had slug "dr-smith" and it is now a redirect, Provider B should never also generate a redirect FROM "dr-smith". The compound constraint is added as a belt-and-suspenders for the `get_or_create` call in signals. The `db_index=True` is removed (Finding #17) since `unique=True` implies an index.

Additionally, the signal (Phase 2) must validate that an `old_slug` value does not collide with any current `BookingLink.slug_snapshot` before creating the redirect.

### Finding #6 — Counter fields should be `PositiveBigIntegerField`

**File**: `apps/booking_link/models.py` lines 21-22

**Before**:
```python
click_count = models.IntegerField(default=0)
booking_count = models.IntegerField(default=0)
```

**After**:
```python
click_count = models.PositiveBigIntegerField(default=0)
booking_count = models.PositiveBigIntegerField(default=0)
```

### Finding #16 — Remove redundant `db_index=True` on `slug_snapshot`

Already handled in Finding #1 above: replacing `db_index=True` with `unique=True`.

### Finding #17 — Remove redundant `db_index=True` on `SlugRedirect.old_slug`

Already handled in Finding #2 above.

### Complete `models.py` after Phase 1

```python
import uuid

from django.db import models
from apps.authentication.models import BaseModel


class BookingLink(BaseModel):
    """
    One booking link per provider. Permanent, provider-scoped URL.
    BaseModel provides: created_at, modified_at, is_active.
    Uses UUID PK intentionally — these IDs appear in authenticated URLs
    (QR endpoint) and sequential IDs would be enumerable.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    care_provider = models.OneToOneField(
        'care_provider.CareProvider',
        on_delete=models.CASCADE,
        related_name='booking_link',
    )
    # Snapshot of provider's profile_handle at generation time.
    # Updated by post_save signal when handle changes.
    slug_snapshot = models.SlugField(max_length=255, unique=True)
    click_count = models.PositiveBigIntegerField(default=0)
    booking_count = models.PositiveBigIntegerField(default=0)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"BookingLink({self.id}) provider={self.care_provider_id} slug={self.slug_snapshot}"


class SlugRedirect(models.Model):
    """
    Records old slugs when a provider changes their profile handle,
    so old Booking Link URLs still resolve via the /resolve/ endpoint.
    old_slug is globally unique to prevent ambiguous redirects — a given
    slug string can only ever redirect to one booking link.
    """
    old_slug = models.SlugField(max_length=255, unique=True)
    booking_link = models.ForeignKey(
        BookingLink,
        on_delete=models.CASCADE,
        related_name='slug_redirects',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['old_slug', 'booking_link'],
                name='unique_old_slug_per_booking_link',
            ),
        ]

    def __str__(self):
        return f"SlugRedirect({self.old_slug} -> {self.booking_link_id})"
```

---

## Phase 2: Signal Fix

### Finding #4 — Handle `IntegrityError` explicitly, not bare `Exception`

### Finding #5 — Wrap in `transaction.atomic()` + `select_for_update()`

**File**: `apps/booking_link/signals.py`

**Complete replacement**:

```python
import logging
from django.db import IntegrityError, transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _connect_signals():
    """Import and connect signals. Called from apps.py ready()."""
    from apps.care_provider.models import CareProvider
    from .models import BookingLink, SlugRedirect
    from .views import _get_provider_slug

    @receiver(post_save, sender=CareProvider)
    def sync_booking_link_slug(sender, instance, **kwargs):
        """When a provider's profile handle changes, update slug_snapshot and record redirect."""
        try:
            bl = instance.booking_link
        except BookingLink.DoesNotExist:
            return

        new_slug = _get_provider_slug(instance)
        if not new_slug or bl.slug_snapshot == new_slug:
            return

        old_slug = bl.slug_snapshot
        try:
            with transaction.atomic():
                # Lock the BookingLink row to prevent concurrent slug updates
                bl = BookingLink.objects.select_for_update().get(pk=bl.pk)
                # Re-check after acquiring lock
                if bl.slug_snapshot == new_slug:
                    return

                # Verify new_slug does not collide with an existing redirect
                if SlugRedirect.objects.filter(old_slug=new_slug).exists():
                    logger.warning(
                        "Cannot update BookingLink slug to '%s' — collides with existing redirect (provider=%s)",
                        new_slug, instance.pk,
                    )
                    return

                old_slug = bl.slug_snapshot
                SlugRedirect.objects.get_or_create(
                    old_slug=old_slug,
                    defaults={'booking_link': bl},
                )
                bl.slug_snapshot = new_slug
                bl.save(update_fields=['slug_snapshot', 'modified_at'])
                logger.info(
                    "BookingLink slug updated: %s -> %s (provider=%s)",
                    old_slug, new_slug, instance.pk,
                )
        except IntegrityError as exc:
            logger.error(
                "IntegrityError syncing booking link slug for provider=%s: %s",
                instance.pk, exc,
            )
        except Exception as exc:
            logger.error(
                "Unexpected error syncing booking link slug for provider=%s: %s",
                instance.pk, exc,
            )
```

**Key changes**:
- Wrapped in `transaction.atomic()` + `select_for_update()` for race safety
- Re-check slug after lock acquisition
- Check that `new_slug` does not collide with an existing redirect before updating
- `get_or_create` uses `defaults` for `booking_link` so the unique constraint on `old_slug` is respected
- Catches `IntegrityError` specifically, then generic `Exception` as fallback with distinct log messages

---

## Phase 3: View/Serializer/URL Fixes

### Finding #3 — Remove `care_provider_id` from public responses

**File**: `apps/booking_link/views.py`, function `_build_og_meta()` (lines 44-68)

**Before**:
```python
def _build_og_meta(booking_link, redirect_to=None):
    """Build OG metadata dict for a booking link."""
    cp = booking_link.care_provider
    user = cp.user
    provider_name = f"{user.first_name} {user.last_name}".strip() or user.email
    slug = booking_link.slug_snapshot

    # Try to get profile photo
    photo_url = None
    if user.profile_pic:
        photo_url = user.profile_pic

    return {
        'booking_link_id': str(booking_link.id),
        'care_provider_id': cp.id,
        'provider_slug': slug,
        'is_active': booking_link.is_active,
        'redirect_to': redirect_to,
        'og_title': f"Book a session with {provider_name}",
        'og_description': f"Book a session with {provider_name} on Really Global.",
        'og_image': photo_url,
        'og_url': f"https://really.global/book/{slug}",
        'provider_name': provider_name,
        'provider_photo_url': photo_url,
    }
```

**After**:
```python
def _build_og_meta(booking_link, redirect_to=None):
    """Build OG metadata dict for a booking link."""
    cp = booking_link.care_provider
    user = cp.user
    provider_name = f"{user.first_name} {user.last_name}".strip() or user.email
    slug = booking_link.slug_snapshot

    # Try to get profile photo
    photo_url = None
    if user.profile_pic:
        photo_url = user.profile_pic

    return {
        'booking_link_id': str(booking_link.id),
        'provider_slug': slug,
        'is_active': booking_link.is_active,
        'redirect_to': redirect_to,
        'og_title': f"Book a session with {provider_name}",
        'og_description': f"Book a session with {provider_name} on Really Global.",
        'og_image': photo_url,
        'og_url': f"https://really.global/book/{slug}",
        'provider_name': provider_name,
        'provider_photo_url': photo_url,
    }
```

Also remove `care_provider_id` from the "not found" response in `BookingLinkResolveView.get()` (line 154):

**Before** (line 151-164):
```python
            return Response(
                {
                    'booking_link_id': None,
                    'care_provider_id': None,
                    'provider_slug': slug,
                    'is_active': False,
                    'redirect_to': None,
                    'og_title': 'Provider not found',
                    'og_description': '',
                    'og_image': None,
                    'og_url': f'https://really.global/book/{slug}',
                },
                status=status.HTTP_200_OK,
            )
```

**After**:
```python
            return Response(
                {
                    'booking_link_id': None,
                    'provider_slug': slug,
                    'is_active': False,
                    'redirect_to': None,
                    'og_title': 'Provider not found',
                    'og_description': '',
                    'og_image': None,
                    'og_url': f'https://really.global/book/{slug}',
                },
                status=status.HTTP_200_OK,
            )
```

### Finding #7 — `/track-click/` should use slug, not UUID PK

**File**: `apps/booking_link/urls.py` line 9

**Before**:
```python
path('track-click/<uuid:pk>/', views.BookingLinkTrackClickView.as_view(), name='booking-link-track-click'),
```

**After**:
```python
path('track-click/<slug:slug>/', views.BookingLinkTrackClickView.as_view(), name='booking-link-track-click'),
```

**File**: `apps/booking_link/views.py` lines 168-178

**Before**:
```python
class BookingLinkTrackClickView(APIView):
    """POST /api/v1/booking-link/track-click/<pk>/ — Atomic click increment."""
    permission_classes = [AllowAny]

    def post(self, request, pk):
        updated = BookingLink.objects.filter(pk=pk, is_active=True).update(
            click_count=F('click_count') + 1
        )
        if updated == 0:
            return Response({'detail': 'Not found or inactive.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Click recorded.'})
```

**After**:
```python
class BookingLinkTrackClickView(APIView):
    """POST /api/v1/booking-link/track-click/<slug>/ — Atomic click increment."""
    permission_classes = [AllowAny]

    def post(self, request, slug):
        updated = BookingLink.objects.filter(slug_snapshot=slug, is_active=True).update(
            click_count=F('click_count') + 1
        )
        if updated == 0:
            return Response({'detail': 'Not found or inactive.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Click recorded.'})
```

### Finding #12 — Use `ResolveBookingLinkSerializer` or remove it

**File**: `apps/booking_link/serializers.py` lines 24-33

Remove `care_provider_id` from the serializer (aligns with Finding #3) and add the missing fields:

**Before**:
```python
class ResolveBookingLinkSerializer(serializers.Serializer):
    booking_link_id = serializers.UUIDField()
    care_provider_id = serializers.IntegerField()
    provider_slug = serializers.CharField()
    is_active = serializers.BooleanField()
    redirect_to = serializers.CharField(allow_null=True)
    og_title = serializers.CharField()
    og_description = serializers.CharField()
    og_image = serializers.CharField(allow_null=True)
    og_url = serializers.CharField()
```

**After**:
```python
class ResolveBookingLinkSerializer(serializers.Serializer):
    booking_link_id = serializers.UUIDField(allow_null=True)
    provider_slug = serializers.CharField()
    is_active = serializers.BooleanField()
    redirect_to = serializers.CharField(allow_null=True)
    og_title = serializers.CharField()
    og_description = serializers.CharField(allow_blank=True)
    og_image = serializers.CharField(allow_null=True)
    og_url = serializers.CharField()
    provider_name = serializers.CharField(required=False)
    provider_photo_url = serializers.CharField(allow_null=True, required=False)
```

Then use it in the views. In `views.py`, update `BookingLinkResolveView` and `BookingLinkOgMetaView` to serialize through `ResolveBookingLinkSerializer`:

**File**: `apps/booking_link/views.py` line 10

**Before**:
```python
from .serializers import BookingLinkSerializer
```

**After**:
```python
from .serializers import BookingLinkSerializer, ResolveBookingLinkSerializer
```

**File**: `apps/booking_link/views.py`, `BookingLinkResolveView.get()` line 165

**Before**:
```python
        return Response(_build_og_meta(bl, redirect_to))
```

**After**:
```python
        data = _build_og_meta(bl, redirect_to)
        serializer = ResolveBookingLinkSerializer(data)
        return Response(serializer.data)
```

**File**: `apps/booking_link/views.py`, `BookingLinkOgMetaView.get()` line 215

**Before**:
```python
        return Response(_build_og_meta(bl, redirect_to))
```

**After**:
```python
        data = _build_og_meta(bl, redirect_to)
        serializer = ResolveBookingLinkSerializer(data)
        return Response(serializer.data)
```

### Finding #21 — Slugify the email fallback

**File**: `apps/booking_link/views.py` lines 16-22

**Before**:
```python
def _get_provider_slug(care_provider):
    """Get the profile slug for a provider. Falls back to user email prefix."""
    user = care_provider.user
    if hasattr(user, 'profile_handle') and user.profile_handle:
        return user.profile_handle
    # Fallback: generate from email
    return user.email.split('@')[0]
```

**After**:
```python
from django.utils.text import slugify

def _get_provider_slug(care_provider):
    """Get the profile slug for a provider. Falls back to slugified email prefix."""
    user = care_provider.user
    if hasattr(user, 'profile_handle') and user.profile_handle:
        return user.profile_handle
    # Fallback: generate from email, slugified for URL safety
    return slugify(user.email.split('@')[0])
```

Also add slug collision avoidance (Finding #1 complement). When generating a slug for a new BookingLink, ensure uniqueness:

**File**: `apps/booking_link/views.py`, add helper after `_get_provider_slug`:

```python
def _ensure_unique_slug(base_slug, exclude_pk=None):
    """Append a numeric suffix if base_slug collides with an existing BookingLink or SlugRedirect."""
    candidate = base_slug
    counter = 1
    while True:
        qs = BookingLink.objects.filter(slug_snapshot=candidate)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if not qs.exists() and not SlugRedirect.objects.filter(old_slug=candidate).exists():
            return candidate
        counter += 1
        candidate = f"{base_slug}-{counter}"
```

Then use it in `BookingLinkGenerateView.post()`:

**Before** (lines 85-94):
```python
        slug = _get_provider_slug(cp)
        if not slug:
            return Response(
                {'error': 'Complete your profile before generating a Booking Link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bl, created = BookingLink.objects.get_or_create(
            care_provider=cp,
            defaults={'slug_snapshot': slug, 'is_active': True},
        )
```

**After**:
```python
        slug = _get_provider_slug(cp)
        if not slug:
            return Response(
                {'error': 'Complete your profile before generating a Booking Link.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if this provider already has a BookingLink
        try:
            bl = BookingLink.objects.get(care_provider=cp)
            created = False
        except BookingLink.DoesNotExist:
            unique_slug = _ensure_unique_slug(slug)
            bl = BookingLink.objects.create(
                care_provider=cp,
                slug_snapshot=unique_slug,
                is_active=True,
            )
            created = True
```

And update the reactivation block similarly:

**Before** (lines 96-100):
```python
        if not created and not bl.is_active:
            # Reactivate
            bl.is_active = True
            bl.slug_snapshot = slug  # Refresh slug in case it changed
            bl.save(update_fields=['is_active', 'slug_snapshot', 'modified_at'])
```

**After**:
```python
        if not created and not bl.is_active:
            # Reactivate
            bl.is_active = True
            bl.slug_snapshot = _ensure_unique_slug(slug, exclude_pk=bl.pk)
            bl.save(update_fields=['is_active', 'slug_snapshot', 'modified_at'])
```

---

## Phase 4: Test Updates

### Finding #13 — Use `IntegrityError` instead of bare `Exception`

**File**: `apps/booking_link/tests.py` lines 300-307

**Before**:
```python
    def test_slug_redirect_unique(self):
        user, cp = _create_provider_user()
        bl = BookingLink.objects.create(
            care_provider=cp, slug_snapshot='test-slug', is_active=True
        )
        SlugRedirect.objects.create(old_slug='unique-slug', booking_link=bl)
        with self.assertRaises(Exception):
            SlugRedirect.objects.create(old_slug='unique-slug', booking_link=bl)
```

**After**:
```python
    def test_slug_redirect_unique(self):
        from django.db import IntegrityError
        user, cp = _create_provider_user()
        bl = BookingLink.objects.create(
            care_provider=cp, slug_snapshot='test-slug', is_active=True
        )
        SlugRedirect.objects.create(old_slug='unique-slug', booking_link=bl)
        with self.assertRaises(IntegrityError):
            SlugRedirect.objects.create(old_slug='unique-slug', booking_link=bl)
```

### Finding #14 — Add test for OneToOneField enforcement

**File**: `apps/booking_link/tests.py`, add to `BookingLinkModelTests`:

```python
    def test_one_booking_link_per_provider(self):
        from django.db import IntegrityError
        user, cp = _create_provider_user()
        BookingLink.objects.create(
            care_provider=cp, slug_snapshot='slug-one', is_active=True
        )
        with self.assertRaises(IntegrityError):
            BookingLink.objects.create(
                care_provider=cp, slug_snapshot='slug-two', is_active=True
            )
```

### Finding #15 — Add test for provider with no profile pic

**File**: `apps/booking_link/tests.py`, add to `BookingLinkOgMetaTests`:

```python
    def test_og_meta_no_profile_pic(self):
        # Ensure user has no profile pic
        self.user.profile_pic = ''
        self.user.save()
        resp = self.client.get('/api/v1/booking-link/og-meta/dr-jane-doe/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data['og_image'])
```

### Update existing tests for removed `care_provider_id`

**File**: `apps/booking_link/tests.py`, `BookingLinkResolveTests.test_resolve_active_slug` line 145

**Before**:
```python
    def test_resolve_active_slug(self):
        resp = self.client.get('/api/v1/booking-link/resolve/dr-jane-doe/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['is_active'])
        self.assertIsNone(resp.data['redirect_to'])
        self.assertEqual(resp.data['care_provider_id'], self.cp.id)
```

**After**:
```python
    def test_resolve_active_slug(self):
        resp = self.client.get('/api/v1/booking-link/resolve/dr-jane-doe/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['is_active'])
        self.assertIsNone(resp.data['redirect_to'])
        self.assertNotIn('care_provider_id', resp.data)
```

### Update track-click tests for slug-based URL

**File**: `apps/booking_link/tests.py`, `BookingLinkTrackClickTests`

**Before** (lines 170-191):
```python
    def test_track_click_increments(self):
        resp = self.client.post(f'/api/v1/booking-link/track-click/{self.bl.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.bl.refresh_from_db()
        self.assertEqual(self.bl.click_count, 1)

    def test_track_click_multiple(self):
        for _ in range(3):
            self.client.post(f'/api/v1/booking-link/track-click/{self.bl.pk}/')
        self.bl.refresh_from_db()
        self.assertEqual(self.bl.click_count, 3)

    def test_track_click_inactive_returns_404(self):
        self.bl.is_active = False
        self.bl.save()
        resp = self.client.post(f'/api/v1/booking-link/track-click/{self.bl.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_track_click_missing_returns_404(self):
        fake_pk = uuid.uuid4()
        resp = self.client.post(f'/api/v1/booking-link/track-click/{fake_pk}/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
```

**After**:
```python
    def test_track_click_increments(self):
        resp = self.client.post('/api/v1/booking-link/track-click/dr-jane-doe/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.bl.refresh_from_db()
        self.assertEqual(self.bl.click_count, 1)

    def test_track_click_multiple(self):
        for _ in range(3):
            self.client.post('/api/v1/booking-link/track-click/dr-jane-doe/')
        self.bl.refresh_from_db()
        self.assertEqual(self.bl.click_count, 3)

    def test_track_click_inactive_returns_404(self):
        self.bl.is_active = False
        self.bl.save()
        resp = self.client.post('/api/v1/booking-link/track-click/dr-jane-doe/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_track_click_missing_returns_404(self):
        resp = self.client.post('/api/v1/booking-link/track-click/nonexistent-slug/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
```

### Add test for slug collision avoidance

**File**: `apps/booking_link/tests.py`, add to `BookingLinkGenerateTests`:

```python
    def test_generate_avoids_slug_collision(self):
        """Two providers with the same profile_handle get distinct slugs."""
        user2, cp2 = _create_provider_user(
            email='provider2@test.com', profile_handle='dr-jane-doe'
        )
        # First provider generates
        self.client.force_authenticate(user=self.user)
        resp1 = self.client.post(self.url)
        self.assertEqual(resp1.data['slug_snapshot'], 'dr-jane-doe')

        # Second provider with same handle generates
        self.client.force_authenticate(user=user2)
        resp2 = self.client.post(self.url)
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        self.assertNotEqual(resp2.data['slug_snapshot'], 'dr-jane-doe')
        self.assertTrue(resp2.data['slug_snapshot'].startswith('dr-jane-doe'))
```

---

## Migration File

After applying model changes, run:
```bash
python manage.py makemigrations booking_link --name fix_slug_constraints_and_counters
```

Expected migration operations:
1. `AlterField` on `BookingLink.slug_snapshot` — add `unique=True`, remove `db_index=True`
2. `AlterField` on `BookingLink.click_count` — change to `PositiveBigIntegerField`
3. `AlterField` on `BookingLink.booking_count` — change to `PositiveBigIntegerField`
4. `AlterField` on `SlugRedirect.old_slug` — remove `db_index=True` (keep `unique=True`)
5. `AddConstraint` on `SlugRedirect` — `unique_old_slug_per_booking_link`

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `apps/booking_link/models.py` | `slug_snapshot` unique, counter types, SlugRedirect constraint, docstrings |
| `apps/booking_link/signals.py` | `transaction.atomic`, `select_for_update`, typed exceptions, collision check |
| `apps/booking_link/views.py` | Remove `care_provider_id`, slugify fallback, `_ensure_unique_slug`, track-click by slug, use `ResolveBookingLinkSerializer` |
| `apps/booking_link/serializers.py` | Remove `care_provider_id` from `ResolveBookingLinkSerializer`, add missing fields |
| `apps/booking_link/urls.py` | `track-click/<slug:slug>/` |
| `apps/booking_link/tests.py` | `IntegrityError` assertions, OneToOne test, no-profile-pic test, slug-based track-click URLs, remove `care_provider_id` assertions, collision test |
| `apps/booking_link/migrations/0002_*.py` | Auto-generated |

---

## Verification Checklist

After applying all changes:

- [ ] `python manage.py makemigrations --check` shows no pending migrations
- [ ] `python manage.py migrate` succeeds
- [ ] `python manage.py test apps.booking_link` — all tests pass
- [ ] Manual: create two providers with same name, both generate booking links, slugs differ
- [ ] Manual: change provider handle, old slug redirects, new slug resolves
- [ ] Manual: `/resolve/` and `/og-meta/` responses do not contain `care_provider_id`
- [ ] Manual: `/track-click/<slug>/` works, `/track-click/<uuid>/` returns 404
