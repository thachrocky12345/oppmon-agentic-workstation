# Audit Results: RGDEV-209 Contained Checkout Flow -- UX, Scenario & Commercial Review

**Auditor:** B (UX/Scenario)
**Date:** 2026-03-15
**Ticket:** RGDEV-209 | **Epic:** RGDEV-203
**Implementation location:** `RG-Frontend/.claude/worktrees/agent-a97ae695/src/`

---

## Implementation Inventory

| Planned File | Status |
|---|---|
| `src/pages/book/[slug].tsx` | **MISSING** -- not created |
| `src/containers/checkout/CheckoutWizard.tsx` | **MISSING** -- not created |
| `src/containers/checkout/steps/ProviderTrustCard.tsx` | Exists |
| `src/containers/checkout/steps/ServiceSelection.tsx` | Exists |
| `src/containers/checkout/steps/SchedulePicker.tsx` | Exists (has type import error) |
| `src/containers/checkout/steps/AuthOnboarding.tsx` | Exists |
| `src/containers/checkout/steps/PaymentCapture.tsx` | Exists |
| `src/containers/checkout/steps/BookingConfirmation.tsx` | Exists |
| `src/containers/checkout/InvalidLinkState.tsx` | Exists |
| `src/containers/checkout/NoAvailabilityState.tsx` | Exists |
| `src/containers/checkout/SessionExpiredState.tsx` | Exists |
| `src/store/slices/checkoutSlice.ts` | Exists |
| `src/restapis/bookingLink.ts` | Exists |
| `src/mixPanelEvents/bookings.ts` | Exists (generic booking events, not checkout-funnel-specific) |
| `src/pages/api/ics.ts` | **MISSING** -- not created |

**Critical:** The page entry point (`book/[slug].tsx`) and the wizard orchestrator (`CheckoutWizard.tsx`) are missing. Without these, the checkout flow is not mountable. The step components exist but cannot be rendered. The ICS download route is also missing.

---

## Section 1 -- Mobile Experience

### 1.1 Mobile viewport layout
**FAIL**

- **Finding:** No explicit breakpoint constraints exist in any step component. All components use MUI's `Box` with `px: 2` or `px: 3` padding. The `ProviderTrustCard` bio uses `-webkit-line-clamp: 4` with `maxWidth: 500` which is acceptable. The service cards use `Grid` with `xs={12} sm={6} md={4}` which stacks on mobile -- this is correct.
- **Gap:** The `SchedulePicker` slot buttons use `flexWrap: "wrap"` which will reflow on narrow viewports, but there is no explicit mobile calendar view. Slots are rendered as a flat date-grouped list of time buttons, not a 7-column calendar grid, so horizontal scrolling is avoided. CTA buttons do not have explicit `minHeight: 44` or `minWidth: 44` for touch targets -- MUI `Button` defaults may not meet 44x44px.
- **Recommended fix:** Add `minHeight: 44` to all primary action buttons across all steps. Verify touch target sizes for slot time buttons in SchedulePicker (currently `size="small"` which is likely under 44px).

### 1.2 Stripe Elements in WKWebView
**FAIL**

- **Finding:** `PaymentCapture.tsx` uses standard `@stripe/react-stripe-js` `<Elements>` + `<CardElement>`. This is the correct integration pattern.
- **Gap 1:** No fallback path exists if `window.Stripe` fails to load (CSP blocks `js.stripe.com`). `loadStripe` will return `null`, and the `handlePay` function checks `if (!stripe || !elements) return;` -- but this silently prevents payment with no user feedback.
- **Gap 2:** No PayPal integration is implemented. The plan lists PayPal as an option (`@react-paypal-js`), and the Redux state has `paymentType: 'paypal'`, but `PaymentCapture.tsx` only implements Stripe CardElement. No PayPal popup or redirect flow exists.
- **Gap 3:** Hardcoded Stripe test key at line 36 (`pk_test_51Qy...`). This is a credential leak in source code.
- **Recommended fix:** Add error state when Stripe fails to load. Implement PayPal flow or remove from plan. Move Stripe key to env variable only (the `process.env` fallback should not include a hardcoded key).

