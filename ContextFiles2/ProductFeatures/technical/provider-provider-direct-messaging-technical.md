# Technical: Provider/Provider Direct Messaging

## Screens / routes
- `RG-Frontend/src/containers/ChatWindow/ChatWindow.tsx`
- `RG-Frontend/src/containers/screens/ActiveVideoRoom/ActiveVideoRoom.tsx`

## Frontend components/modules
- `RG-Frontend/src/containers/chat-provider/index.tsx`
- `RG-Frontend/src/containers/ChatWindow/MessageList/MessageList.tsx`
- `RG-Frontend/src/containers/ChatWindow/ChatInput/ChatInput.tsx`

## Backend apps/modules
- `Lumy-Backend/apps/video_conferencing/`

## APIs / GraphQL operations
- `Lumy-Backend/apps/video_conferencing/urls.py`

## Key files and directories
- `Lumy-Backend/apps/video_conferencing/utils.py`
- `Lumy-Backend/apps/video_conferencing/serializers.py`

## Tests
- `Lumy-Backend/apps/video_conferencing/tests.py`

## Config / env
- `Lumy-Backend/lumy_global/settings.py`

## Known risks / open questions
- Dedicated provider-to-provider messaging outside video sessions not found in repo.

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt
