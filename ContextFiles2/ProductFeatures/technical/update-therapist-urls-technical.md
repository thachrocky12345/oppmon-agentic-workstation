# Technical: Update Therapist URLs

## Screens / routes
- `/<slug>` (dynamic route: `RG-Frontend/src/pages/[...slug].tsx`).

## Frontend components/modules
- `RG-Frontend/src/pages/[...slug].tsx` (routing/redirectSlug + SERP fetch).
- `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx` (menu link construction).
- `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx` (navigation dropdown + subcategory queries).
- `RG-Frontend/src/utils/routes.ts` (menuPages guard).
- `RG-Frontend/src/graphql/query/query.ts` (`GET_NAME_SLUG`, `SERP_PAGE_NEW`, navigation queries).

## Backend apps/modules
- `Lumy-Backend/apps/care_provider` (navigation categories, slugs, GraphQL navigation queries).
- `Lumy-Backend/apps/serp_result` (SERP pages + filters).

## APIs / GraphQL operations
- `RG-Frontend/src/graphql/query/query.ts`:
  - `GET_NAME_SLUG` (`unslugifySlug`) for resolving slug + redirectSlug.
  - `SERP_PAGE_NEW` (`serpPageResults`) for SERP data.
  - `NAVIGATION_CATEGORY`, `NAVIGATION_SUB_CATEGORY`, `NAVIGATION_SUB_SUB_CATEGORY`, `NAVIGATION_SUB_2_CATEGORY`, `NAVIGATION_SUB_3_CATEGORY`.
- `Lumy-Backend/apps/care_provider/queries.py` (navigation_* resolvers).
- `Lumy-Backend/apps/serp_result/queries.py` (SERP results).

## Key files and directories
- `RG-Frontend/src/pages/[...slug].tsx`
- `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`
- `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx`
- `Lumy-Backend/apps/care_provider/models.py`
- `Lumy-Backend/apps/care_provider/queries.py`
- `Lumy-Backend/apps/serp_result/models.py`
- `Lumy-Backend/apps/serp_result/queries.py`

## Tests
- Lumy-Backend/apps/care_provider/tests.py
- Lumy-Backend/apps/serp_result/tests.py

## Config / env
- Lumy-Backend/lumy_global/settings.py
- RG-Frontend/src/store/axiosInstance.ts

## Known risks / open questions
- Risk: Broken Links / 404s from old nested structure.
- Mitigation: System must automatically generate 301 Redirects from the old programmatic URLs to the new manual flat URLs.
- Risk: Visual Menu vs. Link mismatch.

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Update Therapist URLs.txt
