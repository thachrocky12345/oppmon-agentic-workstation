# CheckoutFlow Final Corrected Plan -- RGDEV-209
Date: 2026-03-15

**Sources:** Plan_RGDEV-209, FixPlan_CheckoutFlow_DataModel, FixPlan_CheckoutFlow_UXScenario, Audit_CheckoutFlow_DataModel_Results, Audit_CheckoutFlow_UXScenario_Results
**Worktree:** `RG-Frontend/.claude/worktrees/agent-a97ae695`

## Summary

The contained checkout wizard at `/book/[slug]` is approximately 80% implemented. All 6 step components, the page entry point, the wizard shell, the Redux slice, the REST API helpers, and the 3 error-state components exist. However, **10 of 12 TypeScript interfaces in `bookingLink.ts` have field name or type mismatches against the backend serializers**, meaning API calls will either 400 or return `undefined` for critical fields. The hold timer only runs inside `SchedulePicker` and is destroyed when the user advances, creating a double-booking risk. A hardcoded Stripe test key is in source. Two files are missing entirely (`src/pages/api/ics.ts`, checkout Mixpanel events).

## Already Correct (do not re-implement)

These components/functions are structurally sound and do not need changes beyond the cascading type fixes listed below:

1. **`src/store/slices/checkoutSlice.ts`** -- Slice structure, all reducers, action exports. Only needs `rateId` type change, `bookingLinkId` + `clientTimezone` additions, and `selectSlot` field name update.
2. **`src/containers/checkout/InvalidLinkState.tsx`** -- Renders correctly.
3. **`src/containers/checkout/SessionExpiredState.tsx`** -- Renders correctly with `onRestart` prop.
4. **`src/containers/checkout/steps/ProviderTrustCard.tsx`** -- Track-click dedup works. Only minor sessionStorage key naming issue (LOW).
5. **`src/restapis/bookingLink.ts` API function signatures** -- All 12 endpoint URLs are correct. `HoldSlotPayload` and `OnboardingStatus` interfaces are correct.
6. **`src/containers/checkout/steps/AuthOnboarding.tsx`** -- Onboarding status check, form rendering, and submit logic are correct. Needs timezone in sessionStorage context and input type hints.
7. **Google Calendar URL builder** in `BookingConfirmation.tsx` -- Correct implementation.

## Fixes Required

### CRITICAL

#### C1: `CreateSessionPayload` sends wrong fields (BLOCKER -- every session creation will 400)
**File:** `src/restapis/bookingLink.ts` lines 42-46
**Change:** Replace the interface:
```ts
// OLD
export interface CreateSessionPayload {
  slug: string;
  rate_id: number;
  slot_id: number;
}
// NEW
export interface CreateSessionPayload {
  booking_link_id: string;
  rate_id?: string;
  client_timezone?: string;
  client_locale?: string;
  client_language?: string;
}
```

#### C2: `CreateSessionResponse` field name mismatch (BLOCKER -- sessionId will be undefined)
**File:** `src/restapis/bookingLink.ts` lines 48-51
**Change:** Replace the interface:
```ts
// OLD
export interface CreateSessionResponse {
  session_id: string;
  hold_until: string;
}
// NEW
export interface CreateSessionResponse {
  id: string;
  status: string;
  hold_until: string;
  client_timezone: string;
  client_locale: string;
  client_language: string;
  payment_type: string | null;
  fee_percent: string | null;
  created_at: string;
  modified_at: string;
}
```

