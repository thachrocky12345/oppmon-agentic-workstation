# Implementation Design: Nav Bar UX/UI Improvements

## 1) Overview
Replace the current navigation bar with an Etsy-style mega menu that supports many direct links without redundant spacing. Data source is “Navigation Bar 2.4 - Team.xlsx.”

## 2) Current State (Code-Level)
- Mega menu UI: `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`
- Sub-header nav: `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx`
- Navigation models: `Lumy-Backend/apps/care_provider/models.py`
- Navigation queries: `Lumy-Backend/apps/care_provider/queries.py`

## 3) Proposed Design (Implementation-Level)
### Backend
- Ingest Navigation Bar 2.4 spreadsheet into navigation tables.
- Adjust hierarchy depth if needed to match new data.

### Frontend
- Update MegaMenu layout rules to eliminate redundant spacing.
- Ensure hover behavior and column grouping match Loom expectations.
- Improve mobile behavior (scrolling or stacked layout).

## 4) File/Module Impact Map
- `Lumy-Backend/apps/care_provider/models.py`: add or adjust fields if Nav Bar 2.4 schema differs.
- `Lumy-Backend/apps/care_provider/queries.py`: adjust output if hierarchy changes.
- `RG-Frontend/src/components/MegaMenu/MegaMenu.tsx`: update layout and spacing logic.
- `RG-Frontend/src/containers/landing-screen/sub-header/index.tsx`: update submenu interaction logic.

## 5) Data Migration / Ingestion Plan
- Use Navigation Bar 2.4 Excel to rebuild hierarchy.
- Validate menu items against design references.

## 6) Risks + Edge Cases
- Large categories may overflow viewport.
- Single-link categories must not produce empty columns.
- Mobile hover fallbacks must be accessible.

## 7) Testing Plan
- Desktop hover interactions for all menu sizes.
- Mobile layout with deep subcategories.
- Visual QA against Loom references.

## 8) Sequencing & Dependencies
1. Update navigation dataset from Nav Bar 2.4.
2. Refactor MegaMenu layout.
3. QA with designers and stakeholders.
