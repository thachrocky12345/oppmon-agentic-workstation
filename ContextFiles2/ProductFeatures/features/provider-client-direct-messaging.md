# Feature: Provider/Client Direct Messaging

## Purpose
- Inferred from code: in-session chat via Twilio Conversations embedded in the video session experience.

## User journey / key actions
- Users exchange messages in the in-session chat panel while in a video room.
- Messages are sent via Twilio Conversations tied to the room identity.

## Glossary / UI terms
- Chat
- Messages
- Conversation

## Entry points
- Screens/routes: `RG-Frontend/src/containers/ChatWindow/ChatWindow.tsx`, `RG-Frontend/src/pages/_app.tsx` (ChatProvider)
- API/GraphQL: `Lumy-Backend/apps/video_conferencing/urls.py`

## Data entities
- `Lumy-Backend/apps/video_conferencing/models.py`

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt

## Technical mapping
- [Technical doc](../technical/provider-client-direct-messaging-technical.md)