#### C3: `SchedulePicker.tsx` sends wrong fields to `createSession` and `holdSlot` (cascades from C1+C2)
**File:** `src/containers/checkout/steps/SchedulePicker.tsx` lines 150-166
**Change:** In `handleSelectSlot`:
```ts
// OLD
const session = await createSession({
  slug,
  rate_id: rateId,
  slot_id: slot.id,
});
await holdSlot({
  session_id: session.session_id,
  slot_id: slot.id,
});
dispatch(selectSlot(slot));
dispatch(setSession({
  sessionId: session.session_id,
  holdUntil: session.hold_until,
}));

// NEW
const session = await createSession({
  booking_link_id: checkout.bookingLinkId!,
  rate_id: checkout.selectedService?.rate_id,
  client_timezone: timezone,
});
const holdResult = await holdSlot({
  session_id: session.id,
  slot_id: slot.slot_id,
});
dispatch(selectSlot(slot));
dispatch(setSession({
  sessionId: session.id,
  holdUntil: holdResult.hold_until,
}));
```
Also add `checkout` to the destructured selector and `bookingLinkId` check.

#### C4: Hold timer destroyed on step advance -- double-booking risk
**File:** `src/containers/checkout/CheckoutWizard.tsx`
**Change:** Move the entire hold timer logic from `SchedulePicker.tsx` into `CheckoutWizard.tsx`:
- Add `useState` for `holdExpired` (boolean) and `countdown` (number|null)
- Add `useRef` for `timerRef`
- Add `useEffect` watching `checkout.holdUntil` and `checkout.sessionId` that runs the countdown interval
- On expiry: set `holdExpired=true`, call `releaseSlot(sessionId).catch(() => {})`
- Add rehydration check: if sessionStorage `holdUntil` has passed during auth redirect, immediately show expired state
- Render `<SessionExpiredState>` when `holdExpired` is true (intercepts all steps)
- Add persistent countdown `<Chip>` banner between Stepper and step content, visible on steps 3-5
- Add imports: `useState`, `useRef` from react; `Chip` from MUI; `releaseSlot` from bookingLink; `setSession` from checkoutSlice; `SessionExpiredState`

**File:** `src/containers/checkout/steps/SchedulePicker.tsx`
**Change:** Remove all timer-related code:
- Remove `timerRef`, `countdown`, `expired` state declarations (lines 84, 92-93)
- Remove countdown `useEffect` (lines 117-140)
- Remove `handleRestart` function (lines 190-198)
- Remove `if (expired)` early return (lines 200-202)
- Remove `formatCountdown` function (lines 243-247)
- Remove countdown `<Chip>` render block (lines 299-308)

#### C5: Backend does not validate `hold_until` before completing checkout
**File:** `Lumy-Backend/apps/booking_link/views.py` -- `CheckoutCompleteView.post()`
**Location:** After session retrieval, before `bl = session.booking_link`
**Change:** Add:
```python
# Reject completion if the slot hold has expired server-side
if session.hold_until and session.hold_until < timezone.now():
    session.status = 'EXPIRED'
    session.save(update_fields=['status', 'modified_at'])
    return Response(
        {'error': 'Slot hold has expired. Please select a new time.'},
        status=status.HTTP_410_GONE,
    )
```

#### C6: Hardcoded Stripe test key in source code (security)
**File:** `src/containers/checkout/steps/PaymentCapture.tsx` lines 34-36
**Change:**
```ts
// OLD
const STRIPE_PUBLISH_KEY =
  process?.env?.NEXT_PUBLIC_STRIPE_PUBLISH_KEY ||
  "pk_test_51QyZEGPOs8WsF9SUWoan4CAxEfZEV4vNJ7Ng2whYLkkEN7UYSSzrPnKdKZiP197mhz1HvUW5MCujmJWg8uYQpvLo00JDIlDStH";
// NEW
const STRIPE_PUBLISH_KEY = process?.env?.NEXT_PUBLIC_STRIPE_PUBLISH_KEY || "";
```
Also add guard in `handlePay` after the `!stripe || !elements` check:
```ts
if (!stripe || !elements) {
  toast.error("Payment system failed to load. Please refresh the page.");
  return;
}
```

