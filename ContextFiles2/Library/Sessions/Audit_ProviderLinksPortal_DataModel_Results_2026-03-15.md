# Audit Results: Provider Portal "Your Links" Section — Data Model & Technical
# RGDEV-210 + RGDEV-192
# Date: 2026-03-15

**Worktree:** `RG-Frontend/.claude/worktrees/agent-ab3dfd6d/`

---

## 1. Redux Slice — `providerBookingLinkSlice.ts`

### 1a. `fetchBookingLink`
**Status: PASS**
Files checked: `agent-ab3dfd6d/src/store/slices/providerBookingLinkSlice.ts`
Findings:
- `pending` (line 89-91): sets `isLoading = true`, clears `error`. Correct.
- `fulfilled` (line 93-96): sets `bookingLink` from payload, `isLoading = false`. Correct.
- `rejected` (line 97-100): sets `isLoading = false`, populates `error`. Correct.
- 404 handling (lines 41-43): thunk catches 404 and returns `null` via normal `return` (not `rejectWithValue`), so it lands in `fulfilled` with `payload = null`. This correctly sets `bookingLink = null` without surfacing an error. Correct.

Risk: None

### 1b. `generateBookingLinkThunk`
**Status: PASS**
Findings:
- `pending` (line 103-105): sets `isGenerating = true`, clears `error`. Correct.
- `fulfilled` (line 107-109): unconditionally overwrites `bookingLink` with response payload. Correct.
- `rejected` (line 111-113): sets `isGenerating = false`, populates `error`. Correct.

Risk: None

### 1c. `deactivateBookingLinkThunk`
**Status: FAIL**
Findings:
- `pending` (line 117-119): sets `isLoading = true`, clears `error`. OK.
- **BUG (line 122-123):** `fulfilled` handler sets `state.bookingLink = action.payload`. The backend `BookingLinkDeactivateView.post` returns `{'detail': 'Booking Link deactivated.'}` (confirmed at `Lumy-Backend/apps/booking_link/views.py:259`), NOT a `BookingLinkSerializer` response. This overwrites the valid `BookingLinkData` object with `{detail: "Booking Link deactivated."}`, corrupting the store state. After deactivation, the component will read `bookingLink.is_active` as `undefined`, `bookingLink.booking_link_url` as `undefined`, etc.
- The `rejected` handler (line 125-127) is correct.

Risk: **HIGH**
Recommended fix: In `deactivateBookingLinkThunk.fulfilled`, do NOT overwrite `bookingLink` from payload. Instead, mutate `state.bookingLink.is_active = false` if `state.bookingLink` exists. Alternatively, dispatch `fetchBookingLink()` after deactivation succeeds.

---

## 2. Generate Idempotency — UI handling

### 2a. No false "created" toast
**Status: PASS**
Files checked: `BookingLinkCard.tsx`
Findings: `handleGenerate` (line 45-47) dispatches the thunk with no `.then()` showing a toast. No success notification is shown at all. Correct — avoids false "created" toast when link already existed.

### 2b. First-create vs already-existed distinction
**Status: PASS**
Findings: No attempt to distinguish between first-create and already-existed. The UI simply renders whatever the slice contains after fulfillment. Correct given the API gives no signal.

### 2c. URL from response payload
**Status: PASS**
Findings: `bookingUrl` (line 43) reads from `bookingLink?.booking_link_url`, which comes from the API response stored by the slice. URL is not constructed client-side. Correct.

Risk: None

---

## 3. QR Blob Lifecycle

### 3a. Uses `BookingLink.id` (UUID) for QR endpoint
**Status: PASS**
Files checked: `QrCodeDownload.tsx`, `BookingLinkCard.tsx`
Findings: `BookingLinkCard` passes `bookingLink.id` (line 208). `QrCodeDownload` uses `bookingLinkId` prop in `fetchBookingLinkQr(bookingLinkId)` (line 33). Correct.

### 3b. Blob URL stored in local state
**Status: PASS**
Findings: `const [blobUrl, setBlobUrl] = useState<string | null>(null)` (line 12). Correct.

### 3c. `URL.revokeObjectURL` on cleanup
**Status: PARTIAL**
Findings: The `useEffect` cleanup (lines 18-24) calls `URL.revokeObjectURL(blobUrl)` on unmount. However, the effect has `[blobUrl]` as a dependency, which means it also runs cleanup when `blobUrl` changes — this is actually good, it revokes the old blob before the new one. But there is a subtle issue: the cleanup captures `blobUrl` via closure, and since `blobUrl` only ever gets set once (the `handleShowQr` function returns early if `blobUrl` already exists on line 27-29), there is no actual multiple-blob scenario. The unmount cleanup is correct.

