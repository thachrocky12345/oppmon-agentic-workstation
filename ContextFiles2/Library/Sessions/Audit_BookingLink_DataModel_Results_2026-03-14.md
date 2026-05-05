# Technical Audit: RGDEV-204 Booking Link Implementation

**Date**: 2026-03-14
**Auditor**: Principal Engineer (automated)
**Scope**: `apps/booking_link/` — all files
**Verdict**: **Go with conditions** (3 Critical, 4 High, 8 Medium, 6 Low)

---

## Findings Table

| ID | Area | Severity | File | Line | Finding | Fix Recommendation |
|----|------|----------|------|------|---------|-------------------|
| 1 | Model | **CRITICAL** | `models.py` | 20 | `slug_snapshot` is NOT `unique=True`. Two providers could receive the same slug (e.g., two "Jane Doe" accounts). `_resolve_slug()` uses `.get(slug_snapshot=slug)` which will raise `MultipleObjectsReturned` if duplicates exist. | Add `unique=True` to `slug_snapshot` on `BookingLink`. Implement collision-avoidance logic in `_get_provider_slug()` (append numeric suffix). |
| 2 | Model | **CRITICAL** | `models.py` | 36 | `SlugRedirect.old_slug` has `unique=True` globally, not scoped to `booking_link`. If Provider A once had slug "dr-smith" and Provider B currently has slug "dr-smith", the redirect entry for A cannot coexist with B's current slug. The constraint also prevents two different providers from ever having redirected from the same slug. | Change to `UniqueConstraint(fields=['old_slug', 'booking_link'])` in Meta, or keep global unique but add validation that `old_slug` does not collide with any current `BookingLink.slug_snapshot`. |
| 3 | API | **CRITICAL** | `views.py` | 56-68 | `_build_og_meta()` returns `care_provider_id` (integer PK from `CareProvider`, which uses `BaseModel` with sequential `BigAutoField`). Public endpoints `/resolve/` and `/og-meta/` expose this, enabling provider enumeration by iterating integer IDs. | Remove `care_provider_id` from public response payloads. Only include it in authenticated `/my/` responses if needed by the frontend. |
| 4 | Signal | **HIGH** | `signals.py` | 29-30 | `SlugRedirect.objects.get_or_create(old_slug=old_slug, booking_link=bl)` uses `get_or_create` which is good for the `(old_slug, booking_link)` pair, but since `old_slug` has a global unique constraint (finding #2), this will raise `IntegrityError` if another provider's redirect already owns that slug value. The bare `except Exception` on line 35 silently swallows this, and the slug update on line 29-30 never executes — the provider's `slug_snapshot` silently fails to update. | Fix the unique constraint per finding #2. Also, log the specific exception class, not bare `Exception`. |
| 5 | Signal | **HIGH** | `signals.py` | 29-30 | No `select_for_update()` or `transaction.atomic()` around the read-compare-write cycle (`bl.slug_snapshot == new_slug` check, then `SlugRedirect.create`, then `bl.save`). Two concurrent `CareProvider.save()` calls can both read the old slug, both create a redirect, and one fails silently. | Wrap in `transaction.atomic()` and use `BookingLink.objects.select_for_update().get(pk=bl.pk)` before comparison. |
| 6 | Model | **HIGH** | `models.py` | 21 | `click_count = models.IntegerField(default=0)` allows negative values. Should be `PositiveIntegerField` or `PositiveBigIntegerField` to prevent underflow and to be semantically correct. `PositiveBigIntegerField` is preferred for a public URL counter. Same issue for `booking_count` on line 22. | Change both to `models.PositiveBigIntegerField(default=0)`. |
| 7 | API | **HIGH** | `views.py` | 168-178 | `/track-click/` uses UUID PK in the URL (`<uuid:pk>`), but the audit prompt specifies the endpoint should use `<slug>`. Using the PK means the frontend must know the BookingLink UUID — which is an internal identifier. The slug is the public identifier and should be used for public endpoints. | Change URL to `track-click/<slug:slug>/` and filter by `slug_snapshot=slug` instead of `pk=pk`. |
| 8 | API | **MEDIUM** | `views.py` | 75-103 | `/generate/` response does not use the project standard envelope `{"status": <int>, "message": "<str>", "data": {}, "error": null}`. It returns raw serializer data. Same for all other views. | Wrap all responses in the standard envelope. Example: `{"status": 200, "message": "Booking link generated.", "data": serializer.data, "error": null}`. |
| 9 | API | **MEDIUM** | `views.py` | 117 | `/my/` error response uses `{'detail': 'No Booking Link found.'}` which is the DRF default shape. The `/generate/` error uses `{'error': '...'}`. Inconsistent with each other AND with the project envelope. | Standardize all error responses to the project envelope format. |
| 10 | API | **MEDIUM** | `views.py` | 147-164 | `/resolve/` does NOT check `is_active` on the resolved `BookingLink`. An inactive (deactivated) link resolves successfully with `is_active: True` in the response if the underlying `BookingLink.is_active` happens to be True. More precisely: the `is_active` field IS returned, but the endpoint makes no behavioral distinction — it returns the full OG meta for inactive links. The frontend must handle this, but the API gives no signal to redirect vs display. | Document the contract: `/resolve/` always returns the link's current state; the frontend decides behavior. OR: return a distinct `"status": "inactive"` payload when `bl.is_active is False`. |
| 11 | API | **MEDIUM** | `views.py` | 168-178 | `/track-click/` has zero rate limiting. Any client can inflate click counts with a simple loop. | Add `django-ratelimit` or a Redis-backed rate limiter (e.g., 10 clicks per IP per minute per slug). |
| 12 | Serializer | **MEDIUM** | `serializers.py` | 24-33 | `ResolveBookingLinkSerializer` is defined but never used — `_build_og_meta()` returns a raw dict. The serializer provides validation and documentation; not using it means the response shape is undocumented and could drift. | Use `ResolveBookingLinkSerializer` in `/resolve/` and `/og-meta/` views to serialize the response dict, or remove the dead code. |
| 13 | Test | **MEDIUM** | `tests.py` | 300-307 | `test_slug_redirect_unique` uses `self.assertRaises(Exception)` which is too broad — it would pass even on unrelated errors. Should assert `IntegrityError` specifically. | Change to `from django.db import IntegrityError` and `self.assertRaises(IntegrityError)`. |
| 14 | Test | **MEDIUM** | `tests.py` | — | Missing test: no test for `BookingLink` OneToOneField enforcement (creating two BookingLinks for the same CareProvider should raise `IntegrityError`). | Add a test that attempts `BookingLink.objects.create(care_provider=same_cp, ...)` twice and asserts `IntegrityError`. |
| 15 | Test | **MEDIUM** | `tests.py` | — | Missing edge case test: provider with no `profile_pic` (empty string) — `/og-meta/` should return `og_image: null`. The `_build_og_meta` code checks `if user.profile_pic:` but `profile_pic` defaults to `""` (empty string) which is falsy, so this works — but there is no test covering it. | Add a test that creates a provider with no profile pic and verifies `og_image` is null. |
| 16 | Model | **LOW** | `models.py` | 20 | `slug_snapshot` has `db_index=True` which is redundant if `unique=True` is added (unique implies an index). Harmless but noisy. | Remove `db_index=True` if `unique=True` is added. |
| 17 | Model | **LOW** | `models.py` | 36 | `SlugRedirect.old_slug` has both `unique=True` and `db_index=True`. `unique=True` implies an index. | Remove `db_index=True`. |
| 18 | Model | **LOW** | `models.py` | 12 | `BookingLink.id` uses UUID PK — intentional deviation from project default (BigAutoField). This is acceptable since BookingLink IDs appear in URLs (`/track-click/<uuid:pk>/`, `/qr/<uuid:pk>/`) and sequential IDs would be enumerable. Note: this means the FK from `SlugRedirect.booking_link` stores a UUID, not an integer. Migration is consistent. | Accepted deviation. Document rationale in model docstring. |
| 19 | URL | **LOW** | `urls.py` | — | No `app_name = 'booking_link'` set for URL namespacing. Consistent with rest of project (no other app uses `app_name`). | No action needed — consistent with project convention. |
| 20 | Admin | **LOW** | `admin.py` | — | `BookingLinkAdmin.list_display` includes `id` which is a UUID — renders as a long hex string in the admin list view. Not great UX for ops. | Use a `short_id` method that displays first 8 chars, or remove `id` from `list_display`. |
| 21 | View | **LOW** | `views.py` | 19-22 | `_get_provider_slug` falls back to `user.email.split('@')[0]` which can produce non-URL-safe slugs (e.g., `john.doe+test` from `john.doe+test@gmail.com`). `SlugField` will accept this at the model level since Django's `SlugField` with `allow_unicode=False` only validates on forms, not on `Model.save()`. | Pass the email fallback through `django.utils.text.slugify()` before returning. |

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 4 |
| Medium | 8 |
| Low | 6 |
| **Total** | **21** |

---

## Merge Recommendation

**Go with conditions.** The three Critical issues (#1, #2, #3) and four High issues (#4-#7) must be resolved before merge. The Medium issues should ideally be resolved but can be accepted as fast-follow if there is schedule pressure.

---

## Top 3 Risks if Merged As-Is

1. **`MultipleObjectsReturned` crash on `/resolve/`** (Finding #1): Two providers with the same generated slug (e.g., both named "Jane Doe") will cause a 500 error on every resolve request for that slug. This is a production outage for affected providers.

2. **Silent slug update failures** (Findings #2 + #4): The global `unique=True` on `SlugRedirect.old_slug` combined with the bare `except Exception` in the signal means slug changes can silently fail. A provider changes their name, the booking link slug does not update, the old URL does not get a redirect entry, and nobody is alerted. Stale links persist indefinitely.

3. **Provider enumeration via public endpoints** (Finding #3): `/resolve/` and `/og-meta/` return `care_provider_id` as a sequential integer. An attacker can iterate IDs to build a complete provider directory including names and profile photos, bypassing any search/discovery controls the platform intends to enforce.

---

## Positive Observations

- **Signal wiring is correct**: `AppConfig.ready()` imports signals via `_connect_signals()` — avoids double-connect issues.
- **Click tracking uses atomic F()**: `BookingLink.objects.filter(pk=pk).update(click_count=F('click_count') + 1)` is the correct race-free pattern.
- **`get_or_create` on `/generate/`**: Idempotency is correctly handled.
- **QR ownership check**: `/qr/` correctly filters by `care_provider=cp`, preventing cross-provider access.
- **Never-404 on `/resolve/`**: Correctly returns 200 with a "not found" payload rather than raising Http404.
- **Good test coverage baseline**: 8 test classes, ~25 test methods covering happy paths and key failure modes.
- **Admin is well-configured**: Inline `SlugRedirect` display, appropriate search/filter/readonly fields.
- **Migration is clean**: Only `CreateModel` operations on new tables; no modifications to existing tables; fully reversible.
- **Dependency (`qrcode[pil]>=7.4.2`) is in `requirements.txt`**: No missing pip dependency.
- **`apps.booking_link` is in `INSTALLED_APPS`** and URL is included under `/api/v1/booking-link/` prefix.
