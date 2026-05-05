# Implementation Design: Suicide & Crisis Hotline Pages

## 1) Overview
Build ~100 country-specific crisis hotline pages with manual content migration from Google Docs into PayloadCMS on Azure. Pages must use `/[language]-[COUNTRY]/[slug]/` URLs, render as ISR pages, and inject manual JSON-LD schema.

## 2) Current State (Code-Level)
- No PayloadCMS integration in repo.
- Catch-all route exists: `RG-Frontend/src/pages/[...slug].tsx` (SERP/provider oriented).
- No middleware for `en-COUNTRY` routing.

## 3) Proposed Design (Implementation-Level)
### Backend (PayloadCMS)
- Collections:
  - `Regions` taxonomy
  - `Hotline_Pages` with fields:
    - countryCode, region, rich text content
    - nested repeater: organization → contact methods
    - SEO overrides: title, description, canonical, JSON-LD
- Manual migration only (no scripted parsing).

### Frontend (Next.js)
- Add middleware to parse `/[language]-[COUNTRY]/` and rewrite.
- Add `/hotlines/` index page with region grouping.
- Add country page route for `/<language>-<COUNTRY>/<slug>/`.
- ISR with 60s revalidate.
- Inject JSON-LD and canonical tags.
- Generate dynamic OG images via `@vercel/og`.

## 4) File/Module Impact Map
- `RG-Frontend/src/middleware.ts`: add locale-country rewrite.
- `RG-Frontend/src/pages/hotlines/index.tsx` (new): index page rendering.
- `RG-Frontend/src/pages/[language]-[COUNTRY]/[slug].tsx` (new): country page.
- `RG-Frontend/src/lib/api/...` (new): PayloadCMS fetch utilities.
- PayloadCMS codebase (external): collections + localization config.

## 5) Data Migration / Ingestion Plan
- Manual entry from Google Docs into PayloadCMS.
- QA via visual diff for each page.
- Schema pasted directly in CMS field.

## 6) Risks + Edge Cases
- Manual errors in phone numbers or schema.
- Locale routing mismatch (wrong country page).
- Schema validation failures.

## 7) Testing Plan
- Google Rich Results Test for schema.
- tel: links tested on mobile.
- OG images validated for sample countries.

## 8) Sequencing & Dependencies
1. PayloadCMS on Azure must be live.
2. CMS collections + manual migration.
3. Next.js routes + middleware.
4. SEO validation and QA.
