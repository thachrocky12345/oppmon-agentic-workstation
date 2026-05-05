# Feature: Nav Bar UX/UI Improvements (Improved Navigation)

## Overview
Replace the current navigation bar with an Etsy-style mega menu that handles many direct links without awkward spacing or redundancy. The BRD points to a new spreadsheet (Navigation Bar 2.4 - Team.xlsx) and Loom walkthroughs for expected behavior.

## Why it exists
The current menu was implemented via a plugin with layout limitations, causing poor spacing and redundancy when categories contain few links.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/Improved Navigation.txt`
- Mega menu layout should resemble Etsy navigation behavior.
- Must support a large number of direct links.
- Use Navigation Bar 2.4 - Team.xlsx as the primary data source.

## Current state (repo)
- Mega menu exists in `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`.
- Sub-header navigation exists in `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx`.
- Navigation data modeled in `Lumy-Backend/apps/care_provider/models.py` and fetched via GraphQL.

## Missing pieces
- Navigation Bar 2.4 ingestion pipeline and updated data model (if needed).
- UX adjustments for spacing and redundancy.
- Confirmed interaction specs (hover, column layout, responsive behavior).

## Next steps
1. Obtain Navigation Bar 2.4 spreadsheet and map it to the navigation models.
2. Update MegaMenu layout rules to remove redundant spacing and improve alignment.
3. Implement Etsy-style hover/column behavior and test on desktop/mobile.
4. QA with Loom references and stakeholder review.
