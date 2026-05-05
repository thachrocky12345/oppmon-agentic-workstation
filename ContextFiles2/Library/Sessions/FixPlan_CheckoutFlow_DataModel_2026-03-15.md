# Fix Plan: RGDEV-209 Contained Checkout Flow — Data Model Fixes

**Source audit:** `Audit_CheckoutFlow_DataModel_Results_2026-03-15.md`
**Plan:** `Plan_RGDEV-209_CheckoutFlow_2026-03-15.md`
**Worktree:** `RG-Frontend/.claude/worktrees/agent-a97ae695`
**Date:** 2026-03-15

---

## Implementation Status Update

The audit was conducted mid-flight. Since then the implementer has created additional files. Current status:

| File | Status |
|---|---|
| `src/restapis/bookingLink.ts` | EXISTS — needs fixes |
| `src/store/slices/checkoutSlice.ts` | EXISTS — needs fixes |
| `src/pages/book/[slug].tsx` | EXISTS — needs fixes |
| `src/containers/checkout/CheckoutWizard.tsx` | EXISTS (126 lines) |
| `src/containers/checkout/InvalidLinkState.tsx` | EXISTS |
| `src/containers/checkout/NoAvailabilityState.tsx` | EXISTS |
| `src/containers/checkout/SessionExpiredState.tsx` | EXISTS |
| `src/containers/checkout/steps/ProviderTrustCard.tsx` | EXISTS — needs minor fix |
| `src/containers/checkout/steps/ServiceSelection.tsx` | EXISTS — needs minor fix |
| `src/containers/checkout/steps/SchedulePicker.tsx` | EXISTS — needs fixes |
| `src/containers/checkout/steps/AuthOnboarding.tsx` | EXISTS (186 lines) |
| `src/containers/checkout/steps/PaymentCapture.tsx` | EXISTS — needs fixes |
| `src/containers/checkout/steps/BookingConfirmation.tsx` | EXISTS — needs minor fix |
| `src/pages/api/ics.ts` | **NOT IMPLEMENTED** — create from scratch |
| `src/mixPanelEvents/bookings.ts` (checkout events) | **NOT IMPLEMENTED** — add 9 events |

---

## FIX 1 — BLOCKER: `CreateSessionPayload` sends wrong fields

**File:** `src/restapis/bookingLink.ts` lines 42-46
**Severity:** BLOCKER — every session creation will 400

**Backend expects** (`CheckoutSessionCreateSerializer`):
- `booking_link_id` (UUID string) — REQUIRED
- `rate_id` (UUID string) — optional
- `client_timezone` (string) — optional, default `''`
- `client_locale` (string) — optional, default `''`
- `client_language` (string) — optional, default `''`

**Frontend currently sends:**
- `slug` (string) — NOT accepted by backend
- `rate_id` (number) — wrong type, backend expects UUID string
- `slot_id` (number) — NOT accepted by backend

### Change

```
OLD (lines 42-46):
export interface CreateSessionPayload {
  slug: string;
  rate_id: number;
  slot_id: number;
}

NEW:
export interface CreateSessionPayload {
  booking_link_id: string;
  rate_id?: string;
  client_timezone?: string;
  client_locale?: string;
  client_language?: string;
}
```

### Cascading consumer fix — `SchedulePicker.tsx` line 150-154

The `SchedulePicker` calls `createSession()` with the old fields. It needs `booking_link_id` which is a UUID, not the slug. This UUID comes from the resolve endpoint response.

```
OLD (SchedulePicker.tsx lines 150-154):
const session = await createSession({
  slug,
  rate_id: rateId,
  slot_id: slot.id,
});

NEW:
const session = await createSession({
  booking_link_id: checkout.bookingLinkId,
  rate_id: checkout.selectedService?.rate_id,
  client_timezone: timezone,
});
```

This requires `bookingLinkId` to be stored in Redux (see FIX 7 below).

