# Module: scheduling-and-calendar

## Scope
- Includes the features listed below.

## Features

- [A method for Providers and/or Clients to more easily book follow-up appointments during an appointment or via Direct Messages after a call (Provider lead)](../features/follow-up-booking-during-session-or-dm-provider-lead.md)
- [Calendar Improvements](../features/calendar-improvements.md)
- [Direct Booking Link](../features/direct-booking-link.md)
- [Follow-up Appointment Booking](../features/follow-up-appointment-booking.md)
- [Off-site Booking Link](../features/off-site-booking-link.md)
- [Offsite Booking Link](../features/offsite-booking-link.md)
- [Scheduling & Appointments](../features/scheduling-appointments.md)
- [US Booking Location Confirmation](../features/us-booking-location-confirmation.md)

## Core files/services
- Found 121 matches in 50 files. Search evidence: `rg -n "direct" RG-Frontend/src`. Sample files: RG-Frontend/src/stripeConnect/stripeConnect.tsx, RG-Frontend/src/styles/theme.ts, RG-Frontend/src/styles/prd.css, RG-Frontend/src/graphql/query/query.ts, RG-Frontend/src/styles/globals.css
- Found 241 matches in 78 files. Search evidence: `rg -n "off" RG-Frontend/src`. Sample files: RG-Frontend/src/stripeConnect/stripeConnect.tsx, RG-Frontend/src/lib/utils/errorDictionary.ts, RG-Frontend/src/styles/globals.css, RG-Frontend/src/lib/utils/convertMeetingTime.ts, RG-Frontend/src/mixPanelEvents/MIXPANEL_README.md
- Found 25 matches in 7 files. Search evidence: `rg -n "follow" RG-Frontend/src`. Sample files: RG-Frontend/src/mixPanelEvents/MIXPANEL_README.md, RG-Frontend/src/containers/Authentication/SignUpModal/TosText.tsx, RG-Frontend/src/containers/Authentication/SignUpModal/PrivacyPolicyPage.tsx, RG-Frontend/src/containers/landing-screen/main-filters/price/index.tsx, RG-Frontend/src/containers/GetVerified/VerificationRequest.tsx
- RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx
- RG-Frontend/src/pages/cp-calendar/index.tsx
- See [Follow-up Appointment Booking](../technical/follow-up-appointment-booking-technical.md).
- See [Off-site Booking Link](../technical/off-site-booking-link-technical.md).

## Key dependencies/integrations
- Found 55 matches in 8 files. Search evidence: `rg -n "site" Lumy-Backend/apps`. Sample files: Lumy-Backend/apps/video_conferencing/admin.py, Lumy-Backend/apps/calendar_functionality/admin.py, Lumy-Backend/apps/serp_result/admin.py, Lumy-Backend/apps/stripe_integration/admin.py, Lumy-Backend/apps/manage_pages/admin.py
- Found 6 matches in 1 files. Search evidence: `rg -n "direct" Lumy-Backend/apps`. Sample files: Lumy-Backend/apps/authentication/utils.py
- Lumy-Backend/apps/calendar_functionality
- See [Follow-up Appointment Booking](../technical/follow-up-appointment-booking-technical.md).
- See [Off-site Booking Link](../technical/off-site-booking-link-technical.md).
