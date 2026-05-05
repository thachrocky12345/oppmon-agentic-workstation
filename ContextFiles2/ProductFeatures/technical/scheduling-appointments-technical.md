# Technical: Scheduling & Appointments

## Screens / routes
- `/cp-calendar` (`RG-Frontend/src/pages/cp-calendar/index.tsx`)
- Booking modals: `RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx`, `RG-Frontend/src/components/Popup/ConfirmAppointmentModal.tsx`, `RG-Frontend/src/components/Popup/BookingConfirmModal.tsx`

## Frontend components/modules
- RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx
- RG-Frontend/src/store/slices/appointmentSlice.ts
- RG-Frontend/src/store/slices/careProvider.ts

## Backend apps/modules
- Lumy-Backend/apps/calendar_functionality

## APIs / GraphQL operations
- REST endpoints defined in `RG-Frontend/src/lib/constants.ts`:
  - `/calendar/functionality/slot/bulk/create/`
  - `/calendar/functionality/slot/`
  - `/calendar/functionality/appointments/`
  - `/calendar/functionality/session/type/`
  - `/calendar/functionality/detail/appointment/`
  - `/calendar/functionality/invoicelisting/`
- Backend: `Lumy-Backend/apps/calendar_functionality/urls.py`, `Lumy-Backend/apps/calendar_functionality/queries.py`

## Key files and directories
- RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx
- Lumy-Backend/apps/calendar_functionality
- RG-Frontend/src/pages/cp-calendar/index.tsx

## Tests
- Lumy-Backend/apps/calendar_functionality/tests.py

## Config / env
- Lumy-Backend/lumy_global/settings.py
- RG-Frontend/src/store/axiosInstance.ts

## Known risks / open questions
- - Security: Secret key and DEBUG=true in settings; tighten for production, restrict CORS/CSRF, remove wildcard hosts.
- - Observability: No structured logging/metrics; add Sentry or similar plus request/DB logging.
- - Testing: Backend has app-level tests but coverage unknown; frontend lacks tests—add Jest/RTL for critical flows.

## Source docs
- ContextFiles/SystemOverview.md
