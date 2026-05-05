# Audit Prompt: BookingLink Feature — Data Model, API, Signal, and Security Review

**Scope**: `apps/booking_link/` in `Lumy-Backend/`
**Auditor level**: Principal engineer
**Execution mode**: Read all listed files, check every item, report findings as PASS / FAIL / WARN with exact evidence (file + line number). Do not infer — read the source.

---

## Files to Read Before Starting

Read all of these before answering any check:

1. `apps/booking_link/models.py`
2. `apps/booking_link/migrations/0001_initial.py`
3. `apps/booking_link/serializers.py`
4. `apps/booking_link/views.py`
5. `apps/booking_link/signals.py`
6. `apps/booking_link/apps.py`
7. `apps/booking_link/urls.py`
8. `apps/booking_link/utils.py`
9. `apps/booking_link/admin.py`
10. `apps/authentication/models.py` (lines 1–200) — for `BaseModel`, `User.profile_handle`, `User.profile_pic`
11. `apps/care_provider/models.py` (lines 885–960) — for `CareProvider` definition and `user` OneToOne
12. `lumy_global/settings.py` — for `INSTALLED_APPS`
13. `lumy_global/urls.py` — for booking-link URL include
14. `requirements.txt` — for `qrcode` dependency
15. `apps/booking_link/tests.py` (if it exists) — for test coverage

---

## Section 1: Data Model Correctness

### 1.1 BaseModel Inheritance

- Read `apps/authentication/models.py` lines 45–57.
- Confirm `BaseModel` is abstract and provides exactly: `created_at (DateTimeField, auto_now_add, db_index=True)`, `modified_at (DateTimeField, auto_now, db_index=True)`, `is_active (BooleanField, default=True)`.
- Read `apps/booking_link/models.py` line 7.
- VERIFY: `BookingLink` inherits from `BaseModel` (not `models.Model` directly).
- VERIFY: `SlugRedirect` does NOT inherit `BaseModel` — it uses its own `created_at = DateTimeField(auto_now_add=True)`. Confirm this is intentional (SlugRedirect is an audit log, never deactivated; no `is_active` or `modified_at` needed). Flag if the omission is undocumented.

### 1.2 Migration vs Model Parity

Read `apps/booking_link/migrations/0001_initial.py` and `apps/booking_link/models.py` side by side.

Check every field on `BookingLink` against the migration:

| Model field | Expected in migration |
|---|---|
| `created_at` | `DateTimeField(auto_now_add=True, db_index=True)` |
| `modified_at` | `DateTimeField(auto_now=True, db_index=True)` |
| `is_active` | `BooleanField(default=True)` |
| `id` | `UUIDField(primary_key=True, default=uuid.uuid4, editable=False)` |
| `care_provider` | `OneToOneField(to="care_provider.careprovider", on_delete=CASCADE, related_name="booking_link")` |
| `slug_snapshot` | `SlugField(max_length=255, db_index=True)` |
| `click_count` | `IntegerField(default=0)` |
| `booking_count` | `IntegerField(default=0)` |

Check every field on `SlugRedirect`:

| Model field | Expected in migration |
|---|---|
| `id` | `BigAutoField(auto_created=True, primary_key=True)` |
| `old_slug` | `SlugField(max_length=255, unique=True)` — NOTE: model has `db_index=True` too; VERIFY migration has `db_index=True` set or that `unique=True` implies an index (it does in PostgreSQL, but check if `db_index` is also explicitly set) |
| `created_at` | `DateTimeField(auto_now_add=True)` |
| `booking_link` | `ForeignKey(to="booking_link.bookinglink", on_delete=CASCADE, related_name="slug_redirects")` |

FAIL condition: Any field present in the model but absent or different in the migration.
WARN condition: `SlugRedirect.old_slug` has `db_index=True` in the model but the migration may not explicitly emit it (it is implied by `unique=True`, but the explicit flag could be a documentation mismatch).

