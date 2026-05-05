# Audit Prompt: RGDEV-211 Post-Booking Lifecycle — UX, Scenario, and Commercial Audit

**For:** AUDITOR B
**Ticket:** RGDEV-211
**Epic:** RGDEV-203 — Booking Link v3 Full Lifecycle Contained Checkout
**Audit type:** UX flow, scenario walkthrough, commercial risk
**Execute by:** Reading implemented code and tracing user flows end-to-end

---

## Context

RGDEV-211 implements the full post-booking lifecycle for clients who book via a Booking Link:

- SendGrid confirmation, reminder, review-prompt, and marketplace-intro emails (`apps/booking_link/emails.py`, `tasks.py`)
- Session join page (`src/pages/session/join/[appointmentId].tsx`)
- Booking management page — reschedule and cancel (`src/pages/booking/[appointmentId].tsx`, `src/containers/booking-management/BookingManagement.tsx`)
- Web confirmation page (`src/pages/booking/confirmation/[appointmentId].tsx`)

Key models:
- `BookingLinkCheckoutSession` — carries `client_timezone`, `client_locale`, links to `appointment`, `booking_link`, `client`
- `BookingAttribution` — `OneToOne` on `appointment`; stores `source`, `booking_link`, `fee_tier`
- Attribution is the commercial record; wrong `fee_tier` on reschedule = revenue mis-pricing

Backend wire-in point: `apps/booking_link/views.py` line ~724, after `confirm_and_notify(appointment)` in `CheckoutCompleteView.post()`.

The baseline video session pattern is `src/pages/meet/[room].tsx` — uses `useSelector` for user identity and reads `roomName` from the router. That page assumes an authenticated Redux store. The new join page must handle unauthenticated clients gracefully.

The baseline booking page is `src/pages/book-client-appointment/index.tsx` — it wraps `<Layout>` (the full marketplace shell) and requires `userInfo.careProvider` from Redux. The new management and confirmation pages must NOT use this pattern for first-time users linked from email.

---

## Audit Checklist

Work through each scenario below. For each item: trace the code, verify the assertion, and note PASS / FAIL / NOT IMPLEMENTED / RISK.

---

### 1. Email Flow Completeness

**Goal:** Verify the confirmation email actually fires after a booking completes.

1.1. Open `apps/booking_link/views.py`. Find `CheckoutCompleteView.post()`. Confirm the call to `send_confirmation_email_task.delay(appointment.id)` appears **after** `confirm_and_notify(appointment)`, not before. If it appears before, the appointment may not yet be committed to the database when the task runs.

1.2. Open `apps/booking_link/tasks.py`. Confirm `send_confirmation_email_task` is decorated with `@django_rq.job`. Confirm it retrieves the appointment from the database (not from a passed object), so it works correctly when executed asynchronously by the RQ worker.

1.3. Open `apps/booking_link/emails.py`. Confirm `send_booking_confirmation_email(appointment, client, provider, booking_link_slug)` calls `apps.authentication.utils.send_email`. Confirm it does NOT raise if `appointment.booking_link_checkout.client_timezone` is an empty string — this field defaults to `''` on the model and may be blank for edge-case sessions.

1.4. Confirm the reminder scheduling calls use `django_rq.enqueue_at()` or APScheduler with `appointment.start_date_time`. Verify reminders are only enqueued if `appointment.is_status` is `SCHEDULED` at enqueue time, not just at execution time. Check whether there is a guard inside `send_reminder_email_task` that aborts if the appointment is no longer SCHEDULED when the task runs.

1.5. Confirm `send_review_prompt_task` checks `appointment.is_status == 'COMPLETED'` at execution time, not at enqueue time.

1.6. Confirm `send_marketplace_intro_task` is scheduled for ~24h after `appointment.end_date_time`. Verify it fires even if the session was completed (not cancelled).

1.7. **Edge case — RQ worker down:** Is there a synchronous fallback for the confirmation email? The plan notes this as a risk. Check whether `CheckoutCompleteView.post()` has a try/except around the `.delay()` call. If the task enqueue fails and there is no fallback, the client never receives confirmation. Record as RISK if unhandled.

---

### 2. Session Join Page — Unauthenticated State

**Goal:** A client who has never used Really Global before can click the join link from the confirmation email and reach the video session without navigating the marketplace.

2.1. Open `src/pages/session/join/[appointmentId].tsx`. Verify it does NOT wrap `<Layout>` (the full marketplace shell). The existing `src/pages/meet/[room].tsx` and `src/pages/book-client-appointment/index.tsx` both use `<Layout>`. The join page must not.

