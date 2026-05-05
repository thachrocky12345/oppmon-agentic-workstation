# Implementation Plan: RGDEV-209 — [Frontend] Contained Checkout Flow

**Ticket:** RGDEV-209 | **Priority:** Medium | **Status:** To Do
**Epic:** RGDEV-203 — Booking Link v3 Full Lifecycle Contained Checkout
**Jira:** https://reallyhq.atlassian.net/browse/RGDEV-209

---

## Overview

Build the complete client-facing checkout experience at `/book/[slug]`. A self-contained wizard: provider trust card → service selection → scheduling → auth/onboarding → payment → confirmation. All backend APIs are implemented under `apps/booking_link/` (RGDEV-204/205); this is a pure frontend build.

---

## Affected Systems

| Layer | Files / Components | Change Type |
|---|---|---|
| Frontend page | `src/pages/book/[slug].tsx` | New page (SSR for OG meta) |
| Frontend container | `src/containers/checkout/CheckoutWizard.tsx` | New multi-step wizard |
| Frontend containers | `src/containers/checkout/steps/` | New — 6 step components |
| Redux slice | `src/store/slices/checkoutSlice.ts` | New |
| REST helpers | `src/restapis/bookingLink.ts` | New API helper module |
| Mixpanel | `src/mixPanelEvents/bookings.ts` | New checkout funnel events |

---

## Page Entry Point

**Route:** `src/pages/book/[slug].tsx`

- `getServerSideProps` → `GET /api/v1/booking-link/resolve/<slug>/` for OG meta + validity
- `is_active === false` → render `InvalidLinkState` inline (no redirect)
- Mount `<CheckoutWizard slug={slug} />` for authenticated clients
- Unauthenticated → redirect to login with `?returnUrl=/book/[slug]`

---

## Wizard Steps

`CheckoutWizard.tsx` owns `currentStep` + shared `checkoutSession` state.

**Step 1 — `ProviderTrustCard.tsx`**
- `GET /api/v1/booking-link/checkout/provider/<slug>/`
- Name, photo, title, bio snippet. "Powered by Really Global" branding.
- `POST /api/v1/booking-link/track-click/<slug>/` once per session (sessionStorage dedup)

**Step 2 — `ServiceSelection.tsx`**
- `GET /api/v1/booking-link/checkout/services/<slug>/`
- 1 service → auto-skip to step 3

**Step 3 — `SchedulePicker.tsx`**
- `GET /api/v1/booking-link/checkout/slots/<slug>/`
- Auto-detect timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- On slot select → `POST /api/v1/booking-link/checkout/session/create/` + `POST /api/v1/booking-link/checkout/slot/hold/`
- Store `session_id` + `hold_until` in Redux. Start 15-min countdown — auto-release on expiry via `POST /api/v1/booking-link/checkout/slot/release/`

**Step 4 — `AuthOnboarding.tsx`**
- `GET /api/v1/booking-link/checkout/onboarding/status/`
- Missing fields → inline compact form → `POST /api/v1/booking-link/checkout/onboarding/`
- **Critical:** booking context (slug, rateId, slotId, sessionId) must survive auth via `sessionStorage` rehydration

**Step 5 — `PaymentCapture.tsx`**
- `GET /api/v1/booking-link/checkout/fee-preview/?session_id=<id>` → `fee_percent`, `fee_applies`
- `GET /api/v1/booking-link/checkout/cancellation-policy/<slug>/` — show before payment
- Discount display: `fee_applies: true` AND fee < 0.15 → show original price, discount line item, final price
- Stripe Elements or PayPal. On success → `POST /api/v1/booking-link/checkout/complete/`

**Step 6 — `BookingConfirmation.tsx`**
- Session details in client timezone. "Join your session" deep link.
- ICS download (`src/pages/api/ics.ts` — new API route). "Add to Google Calendar" link.
- "Explore more providers" → `/help-with`. "Manage booking" link (RGDEV-211 page).

---

## Error States

| State | Trigger |
|---|---|
| `InvalidLinkState.tsx` | `is_active: false` from resolve endpoint |
| `NoAvailabilityState.tsx` | Empty slots response |
| Return to step 3 + toast | 409 from slot hold |
| In-step retry | Non-2xx from complete endpoint |
| `SessionExpiredState.tsx` | `hold_until` countdown hits 0 |

---

## Redux Slice — `checkoutSlice.ts`

```ts
interface CheckoutState {
  slug: string | null
  sessionId: string | null
  holdUntil: string | null
  rateId: string | null
  slotId: number | null
  paymentType: 'stripe' | 'paypal' | 'free' | null
  step: number
  feePercent: string | null
  feeApplies: boolean
}
```

---

## REST Helpers — `src/restapis/bookingLink.ts`

New file wrapping all `/api/v1/booking-link/checkout/*` calls via `api` Axios instance from `src/store/axiosInstance.ts`. Shared with RGDEV-210.

---

## Mixpanel Events (in `src/mixPanelEvents/bookings.ts`)

`checkout_started`, `checkout_service_selected`, `checkout_slot_selected`, `checkout_auth_required`, `checkout_auth_completed`, `checkout_payment_started`, `checkout_completed`, `checkout_abandoned`, `checkout_slot_expired`

---

## Business Logic

1. Booking context persists through auth: store in `sessionStorage`, rehydrate on return
2. Slot hold countdown frontend-driven from `hold_until` — release on expiry
3. Timezone auto-detected on load, user override available
4. Discount UI only when `fee_applies: true` AND fee < 0.15
5. Track-click once per session per slug (sessionStorage dedup — same pattern as `cp-detail-preview.tsx:113-127`)
6. `POST checkout/complete/` called after Stripe `paymentIntent.succeeded` — never before

---

## Edge Cases

- Provider deactivates link mid-checkout → `InvalidLinkState`
- Slot stolen between hold and payment → 409 → return to scheduling
- Mobile in-app browser (WKWebView/Chrome Custom Tabs) — payment widgets must work
- Locale: date format, currency symbol

---

## Testing Plan

- Jest + RTL: each step with mock API responses; discount block conditional render; timer expire + auto-release; context survives mock auth redirect
- MSW integration: full wizard flow
- Manual Docker QA: full flow to confirmation, verify `BookingLinkCheckoutSession` COMPLETED + `BookingAttribution` created, expired slot test, invalid slug, mobile viewport

---

## Dependencies

- **Blocked by:** RGDEV-208 (Design)
- **Already done:** RGDEV-204, RGDEV-205, RGDEV-198
- **Coordinates with:** RGDEV-211 (session join + management page targets)
- **Shared helpers:** RGDEV-210 (`src/restapis/bookingLink.ts`)

---

## Implementation Order

1. `src/restapis/bookingLink.ts`
2. `src/store/slices/checkoutSlice.ts`
3. `src/pages/book/[slug].tsx` with `getServerSideProps`
4. `CheckoutWizard.tsx` shell
5. Steps 1–3 (trust card, service, scheduling + hold)
6. Step 4 (auth/onboarding gate)
7. Step 5 (payment + discount)
8. Step 6 (confirmation)
9. Error state components
10. Mixpanel events
11. ICS API route
12. Tests

---

## Estimated Complexity

**Frontend:** High — 8 story points
**Backend:** None (all APIs exist)
