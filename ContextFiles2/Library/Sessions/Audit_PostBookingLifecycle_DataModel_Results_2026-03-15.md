# Audit Results: RGDEV-211 Post-Booking Lifecycle — Data Model / Technical

**Auditor:** A (Data Model, Security, Task, Email)
**Date:** 2026-03-15
**Scope:** `apps/booking_link/` — views, tasks, emails, serializers, urls
**Plan:** `ContextFiles2/Library/Plans/Plan_RGDEV-211_PostBookingLifecycle_2026-03-15.md`

---

## Section 1: Authentication and Ownership (IDOR Prevention)

### [CHECK 1.1] PASS
**Evidence:** `views.py:914` — `permission_classes = [IsAuthenticated]` on `BookingDetailView`.

### [CHECK 1.2] PASS
**Evidence:** `views.py:929` — `if appointment.client.user != request.user:` returns HTTP 403.

### [CHECK 1.3] PASS
**Evidence:** `views.py:990` — `permission_classes = [IsAuthenticated]` on `BookingRescheduleView`.
`views.py:1005` — ownership check `appointment.client.user != request.user` returns HTTP 403, executed before any mutation.

### [CHECK 1.4] PASS
**Evidence:** `views.py:1086` — `permission_classes = [IsAuthenticated]` on `BookingCancelView`.
`views.py:1101` — ownership check returns HTTP 403 before any mutation.

### [CHECK 1.5] WARN
**Evidence:** `urls.py:32-34` — All 3 URL patterns use `<int:appointment_id>`.
`calendar_functionality/models.py:79` — `Appointment` extends `BaseModel` which uses auto-increment integer PK.
**Note:** Sequential integer IDs are enumerable. The ownership check (1.2/1.3/1.4) is the only guard. The plan says "All external links use `appointment.id` (UUID from `BookingLinkCheckoutSession.appointment`)" — this is inaccurate; `Appointment.id` is an auto-increment integer, not a UUID. Consider switching to a UUID lookup field or using a different identifier in URLs.

---

## Section 2: Race Conditions — Reschedule Slot Swap

### [CHECK 2.1] PASS
**Evidence:** `views.py:1027-1033` — `transaction.atomic()` wraps the block. `CalendarSlot.objects.select_for_update().filter(id=new_slot_id, appointment_id__isnull=True, care_provider=cp)` correctly locks the new slot.

### [CHECK 2.2] PASS
**Evidence:** `views.py:1049-1055` — Old slot's `appointment_id` set to `None` inside the same `transaction.atomic()` block (lines 1027-1068). Both old slot release and new slot assignment are atomic.

### [CHECK 2.3] PASS
**Evidence:** `views.py:1062-1068` — `appointment.start_date_time`, `end_date_time`, `duration`, `timezone` all updated and `appointment.save(update_fields=[...])` called inside the atomic block.

### [CHECK 2.4] PASS
**Evidence:** `views.py:1036-1039` — Returns `HTTP_409_CONFLICT` when new slot is not available (`select_for_update` returns None).

---

## Section 3: Email Reliability and Task Wiring

### [CHECK 3.1] PASS
**Evidence:** `views.py:730-731` — `send_confirmation_email_task.delay(appointment.id)` is called at line 731, AFTER the `with transaction.atomic():` block closes at line 721. The import is also deferred (`from .tasks import send_confirmation_email_task` at line 730).

### [CHECK 3.2] WARN
**Evidence:** `views.py:730-731` — Only `send_confirmation_email_task.delay()` is called. There is no synchronous fallback for the confirmation email. If RQ is down, the confirmation email will never be sent.
**Note:** Known gap per plan. WARN — consider adding synchronous fallback for confirmation-only email.

### [CHECK 3.3] PASS
**Evidence:** `tasks.py:66-104` — `_schedule_reminders()`:
- 24h reminder: `start - timedelta(hours=24)` at line 77. Correct.
- 1h reminder: `start - timedelta(hours=1)` at line 92. Correct.
- Uses `django_rq.get_scheduler('default').enqueue_at()` at lines 80, 95. Correct.