#### C7: 409 from `checkout/complete` shows toast but no navigation (user stuck)
**File:** `src/containers/checkout/steps/PaymentCapture.tsx` lines 86-96
**Change:** Replace catch block:
```ts
// OLD
if (err?.response?.status === 409) {
  toast.error("This time slot is no longer available.");
} else {
  toast.error(msg);
}
// NEW
if (err?.response?.status === 409) {
  toast.error("This time slot was taken. Please choose another time.");
  dispatch(setStep(3));
} else if (err?.response?.status === 410) {
  toast.error("Your slot hold has expired. Please select a new time.");
  dispatch(setStep(3));
} else {
  toast.error(msg);
}
```
Add `setStep` to the import from `checkoutSlice`.

### HIGH

#### H1: `BookingLinkResolution` type missing fields -- SSR reads nonexistent props
**File:** `src/restapis/bookingLink.ts` lines 5-11
**Change:** Replace interface:
```ts
export interface BookingLinkResolution {
  booking_link_id: string | null;
  provider_slug: string;
  is_active: boolean;
  redirect_to: string | null;
  og_title: string;
  og_description: string;
  og_image: string | null;
  og_url: string;
  provider_name?: string | null;
  provider_photo_url?: string | null;
  robots?: string;
  twitter_card?: string;
}
```

#### H2: `[slug].tsx` reads wrong fields from resolve response + missing redirect handling
**File:** `src/pages/book/[slug].tsx` lines 78-103
**Change in `getServerSideProps`:**
```ts
const data = await resolveBookingLink(slug);

// Handle slug redirect (renamed slugs)
if (data.redirect_to) {
  return { redirect: { destination: data.redirect_to, permanent: true } };
}

return {
  props: {
    slug,
    isActive: data.is_active,
    providerName: data.provider_name || '',
    providerTitle: data.og_description || '',
    providerPhoto: data.provider_photo_url || null,
    bookingLinkId: data.booking_link_id || null,
    ogTitle: data.og_title || '',
    ogImage: data.og_image || null,
    messages,
  },
};
```
Add `bookingLinkId: string | null` to `BookPageProps` interface. Pass `bookingLinkId` to `<CheckoutWizard>`.

#### H3: Add `bookingLinkId` to Redux state (required by C3)
**File:** `src/store/slices/checkoutSlice.ts`
**Change:** Add to `CheckoutState`: `bookingLinkId: string | null;`
Add to `initialState`: `bookingLinkId: null,`
Add reducer: `setBookingLinkId(state, action: PayloadAction<string>) { state.bookingLinkId = action.payload; },`
Export `setBookingLinkId` from actions.

**File:** `src/containers/checkout/CheckoutWizard.tsx`
**Change:** Accept `bookingLinkId` prop. Dispatch `setBookingLinkId(bookingLinkId)` in the init `useEffect`.

#### H4: `ProviderProfile` type field mismatches
**File:** `src/restapis/bookingLink.ts` lines 13-23
**Change:** Replace interface:
```ts
export interface ProviderProfile {
  provider_id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  title: string;
  bio: string;
  slug: string;
}
```
**Cascading:** `BookingConfirmation.tsx` line 41: `providerProfile?.name` -> `` `${providerProfile.first_name} ${providerProfile.last_name}`.trim() ``
`ProviderTrustCard.tsx`: update `profile.name` -> `profile.first_name + ' ' + profile.last_name`, `profile.photo` -> `profile.photo_url`

#### H5: `ServiceOption` type field mismatches
**File:** `src/restapis/bookingLink.ts` lines 25-33
**Change:** Replace interface:
```ts
export interface ServiceOption {
  rate_id: string;
  name: string;
  duration_minutes: number;
  price: string;
  currency: string;
  session_type: string;
  is_in_person: boolean;
}
```
**Cascading:**
- `checkoutSlice.ts` line 12: `rateId: number | null` -> `rateId: string | null`
- `checkoutSlice.ts` line 68: `state.rateId = action.payload.rate_id` -- already correct (just type changes)
- `ServiceSelection.tsx` line 111: `key={service.id}` -> `key={service.rate_id}`
- `ServiceSelection.tsx` line 146: `service.modality` -> `service.session_type`

