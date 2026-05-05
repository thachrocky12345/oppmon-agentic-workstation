# Audit Results: RGDEV-211 Post-Booking Lifecycle -- UX, Scenario, and Commercial Audit

**Auditor:** B (UX / Scenario / Commercial)
**Date:** 2026-03-15
**Ticket:** RGDEV-211
**Epic:** RGDEV-203 -- Booking Link v3 Full Lifecycle Contained Checkout

---

## Executive Summary

**Backend (emails, tasks, views):** Substantially implemented with several material gaps.
**Frontend (session join, booking management, confirmation pages):** ALL THREE PAGES ARE MISSING -- not yet implemented.

**Critical findings:**
1. All three frontend pages (`session/join/[appointmentId].tsx`, `booking/[appointmentId].tsx`, `booking/confirmation/[appointmentId].tsx`) and the `BookingManagement.tsx` container do not exist. Every frontend check is NOT IMPLEMENTED.
2. No ICS download endpoint or ICS file generation exists anywhere in the backend.
3. Google Calendar URL is missing `ctz` and `location` parameters.
4. No synchronous fallback for confirmation email if RQ worker is down.
5. `send_marketplace_intro_email` has no guard against cancelled appointments and no functional unsubscribe mechanism.
6. Reminder tasks are not guarded for SCHEDULED status at enqueue time (only at execution time).

---

## Detailed Findings

### 1. Email Flow Completeness

**1.1. Confirmation task fires after commit**
**PASS** -- `views.py` line 731: `send_confirmation_email_task.delay(appointment.id)` appears AFTER `confirm_and_notify(appointment)` at line 727, which is itself OUTSIDE the `transaction.atomic()` block (which ends at line 720). The appointment is committed to the database before the task is enqueued.

**1.2. Task retrieves from DB, not passed object**
**PASS** -- `tasks.py` lines 22-37: `send_confirmation_email_task` receives `appointment_id` (an int), then does `Appointment.objects.select_related(...).get(id=appointment_id)` to retrieve the object from the database. Correct async pattern.

**1.3. Empty timezone handled**
**PASS** -- `emails.py` lines 16-25: `_format_datetime_for_email` checks `if tz_name:` before attempting `pytz.timezone(tz_name)`. If `tz_name` is empty string (the model default), the conversion is skipped and the datetime is formatted as-is (UTC). However, the fallback is silent -- there is no visible "UTC" label in the email, so the client sees a time without timezone context. **Minor UX gap** but no exception.

**1.4. Reminder guard at execution time**
**FAIL (partial)** -- Reminders are guarded at execution time: `send_booking_reminder_email` (`emails.py` line 137) checks `if appointment.is_status != 'SCHEDULED': return`. However, `_schedule_reminders` (`tasks.py` lines 66-104) does NOT check `appointment.is_status == 'SCHEDULED'` at enqueue time. Since this is called from `send_confirmation_email_task` which runs immediately after checkout, the appointment will always be SCHEDULED at that point, so this is a theoretical gap only. But if `_schedule_reminders` is ever called from another context, it would blindly schedule reminders for non-SCHEDULED appointments. **RISK (low).**

**1.5. Review prompt checks COMPLETED at execution time**
**PASS** -- `send_review_prompt_email` (`emails.py` line 211) checks `if appointment.is_status != 'COMPLETED': return` at execution time. Correct -- the task is enqueued at booking time but the status check happens when it runs.

**1.6. Marketplace intro scheduled correctly**
**PASS (with caveat)** -- `_schedule_post_session_emails` (`tasks.py` lines 131-143) schedules `send_marketplace_intro_task` for `end + timedelta(hours=24)`. It fires regardless of appointment status. `send_marketplace_intro_email` (`emails.py` lines 264-313) does NOT check `appointment.is_status` at all -- it sends to cancelled appointments too. **RISK (medium)** -- sending a marketplace intro email after a cancelled session is poor UX and may violate CAN-SPAM expectations.

