# Final Corrected Implementation Plan: RGDEV-204 BookingLink

**Date:** 2026-03-14
**Synthesized from:** FixPlan_DataModel + FixPlan_UXScenario + both Audit Results
**Branch:** `RGDEV-204/booking-link-core`

---

## Conflict Resolution Log

| Conflict | Plan A (DataModel) | Plan B (UXScenario) | Resolution |
|---|---|---|---|
| `ResolveBookingLinkSerializer` | Wire it into views, update fields | Delete it (dead code) | **Wire it in.** It provides response shape documentation and validation. Update to match actual response shape. Plan A is correct. |
| `_get_provider_slug` location | Keep in `views.py`, import from signals | Move to `utils.py` | **Move to `utils.py`.** Plan B is correct — eliminates circular import risk. Plan A's signal imports from views which is fragile. |
| `_get_provider_slug` in signals | Import from `views.py` | Inline in `_connect_signals()` then refactor to `utils.py` | **Import from `utils.py`.** Cleaner than inlining. Both plans converge here. |
| Signal exception handling | `IntegrityError` then generic `Exception` fallback | `IntegrityError` only | **`IntegrityError` then generic `Exception` fallback with distinct log messages.** Plan A is safer — unknown exceptions still get logged rather than crashing the signal. |
| `SlugRedirect` unique constraint | Keep `old_slug` globally unique + add compound constraint | Keep `old_slug` globally unique (no compound) | **Global unique + compound constraint.** Plan A's belt-and-suspenders approach is correct. The compound constraint costs nothing and protects the `get_or_create(old_slug=..., defaults={'booking_link': bl})` call. |
| `_build_og_meta` soft-delete check (UX Fix 8) | Not addressed | Add `is_active` check on provider/user | **Include it.** Plan B catches a real gap — banned providers should not resolve. |
| User post_save signal (UX Fix 1) | Not addressed | Add second signal on User model | **Include it.** This is the CRITICAL fix — handle changes via GraphQL save User, not CareProvider. Plan A's signal improvements are necessary but insufficient without this. |
| `transaction.atomic` + `select_for_update` (DM Fix 5) | Include in signal | Not included | **Include it.** Plan A's race-safety is important for production. Merge with Plan B's dual-signal approach. |
| `_ensure_unique_slug` collision avoidance (DM Finding 1/21) | Add helper + use in generate view | Not addressed | **Include it.** Required for `slug_snapshot unique=True` constraint to work without `IntegrityError` on generation. |
| Reactivation creates SlugRedirect (UX Fix 5) | Handled via `_ensure_unique_slug` in reactivation | Explicit `SlugRedirect.get_or_create` before overwrite | **Combine both.** Create redirect for old slug AND use `_ensure_unique_slug` for the new slug. |
| og_title email privacy leak (UX Fix 6.3) | Not addressed | Change fallback to `"a provider"` | **Include it.** Real privacy leak in public OG tags. |

---

## Overlap Merge Log

| Area | Both Plans Touch | Merged Once In |
|---|---|---|
| `slug_snapshot unique=True` | Both agree | `models.py` |
| `slugify()` email fallback | Both agree | `utils.py` (single location) |
| Remove `care_provider_id` from public responses | Both agree | `views.py` `_build_og_meta` + resolve not-found response |
| `track-click` URL from UUID to slug | Both agree | `urls.py` + `views.py` |
| `IntegrityError` in test assertions | Both agree | `tests.py` |
| Counter fields to `PositiveBigIntegerField` | Plan A only (Plan B silent) | `models.py` |
| Rate limiting on `/track-click/` | Both agree | `views.py` |
| Narrow exception handlers in views | Both agree | `views.py` |

---

## Files to Modify (ordered by dependency)

### 1. `apps/booking_link/models.py`

**Reason:** Schema changes must come first — unique constraints, counter field types, SlugRedirect compound constraint.

**Complete new content:**

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

**Changes from current:**
- `slug_snapshot`: `db_index=True` -> `unique=True`
- `click_count`, `booking_count`: `IntegerField` -> `PositiveBigIntegerField`
- `SlugRedirect.old_slug`: removed redundant `db_index=True`
- `SlugRedirect`: added `Meta.constraints` with compound unique
- Updated docstrings

---

### 2. `apps/booking_link/utils.py`

**Reason:** Move `get_provider_slug` here (from `views.py`) to break circular import between signals and views. Add `_ensure_unique_slug` helper. Both signals and views import from here.

**Complete new content:**

