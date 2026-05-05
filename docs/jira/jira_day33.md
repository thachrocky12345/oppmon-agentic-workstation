# TAG-33: Deployment Runbooks & Rollback Procedures

## Description

**Suggested Points:** 5 (Medium — documentation and tooling for operational procedures; critical for production stability but primarily documentation work)

## Objective

Create comprehensive deployment runbooks and rollback procedures, documenting all operational workflows for the Team AI Gateway, including pre-deployment checklists, migration procedures, rollback steps, and incident response.

## Requirements

### Deployment Runbook Structure
```
docs/runbooks/
├── README.md                    # Index of all runbooks
├── deployment/
│   ├── pre-deployment-checklist.md
│   ├── deployment-procedure.md
│   ├── post-deployment-verification.md
│   └── rollback-procedure.md
├── migrations/
│   ├── migration-safety-checklist.md
│   ├── data-migration-procedure.md
│   └── emergency-rollback.md
├── incidents/
│   ├── incident-response.md
│   ├── database-recovery.md
│   └── service-degradation.md
└── operations/
    ├── admin-import-export.md
    ├── user-management.md
    └── cache-management.md
```

### Pre-Deployment Checklist
- [ ] All tests passing in CI
- [ ] Code review approved
- [ ] Migration tested on staging
- [ ] Rollback plan documented
- [ ] Stakeholders notified
- [ ] Monitoring alerts configured
- [ ] Feature flags configured (if applicable)

### Deployment Procedure
1. Verify pre-deployment checklist complete
2. Create deployment ticket/record
3. Notify team of deployment start
4. Execute deployment pipeline
5. Monitor deployment progress
6. Run post-deployment verification
7. Notify team of deployment completion
8. Close deployment ticket

### Rollback Procedure
1. Identify rollback trigger (failed health check, error spike, etc.)
2. Notify team of rollback initiation
3. Execute rollback command
4. Verify rollback successful
5. Investigate root cause
6. Document incident
7. Plan remediation

### Rollback Commands
```bash
# Rollback to previous image
az webapp config container set \
  --name $APP_NAME \
  --resource-group $RG \
  --docker-custom-image-name $PREVIOUS_IMAGE_TAG

# Rollback migrations
npm run migrate:rollback -- --to <previous_migration>

# Emergency: Scale to zero (circuit breaker)
az webapp config set \
  --name $APP_NAME \
  --resource-group $RG \
  --number-of-workers 0
```

## Implementation Notes
- Backend: Runbook documents reference actual commands
- Frontend: Included in deployment procedures
- CLI: Commands documented in runbooks
- Database: Migration rollback procedures

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| N/A | N/A | Documentation day, no code tests |

### Test Coverage Requirements
- All runbook commands verified manually
- Emergency procedures tested in staging

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `staging deployment` | Staging environment | 1. Follow runbook | Deployment successful |
| `staging rollback` | Deployed change | 1. Execute rollback | Previous version restored |
| `migration rollback` | Applied migration | 1. Rollback migration | Schema reverted |

### End-to-End Flows
- Full deployment following runbook
- Simulated incident with rollback

## Runbook: Pre-Deployment Checklist

```markdown
# Pre-Deployment Checklist

## Before Starting Deployment

### Code Quality
- [ ] All CI checks passing (tests, lint, typecheck)
- [ ] Code review approved by at least 1 reviewer
- [ ] No critical or high Sonar issues
- [ ] No known security vulnerabilities in dependencies

### Database
- [ ] Migrations tested on staging with production data copy
- [ ] Migration safety checks passing
- [ ] Estimated migration duration: ______ (acceptable for deployment window)
- [ ] Rollback migration tested

### Testing
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Manual QA completed (if applicable)
- [ ] Performance impact assessed

### Documentation
- [ ] CHANGELOG updated
- [ ] API documentation updated (if endpoints changed)
- [ ] Runbook updated (if procedures changed)

### Communication
- [ ] Deployment window scheduled
- [ ] Team notified of deployment
- [ ] Stakeholders aware of changes

### Monitoring
- [ ] Error tracking configured for new code paths
- [ ] Alerts configured for new metrics
- [ ] Dashboard updated (if applicable)

### Rollback Plan
- [ ] Previous image tag recorded: ____________
- [ ] Previous migration version: ____________
- [ ] Rollback procedure reviewed
- [ ] Rollback owner assigned: ____________

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Reviewer | | | |
| DevOps (if required) | | | |
```

## Runbook: Deployment Procedure

```markdown
# Deployment Procedure

## Prerequisites
- Pre-deployment checklist completed
- Access to deployment pipeline
- Access to monitoring dashboards

## Procedure

### 1. Initiate Deployment

```bash
# Verify you're on the correct branch
git branch --show-current  # Should be 'main'

# Verify latest changes pulled
git pull origin main

