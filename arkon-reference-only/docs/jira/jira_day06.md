# TAG-06: Buffer Day + Smoke Test

## Description

**Suggested Points:** 3 (Low — consolidation and testing day; risk is scope creep into new features instead of stabilization)

## Objective

Consolidate Week 1 work with a comprehensive smoke test script, fix any partial implementations or failing tests, update documentation, and ensure all components integrate correctly before moving to CLI-focused Week 2.

## Requirements

### Week 1 Smoke Test Script
- Automated script that validates entire Week 1 functionality
- Runs in CI and locally with `npm run smoke:week1`
- Tests all integration points between days 1-5
- Clear pass/fail output with failure details

### Smoke Test Coverage
- Auth flow: Login → JWT issued → /api/me works
- Skills CRUD: Create → Read → Update → Delete → Audit logged
- MCP registry: Create server → Upload bundle → Download with sha256 verify
- RAG ingestion: Ingest document → Search returns results → Cross-tenant isolated
- CLI auth: Login → Status shows user → Logout clears credentials

### Fix Partials
- Address any TODO comments left from days 1-5
- Fix any skipped or failing tests
- Complete any deferred error handling
- Resolve any TypeScript strict mode violations

### Documentation Updates
- README.md with project overview and quick start
- CONTRIBUTING.md with development setup
- API documentation (OpenAPI/Swagger)
- Architecture decision records (ADRs) for key choices

### Integration Verification
- Database migrations run cleanly on fresh database
- Docker Compose stack starts all services
- Environment variable documentation complete
- Seed script creates usable test data

## Implementation Notes
- Backend: Fix any incomplete implementations
- Frontend: N/A (not started yet)
- CLI: Verify integration with API
- Database: Verify all migrations, seed data

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `scripts/__tests__/smoke.test.ts` | `smoke test script runs without error` | Exit code 0 |
| `scripts/__tests__/smoke.test.ts` | `reports failures clearly` | Failure messages include context |
| All day 1-5 test files | `no skipped tests remain` | No `it.skip` or `describe.skip` |
| All day 1-5 test files | `no TODO assertions` | No `expect.anything()` placeholders |

### Test Coverage Requirements
- Maintain coverage levels from days 1-5
- No regression in coverage percentages
- All previously passing tests still pass

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `Week 1 smoke test` | Fresh database, all services | 1. Run smoke:week1 script | All checks pass |
| `fresh database setup` | Empty PostgreSQL | 1. Run migrations 2. Run seed | Database ready with test data |
| `docker-compose full stack` | Docker installed | 1. docker-compose up | All services healthy |
| `API health check` | Running API | 1. GET /api/health | 200 OK with service status |
| `cross-service auth` | CLI and API running | 1. CLI login 2. CLI calls API | Requests authenticated correctly |

### End-to-End Flows
- Complete user journey: Register → Login → Create skill → Upload MCP bundle → Ingest RAG document → Search
- Admin journey: Create tenant → Add team → Add user → Verify RBAC

## Week 1 Smoke Test Script

```typescript
// scripts/smoke-week1.ts

async function runSmokeTests() {
  const results: TestResult[] = []

  // Day 1: Auth
  results.push(await testAuthFlow())
  results.push(await testJWTValidation())
  results.push(await testApiMe())

  // Day 2: Skills
  results.push(await testSkillsCRUD())
  results.push(await testSkillsRBAC())
  results.push(await testSkillsAuditLog())

  // Day 3: MCP
  results.push(await testMCPServerCRUD())
  results.push(await testBundleUploadDownload())
  results.push(await testSha256Verification())

  // Day 4: RAG
  results.push(await testRAGIngestion())
  results.push(await testRAGSearch())
  results.push(await testCrossTenantIsolation()) // CRITICAL

  // Day 5: CLI
  results.push(await testCLILogin())
  results.push(await testCLIStatus())
  results.push(await testCLILogout())

  // Report
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length

  console.log(`\n${'='.repeat(50)}`)
  console.log(`Week 1 Smoke Test: ${passed}/${results.length} passed`)

  if (failed > 0) {
    console.log('\nFailures:')
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`)
    })
    process.exit(1)
  }

  console.log('\n✅ All Week 1 tests passed!')
  process.exit(0)
}
```

## Acceptance Criteria
1. Week 1 smoke test script exists and passes
2. All TODO comments from days 1-5 resolved
3. All skipped tests either implemented or removed with justification
4. Docker Compose stack starts cleanly with `docker-compose up`
5. README documents complete setup process
6. API documentation (OpenAPI) generated and accessible
7. No TypeScript strict mode errors
8. Coverage levels maintained from individual days

## Review Checklist
- [ ] Are there any remaining TODO comments that should be addressed?
- [ ] Do all tests pass, including integration tests?
- [ ] Is the smoke test script comprehensive enough?
- [ ] Can a new developer set up the project following the README?
- [ ] Are all environment variables documented in .env.example?
- [ ] Is the API documentation accurate and complete?

## Dependencies
- Depends on: Day 1, Day 2, Day 3, Day 4, Day 5 (all Week 1 days)
- Blocks: Week 2 (CLI product features rely on stable foundation)

## Risk Factors
- **Scope creep into new features** — Mitigation: Strict focus on stabilization, no new functionality
- **Hidden integration issues** — Mitigation: Comprehensive smoke test, manual testing
- **Documentation drift** — Mitigation: Verify docs by following them on clean machine
- **Test flakiness** — Mitigation: Fix flaky tests, add retries only where appropriate