2.2. Verify the auth gate: if the user is not authenticated (Redux `authy.user` is null or `authy.isAuthenticated` is false), the page renders an inline login/OTP form, NOT a redirect to `/login` with no `returnUrl`. Confirm the `returnUrl` is `/session/join/{appointmentId}` so the user lands back on the join page after authentication.

2.3. Verify the existing `src/pages/meet/[room].tsx` pattern reads identity from `useSelector((state) => state.authy.user)` and constructs `identity` as `firstName + middleName + lastName`. Confirm the new join page follows the same pattern OR passes identity from the `BookingDetailView` API response — not from a hardcoded default.

2.4. After authentication, confirm the join page calls `GET /api/v1/booking-link/booking/<appointmentId>/` to verify ownership. If the API returns 403 (wrong client) or 404 (not found), the page must show a clear error — not a blank screen or unhandled rejection.

2.5. Confirm the pre-session countdown uses `appointment.start_date_time` rendered in `BookingLinkCheckoutSession.client_timezone`, not `new Date()` in the browser's current timezone.

2.6. **Mobile / WKWebView constraint:** Confirm the join page does not open a pop-up at any point (no `window.open()`). The video room transition must be a navigation (`router.push()`) or an in-page mount. Pop-ups are blocked in WKWebView and Chrome Custom Tabs.

2.7. Confirm the join page is NOT included in `getServerSideProps` in a way that makes it SSR-only — the Twilio SDK must be dynamically imported (`next/dynamic` with `ssr: false`), following the pattern in `src/pages/meet/[room].tsx`.

---

### 3. Confirmation Page Completeness

**Goal:** `/booking/confirmation/[appointmentId]` renders all required elements.

3.1. Open `src/pages/booking/confirmation/[appointmentId].tsx`. Confirm it calls `GET /api/v1/booking-link/booking/<appointmentId>/` on mount to hydrate session details.

3.2. Verify each of the following elements is rendered:
- Session date and time (in `client_timezone`)
- Provider name and profile photo
- Session type and duration
- "Join your session" link pointing to `/session/join/{appointmentId}`
- "Add to Google Calendar" link (see Section 6 for format verification)
- ICS download link
- "Manage booking" link pointing to `/booking/{appointmentId}`
- Marketplace CTA ("Explore more providers" or equivalent) pointing to the marketplace root

3.3. Confirm the page does NOT use `<Layout>` as its shell if the user arrived directly from email (unauthenticated). An unauthenticated first-time user must see all the above elements without being blocked by a login wall on this read-only page. If the API requires authentication to retrieve booking details, verify that the token from the checkout flow is available (e.g., the new account JWT is set in Redux/localStorage at the end of RGDEV-209 Step 6).

3.4. Confirm the page handles `appointmentId` not found (404 from API) with a human-readable error, not an unhandled exception.

---

### 4. Booking Management Page — Standalone Operation

**Goal:** A first-time user can cancel or reschedule from the email link alone, without marketplace navigation.

4.1. Open `src/pages/booking/[appointmentId].tsx`. Confirm it does NOT use `<Layout>`. Compare against `src/pages/book-client-appointment/index.tsx` which uses `<Layout>` and requires `userInfo.careProvider` from Redux — the management page must not have this dependency.

4.2. Confirm the auth gate is inline (same as Section 2.2 — not a hard redirect that loses context).