### 1.3 Input field UX on mobile
**FAIL**

- **Finding:** `AuthOnboarding.tsx` renders all missing fields as generic `<TextField>` components (line 150-158). Field names are converted from snake_case to title case labels.
- **Gap:** `date_of_birth` will render as a plain text input, not `<input type="date">`. `phone_number` renders as text, not `type="tel"`. No `autocomplete` attributes are set on address fields. No field-type differentiation whatsoever -- all fields are identical text inputs.
- **Recommended fix:** Add field-type mapping: `date_of_birth` -> `type="date"`, `phone_number` -> `type="tel"` with `inputMode="tel"`, address fields -> `autoComplete="street-address"` etc.

---

## Section 2 -- Single-Service Auto-Skip

### 2.1 Auto-skip rendering guarantee
**FAIL**

- **Finding:** `ServiceSelection.tsx` lines 44-48: the auto-skip happens inside the `useEffect` callback after `setServices(data)` and `setLoading(false)`. The component renders a loading spinner while `loading` is true. The auto-skip (`dispatch(selectService(data[0])); dispatch(nextStep())`) fires in the same async callback as `dispatch(setServices(data))`, but React may batch these. The component briefly enters a state where `loading=false` and `services=[1 item]` before the `nextStep` dispatch triggers.
- **Gap:** There WILL be a flash of the service selection UI for a single render cycle. The `loading` flag is set to `false` in the `finally` block (line 53) which executes after the auto-skip dispatches (lines 46-48), but `setLoading(false)` and the dispatches are in the same microtask, so React 18 will batch them. However, the component body at lines 100-162 renders the service cards when `!loading && !error`, so there is at minimum one committed render with the single service card visible.
- **Gap 2:** If `data.length === 0`, the component renders an empty `<Grid>` with the "Select a service" heading. There is no handling for zero services.
- **Recommended fix:** Add early return in the component body: `if (services.length === 1 && !loading) return null;` to suppress the flash. Add zero-services fallback state.

### 2.2 Rate pre-selection persistence
**PASS**

- **Finding:** `selectService` reducer (checkoutSlice.ts line 67-69) sets both `selectedService` and `rateId` in a single dispatch. The `nextStep` dispatch follows immediately. `SchedulePicker.tsx` reads `rateId` from Redux at line 77 and guards with `if (!rateId) return;` at line 143 before calling `createSession`.
- **Gap:** None -- the rateId is written before SchedulePicker mounts.

---

## Section 3 -- Timezone Display

### 3.1 Timezone shown before slot selection
**PASS**

- **Finding:** `SchedulePicker.tsx` lines 258-296 render a "Times shown in [timezone selector]" label above all slot listings. The timezone dropdown is visible before the user taps any slot.

### 3.2 Timezone override flow
**FAIL**

- **Finding:** The override UI is an MUI `<Select>` dropdown with a hardcoded list of 9 IANA timezone values (lines 277-294). These are valid IANA strings. When the user changes timezone, `setTimezone(e.target.value)` updates local state, and `formatTime`/`formatDate` re-render all slots with the new timezone.
- **Gap 1:** The timezone list is hardcoded and incomplete. Users in unlisted timezones (e.g., `Asia/Kolkata`, `America/Sao_Paulo`, `Africa/Lagos`) cannot select their timezone. The detected timezone is included in the list, but if the user's detected TZ is not one of the 9, they see it alongside only 9 other options.
- **Gap 2:** The selected `timezone` is stored in local component state, NOT in Redux or sessionStorage. It is not sent to `createSession` or any backend call. The `BookingLinkCheckoutSession.client_timezone` field is never populated by the frontend.
- **Recommended fix:** Use a comprehensive IANA timezone list (or `Intl.supportedValuesOf('timeZone')` in modern browsers). Write selected timezone to Redux and include in `createSession` payload.