---

## FIX 2 — BLOCKER: `CreateSessionResponse` field name mismatch

**File:** `src/restapis/bookingLink.ts` lines 48-51
**Severity:** BLOCKER — `session_id` will be `undefined`, breaking all downstream calls

**Backend returns** (`CheckoutSessionResponseSerializer` fields):
`id`, `status`, `hold_until`, `client_timezone`, `client_locale`, `client_language`, `payment_type`, `fee_percent`, `created_at`, `modified_at`

Key mismatch: backend returns **`id`**, frontend expects **`session_id`**.

### Change

```
OLD (lines 48-51):
export interface CreateSessionResponse {
  session_id: string;
  hold_until: string;
}

NEW:
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

### Cascading consumer fix — `SchedulePicker.tsx` lines 155-165

```
OLD:
await holdSlot({
  session_id: session.session_id,
  slot_id: slot.id,
});

dispatch(selectSlot(slot));
dispatch(
  setSession({
    sessionId: session.session_id,
    holdUntil: session.hold_until,
  })
);

NEW:
await holdSlot({
  session_id: session.id,
  slot_id: slot.id,
});

dispatch(selectSlot(slot));
dispatch(
  setSession({
    sessionId: session.id,
    holdUntil: session.hold_until,
  })
);
```

---

## FIX 3 — HIGH: `BookingLinkResolution` type missing fields

**File:** `src/restapis/bookingLink.ts` lines 5-11
**Severity:** HIGH — SSR page (`[slug].tsx`) reads `provider_name`, `provider_title`, `provider_photo` but backend returns `provider_name` (only conditionally), `og_title`, `og_description`, `og_image`, `og_url`, `booking_link_id`, `provider_slug`, `redirect_to`, `robots`, `twitter_card`

**Backend returns** (`ResolveBookingLinkSerializer`):
`booking_link_id` (UUID|null), `provider_slug`, `is_active`, `redirect_to` (string|null), `og_title`, `og_description`, `og_image` (string|null), `og_url`, `provider_name` (optional), `provider_photo_url` (optional), `robots`, `twitter_card`

### Change

```
OLD (lines 5-11):
export interface BookingLinkResolution {
  is_active: boolean;
  provider_name: string;
  provider_title: string;
  provider_photo: string | null;
  slug: string;
}

NEW:
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

### Cascading consumer fix — `[slug].tsx` lines 81-88

The SSR page reads `data.provider_name`, `data.provider_title`, `data.provider_photo`. The backend does not return `provider_title` — use `og_title` or `og_description` instead. `provider_photo` should be `provider_photo_url`.

```
OLD ([slug].tsx lines 81-88):
return {
  props: {
    slug,
    isActive: data.is_active,
    providerName: data.provider_name,
    providerTitle: data.provider_title,
    providerPhoto: data.provider_photo || null,
    messages,
  },
};

NEW:
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
    redirectTo: data.redirect_to || null,
    messages,
  },
};
```

Also update `BookPageProps` interface to add `bookingLinkId`, `ogTitle`, `ogImage`, `redirectTo` and pass `bookingLinkId` to `CheckoutWizard`.

Also handle `redirect_to` — if non-null, the page should redirect (the old slug was renamed):
```ts
// In getServerSideProps, after resolving:
if (data.redirect_to) {
  return { redirect: { destination: data.redirect_to, permanent: true } };
}
```

---

## FIX 4 — HIGH: `FeePreview` type fabricates nonexistent fields

**File:** `src/restapis/bookingLink.ts` lines 67-74
**Severity:** HIGH — `session_price`, `fee_amount`, `total`, `currency` will all be `undefined`

**Backend returns** (`CheckoutFeePreviewView`, lines 822-826 of views.py):
`fee_percent` (string|null), `fee_applies` (bool), `is_returning_client` (bool)

That's it. No price computation on the server.

### Change

