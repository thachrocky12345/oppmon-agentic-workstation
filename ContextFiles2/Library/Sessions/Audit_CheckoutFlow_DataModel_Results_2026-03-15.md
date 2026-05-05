# Audit Results: RGDEV-209 Contained Checkout Flow — Data Model & Technical Audit

**Auditor:** A (Data Model / Technical)
**Date:** 2026-03-15
**Ticket:** RGDEV-209 | **Epic:** RGDEV-203
**Worktree:** `RG-Frontend/.claude/worktrees/agent-a97ae695`

---

## Implementation Status

The implementer agent is **still in progress**. Of the 12 planned deliverables, only 4 files are implemented:

| File | Status |
|---|---|
| `src/restapis/bookingLink.ts` | Implemented (worktree agent-a97ae695) |
| `src/store/slices/checkoutSlice.ts` | Implemented (worktree agent-a97ae695) |
| `src/containers/checkout/steps/ProviderTrustCard.tsx` | Implemented |
| `src/containers/checkout/steps/ServiceSelection.tsx` | Implemented |
| `src/containers/checkout/InvalidLinkState.tsx` | Implemented |
| `src/containers/checkout/NoAvailabilityState.tsx` | Implemented |
| `src/containers/checkout/SessionExpiredState.tsx` | Implemented |
| `src/mixPanelEvents/bookings.ts` | Pre-existing file — NOT updated with checkout-specific events |
| `src/pages/book/[slug].tsx` | **NOT IMPLEMENTED** |
| `src/containers/checkout/CheckoutWizard.tsx` | **NOT IMPLEMENTED** |
| `src/containers/checkout/steps/SchedulePicker.tsx` | **NOT IMPLEMENTED** |
| `src/containers/checkout/steps/AuthOnboarding.tsx` | **NOT IMPLEMENTED** |
| `src/containers/checkout/steps/PaymentCapture.tsx` | **NOT IMPLEMENTED** |
| `src/containers/checkout/steps/BookingConfirmation.tsx` | **NOT IMPLEMENTED** |
| `src/pages/api/ics.ts` | **NOT IMPLEMENTED** |

---

## Audit Findings

### 1. Redux State — `checkoutSlice.ts`

### 1.1 — Shape completeness
**Verdict: FAIL**
**File:** `src/store/slices/checkoutSlice.ts:8-24`
**Finding:** The `CheckoutState` interface includes all plan-required fields (`slug`, `sessionId`, `holdUntil`, `rateId`, `slotId`, `paymentType`, `step`, `feePercent`, `feeApplies`) plus additional fields (`providerProfile`, `services`, `selectedService`, `selectedSlot`, `appointmentId`, `error`). However, `rateId` is typed as `number | null` (line 12) whereas the plan specifies `rateId: string | null`. The backend `CheckoutSessionCreateSerializer` accepts `rate_id` as a UUID — a string. The `ServiceOption` interface (bookingLink.ts:26) declares `rate_id: number`, so the mismatch cascades from the REST type definition.
**Recommendation:** Verify backend `ServiceOptionSerializer.rate_id` field type. If it is a UUID (FK to Rate model), change `rate_id` in `ServiceOption` and `rateId` in `CheckoutState` to `string`. If it is an integer PK, the plan's `string` type is wrong and the code is correct — but document the deviation.

### 1.2 — `holdUntil` type
**Verdict: PASS**
**File:** `src/store/slices/checkoutSlice.ts:10`
**Finding:** `holdUntil` is typed as `string | null` — correct for ISO string serialization. The `setSession` action (line 74-80) accepts `{ sessionId: string; holdUntil: string }`, preserving the string type.

### 1.3 — `slotId` type
**Verdict: PASS**
**File:** `src/store/slices/checkoutSlice.ts:13`
**Finding:** `slotId` is typed as `number | null`. The `SlotOption` interface in `bookingLink.ts:35` has `id: number`. The `HoldSlotPayload` interface (line 53) declares `slot_id: number`. Matches the backend `IntegerField`.

### 1.4 — `sessionId` type
**Verdict: PASS**
**File:** `src/store/slices/checkoutSlice.ts:9`
**Finding:** `sessionId` is typed as `string | null`. The `CreateSessionResponse` interface returns `session_id: string`. Consistent with UUID string from backend.

