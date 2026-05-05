# Feature: Provider Profiles

## Purpose
- Provider profile creation and management, including personal details, credentials, and public-facing profile content.

## User journey / key actions
- Provider updates profile details in `/cp/profile`.
- Provider edits public profile modules and media via Manage Pages.

## Glossary / UI terms
- Care Provider Profile
- Manage Pages

## Entry points
- Screens/routes: `RG-Frontend/src/pages/cp/profile/index.tsx`, `RG-Frontend/src/pages/cp/profile/ManagePages.tsx`
- API/GraphQL: `Lumy-Backend/apps/care_provider/queries.py`, `Lumy-Backend/apps/care_provider/mutations.py`

## Data entities
- `Lumy-Backend/apps/care_provider/models.py`
- `Lumy-Backend/apps/manage_pages/models.py`

## Related docs
- ContextFiles/SystemOverview.md

## Technical mapping
- [Technical doc](../technical/provider-profiles-technical.md)
