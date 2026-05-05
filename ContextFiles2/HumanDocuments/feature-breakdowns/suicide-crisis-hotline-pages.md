# Feature: Suicide & Crisis Hotline Pages

## Overview
This feature publishes approximately 100 country-specific crisis hotline pages. Content is manually migrated from verified Google Docs into PayloadCMS with full fidelity. Pages must be SEO-ready, safe, and accurate, with manual JSON-LD schema injection and fast ISR delivery.

## Why it exists
Users in crisis need immediate, correct local resources. The pages also defend SEO territory by capturing high-intent crisis searches with authoritative content.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Global Suicide & Crisis Hotline Pages - English V2.txt`
- URL pattern: `/[language]-[COUNTRY]/[slug]/` (e.g., `/en-IT/crisis-suicide-hotlines/`).
- Next.js middleware must parse `en-IT` patterns; do not rely on default i18n.
- Manual content migration only (no scripts for narrative content).
- JSON-LD schema pasted manually from Google Docs; no auto-generation.
- All phone numbers are `tel:` links; flags are local SVGs via `flag-icons`.
- Dynamic OG images with verified messaging.
- ISR with ~60s revalidation; fast TTFB.

## Current state (repo)
- No PayloadCMS integration in repo.
- No hotline-specific routes or middleware for `/[language]-[COUNTRY]/`.
- Catch-all route `RG-Frontend/src/pages/[...slug].tsx` exists but is tailored to SERP/provider pages.

## Missing pieces
- PayloadCMS collections: Regions, Hotline Pages with nested repeater structure.
- Middleware and routing logic for `en-COUNTRY` paths.
- Hotline page templates and index page (`/hotlines/`).
- OG image generator.
- Manual migration process and QA gate.

## Next steps
1. Complete PayloadCMS on Azure (dependency).
2. Define Payload collections and fields per BRD.
3. Build Next.js middleware + ISR routes for hotline pages.
4. Implement OG image generation and schema injection.
5. Execute manual migration and run BRD QA checklist.
