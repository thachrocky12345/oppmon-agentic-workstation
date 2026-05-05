# Technical Audit Prompt: Provider Portal "Your Links" Section
# RGDEV-210 + RGDEV-192 — Data Model & Implementation Correctness

**Tickets:** RGDEV-210 (Booking Link card) + RGDEV-192 (Profile attribution link card)
**Epic:** RGDEV-203 — Booking Link v3 Full Lifecycle Contained Checkout
**Plan source:** `ContextFiles2/Library/Plans/Plan_RGDEV-210-192_ProviderLinksPortal_2026-03-15.md`
**Audit date:** 2026-03-15

---

## Scope

This prompt drives a code audit of the frontend-only implementation of the "Your Links" panel in the provider portal. All backend APIs are pre-existing (RGDEV-204). The audit checks correctness, safety, and completeness of the new frontend components and Redux slice against the backend contract documented below.

---

## Backend Contract (source of truth)

### BookingLink model fields returned by `BookingLinkSerializer`
```
id                  UUID (primary key, use this as the pk for QR endpoint)
slug_snapshot       string (unique slug, never null once generated)
is_active           boolean
click_count         non-negative integer (PositiveBigIntegerField, default 0)
booking_count       non-negative integer (PositiveBigIntegerField, default 0)
booking_link_url    string built as: https://really.global/book/<slug_snapshot>
created_at          ISO datetime
modified_at         ISO datetime
```

### Endpoints
| Method | URL | Auth | Behaviour |
|--------|-----|------|-----------|
| GET | `/api/v1/booking-link/my/` | Bearer (care provider) | Returns `BookingLinkSerializer` or 404 if no link exists yet |
| POST | `/api/v1/booking-link/generate/` | Bearer (care provider) | Idempotent — returns existing active link OR reactivates inactive link OR creates new link. Always 200 OK. |
| POST | `/api/v1/booking-link/deactivate/` | Bearer (care provider) | Sets `is_active=false`, returns `{detail: "..."}` |
| GET | `/api/v1/booking-link/qr/<pk>/` | Bearer (care provider — must own the link) | Returns raw PNG bytes (`image/png`). `pk` is the UUID from `BookingLink.id`. |

### Generate idempotency details (from `BookingLinkGenerateView.post`)
- If no `BookingLink` row exists for this provider → creates one with `is_active=True`
- If row exists and `is_active=True` → returns it unchanged (no mutation)
- If row exists and `is_active=False` → sets `is_active=True`, refreshes slug, saves `SlugRedirect` for old slug
- All three branches return `HTTP 200 OK` with `BookingLinkSerializer` data — there is no `HTTP 201 Created`

### QR endpoint ownership check
`BookingLinkQrView` fetches `BookingLink.objects.get(pk=pk, care_provider=cp)` — the authenticated user must own the link. Passing any other provider's UUID returns 404.

### Stats fields
`click_count` and `booking_count` are both `PositiveBigIntegerField` (default 0). They are never null. Division-by-zero is the only guard required; null checks are unnecessary.

---

## Audit Checklist

Work through each item below. For each item: read the relevant source file(s), state what you found, and give a Pass / Fail / Not Implemented verdict with a line-level citation if Fail.

---

### 1. Redux Slice — `providerBookingLinkSlice.ts`

**Expected shape:**
```ts
interface ProviderBookingLinkState {
  bookingLink: BookingLinkData | null
  isLoading: boolean      // covers fetchBookingLink
  isGenerating: boolean   // covers generateBookingLink
  error: string | null
}
```

**Check each thunk:**

**1a. `fetchBookingLink` (GET `/api/v1/booking-link/my/`)**
- Does `pending` set `isLoading = true` and clear `error`?
- Does `fulfilled` set `bookingLink` from the payload and `isLoading = false`?
- Does `rejected` set `isLoading = false` and populate `error`?
- Does a 404 response (no link yet) land in `rejected`, and does the reducer treat that as "no link" rather than a hard error visible to the user?

