# Feature: Customer Support Chatbots

## Purpose
- We currently spend $240/month on Microsoft Copilot to power simple customer-support Q&A experiences based on internal Word documents. This MVP replaces Copilot with a cheaper solution using OpenAI-managed file storage

## User journey / key actions
- 1. Feature Name (Working Title)
- MVP Customer Support Chatbots (Provider Bot + Client/Public Bot) – OpenAI
- 2. Summary

## Glossary / UI terms
- Customer Support Chatbots
- Not found in repo. Search evidence: `rg -n "Glossary|Definitions|Key Terms" ContextFiles/HumanDocuments/Features/_extracted/BRD – Customer Support Chatbots.txt` (0 matches)

## Entry points
- Screens/routes: /api/stripe-checkout/create-session
- API/GraphQL: Found 10 matches in 3 files. Search evidence: `rg -n "customer" Lumy-Backend/apps`. Sample files: Lumy-Backend/apps/stripe_integration/models.py, Lumy-Backend/apps/stripe_integration/admin.py, Lumy-Backend/apps/authentication/mutations.py

## Data entities
- Found 10 matches in 3 files. Search evidence: `rg -n "customer" Lumy-Backend/apps`. Sample files: Lumy-Backend/apps/stripe_integration/models.py, Lumy-Backend/apps/stripe_integration/admin.py, Lumy-Backend/apps/authentication/mutations.py

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD – Customer Support Chatbots.txt

## Technical mapping
- [Technical doc](../technical/customer-support-chatbots-technical.md)