```
OLD (lines 67-74):
export interface FeePreview {
  fee_percent: string;
  fee_applies: boolean;
  session_price: string;
  fee_amount: string;
  total: string;
  currency: string;
}

NEW:
export interface FeePreview {
  fee_percent: string | null;
  fee_applies: boolean;
  is_returning_client: boolean;
}
```

### Cascading consumer fix — `PaymentCapture.tsx`

The entire price display in `PaymentForm` references `feePreview.session_price`, `feePreview.fee_amount`, `feePreview.total`, `feePreview.currency` (lines 130-186). These must be computed from Redux `selectedService.price` + `feePreview.fee_percent`.

Replace the fee breakdown JSX (lines 119-188) to compute from:
- `checkout.selectedService.price` — the session rate
- `checkout.selectedService.currency` — currency code
- `feePreview.fee_percent` — decimal string like `"0.15"` or null
- `feePreview.fee_applies` — whether fee applies

Compute:
```ts
const sessionPrice = parseFloat(checkout.selectedService?.price || '0');
const feePercent = feePreview?.fee_percent ? parseFloat(feePreview.fee_percent) : 0;
const feeAmount = feePreview?.fee_applies ? sessionPrice * feePercent : 0;
const total = sessionPrice + feeAmount;
const currency = checkout.selectedService?.currency || 'USD';
```

Also fix the button label `Pay ${currencySymbol}${feePreview.total}` to use computed `total`.

---

## FIX 5 — HIGH: `CompleteCheckoutResponse` does not match backend

**File:** `src/restapis/bookingLink.ts` lines 88-96
**Severity:** HIGH — most fields will be `undefined`

**Backend returns** (`CheckoutCompleteResponseSerializer`):
`session_id` (UUID), `appointment_id` (int), `status` (string), `attribution_id` (UUID|null)

### Change

```
OLD (lines 88-96):
export interface CompleteCheckoutResponse {
  appointment_id: number;
  session_date: string;
  session_start: string;
  session_end: string;
  provider_name: string;
  modality: string;
  join_url: string;
}

NEW:
export interface CompleteCheckoutResponse {
  session_id: string;
  appointment_id: number;
  status: string;
  attribution_id: string | null;
}
```

Consumer impact: `PaymentCapture.tsx` line 84 uses `result.appointment_id` — this is correct. No other fields from this response are used in the current code.

---

## FIX 6 — HIGH: `CompleteCheckoutPayload` missing `notes` field

**File:** `src/restapis/bookingLink.ts` lines 81-86
**Severity:** LOW — `notes` has `default=''` so omission is safe, but should be in the type

### Change

```
OLD (lines 81-86):
export interface CompleteCheckoutPayload {
  session_id: string;
  payment_type: "stripe" | "paypal" | "free";
  stripe_payment_intent_id?: string;
  paypal_order_id?: string;
}

NEW:
export interface CompleteCheckoutPayload {
  session_id: string;
  payment_type: "stripe" | "paypal" | "free";
  stripe_payment_intent_id?: string;
  paypal_order_id?: string;
  notes?: string;
}
```

---

## FIX 7 — HIGH: `ProviderProfile` type does not match backend

**File:** `src/restapis/bookingLink.ts` lines 13-23
**Severity:** HIGH — field names don't match

**Backend returns** (`ProviderPublicProfileSerializer`):
`provider_id` (UUID string), `first_name`, `last_name`, `photo_url` (string|null), `title`, `bio`, `slug`

### Change

```
OLD (lines 13-23):
export interface ProviderProfile {
  id: number;
  name: string;
  photo: string | null;
  title: string;
  bio: string;
  slug: string;
  rating: number | null;
  review_count: number;
  verified: boolean;
}

NEW:
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

### Cascading consumer fix — `BookingConfirmation.tsx` line 41

```
OLD:
const providerName = providerProfile?.name || "your provider";