### 3.3 Timezone persistence through auth redirect
**FAIL**

- **Finding:** `AuthOnboarding.tsx` lines 22-29 persist context to sessionStorage, but the payload is `{ slug, rateId, slotId, sessionId, holdUntil }`. No `client_timezone` field is included.
- **Gap:** On rehydration after auth redirect, the timezone is lost and will be re-detected from the browser, which is likely the same value but is not guaranteed (e.g., VPN change, different device).
- **Recommended fix:** Add `timezone` to the sessionStorage context payload.

---

## Section 4 -- Hold Timer UX

### 4.1 Countdown visibility
**FAIL** (critical)

- **Finding:** The countdown timer is rendered ONLY in `SchedulePicker.tsx` (lines 299-306) as a `<Chip>` element. It is NOT rendered on Step 4 (AuthOnboarding) or Step 5 (PaymentCapture). Once the user advances past Step 3, the countdown disappears.
- **Gap:** The user has no visibility into remaining hold time during the auth and payment steps. They could spend 14 minutes on onboarding and unknowingly have their slot expire before they finish payment.
- **Timer format:** `mm:ss` format is correctly implemented (line 242-246). Color changes to "warning" when under 120 seconds.
- **Timer computation:** Correctly uses `new Date(holdUntil).getTime() - Date.now()` on each tick (line 121-122), which is drift-resistant.
- **Recommended fix:** Move the countdown timer into `CheckoutWizard.tsx` (once created) as a persistent banner visible on all post-scheduling steps.

### 4.2 Expiry during active payment
**FAIL** (critical)

- **Finding:** The expiry handler in `SchedulePicker.tsx` (lines 125-130) sets `expired=true` and calls `releaseSlot()`. However, this effect only runs while `SchedulePicker` is mounted. When the user is on Step 5 (PaymentCapture), SchedulePicker is unmounted and the timer is not running. No other component monitors hold expiry.
- **Gap:** If the hold expires during payment, the frontend does NOT detect it. The user can complete Stripe payment, and `checkout/complete/` will be called. Per the audit prompt, the backend does NOT check `hold_until < now` in `CheckoutCompleteView` -- it only checks session status. This means: **a payment can succeed on an expired hold**, creating an appointment for a slot that may have already been released and booked by another client.
- **Recommended fix:** (1) Add hold expiry monitoring to the wizard shell, active on all steps. (2) Backend must validate `hold_until >= now` in `CheckoutCompleteView`.

### 4.3 Hold timer across auth step
**FAIL**

- **Finding:** `AuthOnboarding.tsx` persists context to sessionStorage (line 43), including `holdUntil`. However, there is no rehydration logic that checks `holdUntil` on page load. The plan mentions `sessionStorage` rehydration but `CheckoutWizard.tsx` (which would handle rehydration) does not exist.
- **Gap:** After an auth redirect, the user returns with no hold expiry check. If >15 minutes passed, they proceed to payment with an expired hold, leading to the same risk as 4.2.
- **Recommended fix:** Implement rehydration in the wizard shell that immediately checks `new Date(holdUntil) < Date.now()` and shows `SessionExpiredState` if true.

---

## Section 5 -- Discount Display Completeness

### 5.1 Discount UI trigger logic
**PASS**

- **Finding:** `PaymentCapture.tsx` line 102-105: `parseFloat(feePreview.fee_percent) < 0.15` -- correctly parses the string to float before comparison.
- **Gap on semantics:** The discount UI label says "Platform fee (Discounted)" (line 148-155). This shows a platform fee, not a client-facing price reduction. The audit prompt's concern about whether this is confusing is valid but is a product/design decision, not a code bug.

### 5.2 Required discount display elements
**FAIL**

- **Finding:** The discount block renders: session price, platform fee line (with "(Discounted)" tag), and total. It does NOT render:
  - The original (undiscounted) price with strikethrough
  - The fee as both a percentage AND dollar amount simultaneously -- only dollar amount is shown (`fee_amount`)
  - The attribution message (e.g., "Referred by [Provider Name] via their Booking Link") -- completely absent
