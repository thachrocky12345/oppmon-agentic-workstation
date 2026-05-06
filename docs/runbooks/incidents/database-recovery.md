# Database Recovery

**Last Updated:** 2026-05-05

Procedures for recovering from database issues.

## Common Issues

| Issue | Symptom | Recovery |
|-------|---------|----------|
| Connection exhausted | "too many connections" | [Connection Pool](#connection-pool-exhaustion) |
| Slow queries | High latency, timeouts | [Query Performance](#query-performance) |
| Replication lag | Stale reads | [Replication](#replication-issues) |
| Disk full | Write failures | [Disk Space](#disk-space) |
| Corruption | Data inconsistency | [Corruption](#data-corruption) |
| Total failure | Connection refused | [Total Failure](#total-database-failure) |

## Connection Pool Exhaustion

### Symptoms
- "too many connections" errors
- Application timeouts
- Slow startup

### Diagnosis

```bash
# Check active connections
psql -c "SELECT count(*) FROM pg_stat_activity"

# See connection breakdown
psql -c "SELECT usename, application_name, count(*) FROM pg_stat_activity GROUP BY 1,2 ORDER BY 3 DESC"

# Find long-running queries
psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 10"
```

### Resolution

```bash
# Kill idle connections
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '1 hour'"

# If needed, restart application to reset pool
pnpm deploy:restart

# Increase max connections (if appropriate)
# Edit postgresql.conf: max_connections = 200
```

### Prevention
- Review connection pool sizing
- Add connection timeout
- Monitor connection count

## Query Performance

### Symptoms
- High latency
- Timeouts
- CPU spike on database

### Diagnosis

```bash
# Find slow queries
psql -c "SELECT query, calls, mean_time, total_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10"

# Check for missing indexes
psql -c "SELECT relname, seq_scan, seq_tup_read FROM pg_stat_user_tables WHERE seq_scan > 1000 ORDER BY seq_tup_read DESC"

# Find blocking queries
psql -c "SELECT blocked_locks.pid AS blocked_pid, blocking_locks.pid AS blocking_pid, blocked_activity.query AS blocked_statement FROM pg_catalog.pg_locks blocked_locks JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid WHERE NOT blocked_locks.granted"
```

### Resolution

```bash
# Kill long-running query
psql -c "SELECT pg_cancel_backend(<pid>)"

# Force kill if needed
psql -c "SELECT pg_terminate_backend(<pid>)"

# Add missing index (plan for next deployment)
CREATE INDEX CONCURRENTLY idx_name ON table(column);
```

## Replication Issues

### Symptoms
- Stale data on reads
- High replication lag
- Replica disconnected

### Diagnosis

```bash
# Check replication status
psql -c "SELECT client_addr, state, sent_lsn, write_lsn, replay_lsn, (sent_lsn - replay_lsn) AS lag FROM pg_stat_replication"

# Check replica lag in bytes
psql -c "SELECT pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes FROM pg_stat_replication"
```

### Resolution

```bash
# If replica is far behind, may need to rebuild
# Contact DBA team for replica rebuild

# Temporarily route all traffic to primary
pnpm db:replica:disable
```

## Disk Space

### Symptoms
- "no space left on device"
- Write failures
- Database refuses connections

### Diagnosis

```bash
# Check disk usage
df -h /var/lib/postgresql/data

# Check table sizes
psql -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10"

# Check for bloat
psql -c "SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS total_size FROM pg_tables WHERE schemaname = 'public' ORDER BY pg_total_relation_size(tablename::regclass) DESC"
```

### Resolution

```bash
# Clean up old data (if safe)
psql -c "DELETE FROM events WHERE created_at < now() - interval '90 days'"

# Vacuum to reclaim space
psql -c "VACUUM FULL verbose"

# If emergency, add disk space
# Contact infrastructure team
```

## Data Corruption

### Symptoms
- Inconsistent data
- Constraint violations
- Checksum errors

### Diagnosis

```bash
# Check for corruption
pg_checksums --check

# Verify table integrity
psql -c "SELECT * FROM pg_catalog.pg_class WHERE relname = 'tablename' AND relkind = 'r'"
```

### Resolution

1. **Stop writes immediately**
   ```bash
   pnpm deploy:scale --replicas 0
   ```

2. **Assess extent of corruption**
   - Contact DBA team
   - Review logs

3. **Restore from backup**
   ```bash
   pnpm db:restore --name LATEST_BACKUP
   ```

4. **If backup not viable, contact vendor support**

## Total Database Failure

### Symptoms
- Connection refused
- Database process not running
- Cluster crashed

### Immediate Actions

```bash
# Check database status
pg_isready

# Check process
ps aux | grep postgres

# Check logs
tail -100 /var/log/postgresql/postgresql.log
```

### Resolution

```bash
# Attempt restart
pg_ctl restart -D /var/lib/postgresql/data

# If won't start, check for lock files
rm /var/lib/postgresql/data/postmaster.pid

# If corrupt, restore from backup
pnpm db:restore --name LATEST_BACKUP
```

### Failover (if configured)

```bash
# Promote replica to primary
pnpm db:failover --target replica-1

# Update connection strings
pnpm deploy:env:update DATABASE_URL=new_primary_url

# Restart application
pnpm deploy:restart
```

---

## Emergency Contacts

| Role | Contact |
|------|---------|
| DBA On-Call | @dba-team |
| Cloud Provider Support | [Support Portal] |
| Database Vendor | [Support Portal] |

## Prevention Checklist

- [ ] Regular backups verified
- [ ] Monitoring alerts configured
- [ ] Connection pool sized correctly
- [ ] Disk space monitoring
- [ ] Query performance monitoring
- [ ] Replication lag alerting