NEW:
const providerName = providerProfile
  ? `${providerProfile.first_name} ${providerProfile.last_name}`.trim()
  : "your provider";
```

Also update any other references to `providerProfile.photo` → `providerProfile.photo_url`, `providerProfile.id` → `providerProfile.provider_id`.

---

## FIX 8 — HIGH: `ServiceOption` type field mismatches

**File:** `src/restapis/bookingLink.ts` lines 25-33
**Severity:** HIGH — `rate_id` is `number` but backend returns UUID string; `id` and `modality` don't exist in backend response

**Backend returns** (`ServiceOptionSerializer`):
`rate_id` (UUID string), `name`, `duration_minutes` (int), `price` (decimal string), `currency`, `session_type`, `is_in_person` (bool)

### Change

```
OLD (lines 25-33):
export interface ServiceOption {
  id: number;
  rate_id: number;
  name: string;
  duration_minutes: number;
  price: string;
  currency: string;
  modality: string;
}

NEW:
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

### Cascading consumer fixes:
- `checkoutSlice.ts` line 68: `state.rateId = action.payload.rate_id` — now a string, so `rateId` type must change to `string | null` (see FIX 9)
- `ServiceSelection.tsx`: any reference to `service.id` must use `service.rate_id`; `service.modality` must use `service.session_type`

---

## FIX 9 — MEDIUM: `rateId` type in CheckoutState

**File:** `src/store/slices/checkoutSlice.ts` line 12
**Severity:** MEDIUM — cascades from FIX 8

### Change

```
OLD (line 12):
rateId: number | null;

NEW:
rateId: string | null;
```

---

## FIX 10 — HIGH: `SlotOption` type field mismatches

**File:** `src/restapis/bookingLink.ts` lines 35-40
**Severity:** HIGH — backend returns `slot_id`, `start_time`, `end_time`, `is_available`; frontend expects `id`, `start`, `end`, `date`

**Backend returns** (`AvailableSlotSerializer`):
`slot_id` (int), `start_time` (datetime), `end_time` (datetime), `is_available` (bool)

### Change

```
OLD (lines 35-40):
export interface SlotOption {
  id: number;
  start: string;
  end: string;
  date: string;
}

NEW:
export interface SlotOption {
  slot_id: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
}
```

### Cascading consumer fixes:

**`checkoutSlice.ts` line 72:**
```
OLD: state.slotId = action.payload.id;
NEW: state.slotId = action.payload.slot_id;
```

**`SchedulePicker.tsx` — `groupByDate` function (line 36-44):**
The function groups by `slot.date` which no longer exists. Derive date from `slot.start_time`:
```ts
const dateKey = slot.start_time.split('T')[0];
```

**`SchedulePicker.tsx` — slot button `key` and `onClick` (lines 320-338):**
```
OLD: key={slot.id}, onClick={() => handleSelectSlot(slot)}
NEW: key={slot.slot_id}, onClick={() => handleSelectSlot(slot)}
```

**`SchedulePicker.tsx` — `formatTime` usage (line 337):**
```
OLD: {formatTime(slot.start, timezone)}
NEW: {formatTime(slot.start_time, timezone)}
```

**`SchedulePicker.tsx` — `handleSelectSlot` holdSlot call (line 157):**
```
OLD: slot_id: slot.id,
NEW: slot_id: slot.slot_id,
```

**`BookingConfirmation.tsx` lines 43-44:**
```
OLD:
const sessionStart = selectedSlot?.start || "";
const sessionEnd = selectedSlot?.end || "";

NEW:
const sessionStart = selectedSlot?.start_time || "";
const sessionEnd = selectedSlot?.end_time || "";
```

---

## FIX 11 — HIGH: `CancellationPolicy` type field mismatches

**File:** `src/restapis/bookingLink.ts` lines 76-79
**Severity:** MEDIUM — field names wrong