- **Gap:** Only 2 of 4 required elements are present (fee line item with $ amount, final price). Missing: original price display and attribution message.
- **Recommended fix:** Add strikethrough original price when discount applies. Add attribution message text. Show `fee_percent` as percentage alongside dollar amount.

### 5.3 Discount display for returning client (`fee_applies: false`)
**PASS**

- **Finding:** Line 138: `{feePreview.fee_applies && (...)}` -- the fee line item is conditionally rendered only when `fee_applies` is true. For returning clients with `fee_applies: false`, only session price and total are shown. No residual discount UI.
- **Gap:** No explicit "Welcome back" or "No referral fee" messaging for returning clients. This is a UX nicety, not a bug.

---

## Section 6 -- No Availability State

### 6.1 Empty slots response handling
**FAIL**

- **Finding:** `NoAvailabilityState.tsx` renders: a heading ("No availability right now"), body text, and a "Go Back" button. It does NOT render:
  - Provider trust card (name, photo) -- absent
  - "Next available date" -- absent (no API for this)
  - Email capture form / waitlist -- absent
  - Link to explore other providers (`/help-with`) -- absent
- **Gap:** The component is a conversion dead-end. The "Go Back" button goes to Step 2 (service selection), which is unhelpful since the issue is no slots, not wrong service.
- **Recommended fix:** Add provider trust card, add "Explore other providers" button linking to `/help-with`, add email capture for notifications. The "Go Back" target should be reconsidered.

### 6.2 Partial availability (far-future slots)
**MISSING**

- **Finding:** The slot list is rendered as a flat list grouped by date. There is no "first available" jump-to action. If slots start 6 weeks out, the user sees empty space or must scroll through many date groups.
- **Recommended fix:** Add a "Jump to first available" button or auto-scroll to the first date with slots.

---

## Section 7 -- Invalid Link UX

### 7.1 InvalidLinkState content
**FAIL**

- **Finding:** `InvalidLinkState.tsx` renders a heading ("This booking link is no longer active"), body text, and an "Explore Providers" button linking to `/help-with`.
- **Gap 1:** Does not differentiate between deactivated provider (still searchable on marketplace) and unknown slug (completely dead link). Same message for both.
- **Gap 2:** No embedded search bar. Only a button CTA to `/help-with`.
- **Recommended fix:** Accept `is_active` and `slug_exists` as separate props to differentiate messaging. Add "Search for another provider" inline search.

### 7.2 SlugRedirect transparent resolution
**MISSING**

- **Finding:** `src/pages/book/[slug].tsx` does not exist. There is no `getServerSideProps` implementation. The `resolveBookingLink` function in `bookingLink.ts` exists but is not called from any page. The `BookingLinkResolution` type does not include a `redirect_to` field.
- **Gap:** No 301 redirect handling. No SSR. No OG meta rendering. The entire entry-point flow is missing.
- **Recommended fix:** Implement `src/pages/book/[slug].tsx` with `getServerSideProps` that calls the resolve endpoint, handles `redirect_to` with 301, sets OG meta, and mounts `CheckoutWizard`.

---

## Section 8 -- Confirmation Step Completeness

### 8.1 Required confirmation elements
**FAIL**

- **Session details in client timezone:** Uses `Intl.DateTimeFormat().resolvedOptions().timeZone` (re-detected, line 46) instead of reading `client_timezone` from the session. This works in practice but ignores any timezone the user selected during scheduling.
- **Join session deep link:** Links to `/session/join/${appointmentId}` (line 185). This URL pattern does not exist in the codebase. No Twilio room is created at booking time. This is a dead link.
- **ICS download:** Links to `/api/ics?appointmentId=${appointmentId}` (line 72). The `src/pages/api/ics.ts` file does NOT exist. This will 404.
- **Google Calendar link:** Correctly constructs Google Calendar URL with proper params (lines 15-33). **PASS.**
- **Explore more providers:** Links to `/help-with`. **PASS.**
- **Manage booking link:** Links to `/booking/${appointmentId}` (line 201). RGDEV-211 not shipped. No conditional render or feature flag. **Dead link.**