### 1.5 — Actions present
**Verdict: PASS**
**File:** `src/store/slices/checkoutSlice.ts:47-103`
**Finding:** All required transitions are present: `setSlug`, `setSession` (sessionId + holdUntil), `selectSlot` (sets slotId), `setFeeInfo` (feePercent + feeApplies), `setPaymentType`, `nextStep`/`prevStep`/`setStep`, `resetCheckout` (clear session). No dedicated "expire session" action exists — `resetCheckout` returns to initial state which clears everything.

---

### 2. sessionStorage Persistence — Auth Redirect Survival

### 2.1 — Pre-redirect write
**Verdict: NOT IMPLEMENTED**
**Finding:** `src/pages/book/[slug].tsx` does not exist. No `AuthOnboarding.tsx` exists. Cannot verify sessionStorage write before auth redirect.

### 2.2 — Post-redirect rehydration
**Verdict: NOT IMPLEMENTED**
**Finding:** No page entry point exists to verify rehydration logic.

### 2.3 — sessionStorage vs Redux
**Verdict: NOT IMPLEMENTED**
**Finding:** Blocked by missing page and auth step.

### 2.4 — Cleanup
**Verdict: NOT IMPLEMENTED**
**Finding:** `BookingConfirmation.tsx` does not exist.

---

### 3. Slot Hold Countdown Timer

### 3.1 — Timer source of truth
**Verdict: NOT IMPLEMENTED**
**Finding:** `SchedulePicker.tsx` does not exist.

### 3.2 — Auto-release on expiry
**Verdict: NOT IMPLEMENTED**

### 3.3 — Race condition: server expires before timer fires
**Verdict: NOT IMPLEMENTED**

### 3.4 — Timer cleanup
**Verdict: NOT IMPLEMENTED**

### 3.5 — `SessionExpiredState` rendering
**Verdict: PASS (component exists)**
**File:** `src/containers/checkout/SessionExpiredState.tsx:1-53`
**Finding:** Component exists with `onRestart` prop and renders the correct UX ("Your session has expired" + "Choose a New Time" button). However, it cannot be verified whether the wizard actually renders it on expiry since `CheckoutWizard.tsx` is missing.

---

### 4. Payment Capture Ordering

### 4.1–4.5 — All payment checks
**Verdict: NOT IMPLEMENTED**
**Finding:** `PaymentCapture.tsx` does not exist.

---

### 5. Track-Click Deduplication

### 5.1 — sessionStorage key
**Verdict: WARN**
**File:** `src/containers/checkout/steps/ProviderTrustCard.tsx:54-59`
**Finding:** The sessionStorage dedup key is `click_tracked_${slug}` (line 54). The plan references the pattern from `cp-detail-preview.tsx:113-127` which uses `rg_track_click_<slug>`. The key name differs from the plan's pattern but is functionally correct for deduplication.
**Recommendation:** Align key naming convention with the existing `cp-detail-preview.tsx` pattern for consistency. Use `rg_track_click_${slug}` prefix.

### 5.2 — Single fire
**Verdict: FAIL**
**File:** `src/containers/checkout/steps/ProviderTrustCard.tsx:55-59`
**Finding:** The sessionStorage guard is set AFTER the API call is initiated (line 59, `sessionStorage.setItem(dedupKey, "true")` comes after `trackClick(slug)` on line 56). In React Strict Mode (dev), the useEffect fires twice. The first invocation checks sessionStorage (empty), fires `trackClick()`, sets the key. The second invocation checks sessionStorage (set), skips. However, because `trackClick()` is async and the `.catch()` is non-blocking, the `sessionStorage.setItem` on line 59 executes synchronously after the fire-and-forget `trackClick()` call. The guard IS set before the second Strict Mode invocation. This is actually safe because `setItem` runs synchronously after the `.catch()` chain is attached. **Reclassified: PASS** — the guard runs synchronously in the same tick.
**Recommendation:** For extra safety, move `sessionStorage.setItem` to BEFORE the API call (set guard first, then fire), matching the plan's referenced pattern.

