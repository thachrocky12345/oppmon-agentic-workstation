# Audit Prompt: RGDEV-209 Contained Checkout Flow — UX, Scenario & Commercial Review

**Ticket:** RGDEV-209 | **Epic:** RGDEV-203 — Booking Link v3 Full Lifecycle Contained Checkout
**Prompt type:** UX / scenario / commercial audit
**Target implementation:** `src/pages/book/[slug].tsx` + `src/containers/checkout/` (6 wizard steps)
**Backend reference:** `apps/booking_link/views.py` — `CheckoutCompleteView`, `CheckoutFeePreviewView`, `CheckoutSlotHoldView`, `CheckoutSessionStatusView`
**Plan reference:** `ContextFiles2/Library/Plans/Plan_RGDEV-209_CheckoutFlow_2026-03-15.md`

---

## Instructions for the auditor

Read the implementation plan and the backend views/models listed above before answering each question. For every question, provide:

1. **Finding** — what the implementation does (or is specified to do).
2. **Gap / Risk** — any missing behaviour, ambiguity, or incorrect assumption.
3. **Recommended fix** — concrete, minimal change to close the gap.

Answer all questions. Do not skip any.

---

## Section 1 — Mobile Experience

### 1.1 Mobile viewport layout
The wizard renders at `/book/[slug]`. Are there explicit breakpoint constraints in `CheckoutWizard.tsx` or the step components that ensure the wizard is usable on a 375 px wide viewport (iPhone SE baseline)?

- Does the provider trust card (Step 1) collapse the bio to a readable truncation on small screens, or does it overflow?
- Does the slot picker calendar grid (Step 3) reflow to a vertically scrollable week view on mobile rather than a horizontal 7-column grid that would require horizontal scrolling?
- Are all primary CTA buttons at least 44 × 44 px touch targets per Apple HIG / WCAG 2.5.5?

### 1.2 Stripe Elements in constrained WebView environments
The plan notes "Mobile in-app browser (WKWebView/Chrome Custom Tabs) — payment widgets must work" as an explicit edge case.

- Does `PaymentCapture.tsx` use `@stripe/react-stripe-js` with the standard `<Elements>` provider, or does it construct a custom Stripe.js integration? The standard integration has known WKWebView quirks with 3DS redirect flows.
- Is there a fallback path if `window.Stripe` fails to load in a restricted WebView (Content-Security-Policy blocks cdn.stripe.com)?
- For PayPal: `@react-paypal-js` renders a popup for OAuth consent. Popups are blocked in WKWebView by default. Is there a `data-disable-funding` or redirect-based PayPal flow specified?

### 1.3 Input field UX on mobile
Step 4 (AuthOnboarding) presents a compact inline form for missing mandatory fields including `phone_number`, `date_of_birth`, `street_address`, and vulnerability questions.

- Are date inputs rendered as `<input type="date">` (native picker, mobile-friendly) or as a custom date-picker component that may be unusable on mobile?
- Is `autocomplete` set correctly on address fields so iOS autofill works?
- Are vulnerability question inputs (radio/checkbox) touch-sized?

---

## Section 2 — Single-Service Auto-Skip

### 2.1 Auto-skip rendering guarantee
The plan specifies: "1 service → auto-skip to step 3." `CheckoutServicesView` returns a flat list of `Rate` objects filtered by `is_active=True`.

- In `ServiceSelection.tsx`, does the auto-skip happen in a `useEffect` after the services response arrives, meaning there is a render cycle where `currentStep === 2` before the skip fires? If so, the user sees a brief flash of the service selection UI.
- Is the skip performed by setting `currentStep` to 3 in the same render pass as the data load (i.e., the step is never mounted when count === 1), or does it mount then immediately redirect?
- If `CheckoutServicesView` returns an empty array (provider has no active rates), what does `ServiceSelection.tsx` render? The plan's error state table does not list this case — it only covers empty slots. Verify there is a defined fallback.

### 2.2 Rate pre-selection persistence
When auto-skipping, the single `rate_id` must be written into Redux `checkoutSlice.rateId` before step 3 loads, because `SchedulePicker.tsx` will use it.

