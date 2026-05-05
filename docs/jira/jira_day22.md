# TAG-22: User Onboarding Round 1

## Description

**Suggested Points:** 2 (Low — observation-only day with structured friction capture; no code changes, pure user research)

## Objective

Conduct the first round of user onboarding observation with real users (or realistic simulations), capturing friction points, confusion moments, and failure scenarios without intervening. This is pure observation — no fixes today.

## Requirements

### Onboarding Observation Protocol
- 3-5 participants (real users or team members role-playing)
- Each completes full onboarding from signup to first skill use
- Observer does NOT help or explain
- Screen recording for later analysis
- Verbal think-aloud encouraged

### Friction Capture Template
For each observation session, record:
- Participant ID (anonymous)
- Start time, end time, total duration
- Each friction point with timestamp
- Severity: Critical (blocked), Major (significant delay), Minor (slight confusion)
- Participant verbalization at moment of friction
- Whether participant recovered unassisted

### Observation Checkpoints
1. Account creation/signup
2. CLI installation
3. `tag login` flow
4. `tag init` wizard
5. `tag sync` first run
6. Claude Code skill usage
7. Admin UI access (if applicable)

### Success Criteria Observation
- Did participant complete in <5 minutes?
- Did participant understand what happened?
- Did participant know what to do next?
- Would participant continue using this?

### Data Collection
- Friction log (structured template)
- Session recordings (with consent)
- Post-session brief interview (2-3 questions)
- Raw notes for each session

## Implementation Notes
- Backend: N/A (observation only)
- Frontend: N/A (observation only)
- CLI: N/A (observation only)
- Database: N/A (observation only)

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| N/A | N/A | N/A (observation day, no code changes) |

### Test Coverage Requirements
- No code changes, no test changes

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| N/A | N/A | N/A | N/A (observation only) |

### End-to-End Flows
- Observe, don't test

## Friction Capture Template

```markdown
# Onboarding Observation - Participant [ID]

## Session Info
- Date: YYYY-MM-DD
- Start Time: HH:MM
- End Time: HH:MM
- Total Duration: MM minutes
- Completed Successfully: Yes/No

## Pre-Session
- Technical background: [Developer/Non-developer]
- Claude Code experience: [None/Some/Regular]
- Expectations: [What did they expect to happen?]

## Friction Log

### Checkpoint 1: Account Creation
| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|
| 0:30 | [describe] | Critical/Major/Minor | "[quote]" | Yes/No |

### Checkpoint 2: CLI Installation
| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|

### Checkpoint 3: tag login
| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|

### Checkpoint 4: tag init
| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|

### Checkpoint 5: tag sync
| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|

### Checkpoint 6: Claude Code Usage
| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|

### Checkpoint 7: Admin UI (if applicable)
| Time | Friction | Severity | Verbalization | Recovered? |
|------|----------|----------|---------------|------------|

## Post-Session Interview
1. What was the hardest part?
   > [response]

2. What surprised you?
   > [response]

3. Would you continue using this? Why/why not?
   > [response]

## Observer Notes
[Free-form observations, patterns noticed, hypotheses]

## Top 3 Friction Points
1. [Most severe]
2. [Second]
3. [Third]
```

## Severity Definitions

```markdown
## Friction Severity Guide

### Critical
- User is completely blocked, cannot proceed
- Would require support intervention
- Examples:
  - Login fails with cryptic error
  - Command not found after installation
  - Required feature missing

### Major
- User significantly delayed (>1 minute)
- User expresses frustration
- User almost gives up
- Examples:
  - Confusing error message, eventually figures out
  - Unclear what to do next
  - Feature works differently than expected

### Minor
- Brief confusion (<30 seconds)
- User recovers quickly
- Slight annoyance
- Examples:
  - Typo in command, quickly corrected
  - Unclear button label, explored to find it
  - Expected feedback not shown
```

## Acceptance Criteria
1. 3-5 onboarding sessions observed
2. Friction template completed for each session
3. All critical friction points documented
4. Session recordings saved (with consent)
5. Post-session interviews completed
6. Synthesis document created summarizing patterns
7. **NO fixes attempted today** (observation only)
8. Day 23 priorities identified

## Review Checklist
- [ ] Were observations truly non-interventional?
- [ ] Were friction points captured in real-time?
- [ ] Was participant consent obtained for recording?
- [ ] Were all checkpoints observed?
- [ ] Are the top friction points clearly prioritized?
- [ ] Is there enough detail to reproduce issues?

## Dependencies
- Depends on: Days 1-20 (working system to observe)
- Blocks: Day 23 (friction fixes based on observations)

## Risk Factors
- **Insufficient participants** — Mitigation: Team members can role-play as new users
- **Observer intervention bias** — Mitigation: Strict no-help protocol
- **Recording consent issues** — Mitigation: Clear consent form, option to decline
- **Confirmation bias** — Mitigation: Raw notes before interpretation
