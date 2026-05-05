# Technical: Provider/Client Direct Messaging

## Screens / routes
- `RG-Frontend/src/containers/ChatWindow/ChatWindow.tsx`
- `RG-Frontend/src/containers/screens/ActiveVideoRoom/ActiveVideoRoom.tsx`

## Frontend components/modules
- `RG-Frontend/src/containers/chat-provider/index.tsx` (Twilio Conversations client)
- `RG-Frontend/src/containers/ChatWindow/MessageList/MessageList.tsx`
- `RG-Frontend/src/containers/ChatWindow/ChatInput/ChatInput.tsx`
- `RG-Frontend/src/store/slices/chatSlice.ts`

## Backend apps/modules
- `Lumy-Backend/apps/video_conferencing/`

## APIs / GraphQL operations
- `Lumy-Backend/apps/video_conferencing/urls.py` (delete chat, access token)

## Key files and directories
- `Lumy-Backend/apps/video_conferencing/utils.py` (chat grants + cleanup)
- `Lumy-Backend/apps/video_conferencing/serializers.py` (create chatroom)

## Tests
- `Lumy-Backend/apps/video_conferencing/tests.py`

## Config / env
- `Lumy-Backend/lumy_global/settings.py` (Twilio chat service IDs)

## Known risks / open questions
- Not found in repo. Search evidence: `rg -n "Open Questions|Risks" ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt` (0 matches)

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt
