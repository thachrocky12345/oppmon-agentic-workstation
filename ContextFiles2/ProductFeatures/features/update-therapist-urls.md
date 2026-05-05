# Feature: Update Therapist URLs

## Purpose
- Flatten therapist URLs while keeping the visual menu hierarchy, decoupling nested menu structure from the final target URL so therapist pages resolve to curated slugs. (BRD summary)

## User journey / key actions
- User opens the “Therapists” mega‑menu and clicks a nested item, but lands on a flat URL like `/art-therapist` instead of a multi‑level path. (BRD summary)
- Legacy nested therapist URLs must redirect to the new flat slug. (BRD summary)
- Location paths should append the flat slug as the terminal segment (e.g., `/{country}/{state}/{city}/{slug}`). (BRD summary)

## Glossary / UI terms
- Update Therapist URLs
- “Therapists” menu, “Navigation Bar 2.3.5”, “flat URL”, “redirectSlug” (BRD language + frontend variable)

## Entry points
- Screens/routes: `/<slug>` handled by `RG-Frontend/src/pages/[...slug].tsx` (dynamic routing for SERP vs. profile).
- Navigation UI: `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx`, `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`.
- API/GraphQL: `GET_NAME_SLUG` (unslugifySlug) + `SERP_PAGE_NEW` in `RG-Frontend/src/graphql/query/query.ts`; navigation queries in `Lumy-Backend/apps/care_provider/queries.py`; SERP data in `Lumy-Backend/apps/serp_result/queries.py`.

## Data entities
- `Lumy-Backend/apps/care_provider/models.py` (NavigationCategory/SubCategory/SubSubCategory slugs).
- `Lumy-Backend/apps/serp_result/models.py` (SERP entries tied to navigation categories).

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Update Therapist URLs.txt

## Technical mapping
- [Technical doc](../technical/update-therapist-urls-technical.md)
