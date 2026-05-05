# Audit Results: RGDEV-204 Booking Link — Scenario, Edge-Case, and Commercial Audit

**Auditor:** Principal engineer review (Claude)
**Date:** 2026-03-14
**Branch:** `RGDEV-204/booking-link-core`
**Scope:** `Lumy-Backend/apps/booking_link/` and related care_provider, authentication, and stripe_integration code paths

---

## Implementation State Summary

All files referenced in the audit prompt now exist and are implemented:

| File | Status |
|---|---|
| `apps/booking_link/models.py` | Implemented |
| `apps/booking_link/serializers.py` | Implemented |
| `apps/booking_link/utils.py` | Implemented |
| `apps/booking_link/apps.py` | Implemented |
| `apps/booking_link/signals.py` | Implemented |
| `apps/booking_link/views.py` | Implemented (8 views) |
| `apps/booking_link/urls.py` | Implemented (7 routes) |
| `apps/booking_link/admin.py` | Implemented |
| `apps/booking_link/tests.py` | Implemented (20 tests) |
| `apps/booking_link/migrations/0001_initial.py` | **MISSING** — no migration generated |
| `lumy_global/settings.py` INSTALLED_APPS | Registered (`apps.booking_link`) |
| `lumy_global/urls.py` | Wired (`api/v1/booking-link/`) |

---

## Scenario 1: Slug Change Lifecycle

### [CRITICAL] 1.1 — Signal fires on CareProvider.post_save but handle changes happen on User.save()

**File:** `apps/booking_link/signals.py` line 14
**Finding:** The signal is `@receiver(post_save, sender=CareProvider)`. However, when a provider changes their `profile_handle` via the GraphQL mutation `CreateCareProviderMutation`, the code at `apps/authentication/mutations.py` lines 454-455 and 519-520 sets `user_obj.profile_handle = profile_handle` and calls `user_obj.save()` (lines 461, 526). This saves the **User** model only — it does NOT trigger `CareProvider.post_save`. The signal will never fire for handle changes made through the GraphQL API.

The only place where `CareProvider.save()` is called after a handle change is during initial creation (`care_provider/models.py` line 1256-1268), where `is_new=True` and `profile_handle` is set for the first time. Subsequent handle changes via GraphQL go through `User.save()` alone.

**Risk:** Old slugs are never recorded in `SlugRedirect`. Old booking link URLs break silently. `slug_snapshot` becomes permanently stale after any handle change.
**Recommendation:** Either (a) add a second signal receiver listening to `post_save` on `User` (sender=User), or (b) add a `pre_save` signal on `User` that detects `profile_handle` changes and delegates to the slug sync logic. Option (a) is simpler:

```python
@receiver(post_save, sender=User)
def sync_booking_link_slug_on_user_save(sender, instance, **kwargs):
    try:
        cp = instance.care_provider
    except CareProvider.DoesNotExist:
        return
    # ... same logic as sync_booking_link_slug
```

### [MEDIUM] 1.2 — Handle cycling (A->B->A) uses get_or_create — safe

**File:** `apps/booking_link/signals.py` line 28
**Finding:** The signal correctly uses `SlugRedirect.objects.get_or_create(old_slug=old_slug, booking_link=bl)`. If a provider cycles back to a previous handle, the existing `SlugRedirect` row for that old slug is found rather than re-created. No `IntegrityError` will occur.

However, there is a subtle issue: `get_or_create` matches on BOTH `old_slug` AND `booking_link`. If the `SlugRedirect` for `old_slug` already exists but points to a DIFFERENT `booking_link` (theoretically impossible since `old_slug` has `unique=True`), the `get_or_create` would attempt a `.create()` and hit the unique constraint. The `unique=True` on `old_slug` means the same slug cannot be claimed by two different providers, which is correct behavior, but the `get_or_create` kwargs include `booking_link=bl` as a filter, not just `old_slug`. If another provider previously used the same slug, `get_or_create` would fail.

**Risk:** Edge case: if two providers could theoretically have the same slug (mitigated by `profile_handle` uniqueness), the second provider's redirect would fail. Current `unique=True` on `User.profile_handle` makes this unlikely but not impossible if handles are set directly via admin.
**Recommendation:** Change to `SlugRedirect.objects.get_or_create(old_slug=old_slug, defaults={'booking_link': bl})` to match only on `old_slug`.

