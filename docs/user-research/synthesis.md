# User Research Synthesis

**Date:** 2026-05-05
**Sessions:** 1 (code review walkthrough)

## Summary

The Arkon platform has solid core functionality but critical gaps in the onboarding flow prevent new users from getting started. The main issues are:

1. No user registration flow
2. Incomplete admin navigation
3. Inconsistent authentication methods between CLI and web

## Prioritized Issues

### Critical (Day 23 - Must Fix)

| Issue | Impact | Sessions | Fix |
|-------|--------|----------|-----|
| No sign-up flow | Users cannot create accounts | 1 | Add /register page |
| Admin nav incomplete | Users can't find Skills/MCP/Usage | 1 | Add cards to admin home |
| CLI not published | Cannot install CLI | 1 | Dev setup docs or npm publish |

### Major (Day 23-24)

| Issue | Impact | Sessions | Fix |
|-------|--------|----------|-----|
| No GitHub OAuth on web | Inconsistent with CLI | 1 | Add OAuth button |
| TAG_API_URL undocumented | Connection errors | 1 | Add to docs |
| Team required for init | Blocks CLI setup | 1 | Add guidance or command |

### Minor (Day 25 - Polish)

| Issue | Impact | Sessions | Fix |
|-------|--------|----------|-----|
| Brand mismatch | Confusion | 1 | Document |
| No breadcrumbs | Hard navigation | 1 | Add component |
| Empty sync state | No guidance | 1 | Add empty state message |

## Recommended Day 23 Sprint

Focus on unblocking the complete onboarding flow:

1. **Add Registration Page** (`/register`)
   - Email/password registration
   - Redirects to login after success
   - Form validation

2. **Fix Admin Navigation**
   - Add Skills card to admin dashboard
   - Add MCP Servers card to admin dashboard
   - Add Usage card to admin dashboard

3. **Add GitHub OAuth to Web** (if time permits)
   - GitHub OAuth button on login page
   - Consistent with CLI OAuth flow

## Success Metrics

After Day 23 fixes:
- [ ] New user can create account from landing page
- [ ] User can navigate to all admin sections from dashboard
- [ ] Onboarding time < 5 minutes for technical user

## Files Modified

- `docs/user-research/session-001.md` - Detailed friction log
- `docs/user-research/synthesis.md` - This file

## Next Steps

1. Day 23: Fix critical friction (registration, admin nav)
2. Day 24: Implement `tag doctor` for troubleshooting
3. Day 25: Polish error messages and minor friction
4. Day 26: Stability pass and CHANGELOG