### 3d. Collapse/re-expand does not leak blobs
**Status: PASS**
Findings: When the user collapses (toggle `showQr = false`) and re-expands, `handleShowQr` sees that `blobUrl` is truthy (line 27) and simply toggles visibility without fetching again. No new blob is created. Correct.

### 3e. Download anchor race condition
**Status: PASS**
Findings: The anchor (line 74-78) and download button (lines 80-88) are only rendered inside `{showQr && blobUrl && (...)}` (line 65). The anchor `href={blobUrl}` is always populated when visible. No race. Correct.

Risk: None

---

## 4. Profile URL Derivation — `ProfileLinkCard`

### 4a. Source of `profile_handle`
**Status: PASS**
Files checked: `YourLinksPanel.tsx`, `ProfileLinkCard.tsx`
Findings: `YourLinksPanel` reads `careProviderDetail?.[0]?.user?.profileHandle` (line 18). The GraphQL query at `src/graphql/query/query.ts:2303` returns `profileHandle`. Field name matches.

### 4b. Null safety for `profile_handle`
**Status: PASS**
Findings:
- `YourLinksPanel` (line 18): uses `?? null` to coerce to `null`.
- `YourLinksPanel` (line 50): only renders `ProfileLinkCard` when `profileHandle` is truthy.
- `ProfileLinkCard` (line 16-18): derives `profileUrl` conditionally; returns `null` if `!profileHandle` (line 48-50).
- No risk of rendering `https://really.global/en/undefined`.

### 4c. URL construction
**Status: PASS (with note)**
Findings: URL is built inline with a template literal (line 16-17 of `ProfileLinkCard`). This is not extracted into a utility, but the plan does not require it. Not a bug, but worth noting for future consistency if the URL pattern changes.

### 4d. Reactivity on user state update
**Status: PASS**
Findings: `profileHandle` is derived from `useSelector` on `careProviderSliceV1.careProviderDetail` (YourLinksPanel line 13-18). When profile data is refreshed elsewhere (e.g., after a profile save dispatches `getCareProviderDetail`), the selector triggers a re-render with the new handle. Correct.

Risk: None

---

## 5. Reactivation Flow

### 5a. Inactive state shows "Reactivate" CTA
**Status: FAIL**
Files checked: `BookingLinkCard.tsx`
Findings: Line 81: `if (!bookingLink || !isActive)` — both null (no link) and inactive (link exists but `is_active === false`) render the same empty-state card with the same "Generate my Booking Link" CTA and the same "Start getting direct bookings" headline. The audit requires a distinct "Reactivate" CTA for the inactive state.

Risk: **Medium**
Recommended fix: Split the condition into three branches:
1. `!bookingLink` → empty state ("Generate my Booking Link")
2. `bookingLink && !isActive` → inactive state ("Reactivate your Booking Link") — note: this will also break due to the deactivate bug in Section 1c, which corrupts `bookingLink`.
3. `bookingLink && isActive` → active state (current active branch)

### 5b. Reactivate action calls `generateBookingLink()`
**Status: PASS**
Findings: The inactive/empty state button calls `handleGenerate` (line 118), which dispatches `generateBookingLinkThunk`. This is correct — the API handles reactivation via the generate endpoint.

### 5c. URL updates from response after reactivation
**Status: PASS**
Findings: `generateBookingLinkThunk.fulfilled` unconditionally overwrites `bookingLink` in the store (slice line 108-109). The newly generated slug is reflected in `booking_link_url` from the response. Correct.

### 5d. Three-state rendering
**Status: FAIL**
Findings: As noted in 5a, only two visual states exist (empty/inactive merged, and active). The empty state and inactive state are not visually distinct. The plan and audit checklist require three distinct states.

Risk: **Medium** (UX issue, not data corruption)

---

## 6. Stats Calculation — `LinkStats`

### 6a. Division-by-zero guard
**Status: PASS**
Files checked: `LinkStats.tsx`
Findings: Line 63-66: `bookingCount > 0 && clickCount > 0` guards the division. If `clickCount === 0`, the ternary falls through to `"\u2014"` (em dash). No division-by-zero possible. Correct.

### 6b. `booking_count` undefined/null guard
**Status: PASS**
Findings: `BookingLinkData` types `booking_count` as `number` (not `number | null`) in the slice (line 14). Additionally, `BookingLinkCard` passes `bookingLink.booking_count ?? 0` (line 205) as a belt-and-suspenders guard. Correct.