### 1.3 Migration Dependency Chain

- Read `apps/booking_link/migrations/0001_initial.py` lines 10–13.
- The declared dependency is `("care_provider", "0050_alter_countrycode_options_and_more")`.
- Run: `ls apps/care_provider/migrations/ | sort | tail -5` to find the actual latest care_provider migration.
- VERIFY the dependency points to the LATEST care_provider migration at time of creation, not an older one. If care_provider has migrations newer than `0050`, the dependency is stale and a squash or re-dependency may be needed.
- VERIFY there is no dependency on `apps.authentication` (BookingLink only directly references `care_provider.CareProvider`; BaseModel is abstract and does not need a migration dependency).

### 1.4 OneToOne Relationship Semantics

- `BookingLink.care_provider` is a `OneToOneField` — this enforces exactly-one-booking-link-per-provider at the database level.
- VERIFY: `on_delete=CASCADE` is correct (deleting a CareProvider must delete their BookingLink; confirm this is the intended business rule and not `SET_NULL` or `PROTECT`).
- VERIFY: `related_name='booking_link'` matches the accessor used in views (`cp.booking_link`, `instance.booking_link`) and signals (`instance.booking_link`).

### 1.5 Missing Constraints and Defaults

- `slug_snapshot`: No `blank=True` or `null=True` — it is required at creation. VERIFY: `BookingLinkGenerateView.post()` always supplies a slug before calling `get_or_create`. If `_get_provider_slug` returns an empty string, is the 400 guard reached before `get_or_create`? Read views.py lines 85–95 carefully.
- `click_count` and `booking_count`: Both default=0, no null. VERIFY these cannot go negative — there is no constraint. Note as WARN if no floor enforcement exists.
- No `UniqueConstraint` beyond the OneToOne FK. This is correct — the OneToOne on `care_provider` already enforces uniqueness.

### 1.6 Meta Options

- `BookingLink.Meta.ordering = ['-created_at']`. VERIFY: `created_at` is indexed in the migration (`db_index=True`). If yes, ORDER BY will use the index.
- `SlugRedirect` has no `Meta.ordering`. This is acceptable for an audit log but note for completeness.

---

## Section 2: Signal Correctness

### 2.1 Signal Registration Pattern

- Read `apps/booking_link/apps.py`.
- VERIFY: `ready()` imports `_connect_signals` from `signals.py` and calls it. This is the correct Django pattern for deferred signal registration.
- Read `apps/booking_link/signals.py`.
- VERIFY: `_connect_signals()` is a plain function (not a class method), imports `CareProvider` inside the function body (deferred to avoid AppRegistryNotReady), and uses the `@receiver` decorator to register `sync_booking_link_slug` on `post_save, sender=CareProvider`.
- WARN: The `@receiver` decorator inside a function creates a closure. Each time `_connect_signals()` is called, a NEW handler is registered. If `ready()` were called more than once (e.g., test setup), the signal would fire multiple times per save. VERIFY that Django's `AppConfig.ready()` is only called once per process (it is, by design), but flag this as a latent risk if the signal registration is ever moved to a non-`ready()` call site.

### 2.2 Signal Fires on the Correct Model

- The signal listens to `post_save, sender=CareProvider`.
- `profile_handle` lives on `User` (read `apps/authentication/models.py` line 160), NOT on `CareProvider`.
- CRITICAL CHECK: When a provider's `profile_handle` changes, which model is saved — `User` or `CareProvider`?
  - If the frontend/API updates `User.profile_handle` by calling a User-update endpoint, `CareProvider.post_save` will NOT fire.
  - Read `apps/authentication/views.py` or `apps/care_provider/views.py` to determine which endpoint handles `profile_handle` updates. Search for `profile_handle` in both files.
  - If `profile_handle` is updated on the `User` model directly without a corresponding `CareProvider.save()`, the signal will never trigger and `slug_snapshot` will silently go stale.
