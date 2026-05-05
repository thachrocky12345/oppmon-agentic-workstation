# Fix Plan: RGDEV-211 Data Model Audit Findings

**Source audit:** `ContextFiles2/Library/Sessions/Audit_PostBookingLifecycle_DataModel_Results_2026-03-15.md`
**Date:** 2026-03-15

---

## Fix 1 — [FAIL 9.4] Review prompt email uses wrong model for `profile_handle`

**File:** `Lumy-Backend/apps/booking_link/emails.py`
**Line:** 222

**Old code:**
```python
provider_slug = getattr(provider, 'profile_handle', '') or str(provider.pk)
```

**New code:**
```python
provider_slug = getattr(provider.user, 'profile_handle', '') or str(provider.pk)
```

**Why:** `profile_handle` is a field on the `User` model (`apps/authentication/models.py:160`), not on `CareProvider`. The current code always falls through to the `str(provider.pk)` fallback (a UUID), producing broken review URLs like `/care-provider/<uuid>#review-<id>` instead of `/care-provider/<handle>#review-<id>`.

---

## Fix 2 — [FAIL EXTRA 1] BookingDetailView `provider_photo_url` uses `cp.photo` instead of `cp.user.profile_pic`

**File:** `Lumy-Backend/apps/booking_link/views.py`
**Lines:** 956-957

**Old code:**
```python
        photo_url = None
        if hasattr(cp, 'photo') and cp.photo:
            photo_url = cp.photo.url if hasattr(cp.photo, 'url') else str(cp.photo)
```

**New code:**
```python
        photo_url = None
        if cp.user.profile_pic:
            photo_url = cp.user.profile_pic
```

**Why:** Every other view in this file uses `cp.user.profile_pic` (see lines 108-109, 372). `CareProvider` has no `photo` attribute — `hasattr(cp, 'photo')` is always `False`, so `provider_photo_url` is always `None` in the response. The consistent pattern (used at lines 108 and 372 of the same file) is to read `user.profile_pic` directly; it stores a URL string, not a `FileField`.

---

## Fix 3 — [WARN EXTRA 2] BookingDetailView `provider_slug` uses wrong model for `profile_handle`

**File:** `Lumy-Backend/apps/booking_link/views.py`
**Line:** 972

**Old code:**
```python
            'provider_slug': getattr(cp, 'profile_handle', '') or '',
```

**New code:**
```python
            'provider_slug': getattr(cp.user, 'profile_handle', '') or '',
```

**Why:** Same root cause as Fix 1. `profile_handle` lives on `User`, not `CareProvider`. The current code always resolves to `''`. The `select_related('care_provider__user')` at line 925 already prefetches `cp.user`, so no extra query is needed.

---

## Fix 4 — [FAIL 6.2] `send_marketplace_intro_task` has no appointment status guard

**File:** `Lumy-Backend/apps/booking_link/tasks.py`
**Lines:** 214-218

The task currently calls `send_marketplace_intro_email` unconditionally after the `DoesNotExist` guard. A marketplace intro email will be sent even for CANCELLED appointments.

**Old code:**
```python
        return

    send_marketplace_intro_email(
        appointment, appointment.client, appointment.care_provider,
    )
```

**New code:**
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

**Why:** The plan (Section "Business Logic" item 4) states review prompt only fires if `COMPLETED`. The marketplace intro has the same intent — it should not be sent for cancelled appointments. Allowing both `COMPLETED` and `SCHEDULED` covers the edge case where the session hasn't been marked completed yet (async status update) but hasn't been cancelled. This is consistent with the guard pattern used in `send_booking_reminder_email` (`emails.py:137`) and `send_review_prompt_email` (`emails.py:211`).

**Alternative (stricter):** If only `COMPLETED` appointments should receive marketplace intros, use:
```python
    if appointment.is_status != 'COMPLETED':
```
This is the safer choice — a session that was `SCHEDULED` but never happened (no-show, etc.) shouldn't trigger a marketplace email either. **Recommend the stricter `!= 'COMPLETED'` guard.**

---

## Fix 5 — [WARN 8.2] Tasks lack outer exception handler for DB errors

**File:** `Lumy-Backend/apps/booking_link/tasks.py`
**Lines:** 146-168, 171-193, 196-218

All three non-confirmation tasks (`send_reminder_email_task`, `send_review_prompt_task`, `send_marketplace_intro_task`) catch `Appointment.DoesNotExist` but have no outer `try/except` for other exceptions (e.g., DB connection errors). If such an error occurs, the task crashes and RQ retries indefinitely.

**Fix pattern** (apply to each of the three tasks): Wrap the entire function body in a `try/except Exception` with `logger.exception()`.

