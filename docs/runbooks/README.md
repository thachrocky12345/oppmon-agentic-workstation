# Arkon Runbooks

**Last Updated:** 2026-05-05

This directory contains operational runbooks for the Arkon AI Gateway platform.

## Runbook Index

### Deployment
| Runbook | Description | Last Updated |
|---------|-------------|--------------|
| [Pre-Deployment Checklist](deployment/pre-deployment-checklist.md) | Requirements before deploying | 2026-05-05 |
| [Deployment Procedure](deployment/deployment-procedure.md) | Step-by-step deployment process | 2026-05-05 |
| [Post-Deployment Verification](deployment/post-deployment-verification.md) | Verify deployment success | 2026-05-05 |
| [Rollback Procedure](deployment/rollback-procedure.md) | Revert to previous version | 2026-05-05 |

### Migrations
| Runbook | Description | Last Updated |
|---------|-------------|--------------|
| [Migration Safety Checklist](migrations/migration-safety-checklist.md) | Database migration checks | 2026-05-05 |
| [Data Migration Procedure](migrations/data-migration-procedure.md) | Safe data migration steps | 2026-05-05 |
| [Emergency Rollback](migrations/emergency-rollback.md) | Emergency migration rollback | 2026-05-05 |

### Incidents
| Runbook | Description | Last Updated |
|---------|-------------|--------------|
| [Incident Response](incidents/incident-response.md) | General incident handling | 2026-05-05 |
| [Database Recovery](incidents/database-recovery.md) | Database failure recovery | 2026-05-05 |
| [Service Degradation](incidents/service-degradation.md) | Handling partial outages | 2026-05-05 |

### Operations
| Runbook | Description | Last Updated |
|---------|-------------|--------------|
| [Admin Import/Export](operations/admin-import-export.md) | Data import/export procedures | 2026-05-05 |
| [User Management](operations/user-management.md) | User administration tasks | 2026-05-05 |
| [Cache Management](operations/cache-management.md) | Redis cache operations | 2026-05-05 |

## Quick Reference

### Emergency Contacts
| Role | Contact |
|------|---------|
| On-Call Engineer | Check PagerDuty |
| Platform Lead | @platform-team |
| Database Admin | @dba-team |

### Key URLs
| Service | URL |
|---------|-----|
| Production | https://arkon.app |
| Staging | https://staging.arkon.app |
| Monitoring | https://grafana.arkon.app |
| Logs | https://logs.arkon.app |

### Common Commands

```bash
# Check deployment status
pnpm deploy:status

# View logs
pnpm docker:logs

# Health check
curl https://arkon.app/api/health

# Database status
pnpm db:status
```

## Using Runbooks

1. **Before starting**: Read the entire runbook
2. **During execution**: Follow steps in order, check each box
3. **If something goes wrong**: STOP, refer to rollback procedure
4. **After completion**: Document any deviations or issues

## Updating Runbooks

Runbooks should be updated:
- After any procedure change
- After any incident where the runbook was insufficient
- During quarterly reviews

To update:
1. Create a PR with changes
2. Get review from platform team
3. Test updated procedure in staging
4. Merge and announce changes
