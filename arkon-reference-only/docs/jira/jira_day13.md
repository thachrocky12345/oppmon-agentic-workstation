# TAG-13: Buffer Day

## Description

**Suggested Points:** 2 (Low — contingency day for fixing partials and DX improvements; scope is intentionally flexible based on Week 2 progress)

## Objective

Address any incomplete work from Week 2, fix discovered issues from smoke testing, implement developer experience improvements, and prepare for Admin UI development in Week 3.

## Requirements

### Fix Partials
- Complete any TODO items from Days 8-12
- Fix any failing tests discovered during smoke testing
- Resolve TypeScript strict mode violations
- Address code review feedback from Week 2 PRs

### DX Improvements
- CLI help text improvements based on user feedback
- Error message clarity enhancements
- Progress indicator polish
- Command output formatting consistency

### Performance Optimization
- Profile `tag sync` for large skill sets
- Optimize .mcp.json read/write operations
- Improve CLI startup time
- Cache API responses where appropriate

### Documentation Updates
- Update README with Week 2 features
- CLI command reference documentation
- Troubleshooting guide for common issues
- Architecture documentation updates

### Pre-Week 3 Preparation
- Review Admin UI design requirements
- Set up Next.js app structure (apps/web)
- Configure API routes for admin endpoints
- Plan database schema for admin features

## Implementation Notes
- Backend: Bug fixes and optimizations
- Frontend: Initial setup for Week 3
- CLI: Polish and improvements
- Database: Schema review for admin features

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| All Week 2 tests | `no skipped tests` | No `it.skip` or `describe.skip` |
| All Week 2 tests | `no TODO assertions` | No placeholder expectations |
| `packages/cli/src/__tests__/perf.test.ts` | `sync completes under threshold` | <30s for 50 skills |
| `packages/cli/src/__tests__/startup.test.ts` | `CLI startup under 500ms` | Cold start < 500ms |

### Test Coverage Requirements
- Maintain coverage from Week 2
- Add tests for any bug fixes
- Add tests for DX improvements

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `large skill sync` | 50 skills in registry | 1. tag sync | Completes in <30s |
| `corrupted state recovery` | Malformed state.json | 1. tag sync | Recovers gracefully |
| `all CLI commands have help` | None | 1. tag <cmd> --help for each | Help displayed |
| `error messages are helpful` | Various error conditions | 1. Trigger errors | Clear messages |

### End-to-End Flows
- Re-run full smoke test from Day 12
- Verify all improvements with fresh test run

## Buffer Day Checklist

```markdown
## Week 2 Completion Checklist

### Day 8: tag sync Skills
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] sha256 verification working
- [ ] Interrupt recovery tested
- [ ] State.json atomic writes confirmed

### Day 9: tag sync MCP
- [ ] User entry preservation working
- [ ] Idempotent sync verified
- [ ] Diff command functional
- [ ] .mcp.json merge logic solid

### Day 10: RAG CLI
- [ ] Idempotent ingestion working
- [ ] Auto MCP registration functional
- [ ] Cross-tenant isolation verified
- [ ] List and remove commands working

### Day 11: tag init
- [ ] Project config created correctly
- [ ] Team scoping working
- [ ] .gitignore suggestions working
- [ ] Interactive wizard functional

### Day 12: E2E Smoke
- [ ] Full smoke test passing
- [ ] Onboarding under 5 minutes
- [ ] Quickstart documented
- [ ] Friction points logged

### DX Improvements
- [ ] Help text clear and complete
- [ ] Error messages actionable
- [ ] Progress indicators smooth
- [ ] Output formatting consistent

### Documentation
- [ ] README updated
- [ ] CLI reference complete
- [ ] Troubleshooting guide exists
- [ ] Architecture docs current
```

## Acceptance Criteria
1. All Week 2 TODO items resolved
2. Full smoke test passes
3. No TypeScript strict mode errors
4. CLI help text complete for all commands
5. Error messages provide actionable guidance
6. Documentation reflects current state
7. Week 3 admin UI structure initialized

## Review Checklist
- [ ] Have all failing tests been fixed (not skipped)?
- [ ] Are error messages specific enough to diagnose issues?
- [ ] Is the CLI startup time acceptable?
- [ ] Does the README quickstart work from scratch?
- [ ] Is the apps/web scaffold ready for Week 3?
- [ ] Are there any security concerns from Week 2?

## Dependencies
- Depends on: Days 8-12 (Week 2 work)
- Blocks: Week 3 (clean foundation needed)

## Risk Factors
- **More bugs than buffer allows** — Mitigation: Prioritize critical path, defer non-blocking
- **Scope creep into new features** — Mitigation: Strict focus on existing work
- **Missing documentation** — Mitigation: Documentation as definition of done
- **Week 3 prep incomplete** — Mitigation: Minimal viable prep only
