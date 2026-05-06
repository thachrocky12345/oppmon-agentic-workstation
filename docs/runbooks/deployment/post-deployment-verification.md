# Post-Deployment Verification

**Last Updated:** 2026-05-05

Verify deployment success before declaring complete.

## Automated Checks

### 1. Health Endpoints

```bash
# API health check
curl -s https://arkon.app/api/health | jq .
# Expected: { "status": "ok", "version": "<new-sha>" }

# API readiness check
curl -s https://arkon.app/api/health/ready | jq .
# Expected: { "status": "ready", "database": "connected", "cache": "connected" }

# Frontend check
curl -s -o /dev/null -w "%{http_code}" https://arkon.app
# Expected: 200
```

### 2. Version Verification

```bash
# Verify deployed version
curl -s https://arkon.app/api/health | jq .version
# Expected: <new-commit-sha>

# Verify build timestamp
curl -s https://arkon.app/api/health | jq .buildTime
# Expected: Recent timestamp
```

### 3. Database Connectivity

```bash
# Check database status via API
curl -s https://arkon.app/api/health/ready | jq .database
# Expected: "connected"

# Check migration status
pnpm db:status
# Expected: All migrations applied
```

## Manual Verification Checklist

### Core Functionality

- [ ] Landing page loads correctly
- [ ] Login flow works
- [ ] Dashboard loads with data
- [ ] Navigation works across all sections

### Authentication

- [ ] Can register new user
- [ ] Can login with existing user
- [ ] Can logout
- [ ] Protected routes redirect to login
- [ ] Admin routes restricted to admin users

### API Endpoints

- [ ] `/api/agents` returns agent list
- [ ] `/api/events` returns events
- [ ] `/api/skills` returns skills
- [ ] `/api/mcp` returns MCP servers

### Real-time Features

- [ ] WebSocket connection established
- [ ] SSE streaming works for chat
- [ ] Real-time updates received

### External Integrations

- [ ] LLM proxy working (test with simple prompt)
- [ ] OAuth flow working (if changed)
- [ ] Email notifications sending (if changed)

## Monitoring Checks

### Error Rates

Wait 5 minutes after deployment, then check:

- [ ] Error rate < 1% (normal baseline)
- [ ] No new error types appearing
- [ ] No spike in 5xx responses
- [ ] No spike in 4xx responses (except expected)

### Performance

- [ ] P95 latency within normal range
- [ ] No memory leaks (memory stable)
- [ ] CPU usage within normal range
- [ ] Database query times normal

### Logs

```bash
# Check for errors in logs
pnpm deploy:logs | grep -i error

# Check for warnings
pnpm deploy:logs | grep -i warn

# Look for startup messages
pnpm deploy:logs | grep -i "started\|listening"
```

## Verification Results

| Check | Status | Notes |
|-------|--------|-------|
| Health endpoints | | |
| Version correct | | |
| Database connected | | |
| Core functionality | | |
| Authentication | | |
| API endpoints | | |
| Error rates normal | | |
| Performance normal | | |

---

## Troubleshooting

### Health Check Failing

1. Check logs for errors:
   ```bash
   pnpm deploy:logs --tail 100 | grep error
   ```

2. Check database connectivity:
   ```bash
   pnpm db:ping
   ```

3. Check environment variables:
   ```bash
   pnpm deploy:env-check
   ```

4. If unrecoverable, proceed to [Rollback Procedure](rollback-procedure.md)

### Version Mismatch

1. Verify deployment completed:
   ```bash
   pnpm deploy:status
   ```

2. Check for cached responses (clear CDN if needed)

3. Verify correct image was deployed:
   ```bash
   pnpm deploy:image-info
   ```

### High Error Rate

1. Check error logs for patterns
2. Identify affected endpoints
3. Check recent code changes for root cause
4. If critical, proceed to [Rollback Procedure](rollback-procedure.md)

---

## Sign-off

Verification completed by: _____________ Date: _____________

- [ ] All automated checks passing
- [ ] Manual verification complete
- [ ] Monitoring looks healthy
- [ ] Deployment declared successful

OR

- [ ] Issues found, proceeding to rollback
