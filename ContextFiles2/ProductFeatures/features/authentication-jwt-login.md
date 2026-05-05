# Feature: Authentication & JWT Login

## Purpose
- Client and provider authentication, including email/password login and verification flows.

## User journey / key actions
- User signs in via Login Modal or Sign Up flow; JWT is stored for API access.

## Glossary / UI terms
- Login
- Sign Up
- OTP

## Entry points
- Screens/routes: `RG-Frontend/src/containers/Authentication/LoginModal/LoginModal.tsx`, `RG-Frontend/src/containers/Authentication/SignUpModal/SignUpModal.tsx`
- API/GraphQL: `Lumy-Backend/apps/authentication/urls.py`, `Lumy-Backend/apps/authentication/mutations.py`

## Data entities
- `Lumy-Backend/apps/authentication/models.py`

## Related docs
- ContextFiles/SystemOverview.md

## Technical mapping
- [Technical doc](../technical/authentication-jwt-login-technical.md)