- Is there a risk that `rateId` is `null` in Redux when `SchedulePicker.tsx` calls `POST /checkout/session/create/`? The `CheckoutSessionCreateSerializer` — confirm whether `rate_id` is a required field on that endpoint or optional. If required and missing, the session create will fail silently.

---

## Section 3 — Timezone Display

### 3.1 When is the timezone shown?
The plan specifies: "Auto-detect timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`." The slot list (`CheckoutSlotsView`) returns `start_time`/`end_time` as UTC ISO strings.

- In `SchedulePicker.tsx`, is the auto-detected timezone label displayed to the user *before* they tap on a slot, so they understand what timezone the slot times are displayed in? Or is it only shown in the confirmation step (Step 6)?
- If the timezone is shown post-selection, the user may book a slot they misread due to timezone confusion. Verify the display order.

### 3.2 Timezone override flow
The plan states "user override available."

- Is the override UI a dropdown (IANA timezone selector) or a free-text field? A free-text field could produce unrecognized timezone strings that break server-side `hold_until` calculations.
- When the user changes timezone mid-flow after slots are already rendered, do all displayed slot times re-render in the new timezone, or only new slots fetched after the change?
- Is the selected timezone written into `CheckoutSessionCreateSerializer`'s `client_timezone` field before or after the session create call? If after, the session record has the wrong timezone.

### 3.3 Timezone persistence through auth redirect
Step 4 may redirect the user through an auth flow. The plan specifies `sessionStorage` rehydration for booking context.

- Is `client_timezone` included in the `sessionStorage` context payload, or only `slug`, `rateId`, `slotId`, `sessionId`? If excluded, the rehydrated session will have `client_timezone = ''` (the `BookingLinkCheckoutSession` field default).

---

## Section 4 — Hold Timer UX

### 4.1 Countdown visibility
The backend sets `hold_until = now + 15 minutes` in `CheckoutSlotHoldView`. The frontend stores `holdUntil` in Redux `checkoutSlice`.

- Is the countdown timer rendered as a persistent visible element (e.g., top banner or sticky footer) visible on *all* subsequent steps (Step 4 auth, Step 5 payment), or only on Step 3 (scheduling)?
- Does it display minutes and seconds (e.g., "14:32 remaining"), or only minutes? A minutes-only display gives no urgency signal in the final minute.
- Is the timer computed from the Redux-stored `holdUntil` ISO string using `Date.now()` on each tick, or from a local countdown that started at hold time? The latter will drift if the device clock changes.

### 4.2 Expiry during active payment
The frontend auto-releases the slot via `POST /checkout/slot/release/` when the countdown reaches 0. However, the user may be mid-payment (Stripe Elements open) when expiry occurs.

- If the countdown reaches 0 while the user is on Step 5 (payment form open, card details entered), does the UI: (a) immediately interrupt and show `SessionExpiredState`, (b) allow the payment to complete then handle the server-side 409 on `checkout/complete/`, or (c) call `slot/release/` but not interrupt the UI?
- Option (a) destroys in-progress payment without warning. Option (b) risks charging the user and then failing the booking. Which behaviour is specified, and is it the right one?
- Does `CheckoutCompleteView` check `hold_until < now` before creating the appointment? Looking at the view: it checks `status__in=['SLOT_HELD', 'PAYMENT_PENDING']` but does NOT explicitly re-validate `hold_until`. If the frontend did not call `slot/release/` (e.g., network failure), the server will accept a payment on an expired hold. Confirm whether this is intentional or a gap.

### 4.3 Hold timer across auth step
Step 4 (auth/onboarding) can involve an external auth redirect. The hold timer continues running while the user is away from the page.

- If the user takes 10+ minutes on the auth step (slow onboarding form, email verification loop), the hold expires before they reach payment. What does the user see on return — `SessionExpiredState` or a normal payment step that then fails at `checkout/complete/`?
- Is the `hold_until` timestamp checked on page rehydration from `sessionStorage`, so the frontend can immediately redirect to `SessionExpiredState` rather than letting the user proceed to payment?

---

## Section 5 — Discount Display Completeness