### [CHECK 3.4] PASS
**Evidence:** `tasks.py:78` — `if reminder_24h > now:` guards 24h reminder.
`tasks.py:93` — `if reminder_1h > now:` guards 1h reminder.
Past-scheduled reminders are correctly skipped.

### [CHECK 3.5] PASS
**Evidence:** `tasks.py:107-143` — `_schedule_post_session_emails()`:
- Review prompt: `end + timedelta(hours=2)` at line 118. Uses `end_date_time`. Correct.
- Marketplace intro: `end + timedelta(hours=24)` at line 132. Uses `end_date_time`. Correct.
- Both have `> now` guards (lines 119, 133).

---

## Section 4: Cancellation Window Logic

### [CHECK 4.1] PASS
**Evidence:** `views.py:898-904` — `_can_modify_booking()`: `cutoff = appointment.start_date_time - timedelta(hours=window_hours)`, returns `timezone.now() < cutoff`. This correctly blocks if NOW is past the window deadline. Used by both `BookingRescheduleView` (line 1013) and `BookingCancelView` (line 1116).

### [CHECK 4.2] PASS
**Evidence:** `views.py:893-895` — `_get_cancellation_window_hours()` uses `getattr(care_provider, 'cancellation_window_hours', 24) or 24`. Default is 24, consistent with `CheckoutCancellationPolicyView` at line 758.

### [CHECK 4.3] PASS
**Evidence:** `views.py:1015-1021` (reschedule) and `views.py:1117-1124` (cancel) — Both return HTTP 400 with message including window hours: `f'Cannot reschedule/cancel within {window} hours of the session.'` and include `cancellation_window_hours` in the response body.

### [CHECK 4.4] WARN
**Evidence:** `views.py:898-904` — `_can_modify_booking()` checks `is_status != 'SCHEDULED'` first (which catches COMPLETED/CANCELLED appointments) and then checks the cancellation window. However, there is NO explicit guard for `appointment.start_date_time < timezone.now()` (appointment already started). The window check implicitly handles this IF `cancellation_window_hours >= 0`. With the default of 24, a past appointment would fail the window check. But if a provider sets `cancellation_window_hours = 0`, then `cutoff = start_date_time` and `timezone.now() < start_date_time` would need to be true — so an in-progress appointment would correctly be blocked. **However**, the `is_status` check relies on the appointment being updated to COMPLETED after the session ends, which is done by an external process. If the appointment is still SCHEDULED but the session time has passed and `cancellation_window_hours = 0`, the window check `now < start` would return False, so it would be blocked. This is correct but relies on math rather than an explicit guard.
**Note:** Consider adding an explicit `appointment.start_date_time < timezone.now()` guard for clarity and defense-in-depth.

---

## Section 5: Appointment Status Transitions

### [CHECK 5.1] PASS
**Evidence:** `views.py:1141` — `appointment.is_status = 'CANCELLED'`. Verified against `calendar_functionality/constants.py:10`: `("CANCELLED", "cancelled")`. Exact string match. `appointment.save(update_fields=['is_status', 'reason'])` at line 1143.

### [CHECK 5.2] PASS
**Evidence:** `views.py:1130-1143` — Inside `transaction.atomic()`: slot found via `CalendarSlot.objects.select_for_update().filter(appointment_id=appointment.id, care_provider=cp)`, slot released (`appointment_id = None`), and appointment status updated to CANCELLED. Both operations are inside the same atomic block.

### [CHECK 5.3] PASS
**Evidence:** `views.py:1108-1112` — Guard: `if appointment.is_status == 'CANCELLED': return Response({'error': 'This appointment has already been cancelled.'}, status=HTTP_400_BAD_REQUEST)`.

---

## Section 6: Review Prompt Guard

### [CHECK 6.1] PASS (via delegation)
**Evidence:** `tasks.py:171-193` — `send_review_prompt_task()` does NOT check status itself, but delegates to `emails.py:send_review_prompt_email()` which checks at line 211: `if appointment.is_status != 'COMPLETED': ... return`. The guard exists but is in the email builder, not the task. Functionally correct.

