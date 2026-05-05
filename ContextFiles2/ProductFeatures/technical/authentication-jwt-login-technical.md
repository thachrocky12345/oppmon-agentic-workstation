# Technical: Authentication & JWT Login

## Screens / routes
- `RG-Frontend/src/containers/Authentication/LoginModal/LoginModal.tsx`
- `RG-Frontend/src/containers/Authentication/SignUpModal/SignUpModal.tsx`

## Frontend components/modules
- `RG-Frontend/src/store/axiosInstance.ts` (auth headers)
- `RG-Frontend/src/store/apollo_client.ts` (GraphQL auth)
- `RG-Frontend/src/containers/Authentication/OtpVerify/`

## Backend apps/modules
- `Lumy-Backend/apps/authentication/`

## APIs / GraphQL operations
- `Lumy-Backend/apps/authentication/mutations.py`
- `Lumy-Backend/apps/authentication/queries.py`

## Key files and directories
- `Lumy-Backend/apps/authentication/models.py`

## Tests
- `Lumy-Backend/apps/authentication/tests.py`

## Config / env
- `Lumy-Backend/lumy_global/settings.py`

## Known risks / open questions
- Not found in repo. Search evidence: `rg -n "Open Questions|Risks" ContextFiles/SystemOverview.md` (0 matches)

## Source docs
- ContextFiles/SystemOverview.md