- FAIL condition: If `profile_handle` is written via a User-only save path with no `CareProvider` save, the signal is wired to the wrong model and slug sync is broken.
- PASS condition: If `profile_handle` updates always trigger a `CareProvider` save (e.g., a care provider profile serializer saves both), the signal is correct.

### 2.3 Slug Comparison Logic

- Read `signals.py` lines 22–23: `new_slug = _get_provider_slug(instance)` then `if not new_slug or bl.slug_snapshot == new_slug: return`.
- VERIFY: `_get_provider_slug` is imported from `views.py`. This creates a coupling between signals and views. Flag as WARN — `_get_provider_slug` should be moved to `utils.py` or a shared helper so it can be tested independently of the view layer.
- VERIFY: The no-op guard `bl.slug_snapshot == new_slug` prevents unnecessary `SlugRedirect` creation on saves that don't change the handle.

### 2.4 Infinite Loop Risk

- `sync_booking_link_slug` calls `bl.save(update_fields=['slug_snapshot', 'modified_at'])`.
- `bl` is a `BookingLink`, not a `CareProvider`. The signal listens to `CareProvider`, so saving `BookingLink` will NOT re-trigger the signal.
- PASS: No infinite loop is possible via the signal chain.

### 2.5 Missing BookingLink Handling

- Read `signals.py` lines 17–19: accesses `instance.booking_link` inside a try/except for `BookingLink.DoesNotExist`.
- VERIFY: `instance.booking_link` raises `BookingLink.DoesNotExist` (not `RelatedObjectDoesNotExist` or `AttributeError`) when no BookingLink exists for the provider. Django's `OneToOneField` reverse accessor raises `RelatedObjectDoesNotExist`, which is a subclass of `BookingLink.DoesNotExist` AND `AttributeError`. The bare `except BookingLink.DoesNotExist` should catch it correctly.
- WARN: If the import of `BookingLink` inside `_connect_signals` fails for any reason (circular import, misconfiguration), the bare except will swallow the error silently. Consider logging on exception.

---

## Section 3: API Correctness

### 3.1 All 7 Endpoints Present and Mapped

Read `apps/booking_link/urls.py` and verify all 7 URL patterns:

| URL pattern | View class | HTTP method | Permission |
|---|---|---|---|
| `generate/` | `BookingLinkGenerateView` | POST | `IsAuthenticated` |
| `my/` | `BookingLinkMyView` | GET | `IsAuthenticated` |
| `deactivate/` | `BookingLinkDeactivateView` | POST | `IsAuthenticated` |
| `resolve/<slug:slug>/` | `BookingLinkResolveView` | GET | `AllowAny` |
| `track-click/<uuid:pk>/` | `BookingLinkTrackClickView` | POST | `AllowAny` |
| `qr/<uuid:pk>/` | `BookingLinkQrView` | GET | `IsAuthenticated` |
| `og-meta/<slug:slug>/` | `BookingLinkOgMetaView` | GET | `AllowAny` |

FAIL: Any missing pattern or wrong view mapping.
WARN: `track-click` uses `<uuid:pk>` — this means a caller must know the BookingLink UUID. Confirm the frontend has access to this value (it is returned by `generate/` and `my/`).

### 3.2 Permission Semantics

- `generate/`, `my/`, `deactivate/`: `IsAuthenticated` — correct, these are provider-scoped mutations.
- `resolve/<slug>/`, `og-meta/<slug>/`: `AllowAny` — correct, these are public-facing for clients and SSR.
- `track-click/<uuid:pk>/`: `AllowAny` — this means anyone can POST to this endpoint with any UUID. There is no rate limiting. NOTE as WARN: without rate limiting, this endpoint can be used to inflate `click_count` arbitrarily. A TODO comment or throttle class should be present.
- `qr/<uuid:pk>/`: `IsAuthenticated` — VERIFY that the view additionally checks `care_provider=cp` (read views.py lines 187–188). Confirm the lookup is `BookingLink.objects.get(pk=pk, care_provider=cp)` and not just `pk=pk`. If only `pk=pk`, any authenticated user could fetch any provider's QR code.

