# Incident Response

**Last Updated:** 2026-05-05

General procedure for handling production incidents.

## Severity Levels

| Level | Definition | Response Time | Examples |
|-------|------------|---------------|----------|
| P1 | Complete outage, all users affected | < 15 min | Site down, auth broken |
| P2 | Major feature broken, many users affected | < 1 hour | Payment broken, can't create |
| P3 | Minor feature broken, some users affected | < 4 hours | Slow queries, UI bug |
| P4 | Minor issue, workaround available | < 1 day | Cosmetic bug, docs wrong |

## Incident Workflow

```
Detection → Triage → Mitigate → Communicate → Resolve → Post-Mortem
```

## Phase 1: Detection

Incidents detected via:
- Monitoring alerts (PagerDuty)
- User reports
- Team observation
- Automated health checks

## Phase 2: Triage (< 5 minutes)

### 1. Acknowledge

```bash
# Acknowledge in PagerDuty or create incident ticket
# INCIDENT-XXXX
```

### 2. Assess Severity

| Question | Answer |
|----------|--------|
| User impact? | |
| Feature affected? | |
| Data at risk? | |
| Security issue? | |

### 3. Assign Severity Level

Based on assessment, assign P1-P4.

### 4. Assemble Response Team

| Severity | Who to Page |
|----------|-------------|
| P1 | On-call + Platform Lead + Eng Manager |
| P2 | On-call + Platform Lead |
| P3 | On-call |
| P4 | Assigned owner |

## Phase 3: Mitigate

### Immediate Actions

```bash
# Check system health
curl https://arkon.app/api/health/ready

# Check recent deployments
gh run list --limit 5

# Check logs for errors
pnpm deploy:logs | grep -i error | head -50

# Check database
pnpm db:ping
```

### Common Mitigations

| Issue | Mitigation |
|-------|------------|
| Bad deployment | [Rollback](../deployment/rollback-procedure.md) |
| Database issue | [DB Recovery](database-recovery.md) |
| Performance | [Scale up](#scale-up) |
| Attack/abuse | [Block IPs](#block-ips) |

### Scale Up

```bash
# Increase replicas
pnpm deploy:scale --replicas 4

# Increase resources
pnpm deploy:resources --cpu 2 --memory 4G
```

### Block IPs

```bash
# Block abusive IP
pnpm firewall:block --ip X.X.X.X

# Block IP range
pnpm firewall:block --cidr X.X.X.0/24
```

## Phase 4: Communicate

### Internal Updates

Post updates every 15-30 minutes (P1/P2):

```
INCIDENT UPDATE: [INCIDENT-XXXX]
Status: INVESTIGATING / MITIGATING / MONITORING / RESOLVED
Impact: [current impact]
Actions: [what we're doing]
ETA: [if known]
```

### External Communication (P1/P2)

Update status page:
- Acknowledge issue
- Provide updates
- Announce resolution

## Phase 5: Resolve

### Verification

- [ ] Root cause identified
- [ ] Fix applied
- [ ] System stable for 30+ minutes
- [ ] Error rates normal
- [ ] Performance normal

### Close Incident

```
INCIDENT RESOLVED: [INCIDENT-XXXX]
Duration: X hours Y minutes
Root cause: [brief description]
Fix: [what was done]
Follow-up: [tickets created]
```

## Phase 6: Post-Mortem

### Timeline (within 48 hours)

1. Create post-mortem document
2. Schedule post-mortem meeting
3. Identify action items
4. Assign owners
5. Track completion

### Post-Mortem Template

```markdown
# Post-Mortem: [INCIDENT-XXXX]

## Summary
[1-2 sentence summary]

## Timeline
| Time | Event |
|------|-------|
| HH:MM | Issue detected |
| HH:MM | Team paged |
| HH:MM | Root cause identified |
| HH:MM | Fix applied |
| HH:MM | Incident resolved |

## Root Cause
[What caused the incident]

## Impact
- Users affected: X
- Duration: X hours
- Data lost: none / describe

## What Went Well
-
-

## What Could Be Improved
-
-

## Action Items
| Action | Owner | Due Date |
|--------|-------|----------|
| | | |
```

---

## Quick Reference

### Health Checks

```bash
curl https://arkon.app/api/health
curl https://arkon.app/api/health/ready
curl https://arkon.app/api/health/live
```

### Logs

```bash
pnpm deploy:logs --tail 100
pnpm deploy:logs --service api
pnpm deploy:logs --since 1h
```

### Metrics

- Grafana: https://grafana.arkon.app
- Error tracking: https://sentry.arkon.app

### Contacts

| Role | Contact |
|------|---------|
| On-Call | PagerDuty |
| Platform | @platform-team |
| DBA | @dba-team |
