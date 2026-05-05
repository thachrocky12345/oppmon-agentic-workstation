# Implementation Plan: RGDEV-211 — [Frontend] Post-Booking Lifecycle

**Ticket:** RGDEV-211 | **Priority:** Medium | **Status:** To Do
**Epic:** RGDEV-203 — Booking Link v3 Full Lifecycle Contained Checkout
**Jira:** https://reallyhq.atlassian.net/browse/RGDEV-211

---

## Overview

Full post-booking lifecycle: SendGrid email templates (backend), session join page, booking management page (reschedule/cancel), and web confirmation page. These are the surfaces clients land on after completing a checkout via the Booking Link.

---

## Affected Systems

| Layer | Files / Components | Change Type |
|---|---|---|
| Backend — email builders | `apps/booking_link/emails.py` | New |
| Backend — RQ tasks | `apps/booking_link/tasks.py` | New |
| Backend — views | `apps/booking_link/views.py` | 3 new endpoints |
| Backend — urls | `apps/booking_link/urls.py` | 3 new URL patterns |
| Backend — serializers | `apps/booking_link/serializers.py` | BookingDetailSerializer, RescheduleSerializer |
| Frontend page | `src/pages/session/join/[appointmentId].tsx` | New |
| Frontend page | `src/pages/booking/[appointmentId].tsx` | New — reschedule/cancel management |
| Frontend page | `src/pages/booking/confirmation/[appointmentId].tsx` | New — web confirmation |
| Frontend container | `src/containers/booking-management/BookingManagement.tsx` | New |

---

## Part A — Backend: Email Builders (`apps/booking_link/emails.py`)

All use `apps/authentication/utils.send_email(email, subject, content)` — same pattern as `apps/attribution/notifications.py`.

### 1. Confirmation Email
```python
def send_booking_confirmation_email(appointment, client, provider, booking_link_slug):
```
- Subject: `Your session with {provider_first} is confirmed — {date_time_local}`
- Client timezone from `BookingLinkCheckoutSession.client_timezone`
- "Join your session" link: `https://really.global/session/join/{appointment.id}`
- ICS download link + "Add to Google Calendar" link
- Cancel/reschedule link: `https://really.global/booking/{appointment.id}`
- "You now have an account — explore more providers" marketplace CTA

### 2. Reminder Email (24h + 1h before)
```python
def send_booking_reminder_email(appointment, client, provider, hours_before):
```
Minimal: session time, "Join your session" button, "Reschedule or cancel" link.

### 3. Post-Session Review Prompt (2h after)
```python
def send_review_prompt_email(appointment, client, provider):
```
Star rating link → `https://really.global/care-provider/{slug}#review-{appointment.id}`

### 4. Marketplace Introduction (24h after)
```python
def send_marketplace_intro_email(appointment, client, provider):
```
Non-aggressive: "Looking for additional support? Explore therapists, coaches, and mentors."

---

## Part A — Backend: RQ Tasks (`apps/booking_link/tasks.py`)

```python
@django_rq.job
def send_confirmation_email_task(appointment_id): ...

@django_rq.job
def send_reminder_email_task(appointment_id, hours_before): ...

@django_rq.job
def send_review_prompt_task(appointment_id): ...

@django_rq.job
def send_marketplace_intro_task(appointment_id): ...
```

**Wire-in point:** `apps/booking_link/views.py:724` — after existing `confirm_and_notify(appointment)` call in `CheckoutCompleteView.post()`, add:
```python
send_confirmation_email_task.delay(appointment.id)
```

Reminders: scheduled via `django_rq.enqueue_at()` or APScheduler for 24h and 1h before `appointment.start_date_time`.
Review prompt + marketplace intro: scheduled for 2h and 24h after `appointment.end_date_time`.

---

## Part A — Backend: New Endpoints

Add to `apps/booking_link/views.py` + `urls.py`:

| Method | Path | View | Auth |
|---|---|---|---|
| GET | `/api/v1/booking-link/booking/<appointment_id>/` | `BookingDetailView` | IsAuthenticated + ownership |
| POST | `/api/v1/booking-link/booking/<appointment_id>/reschedule/` | `BookingRescheduleView` | IsAuthenticated + ownership |
| POST | `/api/v1/booking-link/booking/<appointment_id>/cancel/` | `BookingCancelView` | IsAuthenticated + ownership |

**`BookingDetailView`:** ownership check `appointment.client.user == request.user`. Returns: date/time, provider name/photo, session type, status, cancellation policy.

**`BookingRescheduleView`:** accepts `{ new_slot_id }`. Validates: not in past, within `CareProvider.cancellation_window_hours`. `select_for_update()` on new slot. Atomically swap `slot.appointment_id`, update `appointment.start_date_time`/`end_date_time`.