### 3.3 `_resolve_slug` Efficiency

- Read `views.py` lines 26–41.
- VERIFY: Primary lookup uses `select_related('care_provider__user')` — this fetches the full join in one SQL query instead of N+1.
- VERIFY: Fallback SlugRedirect lookup uses `select_related('booking_link__care_provider__user')` — also one query.
- VERIFY: Both lookups use indexed fields (`slug_snapshot` has `db_index=True`; `old_slug` has `unique=True` implying an index).
- WARN: `_resolve_slug` is called in both `BookingLinkResolveView` and `BookingLinkOgMetaView` for the same slug in some flows (e.g., SSR pre-render followed by a client resolve). This is acceptable but note the double DB hit if both endpoints are called for the same slug in quick succession.

### 3.4 `track-click` Atomic F() Expression

- Read `views.py` lines 173–174: `BookingLink.objects.filter(pk=pk, is_active=True).update(click_count=F('click_count') + 1)`.
- VERIFY: Uses `F()` expression — this translates to a single `UPDATE ... SET click_count = click_count + 1` with no read-modify-write race condition.
- VERIFY: The filter includes `is_active=True` — clicks on deactivated links are silently rejected with a 404, which is correct.
- VERIFY: Return value `updated` (0 or 1) is checked and a 404 is returned if the record was not found or was inactive.

### 3.5 `generate/` Idempotency and Reactivation

- Read `views.py` lines 92–103.
- VERIFY: Uses `get_or_create(care_provider=cp, defaults=...)` — this is idempotent; calling `generate/` multiple times for the same provider does not create duplicate records.
- VERIFY: If `not created and not bl.is_active`, the view reactivates and refreshes the slug. The `save(update_fields=[...])` call includes `'modified_at'` — but `modified_at` is `auto_now=True` and will be set automatically; including it in `update_fields` is redundant but harmless.
- CHECK: If the existing `bl` is active (`not created and bl.is_active`), the slug is NOT refreshed. If the provider changed their `profile_handle` between the original `generate/` call and this call, and the signal failed to fire, the slug will be stale. This is a latent data quality risk — flag as WARN.

### 3.6 `_get_provider_slug` Fallback Behavior

- Read `views.py` lines 16–22.
- VERIFY: Primary path checks `hasattr(user, 'profile_handle') and user.profile_handle` — returns the slug if set.
- VERIFY: Fallback returns `user.email.split('@')[0]` — the email prefix. This can produce non-URL-safe characters if the email prefix contains `+`, `.` or `%`.
- FAIL condition: If `user.email.split('@')[0]` contains characters not valid in a `SlugField`, the `slug_snapshot` save will raise a validation error (or silently truncate/corrupt the value depending on DB settings).
- CHECK: Is there any slug sanitization applied to the fallback value? If not, flag as a bug.

---

## Section 4: Serializer Correctness

### 4.1 BookingLinkSerializer Fields

- Read `serializers.py` lines 5–21.
- VERIFY: All exposed fields are read-only (the `read_only_fields = fields` pattern). Since `fields` is defined as a list literal in `Meta`, this assignment works but is unusual — confirm Django REST Framework accepts a list here (it does, as it iterates it).
- VERIFY: `booking_link_url` is a `SerializerMethodField` — not stored in DB. It constructs `/book/{slug_snapshot}` using `request.build_absolute_uri` (preferred) with a hardcoded fallback of `https://really.global/book/{slug}`. Confirm the fallback domain matches the production domain.
- VERIFY: `care_provider` field is NOT exposed in this serializer. This is intentional for the provider's own view (they already know their own provider ID). But `ResolveBookingLinkSerializer` does expose `care_provider_id`. Confirm there is no PII leak in the public serializer.

