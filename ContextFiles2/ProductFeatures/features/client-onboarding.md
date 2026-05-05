# Feature: Client Onboarding

## Purpose
- Enable clients to create accounts, verify contact details, and complete initial profile steps.

## User journey / key actions
- Client signs up via the multi-step signup modal and verifies email/phone.
- Client completes profile details and lands on profile pages.

## Glossary / UI terms
- Sign Up
- Verify Phone
- Create Account

## Entry points
- Screens/routes: `RG-Frontend/src/containers/Authentication/SignUpModal/SignUpModal.tsx`, `RG-Frontend/src/containers/Authentication/CreateAccountForm/CreateAccountForm.tsx`
- API/GraphQL: `Lumy-Backend/apps/authentication/urls.py`, `Lumy-Backend/apps/client/urls.py`

## Data entities
- `Lumy-Backend/apps/authentication/models.py`
- `Lumy-Backend/apps/client/models.py`

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/RG_ New Client Onboarding.txt

## Technical mapping
- [Technical doc](../technical/client-onboarding-technical.md)