### [LOW] 1.3 — Providers with no BookingLink at handle-change time — safe

**File:** `apps/booking_link/signals.py` lines 17-19
**Finding:** The signal correctly handles this case with `try: bl = instance.booking_link / except BookingLink.DoesNotExist: return`. No action is taken if no `BookingLink` exists.

### [LOW] 1.4 — Duplicate BookingLink prevention — safe

**File:** `apps/booking_link/views.py` line 92
**Finding:** The `/generate/` view uses `BookingLink.objects.get_or_create(care_provider=cp, defaults={...})`. This is correct. However, it does not wrap the call in a `try/except IntegrityError` for the concurrent-request race. Under high concurrency, two simultaneous `/generate/` requests could both pass the `get()` phase and both attempt `create()`, with the second hitting `IntegrityError`.

**Risk:** 500 error on double-click under high latency. Low probability in practice (provider-only endpoint, authenticated).
**Recommendation:** Wrap in `try/except IntegrityError` and re-fetch on failure.

### [LOW] 1.5 — slug_snapshot uniqueness

**File:** `apps/booking_link/models.py` line 20; `apps/authentication/models.py` lines 160-164
**Finding:** `slug_snapshot` has `db_index=True` but NOT `unique=True`. However, `User.profile_handle` is `unique=True, blank=True, null=True` at the DB level. Since `slug_snapshot` is derived from `profile_handle`, uniqueness is enforced upstream. The email fallback in `_get_provider_slug()` (line 22) could theoretically produce duplicate slugs if two users share the same email prefix, but this requires two users with the same email prefix AND both having `profile_handle=None`, which is prevented by the initial handle generation in `CareProvider.save()`.

**Risk:** Low. Upstream uniqueness constraint provides adequate protection.
**Recommendation:** Consider adding `unique=True` to `slug_snapshot` as a defense-in-depth measure.

---

## Scenario 2: Deactivation and Reactivation

### [LOW] 2.1 — /resolve/ response for inactive link — correct design

**File:** `apps/booking_link/views.py` lines 143-165
**Finding:** The `/resolve/` endpoint returns the full record with `is_active` flag regardless of activation state. The `_resolve_slug()` function does NOT filter by `is_active`. When the slug is found but the link is inactive, the response includes `is_active: false` along with all OG metadata. When the slug is not found at all, the response returns a structured body with `booking_link_id: null` and `is_active: false`. The frontend can distinguish "inactive" from "never existed" using the `booking_link_id` field (null vs. UUID).

### [LOW] 2.2 — click_count and booking_count preservation — correct

**File:** `apps/booking_link/views.py` lines 138-139
**Finding:** The deactivation endpoint uses `bl.save(update_fields=['is_active', 'modified_at'])`. Only `is_active` and `modified_at` are written. Counts are preserved.

### [LOW] 2.3 — /track-click/ behavior when link is inactive — correctly blocked

**File:** `apps/booking_link/views.py` line 173
**Finding:** The track-click endpoint filters by `is_active=True`: `BookingLink.objects.filter(pk=pk, is_active=True).update(...)`. Inactive links do not accumulate clicks. Returns 404 for inactive links.

---

## Scenario 3: Provider Account Deletion

### [LOW] 3.1 — CASCADE chain correctness — correct

**File:** `apps/booking_link/models.py` lines 13-16 and 37-40
**Finding:** `BookingLink.care_provider` is `on_delete=CASCADE` and `SlugRedirect.booking_link` is `on_delete=CASCADE`. The full chain is User -> CareProvider -> BookingLink -> SlugRedirect(s). All records are removed on provider deletion. No orphaned redirects.

### [LOW] 3.2 — Frontend behavior after provider deletion — acceptable

**File:** `apps/booking_link/views.py` lines 149-164
**Finding:** After CASCADE deletion, `/resolve/` returns a structured 200 response with `booking_link_id: null`, `is_active: false`, `og_title: 'Provider not found'`. This allows the frontend to render a graceful "not found" page rather than crashing on a 404.