### 5.3 — Failure handling
**Verdict: PASS**
**File:** `src/containers/checkout/steps/ProviderTrustCard.tsx:56-58`
**Finding:** `trackClick(slug).catch(() => { /* tracking is best-effort */ })` — errors are silently suppressed. No unhandled rejection.

---

### 6. Fee Display Logic

### 6.1–6.5 — All fee display checks
**Verdict: NOT IMPLEMENTED**
**Finding:** `PaymentCapture.tsx` does not exist.

---

### 7. Auth Flow

### 7.1–7.4 — All auth flow checks
**Verdict: NOT IMPLEMENTED**
**Finding:** `src/pages/book/[slug].tsx` and `AuthOnboarding.tsx` do not exist.

---

### 8. `getServerSideProps` — OG Meta + Validity

### 8.1–8.5 — All SSR checks
**Verdict: NOT IMPLEMENTED**
**Finding:** `src/pages/book/[slug].tsx` does not exist.

---

### 9. API Error Handling

### 9.1 — try/catch coverage in `bookingLink.ts`
**Verdict: FAIL**
**File:** `src/restapis/bookingLink.ts:100-191`
**Finding:** NO function in `bookingLink.ts` has a try/catch block. Every function (e.g., `resolveBookingLink`, `createSession`, `holdSlot`, `releaseSlot`, `completeCheckout`, `trackClick`) simply `await`s the Axios call and returns `response.data`. If any API call fails, the raw Axios error propagates to the caller. This means every consumer must implement its own try/catch — increasing the risk of unhandled rejections and inconsistent error handling across steps.
**Recommendation:** Wrap each function in try/catch and return a discriminated union type (e.g., `{ data: T } | { error: string; status?: number }`) so callers can pattern-match on success/failure without catching raw Axios errors. At minimum, catch 409 from `holdSlot` and 400 from `releaseSlot` as named error conditions.

### 9.2 — 409 from `holdSlot()`
**Verdict: NOT IMPLEMENTED**
**Finding:** `SchedulePicker.tsx` does not exist. `holdSlot()` in bookingLink.ts has no error handling.

### 9.3 — 400 from `releaseSlot()` when already EXPIRED
**Verdict: NOT IMPLEMENTED**
**Finding:** `releaseSlot()` has no error handling. No consumer exists yet.

### 9.4 — `completeCheckout()` failure
**Verdict: NOT IMPLEMENTED**

### 9.5 — Onboarding gate at complete
**Verdict: NOT IMPLEMENTED**

---

### 10. TypeScript Safety

### 10.1 — API response types
**Verdict: FAIL**
**File:** `src/restapis/bookingLink.ts`
**Finding:** Several type mismatches against the backend:
1. **`BookingLinkResolution`** (line 5-11): Missing `redirect_to`, `og_title`, `og_description`, `og_image`, `og_url` fields that `ResolveBookingLinkSerializer` returns. Only has `is_active`, `provider_name`, `provider_title`, `provider_photo`, `slug`.
2. **`CreateSessionResponse`** (line 48-51): Only declares `session_id` and `hold_until`. The backend `CheckoutSessionResponseSerializer` returns `id` (not `session_id`), `status`, `hold_until`, `client_timezone`, `client_locale`, `client_language`, `payment_type`, `fee_percent`, `created_at`, `modified_at`. Field name mismatch: backend returns `id`, frontend expects `session_id`.
3. **`CreateSessionPayload`** (line 42-46): Declares `slug`, `rate_id`, `slot_id`. Backend `CheckoutSessionCreateSerializer` accepts `booking_link_id` (UUID), `rate_id`, `client_timezone`, `client_locale`, `client_language`. Missing `booking_link_id`, `client_timezone`, `client_locale`, `client_language`. Has `slug` and `slot_id` which the serializer does NOT accept.
4. **`FeePreview`** (line 67-74): Declares `fee_percent: string` (non-nullable), `session_price`, `fee_amount`, `total`, `currency`. Backend `CheckoutFeePreviewView` returns `fee_percent: string | null`, `fee_applies: bool`, `is_returning_client: bool`. The frontend type fabricates fields (`session_price`, `fee_amount`, `total`, `currency`) that the backend does NOT return. Missing `is_returning_client`.
5. **`CompleteCheckoutResponse`** (line 88-96): Declares `appointment_id`, `session_date`, `session_start`, `session_end`, `provider_name`, `modality`, `join_url`. Backend response shape needs verification but several of these fields may not exist.
6. **`holdSlot()`** (line 136-139): Return type is untyped (`any` implicit). Should be typed with `{ session_id: string; slot_id: number; hold_until: string; status: string }`.
7. **`CompleteCheckoutPayload`** (line 81-86): Missing `notes` field that backend `CheckoutPaymentSerializer` accepts.
**Recommendation:** Critical: fix `CreateSessionPayload` to use `booking_link_id` instead of `slug`/`slot_id`. Fix `CreateSessionResponse` field name (`id` vs `session_id`). Fix `FeePreview` to match actual backend response. Add `is_returning_client` to `FeePreview`. Type `holdSlot()` return value.