### 6c. Both zero → fallback copy
**Status: PASS**
Findings: Line 48: `if (clickCount === 0 && bookingCount === 0)` renders "Share your Booking Link to start tracking." Correct.

### 6d. `click_count > 0` but `booking_count === 0`
**Status: FAIL**
Findings: Line 63-64: `bookingCount > 0 && clickCount > 0` — when `clickCount > 0` but `bookingCount === 0`, the condition is false, so `conversionRate` = `"\u2014"` (em dash). The audit requires "0%" in this case, not an em dash. The em dash implies "no data" when in fact the conversion rate is genuinely 0%.

Risk: **Low** (cosmetic/UX, not a data bug)
Recommended fix: Change condition to `clickCount > 0 ? \`${((bookingCount / clickCount) * 100).toFixed(0)}%\` : "\u2014"`. This shows "0%" when there are clicks but no bookings.

---

## 7. Clipboard API Fallback — Copy Buttons

### 7a. Primary: `navigator.clipboard.writeText()`
**Status: PASS**
Files checked: `BookingLinkCard.tsx` (lines 53-62), `ProfileLinkCard.tsx` (lines 20-29)
Findings: Both use `navigator.clipboard.writeText(url)`. Correct.

### 7b. Fallback for non-HTTPS / older browsers
**Status: FAIL**
Findings: Both `handleCopy` functions catch the error but only `console.error` it (BookingLinkCard line 60-61, ProfileLinkCard line 27-28). There is no `document.execCommand('copy')` fallback via temporary `<textarea>`. On non-HTTPS contexts or browsers where `navigator.clipboard` is undefined, the copy silently fails.

Risk: **Medium**
Recommended fix: Add a fallback function that creates a temporary `<textarea>`, calls `document.execCommand('copy')`, and removes the element. Share this utility between both cards.

### 7c. Fallback triggers "Copied!" state
**Status: FAIL** (N/A — no fallback exists)
Findings: Since there is no fallback, the "Copied!" state is never triggered on failure.

### 7d. Copy function shared or duplicated
**Status: FAIL (duplicated)**
Findings: `handleCopy` is implemented independently in both `BookingLinkCard.tsx` (lines 53-62) and `ProfileLinkCard.tsx` (lines 20-29). Both are consistent but duplicated. Should be extracted into a shared utility or custom hook.

Risk: **Low** (maintainability, not a runtime bug)

---

## 8. Web Share API Guard

### 8a. Share button conditionally rendered
**Status: FAIL**
Files checked: `BookingLinkCard.tsx` (line 189-192), `ProfileLinkCard.tsx` (line 89-93)
Findings: The share `<IconButton>` is always rendered regardless of `navigator.share` availability. On desktop browsers without Web Share API, the button is visible but tapping it falls through to the copy handler (a reasonable fallback), but the icon/tooltip says "Share" which is misleading on desktop.

Risk: **Low**
Recommended fix: Either conditionally render the share button with `{typeof navigator !== 'undefined' && navigator.share && (...)}`, or change the tooltip to "Share / Copy" on desktop.

### 8b. `onClick` handler guarded
**Status: PASS**
Findings: `handleShare` in both components checks `if (navigator.share)` before calling it (BookingLinkCard line 66, ProfileLinkCard line 33). Falls back to `handleCopy()`. Correct — no runtime error.

### 8c. Fallback share UI on desktop
**Status: PARTIAL**
Findings: No dropdown with social links. The fallback is copy-to-clipboard. This is functional but minimal. The plan mentions "Native share (Web Share API / fallback dropdown)" but the implementation only has copy as fallback.

### 8d. Share call fields
**Status: PASS**
Findings: Both use `{ title, url }` (BookingLinkCard lines 68-70, ProfileLinkCard lines 35-37). No `text` or `files` fields. Correct and safe.

Risk: Low overall

---

## 9. Auth Guard — Care Provider Only

### 9a. How is the guard enforced
**Status: PASS**
Files checked: `src/pages/cp/profile/index.tsx`
Findings: `YourLinksPanel` is mounted inside `src/pages/cp/profile/index.tsx` (line 730), which is under the `/cp/` route namespace. This page uses the `Layout` component and loads `careProviderDetail` data. The `/cp/` routes are conventionally protected at the page/layout level for care providers. The component itself doesn't add a redundant role check, but the page-level guard is sufficient.

