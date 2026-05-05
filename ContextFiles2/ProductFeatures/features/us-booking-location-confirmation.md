# Feature: US Booking Location Confirmation

## Purpose
- Confirm client/provider location during in-person booking and profile setup (U.S.-specific validation).

## User journey / key actions
- Provider or client captures address details via Google address inputs.
- Booking flow uses captured location data for in-person sessions.

## Glossary / UI terms
- Address
- Location
- In‑person

## Entry points
- Screens/routes: `RG-Frontend/src/pages/cp/profile/InPersonGoogleLoaction.tsx`, `RG-Frontend/src/pages/profile/clientGoogleLoaction.tsx`, `RG-Frontend/src/components/Common/GoogleAddressInput.tsx`
- API/GraphQL: `Lumy-Backend/apps/calendar_functionality/queries.py`, `Lumy-Backend/apps/calendar_functionality/urls.py`

## Data entities
- `Lumy-Backend/apps/calendar_functionality/models.py`

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - U.S. Booking Location Confirmation.txt

## Technical mapping
- [Technical doc](../technical/us-booking-location-confirmation-technical.md)
