# Feature: Therapist SEO Page Implementation V2 (Therapists SERPs)

## Overview
This feature ingests therapist SEO CSV content and renders server-prebuilt SERP pages for Google. It requires strict SSR/ISR architecture, schema injection, and quality gates to avoid indexing thin pages.

## Why it exists
Current client-side rendering can leave bots with empty pages. As SEO content scales, Google must receive fully assembled HTML with structured data to index pages correctly.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Therapists - SERPs.txt`
- All pages live under `/en/` (e.g., `/en/therapists/anxiety`).
- Pre-assembled HTML: no loading spinners for bots.
- ISR with `revalidate: 60`.
- Canonical tags must strip query params.
- Noindex logic: if provider_count < 3 => `noindex, follow`.
- Dynamic "Last updated" date (e.g., "May 12, 2026").
- Inject JSON-LD: FAQPage, BreadcrumbList, ItemList.

## Current state (repo)
- SERP route exists via `RG-Frontend/src/pages/[...slug].tsx` with `SERP_PAGE_NEW` GraphQL query.
- SERP data sources in `Lumy-Backend/apps/serp_result/`.
- No CSV ingestion pipeline for therapist SEO content.
- No schema injection or noindex logic in current frontend route.
- i18n exists in `RG-Frontend/next.config.js` but no enforced `/en/therapists/...` routing.

## Missing pieces
- CSV ingestion engine for `therapists-nav-content-final.csv`.
- ISR/SSG route for `/en/therapists/[slug]` with quality gates.
- Schema injection and canonical tag handling.
- Noindex gating based on provider count.

## Next steps
1. Implement ingestion pipeline for therapist SEO CSV content.
2. Add dedicated SSR/ISR route for `/en/therapists/[slug]`.
3. Implement noindex gating, canonical tags, and JSON-LD injection.
4. Add dynamic "Last updated" date in SSR output.
5. QA with Google Rich Results Test and Core Web Vitals targets.
