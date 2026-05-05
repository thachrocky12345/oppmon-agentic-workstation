# Fix Plan: RGDEV-211 Post-Booking Lifecycle -- UX/Scenario Audit Findings

**Source audit:** `Audit_PostBookingLifecycle_UXScenario_Results_2026-03-15.md`
**Date:** 2026-03-15
**Ticket:** RGDEV-211

---

## P0 Fixes -- Must fix before merge

### Fix 1: [1.7] RQ failure fallback -- wrap `.delay()` in try/except

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\views.py`
**Lines:** 729-731
**Why:** If Redis/RQ is down, `send_confirmation_email_task.delay()` raises `redis.exceptions.ConnectionError` (or `rq.exceptions.NoSuchJobError`). This 500 propagates to the client AFTER their payment has been committed and the appointment created. The client sees an error page after paying. The appointment exists but no confirmation email is sent and no reminders are scheduled. This is the highest-severity bug in the audit.

**Old code (lines 729-731):**
```python
        # RGDEV-211: Enqueue booking confirmation email + schedule reminders
        from .tasks import send_confirmation_email_task
        send_confirmation_email_task.delay(appointment.id)
```

**New code:**
```python
        # RGDEV-211: Enqueue booking confirmation email + schedule reminders.
        # Wrapped in try/except: if RQ broker is down, the appointment is
        # already committed -- the client must receive a success response.
        # The email will be missing but the booking is valid.
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

**Rationale:** `logger.critical` with `exc_info=True` ensures this is visible in monitoring/alerting. We do NOT attempt a synchronous fallback because `send_booking_confirmation_email` itself calls SendGrid which could also fail and add latency to the checkout response. The correct fix is: return success to the client (they paid, the appointment exists), log critically so ops can manually trigger the email or investigate Redis. A future enhancement could add a dead-letter retry mechanism.

---

### Fix 2: [6.6] ICS endpoint missing -- add ICS download view

