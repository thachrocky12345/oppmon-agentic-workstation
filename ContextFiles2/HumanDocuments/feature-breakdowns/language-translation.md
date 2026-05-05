# Feature: Language Translation

## Overview
Listed as a priority but no BRD is provided. Likely ties to PayloadCMS localization and future multi-language site expansion.

## Current state (repo)
- Next.js i18n is configured for limited locales (`en`, `de`, `fr`) in `RG-Frontend/next.config.js`.
- PayloadCMS localization for 57 locales is required by a separate BRD but not implemented.

## Missing pieces
- Translation workflow and content source of truth.
- Locale routing strategy across the site.
- CMS integration for localized content.

## Next steps
1. Define translation strategy (human vs automated, CMS-driven).
2. Implement locale routing and content selection rules.
3. Integrate with PayloadCMS localization once available.
