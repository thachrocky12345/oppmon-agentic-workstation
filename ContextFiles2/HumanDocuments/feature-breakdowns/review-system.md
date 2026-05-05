# Feature: Review System V6

## Overview
Marketplace-style review system for providers. Clients can leave a verified review after a completed session, including star ratings, fit signals, and written text. Providers can reply. The system includes automated safety checks and an operations queue for tech-related complaints.

## Why it exists
Clients need trust signals to choose providers and assess fit. Providers need fair, verified feedback. The platform needs a way to separate provider quality from platform technical issues.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Review System V6.txt`
- Reviews only from completed sessions (not no-show, not cancelled late, duration > 3 minutes).
- One review per client-provider pair; updates overwrite public review, keep history log.
- Helpful vote count resets on review update.
- Fit signals required (4 pairs) with no defaults.
- Written review required (min 50 characters).
- Tech experience is private; tech score <= 2 or "Yes" routes to operations queue.
- Auto-block for contact info, hate speech, threats; auto-queue for self-harm/criminal danger references.
- Dedicated public reviews page: `/[provider-handle]/reviews`.
- Reviews are crawlable, server-rendered, included in sitemap.

## Current state (repo)
- No explicit reviews models or routes identified in `Lumy-Backend/` or `RG-Frontend/`.
- Provider profile routing exists via `RG-Frontend/src/pages/[...slug].tsx` and care provider data flows, but no review-specific components identified.

## Missing pieces
- Database schema for reviews, fit signals, history log, helpful votes.
- Eligibility checks tied to session completion and duration.
- Moderation pipeline and operations queue.
- Public reviews page routing and SEO inclusion.

## Next steps
1. Define review data model and moderation workflow.
2. Implement eligibility checks against session records.
3. Build review submission UI + provider reply UI.
4. Add public reviews page route and SEO requirements (SSR, sitemap).
5. Implement automated safety checks and operations queue.
