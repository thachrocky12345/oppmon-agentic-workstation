# BookingLink — UX / Scenario / Commercial Audit Prompt

**Purpose:** Instruct an opus-level agent to perform a thorough audit of the BookingLink feature
by reading the implementation directly and producing a structured findings report.

**Scope ticket:** RGDEV-204

**Primary files to read (read all before answering any question):**
- `apps/booking_link/models.py`
- `apps/booking_link/views.py`
- `apps/booking_link/signals.py`
- `apps/booking_link/serializers.py`
- `apps/booking_link/tests.py`

**Secondary files (read only the relevant section if a question requires it):**
- `apps/care_provider/models.py` — confirm `profile_handle` field definition, uniqueness, and
  cascade behaviour on the `CareProvider` model
- `apps/authentication/models.py` — confirm `BaseModel` fields (`created_at`, `modified_at`,
  `is_active`) and the `profile_handle` field on `User`
- `apps/booking_link/utils.py` — confirm `generate_qr_code` signature and return type

---

## Instructions for the auditor

For every item below, state one of: **PASS**, **BUG**, **GAP**, **AMBIGUOUS**, or **OUT OF SCOPE**.
Cite the exact file, function, and line number(s) that support your finding. Do not speculate
without a code reference. Where a gap exists, propose the minimal code change or test needed to
close it.

---

## Section 1 — User journeys and edge cases

### 1.1 Provider with no profile_handle — email fallback slug safety

File: `views.py`, function `_get_provider_slug` (line 16–22).

- The fallback splits `user.email` on `@` and uses the prefix as the slug.
- Check: does `SlugField(max_length=255)` on `BookingLink.slug_snapshot` enforce slug-safe
  characters? `email` prefixes can contain `+`, `.`, and uppercase letters.
- Check: if the email prefix is not slug-safe, does `get_or_create` on `BookingLink` raise an
  `IntegrityError` or silently store an invalid value?
- Check: `test_generate_uses_email_fallback_when_no_handle` (tests.py line 75–82) asserts the slug
  equals `'noprofile'` but does not test emails with `+` or `.` or uppercase. Is this a gap?

### 1.2 Two providers with the same profile_handle — uniqueness guarantee

File: `models.py`, `BookingLink.slug_snapshot` (line 20): `db_index=True` but **no
`unique=True`**.

- If two providers share the same `profile_handle` value (or the same email prefix), two
  `BookingLink` rows with identical `slug_snapshot` values can coexist.
- Check `_resolve_slug` (views.py line 25–41): it calls `BookingLink.objects.get(slug_snapshot=slug)`.
  If two rows share a slug, this raises `MultipleObjectsReturned`, which is caught by the bare
  `except BookingLink.DoesNotExist` — meaning it falls through to the redirect check and returns
  `None`, making a valid provider's link unresolvable.
- Check: is `profile_handle` unique on the `User` model (`authentication/models.py`)? If so, the
  DB constraint on `User` prevents this at the source. If not, it is a silent data-integrity risk.
- Check: are there tests for the duplicate-slug scenario? Expected: none exist.

### 1.3 Provider deletion — cascade behaviour

File: `models.py`, `BookingLink.care_provider` (line 13–17): `on_delete=models.CASCADE`.

- When a `CareProvider` is deleted, the linked `BookingLink` is deleted, which cascades to
  `SlugRedirect` rows (models.py line 37–40, `on_delete=models.CASCADE`).
- Verify: is this cascade intentional? Old booking URLs shared on business cards or social media
  will silently resolve to "not found" after provider deletion, with no tombstone.
- Identify: is there a soft-delete path (e.g., marking the provider inactive without deleting) that
  would avoid broken links? Check whether `BaseModel.is_active` on `BookingLink` already handles
  this or whether the provider hard-delete path is the only one used.

### 1.4 Deactivated provider — link still resolvable

File: `views.py`, `_resolve_slug` (line 25–41) and `_build_og_meta` (line 44–68).

