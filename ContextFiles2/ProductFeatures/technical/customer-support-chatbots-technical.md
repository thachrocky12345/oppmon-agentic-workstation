# Technical: Customer Support Chatbots

## Screens / routes
- /api/stripe-checkout/create-session

## Frontend components/modules
- Found 50 matches in 16 files. Search evidence: `rg -n "customer" RG-Frontend/src`. Sample files: RG-Frontend/src/graphql/query/query.ts, RG-Frontend/src/components/PaymentModule/SetupForm.tsx, RG-Frontend/src/components/PaymentModule/PaymentDialog.tsx, RG-Frontend/src/components/PaymentModule/ListPaymentMethods.tsx, RG-Frontend/src/pages/api/stripe-checkout/create-session.ts

## Backend apps/modules
- Found 10 matches in 3 files. Search evidence: `rg -n "customer" Lumy-Backend/apps`. Sample files: Lumy-Backend/apps/stripe_integration/models.py, Lumy-Backend/apps/stripe_integration/admin.py, Lumy-Backend/apps/authentication/mutations.py

## APIs / GraphQL operations
- Not found in repo. Search evidence: `rg -n "customer" RG-Frontend/src/graphql Lumy-Backend/apps` (0 matches)

## Key files and directories
- Found 50 matches in 16 files. Search evidence: `rg -n "customer" RG-Frontend/src`. Sample files: RG-Frontend/src/graphql/query/query.ts, RG-Frontend/src/components/PaymentModule/SetupForm.tsx, RG-Frontend/src/components/PaymentModule/PaymentDialog.tsx, RG-Frontend/src/components/PaymentModule/ListPaymentMethods.tsx, RG-Frontend/src/pages/api/stripe-checkout/create-session.ts
- Found 10 matches in 3 files. Search evidence: `rg -n "customer" Lumy-Backend/apps`. Sample files: Lumy-Backend/apps/stripe_integration/models.py, Lumy-Backend/apps/stripe_integration/admin.py, Lumy-Backend/apps/authentication/mutations.py

## Tests
- Not found in repo. Search evidence: `rg -n "customer" Lumy-Backend RG-Frontend` (0 matches)

## Config / env
- Lumy-Backend/lumy_global/settings.py
- RG-Frontend/src/store/axiosInstance.ts

## Known risks / open questions
- Email escalation feasibility - Requirement: the bot must be able to collect an email address and send an email to the support team with the user’s problem. - This is feasible, but depends on selecting the outbound email method (e.g., existing Microsoft 365 mailbox/SMTP or an email service).
- Doc conflicts / outdated guidance - If documents contain conflicting instructions, the bot may answer inconsistently. - Mitigation (MVP): prefer newer docs when metadata is available; capture unresolved issues via escalation/logs.
- No public docs to link - Users cannot be sent to the underlying documents until a public Help Center exists. - Mitigation (MVP): answers must be self-contained; escalation fills the gap.

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD – Customer Support Chatbots.txt