#### H6: `SlotOption` type field mismatches
**File:** `src/restapis/bookingLink.ts` lines 35-40
**Change:** Replace interface:
```ts
export interface SlotOption {
  slot_id: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}
```
**Cascading:**
- `checkoutSlice.ts` line 72: `state.slotId = action.payload.id` -> `state.slotId = action.payload.slot_id`
- `SchedulePicker.tsx` `groupByDate`: `slot.date` -> `slot.start_time.split('T')[0]`
- `SchedulePicker.tsx` slot button: `key={slot.id}` -> `key={slot.slot_id}`, `slot.start` -> `slot.start_time`
- `SchedulePicker.tsx` `handleSelectSlot`: `slot.id` -> `slot.slot_id`
- `BookingConfirmation.tsx` lines 43-44: `selectedSlot?.start` -> `selectedSlot?.start_time`, `selectedSlot?.end` -> `selectedSlot?.end_time`

#### H7: `FeePreview` type fabricates nonexistent fields -- price display will show `undefined`
**File:** `src/restapis/bookingLink.ts` lines 67-74
**Change:** Replace interface:
```ts
export interface FeePreview {
  fee_percent: string | null;
  fee_applies: boolean;
  is_returning_client: boolean;
}
```
**Cascading -- `PaymentCapture.tsx` fee breakdown (lines 119-187):** Must compute prices from Redux state:
```ts
const sessionPrice = parseFloat(checkout.selectedService?.price || '0');
const feePercent = feePreview?.fee_percent ? parseFloat(feePreview.fee_percent) : 0;
const feeAmount = feePreview?.fee_applies ? sessionPrice * feePercent : 0;
const total = sessionPrice + feeAmount;
const currency = checkout.selectedService?.currency || 'USD';
const currencySymbol = currency === 'USD' ? '$' : currency;
```
Replace all `feePreview.session_price`, `feePreview.fee_amount`, `feePreview.total`, `feePreview.currency` references with computed values.
Add `checkout` to the `PaymentForm` props or read from `useSelector`.

#### H8: `CompleteCheckoutResponse` type mismatches
**File:** `src/restapis/bookingLink.ts` lines 88-96
**Change:** Replace interface:
```ts
export interface CompleteCheckoutResponse {
  session_id: string;
  appointment_id: number;
  status: string;
  attribution_id: string | null;
}
```
Consumer `PaymentCapture.tsx` line 84 reads `result.appointment_id` -- this field name is correct, no cascading change needed.

#### H9: `holdSlot()` return type untyped
**File:** `src/restapis/bookingLink.ts` line 142
**Change:** Add return type interface and use it:
```ts
export interface HoldSlotResponse {
  session_id: string;
  slot_id: number;
  hold_until: string;
  status: string;
}
export async function holdSlot(data: HoldSlotPayload): Promise<HoldSlotResponse> {
```
Use `holdResult.hold_until` for the definitive hold expiry in `SchedulePicker` (per C3).

#### H10: PaymentMethod ID sent as PaymentIntent ID
**File:** `src/containers/checkout/steps/PaymentCapture.tsx` line 81
**Change:** Add TODO comment documenting the mismatch:
```ts
stripe_payment_intent_id: paymentMethod?.id,
// TODO: RGDEV-209 -- This sends a PaymentMethod ID (pm_...), not a PaymentIntent ID (pi_...).
// Backend must either: (a) create a PaymentIntent from this PM, or (b) frontend must switch
// to client-side PaymentIntent confirmation via a new /checkout/payment-intent/ endpoint.
```
This is a known gap that requires a separate backend ticket. The current backend stores the ID string without creating a charge.

### MEDIUM

#### M1: `CancellationPolicy` type field mismatches
**File:** `src/restapis/bookingLink.ts` lines 76-79
**Change:** Replace interface:
```ts
export interface CancellationPolicy {
  provider_id: string;
  cancellation_window_hours: number;
  cancellation_fee_percent: string | null;
  policy_text: string;
}
```
No consumer breakage -- `policy.policy_text` is correct.