### 5.1 Discount UI trigger logic
The plan states: "Discount display: `fee_applies: true` AND fee < 0.15 → show original price, discount line item, final price."

- `CheckoutFeePreviewView` returns `fee_percent` as a string (e.g., `"0.10"`) when `fee_applies: true`. The condition `fee < 0.15` requires a numeric comparison — does `PaymentCapture.tsx` parse this correctly (parseFloat) before comparing, or does it do a string comparison that could evaluate `"0.10" < "0.15"` incorrectly in edge cases?
- What is the "original price" for the discount display? The rate's `price` field from `ServiceOptionSerializer` — but that is the provider's charge to the client. The booking link fee is a platform fee charged to the *provider*, not the client. Confirm: is the discount UI showing a client-facing price reduction, or is it displaying the platform fee structure? If the latter, it may be confusing or commercially inappropriate to show.

### 5.2 Required discount display elements
The plan requires: original price, discount line item with % and $, final price, AND attribution message.

- Does the discount block render all four elements, or only a subset? Specifically:
  - Is the attribution message (e.g., "Referred by [Provider Name] via their Booking Link") shown to the client, or is it omitted?
  - Is the `fee_percent` formatted as both a percentage (e.g., "10%") and an absolute dollar amount (e.g., "-$X.XX") simultaneously, or only one format?
  - If `fee_percent` is `null` (returned when `fee_applies: false`), does the discount block disappear cleanly or does it render with `NaN` or `null` values?

### 5.3 Discount display for `fee_applies: false` (returning client)
When `has_prior_booking` is true, `CheckoutFeePreviewView` returns `fee_percent: null, fee_applies: false`.

- Does `PaymentCapture.tsx` hide the discount block entirely for returning clients and show only the clean service price?
- Is there any residual discount-related UI (strikethrough price, "discount applied" badge) that could render with empty/null data for returning clients?

---

## Section 6 — No Availability State

### 6.1 Empty slots response handling
`CheckoutSlotsView` returns an empty array when no slots match `appointment_id__isnull=True` and `start_date_time__gte=now`. The plan maps this to `NoAvailabilityState.tsx`.

- Does `NoAvailabilityState.tsx` render:
  - The provider trust card (name, photo, title) — to preserve provider brand context?
  - A "next available date" — but `CheckoutSlotsView` does not return this. Where does the frontend get it? Is there a separate API call, or is this data fabricated/omitted?
  - An email capture form — is this wired to an actual backend endpoint (waitlist or lead capture), or is it a placeholder with no persistence?
  - A link to explore other providers (e.g., `/help-with`) — is this present?
- If none of these elements are implemented, the empty slots state is a conversion dead-end.

### 6.2 Partial availability (slots exist but not within user's preferred window)
The slots endpoint returns up to 50 upcoming slots with no filtering by date range or session type preference.

- If all 50 slots are 6+ weeks away, does the calendar picker communicate this clearly, or does it show empty weeks before reaching the first available date?
- Is there a "first available" jump-to action to prevent user frustration scrolling through empty weeks?

---

## Section 7 — Invalid Link UX

### 7.1 `InvalidLinkState` content requirements
The plan: "`is_active: false` → render `InvalidLinkState` inline (no redirect)." `_build_og_meta` in `views.py` returns `'og_title': 'Provider not found'` and `is_active: False` for both deactivated providers and non-existent slugs.

- Does `InvalidLinkState.tsx` differentiate between:
  - A valid provider who deactivated their link (provider exists, `BookingLink.is_active = False`) — the provider may still be reachable via the main marketplace.
  - A completely unknown slug (no `BookingLink` record, no `SlugRedirect`) — genuinely dead link.
  These are different user scenarios requiring different messaging.
- Does `InvalidLinkState.tsx` include a CTA linking to `/help-with` or the provider's main marketplace profile (if resolvable), or does it dead-end on a generic error message?
- Is there a "search for another provider" search bar embedded in the state, or just a text link?
- Is the page title/H1 something meaningful like "This booking link is no longer active" rather than just "404" or "Provider not found"?

