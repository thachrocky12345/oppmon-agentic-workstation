# Audit Prompt: Post-Booking Lifecycle (RGDEV-211) — Data Model, Security, Task, and Email Review

**Scope**: `apps/booking_link/` (new views, tasks, emails, serializers, urls) in `Lumy-Backend/`
**Auditor level**: Principal engineer
**Execution mode**: Read all listed files, check every item, report findings as PASS / FAIL / WARN with exact evidence (file + line number). Do not infer — read the source.

---

## Files to Read Before Starting

Read all of these before answering any check:

1. `apps/booking_link/views.py` — full file (all existing + new views)
2. `apps/booking_link/tasks.py` — full file (new RQ task file)
3. `apps/booking_link/emails.py` — full file (new email builder file)
4. `apps/booking_link/serializers.py` — full file (BookingDetailSerializer, RescheduleSerializer + existing)
5. `apps/booking_link/urls.py` — full file (3 new URL patterns added for RGDEV-211)
6. `apps/booking_link/models.py` — full file (for `BookingLinkCheckoutSession`, `BookingAttribution`)
7. `apps/calendar_functionality/models.py` — lines 1–160 (Appointment, Slot models)
8. `apps/attribution/tasks.py` — full file (reference pattern for RQ task structure)
9. `apps/attribution/notifications.py` — full file (reference pattern for email sending)
10. `apps/care_provider/models.py` — search for `cancellation_window_hours` field definition
11. `lumy_global/settings.py` — search for `BOOKING_CANCELLATION_WINDOW_HOURS` or similar default constant

---

## Baseline Facts (Pre-Verified)

These were confirmed by reading source before writing this prompt. Use them as ground truth.

**`BookingLinkCheckoutSession`** (`apps/booking_link/models.py`):
- `appointment = OneToOneField('calendar_functionality.Appointment', null=True, blank=True, related_name='booking_link_checkout')`
- `client = ForeignKey('client.Client', null=True, blank=True)`
- `client_timezone = CharField(max_length=100, blank=True, default='')`
- `status` choices: `PENDING, SLOT_HELD, PAYMENT_PENDING, COMPLETED, EXPIRED, FAILED`

**`Appointment`** (`apps/calendar_functionality/models.py`):
- `client = ForeignKey(Client, on_delete=CASCADE, related_name='client_appointments')`
- `care_provider = ForeignKey(CareProvider, null=True, blank=True)`
- `is_status = CharField(max_length=100, choices=APPOINTMENT_STATUS, default='SCHEDULED')`
- `start_date_time = DateTimeField(null=True, blank=True)`
- `end_date_time = DateTimeField(null=True, blank=True)`
- `room_name` is auto-generated UUID on save

**`Slot`** (`apps/calendar_functionality/models.py`):
- `appointment_id = IntegerField(null=True, blank=True)` — plain integer FK, NOT a Django ForeignKey
- Slot is "free" when `appointment_id IS NULL`
- `care_provider = ForeignKey(CareProvider, related_name='care_provider_slot')`

**Existing `CheckoutCompleteView`** (`apps/booking_link/views.py`, around line 724):
- Calls `confirm_and_notify(appointment)` OUTSIDE `transaction.atomic()` — this is the correct pattern
- Uses `select_for_update()` inside the atomic block to lock the slot

**Existing `CheckoutSlotHoldView`** (`apps/booking_link/views.py`):
- Uses `transaction.atomic()` + `select_for_update()` to prevent race conditions on slot hold

**RQ task pattern** (`apps/attribution/tasks.py`):
- All model imports are INSIDE the task function body (deferred), not at module top level
- Uses `try/except Exception` with `logger.exception()` to handle missing objects gracefully
- Returns early (no re-raise) on object-not-found to prevent RQ retries for permanent failures

**Email sending pattern** (`apps/attribution/notifications.py`):
- Uses `apps.authentication.utils.send_email(email, subject, content)` directly (synchronous)
- Wraps the entire function body in `try/except Exception` with `logger.exception()`
- Checks for missing email address before calling `send_email`

**Platform default cancellation window**: Per plan — 24 hours if provider hasn't configured one.
The existing `CheckoutCancellationPolicyView` (`views.py` ~line 751) uses `getattr(cp, 'cancellation_window_hours', 24)`.

---

## Section 1: Authentication and Ownership (IDOR Prevention)

