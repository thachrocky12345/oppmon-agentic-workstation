# Final Corrected Plan: RGDEV-211 Post-Booking Lifecycle

**Ticket:** RGDEV-211 | **Date:** 2026-03-15
**Source audits:** DataModel + UXScenario | **Fix plans:** A (DataModel) + B (UXScenario)
**Scope:** Backend fixes only. Frontend pages (all 26 NI items) are out of scope for this execution pass.

---

## Section 1 -- What Was Correctly Implemented (Keep As-Is)

The EXECUTE agent MUST NOT modify any of these:

- **Auth/ownership checks** on all 3 views (BookingDetailView, BookingRescheduleView, BookingCancelView) -- PASS
- **Atomic slot swap** in BookingRescheduleView with `select_for_update()` -- PASS
- **Cancellation window logic** in `_can_modify_booking()` and `_get_cancellation_window_hours()` -- PASS
- **Appointment status transitions** in BookingCancelView (CANCELLED + slot release in atomic block) -- PASS
- **Already-cancelled guard** in BookingCancelView (returns 400) -- PASS
- **Confirmation email task wire-in** at `views.py:731` (after `confirm_and_notify`, outside `transaction.atomic()`) -- PASS
- **Reminder scheduling** in `_schedule_reminders()` with past-time guards -- PASS
- **Post-session scheduling** in `_schedule_post_session_emails()` -- PASS
- **RQ task parameter pattern** (all tasks take primitive `appointment_id`, query DB inside) -- PASS
- **Deferred imports** inside all 4 task functions -- PASS
- **Timezone handling** (`BookingDetailView` returns `client_timezone` from checkout session) -- PASS
- **Serializers** (`BookingDetailSerializer`, `RescheduleSerializer`, `CancelBookingSerializer`) -- PASS
- **URL patterns** for booking detail/reschedule/cancel -- PASS
- **Reminder email SCHEDULED guard** at execution time (`emails.py:137`) -- PASS
- **Review prompt COMPLETED guard** at execution time (`emails.py:211`) -- PASS
- **Attribution preservation** on reschedule (no `BookingAttribution` modification) -- PASS
- **Fee tier immutability** on reschedule -- PASS

---

## Section 2 -- Fixes Required (Ordered by Severity)

### Fix 1 -- RQ Broker Failure Causes 500 After Committed Payment

- **Severity:** Critical
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\views.py`
- **Lines:** 729-731
- **Problem:** If Redis/RQ is down, `send_confirmation_email_task.delay()` raises `ConnectionError` which propagates as a 500 to the client AFTER their payment and appointment have been committed. The client sees an error after paying.
- **Fix:**

**Old (lines 729-731):**
```python
        # RGDEV-211: Enqueue booking confirmation email + schedule reminders
        from .tasks import send_confirmation_email_task
        send_confirmation_email_task.delay(appointment.id)
```

**New:**
```python
        # RGDEV-211: Enqueue booking confirmation email + schedule reminders.
        # Wrapped in try/except: if RQ broker is down, the appointment is
        # already committed -- the client must receive a success response.
        try:
            from .tasks import send_confirmation_email_task
            send_confirmation_email_task.delay(appointment.id)
        except Exception:
            logger.critical(
                "RGDEV-211: Failed to enqueue confirmation email task for "
                "appointment %s -- RQ broker may be down. Appointment exists "
                "but client will NOT receive confirmation email or reminders.",
                appointment.id,
                exc_info=True,
            )
```

---

### Fix 2 -- Review Prompt Email Uses Wrong Model for `profile_handle`

- **Severity:** High
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py`
- **Line:** 222
- **Problem:** `getattr(provider, 'profile_handle', '')` looks on `CareProvider` but `profile_handle` is on `User`. Always falls through to UUID fallback, producing broken review URLs.
- **Fix:**

**Old (line 222):**
```python
        provider_slug = getattr(provider, 'profile_handle', '') or str(provider.pk)
```

**New:**
```python
        provider_slug = getattr(provider.user, 'profile_handle', '') or str(provider.pk)
```

---

### Fix 3 -- BookingDetailView `provider_photo_url` Uses Wrong Attribute