### [MEDIUM] 3.3 — Soft delete vs. hard delete — potential gap

**File:** `apps/booking_link/views.py` line 60; `apps/authentication/models.py` lines 45-56
**Finding:** `BaseModel` provides `is_active` and the project uses soft deletes in some areas. If a CareProvider is soft-deleted (setting `is_active=False`), the `BookingLink` and `SlugRedirect` rows survive. The `/resolve/` endpoint does NOT check `booking_link.care_provider.is_active` or `booking_link.care_provider.user.is_active`. A soft-deleted provider's booking link would still resolve as if the provider exists.

**Risk:** Deactivated/banned providers remain discoverable via booking link.
**Recommendation:** Add a check in `_build_og_meta()` or `_resolve_slug()`: if `booking_link.care_provider.is_active is False` or `booking_link.care_provider.user.is_active is False`, treat the link as inactive.

---

## Scenario 4: Click Tracking Abuse

### [HIGH] 4.1 — No rate limiting on /track-click/

**File:** `apps/booking_link/views.py` lines 168-178; `lumy_global/settings.py`
**Finding:** The `/track-click/` endpoint has `permission_classes = [AllowAny]` and no throttle class. A grep for `THROTTLE` in `settings.py` returned no matches — there is NO global throttle configuration and NO per-view throttle on this endpoint.

**Risk:** A single attacker can inflate `click_count` to arbitrary values with a simple loop. This corrupts provider analytics and could mislead commercial decisions about the 10% fee tier.
**Recommendation:** Add a view-level throttle:
```python
from rest_framework.throttling import AnonRateThrottle

class ClickThrottle(AnonRateThrottle):
    rate = '60/hour'

class BookingLinkTrackClickView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ClickThrottle]
```

### [LOW] 4.2 — No click deduplication

**File:** `apps/booking_link/views.py` lines 168-178
**Finding:** No deduplication mechanism exists. Each POST increments the counter regardless of whether the same client has already been counted. This is a known analytics accuracy gap.
**Risk:** `click_count` over-reports actual unique visitors. Acceptable for MVP.

### [LOW] 4.3 — Counter increment atomicity — correct

**File:** `apps/booking_link/views.py` lines 173-174
**Finding:** The view uses `BookingLink.objects.filter(pk=pk, is_active=True).update(click_count=F('click_count') + 1)`. This is the correct atomic pattern using `F()` expressions. No fetch-modify-save race condition.

### [LOW] 4.4 — booking_count not incremented in RGDEV-204 — correct

**File:** `apps/booking_link/views.py` (entire file)
**Finding:** No code in the booking_link app increments `booking_count`. It remains at default `0`. This is correct — RGDEV-205 is responsible for incrementing it post-payment.

---

## Scenario 5: QR Code Distribution

### [LOW] 5.1 — QR code URL uses hardcoded production domain — correct

**File:** `apps/booking_link/views.py` line 193
**Finding:** The QR view builds the URL as `f"https://really.global/book/{bl.slug_snapshot}"` — hardcoded to the production domain. It does NOT use `request.build_absolute_uri()`. QR codes will always encode the production URL regardless of the environment they are generated in.

### [LOW] 5.2 — QR code after slug change — old URL resolves via SlugRedirect

**File:** `apps/booking_link/views.py` lines 25-41
**Finding:** `_resolve_slug()` correctly checks `SlugRedirect` as a fallback when the slug is not found as a current `slug_snapshot`. The response includes `redirect_to` pointing to the current canonical slug. The frontend can redirect the browser.

### [LOW] 5.3 — QR code after link deactivation — graceful response

**File:** `apps/booking_link/views.py` lines 143-165
**Finding:** Same `/resolve/` endpoint is used. Inactive links return the full record with `is_active: false`. No distinction between QR-originated and direct visits — all go through the same path.

### [LOW] 5.4 — QR code endpoint authentication — owner-only, correct

**File:** `apps/booking_link/views.py` lines 181-195
**Finding:** The `/qr/<pk>/` endpoint requires authentication (`IsAuthenticated`) and verifies ownership by filtering on `care_provider=cp` (where `cp = request.user.care_provider`). Other providers cannot generate QR codes for someone else's link.

