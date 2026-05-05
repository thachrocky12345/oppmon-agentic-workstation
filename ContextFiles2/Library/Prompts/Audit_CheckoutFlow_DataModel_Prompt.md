# Audit Prompt: RGDEV-209 Contained Checkout Flow — Data Model & Technical Audit

**Ticket:** RGDEV-209 | **Epic:** RGDEV-203
**Audit class:** Data model integrity, Redux state, API contract, payment ordering, race conditions, TypeScript safety
**Generated:** 2026-03-15

---

## Context

This audit covers the frontend checkout wizard at `src/pages/book/[slug].tsx` and all supporting files for RGDEV-209. The backend APIs are already implemented in `apps/booking_link/` (RGDEV-204/205). Every finding below must be verified against the actual file content — do not infer from the plan document alone.

### Key backend facts (already verified)

- `BookingLinkCheckoutSession` status lifecycle: `PENDING → SLOT_HELD → PAYMENT_PENDING → COMPLETED` (failure: `EXPIRED`, `FAILED`)
- `CheckoutSessionCreateSerializer` accepts: `booking_link_id` (UUID), `rate_id` (optional UUID), `client_timezone`, `client_locale`, `client_language`
- `CheckoutSessionResponseSerializer` returns: `id`, `status`, `hold_until`, `client_timezone`, `client_locale`, `client_language`, `payment_type`, `fee_percent`, `created_at`, `modified_at` — **does NOT return `slot_id` or `rate_id`**
- `SlotHoldResponseSerializer` returns: `session_id` (UUID), `slot_id` (IntegerField — not UUID), `hold_until`, `status`
- `CheckoutFeePreviewView` returns: `fee_percent` (string or null), `fee_applies` (bool), `is_returning_client` (bool). When `has_prior=True`, `fee_percent` is `None` and `fee_applies` is `False`. When `has_prior=False`, `fee_percent` is the result of `get_booking_link_fee_percent(None)` cast to string — a default telehealth rate, not the session-specific rate.
- `CheckoutCompleteView` accepts: `session_id`, `payment_type` (choice: stripe/paypal/free), `stripe_payment_intent_id`, `paypal_order_id`, `notes`. It does NOT accept a Stripe client secret or payment method ID — it records a completed payment, it does not initiate one.
- `CheckoutSlotReleaseView` requires status `SLOT_HELD` — if session has already expired server-side (status `EXPIRED`), this endpoint returns 400.
- `slot_id` in `AvailableSlotSerializer` is an `IntegerField`. Redux `CheckoutState` declares `slotId: number | null`. Confirm no UUID/int type mismatch in `SlotHoldSerializer` input.
- `rate` FK on `BookingLinkCheckoutSession` is `null/blank` — `CheckoutSessionCreateSerializer` accepts `rate_id` but `CheckoutSessionCreateView` never sets `session.rate`. The rate is silently dropped.
- `CheckoutSessionStatusView` performs lazy expiry: if polled and `status == SLOT_HELD` and `hold_until < now`, it transitions to `EXPIRED`. The slot itself is NOT released (no `session.slot = None`). The slot's `appointment_id` remains null, making it available again — but only if re-queried. There is no background worker expiring sessions proactively.

---

## Files to Read Before Answering

Read every file listed. Do not skip any.

```
src/pages/book/[slug].tsx
src/containers/checkout/CheckoutWizard.tsx
src/containers/checkout/steps/ProviderTrustCard.tsx
src/containers/checkout/steps/ServiceSelection.tsx
src/containers/checkout/steps/SchedulePicker.tsx
src/containers/checkout/steps/AuthOnboarding.tsx
src/containers/checkout/steps/PaymentCapture.tsx
src/containers/checkout/steps/BookingConfirmation.tsx
src/store/slices/checkoutSlice.ts
src/restapis/bookingLink.ts
src/mixPanelEvents/bookings.ts
```

If any file does not exist yet, note it as NOT IMPLEMENTED and skip the checks that require it. Do not fabricate findings.

---

## Audit Questions