#### M2: `CompleteCheckoutPayload` missing `notes` field
**File:** `src/restapis/bookingLink.ts` lines 81-86
**Change:** Add optional field: `notes?: string;`

#### M3: Add `clientTimezone` to Redux state and persist through auth redirect
**File:** `src/store/slices/checkoutSlice.ts`
**Change:** Add `clientTimezone: string | null` to `CheckoutState`, `null` to `initialState`, and `setClientTimezone` reducer.

**File:** `src/containers/checkout/steps/SchedulePicker.tsx`
**Change:** Dispatch `setClientTimezone(timezone)` on initial detection and on dropdown change.

**File:** `src/containers/checkout/steps/AuthOnboarding.tsx` line 22-29
**Change:** Add `clientTimezone: checkout.clientTimezone` to the `persistContext` payload.

**File:** `src/containers/checkout/steps/BookingConfirmation.tsx` line 46
**Change:** `const timezone = checkout.clientTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;`

#### M4: Timezone dropdown list too small (hardcoded 9 values)
**File:** `src/containers/checkout/steps/SchedulePicker.tsx` lines 278-296
**Change:** Replace hardcoded list with:
```ts
const allTimezones = useMemo(() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [
      detectedTz, "America/New_York", "America/Chicago", "America/Denver",
      "America/Los_Angeles", "America/Toronto", "Europe/London",
      "Europe/Paris", "Asia/Tokyo", "Australia/Sydney",
    ].filter((tz, i, arr) => arr.indexOf(tz) === i);
  }
}, [detectedTz]);
```

#### M5: `state: any` in useSelector calls -- no type safety
**Files:** `SchedulePicker.tsx` line 77, `PaymentCapture.tsx` line 261, `BookingConfirmation.tsx` line 37, `CheckoutWizard.tsx` line 31, `AuthOnboarding.tsx` line 34
**Change:** Use typed selector: `(state: { checkout: CheckoutState }) => state.checkout`

#### M6: ServiceSelection single-service flash
**File:** `src/containers/checkout/steps/ServiceSelection.tsx`
**Change:** Add after line 98 (after the error block):
```ts
if (!loading && !error && services.length === 1) return null;
if (!loading && !error && services.length === 0) {
  return (
    <Box sx={{ textAlign: "center", py: 6, px: 3 }}>
      <Typography sx={{ color: "#6C727F" }}>
        This provider has no bookable services configured.
      </Typography>
    </Box>
  );
}
```

#### M7: AuthOnboarding field types -- all fields are generic text inputs
**File:** `src/containers/checkout/steps/AuthOnboarding.tsx` lines 149-160
**Change:** Add field-type mapping inside the `.map()`:
- `date_of_birth` -> `type="date"` with `InputLabelProps={{ shrink: true }}`
- `phone_number` / `phone` -> `type="tel"` with `inputProps={{ inputMode: "tel" }}`
- `zip` -> `inputProps={{ inputMode: "numeric", autoComplete: "postal-code" }}`
- Address fields -> appropriate `autoComplete` attributes

#### M8: BookingConfirmation dead links (routes don't exist)
**File:** `src/containers/checkout/steps/BookingConfirmation.tsx` lines 181-210
**Change:** Comment out "Join your session" link (line 181-196) and "Manage booking" link (line 198-210) with `{/* Deferred to RGDEV-211 */}` comments.

#### M9: NoAvailabilityState is a conversion dead-end
**File:** `src/containers/checkout/NoAvailabilityState.tsx`
**Change:** Add "Explore Other Providers" button linking to `/help-with` after the "Go Back" button.

#### M10: Discount display missing required elements
**File:** `src/containers/checkout/steps/PaymentCapture.tsx`
**Change:** When `showDiscount` is true, add:
- Original (undiscounted) price with strikethrough showing 15% standard fee
- Fee percentage alongside dollar amount in the fee line
- "Referred via provider booking link" attribution caption after Total

#### M11: Touch targets below 44px on slot buttons
**File:** `src/containers/checkout/steps/SchedulePicker.tsx` slot buttons (lines 321-338)
**Change:** Add `minHeight: 44, minWidth: 44` to slot button `sx` prop.

