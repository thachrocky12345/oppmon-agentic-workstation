# Service Degradation

**Last Updated:** 2026-05-05

Handling partial outages and degraded performance.

## Types of Degradation

| Type | Definition | Impact |
|------|------------|--------|
| Latency | Slow responses | Poor UX |
| Partial | Some features broken | Limited functionality |
| Capacity | Under heavy load | Intermittent failures |
| Dependency | External service down | Feature unavailable |

## Detection

### Monitoring Alerts
- P95 latency > 2x normal
- Error rate > 5%
- Availability < 99.9%
- Queue depth increasing

### User Reports
- "Slow to load"
- "Intermittent errors"
- "Feature not working"

## Triage

### 1. Identify Scope

```bash
# Check overall health
curl https://arkon.app/api/health/ready

# Check specific services
curl https://arkon.app/api/health/components

# Check error rates by endpoint
# View in Grafana dashboard
```

### 2. Identify Cause

| Symptom | Likely Cause |
|---------|--------------|
| All endpoints slow | Database or cache issue |
| Specific endpoint slow | Query or code issue |
| Intermittent errors | Resource exhaustion |
| Feature broken | Dependency down |

## Mitigation Strategies

### High Latency

#### Quick Wins

```bash
# Restart application (clears state)
pnpm deploy:restart

# Scale up
pnpm deploy:scale --replicas 4

# Enable cache if not already
pnpm cache:enable
```

#### Investigation

```bash
# Check database queries
pnpm db:slow-queries

# Check memory usage
pnpm deploy:resources

# Check for memory leaks
pnpm deploy:memory-profile
```

### Partial Feature Failure

#### Identify Broken Feature

```bash
# Check logs for specific errors
pnpm deploy:logs | grep "ERROR.*feature_name"

# Test specific endpoints
curl -v https://arkon.app/api/broken_endpoint
```

#### Mitigate

```bash
# If feature flag available, disable feature
pnpm feature:disable broken_feature

# If not critical, add to maintenance message
pnpm status:update --message "Feature X temporarily unavailable"
```

### Capacity Issues

#### Immediate Relief

```bash
# Scale horizontally
pnpm deploy:scale --replicas 6

# Scale vertically
pnpm deploy:resources --cpu 4 --memory 8G

# Enable rate limiting
pnpm ratelimit:strict
```

#### Load Shedding

```bash
# Enable queue for heavy operations
pnpm queue:enable heavy_operations

# Enable circuit breaker
pnpm circuit:open non_critical_feature
```

### Dependency Failures

#### Identify Failing Dependency

```bash
# Check external services
pnpm deps:health

# Check specific dependency
curl -v https://external-service.com/health
```

#### Fallback Options

| Dependency | Fallback |
|------------|----------|
| LLM Provider | Switch to backup provider |
| Email Service | Queue for retry |
| Analytics | Skip, log locally |
| OAuth | Disable new signups |

```bash
# Switch LLM provider
pnpm llm:provider --primary cerebras --fallback ollama

# Enable queue for failed sends
pnpm email:queue-mode
```

## Communication

### Internal Updates

```
SERVICE DEGRADATION: [Brief description]
Impact: [Who's affected, what's broken]
Cause: [If known]
Mitigation: [What we're doing]
ETA: [If known]
```

### External (if user-facing)

Update status page:
```
We are experiencing [degraded performance / intermittent issues].
Affected: [Feature/Service]
Status: Investigating
Updates: Every 15 minutes
```

## Resolution

### Verification Checklist

- [ ] Latency returned to normal
- [ ] Error rates normal
- [ ] All features functional
- [ ] No queued work building up
- [ ] Dependencies healthy

### Post-Resolution

```bash
# Verify all systems
pnpm health:full

# Check for data integrity
pnpm integrity:check

# Review and close any circuit breakers
pnpm circuit:status
```

## Prevention

### Proactive Measures

- [ ] Regular load testing
- [ ] Capacity planning reviews
- [ ] Dependency health monitoring
- [ ] Auto-scaling configured
- [ ] Circuit breakers in place
- [ ] Graceful degradation patterns

### Monitoring

| Metric | Warning | Critical |
|--------|---------|----------|
| P95 Latency | > 1s | > 3s |
| Error Rate | > 1% | > 5% |
| CPU | > 70% | > 90% |
| Memory | > 80% | > 95% |
| Queue Depth | > 1000 | > 5000 |

---

## Quick Commands

```bash
# Overall health
pnpm health:check

# Scale up
pnpm deploy:scale --replicas N

# Restart
pnpm deploy:restart

# Enable maintenance
pnpm maintenance:on

# Check dependencies
pnpm deps:health
```