### 4.2 ResolveBookingLinkSerializer Shape vs View Output

- Read `serializers.py` lines 24–33.
- Read `views.py` lines 55–68 (`_build_og_meta`).
- VERIFY: Every key returned by `_build_og_meta` is declared in `ResolveBookingLinkSerializer`. Note that `_build_og_meta` returns two EXTRA keys not in the serializer: `provider_name` and `provider_photo_url`.
- CHECK: `BookingLinkOgMetaView` calls `Response(_build_og_meta(bl, redirect_to))` directly — it does NOT pass through `ResolveBookingLinkSerializer`. The serializer therefore does NOT validate/filter the response. The extra keys (`provider_name`, `provider_photo_url`) are passed through raw.
- WARN: `BookingLinkResolveView` also calls `Response(_build_og_meta(...))` directly. Neither view uses `ResolveBookingLinkSerializer` as the output serializer. The serializer is effectively orphaned documentation. Flag this inconsistency — either use the serializer to serialize the output (which would strip unrecognized fields and validate types), or remove it.
- CHECK: `ResolveBookingLinkSerializer.care_provider_id` is declared as `IntegerField`. Read `apps/care_provider/models.py` to confirm `CareProvider.pk` is an integer (auto-generated). VERIFY it is not a UUID.

### 4.3 read_only_fields Pattern

- `BookingLinkSerializer.Meta.read_only_fields = fields` — this references the same list object as `fields`. In some DRF versions this can cause issues if the list is mutated. Confirm DRF version in `requirements.txt`. Flag as WARN if DRF < 3.14.

---

## Section 5: Security

### 5.1 Provider Isolation on QR Endpoint

- Read `views.py` lines 185–195 (`BookingLinkQrView.get`).
- The lookup is `BookingLink.objects.get(pk=pk, care_provider=cp)` where `cp = request.user.care_provider`.
- VERIFY: This is a two-predicate lookup — both the UUID and the care_provider FK must match. A provider cannot retrieve another provider's QR code by guessing the UUID.
- PASS if both predicates are present.
- FAIL if the lookup is only `pk=pk` with no `care_provider` check.

### 5.2 `track-click` Rate Limiting

- Read `views.py` lines 168–178.
- `AllowAny` + no throttle class. Check: is there a `throttle_classes` attribute on `BookingLinkTrackClickView`?
- If absent, flag as WARN: without rate limiting, this endpoint can be used to artificially inflate `click_count` for any active BookingLink UUID. Recommend adding `throttle_classes = [AnonRateThrottle]` with a permissive rate (e.g., `10/minute`).

### 5.3 PII Exposure in Public Endpoints

- `BookingLinkResolveView` and `BookingLinkOgMetaView` both call `_build_og_meta`.
- Read `views.py` lines 44–68.
- `_build_og_meta` exposes: `provider_name` (first + last name), `provider_photo_url` (profile pic URL), `care_provider_id` (integer PK).
- CHECK: Is exposing the provider's full name and photo in a public unauthenticated endpoint consistent with the privacy policy? Read `ContextFiles2/CompanyContext/privacy-data-handling.md` if needed. Providers publish their name and photo publicly on the platform, so this is expected — but confirm.
- CHECK: `user.email` is NOT exposed in any public endpoint. VERIFY by reading `_build_og_meta` — email is only used as a fallback for `provider_name` display, never returned directly. PASS if confirmed.
- NOTE: `User.profile_pic` is a `TextField` (read `authentication/models.py` line 84), meaning it stores a URL string. If it stores a presigned S3 URL with expiry, the OG image URL returned to the public could expire. Flag as WARN if presigned URLs are used.

### 5.4 Unauthenticated `resolve/` and `og-meta/` Endpoints