```python
import io

import qrcode
from django.utils.text import slugify
from qrcode.constants import ERROR_CORRECT_M


def generate_qr_code(url: str) -> bytes:
    """Generate a QR code PNG for the given URL and return raw bytes."""
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=10, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def get_provider_slug(care_provider):
    """
    Get the profile slug for a provider.
    Uses profile_handle if available, falls back to slugified email prefix.
    Returns str(user.pk) as last resort if email prefix slugifies to empty string.
    """
    user = care_provider.user
    if hasattr(user, 'profile_handle') and user.profile_handle:
        return user.profile_handle
    # Fallback: generate from email, slugified for URL safety
    return slugify(user.email.split('@')[0]) or str(user.pk)


def ensure_unique_slug(base_slug, exclude_pk=None):
    """
    Append a numeric suffix if base_slug collides with an existing
    BookingLink.slug_snapshot or SlugRedirect.old_slug.
    """
    # Deferred import to avoid circular import at module level
    from .models import BookingLink, SlugRedirect

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

**Changes from current:**
- Added `get_provider_slug()` (moved from `views.py`, with `slugify()` applied to email fallback + `str(user.pk)` last-resort)
- Added `ensure_unique_slug()` (new — collision avoidance for `unique=True` on `slug_snapshot`)
- Added `slugify` import

---

### 3. `apps/booking_link/signals.py`

**Reason:** Critical fix — add User post_save signal so handle changes via GraphQL are detected. Also: use `transaction.atomic()` + `select_for_update()` for race safety, import from `utils.py` instead of `views.py`, narrow exception handling, collision check before slug update.

**Complete new content:**

```python
import logging

from django.db import IntegrityError, transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _connect_signals():
    """Import and connect signals. Called from apps.py ready()."""
    from apps.authentication.models import User
    from apps.care_provider.models import CareProvider
    from .models import BookingLink, SlugRedirect
    from .utils import get_provider_slug

    def _sync_slug(care_provider):
        """
        Core slug sync logic shared by both CareProvider and User signal handlers.
        Detects slug_snapshot divergence from current profile_handle, updates it,
        and creates a SlugRedirect for the old value.
        """
        try:
            bl = care_provider.booking_link
        except BookingLink.DoesNotExist:
            return

        new_slug = get_provider_slug(care_provider)
        if not new_slug or bl.slug_snapshot == new_slug:
            return

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
                        new_slug, care_provider.pk,
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
                    old_slug, new_slug, care_provider.pk,
                )
        except IntegrityError as exc:
            logger.error(
                "IntegrityError syncing booking link slug for provider=%s: %s",
                care_provider.pk, exc,
            )
        except Exception as exc:
            logger.error(
                "Unexpected error syncing booking link slug for provider=%s: %s",
                care_provider.pk, exc,
            )

    @receiver(post_save, sender=CareProvider)
    def sync_booking_link_slug(sender, instance, **kwargs):
        """When a CareProvider is saved, sync slug if handle differs."""
        _sync_slug(instance)

    @receiver(post_save, sender=User)
    def sync_booking_link_slug_on_user_save(sender, instance, **kwargs):
        """
        When a User is saved (e.g. profile_handle change via GraphQL mutation),
        sync the BookingLink slug. This is the primary path for handle changes —
        the GraphQL CreateCareProviderMutation saves the User, not the CareProvider.
        """
        try:
            cp = instance.care_provider
        except CareProvider.DoesNotExist:
            return
        _sync_slug(cp)
```

**Changes from current:**
- Import from `utils.py` instead of `views.py`
- Import `User` model
- Extracted `_sync_slug()` shared helper
- Added `@receiver(post_save, sender=User)` signal handler (CRITICAL fix)
- Wrapped in `transaction.atomic()` + `select_for_update()`
- Re-check after lock acquisition
- Collision check: `new_slug` must not collide with existing `SlugRedirect`
- `get_or_create` uses `defaults={'booking_link': bl}` (matches on `old_slug` only)
- Typed exception handling: `IntegrityError` first, then generic `Exception` fallback
- Both handlers log with `care_provider.pk`

---

### 4. `apps/booking_link/serializers.py`

**Reason:** Update `ResolveBookingLinkSerializer` to match actual response shape — remove `care_provider_id`, add missing fields. Wire it into the views.

**Complete new content:**

```python
from rest_framework import serializers
from .models import BookingLink


class BookingLinkSerializer(serializers.ModelSerializer):
    booking_link_url = serializers.SerializerMethodField()

    class Meta:
        model = BookingLink
        fields = [
            'id', 'slug_snapshot', 'is_active',
            'click_count', 'booking_count', 'booking_link_url',
            'created_at', 'modified_at',
        ]
        read_only_fields = fields

    def get_booking_link_url(self, obj):
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(f'/book/{obj.slug_snapshot}')
        return f'https://really.global/book/{obj.slug_snapshot}'


class ResolveBookingLinkSerializer(serializers.Serializer):
    """
    Response shape for /resolve/ and /og-meta/ endpoints.
    Used for both successful resolution and not-found responses.
    """
    booking_link_id = serializers.UUIDField(allow_null=True)
    provider_slug = serializers.CharField()
    is_active = serializers.BooleanField()
    redirect_to = serializers.CharField(allow_null=True)
    og_title = serializers.CharField()
    og_description = serializers.CharField(allow_blank=True)
    og_image = serializers.CharField(allow_null=True)
    og_url = serializers.CharField()
    provider_name = serializers.CharField(allow_null=True, required=False)
    provider_photo_url = serializers.CharField(allow_null=True, required=False)