# Check CI status
gh run list --limit 5
```

### 2. Monitor Deployment Pipeline

1. Open GitHub Actions: https://github.com/org/repo/actions
2. Find the deployment workflow run
3. Monitor each stage:
   - [ ] Test stage completed
   - [ ] Build stage completed
   - [ ] Deploy stage pending approval

### 3. Approve Production Deployment

1. Click "Review deployments"
2. Select "production" environment
3. Review changes one more time
4. Click "Approve and deploy"

### 4. Monitor Deployment Progress

```bash
# Watch deployment logs
az webapp log tail --name $APP_NAME --resource-group $RG

# Check deployment status
az webapp show --name $APP_NAME --resource-group $RG --query state
```

### 5. Verify Deployment

```bash
# Health check
curl https://$APP_URL/api/health

# Verify version
curl https://$APP_URL/api/version
# Expected: { "version": "<new-sha>", "deployedAt": "..." }

# Check error rates (wait 5 minutes)
# Open monitoring dashboard
```

### 6. Post-Deployment

- [ ] Notify team: "Deployment complete: <ticket>"
- [ ] Update deployment ticket with results
- [ ] Monitor for 15 minutes for any issues
- [ ] Close deployment ticket if successful

## Troubleshooting

### Deployment Stuck
```bash
# Check container status
az webapp show --name $APP_NAME --resource-group $RG --query "state"

# Restart if needed
az webapp restart --name $APP_NAME --resource-group $RG
```

### Migrations Failed
```bash
# Check migration status
az webapp ssh --name $APP_NAME --resource-group $RG \
  --command "npm run migrate:status"

# Manual migration (if needed)
az webapp ssh --name $APP_NAME --resource-group $RG \
  --command "npm run migrate:apply -- --force"
```

### Health Check Failing
See "Rollback Procedure" runbook
```

## Runbook: Rollback Procedure

```markdown
# Rollback Procedure

## When to Rollback
- Health check failing after deployment
- Error rate spike >5x normal
- Critical functionality broken
- Security vulnerability discovered

## Immediate Actions (< 5 minutes)

### 1. Notify Team
```
@team Rolling back deployment due to: <reason>
Deployment: <ticket/sha>
```

### 2. Execute Rollback

#### Option A: Rollback to Previous Image
```bash
# Get previous image tag (from deployment record)
PREVIOUS_IMAGE="lumyacr.azurecr.io/tag-gateway:<previous-sha>"

# Deploy previous image
az webapp config container set \
  --name $APP_NAME \
  --resource-group $RG \
  --docker-custom-image-name $PREVIOUS_IMAGE

# Wait for deployment
sleep 60

# Verify health
curl https://$APP_URL/api/health
```

#### Option B: Rollback via GitHub (Revert Commit)
```bash
# Create revert commit
git revert HEAD --no-edit
git push origin main

# This will trigger new deployment with previous code
```

#### Option C: Emergency Stop (Circuit Breaker)
```bash
# Scale to zero (stops all traffic)
az webapp config set \
  --name $APP_NAME \
  --resource-group $RG \
  --number-of-workers 0

# Investigate issue
# Then scale back up
az webapp config set \
  --name $APP_NAME \
  --resource-group $RG \
  --number-of-workers 2
```

### 3. Rollback Migrations (If Needed)
```bash
# SSH into container
az webapp ssh --name $APP_NAME --resource-group $RG

# Rollback to specific migration
npm run migrate:rollback -- --to <previous_migration_name>

# Verify rollback
npm run migrate:status
```

### 4. Verify Rollback
```bash
# Health check
curl https://$APP_URL/api/health

# Version check (should show previous)
curl https://$APP_URL/api/version

# Monitor error rates for 10 minutes
```

### 5. Document Incident
- Create incident ticket
- Record timeline of events
- Identify root cause
- Plan remediation

## Post-Rollback

- [ ] Notify team: "Rollback complete, service restored"
- [ ] Create incident post-mortem ticket
- [ ] Schedule root cause analysis
- [ ] Update runbooks if procedures were lacking
```

## Acceptance Criteria
1. All runbooks created and organized
2. Pre-deployment checklist covers all requirements
3. Deployment procedure is step-by-step
4. Rollback procedure tested in staging
5. Emergency procedures documented
6. Commands are copy-paste ready
7. Runbooks indexed in README
8. Team trained on procedures

## Review Checklist
- [ ] Can a new team member follow these runbooks?
- [ ] Are all commands tested and working?
- [ ] Are environment variables clearly documented?
- [ ] Is the rollback procedure truly < 5 minutes?
- [ ] Are emergency contacts listed?
- [ ] Is the incident response clear?

## Dependencies
- Depends on: Day 30 (Migration framework), Day 31 (CI/CD pipeline)
- Blocks: Day 34 (Integration testing uses runbooks)

## Risk Factors
- **Outdated runbooks** — Mitigation: Review on each deployment, update as procedures change
- **Missing edge cases** — Mitigation: Update after each incident
- **Unclear procedures** — Mitigation: Peer review, dry runs
- **Access issues during incident** — Mitigation: Document access requirements, backup contacts