**File (new view):** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\views.py`
**Insert after:** `BookingCancelView` class (end of file)
**Why:** The plan specified both an ICS download link and a Google Calendar link in the confirmation email. The GCal link exists but ICS download does not. ICS is needed for Outlook, Apple Calendar, and any non-Google calendar client.

**New code to add at end of `views.py`:**
```python
class BookingIcsView(APIView):
    """GET /api/v1/booking-link/booking/<appointment_id>/ics/ -- ICS calendar download."""
    permission_classes = [IsAuthenticated]

    def get(self, request, appointment_id):
        try:
            appointment = Appointment.objects.select_related(
                'care_provider__user',
            ).get(id=appointment_id)
        except Appointment.DoesNotExist:
            return Response(
                {'error': 'Appointment not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if appointment.client.user != request.user:
            return Response(
                {'error': 'You do not have permission to access this booking.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        cp = appointment.care_provider
        provider_name = f"{cp.user.first_name or ''} {cp.user.last_name or ''}".strip()
        join_url = f"https://really.global/session/join/{appointment.id}"

        # Get client timezone
        tz_name = ''
        try:
            checkout = BookingLinkCheckoutSession.objects.filter(
                appointment_id=appointment.id,
            ).first()
            if checkout:
                tz_name = checkout.client_timezone
        except Exception:
            pass

        start = appointment.start_date_time.strftime("%Y%m%dT%H%M%SZ")
        end = appointment.end_date_time.strftime("%Y%m%dT%H%M%SZ")
        uid = f"appointment-{appointment.id}@really.global"
        now_stamp = timezone.now().strftime("%Y%m%dT%H%M%SZ")

        ics_content = (
            "BEGIN:VCALENDAR\r\n"
            "VERSION:2.0\r\n"
            "PRODID:-//Really Global//Booking//EN\r\n"
            "METHOD:PUBLISH\r\n"
            "BEGIN:VEVENT\r\n"
            f"UID:{uid}\r\n"
            f"DTSTART:{start}\r\n"
            f"DTEND:{end}\r\n"
            f"DTSTAMP:{now_stamp}\r\n"
            f"SUMMARY:Session with {provider_name}\r\n"
            f"DESCRIPTION:Join your session: {join_url}\r\n"
            "LOCATION:Online\r\n"
            "STATUS:CONFIRMED\r\n"
            "END:VEVENT\r\n"
            "END:VCALENDAR\r\n"
        )

        response = HttpResponse(ics_content, content_type='text/calendar; charset=utf-8')
        response['Content-Disposition'] = (
            f'attachment; filename="session-{appointment.id}.ics"'
        )
        return response
```

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\urls.py`
**Line 34 (after cancel URL):** Add new URL pattern.

**Old code (line 34):**
```python
    path('booking/<int:appointment_id>/cancel/', views.BookingCancelView.as_view(), name='booking-cancel'),
]
```

**New code:**
```python
    path('booking/<int:appointment_id>/cancel/', views.BookingCancelView.as_view(), name='booking-cancel'),
    path('booking/<int:appointment_id>/ics/', views.BookingIcsView.as_view(), name='booking-ics'),
]
```

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py`
**Lines 93-96 (in confirmation email content):** Add ICS download link alongside GCal link.

**Old code (lines 93-96):**
```python
<p>
  <a href="{gcal_url}">Add to Google Calendar</a> &nbsp;|&nbsp;
  <a href="{manage_url}">Reschedule or cancel</a>
</p>
```

**New code:**
```python
<p>
  <a href="{gcal_url}">Add to Google Calendar</a> &nbsp;|&nbsp;
  <a href="{ics_url}">Download .ics file</a> &nbsp;|&nbsp;
  <a href="{manage_url}">Reschedule or cancel</a>
</p>
```

Also add the `ics_url` variable at line 75 (after `manage_url`):

**Old code (line 74):**
```python
        manage_url = f"{SITE_BASE_URL}/booking/{appointment.id}"
```

**New code:**
```python
        manage_url = f"{SITE_BASE_URL}/booking/{appointment.id}"
        ics_url = f"{SITE_BASE_URL}/api/v1/booking-link/booking/{appointment.id}/ics/"
```

**Note:** The ICS download requires authentication, so the link in the email will only work if the client is logged in. This is acceptable because the client has an account by this point and the email also links to the booking management page (which also requires auth). An alternative would be to use a signed/tokenized URL for unauthenticated ICS access, but that is a P2 enhancement.

---

### Fix 3: [7.4] Unsubscribe mechanism -- add unsubscribe URL and List-Unsubscribe header

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py`
**Lines 296-300 (marketplace intro email footer):**
**Why:** CAN-SPAM and GDPR require a functional unsubscribe mechanism in marketing/promotional emails. The current text says "manage your notification preferences in your account settings" but provides no link. At minimum, the URL to account settings must be present. A `List-Unsubscribe` header is also required by major email providers (Gmail, Outlook) to avoid spam classification.

**Old code (lines 296-300):**
```python
<p style="font-size:12px;color:#999;">
  You received this because you booked a session on Really Global.
  You can manage your notification preferences in your account settings.
</p>
```

**New code:**
```python
<p style="font-size:12px;color:#999;">
  You received this because you booked a session on Really Global.
  <a href="{SITE_BASE_URL}/settings/notifications" style="color:#999;">
    Manage your notification preferences</a> or
  <a href="{SITE_BASE_URL}/settings/notifications?unsubscribe=marketing" style="color:#999;">
    unsubscribe from marketing emails</a>.
</p>
```

**Additional backend change:** The `send_email` utility in `apps/authentication/utils.py` should support passing custom headers so that `List-Unsubscribe` can be set. This is a deeper change that may affect all email sending. For now, the minimum viable fix is the link in the footer. A follow-up ticket should add `List-Unsubscribe` header support.

**Follow-up ticket (not in this PR):** Add `List-Unsubscribe` and `List-Unsubscribe-Post` headers to `apps/authentication/utils.send_email` for all marketing emails. Also requires a backend endpoint at `/api/v1/auth/unsubscribe/<token>/` that processes one-click unsubscribe.

---

## P1 Fixes -- Should fix before merge

### Fix 4: [6.1] Google Calendar URL -- add `ctz` and `location` parameters

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py`
**Lines 28-39 (function `_google_calendar_url`):**
**Why:** Without `ctz`, Google Calendar may display the event in the user's Google account timezone rather than the session timezone. Without `location`, the event has no location field. Both are standard GCal URL parameters.

**Old code (lines 28-39):**
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

**New code:**
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

**Caller update in `send_booking_confirmation_email` (line 75):**

**Old code (line 75):**
```python
        gcal_url = _google_calendar_url(appointment, provider_name)
```

**New code:**
```python
        gcal_url = _google_calendar_url(appointment, provider_name, tz_name)
```

---

### Fix 5: [1.6] Marketplace intro guard -- skip for cancelled appointments

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py`
**Lines 269-272 (inside `send_marketplace_intro_email`, after `if not client_email: return`):**
**Why:** If the appointment was cancelled between booking and 24h after the originally scheduled end time, the marketplace intro email still fires. Sending a "Looking for additional support?" email after a cancelled session is tone-deaf and may cause the client to mark it as spam.

**Old code (lines 269-272):**
```python
    try:
        client_email = client.user.email
        if not client_email:
            return
```

**New code:**
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

---

### Fix 6: [7.2] Contextual marketplace search link

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py`
**Line 276:**
**Why:** A generic `/search` link misses an opportunity to show the client relevant providers. Using the provider's role or navigation category as a search filter improves conversion and UX.

**Old code (line 276):**
```python
        search_url = f"{SITE_BASE_URL}/search"
```

**New code:**
```python
        # Build a contextual search URL using the provider's role if available
        role_slug = ''
        try:
            if hasattr(provider, 'my_role') and provider.my_role:
                role_slug = provider.my_role.first().slug if provider.my_role.exists() else ''
        except Exception:
            pass
        if role_slug:
            search_url = f"{SITE_BASE_URL}/search?role={quote(role_slug)}"
        else:
            search_url = f"{SITE_BASE_URL}/search"
```

**Note:** This requires `from urllib.parse import quote` which is already imported at line 7.

**Risk:** Low. If the `my_role` relation doesn't have a `slug` field or the query fails, it falls back to the generic `/search` URL. The frontend search page must accept a `role` query parameter -- verify this exists. If it doesn't, fall back to generic `/search` until search filtering is implemented.

---

### Fix 7: [1.4] Reminder guard at enqueue time (low risk, defensive)

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\tasks.py`
**Lines 66-68 (function `_schedule_reminders`, after `if not start: return`):**
**Why:** Currently `_schedule_reminders` is only called from `send_confirmation_email_task` which runs immediately after checkout (appointment is always SCHEDULED). But if this function is ever called from another context (e.g., a manual re-send, a migration script), it would blindly schedule reminders for non-SCHEDULED appointments. Adding a defensive guard costs nothing.

**Old code (lines 66-74):**
```python
def _schedule_reminders(appointment):
    """Schedule 24h and 1h reminder emails before the session."""
    from django.utils import timezone as django_tz

    now = django_tz.now()
    start = appointment.start_date_time

    if not start:
        return
```

**New code:**
```python
def _schedule_reminders(appointment):
    """Schedule 24h and 1h reminder emails before the session."""
    from django.utils import timezone as django_tz

    now = django_tz.now()
    start = appointment.start_date_time

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

## P2 Fixes -- Frontend implementation (all 26 NI items)

All 26 NOT IMPLEMENTED items require the creation of three new pages and one container component. These are tracked as the bulk of the remaining RGDEV-211 work.

### Fix 8: Create `src/pages/booking/confirmation/[appointmentId].tsx`

**File:** `C:\Projects\ReallyGlobal\RG-Frontend\src\pages\booking\confirmation\[appointmentId].tsx`
**Status:** Does not exist -- must be created from scratch.
**Why:** This is the web confirmation page the client sees immediately after checkout (linked from RGDEV-209 Step 6) and from the confirmation email.

**Requirements from plan + audit:**
- Call `GET /api/v1/booking-link/booking/<id>/` on mount (audit 3.1)
- Display all 8 elements: provider name, provider photo, date/time in `client_timezone`, session type, duration, join link, GCal link, manage booking link (audit 3.2)
- Must work for unauthenticated users who just completed checkout -- the checkout flow sets auth cookies, so the user IS authenticated at this point, but the page should handle 401 gracefully with a login redirect using `returnUrl` (audit 3.3)
- Handle 404 gracefully with a clear message (audit 3.4)
- No full `Layout` shell -- standalone page with minimal chrome (audit 3.1 pattern from `src/pages/meet/[room].tsx`)
- Use `client_timezone` from the API response for all datetime rendering, NOT `Intl.DateTimeFormat().resolvedOptions().timeZone` (audit 5.2)
- No `window.open()` calls -- all links as `<a href>` for mobile WebView compatibility (audit 9.1)

**Skeleton:**
```tsx
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { axiosInstance } from '@/store/axiosInstance';
import { Box, Typography, CircularProgress, Button, Avatar } from '@mui/material';

// Format datetime in the client's timezone
function formatInTimezone(isoString: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined,
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(isoString));
  } catch {
    return new Date(isoString).toLocaleString();
  }
}

export default function BookingConfirmationPage() {
  const router = useRouter();
  const { appointmentId } = router.query;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appointmentId) return;
    axiosInstance
      .get(`/api/v1/booking-link/booking/${appointmentId}/`)
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.response?.status === 401) {
          router.push(`/login?returnUrl=/booking/confirmation/${appointmentId}`);
          return;
        }
        setError(err.response?.data?.error || 'Booking not found.');
      })
      .finally(() => setLoading(false));
  }, [appointmentId]);

  if (loading) return <CircularProgress />;
  if (error) return <Typography color="error">{error}</Typography>;

  const tz = data.client_timezone || data.timezone;
  const dtDisplay = formatInTimezone(data.start_date_time, tz);

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 3 }}>
      <Typography variant="h4">Session confirmed!</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}>
        {data.provider_photo_url && <Avatar src={data.provider_photo_url} sx={{ mr: 2 }} />}
        <Typography variant="h6">{data.provider_first_name} {data.provider_last_name}</Typography>
      </Box>
      <Typography variant="body1" sx={{ mt: 2, fontWeight: 'bold' }}>{dtDisplay}</Typography>
      <Typography variant="body2">{data.session_type} -- {data.duration_minutes} min</Typography>
      <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Button variant="contained" href={`/session/join/${appointmentId}`}>Join your session</Button>
        {/* GCal + ICS links would be built client-side or returned from API */}
        <Button variant="outlined" href={`/booking/${appointmentId}`}>Manage booking</Button>
      </Box>
    </Box>
  );
}
```

---

### Fix 9: Create `src/pages/session/join/[appointmentId].tsx`

**File:** `C:\Projects\ReallyGlobal\RG-Frontend\src\pages\session\join\[appointmentId].tsx`
**Status:** Does not exist -- must be created from scratch.
**Why:** This is the session join page linked from confirmation emails, reminder emails, and the booking management page.

**Requirements from plan + audit:**
- No full `Layout` shell (audit 2.1) -- standalone page like `src/pages/meet/[room].tsx`
- Auth-gated: unauthenticated users see inline login with `returnUrl=/session/join/{id}` (audit 2.2)
- On mount: `GET /api/v1/booking-link/booking/<id>/` for ownership verification + room info (audit 2.3)
- Handle 403 (wrong user) and 404 (not found) from API with clear messages (audit 2.4)
- Show countdown to session start time in `client_timezone` (audit 2.5)
- No `window.open()` -- Twilio video room loaded inline (audit 2.6)
- Twilio Video SDK loaded via `dynamic(() => import(...), { ssr: false })` (audit 2.7)
- Pre-session state: countdown + provider info + "Join" button (disabled until start time or ~5 min before)
- Active session state: Twilio video room component
- Refer to `src/pages/meet/[room].tsx` for the existing Twilio integration pattern

---

### Fix 10: Create `src/pages/booking/[appointmentId].tsx` + `src/containers/booking-management/BookingManagement.tsx`

**File (page):** `C:\Projects\ReallyGlobal\RG-Frontend\src\pages\booking\[appointmentId].tsx`
**File (container):** `C:\Projects\ReallyGlobal\RG-Frontend\src\containers\booking-management\BookingManagement.tsx`
**Status:** Neither exists -- must be created from scratch.
**Why:** This is the booking management page linked from all emails. Allows reschedule and cancel.

**Requirements from plan + audit:**
- No full `Layout` shell (audit 4.1) -- standalone
- Inline auth gate with `returnUrl` (audit 4.2)
- Cancellation policy fetched from `GET /api/v1/booking-link/checkout/cancellation-policy/<slug>/` using the booking link slug, NOT derived from the URL path (audit 4.3)
- Available slots fetched from `GET /api/v1/booking-link/checkout/slots/<slug>/`, not from Redux (audit 4.4)
- When outside cancellation window: show policy text, disable reschedule/cancel buttons with explanation (audit 4.5)
- When appointment is already cancelled: show "This session was cancelled" state, hide action buttons (audit 4.6)
- Handle 404 gracefully (audit 4.7)
- Reschedule flow: slot picker -> confirm -> `POST /api/v1/booking-link/booking/<id>/reschedule/` with `{ new_slot_id }`
- Cancel flow: confirmation modal -> `POST /api/v1/booking-link/booking/<id>/cancel/` with optional `{ reason }`
- Handle 409 Conflict on reschedule (slot taken) with user-readable message
- All datetimes rendered in `client_timezone` from API response

**Architecture:** The page file (`[appointmentId].tsx`) handles routing, auth gate, and API calls. The container (`BookingManagement.tsx`) handles the UI rendering, slot picker, and action modals. This follows the project's page/container pattern.

---

## P3 Fixes -- Minor UX improvements (post-merge)

### Fix 11: [1.3 / 5.4] Silent UTC fallback -- add "UTC" label when timezone is empty

**File:** `C:\Projects\ReallyGlobal\Lumy-Backend\apps\booking_link\emails.py`
**Lines 16-25 (function `_format_datetime_for_email`):**
**Why:** When `tz_name` is empty, the datetime is formatted in UTC but without any "UTC" label. The client sees "Saturday, March 15, 2026 at 02:00 PM" with no timezone context. This is confusing.

**Old code (line 25):**
```python
    return dt.strftime("%A, %B %d, %Y at %I:%M %p %Z")
