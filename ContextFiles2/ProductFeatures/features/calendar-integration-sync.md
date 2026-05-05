# Calendar Integration (External Sync)

## Overview
External calendar synchronization that allows providers to connect their Google Calendar, Outlook, or other calendar services. Syncs availability bidirectionally so providers can manage their schedule across platforms without double-booking.

## User Journey
1. Provider navigates to calendar settings
2. Provider connects external calendar via OAuth
3. System syncs existing events as blocked time slots
4. New appointments booked on ReallyGlobal are pushed to external calendar
5. Events added to external calendar are reflected as unavailable slots on ReallyGlobal
6. Provider can disconnect external calendar at any time

## Glossary
| Term | Definition |
|---|---|
| Calendar Sync | Bidirectional synchronization between ReallyGlobal and external calendars |
| Blocked Slot | Time period marked unavailable due to external calendar event |
| OAuth Connection | Authorization to read/write external calendar on provider's behalf |

## Entry Points
- **Backend**: `Lumy-Backend/apps/calendar_integration/`
- **API**: REST endpoints via `apps/calendar_integration/urls.py`
- **Frontend**: Accessed via provider calendar settings

## Related Features
- [Scheduling & Appointments](scheduling-appointments.md) — core scheduling system
- [Calendar Improvements](calendar-improvements.md) — calendar UX enhancements
- [Provider Profiles](provider-profiles.md) — availability display

## Module
[scheduling-and-calendar](../modules/scheduling-and-calendar.md)

## Notes
- This app has views and URL routing but no models — likely uses external API state rather than local storage
- Integration status may be stored on the CareProvider or User model as flags