```

**Changes from current:**
- Removed `care_provider_id` field
- `booking_link_id`: added `allow_null=True` (not-found responses send `null`)
- `og_description`: added `allow_blank=True` (not-found responses send `""`)
- Added `provider_name` and `provider_photo_url` fields (present in `_build_og_meta` output)
- Added class docstring

---

### 5. `apps/booking_link/views.py`

**Reason:** Multiple fixes converge here — remove `_get_provider_slug` (moved to utils), remove `care_provider_id` from public responses, add soft-delete provider check, email privacy fix in og_title, reactivation creates SlugRedirect, slug collision avoidance on generate, track-click by slug, narrow exception handlers, rate limiting, wire ResolveBookingLinkSerializer.

**Complete new content:**

```python
import logging

from django.db.models import F
from django.http import HttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .models import BookingLink, SlugRedirect
from .serializers import BookingLinkSerializer, ResolveBookingLinkSerializer
from .utils import generate_qr_code, get_provider_slug, ensure_unique_slug

logger = logging.getLogger(__name__)


def _resolve_slug(slug):
    """Resolve a slug to a BookingLink. Checks current slugs then SlugRedirect."""
    try:
        bl = BookingLink.objects.select_related(
            'care_provider__user'
        ).get(slug_snapshot=slug)
        return bl, None  # (booking_link, redirect_to_slug)
    except BookingLink.DoesNotExist:
        pass
    # Check redirects
    try:
        redirect = SlugRedirect.objects.select_related(
            'booking_link__care_provider__user'
        ).get(old_slug=slug)
        return redirect.booking_link, redirect.booking_link.slug_snapshot
    except SlugRedirect.DoesNotExist:
        return None, None


def _build_og_meta(booking_link, redirect_to=None):
    """Build OG metadata dict for a booking link."""
    cp = booking_link.care_provider
    user = cp.user
    slug = booking_link.slug_snapshot

    # Treat link as inactive if provider or user is deactivated
    if not getattr(cp, 'is_active', True) or not getattr(user, 'is_active', True):
        return {
            'booking_link_id': str(booking_link.id),
            'provider_slug': slug,
            'is_active': False,
            'redirect_to': redirect_to,
            'og_title': 'Provider not found',
            'og_description': '',
            'og_image': None,
            'og_url': f'https://really.global/book/{slug}',
            'provider_name': None,
            'provider_photo_url': None,
        }

    # Use "a provider" fallback to avoid exposing email in public OG tags
    provider_name = f"{user.first_name} {user.last_name}".strip() or "a provider"

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