## Implementation Order

Execute in this order to minimize cascading breakage:

1. **H3** -- Add `bookingLinkId` + export `setBookingLinkId` to checkoutSlice (unblocks H2, C3)
2. **M3** -- Add `clientTimezone` + export `setClientTimezone` to checkoutSlice (unblocks M4, C3)
3. **H1** -- Fix `BookingLinkResolution` interface in bookingLink.ts
4. **H4** -- Fix `ProviderProfile` interface in bookingLink.ts
5. **H5** -- Fix `ServiceOption` interface in bookingLink.ts (changes rate_id to string)
6. **H6** -- Fix `SlotOption` interface in bookingLink.ts (renames fields)
7. **C1** -- Fix `CreateSessionPayload` interface in bookingLink.ts
8. **C2** -- Fix `CreateSessionResponse` interface in bookingLink.ts
9. **H9** -- Add `HoldSlotResponse` type to bookingLink.ts
10. **H7** -- Fix `FeePreview` interface in bookingLink.ts
11. **H8** -- Fix `CompleteCheckoutResponse` interface in bookingLink.ts
12. **M1** -- Fix `CancellationPolicy` interface in bookingLink.ts
13. **M2** -- Add `notes` to `CompleteCheckoutPayload` in bookingLink.ts
14. **checkoutSlice cascading** -- Fix `rateId` type to `string | null`, fix `selectSlot` to use `slot_id`
15. **H2** -- Fix `[slug].tsx` SSR props + redirect handling + pass `bookingLinkId`
16. **C3** -- Fix `SchedulePicker.tsx` `handleSelectSlot` to use correct field names
17. **C4** -- Move hold timer from SchedulePicker to CheckoutWizard + add persistent countdown banner
18. **C6** -- Remove hardcoded Stripe key from PaymentCapture
19. **C7** -- Add 409/410 navigation in PaymentCapture catch block
20. **H7 cascading** -- Rewrite PaymentCapture fee breakdown to compute from Redux
21. **H10** -- Add TODO comment on PaymentMethod/PaymentIntent mismatch
22. **H4 cascading** -- Fix ProviderTrustCard + BookingConfirmation provider name references
23. **H5 cascading** -- Fix ServiceSelection `service.id` -> `service.rate_id`, `service.modality` -> `service.session_type`
24. **H6 cascading** -- Fix BookingConfirmation slot field references
25. **M3 cascading** -- Dispatch timezone in SchedulePicker, persist in AuthOnboarding, read in BookingConfirmation
26. **M4** -- Expand timezone dropdown list
27. **M5** -- Type selectors across all components
28. **M6** -- ServiceSelection single-service flash + zero-services
29. **M7** -- AuthOnboarding field type hints
30. **M8** -- Comment out dead links in BookingConfirmation
31. **M9** -- Add "Explore Other Providers" to NoAvailabilityState
32. **M10** -- Discount display improvements
33. **M11** -- Touch targets on slot buttons
34. **C5** -- Backend `hold_until` validation (separate commit)
35. **CREATE** -- `src/pages/api/ics.ts` (ICS download API route)
36. **CREATE** -- Checkout Mixpanel events in `src/mixPanelEvents/bookings.ts` (9 events)

## Backend Changes Required

### BE1: Hold expiry validation in CheckoutCompleteView (CRITICAL)
**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\views.py`
**View:** `CheckoutCompleteView.post()`
**Location:** After session retrieval, before `bl = session.booking_link`
**Change:** Add server-side check:
```python
if session.hold_until and session.hold_until < timezone.now():
    session.status = 'EXPIRED'
    session.save(update_fields=['status', 'modified_at'])
    return Response(
        {'error': 'Slot hold has expired. Please select a new time.'},
        status=status.HTTP_410_GONE,
    )
