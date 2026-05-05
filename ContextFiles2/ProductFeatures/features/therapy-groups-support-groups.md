# Feature: Therapy Groups & Support Groups

## Purpose
- Surface group-focused care types in navigation and search, with dedicated routes for therapy and support groups.

## User journey / key actions
- User navigates to Therapy Groups or Support Groups from the main menu.
- User browses group-oriented results in the SERP/category flow.

## Glossary / UI terms
- Therapy Groups
- Support Groups

## Entry points
- Screens/routes: `RG-Frontend/src/utils/routes.ts`, `RG-Frontend/src/utils/menuList.json`, `RG-Frontend/src/utils/helper.tsx`
- API/GraphQL: `Lumy-Backend/apps/calendar_functionality/constants.py`

## Data entities
- `Lumy-Backend/apps/calendar_functionality/constants.py` (group session types)

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Therapy Groups & Support Groups.txt

## Technical mapping
- [Technical doc](../technical/therapy-groups-support-groups-technical.md)