**1.7. RQ failure fallback exists**
**FAIL** -- `views.py` lines 729-731: no try/except around `send_confirmation_email_task.delay(appointment.id)`. If the RQ broker (Redis) is down, `.delay()` raises a `ConnectionError` which propagates to the HTTP response, causing a 500 error on the checkout completion endpoint. The client's checkout succeeds (appointment created, DB committed) but the response is an error. **RISK (high)** -- the client sees an error after paying, and never receives a confirmation email. The plan explicitly flagged this as a risk.

---

### 2. Session Join Page -- Unauthenticated State

**2.1 - 2.7: ALL NOT IMPLEMENTED**
File `src/pages/session/join/[appointmentId].tsx` does not exist.

---

### 3. Confirmation Page Completeness

**3.1 - 3.4: ALL NOT IMPLEMENTED**
File `src/pages/booking/confirmation/[appointmentId].tsx` does not exist.

---

### 4. Booking Management Page -- Standalone Operation

**4.1 - 4.7: ALL NOT IMPLEMENTED**
Files `src/pages/booking/[appointmentId].tsx` and `src/containers/booking-management/BookingManagement.tsx` do not exist.

---

### 5. Timezone Rendering

**5.1. API returns IANA timezone**
**PASS** -- `BookingDetailView` (`views.py` lines 938-945) retrieves `client_timezone` from `BookingLinkCheckoutSession.client_timezone` and returns it in the response. `BookingDetailSerializer` (`serializers.py` line 179) includes `client_timezone` as a `CharField(allow_blank=True)`. The value is an IANA string stored at checkout time.

**5.2. All pages use client_timezone**
**NOT IMPLEMENTED** -- All three frontend pages are missing.

**5.3. Email subject uses local time**
**PASS** -- `send_booking_confirmation_email` (`emails.py` line 77) uses `dt_display` which is produced by `_format_datetime_for_email(appointment.start_date_time, tz_name)`. The function converts to the client's timezone via `pytz.timezone(tz_name)` before formatting.

**5.4. Empty timezone fallback safe**
**PASS (backend)** -- `_format_datetime_for_email` (`emails.py` lines 16-25) has a broad `except Exception: pass` -- if `tz_name` is empty, the `if tz_name:` guard skips conversion and the datetime is formatted in its stored timezone (UTC). No exception occurs. However, the displayed time will be UTC with no "UTC" label, which could confuse clients. **Minor UX gap.**

---

### 6. Google Calendar Link Format

**6.1. GCal URL structure correct**
**FAIL** -- `_google_calendar_url` (`emails.py` lines 28-39) is missing two required parameters:
- `&ctz=<IANA timezone>` -- not included. Without this, Google Calendar may display the event in the user's Google account timezone rather than the session timezone.
- `&location=<provider name or "Online">` -- not included.

**6.2. Dates in UTC Z format**
**PASS** -- `emails.py` line 30: `appointment.start_date_time.strftime("%Y%m%dT%H%M%SZ")`. Since Django `USE_TZ=True` and `TIME_ZONE="UTC"` (`settings.py` lines 216/220), `DateTimeField` values are UTC-aware datetimes. `strftime` on a UTC-aware datetime produces the correct UTC representation with `Z` suffix.

**6.3. Provider name in title**
**PASS** -- `emails.py` line 32: `title = quote(f"Session with {provider_name}")`. Provider name is included.

**6.4. Join URL in details**
**PASS** -- `emails.py` lines 33-35: `details = quote(f"Join your session: {SITE_BASE_URL}/session/join/{appointment.id}")`. Join URL is present in the details field.

**6.5. Parameters URL-encoded**
**PASS** -- `emails.py` lines 32-35: `quote()` from `urllib.parse` is used for `title` and `details`. Special characters in provider names are encoded.

