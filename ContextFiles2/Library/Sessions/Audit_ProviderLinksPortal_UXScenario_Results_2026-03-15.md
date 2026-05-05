# UX/Scenario Audit Results: RGDEV-210 + RGDEV-192 (Provider Portal "Your Links")

**Auditor:** B (UX/Scenario) | **Date:** 2026-03-15
**Worktree:** `agent-ab3dfd6d`

---

## Files Reviewed

| File | Location (worktree agent-ab3dfd6d) |
|---|---|
| `YourLinksPanel.tsx` | `src/containers/provider-links/YourLinksPanel.tsx` |
| `ProfileLinkCard.tsx` | `src/containers/provider-links/ProfileLinkCard.tsx` |
| `BookingLinkCard.tsx` | `src/containers/provider-links/BookingLinkCard.tsx` |
| `QrCodeDownload.tsx` | `src/containers/provider-links/QrCodeDownload.tsx` |
| `LinkStats.tsx` | `src/containers/provider-links/LinkStats.tsx` |
| `providerBookingLinkSlice.ts` | `src/store/slices/providerBookingLinkSlice.ts` |
| `bookingLink.ts` (REST) | `src/restapis/bookingLink.ts` |

**Note:** A second `bookingLink.ts` exists in worktree `agent-a97ae695` with checkout-flow APIs (RGDEV-209). The `agent-ab3dfd6d` copy is the one used by the provider-links components and contains only the 4 provider-side endpoints.

---

## Dimension 1 — Empty State Clarity

**PASS**

**Finding:** When `fetchBookingLink` returns 404, the thunk resolves with `null` (line 41-43 of slice). `BookingLinkCard` checks `if (!bookingLink || !isActive)` (line 81) and renders the empty state with:
- Headline: "Start getting direct bookings" (correct)
- Body: mentions **10%** fee vs 12% (correct)
- CTA: "Generate my Booking Link" as a `variant="contained"` Button with rounded corners (visually prominent)
- RocketLaunchIcon at 48px adds visual appeal

**Evidence:** `BookingLinkCard.tsx` lines 81-137; `providerBookingLinkSlice.ts` lines 40-43.

---

## Dimension 2 — Fee Differentiation Copy Accuracy

**PASS**

**Finding:**
- `ProfileLinkCard.tsx` line 100-101: "your platform fee drops to **12%**" — correct
- `BookingLinkCard.tsx` active state line 200: "fee drops to **10%**" — correct
- `BookingLinkCard.tsx` empty state line 113: "**10%** platform fee instead of 12%" — correct
- Chip labels: ProfileLinkCard shows "12% fee" (line 66), BookingLinkCard shows "10% fee" (line 159) — correct, no inversion
- Fee numbers match `BOOKING_LINK_TELEHEALTH_FEE = 0.10` and documented 12% profile fee

**Evidence:** Lines cited above. No copy conflation between tiers.

---

## Dimension 3 — Both Links Visible Together Without Scrolling

**PASS**

**Finding:** `YourLinksPanel.tsx` uses MUI `Grid` with `spacing={3}` — `xs={12}` (stacked on mobile), `md={6}` (side-by-side on desktop). On 1280px, both cards occupy 50% width each. Cards use `height: "100%"` for equal heights.

**Minor note:** If `profileHandle` is null/undefined, `ProfileLinkCard` is omitted entirely and `BookingLinkCard` takes full width (`md={12}`). This is acceptable behavior since a provider without a profile handle cannot share a profile link.

**Evidence:** `YourLinksPanel.tsx` lines 49-58.

---

## Dimension 4 — Copy Button Visual Feedback

**FAIL**

**Finding:** Both `ProfileLinkCard` and `BookingLinkCard` use `navigator.clipboard.writeText()` with a `setCopied(true)` / `setTimeout(2000)` pattern — correct timing. However, the "Copied!" feedback is only shown via `Tooltip title={copied ? "Copied!" : "Copy link"}`. This requires hovering over the button to see the tooltip. On mobile (touch), MUI Tooltips do not reliably show on tap. The button icon itself does not change, so there is **no visible feedback without hover**.

Additionally, if `navigator.clipboard` is unavailable (insecure context), the catch block only calls `console.error` — no user-facing fallback or notification.

**Evidence:** `ProfileLinkCard.tsx` lines 20-28, 84-88; `BookingLinkCard.tsx` lines 53-61, 184-188.

**Recommendation:** Change the copy button label/icon to a checkmark on success (not just tooltip). Add a toast notification via `react-toastify` as fallback feedback. Add `document.execCommand('copy')` fallback for insecure contexts.

---

## Dimension 5 — QR Code URL Correctness

**PASS**

**Finding:**
- `QrCodeDownload` receives `bookingLinkId` prop, which is `bookingLink.id` (UUID from the API response) — correct PK type
- `fetchBookingLinkQr(pk)` calls `GET /api/v1/booking-link/qr/${pk}/` with `responseType: "blob"` — correct
- PNG rendered via `URL.createObjectURL(blob)` — correct (not data URI)
- Download anchor has `download="really-global-booking-link-qr.png"` — correct filename
- QR is fetched lazily on "Show QR Code" click, not on mount — correct
- Blob URL is cleaned up on unmount via `URL.revokeObjectURL` — good memory management

**Evidence:** `QrCodeDownload.tsx` lines 26-41 (lazy fetch), 74-78 (download anchor), 18-24 (cleanup); `bookingLink.ts` lines 18-23.

---

## Dimension 6 — Mobile Native Share

**PASS** (with minor note)

**Finding:** Both cards check `navigator.share` and fall back to `handleCopy()` on desktop. Share payloads:
- `ProfileLinkCard`: `{ title: "My Really Global Profile", url: profileUrl }` — `profileUrl` is same as clipboard URL
- `BookingLinkCard`: `{ title: "Book with me on Really Global", url: bookingUrl }` — `bookingUrl` is same as clipboard URL

No URL inconsistency between copy and share. Desktop fallback (copy) exists. Share button remains visible after QR expand/collapse since it is outside the QR component.

**Minor note:** The share error handler in `BookingLinkCard` uses a bare `catch` without `err` parameter (line 72). This is valid ES2019+ syntax but some linter configs may flag it.

**Evidence:** `ProfileLinkCard.tsx` lines 31-46; `BookingLinkCard.tsx` lines 64-78.

---

## Dimension 7 — Stats Zero State

**PASS**

**Finding:**
- Both zero: renders "Share your Booking Link to start tracking." in italic — correct encouraging message (line 48-60 of `LinkStats.tsx`)
- Clicks > 0, bookings = 0: conversion renders as em dash ("\u2014") not "0%" — avoids misleading data (line 63-66)
- Both > 0: conversion = `((bookingCount / clickCount) * 100).toFixed(0)%` — matches plan's `Math.round` equivalent
- Stats come from the `fetchBookingLink` response (fetched on `YourLinksPanel` mount via `useEffect`) — fresh data each time

**Evidence:** `LinkStats.tsx` lines 48-61 (zero state), 63-66 (conversion logic).

---

## Dimension 8 — Deactivation UX

**FAIL** (Critical)

**Finding:** Clicking "Deactivate link" immediately dispatches `deactivateBookingLinkThunk()` with **no confirmation step** — no modal, no inline confirmation, no double-click guard. This violates the audit requirement: "Clicking 'Deactivate' does NOT immediately call POST /api/v1/booking-link/deactivate/ — there is a confirmation step."

Additionally, after deactivation the slice sets `bookingLink` to the API response (which has `is_active: false`). The `BookingLinkCard` condition `!bookingLink || !isActive` (line 81) then renders the **empty state** — which shows "Generate my Booking Link". However, this empty state does not distinguish between "never had a link" and "had a link but deactivated it". The CTA text should say "Reactivate" in the deactivated case, not "Generate".

The reactivation path works technically (calling `generate` is idempotent and reactivates), but the UX is misleading because the provider sees the same empty state they saw before they ever had a link.

**Evidence:** `BookingLinkCard.tsx` lines 49-51 (no confirmation), lines 81-137 (shared empty/deactivated state).

**Recommendation:**
1. Add a confirmation dialog before dispatching `deactivateBookingLinkThunk`.
2. Differentiate the deactivated state from the never-had-a-link state. When `bookingLink !== null && !isActive`, show: URL grayed out, stats preserved, "Reactivate" CTA instead of "Generate my Booking Link".

---

## Dimension 9 — Commercial Risk: Stats Isolation

**PASS**

**Finding:**
- `fetchMyBookingLink()` calls `GET /api/v1/booking-link/my/` with no user-controllable parameters — scoped by auth token on the backend
- QR fetch uses `bookingLink.id` from the authenticated response — not from a URL param or user input
- Redux slice stores only a single `bookingLink` object (not a collection) — no cross-provider data possible
- The booking link `id` (UUID) is stored in React component state only — not in URL query params or `data-*` attributes
- No `provider_id` parameter exists in any REST call in `bookingLink.ts`

**Evidence:** `bookingLink.ts` lines 3-6 (my/ endpoint, no params); `providerBookingLinkSlice.ts` state shape (single object); `BookingLinkCard.tsx` line 208 (id passed to QrCodeDownload as prop only).

---

## Dimension 10 — First-Time Provider End-to-End Flow

**FAIL** (Error handling gap)

**Finding:** The happy path works:
1. 404 → null → empty state renders (correct)
2. Click "Generate" → `generateBookingLinkThunk` → API call → slice updates → card re-renders to active (correct)
3. Copy, share, QR, stats all functional (verified in dimensions above)

**Failure conditions:**

- **No profile handle (400 error):** The slice stores `error` in state (`action.payload as string`), but `BookingLinkCard` **never reads `error` from Redux state**. The error is silently swallowed. The "Generate" button returns to clickable state (correct) but the provider has no idea why generation failed. This is a UX gap.

- **Network failure during generate:** `isGenerating` returns to false on rejection (line 111-113 of slice), so the button is not stuck. However, again, no error message is surfaced.

- **Double-click:** No debounce or `isGenerating` guard on the `handleGenerate` callback itself. The button is disabled when `isGenerating` is true (line 119), which provides basic double-click protection via the UI. However, two rapid clicks before the first dispatch sets `isGenerating=true` could fire two requests. The backend handles this idempotently, so no data corruption, but it is a minor UX issue.

**Evidence:** `BookingLinkCard.tsx` — no reference to `error` selector; `providerBookingLinkSlice.ts` lines 111-113 (error stored but never displayed).

**Recommendation:** Add an `error` selector read in `BookingLinkCard` and display it as an inline alert or toast. For the "no profile handle" case, surface the backend's `"Complete your profile before generating a Booking Link."` message.

---

## Summary

| Dimension | Verdict | Severity |
|---|---|---|
| 1. Empty State Clarity | **PASS** | — |
| 2. Fee Differentiation Copy Accuracy | **PASS** | — |
| 3. Both Links Visible Together | **PASS** | — |
| 4. Copy Button Visual Feedback | **FAIL** | Medium — Tooltip-only feedback invisible on mobile touch |
| 5. QR Code URL Correctness | **PASS** | — |
| 6. Mobile Native Share | **PASS** | — |
| 7. Stats Zero State | **PASS** | — |
| 8. Deactivation UX | **FAIL** | **High — No confirmation before deactivation; deactivated state indistinguishable from never-had-a-link state** |
| 9. Commercial Risk: Stats Isolation | **PASS** | — |
| 10. First-Time Provider E2E Flow | **FAIL** | Medium — API errors (including "complete your profile") silently swallowed, never shown to user |

**Overall: 7 PASS, 3 FAIL**

### Most Critical Finding

**Dimension 8 (Deactivation UX):** The "Deactivate link" button fires the API call immediately with zero confirmation. A single accidental click deactivates the provider's booking link. After deactivation, the UI shows the same empty state as a provider who never had a link — losing all visual context (stats, URL) and presenting a misleading "Generate" CTA instead of "Reactivate". This is the highest-severity finding because it risks accidental link disruption and provider confusion.