```
**Import:** Ensure `from django.utils import timezone` is present.

### BE2: Stripe PaymentIntent creation (Known Gap -- separate ticket)
The current backend stores the `stripe_payment_intent_id` value but does not create a Stripe PaymentIntent or charge. The frontend sends a PaymentMethod ID in this field. This needs a dedicated implementation:
- Either backend creates PI from PM in `CheckoutCompleteView`
- Or frontend uses a new `POST /checkout/payment-intent/` endpoint for client-side confirmation

**Do NOT fix in this PR.** File as a follow-up ticket.

## Files to Create

### CREATE1: `src/pages/api/ics.ts`
Next.js API route generating ICS calendar files.
- Input: query params `title`, `start` (ISO), `end` (ISO), `description`
- Output: `text/calendar` content type with VCALENDAR/VEVENT
- The frontend has all appointment data in Redux, so pass via query params rather than requiring backend auth
- Update `BookingConfirmation.tsx` ICS URL to pass these params
- Referenced by `BookingConfirmation.tsx` line 72

### CREATE2: Checkout Mixpanel events in `src/mixPanelEvents/bookings.ts`
Add 9 event functions following existing patterns in the file:
- `checkout_started(slug, provider_id)`
- `checkout_service_selected(slug, rate_id, service_name)`
- `checkout_slot_selected(slug, slot_id, start_time)`
- `checkout_auth_required(slug)`
- `checkout_auth_completed(slug)`
- `checkout_payment_started(slug, payment_type)`
- `checkout_completed(slug, appointment_id)`
- `checkout_abandoned(slug, step)`
- `checkout_slot_expired(slug, session_id)`

Wire into step components after creation.

## Verification Steps

| Fix | Verification |
|---|---|
| C1+C2+C3 | `createSession()` returns 201 with valid `id` and `hold_until`. `holdSlot()` succeeds. Session ID propagates to Redux. |
| C4 | Navigate to step 4 or 5 -- countdown banner visible. Wait for expiry -- `SessionExpiredState` renders. `releaseSlot` fires in network tab. |
| C5 | Manually expire a hold in the DB, then attempt `POST /checkout/complete/` -- expect 410 response. |
| C6 | Remove `NEXT_PUBLIC_STRIPE_PUBLISH_KEY` from env -- Stripe Elements should not load, toast error should appear on pay click. No test key in source. |
| C7 | Force a 409 from backend -- user navigates back to step 3 with toast message. Force a 410 -- same behavior. |
| H1+H2 | Load `/book/[slug]` -- OG meta tags populated from `og_title`/`og_description`/`og_image`. Renamed slug returns 301 redirect. |
| H3 | `bookingLinkId` is in Redux state after page load. |
| H4 | Provider trust card displays `first_name last_name` and `photo_url`. |
| H5 | Service cards display `session_type` instead of `modality`. Rate IDs are UUID strings. |
| H6 | Slots group by date derived from `start_time`. Slot buttons use `slot_id` as key. |
| H7 | Fee breakdown shows computed values from `selectedService.price` + `fee_percent`. No `undefined` in price display. |
| H8 | `result.appointment_id` works after checkout complete. |
| M3 | Change timezone in SchedulePicker, advance to step 4, trigger auth redirect, return -- timezone preserved. Confirmation uses selected timezone. |
| M6 | Single-service provider: no flash of service card visible. |
| M8 | No "Join session" or "Manage booking" buttons on confirmation. |
| ICS | Click "Download .ics" on confirmation -- valid ICS file downloads and imports into calendar apps. |
| Mixpanel | Check browser console / Mixpanel debugger for all 9 checkout events firing at correct steps. |

## Summary Table

| Category | Count |
|---|---|
| CRITICAL fixes | 7 (C1-C7) |
| HIGH fixes | 10 (H1-H10) |
| MEDIUM fixes | 11 (M1-M11) |
| Backend changes | 1 required (BE1), 1 deferred (BE2) |
| Files to create | 2 (ICS route, Mixpanel events) |
| Type interfaces to rewrite | 10 of 12 in bookingLink.ts |
| Total files modified | ~12 frontend + 1 backend |
