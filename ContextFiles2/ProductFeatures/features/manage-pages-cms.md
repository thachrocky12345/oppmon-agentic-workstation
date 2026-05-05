# Feature: Manage Pages CMS

## Purpose
- In-repo CMS for provider pages and specialized content (managed via Django + frontend editor modules).

## User journey / key actions
- Provider edits page content modules, images, and videos in Manage Pages.
- Published content renders on provider profile and SERP pages.

## Glossary / UI terms
- Manage Pages
- Modules
- Publish

## Entry points
- Screens/routes: `RG-Frontend/src/containers/CareProviderSetup/CPDetailsSetup/CPManagePages/CPManagePages.tsx`, `RG-Frontend/src/pages/cp/profile/ManagePages.tsx`
- API/GraphQL: `Lumy-Backend/apps/manage_pages/queries.py`, `Lumy-Backend/apps/manage_pages/mutations.py`

## Data entities
- `Lumy-Backend/apps/manage_pages/models.py`

## Related docs
- ContextFiles/SystemOverview.md

## Technical mapping
- [Technical doc](../technical/manage-pages-cms-technical.md)
