# Onboarding Observation - Session 001

## Session Info
- Date: 2026-05-05
- Type: Code Review + Mental Walkthrough
- Evaluator: Solo developer self-assessment
- Completed Successfully: Partial - identified friction points

## Pre-Session
- Technical background: Developer
- Claude Code experience: Regular
- Expectations: Quick onboarding (<5 min) from landing to first skill use

## Friction Log

### Checkpoint 1: Landing Page / Sign Up

| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|
| 0:00 | No sign-up flow - only login | Major | "How do I create an account?" | No |
| 0:30 | Get Started and Login go to same page | Minor | "Expected sign up vs login options" | Yes |
| 0:45 | No GitHub OAuth button visible | Major | "The CLI mentions OAuth but web only shows email/password" | No |
| 1:00 | No trial/demo account mentioned | Minor | "What credentials do I use?" | No |

### Checkpoint 2: CLI Installation

| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|
| 0:00 | Package not published to npm | Critical | "npm install -g @arkon/cli fails" | No - dev only |
| 0:30 | No installation instructions in landing page | Major | "Where do I get the CLI?" | Partial |
| 1:00 | Unclear if CLI requires account first | Minor | "Should I sign up before installing?" | Yes |

### Checkpoint 3: arkon login (tag login)

| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|
| 0:00 | Command is "tag" not "arkon" | Minor | "Brand mismatch - product is Arkon but CLI is tag" | Yes |
| 0:30 | OAuth device flow requires browser | Minor | "Works but unexpected popup" | Yes |
| 1:00 | TAG_API_URL env var undocumented in quick start | Major | "Connection refused - what URL should I use?" | No |

### Checkpoint 4: tag init

| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|
| 0:00 | Requires auth first (good) | N/A | "Makes sense" | Yes |
| 0:30 | Team selection requires existing teams | Major | "I don't have any teams, how do I create one?" | No |
| 1:00 | No option to skip team selection | Minor | "Can I use personal workspace?" | Partial |

### Checkpoint 5: tag sync

| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|
| 0:00 | Subcommands required (skills/mcp) | Minor | "Just 'tag sync' gives error" | Yes |
| 0:30 | No content to sync initially | Minor | "Pull succeeds but empty" | Yes |
| 1:00 | State file created silently | Minor | "Where is sync state stored?" | Yes |

### Checkpoint 6: Admin UI Navigation

| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|
| 0:00 | Admin link in footer only | Major | "Hard to find admin section" | Yes |
| 0:30 | Admin page shows only 3 cards | Minor | "Expected more options" | Yes |
| 1:00 | No breadcrumbs for navigation | Minor | "How do I go back?" | Yes |
| 1:30 | Skills and MCP not linked from main admin | Major | "Where are skills/MCP settings?" | No |

### Checkpoint 7: Create Team / Skill

| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|
| 0:00 | Teams page works well | N/A | "Create team modal is clear" | Yes |
| 0:30 | Skills page accessible via direct URL | Minor | "Found /admin/skills manually" | Yes |
| 1:00 | Skill creation form is comprehensive | N/A | "Good fields and validation" | Yes |
| 1:30 | No preview of skill before save | Minor | "Would like to see how it looks" | Partial |

### Checkpoint 8: Usage Dashboard

| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|
| 0:00 | Empty state is helpful | N/A | "Good instructions for enabling events" | Yes |
| 0:30 | Privacy notice is clear | N/A | "Appreciate the transparency" | Yes |
| 1:00 | No link to usage from main admin | Major | "Had to guess /admin/usage URL" | Partial |

## Post-Session Interview (Self-Assessment)

1. What was the hardest part?
   > Getting started without proper sign-up flow. The CLI expects OAuth but the web only shows email/password login. Also finding admin features like Skills and MCP was difficult.

2. What surprised you?
   > The usage dashboard is well-designed with good empty states. The CLI help text is comprehensive. But navigation between features is fragmented.

3. Would you continue using this? Why/why not?
   > With fixes, yes. The core features are solid but the onboarding flow needs work. Need clearer path from sign-up to first value.

## Observer Notes

### Critical Issues (Must Fix Day 23)
1. **No Sign-Up Flow** - Landing page has no registration, only login
2. **CLI Not Published** - Cannot npm install, blocks all CLI testing
3. **Admin Navigation Incomplete** - Skills, MCP, Usage not linked from admin home

### Major Issues (Fix Day 23-25)
1. **OAuth Missing from Web** - CLI has OAuth but web only has email/password
2. **TAG_API_URL Not Documented** - First-time users get connection errors
3. **Team Required Before Init** - No obvious way to create team from CLI
4. **Admin Links Missing** - Skills, MCP, Usage pages exist but aren't linked

### Minor Issues (Polish Day 25)
1. **Brand Mismatch** - Product "Arkon" vs CLI "tag"
2. **No Breadcrumbs** - Navigation relies on browser back
3. **Empty Initial State** - Sync returns empty without guidance

## Top 3 Friction Points (Prioritized)

1. **CRITICAL: No Sign-Up Flow** - Users cannot create accounts from the landing page. Need registration form or GitHub OAuth on web.

2. **CRITICAL: Admin Navigation** - Skills, MCP, and Usage pages exist but aren't linked from the admin dashboard. Users must guess URLs.

3. **MAJOR: CLI/Web OAuth Mismatch** - CLI supports OAuth device flow but web only shows email/password. Need consistency.

## Recommended Fixes

| Priority | Friction | Suggested Fix | Effort |
|----------|----------|---------------|--------|
| P0 | No sign-up flow | Add registration page /register or GitHub OAuth button | Medium |
| P0 | Admin nav incomplete | Add Skills, MCP, Usage cards to admin dashboard | Low |
| P1 | OAuth on web | Add GitHub OAuth button to login page | Medium |
| P1 | TAG_API_URL undocumented | Add to quickstart and CLI help | Low |
| P1 | Team creation from CLI | Add `tag team create` command or guide to web | Medium |
| P2 | Brand mismatch | Keep "tag" CLI for now, document reasoning | Low |
| P2 | Add breadcrumbs | Implement breadcrumb component in admin layout | Low |