**Backend returns** (`CancellationPolicySerializer`):
`provider_id` (UUID), `cancellation_window_hours` (int), `cancellation_fee_percent` (decimal|null), `policy_text`

### Change

```
OLD (lines 76-79):
export interface CancellationPolicy {
  policy_text: string;
  refund_window_hours: number;
}

NEW:
export interface CancellationPolicy {
  provider_id: string;
  cancellation_window_hours: number;
  cancellation_fee_percent: string | null;
  policy_text: string;
}
```

Consumer impact: `PaymentCapture.tsx` only reads `policy.policy_text` (line 207) — that field name is correct. No breakage, but the type should be complete.

---

## FIX 12 — MEDIUM: `holdSlot()` return type untyped

**File:** `src/restapis/bookingLink.ts` line 142
**Severity:** MEDIUM

**Backend returns** (`SlotHoldResponseSerializer`):
`session_id` (UUID), `slot_id` (int), `hold_until` (datetime), `status` (string)

### Change

```
OLD (line 142):
export async function holdSlot(data: HoldSlotPayload) {

NEW:
export interface HoldSlotResponse {
  session_id: string;
  slot_id: number;
  hold_until: string;
  status: string;
}

export async function holdSlot(data: HoldSlotPayload): Promise<HoldSlotResponse> {
```

### Cascading consumer fix — `SchedulePicker.tsx`

Use `holdSlot` response for `hold_until` instead of `createSession` response (the hold endpoint returns the definitive hold expiry):

```ts
const holdResult = await holdSlot({
  session_id: session.id,
  slot_id: slot.slot_id,
});

dispatch(setSession({
  sessionId: session.id,
  holdUntil: holdResult.hold_until,
}));
```

---

## FIX 13 — MEDIUM: `[slug].tsx` SSR calls `resolveBookingLink` with `api` import issue

**File:** `src/pages/book/[slug].tsx` line 5
**Severity:** MEDIUM — SSR runs on the server; the `resolveBookingLink` function uses `apiWithoutAuth` which is a browser-configured Axios instance with `baseURL` from env vars

The resolve function uses `apiWithoutAuth.get(...)` which sets `baseURL` from `NEXT_APP_BACKEND_BASE_URL`. In SSR context this should work if the env var is set, but should use the internal Docker network URL. No code change needed if env var is correctly configured — but verify this during testing.

**No code change required** — document as test verification item.

---

## FIX 14 — MEDIUM: `state: any` in useSelector calls

**Files:**
- `SchedulePicker.tsx` line 77: `(state: any) => state.checkout`
- `PaymentCapture.tsx` line 261: `(state: any) => state.checkout`
- `BookingConfirmation.tsx` line 37: `(state: any) => state.checkout`

### Change (all three files)

Import `RootState` from the store and use it:
```ts
// If RootState type exists in src/store/index.ts or similar:
import type { RootState } from "../../../store";

// Replace:
const checkout: CheckoutState = useSelector((state: any) => state.checkout);
// With:
const checkout = useSelector((state: RootState) => state.checkout);
```

If no `RootState` type exists, create it in the store file or use inline typing:
```ts
const checkout = useSelector((state: { checkout: CheckoutState }) => state.checkout);
```

---

## FIX 15 — MEDIUM: `ProviderTrustCard.tsx` sessionStorage key convention

**File:** `src/containers/checkout/steps/ProviderTrustCard.tsx` line 54
**Severity:** LOW — functional but inconsistent with existing pattern

```
OLD: `click_tracked_${slug}`
NEW: `rg_track_click_${slug}`
```

---

## FIX 16 — MEDIUM: Add `bookingLinkId` to Redux state

**File:** `src/store/slices/checkoutSlice.ts`
**Severity:** HIGH — required by FIX 1 (createSession needs `booking_link_id`)

The `booking_link_id` UUID must be stored in Redux so `SchedulePicker` can pass it to `createSession()`. It comes from the resolve endpoint response.

