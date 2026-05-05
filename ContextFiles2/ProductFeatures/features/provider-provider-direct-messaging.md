# Feature: Provider/Provider Direct Messaging

## Purpose
- Not found in repo for a dedicated provider-to-provider messaging system. Only in-session chat appears to exist.

## User journey / key actions
- Inferred: providers can message within a shared session via in-room chat.

## Glossary / UI terms
- Chat
- Messages

## Entry points
- Screens/routes: `RG-Frontend/src/containers/ChatWindow/ChatWindow.tsx`, `RG-Frontend/src/pages/_app.tsx` (ChatProvider)
- API/GraphQL: `Lumy-Backend/apps/video_conferencing/urls.py`

## Data entities
- `Lumy-Backend/apps/video_conferencing/models.py`

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt

## Technical mapping
- [Technical doc](../technical/provider-provider-direct-messaging-technical.md)
