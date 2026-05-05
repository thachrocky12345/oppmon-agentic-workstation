# Technical: Therapist SERP Pages (SEO)

## Screens / routes
- /<slug>

## Frontend components/modules
- RG-Frontend/src/pages/[...slug].tsx
- RG-Frontend/src/containers/SerpPage/SerpPage.tsx
- RG-Frontend/src/graphql/query/query.ts

## Backend apps/modules
- Lumy-Backend/apps/serp_result

## APIs / GraphQL operations
- Lumy-Backend/apps/serp_result/queries.py

## Key files and directories
- RG-Frontend/src/pages/[...slug].tsx
- RG-Frontend/src/containers/SerpPage/SerpPage.tsx
- RG-Frontend/src/graphql/query/query.ts
- Lumy-Backend/apps/serp_result

## Tests
- Lumy-Backend/apps/serp_result/tests.py

## Config / env
- Lumy-Backend/lumy_global/settings.py
- RG-Frontend/src/store/axiosInstance.ts

## Known risks / open questions
- Risk: Pre-assembling pages is slow if the API is slow.
- Mitigation: Use ISR (see below) to cache pages.
- 13. Infrastructure & Performance Specs

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Therapists - SERPs.txt