### 8.2 Confirmation reachability after page refresh
**FAIL**

- **Finding:** `BookingConfirmation` reads all data from Redux (`checkout.appointmentId`, `checkout.providerProfile`, `checkout.selectedSlot`, `checkout.selectedService`). On page refresh, Redux is cleared and all values become `null`. There is no URL-based session ID and no rehydration from a backend status endpoint.
- **Gap:** After refresh, the confirmation page renders with empty data -- provider name becomes "your provider", dates are empty strings, no appointment actions.
- **Recommended fix:** Add `session_id` or `appointment_id` to URL params. On mount, if Redux is empty, fetch from `GET /checkout/session/<id>/status/`.

---

## Section 9 -- Returning Client Flow

### 9.1 Fee preview for returning client
**MISSING** (needs clarification)

- **Finding:** The `FeePreview` type includes `fee_applies: boolean` and the conditional UI works (Section 5.3). However, there is no returning-client-specific UI: no "Welcome back" message, no shortened onboarding, no explicit "No referral fee" callout.
- **Gap on `include_cancelled=False`:** This is a backend business logic question. The frontend has no visibility into this parameter. Cannot audit from frontend code alone. **NEEDS CLARIFICATION.**

### 9.2 Returning client fee accuracy window
**MISSING**

- **Finding:** The frontend does not label the fee preview as an estimate. No caveat text is displayed. If the fee changes between preview and completion, the user sees a different charge than expected with no warning.
- **Recommended fix:** Add "(estimated)" or "Final amount calculated at checkout" disclaimer.

---

## Section 10 -- Payment Failure Recovery

### 10.1 Slot retention on payment failure
**FAIL**

- **Finding:** `PaymentForm.handlePay` (PaymentCapture.tsx lines 52-99) catches errors and shows toast messages. It does NOT navigate away -- the form remains visible for retry. The same `sessionId` and slot are preserved in Redux.
- **Gap:** The hold timer is NOT visible on the payment step (per Section 4.1). The user can retry but has no idea how much time remains on their hold.
- **Recommended fix:** Display hold countdown on payment step.

### 10.2 Server-side failure path (409 at checkout/complete)
**FAIL**

- **Finding:** Line 92-93: `if (err?.response?.status === 409) { toast.error("This time slot is no longer available."); }` -- shows a toast but does NOT navigate back to Step 3. The user stays on the payment form with no way to pick a new slot.
- **Gap:** No navigation to Step 3. No session invalidation. No new session creation. The user is stuck.
- **Recommended fix:** On 409, dispatch `setStep(3)` and `resetCheckout()` (or create a partial reset that preserves slug/provider), then show a toast with explanation.

### 10.3 Double-submit / idempotency
**FAIL**

- **Finding:** The `processing` state disables the pay button during a single request. However, `PaymentCapture.tsx` sends `paymentMethod.id` as `stripe_payment_intent_id` (line 81) -- this is a PaymentMethod ID, NOT a PaymentIntent ID. The field name and value are mismatched. It's unclear how the backend handles this.
- **Gap 1:** The frontend creates a PaymentMethod, not a PaymentIntent. The plan says `checkout/complete/` receives `stripe_payment_intent_id`. Either the backend expects a PM ID and the field is misnamed, or this will fail at the backend.
- **Gap 2:** There is no dedicated `POST /checkout/payment-intent/` endpoint in the REST helpers. The flow appears to be: create PM on frontend -> send PM ID to backend -> backend creates PI. If so, idempotency is the backend's responsibility, which is outside this audit's scope but the field name mismatch is a frontend bug.
- **Recommended fix:** Clarify the payment flow. If backend creates PI from PM, rename the field to `stripe_payment_method_id` or align with the actual backend serializer field name.

