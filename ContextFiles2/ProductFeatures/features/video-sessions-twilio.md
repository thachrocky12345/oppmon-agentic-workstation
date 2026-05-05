# Feature: Video Sessions (Twilio)

## Purpose
- Inferred from code: real-time video appointments with pre-join device checks, in-room controls, and post-session survey flows using Twilio Video.

## User journey / key actions
- User joins `/meet/*` flow, completes pre-join checks, enters active video room, and exits to post-session screen.
- In-room controls include audio/video toggles, screenshare, participant list, and invite link copy.

## Glossary / UI terms
- Meet
- Pre-Join
- Active Video Room
- Post-Session

## Entry points
- Screens/routes: `RG-Frontend/src/pages/meet/[room].tsx`, `RG-Frontend/src/pages/meet/left-meeting/index.tsx`, `RG-Frontend/src/containers/screens/MeetLoginScreen/MeetLoginScreen.tsx`
- API/GraphQL: `Lumy-Backend/apps/video_conferencing/urls.py`

## Data entities
- `Lumy-Backend/apps/video_conferencing/models.py` (VideoCallRoom, VideoCallParticipants, Notes)

## Related docs
- ContextFiles/SystemOverview.md

## Technical mapping
- [Technical doc](../technical/video-sessions-twilio-technical.md)
