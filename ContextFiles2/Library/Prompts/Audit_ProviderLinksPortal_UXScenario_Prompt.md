# Audit Prompt: Provider Portal "Your Links" Section — UX, Scenario & Commercial Audit
## Tickets: RGDEV-210 (Booking Link card) + RGDEV-192 (Profile Link card)
## Epic: RGDEV-203 — Booking Link v3 Full Lifecycle Contained Checkout

---

## Context for the Auditor

This audit covers the **"Your Links"** section in the provider portal — a unified panel that surfaces two links side by side:

- **Profile Link** (RGDEV-192): `https://really.global/en/<slug>` — share publicly, **12% platform fee**
- **Booking Link** (RGDEV-210): `https://really.global/book/<slug>` — send to warm leads, **10% platform fee**

All backend APIs are implemented (RGDEV-204). This is a frontend-only implementation. Key backend facts relevant to audit:

- `BookingLink` model: UUID PK, `care_provider` (OneToOne), `slug_snapshot`, `click_count`, `booking_count`, `is_active` (from BaseModel)
- `BookingLinkMyView` (GET `/api/v1/booking-link/my/`): returns 404 when no link exists yet
- `BookingLinkGenerateView` (POST `/api/v1/booking-link/generate/`): idempotent — safe to call if link already exists; reactivates an inactive link and may rotate `slug_snapshot` with a `SlugRedirect` entry
- `BookingLinkDeactivateView` (POST `/api/v1/booking-link/deactivate/`): sets `is_active=False`
- `BookingLinkQrView` (GET `/api/v1/booking-link/qr/<pk>/`): returns PNG bytes; builds QR from `https://really.global/book/<slug_snapshot>` — uses production domain, not localhost
- Fee is hardcoded as `BOOKING_LINK_TELEHEALTH_FEE = 0.10` in `apps/booking_link/utils.py`; profile link fee is 0.12 (not stored, referenced as copy in the plan)

Front-end component plan:
- `YourLinksPanel.tsx` — wrapper for both cards
- `ProfileLinkCard.tsx` — profile URL, copy, share, "12% fee" benefit copy
- `BookingLinkCard.tsx` — booking URL or empty-state CTA, copy, share, deactivate, QR, stats
- `QrCodeDownload.tsx` — lazy QR fetch, blob URL, download anchor
- `LinkStats.tsx` — `click_count`, `booking_count`, derived conversion rate
- Redux slice `providerBookingLinkSlice.ts` — thunks: `fetchBookingLink`, `generateBookingLink`, `deactivateBookingLink`

---

## Audit Dimensions

For each dimension below, evaluate the implemented frontend against the specification, the backend contract, and the commercial requirements. Report: **PASS**, **FAIL**, or **RISK** with a specific finding.

---

### 1. Empty State Clarity

**What to check:**
- When `GET /api/v1/booking-link/my/` returns 404 (no link exists yet), does `BookingLinkCard` render the empty state — not an error state?
- Does the empty state render the full specified copy: "Start getting direct bookings" headline + body explaining the direct scheduling benefit + the **10% fee** callout?
- Is the CTA button labeled "Generate my Booking Link" and visually prominent (not a ghost button or text link)?
- Does the empty state feel rewarding and action-oriented, or clinical and buried?
- Is the 10% fee figure accurate — matching `BOOKING_LINK_TELEHEALTH_FEE = 0.10` in the backend?

**Pass criteria:** Provider landing on "Your Links" for the first time immediately understands the fee benefit and is visually guided toward generating their link.

---

### 2. Fee Differentiation Copy Accuracy

**What to check:**
- `ProfileLinkCard` displays: "Share your profile — when new clients book through it, your platform fee drops to **12%**"
- `BookingLinkCard` active state displays: "Send to warm leads — fee drops to **10%**"
- Empty state also references 10% correctly
- Neither card inverts the numbers (12% on booking link, 10% on profile link would be commercially incorrect)
- Copy does not say "reduce to" when it should say "drops to" or "is" — tone should match the plan's language

