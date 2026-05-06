# Rollback Procedure

**Last Updated:** 2026-05-05

Emergency procedure to revert to previous version. Target: < 5 minutes.

## When to Rollback

- Health check failing after deployment
- Error rate spike > 5x normal
- Critical functionality broken
- Security vulnerability discovered
- Data corruption detected

## Immediate Actions (< 2 minutes)

### 1. Notify Team

```
@team ROLLING BACK deployment due to: [reason]
Deployment: [ticket/sha]
Rollback owner: @[name]
```

### 2. Choose Rollback Strategy

| Situation | Strategy |
|-----------|----------|
| Code bug, no DB changes | [Option A: Image Rollback](#option-a-image-rollback) |
| Code bug + DB migration | [Option B: Full Rollback](#option-b-full-rollback) |
| Critical emergency | [Option C: Emergency Stop](#option-c-emergency-stop) |

---

## Option A: Image Rollback

Use when: Code issue only, no database migration involved.

```bash
# Get previous image tag (from deployment record)
PREVIOUS_IMAGE="registry.arkon.app/api:<previous-sha>"

# Deploy previous image
pnpm deploy:rollback --image $PREVIOUS_IMAGE

# Wait for rollout
pnpm deploy:wait

# Verify health
curl -s https://arkon.app/api/health | jq .
```

### Verification

```bash
# Confirm version rolled back
curl -s https://arkon.app/api/health | jq .version
# Expected: <previous-sha>

# Check error rates returning to normal
# Monitor Grafana dashboard for 5 minutes
```

---

## Option B: Full Rollback (Code + Database)

Use when: Database migration was applied and must be reverted.

### Step 1: Rollback Database Migration

```bash
# Check current migration status
pnpm db:status

# Rollback to specific migration
pnpm db:migrate:rollback --to <previous_migration_name>

# Verify rollback
pnpm db:status
```

### Step 2: Rollback Application

```bash
# Deploy previous image
pnpm deploy:rollback --image $PREVIOUS_IMAGE

# Wait for rollout
pnpm deploy:wait
```

### Step 3: Verify

```bash
# Check application health
curl -s https://arkon.app/api/health | jq .

# Verify database schema
pnpm db:status
```

---

## Option C: Emergency Stop (Circuit Breaker)

Use when: Critical emergency, need to stop all traffic immediately.

```bash
# Scale to zero (stops all traffic)
pnpm deploy:scale --replicas 0

# Investigate issue
pnpm deploy:logs

# When ready, scale back up
pnpm deploy:scale --replicas 2
```

---

## Post-Rollback Actions

### 1. Verify Rollback Successful

- [ ] Health check passing
- [ ] Previous version confirmed
- [ ] Error rates normalized
- [ ] User functionality restored

### 2. Notify Team

```
@team Rollback COMPLETE
Previous version restored: [sha]
Service status: HEALTHY
Root cause investigation: [ticket]
```

### 3. Document Incident

Create incident ticket with:
- [ ] Timeline of events
- [ ] Root cause (if known)
- [ ] Impact assessment
- [ ] Action items

### 4. Schedule Post-Mortem

- [ ] Schedule post-mortem meeting
- [ ] Gather logs and metrics
- [ ] Identify contributing factors
- [ ] Plan remediation

---

## Rollback Verification Checklist

| Check | Status |
|-------|--------|
| Previous version deployed | |
| Health check passing | |
| Error rates normal | |
| Database reverted (if applicable) | |
| User functionality verified | |
| Team notified | |
| Incident documented | |

---

## Troubleshooting

### Rollback Image Not Found

```bash
# List available images
pnpm deploy:images --limit 10

# Use most recent working image
pnpm deploy:rollback --image <working-image>
```

### Database Rollback Failed

1. Check migration logs for errors
2. Manually verify database state
3. Contact DBA team if needed
4. Consider point-in-time recovery if data corruption

### Service Won't Start After Rollback

1. Check logs for startup errors
2. Verify environment variables
3. Check database connectivity
4. Consider emergency stop while investigating

---

## Emergency Contacts

| Role | Contact | When to Escalate |
|------|---------|------------------|
| On-Call | PagerDuty | First responder |
| Platform Lead | @platform | Rollback issues |
| DBA | @dba-team | Database rollback |
| Security | @security | Security incidents |