### Check 1.1 — BookingDetailView permission class
Read `BookingDetailView` in `views.py`. Confirm:
- `permission_classes = [IsAuthenticated]` is set on the view class
- PASS: IsAuthenticated is present. FAIL: missing or AllowAny.

### Check 1.2 — BookingDetailView ownership enforcement
Read the `get()` method of `BookingDetailView`. Confirm:
- It performs an explicit ownership check: `appointment.client.user == request.user` (or equivalent via queryset filter `client__user=request.user`)
- It returns HTTP 403 (or 404 to avoid enumeration) if the requesting user does not own the appointment
- PASS: ownership check present + correct status code. FAIL: no check. WARN: check present but wrong status code (e.g., returns 400).

### Check 1.3 — BookingRescheduleView permission and ownership
Read `BookingRescheduleView`. Confirm:
- `permission_classes = [IsAuthenticated]` present
- Ownership check applied before any mutation occurs (not after slot lookup)
- FAIL if a non-owner could trigger a reschedule on another client's appointment.

### Check 1.4 — BookingCancelView permission and ownership
Read `BookingCancelView`. Same checks as 1.3 for the cancel endpoint.

### Check 1.5 — URL pattern scope
Read `apps/booking_link/urls.py`. Confirm the 3 new URL patterns use `<appointment_id>` or `<uuid:appointment_id>` (not `<int:appointment_id>`). The `Appointment` model uses auto-increment integer PK — confirm whether the URL accepts an integer or UUID. If integer: WARN that sequential IDs are enumerable; the ownership check in 1.2/1.3/1.4 is the only guard.

---

## Section 2: Race Conditions — Reschedule Slot Swap

### Check 2.1 — select_for_update on new slot
Read `BookingRescheduleView.post()`. Confirm:
- The new slot is fetched with `CalendarSlot.objects.select_for_update().filter(id=new_slot_id, appointment_id__isnull=True)`
- This is executed inside a `transaction.atomic()` block
- PASS: select_for_update inside atomic. FAIL: either missing. WARN: select_for_update present but outside atomic (no-op in that case).

### Check 2.2 — Old slot atomically released within same transaction
Still in `BookingRescheduleView.post()`, inside the same `transaction.atomic()` block:
- Confirm the old slot's `appointment_id` is set to `None` in the same atomic block as setting the new slot's `appointment_id`
- PASS: both operations inside same atomic block. FAIL: old slot release is outside the atomic block (creates a window where both slots are claimed). WARN: old slot is not released at all.

### Check 2.3 — Appointment start/end datetime updated atomically
Inside the same `transaction.atomic()` block:
- Confirm `appointment.start_date_time` and `appointment.end_date_time` are updated to match the new slot's times
- Confirm `appointment.save()` is called within the transaction
- PASS: both fields updated and saved inside atomic. FAIL: appointment not saved inside atomic.

### Check 2.4 — Conflict response on slot already taken
Confirm the view returns HTTP 409 (Conflict) when `select_for_update()` returns no slot (slot taken by concurrent request). Pattern: same as `CheckoutCompleteView` which returns `HTTP_409_CONFLICT`. FAIL if it returns 400 or 500.

---

## Section 3: Email Reliability and Task Wiring

### Check 3.1 — send_confirmation_email_task called outside transaction.atomic()
Read the wire-in point in `CheckoutCompleteView.post()` (around line 724). The plan specifies adding `send_confirmation_email_task.delay(appointment.id)` after the existing `confirm_and_notify(appointment)` call, which is already outside the `transaction.atomic()` block. Confirm:
- `send_confirmation_email_task.delay(...)` is called AFTER the `with transaction.atomic():` block closes
- FAIL: if it is inside `transaction.atomic()` — the RQ job would be enqueued before the DB transaction commits, so the worker may find no appointment row.

### Check 3.2 — RQ worker down: confirmation email fallback
Read `send_confirmation_email_task` in `apps/booking_link/tasks.py`. The plan flagged this as a risk: "consider synchronous fallback for confirmation only." Confirm one of:
- (A) The task itself has no fallback, but `CheckoutCompleteView` also calls `send_booking_confirmation_email()` synchronously as a backup before enqueuing the task, OR
- (B) The task is enqueued but there is no synchronous fallback at all
- PASS on (A). WARN on (B) — note as known gap per plan. FAIL: if confirmation email is only attempted inside `transaction.atomic()`.