**Pass criteria:** Both fee figures are correct, clearly labelled per card, and no copy conflates the two tiers.

---

### 3. Both Links Visible Together Without Scrolling

**What to check:**
- `YourLinksPanel` renders `ProfileLinkCard` and `BookingLinkCard` in the same viewport region (side-by-side on desktop, stacked on mobile)
- On a 1280px desktop viewport, can a provider see both cards without scrolling?
- On a 375px mobile viewport, is the stacked layout still compact enough that both cards are reachable with a short scroll (not buried below the fold)?
- Is the panel mounted at the correct insertion point in the provider portal (settings/profile management — NOT the setup wizard)?

**Pass criteria:** Both links coexist visually within the same panel; provider does not need to navigate to separate pages or sections to see both.

---

### 4. Copy Button Visual Feedback

**What to check:**
- Clicking the copy button on `ProfileLinkCard` calls `navigator.clipboard.writeText()` with the correct profile URL (`https://really.global/en/<profile_handle>`)
- Clicking the copy button on `BookingLinkCard` copies `https://really.global/book/<slug_snapshot>`
- The button label transitions to "Copied!" (or equivalent visual indicator) **immediately** on click — not after an async round-trip
- The "Copied!" state resets to the original label after approximately 2 seconds
- If `navigator.clipboard` is unavailable (insecure context, permission denied), does the UI fail gracefully rather than silently doing nothing?

**Pass criteria:** Provider receives immediate, timed visual confirmation that the URL is in their clipboard. No silent failures.

---

### 5. QR Code URL Correctness

**What to check:**
- The QR download fetches `GET /api/v1/booking-link/qr/<pk>/` — the `pk` used is the UUID from the booking link, not a profile ID or integer
- The backend encodes `https://really.global/book/<slug_snapshot>` into the QR (verified in `BookingLinkQrView`: `url = f"https://really.global/book/{bl.slug_snapshot}"`)
- The frontend renders the PNG via `URL.createObjectURL(blob)` — not a data URI that could corrupt binary
- The download anchor sets `download="really-global-booking-link-qr.png"`
- After downloading, manually scan the QR: does it resolve to `https://really.global/book/<slug>`? Confirm it is NOT a localhost URL, a staging URL, or a raw API URL
- QR is fetched lazily (on first expand or panel open) — NOT on component mount during initial page load

**Pass criteria:** Downloaded QR PNG scans to the correct production booking URL. No localhost or staging leakage. Lazy fetch confirmed.

---

### 6. Mobile Native Share

**What to check:**
- On a mobile browser where `navigator.share` is available, clicking the share button on either card triggers the OS native share sheet
- The share payload includes: `title` (e.g., "Book a session with me"), `url` (the correct booking or profile URL)
- The URL passed to `navigator.share` is identical to the URL passed to `navigator.clipboard.writeText` — they must not diverge
- On desktop (where `navigator.share` is typically unavailable), is there a graceful fallback — e.g., dropdown with "Copy link" option or clipboard fallback?
- Does the share button remain visible and functional after a QR expand/collapse cycle?

**Pass criteria:** Native share fires on mobile with correct URL. Desktop fallback exists. No URL inconsistency between copy and share actions.

---

### 7. Stats Zero State

**What to check:**
- When `click_count === 0` AND `booking_count === 0`, `LinkStats` renders the message: "Share your Booking Link to start tracking." — not a row of zeroes
- When `click_count > 0` but `booking_count === 0`, the conversion rate is not rendered (avoid division-by-zero or "0%" displayed as meaningful data)
- When `click_count > 0` AND `booking_count > 0`, conversion rate renders as `Math.round(booking_count / click_count * 100) + '%'`
- The zero state message is encouraging (invites action), not a failure state (does not say "No data" or "N/A")
- Stats are refreshed on panel mount — no stale data from a previous session

**Pass criteria:** Zero state is actionable and human. Edge cases (clicks with no bookings, both zero) handled without rendering misleading numbers.

---

### 8. Deactivation UX