**6.6. ICS endpoint exists and valid**
**FAIL** -- No ICS endpoint exists in `urls.py` or anywhere in the `booking_link` app. No `.ics` file generation code exists. The confirmation email (`emails.py` lines 79-107) does not include an ICS download link -- only a Google Calendar link and a manage-booking link. The plan specified both an ICS download link and a Google Calendar link.

---

### 7. Marketplace Introduction Email -- Tone and Link Quality

**7.1. Non-aggressive tone**
**PASS** -- `send_marketplace_intro_email` (`emails.py` line 278): subject is `"Looking for additional support? Explore Really Global"`. Body copy is conversational and non-pushy. Matches the plan's guidance.

**7.2. Contextually relevant link**
**FAIL (minor)** -- `emails.py` line 276: `search_url = f"{SITE_BASE_URL}/search"`. This is a generic marketplace root URL, not filtered to the provider's role/specialty. The audit prompt notes this as a minor UX gap.

**7.3. Sent only once per appointment**
**PASS** -- `send_marketplace_intro_task` is enqueued only inside `_schedule_post_session_emails` (called from `send_confirmation_email_task`), which is called only from `CheckoutCompleteView.post()`. It is NOT called from `BookingRescheduleView` or `BookingCancelView`.

**7.4. Unsubscribe mechanism present**
**FAIL** -- `emails.py` lines 297-300: the footer says `"You can manage your notification preferences in your account settings."` but there is no actual unsubscribe link (no URL). This is a text-only reference with no actionable mechanism. For GDPR/CAN-SPAM compliance, a one-click unsubscribe link or `List-Unsubscribe` header is required. **RISK (medium-high).**

---

### 8. Error States

**8.1. Cancelled appointment shown correctly**
**NOT IMPLEMENTED** -- Frontend management page does not exist. Backend: `BookingDetailView` returns `status: 'CANCELLED'` and `can_reschedule: False`, `can_cancel: False` (via `_can_modify_booking` which returns `False` for non-SCHEDULED status). The backend data is correct but there is no frontend to render it. `BookingCancelView` (`views.py` line 1108) returns 400 for already-cancelled appointments.

**8.2. Not-found appointment handled**
**PASS (backend only)** -- `BookingDetailView` (`views.py` line 923), `BookingRescheduleView` (line 999), and `BookingCancelView` (line 1095) all return `{'error': 'Appointment not found.'}` with HTTP 404.

**8.3. Ownership mismatch handled**
**PASS (backend only)** -- All three views check `appointment.client.user != request.user` and return 403 with a clear error message. No appointment details are leaked in the 403 response.

**8.4. Expired checkout handled**
**NOT IMPLEMENTED** -- No frontend page exists to test this. `BookingDetailView` does not filter by checkout session status -- it returns data for any appointment regardless of `BookingLinkCheckoutSession.status`. An expired checkout session's appointment would still be returned if it exists. This may be acceptable since the appointment itself is the source of truth.

**8.5. Reschedule race condition handled**
**PASS (backend)** -- `BookingRescheduleView` (`views.py` line 1029-1039) uses `select_for_update()` and checks `appointment_id__isnull=True`. If the slot was taken by another request, it returns `{'error': 'Selected slot is no longer available.'}` with HTTP 409 Conflict. Clear, user-readable message.

---

### 9. Mobile Experience

**9.1 - 9.4: ALL NOT IMPLEMENTED**
All three frontend pages do not exist. No `window.open()` calls can be checked.

---

### 10. Attribution Continuity on Reschedule

**10.1. Reschedule does not replace attribution**
**PASS** -- `BookingRescheduleView` (`views.py` lines 983-1077) does NOT reference `BookingAttribution` at all. The `save(update_fields=[...])` on line 1066 only updates `start_date_time`, `end_date_time`, `duration`, and `timezone`. The `BookingAttribution` OneToOne on `appointment` is untouched.

