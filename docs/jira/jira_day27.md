# TAG-27: Final Smoke + Retrospective

## Description

**Suggested Points:** 3 (Low — clean-slate verification, project retrospective, and handoff documentation; final validation before ship)

## Objective

Conduct clean-slate smoke test simulating a new user's complete journey, document project retrospective with learnings, and prepare comprehensive handoff documentation for ongoing maintenance.

## Requirements

### Clean-Slate Smoke Test
- Start from completely fresh environment
- No existing configuration or data
- Follow only public documentation
- Complete entire user journey
- Record and document any issues

### Smoke Test Scenarios
1. **New User Journey**
   - Fresh machine simulation
   - Install CLI from public source
   - Complete onboarding
   - Use skills in Claude Code
   - Verify functionality

2. **Admin Journey**
   - Create team
   - Add skills
   - Upload MCP bundle
   - View usage (if events enabled)

3. **Failure Recovery**
   - Network disconnect during sync
   - Invalid credentials
   - Corrupted state
   - Use tag doctor to resolve

### Project Retrospective
- What went well?
- What was challenging?
- What would we do differently?
- What did we learn?
- Key decisions and their outcomes

### Handoff Documentation
- Architecture overview
- Key code locations
- Common maintenance tasks
- Monitoring and alerting
- Incident response

## Implementation Notes
- Backend: N/A (validation only)
- Frontend: N/A (validation only)
- CLI: N/A (validation only)
- Database: N/A (validation only)

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| All tests | `pass` | All green |
| N/A | N/A | No new tests (validation day) |

### Test Coverage Requirements
- All existing tests pass
- No coverage decrease

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `clean-slate smoke` | Fresh environment | 1. Complete all journeys | All succeed |
| `failure recovery` | Various failures | 1. Trigger and recover | All recoverable |

### End-to-End Flows
- Complete product validation
- Failure and recovery scenarios
- Documentation verification

## Clean-Slate Smoke Test Protocol

```markdown
# Clean-Slate Smoke Test

## Environment
- Date: YYYY-MM-DD
- Machine: [clean VM/container]
- OS: [operating system]
- Node version: [version]

## Test 1: New User Journey

### Steps
1. [ ] Install CLI: `npm install -g @tag/cli`
2. [ ] Verify installation: `tag --version`
3. [ ] Login: `tag login`
4. [ ] Init project: `tag init`
5. [ ] First sync: `tag sync`
6. [ ] Verify skills in Claude Code
7. [ ] Use a skill
8. [ ] Check status: `tag status`

### Results
- Total time: [minutes]
- Issues encountered: [list]
- Recovered from issues: [yes/no]

## Test 2: Admin Journey

### Steps
1. [ ] Login to Admin UI
2. [ ] Create team
3. [ ] Create skill
4. [ ] Upload MCP bundle
5. [ ] Enable events
6. [ ] View dashboard

### Results
- Total time: [minutes]
- Issues encountered: [list]

## Test 3: Failure Recovery

### Steps
1. [ ] Disconnect network during sync → tag doctor → recovery
2. [ ] Corrupt state.json → tag doctor --fix → recovery
3. [ ] Expired token → re-login → continue

### Results
- All recoveries successful: [yes/no]
- Issues: [list]

## Final Verdict
- [ ] Ready for release
- [ ] Needs fixes: [list]
```

## Project Retrospective Template

```markdown
# Team AI Gateway - Project Retrospective

## Project Summary
- Duration: 28 days (4 weeks)
- Days worked: 24
- Total story points: ~130

## What Went Well
1. [item]
2. [item]
3. [item]

## What Was Challenging
1. [item]
2. [item]
3. [item]

## What Would We Do Differently
1. [item]
2. [item]
3. [item]

## Key Learnings
1. [learning]
2. [learning]
3. [learning]

## Key Decisions
| Decision | Context | Outcome |
|----------|---------|---------|
| No user_id in events | Privacy by design | Worked well, simplified compliance |
| Tests first for isolation | Security boundary | Caught issues early |
| [decision] | [context] | [outcome] |

## Risks That Materialized
| Risk | Impact | How We Handled |
|------|--------|----------------|

## Technical Debt Accumulated
| Item | Priority | Estimate to Fix |
|------|----------|-----------------|

## Recommendations for Future
1. [recommendation]
2. [recommendation]
```

## Handoff Documentation

```markdown
# Team AI Gateway - Handoff Documentation

## Architecture Overview
```
┌─────────────────────────────────────────────────────────┐
│                      Client Layer                        │
│  ┌─────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   CLI   │  │  Admin UI   │  │  Claude Code Hooks  │ │
│  └────┬────┘  └──────┬──────┘  └──────────┬──────────┘ │
└───────┼──────────────┼────────────────────┼─────────────┘
        │              │                    │
┌───────┼──────────────┼────────────────────┼─────────────┐
│       ▼              ▼                    ▼             │
│  ┌────────────────────────────────────────────────┐    │
│  │                   API Layer                     │    │
│  │   /auth  /skills  /mcp  /rag  /events  /admin  │    │
│  └───────────────────────┬────────────────────────┘    │
│                          │                              │
│  ┌───────────────────────┼────────────────────────┐    │
│  │              Data Layer                         │    │
│  │  PostgreSQL  │  pgvector  │  Storage (S3/Local) │   │
│  └────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Key Code Locations
- API: `apps/api/src/`
- Admin UI: `apps/web/src/`
- CLI: `packages/cli/src/`
- RAG Server: `packages/rag-mcp/src/`
- Shared Types: `packages/shared/src/`

## Common Maintenance Tasks

### Adding a New Skill
1. Create skill via Admin UI
2. Users run `tag sync` to receive

### Investigating Usage Issues
1. Check `usage_events` table (no user data)
2. Check `audit_log` for mutations
3. Review API logs

### Handling Authentication Issues
1. Check JWT expiration
2. Verify OAuth provider status
3. Check tenant/team membership

## Monitoring & Alerting
- Health endpoint: `/api/health`
- Key metrics: [list]
- Alert thresholds: [list]

## Incident Response
1. Check `/api/health` status
2. Review recent deployments
3. Check database connectivity
4. Review error logs
5. Escalation path: [contacts]

## Known Issues & Workarounds
| Issue | Workaround |
|-------|------------|
```

## Acceptance Criteria
1. Clean-slate smoke test completed successfully
2. All smoke test scenarios passing
3. Project retrospective documented
4. Handoff documentation complete
5. Architecture diagram accurate
6. Maintenance tasks documented
7. All tests passing
8. System ready for production

## Review Checklist
- [ ] Did smoke test use truly clean environment?
- [ ] Were all issues from smoke test resolved?
- [ ] Is retrospective honest and actionable?
- [ ] Could someone maintain this from the handoff doc?
- [ ] Are monitoring points documented?
- [ ] Is incident response clear?

## Dependencies
- Depends on: Days 1-26 (all previous work)
- Blocks: Production release

## Risk Factors
- **Smoke test reveals blocking issues** — Mitigation: Buffer time, prioritize critical fixes
- **Incomplete retrospective** — Mitigation: Schedule dedicated time
- **Handoff doc gaps** — Mitigation: Review with fresh eyes
- **Last-minute bugs** — Mitigation: Only fix critical issues