Example for `send_reminder_email_task` (lines 147-168):

**Old code:**
```python
def send_reminder_email_task(appointment_id, hours_before):
    ...
    from apps.calendar_functionality.models import Appointment
    from .emails import send_booking_reminder_email

    try:
        appointment = Appointment.objects.select_related(
            'care_provider__user', 'client__user',
        ).get(id=appointment_id)
    except Appointment.DoesNotExist:
        logger.error(
            "send_reminder_email_task: appointment %s not found",
            appointment_id,
        )
        return

    send_booking_reminder_email(
        appointment, appointment.client, appointment.care_provider, hours_before,
    )
```

**New code:**
```python
def send_reminder_email_task(appointment_id, hours_before):
    ...
    from apps.calendar_functionality.models import Appointment
    from .emails import send_booking_reminder_email

    try:
        appointment = Appointment.objects.select_related(
            'care_provider__user', 'client__user',
        ).get(id=appointment_id)
    except Appointment.DoesNotExist:
        logger.error(
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

    send_booking_reminder_email(
        appointment, appointment.client, appointment.care_provider, hours_before,
    )
```

Apply the same pattern to `send_review_prompt_task` and `send_marketplace_intro_task`.

**Why:** Without an outer handler, a transient DB error causes the task to raise an unhandled exception. Depending on RQ configuration, this can result in infinite retries or a dead-letter state. The confirmation task already has a secondary `try/except Exception` block (line 50). The email builders themselves are also wrapped in `try/except Exception` (audit check 9.5), but the DB fetch is not.

---

## Fix 6 — [WARN EXTRA 3] Tasks use `logger.error()` instead of `logger.exception()`

**File:** `Lumy-Backend/apps/booking_link/tasks.py`
**Lines:** 33, 160, 185, 210

**Old code (all 4 occurrences):**
```python
        logger.error(
```

**New code (all 4 occurrences):**
```python
        logger.exception(
```

**Why:** `logger.error()` logs the message but no traceback. `logger.exception()` includes the full traceback, which is critical for diagnosing `DoesNotExist` (stale references) and other failures. This aligns with the pattern in `apps/attribution/tasks.py:29`.

**Note:** This is minor — `DoesNotExist` tracebacks are not very informative. But consistency with the project pattern and the value for the outer exception handler (Fix 5) makes this worthwhile.

---

## WARN Items — Deferred (No Code Change Required Now)

### [WARN 1.5] Sequential integer appointment IDs in URLs
**Risk:** Enumerable IDs allow probing (mitigated by ownership check returning 403/404).
**Recommendation:** Consider adding a UUID lookup field to `Appointment` or using the checkout session UUID in URLs. This is a design change, not a bug fix. Defer to a security hardening pass.

### [WARN 3.2] No synchronous fallback for confirmation email if RQ is down
**Risk:** If RQ is unavailable, confirmation email is never sent.
**Recommendation:** Consider wrapping the `.delay()` call in a `try/except` that falls back to synchronous `send_booking_confirmation_email()`. Defer — RQ availability is an infrastructure concern.

### [WARN 4.4] No explicit past-appointment guard in `_can_modify_booking`
**Risk:** Relies on cancellation window math rather than an explicit `start_date_time < now` check.
**Recommendation:** Add `if appointment.start_date_time <= timezone.now(): return False` as the first check in `_can_modify_booking()`. Low priority — current math is correct for all `cancellation_window_hours >= 0`.

---

## Fix 7 — [FAIL 12.1-12.4] No RGDEV-211 tests exist

**File to create:** `Lumy-Backend/apps/booking_link/tests/test_post_booking.py`

No test code exists for any RGDEV-211 feature. The following test cases must be written:

### A. BookingDetailView Tests

| # | Test Name | Description |
|---|---|---|
| A1 | `test_booking_detail_returns_200_for_owner` | Authenticated client who owns the appointment gets 200 with correct fields |
| A2 | `test_booking_detail_returns_403_for_non_owner` | Authenticated client who does NOT own the appointment gets 403 |
| A3 | `test_booking_detail_returns_401_unauthenticated` | Unauthenticated request gets 401 |
| A4 | `test_booking_detail_returns_404_nonexistent` | Valid auth, non-existent appointment ID returns 404 |
| A5 | `test_booking_detail_includes_provider_photo_url` | Response `provider_photo_url` is populated from `cp.user.profile_pic` (not None) |
| A6 | `test_booking_detail_includes_provider_slug` | Response `provider_slug` matches `cp.user.profile_handle` |
| A7 | `test_booking_detail_includes_client_timezone` | Response `client_timezone` comes from `BookingLinkCheckoutSession.client_timezone` |
| A8 | `test_booking_detail_can_modify_within_window` | `can_reschedule` and `can_cancel` are `True` when within cancellation window |
| A9 | `test_booking_detail_cannot_modify_outside_window` | `can_reschedule` and `can_cancel` are `False` when outside cancellation window |
| A10 | `test_booking_detail_cancelled_appointment` | Returns 200 with `status=CANCELLED`, `can_reschedule=False`, `can_cancel=False` |

