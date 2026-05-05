# Feature: Scheduling & Appointments

## Purpose
- Allow clients to book appointments and providers to manage availability, slots, and sessions. (SystemOverview + calendar endpoints)

## User journey / key actions
- Client selects a provider, chooses a slot, and confirms booking (SelectAppointmentModal flow).
- Provider creates/updates availability and views appointments in calendar pages.

## Glossary / UI terms
- Scheduling & Appointments
- “slot”, “appointment”, “session type”, “availability”

## Entry points
- Screens/routes: provider calendar at `/cp-calendar` (`RG-Frontend/src/pages/cp-calendar/index.tsx`), booking flows in `RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx` and `RG-Frontend/src/components/Popup/ConfirmAppointmentModal.tsx`.
- API/GraphQL: REST endpoints under `/calendar/functionality/*` in `RG-Frontend/src/lib/constants.ts`; backend GraphQL/REST in `Lumy-Backend/apps/calendar_functionality`.

## Data entities
- Lumy-Backend/apps/calendar_functionality/models.py

## Related docs
- ContextFiles/SystemOverview.md

## Technical mapping
- [Technical doc](../technical/scheduling-appointments-technical.md)