class BookingLinkGenerateView(APIView):
    """POST /api/v1/booking-link/generate/ — Create or return existing BookingLink."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        try:
            cp = user.care_provider
        except AttributeError:
            return Response(
                {'error': 'No care provider profile found for this user.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        slug = get_provider_slug(cp)
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
            unique_slug = ensure_unique_slug(slug)
            bl = BookingLink.objects.create(
                care_provider=cp,
                slug_snapshot=unique_slug,
                is_active=True,
            )
            created = True

        if not created and not bl.is_active:
            # Reactivate — preserve old slug as redirect if handle changed
            bl.is_active = True
            new_slug = ensure_unique_slug(slug, exclude_pk=bl.pk)
            if bl.slug_snapshot != new_slug:
                SlugRedirect.objects.get_or_create(
                    old_slug=bl.slug_snapshot,
                    defaults={'booking_link': bl},
                )
                bl.slug_snapshot = new_slug
            bl.save(update_fields=['is_active', 'slug_snapshot', 'modified_at'])

        serializer = BookingLinkSerializer(bl, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class BookingLinkMyView(APIView):
    """GET /api/v1/booking-link/my/ — Retrieve own BookingLink with stats."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        try:
            cp = user.care_provider
            bl = cp.booking_link
        except (AttributeError, BookingLink.DoesNotExist):
            return Response(
                {'detail': 'No Booking Link found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = BookingLinkSerializer(bl, context={'request': request})
        return Response(serializer.data)


class BookingLinkDeactivateView(APIView):
    """POST /api/v1/booking-link/deactivate/ — Deactivate own BookingLink."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        try:
            cp = user.care_provider
            bl = cp.booking_link
        except (AttributeError, BookingLink.DoesNotExist):
            return Response(
                {'error': 'No Booking Link found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        bl.is_active = False
        bl.save(update_fields=['is_active', 'modified_at'])
        return Response({'detail': 'Booking Link deactivated.'})


class BookingLinkResolveView(APIView):
    """GET /api/v1/booking-link/resolve/<slug>/ — Public slug resolution."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        bl, redirect_to = _resolve_slug(slug)
        if bl is None:
            # Never 404 — return inactive signal for graceful frontend handling
            data = {
                'booking_link_id': None,
                'provider_slug': slug,
                'is_active': False,
                'redirect_to': None,
                'og_title': 'Provider not found',
                'og_description': '',
                'og_image': None,
                'og_url': f'https://really.global/book/{slug}',
            }
            serializer = ResolveBookingLinkSerializer(data)
            return Response(serializer.data, status=status.HTTP_200_OK)
        data = _build_og_meta(bl, redirect_to)
        serializer = ResolveBookingLinkSerializer(data)
        return Response(serializer.data)


class BookingLinkClickThrottle(AnonRateThrottle):
    """Per-IP throttle for click tracking. Blocks naive scripted inflation."""
    rate = '60/hour'


class BookingLinkTrackClickView(APIView):
    """POST /api/v1/booking-link/track-click/<slug>/ — Atomic click increment."""
    permission_classes = [AllowAny]
    throttle_classes = [BookingLinkClickThrottle]

    def post(self, request, slug):
        # TODO: RGDEV-206 — consider per-slug rate limiting and click deduplication
        updated = BookingLink.objects.filter(slug_snapshot=slug, is_active=True).update(
            click_count=F('click_count') + 1
        )
        if updated == 0:
            return Response({'detail': 'Not found or inactive.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Click recorded.'})


class BookingLinkQrView(APIView):
    """GET /api/v1/booking-link/qr/<pk>/ — Return QR code PNG."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            cp = request.user.care_provider
            bl = BookingLink.objects.get(pk=pk, care_provider=cp)
        except (BookingLink.DoesNotExist, AttributeError):
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Build absolute URL for the booking link
        url = f"https://really.global/book/{bl.slug_snapshot}"
        png_bytes = generate_qr_code(url)
        return HttpResponse(png_bytes, content_type='image/png')


class BookingLinkOgMetaView(APIView):
    """GET /api/v1/booking-link/og-meta/<slug>/ — OG metadata for SSR."""
    permission_classes = [AllowAny]

    def get(self, request, slug):
        bl, redirect_to = _resolve_slug(slug)
        if bl is None:
            data = {
                'booking_link_id': None,
                'provider_slug': slug,
                'is_active': False,
                'redirect_to': None,
                'og_title': 'Provider not found',
                'og_description': 'This booking link is no longer active.',
                'og_image': None,
                'og_url': f'https://really.global/book/{slug}',
            }
            serializer = ResolveBookingLinkSerializer(data)
            return Response(serializer.data, status=status.HTTP_200_OK)
        data = _build_og_meta(bl, redirect_to)
        serializer = ResolveBookingLinkSerializer(data)
        return Response(serializer.data)
```

**Changes from current:**
1. Removed `_get_provider_slug()` function — now imported as `get_provider_slug` from `utils.py`
2. Added imports: `AnonRateThrottle`, `ResolveBookingLinkSerializer`, `get_provider_slug`, `ensure_unique_slug`
3. `_build_og_meta()`: added soft-delete provider/user check at top; removed `care_provider_id` from response; changed email fallback to `"a provider"`
4. `BookingLinkGenerateView`: narrowed `except Exception` to `except AttributeError`; replaced `get_or_create` with explicit `get`/`create` + `ensure_unique_slug`; reactivation creates `SlugRedirect` before overwriting slug
5. `BookingLinkMyView`: narrowed exception to `(AttributeError, BookingLink.DoesNotExist)`
6. `BookingLinkDeactivateView`: narrowed exception to `(AttributeError, BookingLink.DoesNotExist)`
7. `BookingLinkResolveView`: removed `care_provider_id` from not-found response; wired through `ResolveBookingLinkSerializer`
8. `BookingLinkTrackClickView`: changed from `pk` to `slug` parameter; filter by `slug_snapshot`; added `BookingLinkClickThrottle` (60/hour); added TODO comment for RGDEV-206
9. `BookingLinkQrView`: narrowed exception to `(BookingLink.DoesNotExist, AttributeError)`
10. `BookingLinkOgMetaView`: wired through `ResolveBookingLinkSerializer`; added `booking_link_id`, `provider_slug`, `redirect_to` to not-found response for shape consistency

---

### 6. `apps/booking_link/urls.py`

**Reason:** Change `track-click` URL from `<uuid:pk>` to `<slug:slug>`.

**Complete new content:**

```python
from django.urls import path
from . import views

urlpatterns = [
    path('generate/', views.BookingLinkGenerateView.as_view(), name='booking-link-generate'),
    path('my/', views.BookingLinkMyView.as_view(), name='booking-link-my'),
    path('deactivate/', views.BookingLinkDeactivateView.as_view(), name='booking-link-deactivate'),
    path('resolve/<slug:slug>/', views.BookingLinkResolveView.as_view(), name='booking-link-resolve'),
    path('track-click/<slug:slug>/', views.BookingLinkTrackClickView.as_view(), name='booking-link-track-click'),
    path('qr/<uuid:pk>/', views.BookingLinkQrView.as_view(), name='booking-link-qr'),
    path('og-meta/<slug:slug>/', views.BookingLinkOgMetaView.as_view(), name='booking-link-og-meta'),
]
```

**Changes from current:** Line 9: `track-click/<uuid:pk>/` -> `track-click/<slug:slug>/`

---

### 7. `apps/booking_link/tests.py`

**Reason:** Update all tests for changed APIs — slug-based track-click, removed `care_provider_id`, `IntegrityError` assertions, new test cases for User signal, soft-delete, slug collision, email privacy, email slugification, reactivation redirect, throttling, OneToOneField, no-profile-pic.

**Complete new content:**

```python
import uuid

from django.db import IntegrityError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework import status

from apps.authentication.models import User
from apps.care_provider.models import CareProvider
from apps.booking_link.models import BookingLink, SlugRedirect


def _create_provider_user(email='provider@test.com', profile_handle='dr-jane-doe'):
    """Helper: create a User + CareProvider for testing."""
    user = User.objects.create_user(
        email=email,
        password='testpass123',
        user_type='CAREPROVIDER',
        first_name='Jane',
        last_name='Doe',
        profile_handle=profile_handle,
    )
    cp = CareProvider.objects.create(user=user)
    return user, cp


# ---------------------------------------------------------------------------
# BookingLinkGenerateView tests
# ---------------------------------------------------------------------------

class BookingLinkGenerateTests(TestCase):
    """POST /api/v1/booking-link/generate/"""

    def setUp(self):
        self.client = APIClient()
        self.user, self.cp = _create_provider_user()
        self.client.force_authenticate(user=self.user)
        self.url = '/api/v1/booking-link/generate/'

    def test_generate_creates_booking_link(self):
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['slug_snapshot'], 'dr-jane-doe')
        self.assertTrue(resp.data['is_active'])
        self.assertEqual(BookingLink.objects.count(), 1)

    def test_generate_is_idempotent(self):
        self.client.post(self.url)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(BookingLink.objects.count(), 1)

    def test_generate_reactivates_deactivated_link(self):
        self.client.post(self.url)
        bl = BookingLink.objects.get(care_provider=self.cp)
        bl.is_active = False
        bl.save()

        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        bl.refresh_from_db()
        self.assertTrue(bl.is_active)

    def test_generate_requires_authentication(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_generate_fails_for_non_provider(self):
        client_user = User.objects.create_user(
            email='client@test.com',
            password='testpass123',
            user_type='CLIENT',
        )
        self.client.force_authenticate(user=client_user)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_generate_uses_email_fallback_when_no_handle(self):
        user, cp = _create_provider_user(
            email='noprofile@test.com', profile_handle=None
        )
        self.client.force_authenticate(user=user)
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['slug_snapshot'], 'noprofile')

    def test_generate_avoids_slug_collision(self):
        """Two providers with the same profile_handle get distinct slugs."""
        # First provider generates
        resp1 = self.client.post(self.url)
        self.assertEqual(resp1.data['slug_snapshot'], 'dr-jane-doe')

        # Second provider with same handle generates
        user2, cp2 = _create_provider_user(
            email='provider2@test.com', profile_handle='dr-jane-doe-2'
        )
        # Manually set same handle (bypassing unique on User.profile_handle for test)
        # Instead, create a SlugRedirect that would collide
        bl1 = BookingLink.objects.get(care_provider=self.cp)
        # Simulate: provider2's handle would produce slug 'dr-jane-doe' which is taken
        user2.profile_handle = None
        user2.email = 'dr-jane-doe@test.com'  # email fallback produces 'dr-jane-doe'
        user2.save()
        self.client.force_authenticate(user=user2)
        resp2 = self.client.post(self.url)
        self.assertEqual(resp2.status_code, status.HTTP_200_OK)
        # Should get a suffixed slug since 'dr-jane-doe' is taken
        self.assertNotEqual(resp2.data['slug_snapshot'], 'dr-jane-doe')
        self.assertTrue(resp2.data['slug_snapshot'].startswith('dr-jane-doe'))

    def test_generate_email_with_dots_produces_valid_slug(self):
        """Email with dots/plus signs produces a URL-safe slug."""
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
        self.assertTrue(bl.is_active)
        # The old slug 'dr-jane-doe' should be preserved as a redirect
        # Note: the User post_save signal may have already created the redirect
        # when the handle was changed. Either way, the redirect should exist.
        self.assertTrue(
            SlugRedirect.objects.filter(old_slug='dr-jane-doe').exists()
        )


# ---------------------------------------------------------------------------
# BookingLinkMyView tests
# ---------------------------------------------------------------------------

class BookingLinkMyTests(TestCase):
    """GET /api/v1/booking-link/my/"""

    def setUp(self):
        self.client = APIClient()
        self.user, self.cp = _create_provider_user()
        self.client.force_authenticate(user=self.user)
        self.url = '/api/v1/booking-link/my/'

    def test_my_returns_existing_link(self):
        BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['slug_snapshot'], 'dr-jane-doe')

    def test_my_returns_404_when_no_link(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# BookingLinkDeactivateView tests
# ---------------------------------------------------------------------------

class BookingLinkDeactivateTests(TestCase):
    """POST /api/v1/booking-link/deactivate/"""

    def setUp(self):
        self.client = APIClient()
        self.user, self.cp = _create_provider_user()
        self.client.force_authenticate(user=self.user)
        self.url = '/api/v1/booking-link/deactivate/'

    def test_deactivate_sets_inactive(self):
        bl = BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        bl.refresh_from_db()
        self.assertFalse(bl.is_active)

    def test_deactivate_returns_404_when_no_link(self):
        resp = self.client.post(self.url)
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# BookingLinkResolveView tests
# ---------------------------------------------------------------------------

class BookingLinkResolveTests(TestCase):
    """GET /api/v1/booking-link/resolve/<slug>/"""

    def setUp(self):
        self.client = APIClient()
        self.user, self.cp = _create_provider_user()
        self.bl = BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )

    def test_resolve_active_slug(self):
        resp = self.client.get('/api/v1/booking-link/resolve/dr-jane-doe/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data['is_active'])
        self.assertIsNone(resp.data['redirect_to'])
        # care_provider_id must NOT be in public response
        self.assertNotIn('care_provider_id', resp.data)

    def test_resolve_stale_slug_redirects(self):
        SlugRedirect.objects.create(old_slug='old-handle', booking_link=self.bl)
        resp = self.client.get('/api/v1/booking-link/resolve/old-handle/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['redirect_to'], 'dr-jane-doe')

    def test_resolve_missing_slug_returns_inactive(self):
        resp = self.client.get('/api/v1/booking-link/resolve/nonexistent/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertFalse(resp.data['is_active'])
        self.assertIsNone(resp.data['booking_link_id'])

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


# ---------------------------------------------------------------------------
# BookingLinkTrackClickView tests (now slug-based)
# ---------------------------------------------------------------------------

class BookingLinkTrackClickTests(TestCase):
    """POST /api/v1/booking-link/track-click/<slug>/"""

    def setUp(self):
        self.client = APIClient()
        self.user, self.cp = _create_provider_user()
        self.bl = BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )

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


# ---------------------------------------------------------------------------
# BookingLinkQrView tests
# ---------------------------------------------------------------------------

class BookingLinkQrTests(TestCase):
    """GET /api/v1/booking-link/qr/<pk>/"""

    def setUp(self):
        self.client = APIClient()
        self.user, self.cp = _create_provider_user()
        self.client.force_authenticate(user=self.user)
        self.bl = BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )

    def test_qr_returns_png(self):
        resp = self.client.get(f'/api/v1/booking-link/qr/{self.bl.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'image/png')
        # PNG magic bytes
        self.assertTrue(resp.content[:4] == b'\x89PNG')

    def test_qr_requires_owner(self):
        other_user, other_cp = _create_provider_user(
            email='other@test.com', profile_handle='other-doc'
        )
        self.client.force_authenticate(user=other_user)
        resp = self.client.get(f'/api/v1/booking-link/qr/{self.bl.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_qr_requires_auth(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(f'/api/v1/booking-link/qr/{self.bl.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# BookingLinkOgMetaView tests
# ---------------------------------------------------------------------------

class BookingLinkOgMetaTests(TestCase):
    """GET /api/v1/booking-link/og-meta/<slug>/"""

    def setUp(self):
        self.client = APIClient()
        self.user, self.cp = _create_provider_user()
        self.bl = BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )

    def test_og_meta_returns_metadata(self):
        resp = self.client.get('/api/v1/booking-link/og-meta/dr-jane-doe/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('Book a session with', resp.data['og_title'])
        self.assertEqual(resp.data['og_url'], 'https://really.global/book/dr-jane-doe')

    def test_og_meta_missing_slug(self):
        resp = self.client.get('/api/v1/booking-link/og-meta/nonexistent/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['og_title'], 'Provider not found')
        self.assertFalse(resp.data['is_active'])

    def test_og_meta_no_profile_pic(self):
        """Provider with no profile pic should return og_image: null."""
        self.user.profile_pic = ''
        self.user.save()
        resp = self.client.get('/api/v1/booking-link/og-meta/dr-jane-doe/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(resp.data['og_image'])

    def test_og_meta_no_name_does_not_expose_email(self):
        """Provider with no name should not leak email in OG title."""
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


# ---------------------------------------------------------------------------
# Signal tests: CareProvider post_save
# ---------------------------------------------------------------------------

class SlugRedirectSignalTests(TestCase):
    """Signal: sync_booking_link_slug on CareProvider post_save."""

    def setUp(self):
        self.user, self.cp = _create_provider_user()
        self.bl = BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )

    def test_signal_creates_redirect_on_handle_change(self):
        self.user.profile_handle = 'new-handle'
        self.user.save()
        # CareProvider post_save also triggers sync
        self.cp.save()

        self.bl.refresh_from_db()
        self.assertEqual(self.bl.slug_snapshot, 'new-handle')
        self.assertTrue(
            SlugRedirect.objects.filter(old_slug='dr-jane-doe', booking_link=self.bl).exists()
        )

    def test_signal_no_op_when_slug_unchanged(self):
        self.cp.save()
        self.bl.refresh_from_db()
        self.assertEqual(self.bl.slug_snapshot, 'dr-jane-doe')
        self.assertEqual(SlugRedirect.objects.count(), 0)

    def test_signal_no_op_when_no_booking_link(self):
        self.bl.delete()
        # Should not raise
        self.cp.save()


# ---------------------------------------------------------------------------
# Signal tests: User post_save (CRITICAL fix — the primary handle change path)
# ---------------------------------------------------------------------------

class UserSaveSignalTests(TestCase):
    """Signal: sync_booking_link_slug_on_user_save on User post_save."""

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
        """Saving user without changing handle should not create redirects."""
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

        self.bl.refresh_from_db()
        self.assertEqual(self.bl.slug_snapshot, 'handle-b')

        self.user.profile_handle = 'dr-jane-doe'
        self.user.save()

        self.bl.refresh_from_db()
        self.assertEqual(self.bl.slug_snapshot, 'dr-jane-doe')
        self.assertTrue(SlugRedirect.objects.filter(old_slug='handle-b').exists())
        self.assertTrue(SlugRedirect.objects.filter(old_slug='dr-jane-doe').exists())


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------

class BookingLinkModelTests(TestCase):
    """Model __str__ and basic behaviour."""

    def test_booking_link_str(self):
        user, cp = _create_provider_user()
        bl = BookingLink.objects.create(
            care_provider=cp, slug_snapshot='test-slug', is_active=True
        )
        self.assertIn('test-slug', str(bl))

    def test_slug_redirect_str(self):
        user, cp = _create_provider_user()
        bl = BookingLink.objects.create(
            care_provider=cp, slug_snapshot='test-slug', is_active=True
        )
        sr = SlugRedirect.objects.create(old_slug='old-slug', booking_link=bl)
        self.assertIn('old-slug', str(sr))

    def test_slug_redirect_unique(self):
        user, cp = _create_provider_user()
        bl = BookingLink.objects.create(
            care_provider=cp, slug_snapshot='test-slug', is_active=True
        )
        SlugRedirect.objects.create(old_slug='unique-slug', booking_link=bl)
        with self.assertRaises(IntegrityError):
            SlugRedirect.objects.create(old_slug='unique-slug', booking_link=bl)

    def test_one_booking_link_per_provider(self):
        """OneToOneField prevents duplicate BookingLinks for same CareProvider."""
        user, cp = _create_provider_user()
        BookingLink.objects.create(
            care_provider=cp, slug_snapshot='slug-one', is_active=True
        )
        with self.assertRaises(IntegrityError):
            BookingLink.objects.create(
                care_provider=cp, slug_snapshot='slug-two', is_active=True
            )


# ---------------------------------------------------------------------------
# Throttle tests
# ---------------------------------------------------------------------------

@override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
class BookingLinkTrackClickThrottleTests(TestCase):
    """Rate limiting on /track-click/."""

    def setUp(self):
        self.client = APIClient()
        self.user, self.cp = _create_provider_user()
        self.bl = BookingLink.objects.create(
            care_provider=self.cp, slug_snapshot='dr-jane-doe', is_active=True
        )

    def test_track_click_throttled_after_limit(self):
        url = '/api/v1/booking-link/track-click/dr-jane-doe/'
        for _ in range(60):
            self.client.post(url)
        resp = self.client.post(url)
        self.assertEqual(resp.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
```

**Changes from current:**
- Added `from django.db import IntegrityError` at top
- `test_resolve_active_slug`: replaced `assertEqual(care_provider_id)` with `assertNotIn('care_provider_id')`
- All track-click tests: changed URLs from UUID-based to slug-based
- `test_track_click_missing_returns_404`: uses `'nonexistent-slug/'` instead of UUID
- `test_slug_redirect_unique`: uses `IntegrityError` instead of bare `Exception`
- Added `test_one_booking_link_per_provider` (Finding #14)
- Added `test_og_meta_no_profile_pic` (Finding #15)
- Added `test_og_meta_no_name_does_not_expose_email` (UX Fix 3)
- Added `test_generate_avoids_slug_collision` (DM Finding #1/#21)
- Added `test_generate_email_with_dots_produces_valid_slug` (UX Fix 4)
- Added `test_generate_reactivation_creates_redirect_for_old_slug` (UX Fix 5)
- Added full `UserSaveSignalTests` class with 4 tests (UX Fix 1 — CRITICAL)
- Added `test_resolve_deactivated_provider_returns_inactive` (UX Fix 8)
- Added `test_resolve_deactivated_user_returns_inactive` (UX Fix 8)
- Added `BookingLinkTrackClickThrottleTests` class (UX Fix 2)

---

## New Files to Create

None. All changes are modifications to existing files.

---

## Migration Required

**Yes.** Run after applying `models.py` changes:

```bash
python manage.py makemigrations booking_link --name fix_slug_constraints_and_counters
```

Expected migration operations:
1. `AlterField` on `BookingLink.slug_snapshot` — `db_index=True` -> `unique=True`
2. `AlterField` on `BookingLink.click_count` — `IntegerField` -> `PositiveBigIntegerField`
3. `AlterField` on `BookingLink.booking_count` — `IntegerField` -> `PositiveBigIntegerField`
4. `AlterField` on `SlugRedirect.old_slug` — remove redundant `db_index=True` (keep `unique=True`)
5. `AddConstraint` on `SlugRedirect` — `unique_old_slug_per_booking_link`

**Data migration note:** If existing data has duplicate `slug_snapshot` values, the `unique=True` migration will fail. Run an audit query first:
```sql
SELECT slug_snapshot, COUNT(*) FROM booking_link_bookinglink
GROUP BY slug_snapshot HAVING COUNT(*) > 1;
```

---

## Test Additions

| Test Class | Test Method | Validates |
|---|---|---|
| `BookingLinkGenerateTests` | `test_generate_avoids_slug_collision` | Slug collision avoidance with `ensure_unique_slug` |
| `BookingLinkGenerateTests` | `test_generate_email_with_dots_produces_valid_slug` | `slugify()` on email fallback |
| `BookingLinkGenerateTests` | `test_generate_reactivation_creates_redirect_for_old_slug` | Reactivation preserves old slug as redirect |
| `BookingLinkResolveTests` | `test_resolve_deactivated_provider_returns_inactive` | Soft-deleted provider check |
| `BookingLinkResolveTests` | `test_resolve_deactivated_user_returns_inactive` | Soft-deleted user check |
| `BookingLinkOgMetaTests` | `test_og_meta_no_profile_pic` | No profile pic returns `og_image: null` |
| `BookingLinkOgMetaTests` | `test_og_meta_no_name_does_not_expose_email` | Email privacy in OG title |
| `UserSaveSignalTests` | `test_user_save_with_new_handle_updates_slug` | CRITICAL: User.save() triggers slug sync |
| `UserSaveSignalTests` | `test_user_save_no_handle_change_is_noop` | No spurious redirects |
| `UserSaveSignalTests` | `test_user_save_client_user_is_noop` | Client users don't crash signal |
| `UserSaveSignalTests` | `test_handle_cycle_a_b_a_creates_redirects` | Handle cycling preserves all redirects |
| `BookingLinkModelTests` | `test_one_booking_link_per_provider` | OneToOneField enforcement |
| `BookingLinkTrackClickThrottleTests` | `test_track_click_throttled_after_limit` | Rate limiting at 60/hour |

**Updated existing tests:**
- `test_resolve_active_slug` — removed `care_provider_id` assertion
- `test_slug_redirect_unique` — `IntegrityError` instead of `Exception`
- All `BookingLinkTrackClickTests` — slug-based URLs instead of UUID
- `test_signal_creates_redirect_on_handle_change` — kept `cp.save()` path (still works, both signals now active)

---

## Explicitly Out of Scope

| Item | Deferred To | Reason |
|---|---|---|
| `fee_tier` in `/resolve/` response | RGDEV-205 | Attribution tracking scope |
| `Appointment.booking_link` FK | RGDEV-205 | Requires calendar_functionality model change |
| `BookingLink.record_booking()` method | RGDEV-205/206 | Increment protocol for booking_count |
| `booking_count` increment logic | RGDEV-205/206 | Post-payment attribution |
| `attribution_window_days` | RGDEV-205 | Attribution expiry policy |
| Response envelope standardization (#8/#9/#10) | Backlog | Project-wide consistency effort |
| Click deduplication | RGDEV-206 | Analytics accuracy improvement |
| Management command for slug drift audit | RGDEV-206 | Operational tooling |
| Per-slug rate limiting | RGDEV-206 | Flagged as TODO in track-click view |

---

## Verification Checklist

After applying all changes:

- [ ] `python manage.py makemigrations --check` shows no pending migrations (after generating the migration)
- [ ] `python manage.py migrate` succeeds
- [ ] `python manage.py test apps.booking_link` — all tests pass (expect ~38 tests)
- [ ] Manual: create two providers with same email prefix, both generate booking links, slugs differ
- [ ] Manual: change provider handle via GraphQL mutation, old slug redirects, new slug resolves
- [ ] Manual: change provider handle via admin (CareProvider save), same redirect behavior
- [ ] Manual: `/resolve/` and `/og-meta/` responses do not contain `care_provider_id`
- [ ] Manual: `/track-click/<slug>/` works, `/track-click/<uuid>/` returns 404
- [ ] Manual: deactivated provider's booking link resolves with `is_active: false`
- [ ] Manual: provider with no name shows "Book a session with a provider" (not email)
- [ ] Manual: 61st click in an hour returns 429
