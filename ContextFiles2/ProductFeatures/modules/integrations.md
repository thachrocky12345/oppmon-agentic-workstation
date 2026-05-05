# Module: integrations

## Scope
- Includes the features listed below.

## Features

- [Add Providers to Go High Level](../features/add-providers-to-go-high-level.md)
- [Add providers and their data to Go High Level](../features/add-providers-and-their-data-to-go-high-level.md)
- [Language Translation](../features/language-translation.md)
- [MCP / LLM In-Chat Discoverability](../features/mcp-llm-in-chat-discoverability.md)
- [MCP / LLM Integration - In-Chat Discoverability](../features/mcp-llm-integration-in-chat-discoverability.md)
- [Real-Time Audio Translation](../features/real-time-audio-translation.md)

## Core files/services
- Found 1 matches in 1 files. Search evidence: `rg -n "mcp" RG-Frontend/src`. Sample files: RG-Frontend/src/containers/CareProviderSetup/CPDetailsSetup/CPDetailsSetup.tsx
- Found 2243 matches in 274 files. Search evidence: `rg -n "add" RG-Frontend/src`. Sample files: RG-Frontend/src/stripeConnect/stripeConnect.tsx, RG-Frontend/src/mixPanelEvents/signupJourney.ts, RG-Frontend/src/styles/styled.ts, RG-Frontend/src/styles/commonStyles.ts, RG-Frontend/src/mixPanelEvents/searchAnalytics.ts
- Found 79 matches in 13 files. Search evidence: `rg -n "real" RG-Frontend/src`. Sample files: RG-Frontend/src/styles/prd.css, RG-Frontend/src/pages/______sitemap.xml.js, RG-Frontend/src/utils/fakeUsers.json, RG-Frontend/src/containers/footer-area/index.tsx, RG-Frontend/src/components/MegaMenu/MegaMenu.tsx
- RG-Frontend/src/i18n
- See [Add Providers to Go High Level](../technical/add-providers-to-go-high-level-technical.md).
- See [MCP / LLM In-Chat Discoverability](../technical/mcp-llm-in-chat-discoverability-technical.md).

## Key dependencies/integrations
- Found 129 matches in 14 files. Search evidence: `rg -n "language" Lumy-Backend/apps`. Sample files: Lumy-Backend/apps/stripe_integration/utils.py, Lumy-Backend/apps/graphqlapp/mutations.py, Lumy-Backend/apps/serp_result/queries.py, Lumy-Backend/apps/care_provider/tasks.py, Lumy-Backend/apps/manage_pages/mutations.py
- Found 18 matches in 6 files. Search evidence: `rg -n "chat" Lumy-Backend/apps`. Sample files: Lumy-Backend/apps/video_conferencing/views.py, Lumy-Backend/apps/video_conferencing/utils.py, Lumy-Backend/apps/video_conferencing/urls.py, Lumy-Backend/apps/video_conferencing/twilio_config.py, Lumy-Backend/apps/video_conferencing/serializers.py
- Found 81 matches in 16 files. Search evidence: `rg -n "add" Lumy-Backend/apps`. Sample files: Lumy-Backend/apps/video_conferencing/models.py, Lumy-Backend/apps/video_conferencing/utils.py, Lumy-Backend/apps/graphqlapp/mutations.py, Lumy-Backend/apps/manage_pages/object_types.py, Lumy-Backend/apps/care_provider/tasks.py
- See [Add Providers to Go High Level](../technical/add-providers-to-go-high-level-technical.md).
- See [MCP / LLM In-Chat Discoverability](../technical/mcp-llm-in-chat-discoverability-technical.md).
