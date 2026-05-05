# Feature: PayloadCMS on Azure

## Overview
PayloadCMS on Azure is the infrastructure project that stands up a self-hosted content management system (CMS) on existing Azure virtual machines. It is the foundation for all future content-driven features (SEO pages, blogs, and multi-language expansion). The BRD explicitly frames this as a backend platform capability, not a frontend feature.

## Why it exists
Current SEO content is managed via CSV scripts and manual database updates, which is brittle and does not scale to 100,000+ pages or 57 languages. The CMS is intended to become the single source of truth for text content and localization, while keeping content isolated from PHI.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - PayloadCMS on Azure.txt`
- Admin UI must be live and reachable (e.g., `cms.really.global/admin`).
- Payload content must live in a separate Postgres schema named `content_engine`, isolated from PHI data.
- Localization must be configured for a specific list of 57 locales in `payload.config.ts`.
- Must run on existing Azure VM and connect to existing Azure Postgres.
- Must be deployed as a background service (Docker or PM2) behind Nginx routing.
- Required seed collection: "Landing Page" with correct fields.

## Current state (repo)
- No PayloadCMS code, config, or schemas are present in `RG-Frontend/` or `Lumy-Backend/`.
- No `payload.config.ts` or CMS deployment scripts are present in the repo.
- No Nginx or Azure VM deployment scripts exist in this codebase.

## Missing pieces
- CMS application codebase (PayloadCMS project).
- Azure deployment configuration (Docker/PM2, environment variables, Nginx routing).
- Postgres schema creation, user permissions, and migration strategy.
- Localization configuration with 57 locales.
- Initial CMS collections (Landing Page and any future content collections).

## Next steps
1. Decide where PayloadCMS lives (separate repo vs subdirectory) and provision deployment environment.
2. Implement `payload.config.ts` with the exact locale list from the BRD.
3. Create the `content_engine` schema in Postgres, with least-privileged DB user.
4. Deploy CMS service on Azure VM and configure Nginx reverse proxy.
5. Validate admin login and localization dropdown; create required "Landing Page" collection.