**10.2. No new attribution created on reschedule**
**PASS** -- No `BookingAttribution.objects.create()` or `update_or_create()` call exists in `BookingRescheduleView`.

**10.3. CheckoutSession preserved on reschedule**
**PASS** -- `BookingRescheduleView` does NOT reference `BookingLinkCheckoutSession` at all. The checkout session (and its `client_timezone`) survives rescheduling.

**10.4. fee_tier matches fee_percent**
**PASS (by design)** -- `BookingAttribution.fee_tier` is set in `CheckoutCompleteView.post()` line 712 from `fee_percent`, which is derived from `get_booking_link_fee_percent(appointment)` at checkout time and stored in `BookingLinkCheckoutSession.fee_percent` at line 698. No code path modifies `fee_tier` after creation.

---

### 11. Commercial Risk: Attribution on Reschedule to a Different Slot

**11.1. fee_tier not re-derived on reschedule**
**PASS** -- `BookingRescheduleView` does not read from `new_slot.booking_link`, does not call `get_booking_link_fee_percent()`, and does not modify `BookingAttribution` in any way. The fee is locked at checkout time.

**11.2. fee_tier locked at checkout time**
**PASS** -- Same as 11.1. Even if the provider changes their rates, the `BookingAttribution.fee_tier` is immutable post-checkout.

**11.3. booking_link FK unchanged on reschedule**
**PASS** -- `BookingAttribution.booking_link` is not modified by `BookingRescheduleView`. The FK continues to point to the original `BookingLink`.

**11.4. No cross-record fee mismatches**
**PASS (by code review)** -- The only write path for `BookingAttribution.fee_tier` is `CheckoutCompleteView.post()` line 712, where it is set from `fee_percent` which is simultaneously stored in `BookingLinkCheckoutSession.fee_percent` (line 698). No other code path writes to `fee_tier`. A data integrity query at runtime would confirm, but the code is structurally sound.

---

## Summary Table