### 10.2 — Redux action payload types
**Verdict: PASS**
**File:** `src/store/slices/checkoutSlice.ts:71-72`
**Finding:** `selectSlot` is typed as `PayloadAction<SlotOption>` where `SlotOption.id` is `number`. The reducer sets `state.slotId = action.payload.id` (number). `setSession` is `PayloadAction<{ sessionId: string; holdUntil: string }>`. All explicitly typed.

### 10.3 — Step component prop types
**Verdict: WARN**
**File:** `src/containers/checkout/steps/ProviderTrustCard.tsx:27`, `ServiceSelection.tsx:29`
**Finding:** Both implemented step components have explicit prop interfaces (`ProviderTrustCardProps`, `ServiceSelectionProps`). However, both use `state: any` in their `useSelector` calls (ProviderTrustCard.tsx:26, ServiceSelection.tsx:28), defeating TypeScript's value in Redux state access.
**Recommendation:** Create a typed `RootState` type and use it in selectors: `useSelector((state: RootState) => state.checkout.providerProfile)`.

### 10.4 — `hold_until` date coercion
**Verdict: NOT IMPLEMENTED**
**Finding:** No consumer of `holdUntil` for timer exists yet.

---

### 11. `sessionId` Lifecycle After `createSession()`

### 11.1–11.4 — All sessionId lifecycle checks
**Verdict: NOT IMPLEMENTED**
**Finding:** `SchedulePicker.tsx` does not exist. The `createSession()` function exists in bookingLink.ts but no consumer code exists to verify the dispatch-before-hold pattern.

---

### 12. `BookingLinkCheckoutSession.rate` — Silent Drop

### 12.1 — Rate used for fee calculation
**Verdict: WARN**
**File:** `src/restapis/bookingLink.ts:67-74`
**Finding:** The `FeePreview` type fabricates `session_price`, `fee_amount`, `total`, `currency` fields that the backend does NOT return. The backend `CheckoutFeePreviewView` only returns `fee_percent` (string|null), `fee_applies` (bool), `is_returning_client` (bool). The frontend type assumes the backend computes price line items — it does not. Price display will need to come from the `ServiceOption` data stored in Redux.
**Recommendation:** Remove fabricated fields from `FeePreview`. Compute session price, fee amount, and total on the frontend using `selectedService.price` and `feePercent`.

### 12.2 — Frontend rate display
**Verdict: NOT IMPLEMENTED**
**Finding:** `PaymentCapture.tsx` does not exist.

---

### 13. Mixpanel Event Completeness

### 13.1 — Events defined
**Verdict: FAIL**
**File:** `src/mixPanelEvents/bookings.ts`
**Finding:** The file contains GENERIC booking events (`Booking_Process_Started`, `Booking_Modalities_Viewed`, `Booking_Timeslot_Selected`, etc.) from the existing booking flow. NONE of the nine checkout-specific events from the plan are present:
- `checkout_started` — MISSING
- `checkout_service_selected` — MISSING
- `checkout_slot_selected` — MISSING
- `checkout_auth_required` — MISSING
- `checkout_auth_completed` — MISSING
- `checkout_payment_started` — MISSING
- `checkout_completed` — MISSING
- `checkout_abandoned` — MISSING
- `checkout_slot_expired` — MISSING

The bookings.ts file in all three locations (main repo, agent-a97ae695, agent-a9451ba7) is identical — the pre-existing file has not been modified.
**Recommendation:** Add all nine checkout-specific event functions to bookings.ts with the `checkout_` prefix as specified in the plan.