### Check 3.3 — Reminder tasks scheduled with correct offsets
Read the reminder scheduling code in `tasks.py` or `views.py`. Confirm:
- 24-hour reminder: scheduled at `appointment.start_date_time - timedelta(hours=24)`
- 1-hour reminder: scheduled at `appointment.start_date_time - timedelta(hours=1)`
- Uses `django_rq.enqueue_at()` or equivalent scheduler (APScheduler)
- FAIL: wrong offsets (e.g., `timedelta(hours=2)` for one-hour reminder). WARN: `enqueue_at` used but `start_date_time` is naive datetime (no timezone info) — could schedule at wrong wall-clock time.

### Check 3.4 — Reminders guard against past scheduling time
In the reminder scheduling code, confirm there is a guard:
- If `appointment.start_date_time - timedelta(hours=24) < timezone.now()`, the 24h reminder is skipped (not enqueued in the past)
- Same for the 1h reminder
- WARN if no guard — RQ/APScheduler may immediately fire or silently drop past-scheduled jobs depending on backend configuration.

### Check 3.5 — Review prompt and marketplace intro scheduling offsets
Read the post-session scheduling code. Confirm:
- Review prompt: scheduled at `appointment.end_date_time + timedelta(hours=2)`
- Marketplace intro: scheduled at `appointment.end_date_time + timedelta(hours=24)`
- FAIL: wrong base time (e.g., using `start_date_time` instead of `end_date_time`).

---

## Section 4: Cancellation Window Logic

### Check 4.1 — Cancellation window calculation
Read `BookingCancelView.post()` and `BookingRescheduleView.post()`. For each, confirm the window check is:
```python
timezone.now() > appointment.start_date_time - timedelta(hours=cancellation_window_hours)
```
(i.e., block if NOW is after the window deadline). FAIL if the comparison is inverted. FAIL if `timedelta` is in minutes instead of hours.

### Check 4.2 — Default cancellation window when provider has none
In both views, confirm the fallback when `CareProvider.cancellation_window_hours` is null/missing:
- Uses 24 as the default, consistent with `CheckoutCancellationPolicyView`'s `getattr(cp, 'cancellation_window_hours', 24)` pattern
- FAIL: uses a different default (e.g., 0 would mean no window, 48 would be stricter than policy page shows)

### Check 4.3 — Outside-window error response
Confirm both cancel and reschedule views return HTTP 400 with a descriptive error message (not 403 or 409) when the cancellation window has passed. WARN if error message does not mention the window hours so the client can display it.

### Check 4.4 — Past-appointment guard
Separately from the cancellation window: confirm both views also reject requests where `appointment.start_date_time < timezone.now()` (appointment already started or passed). FAIL if only the cancellation window check is present and a request to cancel a session that started 2 hours ago would succeed.

---

## Section 5: Appointment Status Transitions

### Check 5.1 — BookingCancelView sets correct is_status value
Read `BookingCancelView.post()`. Confirm:
- `appointment.is_status = 'CANCELLED'` (matches `APPOINTMENT_STATUS` choices — verify the exact string in `apps/calendar_functionality/constants.py`)
- `appointment.save()` is called with `update_fields=['is_status', ...]` or without (full save acceptable)
- FAIL: sets a non-existent status string (e.g., `'CANCELED'` vs `'CANCELLED'`). FAIL: doesn't save the appointment.

### Check 5.2 — Slot released on cancellation
In `BookingCancelView.post()`, confirm:
- The slot linked to this appointment is found and `slot.appointment_id = None` is set and saved
- Strategy: either look up `CalendarSlot.objects.filter(appointment_id=appointment.id)` or navigate via `BookingLinkCheckoutSession.slot`
- WARN if the slot is not released — the provider's calendar will show the slot as permanently occupied.
- FAIL if slot release and appointment status update are not atomic (i.e., not wrapped in `transaction.atomic()`).

### Check 5.3 — Cancellation does not set is_status on already-cancelled appointment
Confirm there is a guard preventing double-cancellation:
- If `appointment.is_status == 'CANCELLED'` already, the view returns 400 or 409 rather than silently no-oping
- WARN if no guard — idempotent behavior is acceptable but only if the response clearly indicates the current state.

---

## Section 6: Review Prompt Guard

