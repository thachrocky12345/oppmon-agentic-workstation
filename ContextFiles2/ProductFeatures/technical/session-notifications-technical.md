# Technical: Session Notifications

## Screens / routes
- `RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx` (Google Calendar event + reminders)
- `RG-Frontend/src/components/Popup/BookingConfirmModal.tsx` (Google Calendar event + reminders)

## Frontend components/modules
- `RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx`
- `RG-Frontend/src/components/Popup/BookingConfirmModal.tsx`

## Backend apps/modules
- `Lumy-Backend/apps/calendar_functionality/`

## APIs / GraphQL operations
- `Lumy-Backend/apps/calendar_functionality/urls.py`

## Key files and directories
- `Lumy-Backend/apps/calendar_functionality/models.py`
- `RG-Frontend/src/lib/api.ts` (calendar helper calls)

## Tests
- `Lumy-Backend/apps/calendar_functionality/tests.py`

## Config / env
- `Lumy-Backend/lumy_global/settings.py`

## Known risks / open questions
- Backend notification delivery (email/SMS) not found in repo. Search evidence: `rg -n "notification|reminder" Lumy-Backend/apps` (0 matches)

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Session Notifications.txt