### [CHECK 6.2] FAIL
**Evidence:** `tasks.py:196-218` — `send_marketplace_intro_task()` does NOT check `appointment.is_status` before calling `send_marketplace_intro_email()`. `emails.py:264-313` — `send_marketplace_intro_email()` also does NOT check `appointment.is_status`. A marketplace intro email will be sent to clients whose appointments were cancelled.
**Note:** BLOCKER. Add `if appointment.is_status != 'COMPLETED': return` guard to either the task or the email builder.

### [CHECK 6.3] PASS (via delegation)
**Evidence:** `tasks.py:146-168` — `send_reminder_email_task()` does NOT check status itself, but delegates to `emails.py:send_booking_reminder_email()` which checks at line 137: `if appointment.is_status != 'SCHEDULED': ... return`. Functionally correct.

---

## Section 7: Timezone Handling

### [CHECK 7.1] PASS
**Evidence:** `views.py:939-947` — `BookingDetailView` retrieves `client_timezone` from `BookingLinkCheckoutSession.objects.filter(appointment_id=appointment.id).first()`. Sources from `checkout.client_timezone`, not from server timezone.

### [CHECK 7.2] PASS
**Evidence:** `serializers.py:175-176` — `start_date_time = serializers.DateTimeField()`, `end_date_time = serializers.DateTimeField()`. DRF's `DateTimeField` uses ISO 8601 format by default when `USE_TZ=True`. No `format=` override present that would strip tzinfo.

---

## Section 8: RQ Task Patterns

### [CHECK 8.1] PASS
**Evidence:** `tasks.py` — All four `@django_rq.job` functions use deferred imports:
- `send_confirmation_email_task` (lines 22-26): imports inside function body
- `send_reminder_email_task` (lines 152-153): imports inside function body
- `send_review_prompt_task` (lines 177-178): imports inside function body
- `send_marketplace_intro_task` (lines 203-204): imports inside function body
No model imports at module top level.

### [CHECK 8.2] WARN
**Evidence:** `tasks.py:28-37` — `send_confirmation_email_task` catches `Appointment.DoesNotExist` specifically (not broad `Exception`), logs with `logger.error()` (not `logger.exception()`), and returns. This is acceptable but inconsistent with the `apps/attribution/tasks.py` pattern which uses `except Exception` + `logger.exception()`.
`tasks.py:155-164`, `tasks.py:180-189`, `tasks.py:205-214` — Same pattern: catches `Appointment.DoesNotExist`, uses `logger.error()`, returns.
**Note:** Catching `DoesNotExist` specifically is fine for the primary fetch, but won't catch other exceptions (e.g., database connection errors). The `send_confirmation_email_task` has a secondary `try/except Exception` (line 50) for the booking link slug fetch, which is good. However, the other three tasks have NO outer exception handler — if `select_related` raises a DB error, the task will crash and RQ will retry indefinitely.

### [CHECK 8.3] PASS
**Evidence:** `tasks.py:15` — `@django_rq.job` on `send_confirmation_email_task`.
`tasks.py:146` — `@django_rq.job` on `send_reminder_email_task`.
`tasks.py:171` — `@django_rq.job` on `send_review_prompt_task`.
`tasks.py:196` — `@django_rq.job` on `send_marketplace_intro_task`.

### [CHECK 8.4] PASS
**Evidence:** `tasks.py:16` — `def send_confirmation_email_task(appointment_id):` takes a primitive integer, not an ORM object. Same for all other tasks.

---

## Section 9: Email Builder Correctness

### [CHECK 9.1] PASS
**Evidence:** `emails.py:61-68` — `send_booking_confirmation_email()` retrieves `client_timezone` from `BookingLinkCheckoutSession.client_timezone`. `_format_datetime_for_email()` (line 16-25) converts `appointment.start_date_time` to the client timezone using `pytz`.

