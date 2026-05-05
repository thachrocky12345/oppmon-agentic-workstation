# Technical: PayloadCMS on Azure

## Screens / routes
- Not found in repo. Search evidence: `rg -n "payloadcms" RG-Frontend/src` (0 matches).
- Current CMS routing uses `RG-Frontend/src/pages/[...slug].tsx` with `managePageBySlug` queries.

## Frontend components/modules
- Not found in repo. Search evidence: `rg -n "payloadcms" RG-Frontend/src` (0 matches).
- Current CMS usage: `RG-Frontend/src/pages/[...slug].tsx`, `RG-Frontend/src/graphql/query/query.ts` (`managePageBySlug`).

## Backend apps/modules
- Not found in repo. Search evidence: `rg -n "payloadcms" Lumy-Backend/apps` (0 matches).
- Current CMS backend: `Lumy-Backend/apps/manage_pages`.

## APIs / GraphQL operations
- Not found in repo. Search evidence: `rg -n "payloadcms" RG-Frontend/src/graphql Lumy-Backend/apps` (0 matches).
- Current CMS GraphQL: `Lumy-Backend/apps/manage_pages/queries.py`, `RG-Frontend/src/graphql/query/query.ts` (`managePageBySlug`).

## Key files and directories
- Not found in repo. Search evidence: `rg -n "payloadcms" RG-Frontend/src Lumy-Backend/apps` (0 matches).
- Current CMS: `Lumy-Backend/apps/manage_pages`, `RG-Frontend/src/pages/[...slug].tsx`.

## Tests
- Not found in repo. Search evidence: `rg -n "payloadcms" Lumy-Backend RG-Frontend` (0 matches).

## Config / env
- `Lumy-Backend/lumy_global/settings.py` (current CMS settings).
- `RG-Frontend/src/store/axiosInstance.ts` (current API base configuration).

## Known risks / open questions
- Risk: Potential port conflicts if running on the same VM as the Next.js application without proper reverse proxying. (BRD)
- Risk: Memory constraints on the Azure VM when running both the application and CMS simultaneously. (BRD)
- Dependency: PayloadCMS on Azure is a prerequisite for the hotline pages BRD.

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - PayloadCMS on Azure.txt
