# Technical: Review System

## Screens / routes
- /<slug>, 

## Frontend components/modules
- Found 124 matches in 24 files. Search evidence: `rg -n "review" RG-Frontend/src`. Sample files: RG-Frontend/src/styles/styled.ts, RG-Frontend/src/styles/globals.css, RG-Frontend/src/pages/[...slug].tsx, RG-Frontend/src/pages/provider/[...detail].tsx, RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx

## Backend apps/modules
- Not found in repo. Search evidence: `rg -n "review" Lumy-Backend/apps` (0 matches)

## APIs / GraphQL operations
- Not found in repo. Search evidence: `rg -n "review" RG-Frontend/src/graphql Lumy-Backend/apps` (0 matches)

## Key files and directories
- Found 124 matches in 24 files. Search evidence: `rg -n "review" RG-Frontend/src`. Sample files: RG-Frontend/src/styles/styled.ts, RG-Frontend/src/styles/globals.css, RG-Frontend/src/pages/[...slug].tsx, RG-Frontend/src/pages/provider/[...detail].tsx, RG-Frontend/src/components/Popup/SelectAppointmentModal.tsx

## Tests
- Not found in repo. Search evidence: `rg -n "review" Lumy-Backend RG-Frontend` (0 matches)

## Config / env
- RG-Frontend/src/store/axiosInstance.ts

## Known risks / open questions
- Risk: Mandatory text could lower review volume.
- Risk: Providers may attempt to infer reviewer identity.
- Risk: Abuse or retaliation attempts (review bombing, fake reviews, provider harassment).

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/BRD - Review System V6.txt
