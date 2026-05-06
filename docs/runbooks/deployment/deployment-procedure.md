# Deployment Procedure

**Last Updated:** 2026-05-05

Step-by-step procedure for deploying Arkon to production.

## Prerequisites

- [ ] [Pre-Deployment Checklist](pre-deployment-checklist.md) completed
- [ ] Access to deployment pipeline
- [ ] Access to monitoring dashboards
- [ ] Rollback plan documented

## Procedure

### 1. Verify Branch Status

```bash
# Verify you're on the correct branch
git branch --show-current  # Should be 'main'

# Verify latest changes pulled
git pull origin main

# Verify clean working directory
git status
```

### 2. Check CI Status

```bash
# Check recent workflow runs
gh run list --limit 5

# Verify latest run passed
gh run view --exit-status
```

### 3. Create Deployment Record

- [ ] Create deployment ticket (DEPLOY-XXXX)
- [ ] Record current production version
- [ ] Note deployment start time: ______

### 4. Notify Team

```
@team Starting deployment of [commit/version]
Deployment ticket: DEPLOY-XXXX
Expected duration: 15 minutes
Rollback owner: @[name]
```

### 5. Execute Deployment

#### Option A: GitHub Actions (Recommended)

1. Open GitHub Actions: https://github.com/org/arkon-workstation/actions
2. Find the deployment workflow run
3. Monitor each stage:
   - [ ] Test stage completed
   - [ ] Build stage completed
   - [ ] Deploy stage pending approval
4. Click "Review deployments"
5. Select "production" environment
6. Review changes one more time
7. Click "Approve and deploy"

#### Option B: Manual Deployment

```bash
# Build production images
pnpm build

# Push to registry
docker push registry.arkon.app/api:$VERSION
docker push registry.arkon.app/web:$VERSION

# Deploy to production
pnpm deploy:production
```

### 6. Run Database Migrations (if needed)

```bash
# Check pending migrations
pnpm db:status

# Apply migrations
pnpm db:migrate:deploy

# Verify migration success
pnpm db:status
```

### 7. Monitor Deployment Progress

```bash
# Watch deployment logs
pnpm deploy:logs --follow

# Check container health
pnpm deploy:health

# Monitor error rates
# Open Grafana dashboard
```

### 8. Run Post-Deployment Verification

Follow [Post-Deployment Verification](post-deployment-verification.md) checklist.

### 9. Notify Team of Completion

```
@team Deployment complete: [commit/version]
Deployment ticket: DEPLOY-XXXX
Duration: X minutes
Status: SUCCESS / ROLLED BACK
Notes: [any observations]
```

### 10. Close Deployment Record

- [ ] Update deployment ticket with results
- [ ] Record deployment end time
- [ ] Note any issues encountered
- [ ] Close ticket

---

## Troubleshooting

### Deployment Stuck

```bash
# Check container status
pnpm deploy:status

# Check for pending migrations
pnpm db:status

# Restart deployment
pnpm deploy:restart
```

### Health Check Failing

See [Post-Deployment Verification](post-deployment-verification.md) troubleshooting section.

### Migration Failed

See [Emergency Rollback](../migrations/emergency-rollback.md).

### Rollback Required

See [Rollback Procedure](rollback-procedure.md).

---

## Post-Deployment

- [ ] Monitor for 15 minutes for any issues
- [ ] Check error rates in monitoring
- [ ] Verify key user flows working
- [ ] Update documentation if needed