---

## Scenario 6: OG Metadata Completeness

### [MEDIUM] 6.1 — og_image when profile_pic is empty string

**File:** `apps/booking_link/views.py` lines 52-54; `apps/authentication/models.py` line 84
**Finding:** `User.profile_pic` is defined as `models.TextField(blank=True, default="")`. The code checks `if user.profile_pic:` — an empty string is falsy in Python, so this correctly returns `photo_url = None` when no photo is set. The serializer allows `null` for `og_image`. However, the response always includes the key (not omitted), which is correct for frontend consumption.

### [LOW] 6.2 — og_description fallback when bio is empty — adequate

**File:** `apps/booking_link/views.py` line 63
**Finding:** `og_description` is always constructed as `f"Book a session with {provider_name} on Really Global."`. It does not attempt to pull a bio/tagline from the provider profile. This is a static fallback that is never empty. Adequate for MVP.

### [MEDIUM] 6.3 — og_title when provider name is absent — exposes email

**File:** `apps/booking_link/views.py` line 48
**Finding:** `provider_name = f"{user.first_name} {user.last_name}".strip() or user.email`. If both `first_name` and `last_name` are empty, the fallback is the full email address (e.g., `jdoe@gmail.com`). This email is then embedded in the public OG title: `"Book a session with jdoe@gmail.com"`. This is a privacy leak — the email address appears in social sharing previews.

**Risk:** Provider email exposed in public OG metadata on social platforms.
**Recommendation:** Change fallback to email prefix or a generic string:
```python
provider_name = f"{user.first_name} {user.last_name}".strip() or "a provider"
```

### [LOW] 6.4 — Private data exposure in OG endpoint — minimal

**File:** `apps/booking_link/views.py` lines 56-68
**Finding:** The `_build_og_meta()` function returns a curated dict. It includes `care_provider_id` (integer PK) which reveals database structure (sequential IDs), but this is acceptable for an internal ID. No email, phone, Stripe ID, or other sensitive fields are included — except for the email fallback in `provider_name` noted in 6.3.

### [LOW] 6.5 — og_url uses canonical slug — correct

**File:** `apps/booking_link/views.py` line 65
**Finding:** `og_url` is always `f"https://really.global/book/{slug}"` where `slug = booking_link.slug_snapshot` (the current canonical slug). Even when the request arrived via an old slug (resolved through `SlugRedirect`), the OG URL points to the current canonical slug. This is correct for SEO consolidation.

---

## Scenario 7: Idempotency of /generate/

### [LOW] 7.1 — get_or_create used — mostly safe

**File:** `apps/booking_link/views.py` line 92
**Finding:** Uses `BookingLink.objects.get_or_create(care_provider=cp, defaults={...})`. Idempotent for sequential requests. See 1.4 for the concurrent-request race note.

### [MEDIUM] 7.2 — Email fallback in slug produces non-slug characters

**File:** `apps/booking_link/views.py` lines 21-22
**Finding:** `_get_provider_slug()` falls back to `user.email.split('@')[0]`. Email prefixes can contain characters invalid for a `SlugField`: dots (`jane.doe`), plus signs (`jane+tag`), underscores. Django's `SlugField` only allows `[a-zA-Z0-9_-]`, so underscores and hyphens are fine, but dots and plus signs are not. The `<slug:slug>` URL converter in `urls.py` line 8 would reject slugs containing dots or plus signs, making those booking links unreachable via the `/resolve/` endpoint.

Additionally, `make_profile_handle()` in `apps/utils/profile_handle.py` uses `slugify()` which strips non-slug characters. But the email fallback in `_get_provider_slug()` does NOT run through `slugify()`.

**Risk:** Providers without a `profile_handle` (edge case) get a slug containing dots/plus from their email prefix. The slug is stored in `slug_snapshot` (SlugField) but may fail validation. The `/resolve/<slug:slug>/` URL pattern will not match dots, making the link unresolvable.
**Recommendation:** Run the email fallback through `django.utils.text.slugify()`:
```python
from django.utils.text import slugify
return slugify(user.email.split('@')[0]) or str(user.pk)
```

### [LOW] 7.3 — Regeneration returns current state — correct