- **Severity:** High
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\views.py`
- **Lines:** 955-957
- **Problem:** `hasattr(cp, 'photo') and cp.photo` -- `CareProvider` has no `photo` field. Every other view in this file uses `cp.user.profile_pic`. Result: `provider_photo_url` is always `None`.
- **Fix:**

**Old (lines 955-957):**
```python
        photo_url = None
        if hasattr(cp, 'photo') and cp.photo:
            photo_url = cp.photo.url if hasattr(cp.photo, 'url') else str(cp.photo)
```

**New:**
```python
        photo_url = None
        if cp.user.profile_pic:
            photo_url = cp.user.profile_pic
```

---

### Fix 4 -- BookingDetailView `provider_slug` Uses Wrong Model

- **Severity:** High
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\views.py`
- **Line:** 972
- **Problem:** `getattr(cp, 'profile_handle', '')` -- same wrong-model bug as Fix 2. `profile_handle` is on `User`, not `CareProvider`. Always returns empty string.
- **Fix:**

**Old (line 972):**
```python
            'provider_slug': getattr(cp, 'profile_handle', '') or '',
```

**New:**
```python
            'provider_slug': getattr(cp.user, 'profile_handle', '') or '',
```

---

### Fix 5 -- `send_marketplace_intro_task` Has No Appointment Status Guard

- **Severity:** High
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\tasks.py`
- **Lines:** 214-218
- **Problem:** Marketplace intro email fires for cancelled appointments. Both the task and `send_marketplace_intro_email()` lack a status check. This also needs a guard in `emails.py`.
- **Fix (tasks.py):**

**Old (lines 214-218):**
```python
        return

    send_marketplace_intro_email(
        appointment, appointment.client, appointment.care_provider,
    )
```

**New:**
```python
        return

    if appointment.is_status not in ('COMPLETED', 'SCHEDULED'):
        logger.info(
            "send_marketplace_intro_task: appointment %s is %s, skipping",
            appointment_id, appointment.is_status,
        )
        return

    send_marketplace_intro_email(
        appointment, appointment.client, appointment.care_provider,
    )
```

**Also fix (emails.py) -- add guard inside `send_marketplace_intro_email` after the `if not client_email: return` block (after line 272):**

**Old (lines 269-272):**
```python
    try:
        client_email = client.user.email
        if not client_email:
            return
```

**New:**
```python
    try:
        client_email = client.user.email
        if not client_email:
            return

        # Guard: do not send marketplace intro for cancelled appointments
        if appointment.is_status == 'CANCELLED':
            logger.info(
                "send_marketplace_intro_email: appointment %s is CANCELLED, skipping",
                appointment.pk,
            )
            return
```

**Rationale:** Double guard (task + email builder) provides defense-in-depth. The task guard uses `not in ('COMPLETED', 'SCHEDULED')` to also skip other terminal states; the email builder guard specifically blocks CANCELLED as the most common bad case.

---

### Fix 6 -- Google Calendar URL Missing `ctz` and `location` Parameters

- **Severity:** Medium
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py`
- **Lines:** 28-39 (function signature + body), line 75 (caller)
- **Problem:** Without `ctz`, Google Calendar may display the event in the wrong timezone. Without `location`, the event has no location.
- **Fix (function, lines 28-39):**

**Old:**
```python
def _google_calendar_url(appointment, provider_name):
    """Build an 'Add to Google Calendar' URL for the appointment."""
    start = appointment.start_date_time.strftime("%Y%m%dT%H%M%SZ")
    end = appointment.end_date_time.strftime("%Y%m%dT%H%M%SZ")
    title = quote(f"Session with {provider_name}")
    details = quote(
        f"Join your session: {SITE_BASE_URL}/session/join/{appointment.id}"
    )
    return (
        f"https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={title}&dates={start}/{end}&details={details}"
    )
```

**New:**
```python
def _google_calendar_url(appointment, provider_name, tz_name=''):
    """Build an 'Add to Google Calendar' URL for the appointment."""
    start = appointment.start_date_time.strftime("%Y%m%dT%H%M%SZ")
    end = appointment.end_date_time.strftime("%Y%m%dT%H%M%SZ")
    title = quote(f"Session with {provider_name}")
    details = quote(
        f"Join your session: {SITE_BASE_URL}/session/join/{appointment.id}"
    )
    url = (
        f"https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={title}&dates={start}/{end}&details={details}"
        f"&location={quote('Online')}"
    )
    if tz_name:
        url += f"&ctz={quote(tz_name)}"
    return url
```