---

## Section 11 -- Commercial Risk: Booking via Inactive Provider

### 11.1 `is_active` check path analysis
**MISSING** (frontend cannot fully verify)

- **Finding:** The frontend has no `is_active` guard logic because `src/pages/book/[slug].tsx` does not exist. The `resolveBookingLink` function returns `is_active: boolean` but no page-level component consumes it to render `InvalidLinkState`. Individual step components (`getProviderProfile`, `getServices`, `getSlots`) do not check `is_active` -- they just call their endpoints and trust the backend.
- **Gap:** With no page entry point, there is zero frontend guard against inactive links. All protection depends on backend endpoint validation.

### 11.2 Mid-checkout provider deactivation
**MISSING**

- **Finding:** No polling mechanism exists. No step component checks `is_active` after initial load. If the provider deactivates their link after Step 1, the client proceeds through all remaining steps uninterrupted.
- **Recommended fix:** `CheckoutWizard.tsx` (once created) should poll session status or re-validate `is_active` before payment.

### 11.3 Attribution fee tier validation
**MISSING** (frontend cannot verify)

- **Finding:** The frontend calls `getFeePreview(sessionId)` which returns pre-computed values. The frontend has no visibility into whether `get_booking_link_fee_percent` is called with `None` or with the actual appointment. This is a backend concern.
- **Gap from frontend perspective:** No disclaimer that the fee is an estimate. See Section 9.2.

---

## Section 12 -- Additional Findings

### 12.1 Type Import Error (Build Blocker)
**FAIL**

- **File:** `SchedulePicker.tsx` line 25
- **Issue:** `import type { SlotOption, CheckoutState } from "../../../store/slices/checkoutSlice";` -- `SlotOption` is defined in `restapis/bookingLink.ts`, not in `checkoutSlice.ts`. The checkoutSlice imports `SlotOption` from bookingLink but does NOT re-export it. This will cause a TypeScript compilation error.
- **Recommended fix:** Change import to `import type { SlotOption } from "../../../restapis/bookingLink";`

### 12.2 Hardcoded Stripe Test Key
**FAIL** (security)

- **File:** `PaymentCapture.tsx` line 36
- **Issue:** Hardcoded Stripe publishable test key: `pk_test_51Qy...`. While publishable keys are not secret, hardcoding test keys in source means production builds could accidentally use the test key if the env variable is not set.
- **Recommended fix:** Remove the fallback. Fail explicitly if `NEXT_PUBLIC_STRIPE_PUBLISH_KEY` is not set.

### 12.3 Mixpanel Events Not Wired
**FAIL**

- **Finding:** `bookings.ts` defines generic booking events (Booking_Process_Started, etc.) but none of the checkout step components import or fire any Mixpanel events. The plan specifies checkout-specific events (`checkout_started`, `checkout_service_selected`, etc.) which do not exist in the file.
- **Recommended fix:** Add the plan-specified checkout events and wire them into each step component.

### 12.4 Missing `CheckoutWizard.tsx` Orchestrator
**MISSING** (blocks entire feature)

- **Impact:** Without the wizard, there is no step navigation, no shared hold timer, no auth redirect rehydration, no step-level error boundary. Individual steps dispatch `nextStep()` but nothing renders them conditionally based on `checkout.step`.

---

## Summary Checklist