**File:** `apps/booking_link/views.py` lines 96-103
**Finding:** When `get_or_create` returns `created=False`, the view checks if the link is inactive and reactivates it, refreshing the slug. The serializer serializes the current DB state. The response reflects the current `slug_snapshot`, not the `defaults` dict.

---

## Scenario 8: Commercial Alignment

### [MEDIUM] 8.1 — Attribution data in /resolve/ response — missing fee_tier

**File:** `apps/booking_link/serializers.py` lines 24-33; `apps/booking_link/views.py` lines 56-68
**Finding:** The `/resolve/` response includes `booking_link_id`, `care_provider_id`, `provider_slug`, `is_active`, `redirect_to`, and OG fields. It also includes `provider_name` and `provider_photo_url` (added beyond what `ResolveBookingLinkSerializer` defines — the view returns a raw dict, not through the serializer). Missing fields for RGDEV-205:
- `fee_tier` — not present. RGDEV-205 must hard-code the 10% rule.
- `attribution_window_days` — not present. No defined expiry for attribution.

**Risk:** Fee tier logic duplicated across RGDEV-204 and RGDEV-205. If the fee percentage changes, two places must be updated.
**Recommendation:** Add `fee_tier` to the response (e.g., `"fee_tier": "reduced"` or `"fee_tier_pct": 10`).

### [LOW] 8.2 — click_count vs. booking_count semantic gap — acceptable for MVP

**File:** `apps/booking_link/models.py` lines 21-22
**Finding:** No `unique_visitor_count` or `conversion_rate` field. `click_count` counts raw hits (not unique). MVP-acceptable imprecision.

### [HIGH] 8.3 — slug_snapshot divergence has no recovery mechanism

**File:** `apps/booking_link/signals.py` lines 14-36; `apps/booking_link/views.py` lines 16-22
**Finding:** The signal only fires on `CareProvider.post_save`. As documented in finding 1.1, handle changes via GraphQL `User.save()` will NOT trigger the signal. There is no management command, admin action, or periodic task to detect or repair stale `slug_snapshot` values.

If `slug_snapshot` diverges from `user.profile_handle`:
1. The canonical URL (`get_booking_link_url`) serves the wrong slug
2. OG sharing embeds the wrong URL
3. QR codes generated after the divergence encode the wrong slug (though the stale slug still works since no `SlugRedirect` was created)
4. New handle changes will create redirects from the stale slug, not the actual old handle

**Risk:** Silent data corruption. The booking link URL ecosystem fragments.
**Recommendation:** (a) Fix the signal trigger (see 1.1), and (b) add a management command to audit and repair divergences:
```python
# python manage.py audit_booking_link_slugs
for bl in BookingLink.objects.select_related('care_provider__user'):
    expected = bl.care_provider.user.profile_handle
    if bl.slug_snapshot != expected:
        print(f"DIVERGENCE: {bl.id} has {bl.slug_snapshot}, expected {expected}")
```

### [LOW] 8.4 — make_profile_handle produces valid slug — correct

**File:** `apps/utils/profile_handle.py` lines 9-27
**Finding:** `make_profile_handle()` uses `django.utils.text.slugify()` on line 12, then strips hyphens and truncates to 10 chars on line 13, then appends a 5-char email hash. The output is always `[a-z0-9]+` (lowercase alphanumeric, no hyphens due to `.replace("-", "")`). This is valid for `SlugField`. The `<slug:slug>` URL pattern accepts `[-a-zA-Z0-9_]+`, which covers this output.

Note: The handle format is `{name_slug_no_hyphens}{email_hash_5chars}` (e.g., `janedoe1a2b3`). This is not particularly human-readable for a "shareable URL" (`really.global/book/janedoe1a2b3`), but that is a product decision, not a bug.

---

## Scenario 9: Integration Readiness for RGDEV-205

### [HIGH] 9.1 — /resolve/ contract completeness for RGDEV-205

**File:** `apps/booking_link/views.py` lines 56-68; `apps/booking_link/serializers.py` lines 24-33
**Finding:** Field-by-field audit:

| Field | Present in response? | RGDEV-205 need | Gap? |
|---|---|---|---|
| `booking_link_id` | Yes (UUID string) | Write attribution FK on Appointment | No |
| `care_provider_id` | Yes (integer) | Target provider for checkout | No |
| `is_active` | Yes | Guard: abort checkout if false | No |
| `provider_slug` | Yes | Confirm slug matches expected provider | No |
| `redirect_to` | Yes (nullable) | Handle old-slug redirect on frontend | No |
| `og_*` fields | Yes | Social preview only | No |
| `provider_name` | Yes (in view dict, NOT in serializer) | Show provider name in checkout | No |
| `provider_photo_url` | Yes (in view dict, NOT in serializer) | Show provider photo in checkout | No |
| `fee_tier` | **No** | Apply reduced fee | **Yes** |
| `attribution_window_days` | **No** | Attribution expiry | **Yes (if needed)** |

Note: The view at line 165 returns `_build_og_meta()` directly as a dict, NOT through `ResolveBookingLinkSerializer`. The serializer is defined but never used by the `/resolve/` or `/og-meta/` views. This means the serializer is dead code.

**Risk:** RGDEV-205 must hard-code fee tier logic. `ResolveBookingLinkSerializer` is unused and may mislead developers into thinking it controls the response shape.
**Recommendation:** Either use the serializer or remove it. Add `fee_tier` to the response.

### [CRITICAL] 9.2 — Appointment model has no booking_link attribution field

**File:** `apps/calendar_functionality/models.py`
**Finding:** A grep for `booking_link`, `booking_count`, and `attributed` in `apps/calendar_functionality/models.py` returned zero matches. The `Appointment` model has no FK or field to record which `BookingLink` attributed the booking.

**Risk:** RGDEV-205 cannot persist per-appointment attribution. `booking_count` on `BookingLink` can be incremented, but there is no audit trail linking a specific appointment to a specific booking link. This is required for: fee tier verification, refund processing, provider analytics, and dispute resolution.
**Recommendation:** RGDEV-205 must add a field to `Appointment`:
```python
booking_link = models.ForeignKey(
    'booking_link.BookingLink',
    on_delete=models.SET_NULL,
    null=True, blank=True,
    related_name='attributed_appointments',
)
```

### [HIGH] 9.3 — No defined protocol for booking_count increment

**File:** `apps/booking_link/models.py`; `apps/booking_link/views.py`
**Finding:** There is no method on `BookingLink` (e.g., `record_booking()`), no signal from Appointment, and no documented protocol for RGDEV-205 to increment `booking_count`. RGDEV-205 developers must discover by reading the model that `booking_count` exists and decide independently how to increment it.

**Risk:** RGDEV-205 may implement a non-atomic increment, increment at the wrong lifecycle point (checkout initiation vs. payment confirmation), or omit the increment entirely.
**Recommendation:** Add a convenience method to `BookingLink`:
```python
@classmethod
def record_booking(cls, booking_link_id):
    """Atomically increment booking_count. Call from payment confirmation."""
    cls.objects.filter(pk=booking_link_id, is_active=True).update(
        booking_count=F('booking_count') + 1
    )
```

### [LOW] 9.4 — Stale slug in checkout session — no issue

**Finding:** The `booking_link_id` (UUID) is stable across slug changes. A client who resolved a slug and stored the `booking_link_id` can complete checkout even if the slug changes mid-session. The UUID remains valid.

---

## Scenario 10: Additional Findings (Not in Prompt)

### [HIGH] 10.1 — Migration 0001_initial.py is missing

**File:** `apps/booking_link/migrations/` (empty directory)
**Finding:** No migration file exists. The `BookingLink` and `SlugRedirect` tables have not been created in the database. All endpoints will fail with `ProgrammingError: relation "booking_link_bookinglnk" does not exist`.

**Risk:** The entire feature is non-functional without the migration.
**Recommendation:** Run `python manage.py makemigrations booking_link` and commit the generated migration.

### [MEDIUM] 10.2 — ResolveBookingLinkSerializer is dead code