- Both endpoints return `is_active=False` with a 200 status (not 404) when no provider is found. This prevents enumeration-by-status-code but may confuse clients that check HTTP status.
- VERIFY: The "not found" response shape for `BookingLinkResolveView` (lines 151–164) includes all required keys expected by the frontend. Specifically, confirm `booking_link_id: null` and `care_provider_id: null` are handled gracefully by the frontend.
- WARN: Returning 200 for a non-existent slug means frontend code must inspect `is_active` or `booking_link_id === null` rather than catching a 404. This is a deliberate design choice but should be documented.

---

## Section 6: Integration and Deployment Completeness

### 6.1 INSTALLED_APPS

- Read `lumy_global/settings.py`.
- Search for `'apps.booking_link'` in `INSTALLED_APPS`.
- FAIL if absent — models will not be discovered, migrations will not run, admin will not register.

### 6.2 URL Registration

- Read `lumy_global/urls.py`.
- Search for a `path('api/v1/booking-link/', include('apps.booking_link.urls'))` (or equivalent).
- FAIL if absent — all 7 endpoints will return 404.
- VERIFY: The prefix used in `urls.py` matches the prefix expected by the frontend. Read `RG-Frontend/src/lib/constants.ts` or the relevant API helper file to confirm.

### 6.3 `qrcode` Dependency

- Read `requirements.txt`.
- Search for `qrcode`.
- VERIFY: `qrcode[pil]` is present (not bare `qrcode`). The `[pil]` extra installs Pillow, which is required for `make_image()` to produce a PNG. Without the Pillow extra, `generate_qr_code()` will raise `ImportError` at runtime.
- ALSO VERIFY: `Pillow` or `pillow` is separately listed (it may already be a dependency of another package in this project).

### 6.4 Test Coverage

- Check if `apps/booking_link/tests.py` exists. If absent, flag as FAIL.
- If present, read it and verify test coverage for:
  - `POST generate/` — new provider with no existing link (creates), existing link (idempotent), inactive link (reactivates)
  - `GET my/` — returns own link, 404 for non-provider user
  - `POST deactivate/` — deactivates, subsequent `my/` reflects is_active=False
  - `GET resolve/<slug>/` — active slug, old slug (redirect), unknown slug (200 with is_active=False)
  - `POST track-click/<pk>/` — active link increments, inactive link returns 404
  - `GET qr/<pk>/` — own link returns PNG, another provider's PK returns 404
  - `GET og-meta/<slug>/` — returns expected OG fields
  - Signal: handle change updates slug_snapshot and creates SlugRedirect

### 6.5 `booking_count` Write Path

- `booking_count` is defined on `BookingLink` and exposed in `BookingLinkSerializer`.
- VERIFY: Search the entire codebase for any code that increments `booking_count` (e.g., in the appointments or calendar app, after a booking is confirmed).
- If no write path exists, `booking_count` is always 0 and is misleading dead weight. Flag as FAIL if no increment path is found.

---

## Section 7: Admin Correctness

### 7.1 BookingLinkAdmin

- Read `apps/booking_link/admin.py`.
- `search_fields = ['slug_snapshot', 'care_provider__user__email']` — VERIFY these traversals are valid against the model graph (`CareProvider → user → email`). Read `care_provider/models.py` line 886 to confirm `CareProvider.user` is a OneToOne to `User`.
- `readonly_fields = ['click_count', 'booking_count', 'created_at', 'modified_at']` — correct, these are system-managed counters and timestamps.
- `SlugRedirectInline` is embedded with `readonly_fields = ['old_slug', 'created_at']` — correct for audit log display.

### 7.2 SlugRedirectAdmin

- `search_fields = ['old_slug']` — no traversal to provider or user. WARN: add `'booking_link__care_provider__user__email'` for operator usability.

---

## Reporting Format

For each check, report:

```
[PASS|FAIL|WARN] Section X.Y — <check name>
Evidence: <file>:<line> — <quoted snippet or observation>
Recommendation: <fix or action if FAIL/WARN>
```

Aggregate all FAILs at the top of your report, followed by WARNs, followed by PASSes.