### Change in `checkoutSlice.ts`

Add to `CheckoutState`:
```ts
bookingLinkId: string | null;
```

Add to `initialState`:
```ts
bookingLinkId: null,
```

Add action:
```ts
setBookingLinkId(state, action: PayloadAction<string>) {
  state.bookingLinkId = action.payload;
},
```

Export the action.

### Source of the value

In `[slug].tsx`, pass `bookingLinkId` as a prop to `CheckoutWizard`. In `CheckoutWizard`, dispatch `setBookingLinkId(bookingLinkId)` on mount.

---

## FILES TO CREATE FROM SCRATCH

### 1. `src/pages/api/ics.ts`
- Next.js API route that generates an ICS file
- Input: `appointmentId` query param
- Output: `text/calendar` content-type with VCALENDAR/VEVENT
- Needs to fetch appointment details (date, time, duration, provider name)
- Referenced by `BookingConfirmation.tsx` line 72: `/api/ics?appointmentId=${appointmentId}`

### 2. Checkout Mixpanel events in `src/mixPanelEvents/bookings.ts`
Add 9 event functions (do not modify existing generic booking events):
- `checkout_started(slug: string, provider_id: string)`
- `checkout_service_selected(slug: string, rate_id: string, service_name: string)`
- `checkout_slot_selected(slug: string, slot_id: number, start_time: string)`
- `checkout_auth_required(slug: string)`
- `checkout_auth_completed(slug: string)`
- `checkout_payment_started(slug: string, payment_type: string)`
- `checkout_completed(slug: string, appointment_id: number)`
- `checkout_abandoned(slug: string, step: number)`
- `checkout_slot_expired(slug: string, session_id: string)`

Follow existing pattern in the file (import `mixpanel`, call `mixpanel.track()`).

---

## EXECUTION ORDER

1. **FIX 3** — `BookingLinkResolution` type (unblocks SSR)
2. **FIX 7** — `ProviderProfile` type
3. **FIX 8** — `ServiceOption` type (changes `rate_id` to string)
4. **FIX 10** — `SlotOption` type (changes field names)
5. **FIX 9** — `rateId` type in CheckoutState (depends on FIX 8)
6. **FIX 16** — Add `bookingLinkId` to Redux (required by FIX 1)
7. **FIX 1** — `CreateSessionPayload` (depends on FIX 16)
8. **FIX 2** — `CreateSessionResponse` field name
9. **FIX 12** — `holdSlot()` return type
10. **FIX 4** — `FeePreview` type
11. **FIX 5** — `CompleteCheckoutResponse` type
12. **FIX 6** — `CompleteCheckoutPayload` add `notes`
13. **FIX 11** — `CancellationPolicy` type
14. **FIX 14** — `state: any` → typed selectors
15. **FIX 15** — sessionStorage key naming
16. **FIX 13** — SSR env var verification (test only)
17. **CREATE** — `src/pages/api/ics.ts`
18. **CREATE** — Checkout Mixpanel events

---

## SUMMARY

| Category | Count |
|---|---|
| BLOCKER fixes | 2 (FIX 1, FIX 2) |
| HIGH fixes | 7 (FIX 3, 4, 5, 7, 8, 10, 16) |
| MEDIUM fixes | 5 (FIX 6, 9, 11, 12, 14) |
| LOW fixes | 1 (FIX 15) |
| Files to create | 2 (ICS route, Mixpanel events) |
| Total type interfaces to rewrite | 10 of 12 |

Every interface in `bookingLink.ts` except `HoldSlotPayload` and `OnboardingStatus` has at least one field name or type mismatch against the backend serializers. The `holdSlot` payload (`session_id` UUID + `slot_id` int) is correct. The `OnboardingStatus` (`onboarding_complete` bool + `missing_fields` string[]) matches `OnboardingStatusSerializer`.