| # | Area | Assertion | Result | Notes |
|---|---|---|---|---|
| 1.1 | Email | Confirmation task fires after commit | **PASS** | After `confirm_and_notify`, outside `transaction.atomic()` |
| 1.2 | Email | Task retrieves from DB, not passed object | **PASS** | Receives `appointment_id`, queries DB |
| 1.3 | Email | Empty timezone handled | **PASS** | Guarded by `if tz_name:`, no exception on empty string |
| 1.4 | Email | Reminder guard at execution time | **PASS** | Execution-time guard present; enqueue-time guard absent (low risk) |
| 1.5 | Email | Review prompt checks COMPLETED at execution | **PASS** | `emails.py` line 211 |
| 1.6 | Email | Marketplace intro scheduled correctly | **RISK** | No guard against CANCELLED appointments at execution time |
| 1.7 | Email | RQ failure fallback exists | **FAIL** | No try/except around `.delay()` -- 500 error on RQ failure |
| 2.1 | Join page | No full Layout shell | **NI** | File does not exist |
| 2.2 | Join page | Inline auth with returnUrl | **NI** | File does not exist |
| 2.3 | Join page | Identity from API, not hardcoded | **NI** | File does not exist |
| 2.4 | Join page | 403/404 from API handled | **NI** | File does not exist |
| 2.5 | Join page | Countdown in client_timezone | **NI** | File does not exist |
| 2.6 | Join page | No window.open() | **NI** | File does not exist |
| 2.7 | Join page | Dynamic import ssr:false | **NI** | File does not exist |
| 3.1 | Confirmation | API called on mount | **NI** | File does not exist |
| 3.2 | Confirmation | All 8 required elements present | **NI** | File does not exist |
| 3.3 | Confirmation | Unauthenticated access works | **NI** | File does not exist |
| 3.4 | Confirmation | 404 handled gracefully | **NI** | File does not exist |
| 4.1 | Management | No full Layout shell | **NI** | File does not exist |
| 4.2 | Management | Inline auth gate | **NI** | File does not exist |
| 4.3 | Management | Policy from slug, not URL path | **NI** | File does not exist |
| 4.4 | Management | Slots from API, not Redux | **NI** | File does not exist |
| 4.5 | Management | Outside-window UI disables actions | **NI** | File does not exist |
| 4.6 | Management | Already-cancelled state rendered | **NI** | File does not exist |
| 4.7 | Management | 404 handled gracefully | **NI** | File does not exist |
| 5.1 | Timezone | API returns IANA timezone | **PASS** | `BookingDetailView` returns `client_timezone` |
| 5.2 | Timezone | All pages use client_timezone | **NI** | No frontend pages exist |
| 5.3 | Timezone | Email subject uses local time | **PASS** | Converted via `_format_datetime_for_email` |
| 5.4 | Timezone | Empty timezone fallback safe | **PASS** | Guarded; falls back to UTC silently |
| 6.1 | Calendar | GCal URL structure correct | **FAIL** | Missing `ctz` and `location` parameters |
| 6.2 | Calendar | Dates in UTC Z format | **PASS** | UTC datetimes with Z suffix |
| 6.3 | Calendar | Provider name in title | **PASS** | `"Session with {provider_name}"` |
| 6.4 | Calendar | Join URL in details | **PASS** | Present in `details` param |
| 6.5 | Calendar | Parameters URL-encoded | **PASS** | Uses `urllib.parse.quote()` |
| 6.6 | Calendar | ICS endpoint exists and valid | **FAIL** | No ICS endpoint or generation code exists |
| 7.1 | Mktpl email | Non-aggressive tone | **PASS** | Subject and body are conversational |
| 7.2 | Mktpl email | Contextually relevant link | **FAIL (minor)** | Generic `/search` URL, not filtered to role |
| 7.3 | Mktpl email | Sent only once per appointment | **PASS** | Enqueued only in `CheckoutCompleteView.post()` |
| 7.4 | Mktpl email | Unsubscribe mechanism present | **FAIL** | Text reference only, no actionable link or header |
| 8.1 | Error states | Cancelled appointment shown correctly | **NI** | Backend correct, no frontend |
| 8.2 | Error states | Not-found appointment handled | **PASS (BE)** | 404 with clear message from all views |
| 8.3 | Error states | Ownership mismatch handled | **PASS (BE)** | 403 with clear message, no detail leak |
| 8.4 | Error states | Expired checkout handled | **NI** | No frontend; backend returns data regardless of checkout status |
| 8.5 | Error states | Reschedule race condition handled | **PASS (BE)** | 409 Conflict with clear message |
| 9.1 | Mobile | No window.open() calls | **NI** | No frontend pages exist |
| 9.2 | Mobile | Twilio loaded with ssr:false | **NI** | No frontend pages exist |
| 9.3 | Mobile | Slot picker mobile-safe | **NI** | No frontend pages exist |
| 9.4 | Mobile | Auth gate WKWebView-safe | **NI** | No frontend pages exist |
| 10.1 | Attribution | Reschedule does not replace attribution | **PASS** | `BookingRescheduleView` never touches `BookingAttribution` |
| 10.2 | Attribution | No new attribution created on reschedule | **PASS** | No `create()` or `update_or_create()` in reschedule view |
| 10.3 | Attribution | CheckoutSession preserved on reschedule | **PASS** | Reschedule view does not reference checkout session |
| 10.4 | Attribution | fee_tier matches fee_percent | **PASS** | Single write path; values set simultaneously |
| 11.1 | Commercial | fee_tier not re-derived on reschedule | **PASS** | Reschedule view does not call `get_booking_link_fee_percent()` |
| 11.2 | Commercial | fee_tier locked at checkout time | **PASS** | No code path modifies fee_tier post-creation |
| 11.3 | Commercial | booking_link FK unchanged on reschedule | **PASS** | Reschedule view does not modify attribution |
| 11.4 | Commercial | No cross-record fee mismatches | **PASS** | Single write path confirmed by code review |