Answer each question with: **finding**, **file + line**, **verdict** (PASS / FAIL / NOT IMPLEMENTED / WARN), and a **recommendation** if not PASS.

---

### 1. Redux State — `checkoutSlice.ts`

**1.1 Shape completeness**
Does the Redux state include all fields required by the checkout wizard: `slug`, `sessionId`, `holdUntil`, `rateId`, `slotId`, `paymentType`, `step`, `feePercent`, `feeApplies`?

Verify each field against the plan's declared `CheckoutState` interface:
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

**1.2 `holdUntil` type**
Is `holdUntil` stored as an ISO string (safe for `sessionStorage` serialization) or as a `Date` object (which does not survive JSON serialization)?

**1.3 `slotId` type**
`AvailableSlotSerializer.slot_id` is an `IntegerField`. `SlotHoldSerializer.slot_id` is also an `IntegerField`. Is `slotId` typed as `number` in Redux and correctly passed as a number (not a stringified UUID) to `holdSlot()`?

**1.4 `sessionId` type**
`BookingLinkCheckoutSession.id` is a UUID. `CheckoutSessionResponseSerializer.id` is returned as a UUID string. Is `sessionId` in Redux typed as `string | null` and stored without coercion?

**1.5 Actions present**
Are reducers or thunks present for all required transitions: set slug, set sessionId, set slotId + holdUntil (after hold), set feePercent + feeApplies (after fee preview), set paymentType, advance/reset step, clear session (for expiry)?

---

### 2. sessionStorage Persistence — Auth Redirect Survival

**2.1 Pre-redirect write**
In `src/pages/book/[slug].tsx` (or `AuthOnboarding.tsx`), before redirecting an unauthenticated user to login, is booking context written to `sessionStorage`? Specifically: `slug`, `sessionId`, `rateId`, `slotId`. Provide exact key names used.

**2.2 Post-redirect rehydration**
On return to `/book/[slug]`, is `sessionStorage` read and dispatched into Redux? Is this done in `getServerSideProps`, in a `useEffect` on mount, or in the Redux slice's `extraReducers`? Confirm the rehydration fires before any API calls that depend on `sessionId`.

**2.3 sessionStorage vs Redux**
Redux store resets on page reload. Confirm that `sessionId` and `slotId` are read from `sessionStorage` on mount — not from Redux initial state — when returning after an auth redirect. If Redux is the only store (no sessionStorage backup), this is a FAIL.

**2.4 Cleanup**
After `BookingConfirmation` renders (step 6), is `sessionStorage` cleared to prevent stale context on future visits to the same slug?

---

### 3. Slot Hold Countdown Timer

**3.1 Timer source of truth**
In `SchedulePicker.tsx` (or `CheckoutWizard.tsx`), is the countdown timer initialized from the `hold_until` value returned by `POST /slot/hold/` — not from a locally computed `Date.now() + 15 * 60 * 1000`? Using the server-returned value is required to survive tab backgrounding, clock skew, and network latency.

**3.2 Auto-release on expiry**
When the countdown reaches zero, does the code call `POST /api/v1/booking-link/checkout/slot/release/`? Is the `session_id` correctly passed?

**3.3 Race condition: server expires before timer fires**
`CheckoutSlotReleaseView` requires `status == 'SLOT_HELD'`. If `CheckoutSessionStatusView` was polled and transitioned the session to `EXPIRED` before the frontend timer fires, the release call returns 400. Is this 400 handled gracefully (treated as success, not shown as an error to the user)?

**3.4 Timer cleanup**
Is the countdown interval or timeout correctly cleared in a `useEffect` cleanup function to prevent state updates on unmounted components?

**3.5 `SessionExpiredState` rendering**
Does the wizard render `SessionExpiredState` on expiry rather than silently failing or leaving the user on step 3?

---

### 4. Payment Capture Ordering

**4.1 Stripe `paymentIntent.succeeded` gate**
In `PaymentCapture.tsx`, is `completeCheckout()` (which calls `POST /checkout/complete/`) called inside a Stripe `onPaymentSuccess` / `paymentIntent.succeeded` callback — never before? Show the exact callback structure.

