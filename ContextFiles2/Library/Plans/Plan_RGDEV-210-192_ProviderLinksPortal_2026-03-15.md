# Implementation Plan: RGDEV-210 + RGDEV-192 — Provider Portal "Your Links" Section

**Tickets:** RGDEV-210 + RGDEV-192 | **Priority:** Medium | **Status:** To Do (both)
**Epic:** RGDEV-203 — Booking Link v3 Full Lifecycle Contained Checkout
**Jira 210:** https://reallyhq.atlassian.net/browse/RGDEV-210
**Jira 192:** https://reallyhq.atlassian.net/browse/RGDEV-192

---

## Overview

Build a unified "Your Links" section in the provider portal surfacing both provider links side by side:
- **RGDEV-192:** Profile attribution link (`really.global/en/<slug>`) — share publicly, 12% fee
- **RGDEV-210:** Booking Link (`really.global/book/<slug>`) — send to warm leads, 10% fee

All backend APIs are already implemented (RGDEV-204 for booking link). This is frontend only.

---

## Affected Systems

| Layer | Files / Components | Change Type |
|---|---|---|
| Provider portal | `src/containers/configure-settings/` or `src/containers/CareProviderProfile/` | New "Your Links" subsection |
| New component | `src/containers/provider-links/YourLinksPanel.tsx` | New — wrapper for both links |
| New component | `src/containers/provider-links/ProfileLinkCard.tsx` | RGDEV-192 — profile URL share |
| New component | `src/containers/provider-links/BookingLinkCard.tsx` | RGDEV-210 — booking link |
| New component | `src/containers/provider-links/QrCodeDownload.tsx` | QR preview + download |
| New component | `src/containers/provider-links/LinkStats.tsx` | Click/booking counts |
| REST helpers | `src/restapis/bookingLink.ts` | New (shared with RGDEV-209) |
| Redux slice | `src/store/slices/providerBookingLinkSlice.ts` | New |

---

## Find the Right Insertion Point

1. Check `src/containers/configure-settings/` — provider settings tabs
2. Check `src/containers/CareProviderProfile/` — profile management
3. Look for where provider's profile URL is currently shown — mount `YourLinksPanel` there
4. The section belongs in settings/profile management, NOT the setup wizard

---

## YourLinksPanel Layout

```
YourLinksPanel
├── ProfileLinkCard (RGDEV-192)
│   ├── Label: "Your Profile"
│   ├── URL: really.global/en/<slug>
│   ├── Copy button
│   ├── Native share (Web Share API / fallback dropdown)
│   └── Benefit copy: "Share publicly — standard fee 12%"
│
└── BookingLinkCard (RGDEV-210)
    ├── Label: "Your Booking Link"
    ├── URL: really.global/book/<slug>  (or empty state CTA)
    ├── Copy button
    ├── Native share
    ├── QrCodeDownload
    ├── LinkStats (click count, booking count, conversion rate)
    └── Benefit copy: "Send to warm leads — fee drops to 10%"
```

---

## ProfileLinkCard (RGDEV-192)

- Profile URL: `https://really.global/en/<user.profile_handle>` — derive from Redux user state (no API call needed, provider already has their slug)
- Copy to clipboard: `navigator.clipboard.writeText()` → "Copied!" for 2s
- Web Share API on mobile: `navigator.share({ title, url })`
- Benefit copy: `"Share your profile — when new clients book through it, your platform fee drops to 12%"`

---

## BookingLinkCard (RGDEV-210)

**APIs used:**
- `GET /api/v1/booking-link/my/` — fetch existing link
- `POST /api/v1/booking-link/generate/` — create/reactivate (idempotent)
- `POST /api/v1/booking-link/deactivate/` — deactivate
- `GET /api/v1/booking-link/qr/<pk>/` — PNG bytes (lazy, on panel open)

**Empty state** (no link yet):
- Icon + headline: "Start getting direct bookings"
- Copy: "Share your Booking Link and clients go straight to scheduling — no marketplace browsing. You get a 10% platform fee instead of 12% for every client who books through it."
- CTA: "Generate my Booking Link"

**Active state:**
- URL display + copy button
- Native share
- Deactivate option
- `QrCodeDownload` and `LinkStats` components

---

## QrCodeDownload Component

- `GET /api/v1/booking-link/qr/<pk>/` → PNG bytes
- Render as `<img src={blobUrl} />` via `URL.createObjectURL(blob)`
- "Download QR Code" → `<a href={blobUrl} download="really-global-booking-link-qr.png">`
- Fetch lazily on first expand — not on page load

---

## LinkStats Component

Data from `GET /api/v1/booking-link/my/` response fields: `click_count`, `booking_count`

Display:
```
[123 clicks]   [8 bookings]   [6.5% conversion]
```
- Conversion = `(booking_count / click_count * 100).toFixed(0)+'%'` — only show if `click_count > 0`
- Both zero → "Share your Booking Link to start tracking."

---

## Redux Slice — `providerBookingLinkSlice.ts`

```ts
interface ProviderBookingLinkState {
  bookingLink: BookingLinkData | null
  isLoading: boolean
  isGenerating: boolean
  error: string | null
}
```

Thunks: `fetchBookingLink`, `generateBookingLink`, `deactivateBookingLink`

---

## Fee Copy Reference

Hard-code in component copy (sourced from `apps/booking_link/utils.py:BOOKING_LINK_TELEHEALTH_FEE = 0.10`):
- Profile link: **12%** fee
- Booking Link: **10%** fee

---

## Business Logic

1. `generate` is idempotent — safe to call even if link exists
2. If `is_active: false` on existing link, call `generate` to reactivate
3. QR PNG fetched lazily — not on mount
4. Profile URL derived from existing Redux user state — no extra API call
5. Stats refresh on panel mount, no polling

---

## Testing Plan

- Jest + RTL: empty state before generation; generate calls correct endpoint; copy shows "Copied!"; stats conversion rate edge case (`click_count = 0`); QR download triggers anchor click
- Manual QA: generate link, copy, paste; download QR + scan; complete a booking via link, verify `booking_count` increments; verify profile URL copy works

---

## Dependencies

- **Blocked by:** RGDEV-208 (Design), RGDEV-189 (Design for 192)
- **Already done:** RGDEV-204 backend APIs
- **Shared REST helpers:** RGDEV-209 (`src/restapis/bookingLink.ts`)

---

## Implementation Order

1. `src/restapis/bookingLink.ts` (if not done by RGDEV-209 agent)
2. `src/store/slices/providerBookingLinkSlice.ts`
3. Locate insertion point in provider portal
4. `YourLinksPanel.tsx` skeleton
5. `ProfileLinkCard.tsx` (RGDEV-192)
6. `BookingLinkCard.tsx` empty state + generate flow (RGDEV-210)
7. `QrCodeDownload.tsx`
8. `LinkStats.tsx`
9. Wire benefit copy and fee differentiation
10. Tests + responsive polish

---

## Estimated Complexity

**Frontend:** Medium — 5 story points combined
**Backend:** None (all APIs exist)