---

## Score Summary

| Category | PASS | FAIL | RISK | NI |
|---|---|---|---|---|
| Email (1.x) | 5 | 1 | 1 | 0 |
| Join page (2.x) | 0 | 0 | 0 | 7 |
| Confirmation (3.x) | 0 | 0 | 0 | 4 |
| Management (4.x) | 0 | 0 | 0 | 7 |
| Timezone (5.x) | 3 | 0 | 0 | 1 |
| Calendar (6.x) | 4 | 2 | 0 | 0 |
| Marketplace email (7.x) | 2 | 2 | 0 | 0 |
| Error states (8.x) | 2 | 0 | 0 | 3 |
| Mobile (9.x) | 0 | 0 | 0 | 4 |
| Attribution (10.x) | 4 | 0 | 0 | 0 |
| Commercial (11.x) | 4 | 0 | 0 | 0 |
| **TOTAL** | **24** | **5** | **1** | **26** |

---

## Priority Fix List

### P0 -- Must fix before merge

1. **[1.7] RQ failure fallback** (`views.py` line 731): Wrap `send_confirmation_email_task.delay(appointment.id)` in try/except. On failure, either call `send_booking_confirmation_email()` synchronously or log a critical alert. A 500 error on the checkout completion endpoint after payment is unacceptable.

2. **[6.6] ICS endpoint missing**: Implement `GET /api/v1/booking-link/booking/<id>/ics/` returning `text/calendar` with `DTSTART`, `DTEND`, `TZID`, `SUMMARY`, `DESCRIPTION`. Add the download link to the confirmation email.

3. **[7.4] Unsubscribe mechanism**: Add an actual unsubscribe URL to all marketing emails (marketplace intro at minimum). Consider adding `List-Unsubscribe` header to all `send_email` calls.

### P1 -- Should fix before merge

4. **[6.1] Google Calendar URL**: Add `&ctz={iana_timezone}` and `&location=Online` to `_google_calendar_url()`.

5. **[1.6] Marketplace intro guard**: Add `if appointment.is_status == 'CANCELLED': return` to `send_marketplace_intro_email()`.

6. **[7.2] Contextual marketplace link**: Consider using the provider's role/specialty to build a filtered search URL instead of generic `/search`.

### P2 -- Frontend implementation (all NI items)

7. All 26 NOT IMPLEMENTED items require the three frontend pages and one container to be built. This is the bulk of the remaining RGDEV-211 work.

---

## Files Audited

### Backend (implemented)
- `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py` -- 4 email builders
- `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\tasks.py` -- 4 RQ tasks + scheduling helpers
- `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\views.py` -- `CheckoutCompleteView` (wire-in), `BookingDetailView`, `BookingRescheduleView`, `BookingCancelView`
- `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\urls.py` -- 3 new URL patterns registered
- `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\serializers.py` -- `BookingDetailSerializer`, `RescheduleSerializer`, `CancelBookingSerializer`
- `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\models.py` -- `BookingLinkCheckoutSession`, `BookingAttribution`

### Frontend (NOT implemented -- files do not exist)
- `C:\Projects\ReallyGlobal\RG-Frontend\src\pages\session\join\[appointmentId].tsx`
- `C:\Projects\ReallyGlobal\RG-Frontend\src\pages\booking\[appointmentId].tsx`
- `C:\Projects\ReallyGlobal\RG-Frontend\src\pages\booking\confirmation\[appointmentId].tsx`
- `C:\Projects\ReallyGlobal\RG-Frontend\src\containers\booking-management\BookingManagement.tsx`

### Reference (pattern comparison)
- `C:\Projects\ReallyGlobal\RG-Frontend\src\pages\meet\[room].tsx` -- existing video room pattern
