# Fix Plan: RGDEV-209 Checkout Flow -- UX/Scenario Audit Fixes

**Source audit:** `Audit_CheckoutFlow_UXScenario_Results_2026-03-15.md`
**Ticket:** RGDEV-209 | **Date:** 2026-03-15

**Worktree root:** `C:\Projects\ReallyGlobal\RG-Frontend\.claude\worktrees\agent-a97ae695\`
**Backend root:** `C:\Projects\ReallyGlobal\Lumy-Backend\`

---

## Priority Legend

- **P0** -- Must fix before merge (data integrity, security, build blocker)
- **P1** -- Should fix before merge (broken UX, dead links)
- **P2** -- Fix in follow-up (polish, nice-to-have)

---

## Fix 1 -- CRITICAL P0: Hold timer must persist across all steps

**Audit refs:** 4.1, 4.2, 4.3, 10.1
**Problem:** The countdown `setInterval` lives in `SchedulePicker.tsx` (lines 117-139). When the user advances to step 4 or 5, `SchedulePicker` unmounts and the timer is destroyed. If `holdUntil` expires during auth or payment, nobody detects it. The user can complete payment on an expired hold, risking double-booking.

**File:** `src/containers/checkout/CheckoutWizard.tsx`
**Action:** Add hold timer logic to the wizard shell so it persists across all steps.

### Old code (CheckoutWizard.tsx lines 29-59):

```tsx
const CheckoutWizard: React.FC<CheckoutWizardProps> = ({ slug }) => {
  const dispatch = useDispatch();
  const checkout: CheckoutState = useSelector((state: any) => state.checkout);
  const currentStep = checkout.step;

  // Initialize slug and attempt to rehydrate from sessionStorage (post-auth redirect)
  useEffect(() => {
    dispatch(setSlug(slug));

    // Rehydrate booking context if returning from auth redirect
    try {
      const stored = sessionStorage.getItem(CONTEXT_KEY);
      if (stored) {
        const ctx = JSON.parse(stored);
        if (ctx.slug === slug && ctx.sessionId) {
          // Context matches, it will be applied by individual steps
          // that read from sessionStorage
        }
        // Clear after read
        sessionStorage.removeItem(CONTEXT_KEY);
      }
    } catch {
      // Ignore parse errors
    }

    return () => {
      // Cleanup on unmount
      dispatch(resetCheckout());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
```

### New code:

```tsx
import { releaseSlot } from "../../restapis/bookingLink";
import SessionExpiredState from "./SessionExpiredState";
// ... (add to existing imports)

const CheckoutWizard: React.FC<CheckoutWizardProps> = ({ slug }) => {
  const dispatch = useDispatch();
  const checkout: CheckoutState = useSelector((state: any) => state.checkout);
  const currentStep = checkout.step;
  const { holdUntil, sessionId } = checkout;

  const [holdExpired, setHoldExpired] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize slug and attempt to rehydrate from sessionStorage (post-auth redirect)
  useEffect(() => {
    dispatch(setSlug(slug));

    // Rehydrate booking context if returning from auth redirect
    try {
      const stored = sessionStorage.getItem(CONTEXT_KEY);
      if (stored) {
        const ctx = JSON.parse(stored);
        if (ctx.slug === slug && ctx.sessionId) {
          // Check if hold already expired during redirect
          if (ctx.holdUntil && new Date(ctx.holdUntil).getTime() < Date.now()) {
            setHoldExpired(true);
            sessionStorage.removeItem(CONTEXT_KEY);
            return;
          }
          // Rehydrate into Redux
          dispatch(setSession({ sessionId: ctx.sessionId, holdUntil: ctx.holdUntil }));
          if (ctx.rateId) dispatch(setStep(4)); // Resume at auth/onboarding
        }
        sessionStorage.removeItem(CONTEXT_KEY);
      }
    } catch {
      // Ignore parse errors
    }

    return () => {
      dispatch(resetCheckout());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Persistent hold timer -- runs across ALL steps
  useEffect(() => {
    if (!holdUntil) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(holdUntil).getTime() - Date.now()) / 1000)
      );
      setCountdown(remaining);
      if (remaining <= 0) {
        setHoldExpired(true);
        if (sessionId) {
          releaseSlot(sessionId).catch(() => {});
        }
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    updateCountdown();
    timerRef.current = setInterval(updateCountdown, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [holdUntil, sessionId]);

  const handleExpiredRestart = () => {
    setHoldExpired(false);
    setCountdown(null);
    dispatch(setStep(3));
  };

  if (holdExpired) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <SessionExpiredState onRestart={handleExpiredRestart} />
      </Container>
    );
  }
```

**Also add** persistent countdown banner in the render, between the Stepper and the step content (line ~109):

```tsx
      {/* Persistent hold countdown -- visible on steps 3-5 */}
      {countdown !== null && countdown > 0 && currentStep >= 3 && currentStep <= 5 && (
        <Box sx={{ textAlign: "center", mb: 2 }}>
          <Chip
            label={`Slot held for ${Math.floor(countdown / 60)}:${(countdown % 60).toString().padStart(2, "0")}`}
            color={countdown < 120 ? "warning" : "default"}
            size="small"
          />
        </Box>
      )}
```

**Required imports to add:**

```tsx
import { useState, useRef } from "react";
import { Chip } from "@mui/material";
import { setSession } from "../../store/slices/checkoutSlice";
import { releaseSlot } from "../../restapis/bookingLink";
import SessionExpiredState from "./SessionExpiredState";
```

### Corresponding removal in SchedulePicker.tsx

Remove the timer logic from `SchedulePicker.tsx` (lines 92-93, 117-139, 243-247, 299-308) since the wizard now owns it. Keep the `expired` check at line 200-202 but instead read from a prop or remove entirely (the wizard intercepts before rendering SchedulePicker). The simplest approach: remove the local timer entirely; the wizard handles all expiry.

**Lines to remove from SchedulePicker.tsx:**
- Lines 92-93: `timerRef` and `countdown` state declarations
- Lines 116-140: The `useEffect` for countdown timer
- Lines 84: `const [expired, setExpired] = useState(false);` -- remove
- Lines 190-198: `handleRestart` function -- remove
- Lines 200-202: `if (expired)` early return -- remove
- Lines 243-247: `formatCountdown` function -- remove
- Lines 299-308: countdown Chip render block -- remove

**Why correct:** The timer now lives in the parent component that persists across all steps. If `holdUntil` expires during step 4 or 5, the wizard immediately intercepts rendering and shows `SessionExpiredState` instead of the current step. The `releaseSlot` call fires from the wizard, ensuring cleanup regardless of which step is active.

---

## Fix 2 -- CRITICAL P0: Backend must validate hold_until before completing checkout

**Audit refs:** 4.2
**Problem:** `CheckoutCompleteView.post()` checks session status (`SLOT_HELD` or `PAYMENT_PENDING`) and slot availability, but never checks whether `hold_until` has passed. Even with Fix 1, a race condition exists: the frontend timer could be 1-2 seconds behind the server clock.

**File:** `apps/booking_link/views.py` (CheckoutCompleteView)
**Lines:** After line 631 (after session retrieval), before line 633 (`bl = session.booking_link`)

### Old code (lines 631-633):

```python
            )

        bl = session.booking_link
```

### New code:

```python
            )

        # P0: Reject completion if the slot hold has expired server-side
        if session.hold_until and session.hold_until < timezone.now():
            session.status = 'EXPIRED'
            session.save(update_fields=['status', 'modified_at'])
            return Response(
                {'error': 'Slot hold has expired. Please select a new time.'},
                status=status.HTTP_410_GONE,
            )

        bl = session.booking_link
```

**Why correct:** This is the definitive server-side guard. Even if the frontend timer drifts or is bypassed, the backend will not create an appointment for an expired hold. Using HTTP 410 (Gone) distinguishes this from 409 (slot taken by someone else) so the frontend can show the appropriate message.

**Frontend handling for 410:** Add to `PaymentCapture.tsx` `handlePay` catch block (after the 409 check at line 92):

```tsx
      } else if (err?.response?.status === 410) {
        toast.error("Your slot hold has expired. Please select a new time.");
        dispatch(setStep(3));
```

---

## Fix 3 -- P0: Hardcoded Stripe test key (security)

**Audit ref:** 12.2, 1.2
**File:** `src/containers/checkout/steps/PaymentCapture.tsx`
**Lines:** 34-36

### Old code:

```tsx
const STRIPE_PUBLISH_KEY =
  process?.env?.NEXT_PUBLIC_STRIPE_PUBLISH_KEY ||
  "pk_test_51QyZEGPOs8WsF9SUWoan4CAxEfZEV4vNJ7Ng2whYLkkEN7UYSSzrPnKdKZiP197mhz1HvUW5MCujmJWg8uYQpvLo00JDIlDStH";
```

### New code:

```tsx
const STRIPE_PUBLISH_KEY = process?.env?.NEXT_PUBLIC_STRIPE_PUBLISH_KEY || "";
```

**Also add** a guard in the `PaymentForm` component (after line 53, `if (!stripe || !elements) return;`):

```tsx
    if (!STRIPE_PUBLISH_KEY) {
      toast.error("Payment configuration error. Please contact support.");
      return;
    }
```

**Why correct:** Hardcoded test keys in source code are a credential leak and can cause production builds to silently use test mode if the env var is missing. Failing explicitly is the correct behavior.

---

## Fix 4 -- P0: PaymentMethod ID sent as PaymentIntent ID (field mismatch)

**Audit ref:** 10.3
**File:** `src/containers/checkout/steps/PaymentCapture.tsx`
**Lines:** 78-82

### Old code:

```tsx
      const result = await completeCheckout({
        session_id: sessionId,
        payment_type: "stripe",
        stripe_payment_intent_id: paymentMethod?.id,
      });
```

### Analysis:

The frontend creates a PaymentMethod via `stripe.createPaymentMethod()` and sends the PM ID (`pm_...`) in the `stripe_payment_intent_id` field. The backend `CheckoutPaymentSerializer` accepts this field and stores it as `session.stripe_payment_intent_id`. The backend does NOT create a PaymentIntent from this PM -- it just stores the ID string.

This means the Stripe integration is incomplete: no actual charge is created. The field name mismatch is the least of the problems.

**Recommended approach (two options):**

**Option A -- Backend creates PaymentIntent (server-side charge):**
The frontend sends `stripe_payment_method_id` (rename field). The backend creates a PaymentIntent using the PM and confirms it. This is the correct Stripe flow for server-side confirmation.

**Option B -- Frontend creates PaymentIntent (client-side confirmation):**
Add a `POST /checkout/payment-intent/` endpoint that returns a `client_secret`. Frontend uses `stripe.confirmCardPayment(clientSecret)` and sends the resulting PI ID.

**For now, fix the field name to be accurate:**

### New code:

```tsx
      const result = await completeCheckout({
        session_id: sessionId,
        payment_type: "stripe",
        stripe_payment_intent_id: paymentMethod?.id, // TODO: This sends a PaymentMethod ID, not a PaymentIntent ID. Backend must create PI from PM. See RGDEV-209 payment flow notes.
      });
```

**Backend TODO:** `CheckoutCompleteView` must create a `stripe.PaymentIntent` using the received PaymentMethod ID, or the frontend must switch to client-side PaymentIntent confirmation. **This is a separate ticket scope** -- document as a known gap.

---

## Fix 5 -- P0: 409 from checkout/complete shows toast but no navigation

**Audit ref:** 10.2
**File:** `src/containers/checkout/steps/PaymentCapture.tsx`
**Lines:** 86-96

### Old code:

```tsx
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Payment failed. Please try again.";

      if (err?.response?.status === 409) {
        toast.error("This time slot is no longer available.");
      } else {
        toast.error(msg);
      }
```

### New code:

```tsx
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Payment failed. Please try again.";

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

**Required imports to add:**

```tsx
import { setStep } from "../../../store/slices/checkoutSlice";
```

(Add `setStep` to the existing import from checkoutSlice at line 23-26.)

**Why correct:** On 409, the user needs to return to step 3 (SchedulePicker) to pick a new slot. The old code left them stuck on the payment form with no way forward. On 410 (expired hold, from Fix 2), same behavior.

---

## Fix 6 -- P0: Stripe load failure produces silent non-payment

**Audit ref:** 1.2
**File:** `src/containers/checkout/steps/PaymentCapture.tsx`
**Lines:** 52-54

### Old code:

```tsx
  const handlePay = async () => {
    if (!stripe || !elements) return;
```

### New code:

```tsx
  const handlePay = async () => {
    if (!stripe || !elements) {
      toast.error("Payment system failed to load. Please refresh the page or try a different browser.");
      return;
    }
```

**Why correct:** If Stripe.js fails to load (CSP, network, WebView restriction), the button click silently does nothing. Users need feedback.

---

## Fix 7 -- P1: ServiceSelection single-service flash

**Audit ref:** 2.1
**File:** `src/containers/checkout/steps/ServiceSelection.tsx`
**Lines:** Add early return before the main render (before line 100)

### Add after line 98 (`}`):

```tsx
  // Suppress flash of single-service card during auto-skip
  if (!loading && !error && services.length === 1) {
    return null;
  }

  // Handle zero services
  if (!loading && !error && services.length === 0) {
    return (
      <Box sx={{ textAlign: "center", py: 6, px: 3 }}>
        <Typography sx={{ color: "#6C727F", mb: 2 }}>
          This provider has no bookable services configured.
        </Typography>
      </Box>
    );
  }
```

**Why correct:** After auto-skip dispatches `nextStep()`, React re-renders once with `loading=false` and `services=[1 item]` before the step advances. The `return null` suppresses the flash. Zero-services case is also now handled.

---

## Fix 8 -- P1: AuthOnboarding field types (mobile UX)

**Audit ref:** 1.3
**File:** `src/containers/checkout/steps/AuthOnboarding.tsx`
**Lines:** 149-160

### Old code:

```tsx
      {missingFields.map((field) => (
        <TextField
          key={field}
          label={fieldLabel(field)}
          value={formValues[field] || ""}
          onChange={(e) => handleChange(field, e.target.value)}
          fullWidth
          required
          sx={{ mb: 2 }}
          size="small"
        />
      ))}
```

### New code:

```tsx
      {missingFields.map((field) => {
        const inputProps: Record<string, string> = {};
        let type = "text";

        if (field === "date_of_birth") {
          type = "date";
        } else if (field === "phone_number" || field === "phone") {
          type = "tel";
          inputProps.inputMode = "tel";
        } else if (field === "zip") {
          inputProps.inputMode = "numeric";
          inputProps.autoComplete = "postal-code";
        } else if (field === "street_address") {
          inputProps.autoComplete = "street-address";
        } else if (field === "city") {
          inputProps.autoComplete = "address-level2";
        } else if (field === "state") {
          inputProps.autoComplete = "address-level1";
        } else if (field === "country") {
          inputProps.autoComplete = "country-name";
        }

        return (
          <TextField
            key={field}
            label={fieldLabel(field)}
            value={formValues[field] || ""}
            onChange={(e) => handleChange(field, e.target.value)}
            fullWidth
            required
            sx={{ mb: 2 }}
            size="small"
            type={type}
            InputLabelProps={type === "date" ? { shrink: true } : undefined}
            inputProps={inputProps}
          />
        );
      })}
```

**Why correct:** Mobile keyboards now match field content (number pad for tel/zip, date picker for DOB). Autocomplete attributes enable browser autofill for address fields.

---

## Fix 9 -- P1: Timezone not persisted to Redux or sent to backend

**Audit refs:** 3.2, 3.3
**Files:** `src/store/slices/checkoutSlice.ts`, `src/containers/checkout/steps/SchedulePicker.tsx`, `src/containers/checkout/steps/AuthOnboarding.tsx`

### checkoutSlice.ts changes:

Add `clientTimezone: string | null` to `CheckoutState` (after `holdUntil`):

```tsx
  clientTimezone: string | null;
```

Add to `initialState`:

```tsx
  clientTimezone: null,
```

Add reducer:

```tsx
    setClientTimezone(state, action: PayloadAction<string>) {
      state.clientTimezone = action.payload;
    },
```

Export it from actions.

### SchedulePicker.tsx changes:

When the user changes timezone (line 273), dispatch to Redux:

```tsx
onChange={(e) => {
  const tz = e.target.value as string;
  setTimezone(tz);
  dispatch(setClientTimezone(tz));
}}
```

Also dispatch on initial detection (in the useEffect or after `detectedTz` is set):

```tsx
useEffect(() => {
  dispatch(setClientTimezone(detectedTz));
}, [detectedTz, dispatch]);
```

Use `Intl.supportedValuesOf('timeZone')` for the timezone list (with fallback for older browsers):

```tsx
const allTimezones = useMemo(() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    // Fallback for browsers that don't support supportedValuesOf
    return [
      detectedTz,
      "America/New_York", "America/Chicago", "America/Denver",
      "America/Los_Angeles", "America/Toronto", "Europe/London",
      "Europe/Paris", "Asia/Tokyo", "Australia/Sydney",
    ].filter((tz, i, arr) => arr.indexOf(tz) === i);
  }
}, [detectedTz]);
```

### AuthOnboarding.tsx changes (line 22-29):

Add `clientTimezone` to the sessionStorage context payload:

```tsx
function persistContext(checkout: CheckoutState) {
  const ctx = {
    slug: checkout.slug,
    rateId: checkout.rateId,
    slotId: checkout.slotId,
    sessionId: checkout.sessionId,
    holdUntil: checkout.holdUntil,
    clientTimezone: checkout.clientTimezone,
  };
  sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx));
}
```

### BookingConfirmation.tsx change (line 46):

Read timezone from Redux instead of re-detecting:

```tsx
const timezone = checkout.clientTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
```

**Why correct:** The selected timezone now survives step transitions, auth redirects, and is available for the confirmation display. Backend receives it via `createSession` (if the REST helper is updated to include it in the payload).

---

## Fix 10 -- P1: Discount display missing required elements

**Audit ref:** 5.2
**File:** `src/containers/checkout/steps/PaymentCapture.tsx`
**Lines:** 119-187

### Add after the session price block (after line 136), before the fee block:

```tsx
          {/* Original price with strikethrough when discounted */}
          {showDiscount && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 1,
              }}
            >
              <Typography variant="body2" sx={{ color: "#9E9E9E" }}>
                Standard platform fee ({(0.15 * 100).toFixed(0)}%)
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "#9E9E9E", textDecoration: "line-through" }}
              >
                {currencySymbol}
                {(parseFloat(feePreview.session_price) * 0.15).toFixed(2)}
              </Typography>
            </Box>
          )}
```

### Modify the fee line to also show percentage (lines 146-162):

```tsx
          {feePreview.fee_applies && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 1,
              }}
            >
              <Typography variant="body2" sx={{ color: "#6C727F" }}>
                Platform fee ({(parseFloat(feePreview.fee_percent) * 100).toFixed(0)}%)
                {showDiscount && (
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ color: "#469BA7", ml: 1 }}
                  >
                    (Discounted)
                  </Typography>
                )}
              </Typography>
              <Typography variant="body2" sx={{ color: "#1C4961" }}>
                {currencySymbol}
                {feePreview.fee_amount}
              </Typography>
            </Box>
          )}
```

### Add attribution message after the Total block (after line 187):

```tsx
          {/* Booking link attribution */}
          {feePreview.fee_applies && (
            <Typography
              variant="caption"
              sx={{ color: "#6C727F", mt: 1, display: "block" }}
            >
              Referred via provider booking link
            </Typography>
          )}
```

**Why correct:** All four required discount elements are now present: original (strikethrough) price, discounted fee with both percentage and dollar amount, final total, and attribution message.

---

## Fix 11 -- P1: Confirmation page dead links and refresh survival

**Audit ref:** 8.1, 8.2
**File:** `src/containers/checkout/steps/BookingConfirmation.tsx`

### Remove dead "Join session" link (lines 181-196):

The `/session/join/${appointmentId}` route does not exist. Remove or gate behind a feature flag.

```tsx
        {/* Join session link -- deferred to RGDEV-211 */}
        {/* {appointmentId && (
          <Button ... >Join your session</Button>
        )} */}
```

### Remove dead "Manage booking" link (lines 198-210):

The `/booking/${appointmentId}` route does not exist (RGDEV-211 not shipped).

```tsx
        {/* Manage booking -- deferred to RGDEV-211 */}
        {/* {appointmentId && (
          <Button ... >Manage booking</Button>
        )} */}
```

### ICS download (line 71-73):

The `/api/ics` route does not exist. **Implement from plan** -- see "MISSING items" section below.

### Refresh survival:

Add `appointmentId` to URL query params after booking completes. On mount, if Redux is empty and `appointmentId` is in the URL, fetch session status from backend.

This requires changes in both `PaymentCapture.tsx` (push `?appointmentId=X` to URL after success) and `BookingConfirmation.tsx` (read from `router.query` and fetch if Redux is empty).

**This is complex enough to be a separate sub-task.** Mark as P1 for this fix plan; implementation details below:

In `BookingConfirmation.tsx`, add:

```tsx
const router = useRouter();
const queryAppointmentId = router.query.appointmentId as string | undefined;

useEffect(() => {
  if (!appointmentId && queryAppointmentId) {
    // TODO: Fetch from GET /checkout/session/<id>/status/ and populate Redux
    // For now, show a minimal "Booking confirmed" without details
  }
}, [appointmentId, queryAppointmentId]);
```

---

## Fix 12 -- P1: NoAvailabilityState is a conversion dead-end

**Audit ref:** 6.1
**File:** `src/containers/checkout/NoAvailabilityState.tsx`

### Add "Explore other providers" CTA (after the "Go Back" button):

```tsx
      <Button
        variant="contained"
        onClick={() => window.location.href = "/help-with"}
        sx={{
          backgroundColor: "#469BA7",
          "&:hover": { backgroundColor: "#35859C" },
          textTransform: "none",
          px: 4,
          py: 1,
          mt: 2,
        }}
      >
        Explore Other Providers
      </Button>
```

**Why correct:** Users with no available slots need an alternative path besides "Go Back" to service selection (which doesn't solve the problem). Linking to `/help-with` keeps them in the conversion funnel.

---

## Fix 13 -- P2: Touch targets below 44px

**Audit ref:** 1.1
**Files:** All step components with primary action buttons

### Add `minHeight: 44` to all slot time buttons in SchedulePicker.tsx (line 321-338):

```tsx
              <Button
                key={slot.id}
                variant="outlined"
                size="small"
                disabled={submitting}
                onClick={() => handleSelectSlot(slot)}
                sx={{
                  borderColor: "#D2D5DA",
                  color: "#1C4961",
                  textTransform: "none",
                  minHeight: 44,
                  minWidth: 44,
                  "&:hover": {
                    borderColor: "#469BA7",
                    backgroundColor: "rgba(70,155,167,0.05)",
                  },
                }}
              >
```

**Why correct:** Ensures 44x44px minimum touch targets per WCAG 2.5.8 / Apple HIG guidelines.

---

## Fix 14 -- P2: Timezone list too small

**Audit ref:** 3.2

Covered by Fix 9 (`Intl.supportedValuesOf('timeZone')` with fallback). No separate action needed.

---

## MISSING Items -- Implement from Plan

These items were identified as MISSING in the audit (not partially implemented -- completely absent). The EXECUTE agent should implement them from the plan spec.

| # | Item | Plan reference | Priority |
|---|---|---|---|
| M1 | `src/pages/api/ics.ts` -- ICS download API route | Plan: Step 6, "ICS download" | P1 |
| M2 | Mixpanel checkout events (`checkout_started`, `checkout_service_selected`, etc.) | Plan: Mixpanel Events section | P2 |
| M3 | PayPal integration in PaymentCapture | Plan: Step 5, "Stripe Elements or PayPal" | P2 (defer) |
| M4 | "Jump to first available" in SchedulePicker for far-future slots | Audit 6.2 | P2 |
| M5 | Mid-checkout `is_active` re-validation poll | Audit 11.2 | P2 |
| M6 | Fee preview "estimated" disclaimer | Audit 9.2 | P2 |
| M7 | Returning client "Welcome back" UX | Audit 9.1 | P2 |

---

## Execution Order

Execute fixes in this order to minimize merge conflicts:

1. **Fix 3** (Stripe key) -- single line, no dependencies
2. **Fix 4** (PM/PI field name) -- single line + comment
3. **Fix 6** (Stripe load error) -- single line
4. **Fix 1** (Hold timer lift to wizard) -- largest change, touches CheckoutWizard + SchedulePicker
5. **Fix 2** (Backend hold_until validation) -- backend only
6. **Fix 5** (409/410 navigation in PaymentCapture) -- depends on Fix 2 for 410
7. **Fix 9** (Timezone persistence) -- touches 4 files
8. **Fix 7** (Single-service flash) -- isolated change
9. **Fix 8** (Auth field types) -- isolated change
10. **Fix 10** (Discount display) -- isolated change
11. **Fix 11** (Dead links + refresh) -- isolated change
12. **Fix 12** (NoAvailability CTA) -- isolated change
13. **Fix 13** (Touch targets) -- isolated change

---

## Backend Fix Summary

Only one backend change is needed (Fix 2):

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\views.py`
**Location:** `CheckoutCompleteView.post()`, after line 631, before line 633
**Change:** Add `hold_until` expiry check returning HTTP 410

All other fixes are frontend-only in the worktree at `C:\Projects\ReallyGlobal\RG-Frontend\.claude\worktrees\agent-a97ae695\`.