**1b. `generateBookingLink` (POST `/api/v1/booking-link/generate/`)**
- Does `pending` set `isGenerating = true` and clear `error`?
- Does `fulfilled` unconditionally overwrite `bookingLink` with the response payload (correct — the API always returns the current active link)?
- Does `fulfilled` set `isGenerating = false`?
- Does `rejected` set `isGenerating = false` and populate `error`?

**1c. `deactivateBookingLink` (POST `/api/v1/booking-link/deactivate/`)**
- Does `pending` set some loading indicator (shared `isLoading` or a separate `isDeactivating` flag)?
- Does `fulfilled` set `bookingLink.is_active = false` in the store (either via local mutation or a follow-up `fetchBookingLink` dispatch)?
- Does `rejected` surface an error state?
- Is there a risk of stale `is_active` state if the slice only mutates locally but the server response is `{detail: "..."}` (not a full serializer response)?

---

### 2. Generate Idempotency — UI handling

**2a.** When `generateBookingLink()` resolves, the response will be an existing active link if one already existed. Does the UI correctly handle this — i.e., does it NOT show a "link created" success toast or animation when the link was already active?

**2b.** Does the component distinguish between "link just created for the first time" and "link already existed"? The API gives no signal for this (always 200 OK with the serializer). If the component tries to compare pre/post state to show a "created" message, is that comparison correct?

**2c.** After `generateBookingLink()` fulfills, is the displayed URL taken from `bookingLink_url` in the response payload rather than being constructed client-side from `slug_snapshot`? (Client-side construction would diverge if the backend ever changes URL structure.)

---

### 3. QR Blob Lifecycle

**3a.** When `QrCodeDownload` fetches the PNG from `GET /api/v1/booking-link/qr/<pk>/`, does it pass the `BookingLink.id` (UUID) as the `<pk>` parameter — not `slug_snapshot` or any other field?

**3b.** Is the blob URL created with `URL.createObjectURL(blob)` stored in local state or a ref?

**3c.** Is `URL.revokeObjectURL(blobUrl)` called in the component's cleanup function (`useEffect` return / `componentWillUnmount`)? If not, every mount of the expanded QR panel leaks a blob URL.

**3d.** If the user collapses and re-expands the QR panel multiple times, is the previous blob revoked before a new one is created, or does each expand accumulate a new unreleased blob?

**3e.** Is the download anchor (`<a href={blobUrl} download="...">`) correctly populated before the user clicks it, or is there a race where the href is set before the fetch resolves?

---

### 4. Profile URL Derivation — `ProfileLinkCard`

**4a.** The plan specifies: `https://really.global/en/<user.profile_handle>`. Which Redux selector or store path is used to read `profile_handle`? Confirm the field name matches what the backend actually returns in the user state.

**4b.** What happens when `profile_handle` is `null`, `undefined`, or an empty string? Does the component:
- Hide the copy button and URL display?
- Show a placeholder / skeleton?
- Render `https://really.global/en/undefined` or `https://really.global/en/null`?

**4c.** Is the profile URL built with a template literal directly in the component, or is it extracted into a utility/selector? If inline, is it tested?

**4d.** Does the component re-derive the URL reactively when the user state updates (e.g., after a profile save elsewhere in the portal)?

---

### 5. Reactivation Flow

**5a.** When `bookingLink.is_active === false`, does the UI show a "Reactivate" CTA rather than "Generate my Booking Link" (the empty-state CTA)?

**5b.** Does the "Reactivate" action call `generateBookingLink()` (correct — the API is idempotent and handles reactivation)?

**5c.** After reactivation, the backend may return a new `slug_snapshot` (the `BookingLinkGenerateView` refreshes the slug on reactivation). Does the UI update the displayed URL from the response rather than using the stale pre-deactivation URL still in state?

**5d.** Is the inactive state visually distinct from the empty state (no link) and the active state? Specifically:
- Empty state: no `bookingLink` in store (404 from `fetchBookingLink`)
- Inactive state: `bookingLink !== null && bookingLink.is_active === false`
- Active state: `bookingLink !== null && bookingLink.is_active === true`

