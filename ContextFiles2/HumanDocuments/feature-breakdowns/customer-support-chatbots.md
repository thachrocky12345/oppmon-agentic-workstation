# Feature: Custom Support Chatbots

## Overview
Creates support chatbots for customer support and platform guidance, with structured content and routing. The BRD appears in two versions.

## Why it exists
Not all users will browse a help center; chatbots provide in-context support and reduce support load.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD – Customer Support Chatbots.txt`
- BRD content defines chatbot intent, content sourcing, and escalation (see BRD for details).

## Current state (repo)
- A chatbot component exists in `RG-Frontend/src/components/chatbot/chatbot.tsx`.
- No explicit backend chatbot content system identified in this repo.

## Missing pieces
- Content and intent catalog for chatbot responses.
- Escalation logic and analytics.
- Integration with support knowledge base or CMS.

## Next steps
1. Review BRD details to extract intent coverage and response rules.
2. Identify or build content source (CMS or structured JSON).
3. Wire chatbot to content source and define escalation paths.
4. Add analytics for deflection and satisfaction.