**What to check:**
- Clicking "Deactivate" does NOT immediately call `POST /api/v1/booking-link/deactivate/` — there is a confirmation step (modal, inline confirmation, or destructive-action pattern) before the API call fires
- After confirmed deactivation, the Redux state updates `bookingLink.is_active` to `false` and the card re-renders to show a deactivated state (e.g., URL grayed out, "Reactivate" CTA visible)
- The deactivated state is reflected immediately in the UI without requiring a page refresh or a re-fetch
- "Reactivate" CTA calls `POST /api/v1/booking-link/generate/` (which the backend handles as an idempotent reactivation — it may also rotate the slug if the provider's profile handle changed)
- After reactivation, the displayed URL updates to reflect the new `slug_snapshot` if it changed

**Pass criteria:** No accidental deactivation possible. State change is immediate and accurate in the UI. Reactivation path is clear and functional.

---

### 9. Commercial Risk: Stats Isolation (Cross-Provider Data Leakage)

**What to check:**
- `BookingLinkMyView` scopes by `request.user.care_provider` — the backend only returns the authenticated provider's own link. There is no `provider_id` or `booking_link_id` parameter accepted by this endpoint
- However, `BookingLinkQrView` accepts a `pk` parameter (UUID). If a provider manually crafts a request with a different provider's booking link UUID, `BookingLinkQrView` checks `care_provider=cp` before serving the PNG — so cross-provider QR access is blocked at the backend
- On the frontend: is the booking link `pk` (UUID) ever exposed in a URL query param, a `data-*` attribute, or JavaScript state that a provider could extract and manipulate?
- Does the Redux slice ever store multiple providers' booking link data in a way that could be read across accounts if two tabs are open?
- Is there any `provider_id` query parameter in the stats display path that a provider could manipulate to view another provider's `click_count`/`booking_count`?

**Pass criteria:** No frontend state or URL pattern exposes another provider's booking link ID in a manner that bypasses backend scoping. The backend's `care_provider=cp` guard in `BookingLinkQrView` is the authoritative control.

---

### 10. First-Time Provider End-to-End Flow

**What to check (full happy path):**

1. Provider has a completed profile (profile handle set — required by `BookingLinkGenerateView` which calls `get_provider_slug(cp)`)
2. Provider navigates to the "Your Links" section — `GET /api/v1/booking-link/my/` returns 404 → empty state renders
3. Provider clicks "Generate my Booking Link" → `POST /api/v1/booking-link/generate/` called → 200 response with `BookingLinkSerializer` data
4. Redux slice updates; `BookingLinkCard` transitions from empty state to active state without page refresh
5. URL is displayed: `https://really.global/book/<slug>`
6. Provider clicks copy → "Copied!" feedback shown → URL is correct in clipboard
7. Provider expands QR section → lazy fetch fires `GET /api/v1/booking-link/qr/<pk>/` → PNG renders
8. Provider clicks download → file saves as `really-global-booking-link-qr.png`
9. On mobile: provider taps share → OS share sheet appears with correct URL
10. `LinkStats` shows zero state with the encouraging message (not zeroes)

**Failure conditions to check:**
- Provider has NO profile handle: `generate` returns 400 with `"Complete your profile before generating a Booking Link."` — does the UI surface this error clearly (not swallow it)?
- Network failure during `generate`: does the "Generate" button return to its clickable state, not get stuck in a loading state forever?
- `generate` called twice in rapid succession (double-click): second call should be idempotent — does the UI debounce or handle duplicate responses gracefully?

**Pass criteria:** A brand-new provider can complete the full generate → copy → QR download flow without errors, silent failures, or confusing intermediate states.

---

## Evidence Format

For each dimension, provide:

```
Dimension N — [PASS | FAIL | RISK]
Finding: <specific observation>
Evidence: <component name, line reference, or test case>
Recommendation: <if FAIL or RISK>
```

Flag any dimension where the implementation deviates from the plan in `Plan_RGDEV-210-192_ProviderLinksPortal_2026-03-15.md` or where the frontend copy contradicts the backend fee constants.