Does the rendering logic branch on all three correctly?

---

### 6. Stats Calculation — `LinkStats`

**6a.** Is there an explicit guard for `click_count === 0` before computing conversion rate? The plan specifies: only show conversion if `click_count > 0`. Confirm no division-by-zero path exists.

**6b.** The formula is `(booking_count / click_count * 100).toFixed(0) + '%'`. Is `booking_count` also guarded against being undefined/null (it should not be, given the model, but check the TypeScript type definition for `BookingLinkData`)?

**6c.** When both `click_count === 0` and `booking_count === 0`, does the component render the fallback copy "Share your Booking Link to start tracking." rather than "0%" or empty?

**6d.** When `click_count > 0` but `booking_count === 0`, does the component correctly show "0%" conversion rather than the zero-state copy?

---

### 7. Clipboard API Fallback — Copy Buttons

**7a.** Does the copy handler use `navigator.clipboard.writeText(url)` as the primary path?

**7b.** Is there a fallback for environments where `navigator.clipboard` is undefined (non-HTTPS, older browsers, some in-app WebViews)? The standard fallback is `document.execCommand('copy')` via a temporary `<textarea>`.

**7c.** Does the fallback path also trigger the "Copied!" feedback state, or does it silently fail?

**7d.** Is the copy function shared between `ProfileLinkCard` and `BookingLinkCard`, or duplicated? If duplicated, are both copies consistent?

---

### 8. Web Share API Guard

**8a.** Is the share button conditionally rendered only when `navigator.share !== undefined`? (Web Share API is not available on desktop Chrome or most desktop browsers.)

**8b.** If the share button is always rendered, is the `onClick` handler guarded with `if (navigator.share)` before calling it?

**8c.** Is there a fallback share UI (dropdown with copy/social links) for browsers without Web Share API, or does the share affordance simply not appear on desktop?

**8d.** Does the share call include the correct fields: `{ title, url }` at minimum? Are `text` or `files` fields used, and if so, are they guarded against browsers that support `share` but not those optional fields?

---

### 9. Auth Guard — Care Provider Only

**9a.** `YourLinksPanel` should only be rendered for care providers. How is this enforced? Options:
- Route-level guard (page only accessible to providers)
- Component-level check reading `user.role` or similar from Redux
- HOC or layout-level guard

Confirm which approach is used and that it is not bypassable by a client navigating directly.

**9b.** If a client somehow reaches the component, what happens? Does `BookingLinkGenerateView.post` correctly return 404 ("No care provider profile found") for client users? The frontend should handle this 404 gracefully rather than crashing.

**9c.** Is `YourLinksPanel` protected against unauthenticated users (the API endpoints require `IsAuthenticated`)? If the auth token has expired and the interceptor fails to refresh, does the component show an error state rather than an infinite loading spinner?

---

### 10. Insertion Point in Provider Portal

**10a.** Where exactly is `YourLinksPanel` mounted? Check:
- `src/containers/configure-settings/` — settings tabs
- `src/containers/CareProviderProfile/` — profile management
- `src/pages/` — provider portal page entries

State the exact file and component tree location.

**10b.** Is the panel reachable within 1-2 navigation steps from the provider's home screen? Or is it buried in a sub-tab of a sub-tab?

**10c.** Is `YourLinksPanel` rendered inside the setup wizard (onboarding flow)? Per the plan, it should NOT be — it belongs in profile/settings, not wizard steps.

**10d.** Is `fetchBookingLink` dispatched when the panel mounts (on page load or tab switch), or is it dispatched earlier (on app load)? If dispatched on app load for all authenticated users, is it gated so it only runs for providers?

---

### 11. REST Helper — `src/restapis/bookingLink.ts`

**11a.** Are all four endpoints correctly wired:
- `GET /api/v1/booking-link/my/`
- `POST /api/v1/booking-link/generate/`
- `POST /api/v1/booking-link/deactivate/`
- `GET /api/v1/booking-link/qr/<pk>/`