- `_resolve_slug` returns a `BookingLink` regardless of `is_active`. The `is_active` flag is
  included in the response (`_build_og_meta` line 57) but is not used to gate resolution.
- `BookingLinkResolveView` and `BookingLinkOgMetaView` both return HTTP 200 for an inactive link,
  exposing provider metadata (name, photo, bio URL) and the `booking_link_id`.
- Check: should an inactive link return a 404-equivalent inactive payload instead of the full
  provider metadata? Consider the provider experience: a provider who deactivates their link may
  not expect their name and photo to still appear in social share previews.
- `BookingLinkTrackClickView` (views.py line 172–178) correctly blocks click tracking on inactive
  links via the `is_active=True` filter — verify consistency with resolve/og-meta behaviour.

### 1.5 Empty string slug_snapshot

File: `models.py`, `BookingLink.slug_snapshot` (line 20): `SlugField(max_length=255, db_index=True)`.

- `SlugField` does not enforce `blank=False` by default at the DB level in SQLite/PostgreSQL
  (Django's `blank` is form validation only).
- Check: if `_get_provider_slug` returns an empty string (e.g., email is `@domain.com`), the
  `if not slug` guard in `BookingLinkGenerateView.post` (line 86–90) will catch it. Confirm this
  guard is present and tested.
- Check: can `slug_snapshot` be set to `''` via the signal path (`signals.py` line 23)?  The
  signal checks `if not new_slug` before proceeding. Confirm this guard is equivalent to the
  generate view's guard.
- Check: there is no test for the `@domain.com` edge case. Is this a gap?

---

## Section 2 — Slug redirect chain integrity

### 2.1 Multiple handle changes — all redirects preserved

File: `signals.py`, `sync_booking_link_slug` (line 14–36).

- Each handle change calls `SlugRedirect.objects.get_or_create(old_slug=old_slug, booking_link=bl)`
  (line 28). This creates one `SlugRedirect` row per distinct old slug.
- Verify: after three handle changes (A → B → C → D), slugs A, B, C should all be present in
  `SlugRedirect` and all resolve to the current `BookingLink` via `_resolve_slug`. There is no
  test for a three-step chain (tests.py covers one change only, line 258–268). Flag as gap.

### 2.2 New slug conflicts with another provider's existing SlugRedirect

File: `models.py`, `SlugRedirect.old_slug` (line 36): `unique=True`.

- Scenario: Provider A once used slug `dr-smith`, then changed to `dr-smith-phd`. A
  `SlugRedirect(old_slug='dr-smith')` now points to Provider A's `BookingLink`.
- Provider B now adopts the handle `dr-smith`. The signal fires, setting Provider B's
  `BookingLink.slug_snapshot = 'dr-smith'`.
- Now `_resolve_slug('dr-smith')` finds Provider B via the `get(slug_snapshot=slug)` lookup
  (direct match, line 28–31) — this works correctly.
- BUT: if Provider B later changes away from `dr-smith`, the signal tries
  `SlugRedirect.objects.get_or_create(old_slug='dr-smith', booking_link=<Provider B's BL>)`.
  Because `old_slug` is globally unique, this will raise `IntegrityError` if a row for `'dr-smith'`
  already exists for Provider A's booking link.
- The signal catches all exceptions and logs an error (line 35–36), so the failure is silent: the
  `slug_snapshot` on Provider B's BookingLink is NOT updated, leaving it pointing at the old value.
- Verify whether any test covers this scenario. Expected: none. Flag as **BUG**.

### 2.3 Redirect cycles

File: `views.py`, `_resolve_slug` (line 25–41).

- The function returns `(booking_link, redirect_to_slug)` in one pass with no loop. A cycle would
  require a `BookingLink.slug_snapshot` to equal a `SlugRedirect.old_slug` for the same
  `BookingLink`, which is logically prevented by the signal (it only archives the OLD slug after
  setting the new one).
- However, if two providers swap handles (A takes B's old slug and B takes A's old slug
  simultaneously), manual data corruption could create a cycle. Confirm whether any constraint or
  runtime guard detects this. Expected: none. Note as low-risk theoretical gap.

### 2.4 Slug that is both a current slug AND an existing SlugRedirect for a different provider

File: `views.py`, `_resolve_slug` (line 25–41).

- The function tries the direct `BookingLink` lookup first (`get(slug_snapshot=slug)`). If found,
  it returns immediately and never hits the `SlugRedirect` table.
- This means if a slug exists as `slug_snapshot` for Provider X and as `old_slug` for Provider Y's
  redirect, Provider X's live link always wins — the redirect is shadowed.
- Whether this is correct depends on business intent. Document as **AMBIGUOUS**: the resolution
  priority (current slug beats redirect) is implemented but not explicitly tested or documented.

---

## Section 3 — Concurrency and race conditions

### 3.1 Simultaneous /generate/ requests

File: `views.py`, `BookingLinkGenerateView.post` (line 92–95).

- `BookingLink.objects.get_or_create(care_provider=cp, defaults={...})` is used. In PostgreSQL,
  `get_or_create` is not atomic; two concurrent requests can both find "not exists" and both
  attempt `INSERT`, causing a second `IntegrityError` on the `OneToOneField` constraint. Django
  handles this by catching the integrity error and retrying the `get`, so the end result is correct
  but one request may receive a 500 if the retry logic is not in place.
- Confirm whether `get_or_create` on a `OneToOneField` with a DB-level unique constraint is
  safe in the current Django version (4.2). In Django 4.2, `get_or_create` does use
  `select_for_update` only when explicitly wrapped in a transaction — it does not by default.
- Flag as **AMBIGUOUS**: the happy path is safe in practice due to the DB constraint retry, but a
  brief window exists where both requests could proceed to the reactivation branch (lines 96–100)
  simultaneously, leading to two `save()` calls on the same row. This is benign for idempotent
  field updates but worth noting.

### 3.2 Signal fires while generate is running

File: `signals.py`, `sync_booking_link_slug` (line 14–36).

- If the `CareProvider.save()` post_save signal fires while `generate` is mid-execution (between
  the `get_or_create` returning `created=True` and the serializer response), the signal may update
  `slug_snapshot` before the serializer reads it.
- In practice, `generate` calls `BookingLinkSerializer(bl)` using the in-memory `bl` object, not a
  fresh DB read. The serializer would return the pre-signal slug. The DB would have the new slug.
  This is a transient inconsistency limited to the response body, not data corruption.
- Flag as **AMBIGUOUS** / low priority.

### 3.3 Click count accuracy under concurrent load

File: `views.py`, `BookingLinkTrackClickView.post` (line 172–178).

- Uses `BookingLink.objects.filter(...).update(click_count=F('click_count') + 1)`. The `F()`
  expression translates to a single atomic `UPDATE ... SET click_count = click_count + 1` in SQL,
  which is safe under concurrent load at the database level.
- Confirm: no read-modify-write pattern is used. Expected: **PASS**.
- Check: the test `test_track_click_multiple` (tests.py line 176–180) sends three serial requests;
  there is no concurrent stress test. Note as **GAP** in test coverage but not a code bug.

---

## Section 4 — Business logic completeness

### 4.1 booking_count is never incremented

File: `models.py`, `BookingLink.booking_count` (line 22): defined, default=0.
File: `serializers.py`, line 13: included in serializer output.

- Search the entire `apps/booking_link/` directory for any call that increments `booking_count`.
  Also search `apps/calendar_functionality/` and `apps/stripe_integration/` for any reference to
  `booking_link` or `booking_count`.
- If no increment path exists, flag as **GAP**: the stat is exposed in the API and provider
  dashboard but will always read 0. Either the increment belongs in the appointment confirmation
  flow (calendar_functionality) and was not implemented, or this field is a placeholder for a
  future analytics hook.
- Document whether RGDEV-204 explicitly deferred booking_count increment to a later ticket.

### 4.2 Attribution tracking — 60-day window and fee reduction

Context: 10% platform fee (vs 15% standard) for bookings within 60 days of a tracked booking link
click.

- Search `apps/booking_link/` for any attribution model, middleware, or session/cookie logic.
- Search `apps/stripe_integration/` for any fee calculation that references `booking_link` or
  attribution.
- If no attribution logic exists, flag as **GAP / OUT OF SCOPE**: state whether RGDEV-204 scoped
  this in or out. The `click_count` field exists but there is no per-session or per-user attribution
  record. Without such a record, the 60-day window and fee reduction cannot be enforced.

### 4.3 QR code export from the frontend

This is explicitly a frontend concern, not a backend concern. The QR endpoint
`GET /api/v1/booking-link/qr/<pk>/` returns raw PNG bytes with `Content-Type: image/png`
(views.py line 194–195). The frontend can implement a download button by fetching this endpoint
and triggering a browser file save.

- Confirm: the QR endpoint requires `IsAuthenticated` (views.py line 183). A public QR download
  link would require an unauthenticated variant or a signed URL. Flag as **AMBIGUOUS**: current
  design requires the provider to be logged in to download their own QR code, which is appropriate
  for the provider dashboard but rules out embedding the QR image in public pages via `<img src>`.

---

## Section 5 — API contract for the frontend

### 5.1 /resolve/<slug>/ — fields required for SSR booking page

File: `views.py`, `BookingLinkResolveView.get` (line 143–165) and `_build_og_meta` (line 44–68).

- Fields returned by `_build_og_meta`:
  `booking_link_id`, `care_provider_id`, `provider_slug`, `is_active`, `redirect_to`,
  `og_title`, `og_description`, `og_image`, `og_url`, `provider_name`, `provider_photo_url`.
- The SSR booking page needs `care_provider_id` to fetch the provider's full profile. Confirm
  `care_provider_id` is present. Expected: **PASS** (line 58).
- The SSR page needs `booking_link_id` (UUID) to call `track-click`. Confirm it is returned as a
  string. Check: `str(booking_link.id)` is called at line 57. **PASS**.
- The "not found" response (lines 149–164) returns `booking_link_id: null` and
  `care_provider_id: null`. Confirm the frontend can handle null values without crashing.
- The "not found" response does NOT include `provider_name` or `provider_photo_url`. Check
  whether `_build_og_meta` is called for the not-found case. Expected: it is NOT called (the
  inline dict is returned directly). The missing fields mean the resolve and og-meta not-found
  shapes differ. Flag as **AMBIGUOUS** — the frontend must handle the absent keys.

### 5.2 /og-meta/<slug>/ — shape consistency with /resolve/<slug>/

File: `views.py`, `BookingLinkOgMetaView.get` (line 198–215).

- Both endpoints call `_resolve_slug` and then `_build_og_meta` — shapes are identical for found
  providers.
- For not-found: `ResolveView` returns `booking_link_id`, `care_provider_id`, `provider_slug`;
  `OgMetaView` returns only `og_title`, `og_description`, `og_image`, `og_url`, `is_active`.
- The shapes differ for the not-found case. If the frontend uses a single type to parse both
  endpoints, optional fields will be undefined for one of them. Flag as **GAP**: the not-found
  payloads should be harmonised or the difference should be explicitly documented in the API
  contract.
- `ResolveBookingLinkSerializer` (serializers.py line 24–33) defines a typed schema, but neither
  view uses it — both views return raw dicts via `Response(...)`. This means the serializer is
  documentation only, not enforced. Flag as **GAP**: either use the serializer in the views or
  remove it to avoid false confidence.

### 5.3 /generate/ — does the response include booking_link_url?

File: `views.py`, `BookingLinkGenerateView.post` (line 102–103): uses `BookingLinkSerializer`.
File: `serializers.py`, `BookingLinkSerializer` fields (line 10–14): includes `booking_link_url`.
File: `serializers.py`, `get_booking_link_url` (line 17–21): builds
`/book/{slug_snapshot}` from request or falls back to `https://really.global/book/{slug}`.

- Confirm `booking_link_url` is present in the generate response. Expected: **PASS**.
- Confirm the URL uses the frontend domain (`really.global`) not the backend domain
  (`request.build_absolute_uri` returns the backend base URL in `dev`/`docker` environments).
  This is a DX issue: in local dev, `booking_link_url` will return
  `http://localhost:8000/book/dr-jane-doe` instead of `http://localhost:3000/book/dr-jane-doe`.
  Flag as **AMBIGUOUS**: the fallback path (line 21) uses `really.global` which is correct for
  production, but the `request.build_absolute_uri` path (line 19–20) uses the backend origin,
  which is incorrect for the frontend. The generate view always passes `context={'request': request}`
  (views.py line 102), so the request path is always taken in production, potentially returning
  the API server's domain rather than the frontend domain. Flag as **BUG** pending confirmation of
  production domain configuration.

### 5.4 All UUIDs returned as strings

File: `views.py`, `_build_og_meta` (line 57): `str(booking_link.id)`.
File: `serializers.py`, `BookingLinkSerializer.id` (line 11): `UUIDField` serialises to string
by default in DRF.

- Confirm no raw UUID objects reach the response. Expected: **PASS** for both paths.
- Check `ResolveBookingLinkSerializer.booking_link_id` (serializers.py line 25): typed as
  `UUIDField()` which outputs a string. But this serializer is unused in the views (see 5.2).
  The raw `_build_og_meta` dict uses `str(booking_link.id)`. Verify the types are consistent.

---

## Section 6 — Test coverage gaps

Run through this checklist and for each item state whether a test exists, and if not, propose the
test class and method name.

| # | Scenario | File/line where coverage exists | Gap? |
|---|---|---|---|
| 6.1 | Email fallback slug with `+`, `.`, uppercase in email prefix | tests.py line 75–82 (partial) | **GAP** — only plain prefix tested |
| 6.2 | Email where prefix is empty (e.g. `@domain.com`) | None | **GAP** |
| 6.3 | Multiple handle changes: 3-step redirect chain (A→B→C→D all resolve) | tests.py line 258–268 (1 step only) | **GAP** |
| 6.4 | New slug conflicts with another provider's existing `SlugRedirect.old_slug` | None | **GAP / BUG** |
| 6.5 | `MultipleObjectsReturned` when two rows share `slug_snapshot` | None | **GAP** |
| 6.6 | Provider deletion cascades BookingLink and all SlugRedirects | None | **GAP** |
| 6.7 | Deactivated provider: resolve still returns metadata (assert `is_active=False`, not 404) | tests.py line 140–144 (active only) | **GAP** |
| 6.8 | Signal no-op when `new_slug` is empty string | tests.py line 270–274 (unchanged slug, not empty) | **GAP** |
| 6.9 | Signal: handle change on provider with no BookingLink (no-op) | tests.py line 276–279 | **PASS** |
| 6.10 | Signal: handle change where new slug equals another provider's `old_slug` (IntegrityError path) | None | **GAP / BUG** |
| 6.11 | QR PNG — full 8-byte magic bytes check (`\x89PNG\r\n\x1a\n`) | tests.py line 210 (4-byte only) | **GAP** (minor) |
| 6.12 | `booking_count` increment (any path) | None | **GAP** |
| 6.13 | Attribution record creation on resolved click | None | **GAP / OUT OF SCOPE** |
| 6.14 | `og-meta` and `resolve` not-found shapes are inconsistent | tests.py line 242–246 (shape not asserted) | **GAP** |
| 6.15 | `booking_link_url` points to frontend domain, not backend domain | None | **GAP** |

---

## Deliverables expected from the auditor

1. A findings table with one row per audit item: ID, status (PASS/BUG/GAP/AMBIGUOUS/OUT OF SCOPE),
   file + line citation, and one-line description.
2. A prioritised fix list: BUGs first, then high-impact GAPs, then AMBIGUOUS items requiring
   a product decision.
3. For each BUG or high-impact GAP, a proposed minimal fix (code snippet or migration) and the
   test case that would verify it.
4. A "product decision required" section listing items that require explicit scoping (attribution,
   deactivated provider visibility, booking_count ownership).