**Fix (caller at line 75):**

**Old:**
```python
        gcal_url = _google_calendar_url(appointment, provider_name)
```

**New:**
```python
        gcal_url = _google_calendar_url(appointment, provider_name, tz_name)
```

---

### Fix 7 -- Tasks Lack Outer Exception Handler for DB Errors

- **Severity:** Medium
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\tasks.py`
- **Lines:** 155-164, 180-189, 205-214
- **Problem:** `send_reminder_email_task`, `send_review_prompt_task`, and `send_marketplace_intro_task` catch `Appointment.DoesNotExist` but no other exceptions. A transient DB error causes the task to crash and RQ to retry indefinitely.
- **Fix:** Add `except Exception` after each `except Appointment.DoesNotExist` block in all 3 tasks.

**Pattern to apply to each (example for `send_reminder_email_task`, lines 159-164):**

**Old:**
```python
    except Appointment.DoesNotExist:
        logger.error(
            "send_reminder_email_task: appointment %s not found",
            appointment_id,
        )
        return
```

**New:**
```python
    except Appointment.DoesNotExist:
        logger.exception(
            "send_reminder_email_task: appointment %s not found",
            appointment_id,
        )
        return
    except Exception:
        logger.exception(
            "send_reminder_email_task: unexpected error fetching appointment %s",
            appointment_id,
        )
        return
```

Apply identical pattern to `send_review_prompt_task` (lines 184-189) and `send_marketplace_intro_task` (lines 209-214). Note: this also addresses Fix 8 (`logger.error` -> `logger.exception`) for these 3 tasks.

---

### Fix 8 -- Tasks Use `logger.error()` Instead of `logger.exception()`

- **Severity:** Medium
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\tasks.py`
- **Lines:** 33, 160, 185, 210
- **Problem:** `logger.error()` omits tracebacks. The project pattern (`apps/attribution/tasks.py`) uses `logger.exception()`.
- **Fix:** Change all 4 `logger.error(` calls to `logger.exception(`. Note: lines 160, 185, 210 are already addressed by Fix 7 above. Only line 33 (in `send_confirmation_email_task`) is standalone:

**Old (line 33):**
```python
        logger.error(
```

**New (line 33):**
```python
        logger.exception(
```

---

### Fix 9 -- Add `SCHEDULED` Guard to `_schedule_reminders`

- **Severity:** Medium
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\tasks.py`
- **Lines:** 73-74 (after `if not start: return`)
- **Problem:** `_schedule_reminders` does not check `appointment.is_status` before scheduling. Currently only called from `send_confirmation_email_task` (safe), but if called from another context it would schedule reminders for non-SCHEDULED appointments.
- **Fix:**

**Old (lines 72-74):**
```python
    if not start:
        return
```

**New:**
```python
    if not start:
        return

    if appointment.is_status != 'SCHEDULED':
        logger.info(
            "_schedule_reminders: appointment %s is %s, not scheduling reminders",
            appointment.id, appointment.is_status,
        )
        return
```

---

### Fix 10 -- Marketplace Intro Email Unsubscribe Link

- **Severity:** Medium
- **File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py`
- **Lines:** 297-300
- **Problem:** Footer references "account settings" but provides no URL. CAN-SPAM/GDPR require a functional unsubscribe mechanism in marketing emails.
- **Fix:**

**Old (lines 296-300):**
```python
<p style="margin-top:24px;">-- The Really Global Team</p>
<p style="font-size:12px;color:#999;">
  You received this because you booked a session on Really Global.
  You can manage your notification preferences in your account settings.
</p>
```

**New:**
```python
<p style="margin-top:24px;">-- The Really Global Team</p>
<p style="font-size:12px;color:#999;">
  You received this because you booked a session on Really Global.
  <a href="{SITE_BASE_URL}/settings/notifications" style="color:#999;">
    Manage your notification preferences</a> or
  <a href="{SITE_BASE_URL}/settings/notifications?unsubscribe=marketing" style="color:#999;">
    unsubscribe from marketing emails</a>.
</p>
```

---

## Deferred Items (NOT in this execution pass)