**11b.** For the QR endpoint, does the helper fetch with `responseType: 'blob'` (Axios) or equivalent (fetch with `.blob()`)? Returning JSON for a PNG response would corrupt the data.

**11c.** Do the helpers use the shared `axiosInstance` (which has the JWT interceptor) rather than a plain `axios` import?

**11d.** Is the `generate` helper a `POST` with an empty body, matching `BookingLinkGenerateView.post` which reads nothing from `request.data`?

---

### 12. TypeScript Types

**12a.** Is there a `BookingLinkData` interface that mirrors the `BookingLinkSerializer` fields exactly? Check for:
- `id: string` (UUID serialized as string)
- `slug_snapshot: string`
- `is_active: boolean`
- `click_count: number`
- `booking_count: number`
- `booking_link_url: string`
- `created_at: string`
- `modified_at: string`

**12b.** Are `click_count` and `booking_count` typed as `number` (not `number | null`)? The model has `default=0` and `PositiveBigIntegerField`, so null is impossible, but a loose type would require unnecessary null guards throughout `LinkStats`.

**12c.** Is `profile_handle` typed on the user state interface, and if so, is it `string | null` or `string`? This affects whether the `ProfileLinkCard` null guard is enforced at the type level.

---

### 13. Edge Cases Not Covered by Happy-Path Testing

**13a. Concurrent generate calls:** If the user double-clicks "Generate my Booking Link", are two concurrent POST requests possible? Is the button disabled during `isGenerating === true`?

**13b. Network error during deactivate:** If `deactivateBookingLink` fails mid-flight, the store should NOT set `is_active = false`. Is the reducer correct — does it only mutate state in `fulfilled`, not `pending`?

**13c. Tab visibility / stale stats:** Stats (`click_count`, `booking_count`) are fetched once on mount. If the provider leaves the tab open for hours, stats will be stale. Is there a refresh mechanism (manual "Refresh stats" button, or refetch on tab focus)? Per the plan, no polling is required — but verify the plan's "no polling" statement is implemented as a deliberate choice, not an omission.

**13d. QR fetch while link is inactive:** `BookingLinkQrView` has no `is_active` check — it only verifies ownership. The QR PNG can be fetched for an inactive link. Is the QR download button hidden or disabled when `is_active === false`?

**13e. Missing `profile_handle` at generate time:** `BookingLinkGenerateView.post` returns `HTTP 400` with `"Complete your profile before generating a Booking Link."` if `get_provider_slug(cp)` returns falsy. Does the frontend surface this as a user-readable error rather than a generic error toast?

---

## Output Format

For each section (1–13), provide:

```
### <Section Number and Title>
Status: Pass | Fail | Not Implemented | Partial
Files checked: <list of absolute file paths read>
Findings: <what you observed, with line citations where applicable>
Risk: None | Low | Medium | High
Recommended fix: <only if Fail or Partial>
```

After all sections, provide a **Summary Table** with one row per section showing Status and Risk, then a prioritised list of all Fail/Partial items ordered by Risk (High first).

---

## Files to Read

Start with these files; follow imports as needed:

```
RG-Frontend/src/store/slices/providerBookingLinkSlice.ts
RG-Frontend/src/restapis/bookingLink.ts
RG-Frontend/src/containers/provider-links/YourLinksPanel.tsx
RG-Frontend/src/containers/provider-links/ProfileLinkCard.tsx
RG-Frontend/src/containers/provider-links/BookingLinkCard.tsx
RG-Frontend/src/containers/provider-links/QrCodeDownload.tsx
RG-Frontend/src/containers/provider-links/LinkStats.tsx
RG-Frontend/src/containers/configure-settings/  (find insertion point)
RG-Frontend/src/containers/CareProviderProfile/  (find insertion point)
```

Also read the backend files for reference (already audited — use as ground truth, do not re-audit):
```
Lumy-Backend/apps/booking_link/models.py
Lumy-Backend/apps/booking_link/serializers.py
Lumy-Backend/apps/booking_link/views.py   (BookingLinkGenerateView, BookingLinkMyView, BookingLinkQrView, BookingLinkDeactivateView)
```