### 7.2 `SlugRedirect` transparent resolution
`_resolve_slug` handles old slugs via `SlugRedirect`. When a redirect is resolved, `ResolveBookingLinkSerializer` returns `redirect_to: <new_slug>`.

- Does `getServerSideProps` in `book/[slug].tsx` use the `redirect_to` field to issue an HTTP 301 redirect to `/book/<new_slug>`, preserving SEO and avoiding showing the user a stale URL? Or does it silently serve the new slug's content under the old URL (no redirect)?
- If it does not redirect, the user's address bar shows the old slug. If they share that URL, it may stop working if the `SlugRedirect` record is ever cleaned up.

---

## Section 8 — Confirmation Step Completeness

### 8.1 Required confirmation elements
The plan (Step 6 `BookingConfirmation.tsx`) specifies:

- Session details in client timezone
- "Join your session" deep link
- ICS download (`src/pages/api/ics.ts`)
- "Add to Google Calendar" link
- "Explore more providers" → `/help-with`
- "Manage booking" link → RGDEV-211 page

Verify each element:

- **Session details in client timezone**: `BookingLinkCheckoutSession.client_timezone` is stored at session create. Does the confirmation step read `client_timezone` from the session response (via `CheckoutCompleteView` response or a subsequent `GET /checkout/session/<pk>/status/`) and format `start_date_time` and `end_date_time` in that timezone? Or does it display in UTC?
- **Join session deep link**: Where does the Twilio video room URL come from? `CheckoutCompleteView` creates an `Appointment` but does not create a Twilio room. Is the join link a placeholder until the provider creates the room, or is room creation triggered at booking completion?
- **ICS download**: Is `src/pages/api/ics.ts` implemented as part of RGDEV-209 scope, or is it a dependency on a future ticket? If not implemented, the "Add to Calendar" button silently 404s.
- **Google Calendar link**: The standard Google Calendar add URL takes `text`, `dates`, `details`, `location` query params. Are these populated correctly from appointment data?
- **Manage booking link**: RGDEV-211 is listed as a coordinating ticket, not a dependency. If RGDEV-211 is not yet shipped when RGDEV-209 goes live, the "Manage booking" link is a dead link. Is there a feature flag or conditional render guarding it?

### 8.2 Confirmation reachability after page refresh
If the user refreshes the confirmation page, the Redux `checkoutSlice` is cleared.

- Is the confirmation step backed by a URL with the `session_id` (e.g., `/book/[slug]/confirmation?session=<uuid>`), enabling rehydration from `GET /checkout/session/<uuid>/status/`?
- Or is it a transient in-memory state that is lost on refresh, leaving the user with a blank page after completing payment?

---

## Section 9 — Returning Client Flow

### 9.1 Fee preview for returning client
`CheckoutFeePreviewView` returns `fee_applies: false, fee_percent: null, is_returning_client: true` when `_has_prior_booking` returns true. The check uses `has_prior_booking(provider, client, include_cancelled=False)`.

- The `include_cancelled=False` parameter means cancelled appointments do not count as a prior relationship. Is this correct business logic? A client who booked and immediately cancelled without attending is still treated as a "new" referral eligible for the booking link fee. Confirm this is intentional.
- `fee_applies: false` means no platform fee is charged. Is this communicated to the client in the payment step ("No referral fee applies — you are an existing client of this provider"), or is the payment step identical to a new-client flow but just showing the raw service price?
- Are there any returning-client-specific UI artifacts (e.g., a "Welcome back" message, shortened onboarding since their profile is complete) in the wizard?

### 9.2 Returning client fee accuracy window
`_has_prior_booking` checks the database at fee-preview time and again at `checkout/complete/` time. There is a race window: if another booking completes between fee-preview and complete, the fee tier could change.

- Is this race condition acceptable (it would result in a fee being applied or waived inconsistently)? The `has_prior` check at `checkout/complete/` is the authoritative one — is the fee-preview shown to the user treated as an estimate with an explicit caveat, or as a guarantee?

---

## Section 10 — Payment Failure Recovery