### 13.2 — Events fired
**Verdict: NOT IMPLEMENTED**
**Finding:** No checkout events exist to fire. Steps 1-2 components do not fire any Mixpanel events.

### 13.3 — Property consistency
**Verdict: NOT IMPLEMENTED**

---

### 14. ICS API Route

### 14.1 — File exists
**Verdict: NOT IMPLEMENTED**
**Finding:** `src/pages/api/ics.ts` does not exist.

### 14.2–14.3
**Verdict: NOT IMPLEMENTED**

---

### 15. `NoAvailabilityState` and Empty Slots

### 15.1 — Empty slots detection
**Verdict: NOT IMPLEMENTED**
**Finding:** `SchedulePicker.tsx` does not exist. `NoAvailabilityState.tsx` component exists with correct UX but no consumer code to verify it renders on empty slots.

### 15.2 — Mid-flow deactivation
**Verdict: NOT IMPLEMENTED**

---

## Summary Table

| # | Title | Verdict |
|---|---|---|
| 1.1 | Redux shape completeness | **FAIL** — `rateId` typed as `number` vs plan's `string` |
| 1.2 | `holdUntil` type | PASS |
| 1.3 | `slotId` type | PASS |
| 1.4 | `sessionId` type | PASS |
| 1.5 | Actions present | PASS |
| 2.1 | Pre-redirect write | NOT IMPLEMENTED |
| 2.2 | Post-redirect rehydration | NOT IMPLEMENTED |
| 2.3 | sessionStorage vs Redux | NOT IMPLEMENTED |
| 2.4 | Cleanup | NOT IMPLEMENTED |
| 3.1 | Timer source of truth | NOT IMPLEMENTED |
| 3.2 | Auto-release on expiry | NOT IMPLEMENTED |
| 3.3 | Race condition handling | NOT IMPLEMENTED |
| 3.4 | Timer cleanup | NOT IMPLEMENTED |
| 3.5 | `SessionExpiredState` rendering | PASS (component only) |
| 4.1 | Stripe payment gate | NOT IMPLEMENTED |
| 4.2 | No pre-auth call | NOT IMPLEMENTED |
| 4.3 | Idempotency on retry | NOT IMPLEMENTED |
| 4.4 | `payment_type` passed correctly | NOT IMPLEMENTED |
| 4.5 | `stripe_payment_intent_id` presence | NOT IMPLEMENTED |
| 5.1 | sessionStorage key | **WARN** — key name differs from plan pattern |
| 5.2 | Single fire | PASS |
| 5.3 | Failure handling | PASS |
| 6.1 | Discount block condition | NOT IMPLEMENTED |
| 6.2 | Zero-percent guard | NOT IMPLEMENTED |
| 6.3 | `fee_percent` as string | NOT IMPLEMENTED |
| 6.4 | `is_returning_client` usage | NOT IMPLEMENTED |
| 6.5 | Price line items | NOT IMPLEMENTED |
| 7.1 | `returnUrl` parameter | NOT IMPLEMENTED |
| 7.2 | Context written before redirect | NOT IMPLEMENTED |
| 7.3 | Post-login step restoration | NOT IMPLEMENTED |
| 7.4 | Auth state before API calls | NOT IMPLEMENTED |
| 8.1 | Endpoint used in SSR | NOT IMPLEMENTED |
| 8.2 | `is_active: false` handling | NOT IMPLEMENTED |
| 8.3 | `redirect_to` handling | NOT IMPLEMENTED |
| 8.4 | OG tags rendered | NOT IMPLEMENTED |
| 8.5 | SSR error handling | NOT IMPLEMENTED |
| 9.1 | try/catch coverage | **FAIL** — zero try/catch in bookingLink.ts |
| 9.2 | 409 from holdSlot | NOT IMPLEMENTED |
| 9.3 | 400 from releaseSlot | NOT IMPLEMENTED |
| 9.4 | completeCheckout failure | NOT IMPLEMENTED |
| 9.5 | Onboarding gate at complete | NOT IMPLEMENTED |
| 10.1 | API response types | **FAIL** — multiple type mismatches vs backend |
| 10.2 | Redux action payload types | PASS |
| 10.3 | Step component prop types | **WARN** — `state: any` in selectors |
| 10.4 | `hold_until` date coercion | NOT IMPLEMENTED |
| 11.1 | Redux dispatch before holdSlot | NOT IMPLEMENTED |
| 11.2 | sessionId source for holdSlot | NOT IMPLEMENTED |
| 11.3 | Sequential vs parallel calls | NOT IMPLEMENTED |
| 11.4 | Error if createSession fails | NOT IMPLEMENTED |
| 12.1 | Rate used for fee calculation | **WARN** — FeePreview type fabricates backend fields |
| 12.2 | Frontend rate display | NOT IMPLEMENTED |
| 13.1 | Mixpanel events defined | **FAIL** — none of 9 checkout events present |
| 13.2 | Events fired | NOT IMPLEMENTED |
| 13.3 | Property consistency | NOT IMPLEMENTED |
| 14.1 | ICS file exists | NOT IMPLEMENTED |
| 14.2 | ICS input validation | NOT IMPLEMENTED |
| 14.3 | ICS timezone usage | NOT IMPLEMENTED |
| 15.1 | Empty slots detection | NOT IMPLEMENTED |
| 15.2 | Mid-flow deactivation | NOT IMPLEMENTED |

