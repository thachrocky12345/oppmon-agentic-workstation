# Technical: Client Onboarding

## Screens / routes
- `RG-Frontend/src/containers/Authentication/SignUpModal/SignUpModal.tsx`
- `RG-Frontend/src/containers/Authentication/CreateAccountForm/CreateAccountForm.tsx`
- `RG-Frontend/src/containers/Authentication/OtpVerify/OtpVerifyClient.tsx`

## Frontend components/modules
- `RG-Frontend/src/containers/Authentication/SignUpModal/steps/`
- `RG-Frontend/src/containers/Authentication/Utils/`

## Backend apps/modules
- `Lumy-Backend/apps/authentication/`
- `Lumy-Backend/apps/client/`

## APIs / GraphQL operations
- `Lumy-Backend/apps/authentication/mutations.py` (signup, verification)
- `Lumy-Backend/apps/client/views.py`

## Key files and directories
- `Lumy-Backend/apps/authentication/models.py`
- `Lumy-Backend/apps/client/models.py`

## Tests
- `Lumy-Backend/apps/authentication/tests.py`
- `Lumy-Backend/apps/client/tests.py`

## Config / env
- `Lumy-Backend/lumy_global/settings.py`

## Known risks / open questions
- Not found in repo. Search evidence: `rg -n "Open Questions|Risks" ContextFiles/HumanDocuments/Features/_extracted/RG_ New Client Onboarding.txt` (0 matches)

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/RG_ New Client Onboarding.txt
