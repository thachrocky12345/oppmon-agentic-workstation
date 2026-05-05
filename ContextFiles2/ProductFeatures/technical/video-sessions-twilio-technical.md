# Technical: Video Sessions (Twilio)

## Screens / routes
- `RG-Frontend/src/pages/meet/[room].tsx`
- `RG-Frontend/src/pages/meet/left-meeting/index.tsx`
- `RG-Frontend/src/containers/screens/MeetLoginScreen/MeetLoginScreen.tsx`

## Frontend components/modules
- `RG-Frontend/src/containers/screens/PreJoinScreen/`
- `RG-Frontend/src/containers/screens/ActiveVideoRoom/`
- `RG-Frontend/src/containers/screens/PostVideoRoom/`
- `RG-Frontend/src/containers/VideoProvider/VideoProvider.tsx`
- `RG-Frontend/src/containers/ChatWindow/`

## Backend apps/modules
- `Lumy-Backend/apps/video_conferencing/`

## APIs / GraphQL operations
- `Lumy-Backend/apps/video_conferencing/urls.py` (access token, participant management, chat cleanup)
- `RG-Frontend/src/pages/api/removeuser.ts`
- `RG-Frontend/src/pages/api/deletechat.ts`

## Key files and directories
- `Lumy-Backend/apps/video_conferencing/utils.py` (Twilio token, room, chat)
- `Lumy-Backend/apps/video_conferencing/serializers.py` (chatroom + token wiring)
- `Lumy-Backend/apps/video_conferencing/twilio_config.py`

## Tests
- `Lumy-Backend/apps/video_conferencing/tests.py`

## Config / env
- `Lumy-Backend/lumy_global/settings.py` (Twilio keys)
- `RG-Frontend/.env*` (Twilio/meet endpoints if configured)

## Known risks / open questions
- Not found in repo. Search evidence: `rg -n "Open Questions|Risks" ContextFiles/SystemOverview.md` (0 matches)

## Source docs
- ContextFiles/SystemOverview.md