4.3. Confirm the management page loads cancellation policy from `GET /api/v1/booking-link/checkout/cancellation-policy/<slug>/`. Verify the `<slug>` used is from `BookingLinkCheckoutSession.booking_link.slug_snapshot`, not from the URL path (which the client doesn't see in the email link).

4.4. Confirm the reschedule flow loads available slots via `GET /api/v1/booking-link/checkout/slots/<slug>/` and does NOT require Redux `calendar.allSlot` state (the pattern in `book-client-appointment/index.tsx` uses `dispatch(getAppointmentSlotById(...))` against Redux — this must NOT be the mechanism here).

4.5. **Outside cancellation window:** If `now > start - timedelta(hours=window)`, confirm the Cancel and Reschedule buttons are disabled or hidden. Confirm the UI explains *why* (e.g., "Cancellations must be made at least 24 hours in advance").

4.6. **Already cancelled:** If `appointment.is_status == 'CANCELLED'`, confirm the management page shows a "This session was cancelled" state and does not render reschedule/cancel controls. Record as FAIL if the page crashes or shows stale action buttons for a cancelled appointment.

4.7. **Appointment not found:** If `GET /api/v1/booking-link/booking/<appointmentId>/` returns 404, confirm the page shows a human-readable error.

---

### 5. Timezone Rendering

**Goal:** All date/time rendering uses `BookingLinkCheckoutSession.client_timezone`, never the browser's current timezone.

5.1. In `BookingDetailView` (backend), confirm the API response includes `client_timezone` from `BookingLinkCheckoutSession`. Confirm it is a IANA timezone string (e.g., `"America/Toronto"`, `"Europe/London"`).

5.2. In each of the following frontend pages, confirm that date/time values are rendered by formatting `appointment.start_date_time` using the `client_timezone` from the API response — NOT `new Date().toLocaleString()` with no timezone argument, NOT `moment()` without a timezone argument:
- `src/pages/session/join/[appointmentId].tsx` (countdown display)
- `src/pages/booking/[appointmentId].tsx` (session details section)
- `src/pages/booking/confirmation/[appointmentId].tsx` (all date/time fields)

5.3. In `apps/booking_link/emails.py`, confirm `send_booking_confirmation_email` converts `appointment.start_date_time` to `client_timezone` before rendering the subject line and body. The subject line per the plan is `"Your session with {provider_first} is confirmed — {date_time_local}"` — confirm `date_time_local` is in the client's timezone, not UTC.

5.4. **Empty timezone fallback:** `BookingLinkCheckoutSession.client_timezone` defaults to `''`. Confirm both the email builder and the frontend pages handle this gracefully — suggested fallback: `'UTC'` with a visible label, not a JavaScript exception.

---

### 6. Google Calendar Link Format

**Goal:** The "Add to Google Calendar" link is correctly formed and encodes all required fields.

6.1. Find where the Google Calendar link is constructed (likely in `emails.py` and/or the confirmation page component). Confirm the URL follows this structure:
```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text=<session title>
  &dates=<YYYYMMDDTHHMMSSZ>/<YYYYMMDDTHHMMSSZ>
  &details=<description with join link>
  &location=<provider name or "Online">
  &ctz=<IANA timezone string>
```

6.2. Confirm `dates` values are in UTC (`Z` suffix), not in local time. Google Calendar interprets bare datetime strings as UTC only if the `Z` suffix is present.

6.3. Confirm `text` includes the provider's display name (e.g., "Session with Jane Smith").

6.4. Confirm `details` or `location` includes the session join URL (`https://really.global/session/join/{appointmentId}`) so the client can join directly from the calendar event.

6.5. Confirm all query parameters are URL-encoded. Special characters in provider names (apostrophes, hyphens, accented characters) must not break the link.

6.6. Confirm the ICS download endpoint (`GET /api/v1/booking-link/booking/<id>/ics/` or equivalent) exists and returns a valid `text/calendar` response with `DTSTART`, `DTEND`, `TZID`, `SUMMARY`, and `DESCRIPTION` fields.

---

### 7. Marketplace Introduction Email — Tone and Link Quality

**Goal:** The marketplace intro email is non-aggressive and contextually relevant.

7.1. Open `send_marketplace_intro_email` in `apps/booking_link/emails.py`. Confirm the subject line is not promotional/pushy (e.g., avoid "Don't miss out", "Limited time offer"). The plan specifies: "Non-aggressive: 'Looking for additional support? Explore therapists, coaches, and mentors.'"

7.2. Confirm the CTA link in the email points to a relevant marketplace entry point. Ideally it reflects the provider's category (e.g., if the provider is a therapist, link to `/find-a-therapist/` or the equivalent search results page filtered to the same role/specialty). If a generic marketplace root is used instead, record as a minor UX gap.

7.3. Confirm the email is only sent once per appointment (not on every re-send or reschedule). Check that `send_marketplace_intro_task` is enqueued only in `CheckoutCompleteView.post()`, not in the reschedule view.

7.4. Confirm the email includes an unsubscribe mechanism or references the user's notification preferences, consistent with GDPR/CAN-SPAM requirements. Record as RISK if absent.

---

### 8. Error States

**Goal:** All error states are handled with clear, user-friendly UI.

8.1. Management page — appointment already cancelled (`is_status == 'CANCELLED'`): Does the page render a clear "This session was cancelled" message? Does it still show session details (provider, original date) or does it show a blank/error page?

8.2. Management page — appointment not found (404 from API): Does the page render "Booking not found" or equivalent? Does it offer a link back to the marketplace?

8.3. Join page — ownership mismatch (403 from API): Does the page render "You don't have access to this session" or equivalent? Does it avoid leaking appointment details?

8.4. Confirmation page — expired checkout session (`BookingLinkCheckoutSession.status == 'EXPIRED'`): Does the confirmation page handle this state, or does it assume the checkout is always COMPLETED? The API should return 404 or a clear error for expired sessions.

8.5. Management page — reschedule to a slot that is no longer available (race condition between slot selection and POST): Does `BookingRescheduleView` return a 409 or 400 with a user-readable message? Does the frontend display it rather than swallowing the error?

---

### 9. Mobile Experience

**Goal:** Join, management, and confirmation pages work in mobile browsers without pop-ups.

9.1. Verify no `window.open()` calls exist in `src/pages/session/join/[appointmentId].tsx`, `src/pages/booking/[appointmentId].tsx`, or `src/pages/booking/confirmation/[appointmentId].tsx`.

9.2. Confirm the Twilio Video SDK is loaded via `next/dynamic` with `ssr: false` in the join page. Confirm the VideoProvider component (from `src/containers/VideoProvider`) is rendered in-page, not in a new tab.

9.3. Confirm the slot picker in the management page's reschedule flow is a native select or MUI component that renders correctly in mobile viewports — not a date-picker that depends on browser pop-up windows.

9.4. Confirm the auth gate on the join page (Section 2.2) works in WKWebView — specifically, any OTP or login form must not rely on a redirect to a third-party OAuth provider that opens a system browser (which breaks in WKWebView). If Google/Apple OAuth is offered, flag as a UX risk for WKWebView clients.

---

### 10. Attribution Continuity on Reschedule

**Goal:** Rescheduling preserves the original `BookingAttribution` record.

10.1. Open `BookingRescheduleView` in `apps/booking_link/views.py`. Confirm that when a reschedule is processed, the existing `BookingAttribution` record linked to `appointment` is NOT deleted or replaced. The `BookingAttribution` is a `OneToOneField` on `appointment` — rescheduling updates `appointment.start_date_time` and `appointment.end_date_time` but must not touch the attribution.

10.2. Confirm the reschedule view does NOT call `BookingAttribution.objects.create(...)` or `BookingAttribution.objects.update_or_create(...)` for an existing appointment. A new attribution record would shadow the original fee tier.

10.3. Confirm the reschedule view does NOT delete the `BookingLinkCheckoutSession` or set its status to EXPIRED. The checkout session is the source of `client_timezone` — losing it would break timezone rendering on subsequent page loads.

10.4. After a reschedule, confirm `BookingAttribution.fee_tier` still matches the original checkout value stored in `BookingLinkCheckoutSession.fee_percent`.

---

### 11. Commercial Risk: Attribution on Reschedule to a Different Slot

**Goal:** Rescheduling to a different slot does not corrupt the attribution fee tier.

11.1. **Scenario:** Client books via Booking Link A (fee tier = 10%). The provider later creates Booking Link B (fee tier = 8%). The client reschedules their original appointment to a new slot. The reschedule is processed via the management page, which was reached from the email for the original booking.

- Confirm `BookingRescheduleView` uses the **existing** `BookingAttribution.fee_tier` (from the original checkout) and does NOT re-derive the fee from the provider's current booking link or any other source.
- Confirm that if `Slot` has a foreign key to `BookingLink`, the reschedule view does NOT use `new_slot.booking_link.fee_tier` to overwrite `BookingAttribution.fee_tier`.

11.2. **Scenario:** Client reschedules to a slot that was created under a different provider rate (e.g., the provider changed their rates). Confirm `BookingAttribution.fee_tier` remains from the original checkout — the fee was locked at checkout time (`BookingLinkCheckoutSession.fee_percent`).

11.3. Confirm that `BookingAttribution.booking_link` continues to point to the original `BookingLink` after reschedule, not to any link associated with the new slot.

11.4. **Data integrity check:** Query `BookingAttribution.objects.filter(appointment__booking_link_checkout__status='COMPLETED')` and confirm each record's `fee_tier` matches `appointment.booking_link_checkout.fee_percent`. If there are mismatches, this indicates an attribution write happened outside the checkout flow. Record as CRITICAL RISK if found.

---

## Summary Table

After completing all checks, populate the following table:

| # | Area | Assertion | Result (PASS/FAIL/RISK/NI) | Notes |
|---|---|---|---|---|
| 1.1 | Email | Confirmation task fires after commit | | |
| 1.2 | Email | Task retrieves from DB, not passed object | | |
| 1.3 | Email | Empty timezone handled | | |
| 1.4 | Email | Reminder guard at execution time | | |
| 1.5 | Email | Review prompt checks COMPLETED at execution | | |
| 1.6 | Email | Marketplace intro scheduled correctly | | |
| 1.7 | Email | RQ failure fallback exists | | |
| 2.1 | Join page | No full Layout shell | | |
| 2.2 | Join page | Inline auth with returnUrl | | |
| 2.3 | Join page | Identity from API, not hardcoded | | |
| 2.4 | Join page | 403/404 from API handled | | |
| 2.5 | Join page | Countdown in client_timezone | | |
| 2.6 | Join page | No window.open() | | |
| 2.7 | Join page | Dynamic import ssr:false | | |
| 3.1 | Confirmation | API called on mount | | |
| 3.2 | Confirmation | All 8 required elements present | | |
| 3.3 | Confirmation | Unauthenticated access works | | |
| 3.4 | Confirmation | 404 handled gracefully | | |
| 4.1 | Management | No full Layout shell | | |
| 4.2 | Management | Inline auth gate | | |
| 4.3 | Management | Policy from slug, not URL path | | |
| 4.4 | Management | Slots from API, not Redux | | |
| 4.5 | Management | Outside-window UI disables actions | | |
| 4.6 | Management | Already-cancelled state rendered | | |
| 4.7 | Management | 404 handled gracefully | | |
| 5.1 | Timezone | API returns IANA timezone | | |
| 5.2 | Timezone | All pages use client_timezone | | |
| 5.3 | Timezone | Email subject uses local time | | |
| 5.4 | Timezone | Empty timezone fallback safe | | |
| 6.1 | Calendar | GCal URL structure correct | | |
| 6.2 | Calendar | Dates in UTC Z format | | |
| 6.3 | Calendar | Provider name in title | | |
| 6.4 | Calendar | Join URL in details | | |
| 6.5 | Calendar | Parameters URL-encoded | | |
| 6.6 | Calendar | ICS endpoint exists and valid | | |
| 7.1 | Mktpl email | Non-aggressive tone | | |
| 7.2 | Mktpl email | Contextually relevant link | | |
| 7.3 | Mktpl email | Sent only once per appointment | | |
| 7.4 | Mktpl email | Unsubscribe mechanism present | | |
| 8.1 | Error states | Cancelled appointment shown correctly | | |
| 8.2 | Error states | Not-found appointment handled | | |
| 8.3 | Error states | Ownership mismatch handled | | |
| 8.4 | Error states | Expired checkout handled | | |
| 8.5 | Error states | Reschedule race condition handled | | |
| 9.1 | Mobile | No window.open() calls | | |
| 9.2 | Mobile | Twilio loaded with ssr:false | | |
| 9.3 | Mobile | Slot picker mobile-safe | | |
| 9.4 | Mobile | Auth gate WKWebView-safe | | |
| 10.1 | Attribution | Reschedule does not replace attribution | | |
| 10.2 | Attribution | No new attribution created on reschedule | | |
| 10.3 | Attribution | CheckoutSession preserved on reschedule | | |
| 10.4 | Attribution | fee_tier matches fee_percent | | |
| 11.1 | Commercial | fee_tier not re-derived on reschedule | | |
| 11.2 | Commercial | fee_tier locked at checkout time | | |
| 11.3 | Commercial | booking_link FK unchanged on reschedule | | |
| 11.4 | Commercial | No cross-record fee mismatches | | |

---

## Files to Read

Primary:
- `apps/booking_link/views.py` — `CheckoutCompleteView.post()`, `BookingDetailView`, `BookingRescheduleView`, `BookingCancelView`
- `apps/booking_link/tasks.py` — all four task functions
- `apps/booking_link/emails.py` — all four email builders
- `apps/booking_link/urls.py` — confirm all 3 new URL patterns registered
- `apps/booking_link/serializers.py` — `BookingDetailSerializer` (check `client_timezone` is included)
- `src/pages/session/join/[appointmentId].tsx`
- `src/pages/booking/[appointmentId].tsx`
- `src/pages/booking/confirmation/[appointmentId].tsx`
- `src/containers/booking-management/BookingManagement.tsx`

Reference (for pattern comparison, do not re-audit):
- `src/pages/meet/[room].tsx` — existing video room pattern
- `src/pages/book-client-appointment/index.tsx` — existing booking pattern (Layout-wrapped, Redux-dependent)
- `apps/booking_link/models.py` — `BookingLinkCheckoutSession`, `BookingAttribution`
