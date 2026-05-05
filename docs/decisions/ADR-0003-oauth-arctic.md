# ADR-0003: [AUTO] OAuth Implementation with Arctic

**Date:** 2026-05-05

**Status:** Accepted

## Context

The platform needs OAuth 2.0 support for:
- Simplified user onboarding (no password required)
- Enterprise SSO integration
- Developer-friendly authentication (GitHub for dev tools)
- Secure token management

JWT-only authentication was initially implemented but users requested social login options.

## Decision

Adopt **Arctic** (version 2.1) for OAuth 2.0 implementation.

Currently implemented:
- **GitHub OAuth** - Primary OAuth provider for developer users

Schema ready for future providers:
- **Google OAuth** - Planned for enterprise users

Key implementation:
- OAuth routes in `apps/api/src/routes/oauth.ts`
- Arctic client helpers in `apps/api/src/lib/oauth.ts`
- OAuthAccount model links external accounts to users
- Supports account linking (same email, multiple OAuth providers)

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Passport.js | Mature, many strategies | Complex middleware pattern, callback-heavy | Arctic's simpler API preferred |
| NextAuth.js | Full-featured, Next.js native | Server-only, doesn't fit Express backend | Need OAuth on Express API |
| Auth0/Clerk | Managed service, zero maintenance | Cost, vendor lock-in | Self-hosted requirement from enterprise customers |
| Raw OAuth implementation | No dependencies | Complex to implement correctly | Security risk, maintenance burden |

## Consequences

### Positive

- Type-safe OAuth flows with Arctic
- Simple API for adding new providers
- Secure state management built-in
- Lightweight dependency (~10KB)
- Works with any Node.js framework

### Negative

- Arctic is newer, smaller community than Passport
- Need to implement token refresh logic manually
- Each provider requires separate implementation
- No built-in session management (using JWT instead)

## Related

- [Auth Flow Diagram](../flows/auth-flow.md) - GitHub OAuth flow
- `apps/api/src/routes/oauth.ts` - OAuth route handlers
- `apps/api/src/lib/oauth.ts` - Arctic client setup
- `packages/database/prisma/schema.prisma` - OAuthAccount model
