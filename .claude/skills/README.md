# Claude Code Skills Library

## Healthcare Security & Compliance Skills (17 skills)

| Skill | Trigger Phrases | Purpose |
|---|---|---|
| `phi-pii-leak-scan` | "scan for PII", "find data leaks", "check for PHI exposure", "audit sensitive data" | Scan code, logs, API responses, fixtures for accidental PHI/PII exposure |
| `hipaa-compliance-audit` | "run HIPAA audit", "check HIPAA compliance", "compliance review", "healthcare security audit" | Audit against HIPAA Technical Safeguards (164.312) |
| `security-code-review` | "security review", "OWASP audit", "vulnerability scan", "check for injection" | OWASP Top 10 review for Django + Next.js |
| `test-data-factory` | "create test data", "generate fake data", "build test fixtures", "healthcare test scenarios" | Generate realistic fake healthcare data with factory_boy |
| `mock-external-services` | "mock services", "stub external APIs", "create test mocks", "fake Stripe/Twilio" | Mock Twilio, Stripe, SendGrid, Azure Search, Sterling/Certn |
| `mock-settings-manager` | "switch mock profile", "set test mode", "configure test scenario" | Switch between mock configurations for testing scenarios |
| `patient-data-integrity-check` | "check data integrity", "find orphan records", "validate data consistency" | Verify referential integrity and business rules across models |
| `api-response-sanitizer` | "sanitize API responses", "audit serializers", "check GraphQL exposure" | Audit API responses to prevent PHI/PII leakage |
| `frontend-test-scaffold` | "setup frontend tests", "add jest to frontend", "create test infrastructure" | Bootstrap Jest, Testing Library, MSW for RG-Frontend |
| `credential-verification-workflow` | "validate credentials", "check NPI", "verify license", "audit provider credentials" | Validate provider licenses, NPI, certificates, degrees |
| `django-model-security-hardening` | "harden models", "encrypt fields", "add audit logging", "data retention" | Field encryption, audit logging, soft delete, signals |
| `consent-tracking-audit` | "audit consent", "check consent tracking", "GDPR compliance", "privacy audit" | Audit consent collection, storage, and enforcement |
| `backend-endpoint-security-test` | "security test endpoints", "generate auth tests", "IDOR testing" | Generate auth, authorization, IDOR, injection tests |
| `deployment-readiness-check` | "deployment check", "pre-deploy audit", "production readiness", "go-live checklist" | Pre-deployment security and configuration validation |
| `crisis-response-protocol` | "crisis protocol", "duty to warn", "mandatory reporting", "crisis escalation" | Crisis escalation: detection, Tarasoff, mandatory reporting, follow-up |
| `incident-response-breach-notification` | "breach notification", "incident response", "security incident", "breach readiness" | HIPAA Breach Notification Rule compliance (45 CFR 164 Subpart D) |
| `risk-register-synthesis` | "risk register", "risk analysis", "consolidate findings", "HIPAA risk assessment" | Consolidated HIPAA risk register from all skill outputs |

## Existing Infrastructure Skills (13 skills)

| Skill | Trigger Phrases | Purpose |
|---|---|---|
| `handoff` | "hand this off", "brief another agent", "delegate this", "generate a briefing for" | Generate a short 3-6 sentence orientation prompt for a fresh agent — points it at the Jira plan, CLAUDE.md indexes, and the right branch. No data dumping. |
| `audit-pipeline` | "run the audit pipeline", "implement and audit", "build and verify" | 9-agent multi-phase implementation + audit pipeline |
| `plan-pipeline` | "plan this ticket", "create a plan for", "plan-pipeline", "generate implementation plans" | Read Jira epics/tickets, generate detailed implementation plans, post plans as Jira comments |
| `sonarcloud-pr-audit` | "check sonar", "sonar results", "fix sonar issues", "PR quality gate" | Pull SonarCloud quality gate results for PRs |
| `create-prs` | "create PR", "open PR", "merge to main" | Create PRs for BE/FE repos |
| `docker-dev-stack` | "start docker", "restart containers", "check logs", "rebuild" | Docker Compose management + known gotchas |
| `sync-repos` | "sync repos", "pull infra changes", "sync checkouts" | Sync Primary vs Infra checkout copies |
| `branch-merge` | "merge branch", "consolidate branches", "cherry-pick" | Merge/cherry-pick with conflict resolution |
| `sibling-pr-merge` | "merge siblings", "consolidate PRs", "combine feature branches", "close individual PRs" | Merge N sibling branches into one integration branch, open consolidated PR, close originals |
| `fixture-seed-debug` | "fixture errors", "loaddata failed", "seed data broken" | Debug Django fixture loading failures |
| `changelog-audit` | "audit changes", "generate changelog", "what changed" | Cross-repo changelog generation |
| `whats-up` | "what's up", "catch me up", "what happened", "session recap", "previously on" | TV-drama style recap: what shipped, what broke, what's next |
| `sprint-confluence-pages` | "publish sprint docs", "create confluence pages", "document this sprint", "write up the review request" | Auto-discover open PR + Jira tickets → create Sprint Status + Implementation Guide Confluence pages + Teams message |
| `epic-status` | "epic status", "show me the epics", "what's in this epic", "send to confluence", "teams update", "epic report" | Fetch one or more epics + all children → rich structured payload → render as summary, table, Teams Adaptive Card, Confluence page, or raw JSON |
| `dev-status` | "dev status", "repo status", "PR status", "what needs review", "are my repos clean" | Current state of both repos: open PRs, branch ahead/behind, dirty files, stashes, unpushed commits |