### 9b. Client reaching the component
**Status: PASS**
Findings: If a client somehow reaches this page, `fetchBookingLink` would get a 404 (no care provider profile), which is handled gracefully (returns `null`, shows empty state). `generateBookingLinkThunk` would get a 400 error caught by `rejectWithValue`. No crash.

### 9c. Unauthenticated user protection
**Status: PASS**
Findings: The `api` Axios instance has JWT interceptor with auto-refresh. If refresh fails, the interceptor redirects to login. The component shows `isLoading` state during the request. No infinite spinner risk — the auth interceptor handles expiry.

Risk: None

---

## 10. Insertion Point in Provider Portal

### 10a. Mount location
**Status: PASS**
Files checked: `agent-ab3dfd6d/src/pages/cp/profile/index.tsx`
Findings: `YourLinksPanel` is imported (line 36) and rendered at line 730, inside the provider's "My Profile" page (`/cp/profile/`), between the Affiliate ID section and the Password section. Wrapped inside the `Layout` component with the standard provider portal chrome.

### 10b. Navigation depth
**Status: PASS**
Findings: The provider's "My Profile" page is a top-level tab in the provider portal. Reachable in 1 navigation step from the provider home screen.

### 10c. Not in setup wizard
**Status: PASS**
Findings: The panel is in `src/pages/cp/profile/index.tsx`, not in `src/containers/CareProviderSetup/`. Correct per the plan.

### 10d. Fetch dispatch timing
**Status: PASS**
Findings: `fetchBookingLink` is dispatched in `YourLinksPanel`'s `useEffect` on mount (line 21-23). Not dispatched on app load. Only runs when the panel mounts (i.e., when the provider visits the profile page). Correct.

Risk: None

---

## 11. REST Helper — `src/restapis/bookingLink.ts`

### 11a. All four endpoints wired
**Status: PASS**
Files checked: `agent-ab3dfd6d/src/restapis/bookingLink.ts`
Findings:
- `GET /booking-link/my/` — `fetchMyBookingLink()` (line 3-6)
- `POST /booking-link/generate/` — `generateBookingLink()` (line 8-10)
- `POST /booking-link/deactivate/` — `deactivateBookingLink()` (line 12-15)
- `GET /booking-link/qr/<pk>/` — `fetchBookingLinkQr(pk)` (line 17-22)
All correct.

### 11b. QR endpoint uses `responseType: 'blob'`
**Status: PASS**
Findings: Line 19: `responseType: "blob"`. Correct.

### 11c. Uses shared `axiosInstance` with JWT interceptor
**Status: PASS**
Findings: Line 1: `import { api } from "../store/axiosInstance"`. All four helpers use `api`. Correct.

### 11d. Generate is POST with empty body
**Status: PASS**
Findings: Line 9: `api.post("/booking-link/generate/")` — no second argument (empty body). Correct.

Risk: None

---

## 12. TypeScript Types

### 12a. `BookingLinkData` interface mirrors serializer
**Status: PASS**
Files checked: `providerBookingLinkSlice.ts` (lines 8-17)
Findings: All fields present with correct types:
- `id: string` (UUID as string) - correct
- `slug_snapshot: string` - correct
- `is_active: boolean` - correct
- `click_count: number` - correct
- `booking_count: number` - correct
- `booking_link_url: string` - correct
- `created_at: string` - correct
- `modified_at: string` - correct

### 12b. `click_count` and `booking_count` typed as `number`
**Status: PASS**
Findings: Both are `number` (not `number | null`). Correct — matches the model's `default=0` non-nullable constraint.

### 12c. `profile_handle` type on user state
**Status: PARTIAL**
Findings: There is no explicit TypeScript interface for the user/careProvider state. The codebase uses `any` extensively (`state: any`, `careProviderDetail: any`). The `ProfileLinkCardProps` interface types `profileHandle` as `string | null | undefined` (line 9), which is correct for the prop, but the upstream state is untyped. Not a bug per se, but the type safety relies on runtime guards rather than compile-time checks.

Risk: Low

---

## 13. Edge Cases

### 13a. Concurrent generate (double-click)
**Status: PASS**
Files checked: `BookingLinkCard.tsx` (line 119)
Findings: Generate button has `disabled={isGenerating || isLoading}`. When the first click sets `isGenerating = true` in the pending reducer, the button is disabled. No double-dispatch possible. Correct.

