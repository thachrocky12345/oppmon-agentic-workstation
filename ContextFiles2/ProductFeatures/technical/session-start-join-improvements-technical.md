# Technical: Session Start/Join Improvements

## Screens / routes
- `RG-Frontend/src/pages/dashboard/index.tsx` (launch meet link)
- `RG-Frontend/src/components/Popup/Popup.tsx` (meeting link in popup)
- `RG-Frontend/src/pages/meet/left-meeting/index.tsx`
- `RG-Frontend/src/utils/routes.ts` (`/meet/ag`, `/meet/lg`, `/meet/left-meeting`)

## Frontend components/modules
- `RG-Frontend/src/containers/screens/MeetLoginScreen/MeetLoginScreen.tsx`
- `RG-Frontend/src/containers/screens/ActiveVideoRoom/`
- `RG-Frontend/src/containers/screens/PreJoinScreen/`

## Backend apps/modules
- `Lumy-Backend/apps/video_conferencing/`

## APIs / GraphQL operations
- `Lumy-Backend/apps/video_conferencing/urls.py`

## Key files and directories
- `Lumy-Backend/apps/video_conferencing/views.py` (meeting start/participant endpoints)

## Tests
- `Lumy-Backend/apps/video_conferencing/tests.py`

## Config / env
- `Lumy-Backend/lumy_global/settings.py`

## Known risks / open questions
- Not found in repo. Search evidence: `rg -n "Open Questions|Risks" ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt` (0 matches)

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt
