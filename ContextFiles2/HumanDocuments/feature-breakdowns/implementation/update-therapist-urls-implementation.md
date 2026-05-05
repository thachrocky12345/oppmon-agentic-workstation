# Implementation Design: Update Therapist URLs

## 1) Overview
This feature decouples the therapist navigation hierarchy from the URL structure. The menu remains nested visually, but links must resolve to flat URLs sourced from the “Navigation Bar 2.3.5” spreadsheet (Therapists tab). Old nested URLs must 301 redirect to the new flat URLs.

## 2) Current State (Code-Level)
- Navigation models (auto-slug): `Lumy-Backend/apps/care_provider/models.py`
- Navigation GraphQL: `Lumy-Backend/apps/care_provider/queries.py`
- Navigation UI: `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx`, `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`
- Slug resolution and redirect: `RG-Frontend/src/pages/[...slug].tsx` (`GET_NAME_SLUG` / `unslugifySlug`)
- Menu page guard: `RG-Frontend/src/utils/routes.ts`

## 3) Proposed Design (Implementation-Level)
### Backend
- Add `target_url` (manual URL) and optional `no_index` fields to navigation entities used by therapist menu items.
- Build ingestion pipeline for Navigation Bar 2.3.5 (Therapists tab):
  - Columns A/B/C = hierarchy
  - Column F = manual URL
  - Store `target_url` on terminal node
- Extend navigation GraphQL responses to return `target_url` and `no_index`.
- Implement redirect mapping for legacy nested URLs → new flat URLs.

### Frontend
- Update MegaMenu to route using `target_url` if present.
- Preserve hierarchy rendering using existing navigation data.
- Ensure location pages can append flat slug as terminal path.

### Redirects / SEO
- Implement server-side 301 redirect behavior for old nested therapist URLs.
- Avoid duplicate pages by canonicalizing duplicate menu entries.

## 4) File/Module Impact Map
- `Lumy-Backend/apps/care_provider/models.py`: add `target_url`, `no_index` fields.
- `Lumy-Backend/apps/care_provider/migrations/...`: migration for new fields.
- `Lumy-Backend/apps/care_provider/queries.py`: expose `target_url` and `no_index` in navigation resolvers.
- `Lumy-Backend/apps/care_provider/management/commands/...`: ingestion command for Navigation Bar 2.3.5.
- `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`: use `target_url` for routing.
- `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx`: pass through `target_url` to menu items.
- `RG-Frontend/src/pages/[...slug].tsx`: verify `redirectSlug` behavior supports new mapping.
- `RG-Frontend/src/middleware.ts` or backend routing layer: implement 301 redirects.

## 5) Data Migration / Ingestion Plan
- Input: Navigation Bar 2.3.5 Excel (Therapists tab).
- Parse hierarchy and URL column; update or create navigation nodes.
- Generate legacy URL mapping for redirects.
- Validate no duplicate `target_url` values.

## 6) Risks + Edge Cases
- Duplicate menu entries must point to one canonical URL.
- Redirect loops if `redirectSlug` equals current path.
- Non-therapist verticals must remain unchanged.

## 7) Testing Plan
- Backend: ingestion tests and GraphQL response tests.
- Frontend: click nested items and verify flat URL.
- Manual QA: old nested URLs redirect to flat URLs; location pages work.

## 8) Sequencing & Dependencies
1. Backend schema changes + migrations.
2. Ingestion pipeline for Nav Bar 2.3.5.
3. GraphQL updates.
4. Frontend routing updates.
5. Redirect implementation.
6. QA and SEO validation.