**File:** `apps/booking_link/serializers.py` lines 24-33; `apps/booking_link/views.py`
**Finding:** `ResolveBookingLinkSerializer` is defined but never imported or used in `views.py`. The `/resolve/` and `/og-meta/` views return raw dicts from `_build_og_meta()`. The serializer class in `serializers.py` does not match the actual response shape (missing `provider_name`, `provider_photo_url`; includes fields the view doesn't return through the serializer).

**Risk:** Developer confusion. The serializer suggests a different API contract than what is actually served.
**Recommendation:** Either use the serializer to validate/render the response, or remove it.

### [MEDIUM] 10.3 — Signal imports _get_provider_slug from views.py — tight coupling

**File:** `apps/booking_link/signals.py` line 12
**Finding:** `from .views import _get_provider_slug`. This creates a circular-dependency risk (signals imported from apps.py ready(), views imported from signals). Currently works because `_connect_signals()` defers the import inside the function body. However, this couples signal logic to the views module. If `views.py` is refactored or the function is renamed, the signal breaks silently (caught by the bare `except Exception` on line 35).

**Risk:** Fragile coupling. The bare `except Exception` on line 35 will swallow `ImportError` and any other failure, making debugging difficult.
**Recommendation:** Move `_get_provider_slug()` to `utils.py` (which has no imports from the booking_link app). Narrow the exception handler on line 35 to catch only `IntegrityError`.

### [MEDIUM] 10.4 — Broad exception handling throughout views.py

**File:** `apps/booking_link/views.py` lines 79, 115, 134, 189
**Finding:** Multiple views use bare `except Exception:` to catch the case where a user has no `care_provider` or no `booking_link`. This catches ALL exceptions including database errors, connection failures, and programming errors, returning a misleading 404 instead of a 500 with a proper traceback.

**Risk:** Database outages or coding errors are silently swallowed and returned as "not found" responses, making production debugging very difficult.
**Recommendation:** Catch specific exceptions:
```python
except (CareProvider.DoesNotExist, BookingLink.DoesNotExist):
    return Response(...)
```

### [MEDIUM] 10.5 — /generate/ reactivation silently refreshes slug without creating SlugRedirect

**File:** `apps/booking_link/views.py` lines 96-100
**Finding:** When `/generate/` is called on a deactivated link, it reactivates AND updates `slug_snapshot` to the current handle (line 99). If the handle changed while the link was deactivated, this overwrites `slug_snapshot` without creating a `SlugRedirect` for the old value. The old slug is lost.

**Risk:** QR codes or shared links using the old slug will break after reactivation with a new handle.
**Recommendation:** Before updating `slug_snapshot`, create a `SlugRedirect` for the old value if it differs:
```python
if bl.slug_snapshot != slug:
    SlugRedirect.objects.get_or_create(old_slug=bl.slug_snapshot, defaults={'booking_link': bl})
    bl.slug_snapshot = slug
```

---

## Summary Table

| Severity | Scenario | Check | Description |
|---|---|---|---|
| CRITICAL | 1 | 1.1 | Signal on CareProvider.post_save misses handle changes via User.save() in GraphQL mutations |
| CRITICAL | 9 | 9.2 | Appointment model has no booking_link attribution field |
| HIGH | 4 | 4.1 | No rate limiting on public /track-click/ endpoint |
| HIGH | 8 | 8.3 | No recovery mechanism for slug_snapshot divergence |
| HIGH | 9 | 9.1 | /resolve/ response missing fee_tier; ResolveBookingLinkSerializer is dead code |
| HIGH | 9 | 9.3 | No defined protocol for booking_count increment |
| HIGH | 10 | 10.1 | Migration 0001_initial.py is missing — feature non-functional |
| MEDIUM | 1 | 1.2 | get_or_create on SlugRedirect includes booking_link in filter — edge case |
| MEDIUM | 3 | 3.3 | Soft-deleted providers still resolve via booking link |
| MEDIUM | 6 | 6.3 | og_title falls back to full email address — privacy leak |
| MEDIUM | 7 | 7.2 | Email fallback in slug not run through slugify() — may produce invalid slugs |
| MEDIUM | 8 | 8.1 | /resolve/ response missing fee_tier for RGDEV-205 |
| MEDIUM | 10 | 10.2 | ResolveBookingLinkSerializer is dead code — never used by views |
| MEDIUM | 10 | 10.3 | Signal imports _get_provider_slug from views — tight coupling + bare except |
| MEDIUM | 10 | 10.4 | Broad except Exception handlers mask real errors |
| MEDIUM | 10 | 10.5 | /generate/ reactivation refreshes slug without creating SlugRedirect |
| LOW | 1 | 1.3 | No BookingLink at handle-change time — handled correctly |
| LOW | 1 | 1.4 | Concurrent /generate/ race — low probability |
| LOW | 1 | 1.5 | slug_snapshot not unique at DB level — mitigated by upstream constraint |
| LOW | 2 | 2.1 | /resolve/ returns inactive links with is_active flag — correct |
| LOW | 2 | 2.2 | Deactivation preserves counts — correct |
| LOW | 2 | 2.3 | /track-click/ blocks inactive links — correct |
| LOW | 3 | 3.1 | CASCADE chain correct |
| LOW | 3 | 3.2 | Post-deletion /resolve/ returns graceful response |
| LOW | 4 | 4.2 | No click deduplication — MVP-acceptable |
| LOW | 4 | 4.3 | Atomic F() increment — correct |
| LOW | 4 | 4.4 | booking_count not incremented in RGDEV-204 — correct |
| LOW | 5 | 5.1-5.4 | QR code: production URL, owner-auth, redirect after slug change — all correct |
| LOW | 6 | 6.1 | og_image null handling — correct |
| LOW | 6 | 6.2 | og_description fallback — adequate |
| LOW | 6 | 6.4 | No sensitive data exposed (except email per 6.3) |
| LOW | 6 | 6.5 | og_url uses canonical slug — correct |
| LOW | 7 | 7.1 | get_or_create idempotency — correct |
| LOW | 7 | 7.3 | Regeneration returns current state — correct |
| LOW | 8 | 8.2 | click_count vs booking_count gap — MVP-acceptable |
| LOW | 8 | 8.4 | make_profile_handle produces valid slug — correct |
| LOW | 9 | 9.4 | Stale slug in checkout session — no issue |

---

## Must-Fix-Before-Merge List (CRITICAL + HIGH)

1. **[CRITICAL] 1.1** — Add a `post_save` signal on `User` (or `pre_save` to capture old handle) so that handle changes via GraphQL mutation trigger slug sync and SlugRedirect creation.
2. **[CRITICAL] 9.2** — Coordinate with RGDEV-205 to add a `booking_link` FK on the `Appointment` model for attribution tracking.
3. **[HIGH] 10.1** — Run `python manage.py makemigrations booking_link` and commit the migration.
4. **[HIGH] 4.1** — Add rate limiting to `/track-click/` endpoint (e.g., `AnonRateThrottle` at 60/hour).
5. **[HIGH] 8.3** — Fix signal trigger (resolves automatically when 1.1 is fixed). Add a management command for drift detection.
6. **[HIGH] 9.1** — Add `fee_tier` to `/resolve/` response. Clean up or use `ResolveBookingLinkSerializer`.
7. **[HIGH] 9.3** — Add `BookingLink.record_booking()` class method as the defined increment protocol for RGDEV-205.

---

## Missing Implementation Checklist

| Item | Status | Minimum Spec |
|---|---|---|
| `migrations/0001_initial.py` | Missing | Run `makemigrations booking_link` |
| Signal on `User.post_save` | Missing | Detect `profile_handle` changes, sync `slug_snapshot`, create `SlugRedirect` |
| Rate limiting on `/track-click/` | Missing | `AnonRateThrottle` with rate `60/hour` |
| `fee_tier` in `/resolve/` response | Missing | Static value `"reduced"` or `10` in `_build_og_meta()` return dict |
| `BookingLink.record_booking()` method | Missing | Atomic `F()` increment of `booking_count`, documented for RGDEV-205 |
| `Appointment.booking_link` FK | Missing (RGDEV-205 scope) | `ForeignKey('booking_link.BookingLink', null=True, blank=True, on_delete=SET_NULL)` |
| Management command for slug drift audit | Missing | Compare `slug_snapshot` vs `user.profile_handle` for all BookingLinks |
| `_get_provider_slug()` in `utils.py` | Misplaced (in views.py) | Move to `utils.py`, apply `slugify()` to email fallback |
