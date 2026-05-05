# Feature: Session Notifications

## Purpose
- Define session-related reminders (email/popup) tied to appointment booking and calendar integration.

## User journey / key actions
- After booking, a calendar event is created with reminder overrides (email 24h, popup 10m).

## Glossary / UI terms
- Session Notifications
- Reminders

## Entry points
- Screens/routes: `RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx`, `RG-Frontend/src/components/Popup/BookingConfirmModal.tsx`
- API/GraphQL: `Lumy-Backend/apps/calendar_functionality/urls.py`

## Data entities
- `Lumy-Backend/apps/calendar_functionality/models.py`

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Session Notifications.txt

## Technical mapping
- [Technical doc](../technical/session-notifications-technical.md)
