# Feature: Update Therapist URLs

## Overview
This feature decouples the therapist navigation hierarchy from the URL structure. The visual menu remains nested, but link targets must resolve to flat, curated URLs defined in the Navigation Bar 2.3.5 spreadsheet (Therapists tab).

## Why it exists
Deeply nested URLs (for example, `/therapists/types/psychotherapists/clinical-social-workers`) reduce SEO strength and readability. The business goal is to promote therapist pages as primary entities with short, canonical URLs while preserving the nested menu UX.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Update Therapist URLs.txt`
- Use manual slugs from Navigation Bar 2.3.5 (Therapists tab, URL column) for routing.
- Menu hierarchy is still rendered using the Parent/Category/Subcategory columns.
- Duplicate menu entries must point to a single canonical URL.
- Location pages must append the flat slug as the final segment.
- System must generate 301 redirects from old nested URLs to new flat URLs.
- Must not change non-therapist verticals in this phase.

## Current state (repo)
- Navigation models: `Lumy-Backend/apps/care_provider/models.py` with auto-generated `slug` fields.
- Navigation GraphQL: `Lumy-Backend/apps/care_provider/queries.py`.
- Menu UI uses `item.slug` for routing in `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`.
- Catch-all route resolves slugs and supports `redirectSlug`: `RG-Frontend/src/pages/[...slug].tsx` (uses `GET_NAME_SLUG`).
- `menuPages` guard exists in `RG-Frontend/src/utils/routes.ts`.

## Missing pieces
- No DB field for manual target URLs or noindex flags.
- No ingestion pipeline for Navigation Bar 2.3.5 spreadsheet.
- No server-side 301 redirect implementation for old nested URLs.
- `unslugifySlug` resolver is referenced in frontend but not present in backend repo, so the source of redirect mapping is unclear.

## Next steps
1. Add `target_url` (manual URL) and `no_index` fields to navigation data for Therapist items.
2. Build an ingestion job to import Navigation Bar 2.3.5 (Therapists tab).
3. Expose `target_url` via GraphQL and update MegaMenu to use it.
4. Implement 301 redirects from old nested URLs to new flat URLs (server-level).
5. Confirm location routing logic accepts flat slugs at end of geo paths.