**`BookingCancelView`:** accepts `{ reason? }`. Validates: not in past, within window. Sets `appointment.is_status = 'CANCELLED'`. Releases slot (`slot.appointment_id = None`).

---

## Part B — Frontend: Session Join Page

**File:** `src/pages/session/join/[appointmentId].tsx`

- Auth-gated: unauthenticated → login with `?returnUrl=/session/join/{id}`
- On load: `GET /api/v1/booking-link/booking/<id>/` to verify ownership + get room info
- Auto-redirect to Twilio video room — see existing `src/pages/meet/[room].tsx` for the pattern
- Pre-session: show countdown to start time
- Works in WKWebView and Chrome Custom Tabs (no pop-ups)

---

## Part C — Frontend: Booking Management Page

**Files:** `src/pages/booking/[appointmentId].tsx` + `src/containers/booking-management/BookingManagement.tsx`

Sections:
1. Session details (provider, date/time in `BookingLinkCheckoutSession.client_timezone`, session type)
2. Cancellation/reschedule policy (from `GET /api/v1/booking-link/checkout/cancellation-policy/<slug>/`)
3. Reschedule: if within window → slot picker (`GET /api/v1/booking-link/checkout/slots/<slug>/`) → `POST /api/v1/booking-link/booking/<id>/reschedule/`
4. Cancel: if within window → confirmation modal → `POST /api/v1/booking-link/booking/<id>/cancel/`
5. Outside window: show policy, disable buttons with explanation

Must work standalone for first-time users (linked from email) — auth gate shows inline login, not full marketplace navigation.

---

## Part D — Frontend: Web Confirmation Page

**File:** `src/pages/booking/confirmation/[appointmentId].tsx`

Web-rendered mirror of confirmation email — linked from RGDEV-209 Step 6. Contains: session details, join link, calendar add, manage booking link, marketplace CTA. Uses `GET /api/v1/booking-link/booking/<id>/` for data.

---

## Business Logic

1. All external links use `appointment.id` (UUID from `BookingLinkCheckoutSession.appointment`) — not guessable sequential IDs
2. Timezone: render from `BookingLinkCheckoutSession.client_timezone` — NOT browser timezone (client may open on different device)
3. Reminders only fire if appointment is still `SCHEDULED`
4. Review prompt only fires if `appointment.is_status == 'COMPLETED'`
5. Reschedule/cancel enforce `CareProvider.cancellation_window_hours` — block if `now > start - timedelta(hours=window)`
6. Platform default cancellation window: 24 hours (if provider hasn't configured one)

---

## Edge Cases

- Client opens email on different device → join page must not require prior session state
- Appointment already cancelled → management page shows "This session was cancelled" state
- Provider has no cancellation policy → use platform default (24h)
- RQ worker down → confirmation email not sent → consider synchronous fallback for confirmation only

---

## Testing Plan

**Backend:**
- `test_send_confirmation_email`: mock `send_email`, verify called after checkout
- `test_booking_reschedule`: atomic slot swap, old slot freed
- `test_booking_cancel_within_window` / `test_booking_cancel_outside_window`
- `test_booking_detail_ownership`: 403 if wrong client

**Frontend:**
- Join page: renders countdown before start, redirects to meet room when ready
- Management page: reschedule disabled outside window
- Confirmation page: all sections render with mock data

---

## Dependencies

- **Blocked by:** RGDEV-208 (Design — email templates + page layouts)
- **Already done:** RGDEV-204/205, RGDEV-198
- **Wire-in point:** `apps/booking_link/views.py:724` (after `confirm_and_notify`)
- **Coordinates with:** RGDEV-209 Step 6 links to confirmation/management pages
- **External:** SendGrid (`SENDGRID_KEY` already in `.env`)

---

## Implementation Order

1. `apps/booking_link/emails.py` — 4 email builder functions
2. `apps/booking_link/tasks.py` — RQ job wrappers
3. Wire `send_confirmation_email_task.delay()` into `CheckoutCompleteView.post()` at line 724
4. Wire reminder scheduling
5. `BookingDetailView`, `BookingRescheduleView`, `BookingCancelView` in `views.py` + `urls.py`
6. Backend tests
7. `src/pages/session/join/[appointmentId].tsx`
8. `src/containers/booking-management/BookingManagement.tsx`
9. `src/pages/booking/[appointmentId].tsx`
10. `src/pages/booking/confirmation/[appointmentId].tsx`
11. Frontend tests

---

## Estimated Complexity

**Backend:** Medium — 6 story points
**Frontend:** Medium
**Total:** 6 story points combined
