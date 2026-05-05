# Feature: Provider Activation (Onboarding & Portal)

## Purpose
- Enable care providers to create accounts, complete onboarding steps, and manage their profile/availability in the provider portal.

## User journey / key actions
- Provider signs up, completes profile + credentials, then configures services and availability.
- Provider manages portal data and publishing settings.

## Glossary / UI terms
- Care Provider Setup
- Provider Portal
- Profile Completion

## Entry points
- Screens/routes: `RG-Frontend/src/pages/cp/profile/index.tsx`, `RG-Frontend/src/containers/CareProviderSetup/`
- API/GraphQL: `Lumy-Backend/apps/authentication/queries.py`, `Lumy-Backend/apps/authentication/urls.py`, `Lumy-Backend/apps/care_provider/queries.py`, `Lumy-Backend/apps/care_provider/urls.py`

## Data entities
- `Lumy-Backend/apps/care_provider/models.py`
- `Lumy-Backend/apps/authentication/models.py`

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt

## Technical mapping
- [Technical doc](../technical/provider-activation-onboarding-portal-technical.md)
