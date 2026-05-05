# Feature: Profile page content

## Purpose
- Manage and render provider profile content blocks, images, and videos shown on public profile pages.

## User journey / key actions
- Provider edits content modules in Manage Pages.
- Client views rendered content on provider profile preview pages.

## Glossary / UI terms
- Profile Content
- Modules
- Profile Preview

## Entry points
- Screens/routes: `RG-Frontend/src/containers/cp-detail-preview/cp-content/cp-content.tsx`, `RG-Frontend/src/pages/care-provider/[cp-profile-preview].tsx`
- API/GraphQL: `Lumy-Backend/apps/manage_pages/queries.py`, `Lumy-Backend/apps/manage_pages/mutations.py`

## Data entities
- `Lumy-Backend/apps/manage_pages/models.py`

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/List of Features.txt

## Technical mapping
- [Technical doc](../technical/profile-page-content-technical.md)