```

**New code:**
```python
    formatted = dt.strftime("%A, %B %d, %Y at %I:%M %p %Z")
    # If no timezone abbreviation was produced (e.g., naive datetime or
    # empty tz_name), append UTC to avoid ambiguity
    if not dt.tzname() and not tz_name:
        formatted += " UTC"
    return formatted
```

---

## Summary: Files to modify

| Priority | File | Change |
|---|---|---|
| **P0** | `Lumy-Backend/apps/booking_link/views.py` L729-731 | Wrap `.delay()` in try/except |
| **P0** | `Lumy-Backend/apps/booking_link/views.py` (end) | Add `BookingIcsView` class |
| **P0** | `Lumy-Backend/apps/booking_link/urls.py` L34 | Add ICS URL pattern |
| **P0** | `Lumy-Backend/apps/booking_link/emails.py` L74-75, 93-96 | Add ICS link to confirmation email |
| **P0** | `Lumy-Backend/apps/booking_link/emails.py` L296-300 | Add unsubscribe URL to marketplace intro |
| **P1** | `Lumy-Backend/apps/booking_link/emails.py` L28-39, 75 | Add `ctz` + `location` to GCal URL |
| **P1** | `Lumy-Backend/apps/booking_link/emails.py` L269-272 | Add CANCELLED guard to marketplace intro |
| **P1** | `Lumy-Backend/apps/booking_link/emails.py` L276 | Contextual search URL with role |
| **P1** | `Lumy-Backend/apps/booking_link/tasks.py` L66-74 | Add SCHEDULED guard to `_schedule_reminders` |
| **P2** | `RG-Frontend/src/pages/booking/confirmation/[appointmentId].tsx` | Create confirmation page |
| **P2** | `RG-Frontend/src/pages/session/join/[appointmentId].tsx` | Create session join page |
| **P2** | `RG-Frontend/src/pages/booking/[appointmentId].tsx` | Create booking management page |
| **P2** | `RG-Frontend/src/containers/booking-management/BookingManagement.tsx` | Create booking management container |
| **P3** | `Lumy-Backend/apps/booking_link/emails.py` L25 | Add UTC label when timezone empty |

**Total: 6 backend fixes (P0+P1), 4 frontend files to create (P2), 1 minor UX fix (P3).**
