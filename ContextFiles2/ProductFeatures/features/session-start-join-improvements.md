# Feature: Session Start/Join Improvements

## Purpose
- Inferred from code: improve the meet/join flow for scheduled sessions across portal and popups.

## User journey / key actions
- User launches a session from dashboard/appointment UI, which opens the `/meet/*` flow in a new tab.
- User can copy invite links and rejoin/leave via `/meet/left-meeting`.

## Glossary / UI terms
- Meet
- Join Session
- Leave Meeting

## Entry points
- Screens/routes: `RG-Frontend/src/pages/dashboard/index.tsx`, `RG-Frontend/src/components/Popup/Popup.tsx`, `RG-Frontend/src/pages/meet/left-meeting/index.tsx`
- API/GraphQL: `Lumy-Backend/apps/video_conferencing/urls.py`

## Data entities
- `Lumy-Backend/apps/video_conferencing/models.py`

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt

## Technical mapping
- [Technical doc](../technical/session-start-join-improvements-technical.md)