### 13b. Network error during deactivate — no premature state mutation
**Status: PASS**
Findings: The deactivate `pending` handler (lines 117-119) only sets `isLoading` and clears `error`. It does NOT mutate `is_active`. State mutation only happens in `fulfilled`. Correct pattern. (However, the `fulfilled` handler has the separate bug documented in Section 1c.)

### 13c. Stale stats / no polling
**Status: PASS**
Findings: Stats are fetched once on mount via `fetchBookingLink` (YourLinksPanel line 22). No polling, no refresh button, no tab-focus refetch. This matches the plan's "no polling" specification. Deliberate choice, not an omission.

### 13d. QR download when link is inactive
**Status: PASS (indirectly)**
Findings: The `QrCodeDownload` component is only rendered inside the active-state branch (BookingLinkCard line 208), which requires `isActive === true` (the `if (!bookingLink || !isActive)` guard on line 81 returns early for inactive links). So the QR button is not visible when the link is inactive. Correct.

### 13e. Missing `profile_handle` at generate time (400 error)
**Status: FAIL**
Findings: `generateBookingLinkThunk.rejected` sets `state.error` from `error?.response?.data?.detail` (slice line 58-59). The component does not read or display `state.error` anywhere. The `BookingLinkCard` component has no error display area. If the backend returns `400` with "Complete your profile before generating a Booking Link.", the error is stored in Redux but never surfaced to the user. The button simply re-enables after `isGenerating` flips to `false`.

Risk: **Medium**
Recommended fix: Add an error display (e.g., `<Typography color="error">`) in the empty-state card that reads `state.providerBookingLink.error` and displays it.

---

## Summary Table

| # | Section | Status | Risk |
|---|---------|--------|------|
| 1a | fetchBookingLink | PASS | None |
| 1b | generateBookingLinkThunk | PASS | None |
| 1c | deactivateBookingLinkThunk | **FAIL** | **HIGH** |
| 2 | Generate idempotency UI | PASS | None |
| 3 | QR Blob lifecycle | PASS | None |
| 4 | Profile URL derivation | PASS | None |
| 5a | Inactive vs empty state | **FAIL** | Medium |
| 5d | Three-state rendering | **FAIL** | Medium |
| 6d | Conversion rate 0% case | **FAIL** | Low |
| 7b | Clipboard fallback | **FAIL** | Medium |
| 7d | Copy function duplicated | **FAIL** | Low |
| 8a | Share button always rendered | **FAIL** | Low |
| 9 | Auth guard | PASS | None |
| 10 | Insertion point | PASS | None |
| 11 | REST helper | PASS | None |
| 12 | TypeScript types | PASS | Low |
| 13a | Double-click guard | PASS | None |
| 13b | Deactivate no premature mutation | PASS | None |
| 13c | No polling (deliberate) | PASS | None |
| 13d | QR hidden when inactive | PASS | None |
| 13e | Generate 400 error not surfaced | **FAIL** | Medium |

---

## Prioritised Fail/Partial Items

1. **HIGH — Section 1c: Deactivate overwrites `bookingLink` with `{detail: "..."}` instead of setting `is_active=false`.** This corrupts the entire Redux state for the booking link. After deactivation, the UI will break — `bookingLink.is_active` becomes `undefined`, `bookingLink.booking_link_url` becomes `undefined`, and subsequent renders will be incorrect. File: `providerBookingLinkSlice.ts`, line 122-123.

2. **MEDIUM — Section 5a/5d: No visual distinction between empty state and inactive state.** Both states show the same "Generate my Booking Link" CTA. The plan requires a separate "Reactivate" state. File: `BookingLinkCard.tsx`, line 81.

3. **MEDIUM — Section 7b: No clipboard fallback for non-HTTPS / older browsers.** Copy silently fails without `document.execCommand('copy')` fallback. Files: `BookingLinkCard.tsx` line 59-61, `ProfileLinkCard.tsx` line 27-28.

4. **MEDIUM — Section 13e: Generate 400 error not surfaced to user.** Error stored in Redux but never displayed. File: `BookingLinkCard.tsx` — no error display component.

5. **LOW — Section 6d: Conversion rate shows em dash instead of "0%" when clicks > 0 but bookings = 0.** File: `LinkStats.tsx`, line 63-64.

6. **LOW — Section 7d: Copy function duplicated across two cards.** Files: `BookingLinkCard.tsx`, `ProfileLinkCard.tsx`.

7. **LOW — Section 8a: Share button visible on desktop browsers without Web Share API.** Falls back to copy (functional) but misleading. Files: `BookingLinkCard.tsx`, `ProfileLinkCard.tsx`.
