# Cache Management Operations

**Last Updated:** 2026-05-05

Procedures for managing Redis cache operations.

## Cache Overview

### Cache Types

| Cache | Purpose | TTL | Size |
|-------|---------|-----|------|
| Session | User sessions | 24h | ~1KB |
| API Response | Cached responses | 5m | ~10KB |
| Rate Limit | Request counters | 1m | ~100B |
| Feature Flags | Flag states | 1m | ~1KB |
| Vector Cache | Embedding results | 1h | ~50KB |

### Cache Keys

```
session:{userId}         - User session data
api:{hash}               - Cached API responses
rate:{ip}:{endpoint}     - Rate limit counters
flags:{tenantId}         - Feature flag states
vector:{query_hash}      - Cached vector searches
```

## Cache Health

### Check Status

```bash
# Redis health
pnpm cache:health

# Cache statistics
pnpm cache:stats

# Memory usage
pnpm cache:memory
```

### Expected Output

```
Redis Status: Connected
Memory Used: 256MB / 1GB (25%)
Keys: 45,231
Hit Rate: 94.5%
Connections: 12 / 100
```

## Cache Operations

### View Cache Contents

```bash
# List keys by pattern
pnpm cache:keys "session:*"

# Count keys by pattern
pnpm cache:count "api:*"

# Get specific key
pnpm cache:get "session:user123"

# Get key TTL
pnpm cache:ttl "session:user123"
```

### Clear Cache

```bash
# Clear specific key
pnpm cache:delete "session:user123"

# Clear by pattern
pnpm cache:delete "api:*"

# Clear all (use with caution!)
pnpm cache:flush --confirm
```

### Cache Invalidation

```bash
# Invalidate user session
pnpm cache:invalidate --type session --user user123

# Invalidate tenant data
pnpm cache:invalidate --type all --tenant tenant123

# Invalidate feature flags
pnpm cache:invalidate --type flags
```

## Session Management

### View Sessions

```bash
# List active sessions
pnpm cache:sessions --list

# Count sessions by tenant
pnpm cache:sessions --count-by tenant

# Find user session
pnpm cache:sessions --user user123
```

### Session Operations

```bash
# End user session
pnpm cache:session:delete --user user123

# End all sessions for user
pnpm cache:session:delete-all --user user123

# End all sessions (emergency)
pnpm cache:session:flush --confirm
```

## Rate Limit Management

### View Rate Limits

```bash
# Check rate limit status
pnpm cache:ratelimit --ip 1.2.3.4

# List exceeded limits
pnpm cache:ratelimit --exceeded

# Count rate limited requests
pnpm cache:ratelimit --stats
```

### Reset Rate Limits

```bash
# Reset for specific IP
pnpm cache:ratelimit:reset --ip 1.2.3.4

# Reset for endpoint
pnpm cache:ratelimit:reset --endpoint "/api/chat"

# Reset all
pnpm cache:ratelimit:reset --all --confirm
```

### Adjust Limits

```bash
# Temporarily increase limit for IP
pnpm cache:ratelimit:override --ip 1.2.3.4 --limit 1000 --ttl 1h

# Whitelist IP
pnpm cache:ratelimit:whitelist --ip 1.2.3.4

# Remove from whitelist
pnpm cache:ratelimit:unwhitelist --ip 1.2.3.4
```

## Performance Optimization

### Analyze Cache Usage

```bash
# Find large keys
pnpm cache:analyze --large-keys

# Find hot keys
pnpm cache:analyze --hot-keys

# Find slow operations
pnpm cache:analyze --slow-log
```

### Optimize Cache

```bash
# Memory optimization
pnpm cache:optimize --memory

# Defragment
pnpm cache:optimize --defrag

# Adjust TTLs
pnpm cache:optimize --ttl-review
```

## Troubleshooting

### High Memory Usage

```bash
# Check memory breakdown
pnpm cache:memory --breakdown

# Find largest keys
pnpm cache:keys --sort-by memory --limit 20

# Clean expired keys
pnpm cache:clean --expired
```

### Low Hit Rate

```bash
# Analyze cache misses
pnpm cache:analyze --misses

# Review TTL settings
pnpm cache:ttl --stats

# Increase TTL for frequently accessed
pnpm cache:ttl --set "api:*" 600
```

### Connection Issues

```bash
# Check connections
pnpm cache:connections

# Reset connection pool
pnpm cache:pool:reset

# Verify connectivity
redis-cli ping
```

### Cache Inconsistency

```bash
# Verify cache vs database
pnpm cache:verify --type sessions

# Clear and rebuild
pnpm cache:rebuild --type flags

# Force refresh
pnpm cache:refresh --all
```

## Backup and Recovery

### Backup Cache

```bash
# Create snapshot
pnpm cache:snapshot --output cache-backup.rdb

# Export keys
pnpm cache:export "session:*" --output sessions.json
```

### Restore Cache

```bash
# Restore from snapshot
pnpm cache:restore --input cache-backup.rdb

# Import keys
pnpm cache:import --input sessions.json
```

## Monitoring

### Key Metrics

| Metric | Warning | Critical |
|--------|---------|----------|
| Memory Used | > 70% | > 90% |
| Hit Rate | < 80% | < 60% |
| Connections | > 80 | > 95 |
| Evictions | > 100/min | > 1000/min |
| Latency (p99) | > 10ms | > 50ms |

### Alerts

```bash
# Set up alerts
pnpm cache:alert --metric memory --threshold 90
pnpm cache:alert --metric hitrate --threshold 60 --below
```

---

## Quick Reference

```bash
# Health check
pnpm cache:health

# Clear all API cache
pnpm cache:delete "api:*"

# End user session
pnpm cache:session:delete --user X

# Reset rate limit
pnpm cache:ratelimit:reset --ip X

# Memory stats
pnpm cache:memory
```