### 10.1 Slot retention on payment failure
`CheckoutCompleteView` uses `status__in=['SLOT_HELD', 'PAYMENT_PENDING']`. If payment fails (Stripe returns an error before `checkout/complete/` is called), the session remains in `SLOT_HELD` status and the slot is still held — until `hold_until` expires or the user explicitly calls `slot/release/`.

- Does `PaymentCapture.tsx` display a retry UI (re-render the Stripe Elements form with an error message) when Stripe's `confirmPayment` returns an error, or does it navigate away?
- Is the hold timer still visible and running during the retry state, so the user knows they have a limited window to retry?
- Does the retry attempt re-use the same `session_id` and held `slot_id`, or does it create a new session? Creating a new session would abandon the held slot (leaving it held until expiry, blocking other clients).

### 10.2 Server-side failure path (409 at `checkout/complete/`)
If `checkout/complete/` returns `HTTP 409` (slot stolen between hold and complete), the view sets `session.status = 'FAILED'`.

- Does the frontend handle `409` from `checkout/complete/` by returning the user to Step 3 (scheduling) to pick a new slot, as specified in the error state table?
- When returning to Step 3, is the `session_id` invalidated and a new session created (since the old session is now `FAILED`), or does the frontend try to reuse the failed session?
- Is the user shown a clear message explaining what happened ("Someone else just booked that slot — please choose another time") rather than a generic error?

### 10.3 Double-submit / idempotency
`CheckoutCompleteView`'s docstring notes: "Server-side Stripe PaymentIntent.create should use `idempotency_key=f'pi_{appointment_id}_{user.id}'` to prevent duplicate charges on retries." However, `CheckoutCompleteView` does not call `stripe.PaymentIntent.create` — it receives a `stripe_payment_intent_id` from the frontend (post-payment confirmation flow).

- Who creates the Stripe `PaymentIntent` — the frontend (via `stripe.confirmPayment`) or the backend? If the frontend creates it, the idempotency key described in the comment is never set by this view.
- Is there a `POST /checkout/payment-intent/` endpoint (not visible in the plan or views file) that the frontend calls before showing Stripe Elements? If so, where is it?
- If the user submits the payment form twice (double-tap), can two `checkout/complete/` calls succeed for the same `session_id`? `CheckoutCompleteView` queries `status__in=['SLOT_HELD', 'PAYMENT_PENDING']` — after the first call completes and sets status to `COMPLETED`, the second call would return 400 "Session not found or not in valid state." Confirm this is the correct safeguard.

---

## Section 11 — Commercial Risk: Booking via Inactive Provider

### 11.1 `is_active` check path analysis
`BookingLink.is_active` is the field on the `BookingLink` model (not `CareProvider.is_active` or `User.is_active`). There are multiple active/inactive states that could allow a booking through despite a provider being deactivated:

Trace the following scenario:
1. Provider's `BookingLink.is_active = True`
2. Provider's `CareProvider.is_active = False` (deactivated by admin)
3. Client visits `/book/[slug]`

- `BookingLinkResolveView` calls `_resolve_slug` then `_build_og_meta`. In `_build_og_meta`, there is an explicit check: `if not getattr(cp, 'is_active', True) or not getattr(user, 'is_active', True)` → returns `is_active: False`. So `getServerSideProps` should receive `is_active: False` and render `InvalidLinkState`. **Verify this check is evaluated correctly** — `getattr(cp, 'is_active', True)` defaults to `True` if the attribute does not exist. Does `CareProvider` have an `is_active` field? If not, `getattr(cp, 'is_active', True)` always returns `True` and the guard is silently bypassed.
- Even if `BookingLinkResolveView` blocks the entry, `CheckoutProviderProfileView`, `CheckoutServicesView`, and `CheckoutSlotsView` each only check `bl.is_active` — not `cp.is_active` or `cp.user.is_active`. If a client somehow reaches these endpoints with a cached valid slug (e.g., SSR served `is_active: True` before provider was deactivated), can they proceed through the full checkout?
- `CheckoutSessionCreateView` checks `BookingLink.objects.get(id=..., is_active=True)` — this is the last hard gate before slot hold. Does it also check provider/user active status?
- `CheckoutCompleteView` does not check `bl.is_active`, `cp.is_active`, or `cp.user.is_active` at all — it only validates session status and onboarding completeness. If the checkout session was created while the provider was active and then the provider was deactivated before the client reaches payment, `CheckoutCompleteView` will still create the appointment and attribution. Is this gap acceptable?