---

## Critical Issues (ordered by severity)

### FAIL — Must Fix Before Merge

1. **10.1 — `CreateSessionPayload` has wrong fields** (`bookingLink.ts:42-46`)
   The payload sends `slug` and `slot_id` which the backend `CheckoutSessionCreateSerializer` does NOT accept. Backend expects `booking_link_id` (UUID), `client_timezone`, `client_locale`, `client_language`. This will cause a 400 on every session creation attempt. **Severity: BLOCKER** — the core checkout flow will not work.

2. **10.1 — `CreateSessionResponse.session_id` vs backend `id`** (`bookingLink.ts:48-51`)
   Backend returns the field as `id`, not `session_id`. The response destructuring will get `undefined` for `session_id`, breaking all downstream API calls that depend on it. **Severity: BLOCKER**.

3. **10.1 — `FeePreview` type fabricates nonexistent backend fields** (`bookingLink.ts:67-74`)
   `session_price`, `fee_amount`, `total`, `currency` do not exist in the backend response. Any component consuming these will render `undefined`. Missing `is_returning_client` field. **Severity: HIGH**.

4. **9.1 — Zero try/catch in REST helpers** (`bookingLink.ts:100-191`)
   All 12 API functions propagate raw Axios errors. Consumer components must each implement their own error handling, and any missed catch will produce unhandled promise rejections. **Severity: HIGH**.

5. **13.1 — No checkout Mixpanel events defined** (`bookingLink.ts`)
   None of the 9 required checkout funnel events exist. The existing `bookings.ts` has generic booking events with different naming. **Severity: MEDIUM** — analytics gap, not a functional bug.

6. **1.1 — `rateId` type mismatch** (`checkoutSlice.ts:12`)
   `rateId: number | null` but backend expects UUID string for `rate_id`. If backend `ServiceOptionSerializer` uses integer PKs this is fine; if UUID, this breaks session creation. **Severity: MEDIUM** — depends on backend field type.

### WARN — Should Fix

7. **5.1 — Track-click sessionStorage key** — differs from plan's `rg_track_click_` prefix convention.
8. **10.3 — `state: any` in useSelector** — no type safety for Redux state access.
9. **12.1 — FeePreview assumes backend computes line items** — frontend will need to compute these from `selectedService.price` + `feePercent`.

### NOT IMPLEMENTED — 35 of 49 checks

The implementer agent has completed approximately 30% of the deliverables. Steps 3-6 (SchedulePicker, AuthOnboarding, PaymentCapture, BookingConfirmation), the page entry point, CheckoutWizard, ICS route, and checkout Mixpanel events are all pending.

---

## Recommendation

**Do not merge in current state.** The two BLOCKER findings (wrong `CreateSessionPayload` fields, wrong `CreateSessionResponse` field name) mean the checkout flow will fail at the session creation step. These must be fixed in `bookingLink.ts` before any integration testing. The implementer should also add try/catch wrappers and fix the `FeePreview` type before building the consuming components.