**4.2 No pre-auth call**
Is there any code path that calls `POST /checkout/complete/` before Stripe confirms payment (e.g., on button click, before waiting for `stripe.confirmPayment()` resolution)?

**4.3 Idempotency on retry**
If `POST /checkout/complete/` fails with a network error after Stripe already succeeded, is the user given a retry path? The backend `CheckoutCompleteView` accepts re-submission if `status in ['SLOT_HELD', 'PAYMENT_PENDING']`. Does the frontend preserve `sessionId` for a retry, or does it clear it on the first failure?

**4.4 `payment_type` passed correctly**
`CheckoutPaymentSerializer` requires `payment_type` as one of `['stripe', 'paypal', 'free']`. Is the correct string value passed — not an enum, not capitalized, not a payment method ID?

**4.5 `stripe_payment_intent_id` presence**
When `payment_type == 'stripe'`, is `stripe_payment_intent_id` populated with the intent's `id` string (format `pi_...`), not a client secret (format `pi_..._secret_...`)?

---

### 5. Track-Click Deduplication

**5.1 sessionStorage key**
In `ProviderTrustCard.tsx`, is `POST /track-click/<slug>/` guarded by a `sessionStorage` key check? What is the exact key name (e.g., `rg_track_click_<slug>`)? The plan references the same pattern as `cp-detail-preview.tsx:113-127` — does the implementation match that pattern?

**5.2 Single fire**
Is `trackClick()` called at most once per session per slug? Is the guard set before the API call (to prevent double-fire on React Strict Mode double-invoke) or after?

**5.3 Failure handling**
If the API call fails (network error, 404 for inactive link), does the code suppress the error gracefully — not surfacing it to the user as an unhandled rejection?

---

### 6. Fee Display Logic

**6.1 Discount block condition**
In `PaymentCapture.tsx`, is the discount block conditionally rendered with BOTH: `fee_applies === true` AND `parseFloat(feePercent) < 0.15`? Or is it rendered on `fee_applies === true` alone, which could show a 15% fee block without a "discount" framing?

**6.2 Zero-percent guard**
Can the discount block ever render when `feePercent === '0'` or `feePercent === '0.0000'`? Add a check: `parseFloat(feePercent) > 0` must also be true before showing the discount line item.

**6.3 `fee_percent` as string**
`CheckoutFeePreviewView` returns `fee_percent` as `str(get_booking_link_fee_percent(None))` — a string, not a float. Is it parsed with `parseFloat()` before arithmetic comparison in the component?

**6.4 `is_returning_client` usage**
The fee preview endpoint returns `is_returning_client`. Is this field used in the UI (e.g., showing "No fee — returning client") or silently ignored?

**6.5 Price line items**
When fee applies, the UI should show: original session price, discount amount, final price. Are all three computed correctly? Is the discount the fee amount subtracted from the provider's rate, or is it something else?

---

### 7. Auth Flow

**7.1 `returnUrl` parameter**
In `src/pages/book/[slug].tsx`, when redirecting an unauthenticated user to login, is the `returnUrl` set to `/book/<slug>`? Is the exact query param name consistent with what the login page reads?

**7.2 Context written before redirect**
Is booking context (minimally: `slug`, `bookingLinkId`) written to `sessionStorage` before the redirect? `sessionId` may not exist yet at this point if the user was unauthenticated from the start — confirm the code handles a null `sessionId` gracefully.

**7.3 Post-login step restoration**
After login returns to `/book/<slug>`, does the wizard restore to the step the user was on, or does it restart from step 1? If restarting from step 1 is intentional, confirm it is documented.

**7.4 Auth state before API calls**
`CheckoutSessionCreateView`, `CheckoutSlotHoldView`, and `CheckoutCompleteView` all require `IsAuthenticated`. Is the frontend JWT token confirmed present before calling these endpoints? Is there a guard that redirects to login if `axiosInstance` returns a 401 on these calls?