### B. BookingRescheduleView Tests

| # | Test Name | Description |
|---|---|---|
| B1 | `test_reschedule_success` | Valid reschedule: old slot released, new slot assigned, appointment times updated |
| B2 | `test_reschedule_returns_403_for_non_owner` | Non-owner gets 403 |
| B3 | `test_reschedule_returns_400_outside_window` | Reschedule blocked when within cancellation window (too close to session) |
| B4 | `test_reschedule_returns_409_slot_taken` | Returns 409 when new slot is already booked |
| B5 | `test_reschedule_returns_400_past_slot` | Returns 400 when new slot is in the past |
| B6 | `test_reschedule_atomicity` | Old slot release and new slot assignment are atomic (simulate concurrent request) |
| B7 | `test_reschedule_cancelled_appointment` | Returns 400 when appointment is already CANCELLED |

### C. BookingCancelView Tests

| # | Test Name | Description |
|---|---|---|
| C1 | `test_cancel_success` | Valid cancellation: status set to CANCELLED, slot released |
| C2 | `test_cancel_returns_403_for_non_owner` | Non-owner gets 403 |
| C3 | `test_cancel_returns_400_outside_window` | Cancel blocked when within cancellation window |
| C4 | `test_cancel_already_cancelled` | Returns 400 with "already cancelled" message |
| C5 | `test_cancel_with_reason` | Reason is saved to appointment |
| C6 | `test_cancel_slot_released` | Slot `appointment_id` is set to None after cancellation |

### D. Email Builder Tests

| # | Test Name | Description |
|---|---|---|
| D1 | `test_confirmation_email_sends` | `send_booking_confirmation_email` calls `send_email` with correct args |
| D2 | `test_confirmation_email_skips_no_email` | Skips when client has no email address |
| D3 | `test_reminder_email_skips_cancelled` | `send_booking_reminder_email` skips when `is_status != SCHEDULED` |
| D4 | `test_review_prompt_skips_not_completed` | `send_review_prompt_email` skips when `is_status != COMPLETED` |
| D5 | `test_review_prompt_uses_profile_handle` | Review URL contains `provider.user.profile_handle`, not UUID |
| D6 | `test_marketplace_intro_skips_cancelled` | `send_marketplace_intro_email` skips when `is_status == CANCELLED` (after Fix 4) |

### E. Task Tests

| # | Test Name | Description |
|---|---|---|
| E1 | `test_confirmation_task_schedules_reminders` | `send_confirmation_email_task` calls `_schedule_reminders` and `_schedule_post_session_emails` |
| E2 | `test_confirmation_task_handles_missing_appointment` | Returns gracefully when appointment doesn't exist |
| E3 | `test_marketplace_intro_task_guards_status` | `send_marketplace_intro_task` skips when `is_status != COMPLETED` (after Fix 4) |
| E4 | `test_reminder_scheduling_skips_past` | `_schedule_reminders` skips scheduling when reminder time is in the past |

### F. Cancellation Window Tests

| # | Test Name | Description |
|---|---|---|
| F1 | `test_can_modify_within_window` | `_can_modify_booking` returns True when now < start - window |
| F2 | `test_cannot_modify_outside_window` | Returns False when now >= start - window |
| F3 | `test_default_window_24h` | Default cancellation window is 24 hours when provider has none set |

---

## Implementation Order

1. **Fix 1** (emails.py:222) — `provider.user.profile_handle` — 1 line
2. **Fix 2** (views.py:956-957) — `cp.user.profile_pic` — 2 lines
3. **Fix 3** (views.py:972) — `cp.user.profile_handle` — 1 line
4. **Fix 4** (tasks.py:214-218) — marketplace intro status guard — 7 lines
5. **Fix 5** (tasks.py) — outer exception handlers on 3 tasks — ~15 lines
6. **Fix 6** (tasks.py) — `logger.error` -> `logger.exception` — 4 lines
7. **Fix 7** — write test file — ~300-400 lines estimated

Fixes 1-4 are blockers. Fixes 5-6 are improvements. Fix 7 is required for merge.

---

## Estimated Effort

- Fixes 1-6: 15 minutes (mechanical changes, fully specified above)
- Fix 7 (tests): 2-3 hours (34 test cases across 6 categories)