### Check 6.1 — send_review_prompt_task checks appointment status before sending
Read `send_review_prompt_task` in `apps/booking_link/tasks.py`. Confirm:
- Before calling any email function, the task loads the appointment and checks `appointment.is_status == 'COMPLETED'`
- If not COMPLETED (e.g., appointment was cancelled after the task was scheduled), the task exits without sending
- FAIL: task sends the review prompt regardless of final appointment status
- PASS: check present before email call

### Check 6.2 — send_marketplace_intro_task has analogous guard
Read `send_marketplace_intro_task`. Same pattern — confirm it checks `appointment.is_status == 'COMPLETED'` before sending. FAIL if absent.

### Check 6.3 — send_reminder_email_task checks appointment status
Read `send_reminder_email_task`. Confirm it checks `appointment.is_status == 'SCHEDULED'` before sending the reminder. A reminder must not fire for a cancelled appointment. FAIL if absent.

---

## Section 7: Timezone Handling

### Check 7.1 — BookingDetailView returns client_timezone from BookingLinkCheckoutSession
Read `BookingDetailView.get()` and `BookingDetailSerializer`. Confirm:
- The response includes `client_timezone` sourced from `BookingLinkCheckoutSession.client_timezone`, NOT from Django's `timezone.get_current_timezone()` or the server environment
- Access pattern: `appointment.booking_link_checkout.client_timezone` (via the `related_name='booking_link_checkout'` OneToOne)
- FAIL: returns server timezone or omits timezone entirely
- WARN: returns `appointment.timezone` (Slot's timezone) instead of `BookingLinkCheckoutSession.client_timezone` — these may differ

### Check 7.2 — Date/time values in BookingDetailSerializer are timezone-aware
Read `BookingDetailSerializer`. Confirm:
- `start_date_time` and `end_date_time` are serialized as ISO 8601 with UTC offset (not naive datetimes)
- DRF's `DateTimeField` defaults to ISO 8601 with `USE_TZ=True` — confirm no `format=` override that strips tzinfo

---

## Section 8: RQ Task Patterns

### Check 8.1 — All task functions use deferred model imports
Read every task function in `apps/booking_link/tasks.py`. For each one, confirm:
- Model imports (`from apps.X.models import Y`) are INSIDE the function body
- No model imports at module top level
- Rationale: top-level imports at module load time can cause circular imports and app-not-ready errors in RQ workers
- FAIL: any model import at module level. PASS: all imports inside function bodies (matching `apps/attribution/tasks.py` pattern)

### Check 8.2 — Tasks handle DoesNotExist gracefully
For each task, confirm:
- The appointment (and other objects) are fetched inside a `try/except Exception` block
- On `DoesNotExist` or any fetch error, the task logs with `logger.exception(...)` and returns without re-raising
- FAIL: task raises on missing objects (causes RQ to retry indefinitely for a permanently deleted appointment)
- PASS: matches pattern in `apps/attribution/tasks.py` lines 28–34

### Check 8.3 — Tasks are decorated with @django_rq.job
Confirm each task function in `tasks.py` has the `@django_rq.job` decorator. FAIL: missing decorator means `.delay()` calls will fail at runtime.

### Check 8.4 — send_confirmation_email_task takes appointment_id (not appointment object)
Confirm the task signature is `def send_confirmation_email_task(appointment_id):` — takes a primitive, not an ORM object. Passing ORM objects to RQ is not supported (they are not JSON-serializable by default). FAIL: task takes an ORM object as argument.

---

## Section 9: Email Builder Correctness

### Check 9.1 — Confirmation email uses client_timezone for date display
Read `send_booking_confirmation_email` in `apps/booking_link/emails.py`. Confirm:
- The session date/time in the email subject and body is formatted using `BookingLinkCheckoutSession.client_timezone`, not `appointment.timezone` or UTC
- WARN if it uses `appointment.start_date_time` formatted as UTC — client will see wrong time

### Check 9.2 — Join link uses appointment.id, not session.id
Read `send_booking_confirmation_email`. Confirm:
- "Join your session" link is `https://really.global/session/join/{appointment.id}`
- NOT `https://really.global/session/join/{checkout_session.id}`
- FAIL: uses wrong ID — client cannot join

### Check 9.3 — Manage booking link uses appointment.id
Read the same function. Confirm:
- Cancel/reschedule link is `https://really.global/booking/{appointment.id}`
- FAIL: uses wrong ID

### Check 9.4 — Review prompt link is correct
Read `send_review_prompt_email`. Confirm:
- Star rating link is `https://really.global/care-provider/{slug}#review-{appointment.id}`
- The `slug` is the provider's `profile_handle` or `booking_link.slug_snapshot`, not the appointment ID
- FAIL: link is malformed or uses wrong ID/slug

### Check 9.5 — All email builders catch exceptions
Read each of the 4 email builder functions. Confirm each wraps its body (or at least the `send_email()` call) in `try/except Exception` with `logger.exception(...)`. FAIL: unguarded exception would crash the RQ worker task.

---

## Section 10: Serializer Completeness

### Check 10.1 — BookingDetailSerializer includes required fields
Read `BookingDetailSerializer`. Confirm it includes at minimum:
- `appointment_id` (or `id`)
- `start_date_time`
- `end_date_time`
- `provider_name` or `provider_first_name` + `provider_last_name`
- `provider_photo_url`
- `session_type` (name)
- `is_status`
- `client_timezone` (from BookingLinkCheckoutSession)
- `cancellation_window_hours`
- WARN for each missing field that the frontend management and confirmation pages depend on

### Check 10.2 — RescheduleSerializer validates new_slot_id
Read `RescheduleSerializer` (or `BookingRescheduleSerializer`). Confirm:
- `new_slot_id` is a required field
- It is a UUID or integer field matching `Slot`'s PK type (integer — `Slot.id` is from `BaseModel` which uses auto-increment unless overridden)
- FAIL: field is optional (could lead to NoneType errors in view)

---

## Section 11: URL Configuration

### Check 11.1 — All 3 new URL patterns registered
Read `apps/booking_link/urls.py`. Confirm all 3 patterns are present:
- `GET booking/<appointment_id>/` → `BookingDetailView`
- `POST booking/<appointment_id>/reschedule/` → `BookingRescheduleView`
- `POST booking/<appointment_id>/cancel/` → `BookingCancelView`
- FAIL: any missing

### Check 11.2 — URL patterns included in root urls.py
Read `lumy_global/urls.py`. Confirm `apps/booking_link/urls.py` is already included (it should be, from RGDEV-204/205). FAIL if not included — all booking-link endpoints would 404.

---

## Section 12: Test Coverage

### Check 12.1 — Ownership test present
Search `apps/booking_link/tests.py` (or `tests/` subdirectory) for a test named `test_booking_detail_ownership` or similar. Confirm:
- It attempts to access `GET /api/v1/booking-link/booking/<id>/` as a different authenticated user
- It asserts HTTP 403 or 404 response
- FAIL: test absent. WARN: test present but does not assert the response code.

### Check 12.2 — Reschedule atomic slot swap test present
Search for `test_booking_reschedule` or similar. Confirm it verifies:
- Old slot's `appointment_id` is NULL after reschedule
- New slot's `appointment_id` equals the appointment's id
- FAIL: test absent.

### Check 12.3 — Cancellation window enforcement tests present
Search for `test_booking_cancel_outside_window` and `test_booking_cancel_within_window`. Confirm both exist. FAIL if either is absent.

### Check 12.4 — Review prompt guard test present
Search for a test that cancels an appointment and then verifies `send_review_prompt_task` does NOT send an email. WARN if absent — this is a high-value business logic test.

---

## Output Format

For each check, report:

```
[CHECK X.Y] PASS | FAIL | WARN
Evidence: <file path>:<line number> — <exact quote or description>
Note: <any follow-up action or risk if FAIL/WARN>
```

After all checks, produce a summary table:

| Section | Total Checks | PASS | FAIL | WARN |
|---|---|---|---|---|
| 1 - Auth/Ownership | 5 | | | |
| 2 - Race Conditions | 4 | | | |
| 3 - Email Reliability | 5 | | | |
| 4 - Cancellation Window | 4 | | | |
| 5 - Status Transitions | 3 | | | |
| 6 - Review Prompt Guard | 3 | | | |
| 7 - Timezone | 2 | | | |
| 8 - RQ Task Patterns | 4 | | | |
| 9 - Email Builders | 5 | | | |
| 10 - Serializers | 2 | | | |
| 11 - URL Config | 2 | | | |
| 12 - Test Coverage | 4 | | | |
| **TOTAL** | **43** | | | |

Flag any FAIL as a blocker. Flag WARN items for triage before merge.