### [CHECK 9.2] PASS
**Evidence:** `emails.py:73` — `join_url = f"{SITE_BASE_URL}/session/join/{appointment.id}"`. Uses `appointment.id`. Correct.

### [CHECK 9.3] PASS
**Evidence:** `emails.py:74` — `manage_url = f"{SITE_BASE_URL}/booking/{appointment.id}"`. Uses `appointment.id`. Correct.

### [CHECK 9.4] FAIL
**Evidence:** `emails.py:222` — `provider_slug = getattr(provider, 'profile_handle', '') or str(provider.pk)`. The `profile_handle` field is on the `User` model (`apps/authentication/models.py:160`), NOT on `CareProvider`. `getattr(provider, 'profile_handle', '')` will always return `''` (the default), causing the fallback to `str(provider.pk)` (a UUID). The review link will be `https://really.global/care-provider/<uuid>#review-<id>` instead of `https://really.global/care-provider/<profile_handle>#review-<id>`.
**Note:** BLOCKER. Should be `getattr(provider.user, 'profile_handle', '') or str(provider.pk)`.

### [CHECK 9.5] PASS
**Evidence:** All 4 email builder functions wrap their body in `try/except Exception` with `logger.exception()`:
- `send_booking_confirmation_email`: lines 46, 115
- `send_booking_reminder_email`: lines 127, 194
- `send_review_prompt_email`: lines 206, 257
- `send_marketplace_intro_email`: lines 269, 309

---

## Section 10: Serializer Completeness

### [CHECK 10.1] PASS
**Evidence:** `serializers.py:171-189` — `BookingDetailSerializer` includes:
- `appointment_id` (IntegerField) -- present
- `start_date_time` (DateTimeField) -- present
- `end_date_time` (DateTimeField) -- present
- `provider_first_name` + `provider_last_name` (CharField) -- present
- `provider_photo_url` (CharField) -- present
- `session_type` (CharField) -- present (though always empty string in current impl)
- `status` (CharField, mapped from `is_status`) -- present
- `client_timezone` (CharField) -- present
- `cancellation_window_hours` (IntegerField) -- present
- Additional: `duration_minutes`, `timezone`, `room_name`, `provider_id`, `provider_slug`, `can_reschedule`, `can_cancel`

### [CHECK 10.2] PASS
**Evidence:** `serializers.py:192-194` — `RescheduleSerializer` has `new_slot_id = serializers.IntegerField()`. Required by default (no `required=False`). Matches `Slot.id` type (auto-increment integer from BaseModel).

---

## Section 11: URL Configuration

### [CHECK 11.1] PASS
**Evidence:** `urls.py:31-34` — All 3 patterns present:
- `booking/<int:appointment_id>/` -> `BookingDetailView` (line 32)
- `booking/<int:appointment_id>/reschedule/` -> `BookingRescheduleView` (line 33)
- `booking/<int:appointment_id>/cancel/` -> `BookingCancelView` (line 34)

### [CHECK 11.2] PASS
**Evidence:** `lumy_global/urls.py:63` — `path("api/v1/booking-link/", include("apps.booking_link.urls"))` is present.

---

## Section 12: Test Coverage

### [CHECK 12.1] FAIL
**Evidence:** `tests.py` — No test named `test_booking_detail_ownership` or any test for `BookingDetailView`. The test file only contains tests for RGDEV-204 features (generate, my, deactivate, resolve, track-click, QR, OG meta, signals, models, throttle). No RGDEV-211 tests exist.

### [CHECK 12.2] FAIL
**Evidence:** `tests.py` — No test named `test_booking_reschedule` or any test for `BookingRescheduleView`.

### [CHECK 12.3] FAIL
**Evidence:** `tests.py` — No test for `test_booking_cancel_outside_window` or `test_booking_cancel_within_window`.

### [CHECK 12.4] FAIL
**Evidence:** `tests.py` — No test for review prompt guard behavior after cancellation.

---

## Additional Findings (Not in Audit Prompt)