### 11.2 `BookingLink.is_active = false` vs provider deactivation
The plan states: "Provider deactivates link mid-checkout → `InvalidLinkState`." This only describes the entry-point behaviour.

- Is there a mechanism for the checkout wizard to detect mid-checkout deactivation (e.g., periodic polling of `GET /checkout/session/<pk>/status/`, which re-reads `bl.is_active`)? Or does the client see `InvalidLinkState` only on their next page load?
- If the 15-minute hold is active and the provider deactivates their link mid-hold, does the client still reach payment and complete booking?

### 11.3 Attribution fee tier validation
`BookingAttribution.fee_tier` stores the `fee_percent` decimal. `get_booking_link_fee_percent` in `utils.py` determines the fee.

- Is `get_booking_link_fee_percent` called with the actual `Appointment` object (which has session type, modality, provider details) to apply modality-based fee logic? In `CheckoutFeePreviewView`, it is called with `None` — `get_booking_link_fee_percent(None)` — with a comment "default telehealth." This means the fee preview may differ from the fee stored at completion if the session type affects the fee tier.
- At `checkout/complete/` time, `get_booking_link_fee_percent(appointment)` is called with the real appointment. If this returns a different value than the preview, the client was shown an incorrect fee. Is there a disclosure / re-confirmation flow if the fee differs?

---

## Summary Checklist

After completing the audit, confirm each item as PASS / FAIL / NOT IMPLEMENTED / NEEDS CLARIFICATION:

| # | Area | Check |
|---|---|---|
| 1.1 | Mobile | Wizard layout tested at 375 px viewport |
| 1.2 | Mobile | Stripe Elements functional in WKWebView / Chrome Custom Tabs |
| 1.3 | Mobile | Auth form inputs mobile-optimised with native pickers and autocomplete |
| 2.1 | Auto-skip | Single-service skip has no flash of service UI |
| 2.2 | Auto-skip | `rateId` written to Redux before session create |
| 3.1 | Timezone | Timezone label shown before slot selection |
| 3.2 | Timezone | Override dropdown uses IANA values; slots re-render on change |
| 3.3 | Timezone | `client_timezone` included in sessionStorage rehydration payload |
| 4.1 | Hold timer | Countdown visible on all post-scheduling steps, shows mm:ss |
| 4.2 | Hold timer | Expiry during payment handled without silent charge risk |
| 4.3 | Hold timer | Hold expiry checked on sessionStorage rehydration |
| 5.1 | Discount | `fee_percent` parsed as float before numeric comparison |
| 5.2 | Discount | All four required discount elements rendered when applicable |
| 5.3 | Discount | No discount UI artifacts rendered for returning clients |
| 6.1 | No availability | `NoAvailabilityState` includes trust card, next-available date, email capture, CTA |
| 6.2 | No availability | Calendar communicates first available date clearly |
| 7.1 | Invalid link | `InvalidLinkState` differentiates deactivated vs unknown; includes CTA |
| 7.2 | Invalid link | `SlugRedirect` resolved slugs issue HTTP 301 |
| 8.1 | Confirmation | All 6 confirmation elements present and functional |
| 8.2 | Confirmation | Confirmation survives page refresh via URL-backed session |
| 9.1 | Returning client | `include_cancelled=False` logic confirmed intentional |
| 9.2 | Returning client | Fee preview labelled as estimate, not guarantee |
| 10.1 | Payment failure | Retry UI preserves held slot and shows remaining hold time |
| 10.2 | Payment failure | 409 returns user to scheduling with new session |
| 10.3 | Payment failure | Double-submit blocked by session status guard |
| 11.1 | Commercial risk | `CareProvider.is_active` guard confirmed non-bypassable |
| 11.2 | Commercial risk | Mid-checkout provider deactivation detected before payment |
| 11.3 | Commercial risk | Fee preview and completion fee are consistent for same session type |