These are acknowledged findings that should NOT be addressed now:

1. **ICS endpoint** (UX Fix Plan Fix 2) -- new view + URL + email link. Significant new code that should be its own sub-task, not a bug fix. Defer to a follow-up ticket.
2. **Contextual marketplace search URL** (UX audit 7.2) -- requires verifying frontend `/search?role=` support. Defer.
3. **Sequential integer appointment IDs** (DataModel WARN 1.5) -- design change, not a bug. Defer to security hardening.
4. **Explicit past-appointment guard** (DataModel WARN 4.4) -- current math is correct. Defer.
5. **UTC label on empty timezone** (UX Fix Plan Fix 11) -- minor UX, defer.
6. **All 26 frontend NI items** -- the 3 pages + 1 container are the bulk of remaining RGDEV-211 work and require design (RGDEV-208).
7. **`List-Unsubscribe` header** -- requires changes to the shared `send_email` utility. File a separate ticket.

---

## Section 3 -- Tests to Write

**File to create:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\tests\test_post_booking.py`

All tests use `django.test.TestCase` with `APIClient`. Create fixtures: one User+Client (owner), one User+CareProvider (with `profile_pic` and `profile_handle` set on user), one `Appointment` linked to both, one `BookingLinkCheckoutSession`, and one `CalendarSlot`.

### A. BookingDetailView Tests

| # | Method | Asserts |
|---|---|---|
| A1 | `test_booking_detail_returns_200_for_owner` | Authenticated owner gets 200 with all expected fields present |
| A2 | `test_booking_detail_returns_403_for_non_owner` | Different authenticated user gets 403 |
| A3 | `test_booking_detail_returns_401_unauthenticated` | Unauthenticated request gets 401 |
| A4 | `test_booking_detail_returns_404_nonexistent` | Valid auth, non-existent appointment ID returns 404 |
| A5 | `test_booking_detail_includes_provider_photo_url` | `provider_photo_url` is populated from `cp.user.profile_pic` (not None) |
| A6 | `test_booking_detail_includes_provider_slug` | `provider_slug` matches `cp.user.profile_handle` |
| A7 | `test_booking_detail_includes_client_timezone` | `client_timezone` comes from `BookingLinkCheckoutSession.client_timezone` |
| A8 | `test_booking_detail_can_modify_within_window` | `can_reschedule` and `can_cancel` are True when appointment is >24h away |
| A9 | `test_booking_detail_cannot_modify_outside_window` | `can_reschedule` and `can_cancel` are False when appointment is <24h away |
| A10 | `test_booking_detail_cancelled_appointment` | Returns 200 with `status=CANCELLED`, `can_reschedule=False`, `can_cancel=False` |

### B. BookingRescheduleView Tests

| # | Method | Asserts |
|---|---|---|
| B1 | `test_reschedule_success` | Returns 200; old slot released (`appointment_id=None`); new slot assigned; appointment times updated |
| B2 | `test_reschedule_returns_403_for_non_owner` | Different user gets 403 |
| B3 | `test_reschedule_returns_400_outside_window` | Returns 400 when within cancellation window (too close to session) |
| B4 | `test_reschedule_returns_409_slot_taken` | Returns 409 when new slot already has an appointment |
| B5 | `test_reschedule_returns_400_past_slot` | Returns 400 when new slot's start_date_time is in the past |
| B6 | `test_reschedule_cancelled_appointment` | Returns 400 when appointment.is_status is CANCELLED |

### C. BookingCancelView Tests

| # | Method | Asserts |
|---|---|---|
| C1 | `test_cancel_success` | Returns 200; `is_status` set to CANCELLED; slot released |
| C2 | `test_cancel_returns_403_for_non_owner` | Different user gets 403 |
| C3 | `test_cancel_returns_400_outside_window` | Returns 400 when within cancellation window |
| C4 | `test_cancel_already_cancelled` | Returns 400 with "already cancelled" message |
| C5 | `test_cancel_with_reason` | `appointment.reason` is set to the provided reason |
| C6 | `test_cancel_slot_released` | Slot's `appointment_id` is None after cancellation |

### D. Email Builder Tests

| # | Method | Asserts |
|---|---|---|
| D1 | `test_confirmation_email_sends` | `send_email` called with correct recipient, subject contains provider name |
| D2 | `test_confirmation_email_skips_no_email` | `send_email` not called when client has no email |
| D3 | `test_reminder_email_skips_cancelled` | `send_email` not called when `is_status != SCHEDULED` |
| D4 | `test_review_prompt_skips_not_completed` | `send_email` not called when `is_status != COMPLETED` |
| D5 | `test_review_prompt_uses_profile_handle` | Review URL in email content contains `provider.user.profile_handle`, not UUID |
| D6 | `test_marketplace_intro_skips_cancelled` | `send_email` not called when `is_status == CANCELLED` (validates Fix 5) |

### E. Task Tests

| # | Method | Asserts |
|---|---|---|
| E1 | `test_confirmation_task_calls_email_and_schedulers` | Mock `send_booking_confirmation_email`, `_schedule_reminders`, `_schedule_post_session_emails`; verify all called |
| E2 | `test_confirmation_task_handles_missing_appointment` | Returns gracefully (no exception) when appointment doesn't exist |
| E3 | `test_marketplace_intro_task_guards_status` | Skips when `is_status == CANCELLED` (validates Fix 5) |
| E4 | `test_reminder_scheduling_skips_past` | `_schedule_reminders` does not call `scheduler.enqueue_at` when reminder time is in the past |

### F. Cancellation Window Tests

| # | Method | Asserts |
|---|---|---|
| F1 | `test_can_modify_within_window` | `_can_modify_booking` returns True when `now < start - window` |
| F2 | `test_cannot_modify_outside_window` | Returns False when `now >= start - window` |
| F3 | `test_default_window_24h` | Default cancellation window is 24 hours when provider has no `cancellation_window_hours` |

**Total: 33 test cases across 6 categories.**

---

## Section 4 -- Do NOT Change

The EXECUTE agent MUST NOT modify:

1. `apps/booking_link/serializers.py` -- all serializers are correct (PASS in both audits)
2. `apps/booking_link/urls.py` -- URL patterns are correct (only add ICS URL if ICS view is being added, which is deferred)
3. `BookingRescheduleView` class in `views.py` -- atomic slot swap, ownership check, window check, 409 conflict handling all PASS
4. `BookingCancelView` class in `views.py` -- status transition, slot release, already-cancelled guard, ownership check all PASS
5. `_can_modify_booking()` and `_get_cancellation_window_hours()` in `views.py` -- correct logic, PASS
6. `send_booking_confirmation_email()` in `emails.py` (except the GCal URL caller change in Fix 6)
7. `send_booking_reminder_email()` in `emails.py` -- SCHEDULED guard at line 137 is correct, PASS
8. `send_review_prompt_email()` in `emails.py` -- COMPLETED guard at line 211 is correct (only fix line 222 per Fix 2)
9. `_format_datetime_for_email()` in `emails.py` -- timezone conversion is correct, PASS
10. `_schedule_post_session_emails()` in `tasks.py` -- scheduling logic is correct, PASS
11. `send_confirmation_email_task()` in `tasks.py` -- deferred imports, DB fetch, booking_link_slug logic all PASS (only change line 33 per Fix 8)
12. All attribution-related behavior -- `BookingAttribution` is correctly untouched by reschedule/cancel, PASS
13. All existing tests in `apps/booking_link/tests.py` -- these cover RGDEV-204 features, do not modify

---

## Execution Order

1. Fix 1 (Critical) -- `views.py` RQ broker try/except
2. Fix 2 (High) -- `emails.py:222` provider.user.profile_handle
3. Fix 3 (High) -- `views.py:955-957` cp.user.profile_pic
4. Fix 4 (High) -- `views.py:972` cp.user.profile_handle
5. Fix 5 (High) -- `tasks.py` + `emails.py` marketplace intro status guards
6. Fix 6 (Medium) -- `emails.py` GCal URL ctz + location
7. Fix 7 (Medium) -- `tasks.py` outer exception handlers on 3 tasks
8. Fix 8 (Medium) -- `tasks.py:33` logger.error -> logger.exception
9. Fix 9 (Medium) -- `tasks.py` _schedule_reminders SCHEDULED guard
10. Fix 10 (Medium) -- `emails.py` unsubscribe link
11. Tests -- create `test_post_booking.py` with 33 test cases
