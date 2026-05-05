# Technical: Suicide & Crisis Hotline Pages

## Screens / routes
- `/<slug>` handled by `RG-Frontend/src/pages/[...slug].tsx`.
- BRD requires `/[language]-[COUNTRY]/[slug]/` routing with middleware; not found in repo. Search evidence: `rg -n "PayloadCMS|payloadcms|middleware.*country" RG-Frontend Lumy-Backend` (0 matches).

## Frontend components/modules
- RG-Frontend/src/pages/[...slug].tsx
- RG-Frontend/src/graphql/query/query.ts (`managePageBySlug` query)
- RG-Frontend/src/store/actions/careProvider.ts (getManagePageBySlug)

## Backend apps/modules
- Lumy-Backend/apps/manage_pages

## APIs / GraphQL operations
- Lumy-Backend/apps/manage_pages/queries.py (managePageBySlug resolver)
- Lumy-Backend/apps/manage_pages/mutations.py (ManagePagesMutation / DeleteManagePages)

## Key files and directories
- RG-Frontend/src/pages/[...slug].tsx
- Lumy-Backend/apps/manage_pages
- Lumy-Backend/apps/manage_pages/models.py

## Tests
- Lumy-Backend/apps/manage_pages/tests.py

## Config / env
- Lumy-Backend/lumy_global/settings.py
- RG-Frontend/src/store/axiosInstance.ts

## Known risks / open questions
- Risk: Manual entry errors. Mitigation: Strict QA gate requiring visual comparison to Google Docs.
- Risk: "Clean Paste" failure. Mitigation: Configure Payload's Rich Text Editor to strip div, span, and style tags on paste.
- Risk: Non-Latin script URL handling. Mitigation: Ensure slug fields support UTF-8 characters.

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Global Suicide & Crisis Hotline Pages - English V2.txt