---

### 8. `getServerSideProps` — OG Meta + Validity

**8.1 Endpoint used**
Does `getServerSideProps` call `GET /api/v1/booking-link/resolve/<slug>/` or `GET /api/v1/booking-link/og-meta/<slug>/`? Both return the same `ResolveBookingLinkSerializer` shape. Note: `og-meta` returns a slightly richer `og_description` for the not-found case.

**8.2 `is_active: false` handling**
When the resolve response has `is_active: false`, does `getServerSideProps` pass a flag to the page that causes `InvalidLinkState` to render — WITHOUT issuing a redirect? A redirect would lose the OG meta context and break share previews.

**8.3 `redirect_to` handling**
If `resolve` returns a non-null `redirect_to` slug (old slug → new slug), does `getServerSideProps` issue a `redirect` with `permanent: true` to the new slug URL?

**8.4 OG tags rendered**
Are `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`, and `robots` meta tags rendered in the `<Head>` from the resolved data?

**8.5 SSR error handling**
If the resolve API call itself fails (network error, 500), does `getServerSideProps` return a safe fallback (e.g., `notFound: true` or a generic `InvalidLinkState` props) rather than throwing and rendering a 500 page?

---

### 9. API Error Handling

**9.1 `src/restapis/bookingLink.ts` — try/catch coverage**
Does every exported function have a `try/catch` block? Do catch blocks return a typed error object (e.g., `{ error: string }`) rather than re-throwing raw Axios errors?

**9.2 409 from `holdSlot()`**
`CheckoutSlotHoldView` returns 409 when the slot is taken. In `SchedulePicker.tsx`, does a 409 response navigate the user back to slot selection with a toast message — not silently swallow the error or navigate forward?

**9.3 400 from `releaseSlot()` when already EXPIRED**
As noted above: if the session was already transitioned to EXPIRED by the status-check endpoint, `releaseSlot()` returns 400. Is this 400 treated as a non-error (session already released)?

**9.4 `completeCheckout()` failure**
If `POST /checkout/complete/` returns a non-2xx (e.g., 409 slot stolen mid-payment, 400 onboarding incomplete), does the UI surface an actionable message? Does it NOT clear the payment state, so the user can retry without re-entering card details?

**9.5 Onboarding gate at complete**
`CheckoutCompleteView` independently checks `_get_missing_onboarding_fields` and returns 400 with `missing_fields`. If `AuthOnboarding.tsx` passed but this backend check fails (e.g., data mismatch), does the frontend handle the `missing_fields` array from the response and re-show the onboarding step?

---

### 10. TypeScript Safety

**10.1 API response types**
In `src/restapis/bookingLink.ts`, are all API response types explicitly defined as interfaces or types — not typed as `any` or left untyped? Specifically check:
- `resolveSlug()` → typed with `is_active`, `redirect_to`, `og_title`, etc.
- `createSession()` → typed with `id` (UUID string), `status`, `hold_until`
- `holdSlot()` → typed with `session_id`, `slot_id` (number), `hold_until`, `status`
- `feePreview()` → typed with `fee_percent` (string | null), `fee_applies` (bool), `is_returning_client` (bool)
- `completeCheckout()` → typed with `session_id`, `appointment_id` (number), `status`, `attribution_id` (UUID string | null)

**10.2 Redux action payload types**
Are Redux action creators typed with explicit payload types? Is `setSlotId` typed as `PayloadAction<number | null>` (not `PayloadAction<string | null>`)?

**10.3 Step component prop types**
Do all step components have explicit prop interfaces? Are any props typed as `any`?

**10.4 `hold_until` date coercion**
`hold_until` arrives from the API as an ISO datetime string. Is it passed directly to the countdown timer (which should parse it), or is it silently coerced somewhere in a way that introduces a type error?

---

### 11. `sessionId` Lifecycle After `createSession()`

