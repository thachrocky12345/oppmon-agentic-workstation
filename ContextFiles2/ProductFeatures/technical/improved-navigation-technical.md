# Technical: Improved Navigation

## Screens / routes
- Global navigation rendered on landing screens (header/sub‑header), no dedicated route.

## Frontend components/modules
- `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx` (primary nav UI + subcategory fetching).
- `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx` (mega‑menu rendering and link construction).
- `RG-Frontend/src/components/Layout/Layout.tsx` and `RG-Frontend/src/components/Layout/LayoutChange/AppointmentHeader.tsx` (top‑level header/menu shells).
- `RG-Frontend/src/graphql/query/query.ts` (NAVIGATION_* queries).

## Backend apps/modules
- `Lumy-Backend/apps/care_provider` (navigation category models + queries).

## APIs / GraphQL operations
- `RG-Frontend/src/graphql/query/query.ts`:
  - `NAVIGATION_CATEGORY`
  - `NAVIGATION_SUB_CATEGORY`
  - `NAVIGATION_SUB_2_CATEGORY`
  - `NAVIGATION_SUB_3_CATEGORY`
  - `NAVIGATION_SUB_SUB_CATEGORY`
- `Lumy-Backend/apps/care_provider/queries.py` (navigation_* resolvers).

## Key files and directories
- `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx`
- `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`
- `Lumy-Backend/apps/care_provider/models.py`
- `Lumy-Backend/apps/care_provider/queries.py`

## Tests
- Not found in repo. Search evidence: `rg -n "navigation_category" -g '*test*' Lumy-Backend RG-Frontend` (0 matches)

## Config / env
- `Lumy-Backend/lumy_global/settings.py`
- `RG-Frontend/src/store/axiosInstance.ts`

## Known risks / open questions
- BRD lacks structured requirements; ensure UX expectations are confirmed via Loom and Nav spreadsheet references.

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/Improved Navigation.txt