| # | Area | Check | Verdict |
|---|---|---|---|
| 1.1 | Mobile | Wizard layout tested at 375 px viewport | **FAIL** -- no explicit touch targets |
| 1.2 | Mobile | Stripe Elements functional in WKWebView / Chrome Custom Tabs | **FAIL** -- no fallback; PayPal missing |
| 1.3 | Mobile | Auth form inputs mobile-optimised | **FAIL** -- all fields are generic text |
| 2.1 | Auto-skip | Single-service skip has no flash of service UI | **FAIL** -- flash of single-service card |
| 2.2 | Auto-skip | `rateId` written to Redux before session create | **PASS** |
| 3.1 | Timezone | Timezone label shown before slot selection | **PASS** |
| 3.2 | Timezone | Override dropdown uses IANA values; slots re-render on change | **FAIL** -- hardcoded incomplete list; TZ not sent to backend |
| 3.3 | Timezone | `client_timezone` included in sessionStorage rehydration payload | **FAIL** -- not included |
| 4.1 | Hold timer | Countdown visible on all post-scheduling steps, shows mm:ss | **FAIL** -- only on Step 3 |
| 4.2 | Hold timer | Expiry during payment handled without silent charge risk | **FAIL** -- expiry undetected during payment; backend has no hold_until check |
| 4.3 | Hold timer | Hold expiry checked on sessionStorage rehydration | **FAIL** -- no rehydration logic |
| 5.1 | Discount | `fee_percent` parsed as float before numeric comparison | **PASS** |
| 5.2 | Discount | All four required discount elements rendered when applicable | **FAIL** -- missing original price + attribution |
| 5.3 | Discount | No discount UI artifacts rendered for returning clients | **PASS** |
| 6.1 | No availability | `NoAvailabilityState` includes trust card, next-available, email capture, CTA | **FAIL** -- bare minimum only |
| 6.2 | No availability | Calendar communicates first available date clearly | **MISSING** |
| 7.1 | Invalid link | `InvalidLinkState` differentiates deactivated vs unknown; includes CTA | **FAIL** -- no differentiation |
| 7.2 | Invalid link | `SlugRedirect` resolved slugs issue HTTP 301 | **MISSING** -- page not implemented |
| 8.1 | Confirmation | All 6 confirmation elements present and functional | **FAIL** -- ICS 404, join link dead, manage link dead |
| 8.2 | Confirmation | Confirmation survives page refresh via URL-backed session | **FAIL** -- lost on refresh |
| 9.1 | Returning client | `include_cancelled=False` logic confirmed intentional | **NEEDS CLARIFICATION** |
| 9.2 | Returning client | Fee preview labelled as estimate, not guarantee | **MISSING** |
| 10.1 | Payment failure | Retry UI preserves held slot and shows remaining hold time | **FAIL** -- slot preserved but no timer shown |
| 10.2 | Payment failure | 409 returns user to scheduling with new session | **FAIL** -- toast only, no navigation |
| 10.3 | Payment failure | Double-submit blocked by session status guard | **FAIL** -- PaymentMethod/PaymentIntent field mismatch |
| 11.1 | Commercial risk | `CareProvider.is_active` guard confirmed non-bypassable | **MISSING** -- page not implemented |
| 11.2 | Commercial risk | Mid-checkout provider deactivation detected before payment | **MISSING** |
| 11.3 | Commercial risk | Fee preview and completion fee are consistent | **MISSING** -- frontend cannot verify |

---

## Verdict Summary

**PASS: 5 | FAIL: 18 | MISSING: 8 | NEEDS CLARIFICATION: 1**

### Most Critical Finding

**The hold timer only runs on Step 3 (SchedulePicker) and is destroyed when the user advances.** Steps 4 and 5 have zero hold expiry awareness. Combined with the backend not validating `hold_until` in `CheckoutCompleteView`, this creates a scenario where a client can complete payment on an expired hold, potentially double-booking a slot that was released and booked by another client. This is a **data integrity and financial risk** -- two clients could be charged for the same appointment slot.

### Blocking Issues (must fix before merge)

1. `src/pages/book/[slug].tsx` and `CheckoutWizard.tsx` do not exist -- feature is unmountable
2. `SchedulePicker.tsx` has a type import error that will fail TypeScript compilation
3. Hold timer does not persist across steps -- silent charge risk on expired holds
4. 409 from `checkout/complete/` shows toast but does not navigate back to slot selection
5. Hardcoded Stripe test key in source code
6. `stripe_payment_intent_id` receives a PaymentMethod ID -- likely backend failure