### [EXTRA 1] FAIL — provider_photo_url uses wrong attribute in BookingDetailView
**Evidence:** `views.py:956-957` — `if hasattr(cp, 'photo') and cp.photo: photo_url = cp.photo.url ...`. All other views in this file use `cp.user.profile_pic` (e.g., line 108-109, line 372). The `BookingDetailView` uses `cp.photo` which may not exist on `CareProvider`, meaning `provider_photo_url` will always be `None`.
**Note:** Should use `cp.user.profile_pic` for consistency.

### [EXTRA 2] WARN — provider_slug uses wrong model in BookingDetailView
**Evidence:** `views.py:972` — `'provider_slug': getattr(cp, 'profile_handle', '') or ''`. The `profile_handle` field is on `User` (`apps/authentication/models.py:160`), not `CareProvider`. This will always return `''`.
**Note:** Should be `getattr(cp.user, 'profile_handle', '') or ''`.

### [EXTRA 3] WARN — send_confirmation_email_task exception handling inconsistency
**Evidence:** `tasks.py:32-37` — Uses `logger.error()` instead of `logger.exception()` (which includes traceback). The attribution tasks reference pattern at `apps/attribution/tasks.py:29` uses `logger.exception()`. All 4 booking_link tasks use `logger.error()`.

---

## Summary Table

| Section | Total Checks | PASS | FAIL | WARN |
|---|---|---|---|---|
| 1 - Auth/Ownership | 5 | 4 | 0 | 1 |
| 2 - Race Conditions | 4 | 4 | 0 | 0 |
| 3 - Email Reliability | 5 | 4 | 0 | 1 |
| 4 - Cancellation Window | 4 | 3 | 0 | 1 |
| 5 - Status Transitions | 3 | 3 | 0 | 0 |
| 6 - Review Prompt Guard | 3 | 2 | 1 | 0 |
| 7 - Timezone | 2 | 2 | 0 | 0 |
| 8 - RQ Task Patterns | 4 | 3 | 0 | 1 |
| 9 - Email Builders | 5 | 4 | 1 | 0 |
| 10 - Serializers | 2 | 2 | 0 | 0 |
| 11 - URL Config | 2 | 2 | 0 | 0 |
| 12 - Test Coverage | 4 | 0 | 4 | 0 |
| Extra Findings | 3 | 0 | 1 | 2 |
| **TOTAL** | **46** | **33** | **7** | **6** |

---

## Blockers (FAIL items requiring fixes before merge)

1. **[6.2] send_marketplace_intro_task has no appointment status guard** — will send marketplace intro emails for cancelled appointments. Fix: add `if appointment.is_status != 'COMPLETED': return` to either the task or `send_marketplace_intro_email()`.

2. **[9.4] Review prompt email uses wrong model for provider_slug** — `getattr(provider, 'profile_handle', '')` should be `getattr(provider.user, 'profile_handle', '')`. Will generate broken review links using provider UUID instead of profile handle.

3. **[EXTRA 1] BookingDetailView provider_photo_url uses `cp.photo` instead of `cp.user.profile_pic`** — inconsistent with all other views; will always return `None`.

4. **[EXTRA 2] BookingDetailView provider_slug uses `getattr(cp, 'profile_handle', '')` instead of `cp.user`** — same wrong-model bug as 9.4; will always return empty string.

5. **[12.1-12.4] No RGDEV-211 tests exist** — all 4 test coverage checks fail. Ownership, reschedule atomicity, cancellation window enforcement, and review prompt guard are untested.

---

## WARN items for triage

1. **[1.5]** Sequential integer appointment IDs in URLs are enumerable — ownership check is sole guard.
2. **[3.2]** No synchronous fallback for confirmation email if RQ is down.
3. **[4.4]** No explicit past-appointment guard (implicitly covered by window check).
4. **[8.2]** Tasks catch only `DoesNotExist`, not broad exceptions — DB errors will cause indefinite retries.
5. **[EXTRA 3]** Tasks use `logger.error()` instead of `logger.exception()` — no tracebacks in logs.
6. **[EXTRA 2]** `provider_slug` always empty in BookingDetailView response.
