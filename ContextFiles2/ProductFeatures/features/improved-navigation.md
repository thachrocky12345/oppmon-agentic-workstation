# Feature: Improved Navigation

## Purpose
- Replace the current nav‑bar behavior with a mega‑menu style navigation that can handle many direct links without redundant spacing or plugin limitations. (BRD summary)

## User journey / key actions
- User hovers a top‑level nav category and sees a structured list of sub‑categories and links.
- Clicking a nav item routes to the linked slug (often a SERP/landing page).

## Glossary / UI terms
- Improved Navigation
- Nav Bar, Mega Menu, Navigation Category/Subcategory

## Entry points
- Screens/routes: global nav rendered by `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx` and `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`.
- API/GraphQL: `NAVIGATION_CATEGORY` + `NAVIGATION_SUB_CATEGORY` (+ sub‑sub variants) in `RG-Frontend/src/graphql/query/query.ts`; backend resolvers in `Lumy-Backend/apps/care_provider/queries.py`.

## Data entities
- `Lumy-Backend/apps/care_provider/models.py` (NavigationCategory/SubCategory/SubSubCategory/SubSubSubCategory).

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/Improved Navigation.txt

## Technical mapping
- [Technical doc](../technical/improved-navigation-technical.md)
