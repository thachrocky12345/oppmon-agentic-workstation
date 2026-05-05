# Feature: Calendar Improvements

## Purpose
- Improve provider scheduling so Care Providers can stay bookable, manage availability, and surface open slots to clients.

## User journey / key actions
- Provider manages availability in CP calendar and edits slots or recurring patterns.
- Client selects open slots from provider calendar/booking modals.

## Glossary / UI terms
- Availability
- Slots
- Calendar

## Entry points
- Screens/routes: `RG-Frontend/src/pages/cp-calendar/index.tsx`, `RG-Frontend/src/components/Calendar/MonthCalendar.tsx`, `RG-Frontend/src/components/Popup/SelectEditAvailabilityModal.tsx`
- API/GraphQL: `Lumy-Backend/apps/calendar_functionality/queries.py`, `Lumy-Backend/apps/calendar_functionality/urls.py`

## Data entities
- `Lumy-Backend/apps/calendar_functionality/models.py`

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Calendar Improvements.txt

## Technical mapping
- [Technical doc](../technical/calendar-improvements-technical.md)
