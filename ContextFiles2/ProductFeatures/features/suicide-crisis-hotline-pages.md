# Feature: Suicide & Crisis Hotline Pages

## Purpose
- Publish ~100 country‑specific, verified crisis hotline pages with strict content fidelity and SEO‑ready structure. (BRD summary)

## User journey / key actions
- User in crisis lands on a country‑specific hotline page, sees verified contact details, and can tap/click to call or message. (BRD summary)
- Content editors manually enter hotline data to preserve accuracy and schema. (BRD summary)

## Glossary / UI terms
- Suicide & Crisis Hotline Pages
- “Hotline Pages”, “Verified Date”, “Hotline Entries”, “Regions”, “OG Image” (BRD terminology)

## Entry points
- Screens/routes: dynamic route via `RG-Frontend/src/pages/[...slug].tsx` (catch‑all slug rendering). BRD requires `/[language]-[COUNTRY]/[slug]/` routing; PayloadCMS routing not found in repo. Search evidence: `rg -n "PayloadCMS|payloadcms" RG-Frontend Lumy-Backend` (0 matches)
- API/GraphQL: `managePageBySlug` in `RG-Frontend/src/graphql/query/query.ts` and `Lumy-Backend/apps/manage_pages/queries.py`.

## Data entities
- `Lumy-Backend/apps/manage_pages/models.py` (ManagePages + additional modules).

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Global Suicide & Crisis Hotline Pages - English V2.txt

## Technical mapping
- [Technical doc](../technical/suicide-crisis-hotline-pages-technical.md)
