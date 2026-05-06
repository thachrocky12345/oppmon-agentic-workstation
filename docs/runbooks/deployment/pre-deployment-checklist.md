# Pre-Deployment Checklist

**Last Updated:** 2026-05-05

Complete all items before starting deployment.

## Code Quality

- [ ] All CI checks passing (tests, lint, typecheck)
- [ ] Code review approved by at least 1 reviewer
- [ ] No critical or high security vulnerabilities
- [ ] No known breaking changes without migration path

## Database

- [ ] Migrations tested on staging with production data copy
- [ ] Migration safety checks passing (`pnpm db:check`)
- [ ] Estimated migration duration: ______ (acceptable for deployment window)
- [ ] Rollback migration tested and documented
- [ ] Backup completed before destructive operations

## Testing

- [ ] All unit tests passing (`pnpm test`)
- [ ] All integration tests passing (`pnpm test:integration`)
- [ ] Manual QA completed for changed features
- [ ] Performance impact assessed (no regressions)
- [ ] Load testing completed for high-traffic endpoints

## Documentation

- [ ] CHANGELOG.md updated with version notes
- [ ] API documentation updated (if endpoints changed)
- [ ] Runbooks updated (if procedures changed)
- [ ] Environment variables documented (if new ones added)

## Communication

- [ ] Deployment window scheduled and communicated
- [ ] Team notified of deployment plan
- [ ] Stakeholders aware of changes (if user-facing)
- [ ] Support team briefed on new features

## Monitoring

- [ ] Error tracking configured for new code paths
- [ ] Alerts configured for new metrics
- [ ] Dashboard updated (if new visualizations needed)
- [ ] Log aggregation includes new log patterns

## Feature Flags

- [ ] Feature flags configured (if using gradual rollout)
- [ ] Rollout percentage set appropriately
- [ ] Kill switch tested

## Rollback Plan

- [ ] Previous container image tag recorded: `______________`
- [ ] Previous database migration version: `______________`
- [ ] Rollback procedure reviewed by team
- [ ] Rollback owner assigned: `______________`
- [ ] Rollback estimated time: ______ (< 5 minutes target)

## Environment

- [ ] Environment variables verified in production config
- [ ] Secrets rotated if required
- [ ] External service connections verified
- [ ] SSL certificates valid (> 30 days)

## Capacity

- [ ] Current resource utilization acceptable (CPU < 70%, Memory < 80%)
- [ ] Auto-scaling configured appropriately
- [ ] Database connection pool sized correctly
- [ ] Rate limits configured

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| Reviewer | | | |
| QA (if required) | | | |
| Platform (if required) | | | |

---

## Proceed to Deployment

Once all items are checked and sign-offs complete:
1. Create deployment ticket/record
2. Proceed to [Deployment Procedure](deployment-procedure.md)