**11.1 Redux dispatch before `holdSlot()`**
In `SchedulePicker.tsx`, the flow is: user selects slot → `createSession()` → `holdSlot()`. Is `sessionId` dispatched to Redux after `createSession()` resolves, BEFORE `holdSlot()` is called? If `holdSlot()` reads `sessionId` from Redux state (not from the `createSession()` response directly), there is a timing risk.

**11.2 `sessionId` source for `holdSlot()`**
Does `holdSlot()` use the `session_id` from the `createSession()` API response directly (safe), or from `store.getState().checkout.sessionId` (potentially stale if the dispatch hasn't propagated)?

**11.3 Sequential vs parallel calls**
Are `createSession()` and `holdSlot()` called sequentially (correct) or in parallel (incorrect — `holdSlot()` requires the session to exist first)?

**11.4 Error handling if `createSession()` fails**
If `POST /session/create/` returns an error, is `holdSlot()` NOT called? Is the user shown an error state?

---

### 12. `BookingLinkCheckoutSession.rate` — Silent Drop

**Backend finding:** `CheckoutSessionCreateSerializer` accepts `rate_id` but `CheckoutSessionCreateView` never sets `session.rate`. The selected rate is not persisted to the session record.

**12.1 Rate used for fee calculation**
`CheckoutFeePreviewView` calls `get_booking_link_fee_percent(None)` — passing `None` instead of the actual appointment or rate. Confirm whether `get_booking_link_fee_percent` uses the rate parameter at all. If it always returns a default fee regardless of rate, this is acceptable but should be documented.

**12.2 Frontend rate display**
`ServiceOptionSerializer` includes `price` and `duration_minutes`. Does `PaymentCapture.tsx` display the correct rate price to the user, sourced from the earlier `getServices()` response (stored in Redux or component state) — not from the session record (which doesn't store it)?

---

### 13. Mixpanel Event Completeness

**13.1 Events defined**
In `src/mixPanelEvents/bookings.ts`, are all nine events from the plan defined?
Required: `checkout_started`, `checkout_service_selected`, `checkout_slot_selected`, `checkout_auth_required`, `checkout_auth_completed`, `checkout_payment_started`, `checkout_completed`, `checkout_abandoned`, `checkout_slot_expired`

**13.2 Events fired**
Is each event fired at the correct step transition? Specifically:
- `checkout_slot_expired` fired when the countdown hits 0 (not just when `SessionExpiredState` renders)
- `checkout_abandoned` fired on page unload / navigation away mid-flow (requires `beforeunload` or Next.js `routeChangeStart` handler)
- `checkout_completed` fired only after `completeCheckout()` returns success — never on Stripe success alone

**13.3 Property consistency**
Do all events include `slug` and `step` as properties for funnel analysis?

---

### 14. ICS API Route

**14.1 File exists**
Does `src/pages/api/ics.ts` exist?

**14.2 Input validation**
Does it validate `appointmentId` or `sessionId` query parameters before generating the ICS file?

**14.3 Timezone usage**
Does it use the `client_timezone` stored in the checkout session (or passed as a query param) for the ICS `DTSTART`/`DTEND` fields — not UTC?

---

### 15. `NoAvailabilityState` and Empty Slots

**15.1 Empty slots detection**
In `SchedulePicker.tsx`, when `GET /checkout/slots/<slug>/` returns an empty array, does the component render `NoAvailabilityState` — not a blank calendar?

**15.2 Mid-flow deactivation**
If the provider deactivates the booking link after the user has started the wizard (e.g., between step 1 and step 3), does a subsequent API call returning 404 trigger `InvalidLinkState` — not an unhandled error?

---

## Output Format

For each numbered question, respond with:

```
### <question number> — <short title>
Verdict: PASS | FAIL | WARN | NOT IMPLEMENTED
File: <path>:<line range>
Finding: <1-3 sentences describing what the code does>
Recommendation: <only if not PASS — specific fix>
```

After all questions, produce a summary table:

| # | Title | Verdict |
|---|---|---|
| 1.1 | Redux shape completeness | ... |
| ... | ... | ... |

Then list all FAIL and WARN items under a **Critical Issues** heading, ordered by severity.
