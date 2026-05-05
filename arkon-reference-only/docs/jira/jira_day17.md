# TAG-17: Resource-Centric Event Logging

## Description

**Suggested Points:** 8 (Critical — privacy-by-design architecture requiring NO user_id storage; events_enabled default false; aggregation-only analytics; this is an architectural commitment)

## Objective

Implement resource-centric event logging that tracks usage patterns without storing user identifiers. **CRITICAL: This system must NEVER store user_id. The events_enabled flag must default to false. This is a privacy commitment built into the architecture.**

## Requirements

### CRITICAL: Privacy-by-Design Rules
1. **NO user_id column in usage_events table**
2. **NO foreign key to users table**
3. **events_enabled defaults to false for new tenants**
4. **Events discarded (204) when events_enabled=false**
5. **All queries are tenant-level aggregations only**

### Usage Events Schema
```sql
CREATE TABLE usage_events (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  resource_type VARCHAR(50) NOT NULL, -- 'skill', 'mcp_server', 'rag_query'
  resource_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'invoke', 'sync', 'search'
  bucket_timestamp TIMESTAMP NOT NULL, -- 15-minute bucket
  count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB, -- non-identifying metadata only
  created_at TIMESTAMP DEFAULT NOW(),

  -- NO user_id column!
  -- UNIQUE constraint for upsert into buckets
  UNIQUE(tenant_id, resource_type, resource_id, action, bucket_timestamp)
);

-- Index for tenant-level queries
CREATE INDEX idx_usage_events_tenant_bucket
ON usage_events(tenant_id, bucket_timestamp);
```

### Events API
- `POST /api/events` — Record event (upserts into bucket)
- Returns 204 (no content) regardless of events_enabled
- No response body to prevent information leakage
- tenant_id extracted from JWT only
- Malformed events logged but not rejected (graceful degradation)

### Event Collection from CLI
- Claude Code hook reports invocations
- CLI reports sync operations
- RAG queries tracked with semantic bucket (not query text)
- All events include only: resource_type, resource_id, action, timestamp

### Tenant Settings
- `events_enabled: boolean` in tenant settings
- Default: false (opt-in required)
- Admin UI toggle with privacy explanation
- Changing to false does not delete historical data

### Aggregation Queries
- All queries return counts only
- No ability to trace to individual users
- Time-series: events per 15-min bucket
- Breakdowns: by resource_type, by action
- **Never expose raw event data**

## Implementation Notes
- Backend: New events module, strict schema validation
- Frontend: Settings toggle, dashboard queries
- CLI: Event reporting integration (Day 18)
- Database: New usage_events table with upsert logic

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/api/src/__tests__/events.test.ts` | `never stores user_id in usage_events` | No user_id in insert |
| `apps/api/src/__tests__/events.test.ts` | `extracts tenant_id from JWT only` | tenant_id from claims |
| `apps/api/src/__tests__/events.test.ts` | `returns 204 when events_enabled=false` | Status 204, no body |
| `apps/api/src/__tests__/events.test.ts` | `returns 204 when events_enabled=true` | Status 204, event stored |
| `apps/api/src/__tests__/events.test.ts` | `upserts into 15-min buckets` | Count incremented |
| `apps/api/src/__tests__/events.test.ts` | `new bucket creates new row` | New row for new bucket |
| `apps/api/src/__tests__/schema.test.ts` | `usage_events has no user_id column` | Column does not exist |
| `apps/api/src/__tests__/schema.test.ts` | `usage_events cannot join to users` | No FK relationship |
| `apps/api/src/__tests__/aggregation.test.ts` | `queries return counts only` | No individual events |
| `apps/api/src/__tests__/aggregation.test.ts` | `no user information in response` | No user fields |

### Test Coverage Requirements
- **100% coverage on user_id exclusion logic**
- 100% coverage on events_enabled behavior
- All aggregation queries tested for privacy

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `events_enabled default false` | New tenant | 1. Check events_enabled | Value is false |
| `events discarded when disabled` | events_enabled=false | 1. POST /api/events | 204, no row created |
| `events stored when enabled` | events_enabled=true | 1. POST /api/events | 204, row created |
| `bucket upsert` | events_enabled=true | 1. POST event 2. POST same event in bucket | Count = 2 |
| `privacy audit GET /api/usage` | Events exist | 1. GET /api/usage | No user fields in response |
| `privacy audit audit_log` | Event posted | 1. Check audit_log | No user details in event audit |
| `tenant isolation` | Two tenants with events | 1. GET /api/usage as tenant A | Only tenant A events |

### End-to-End Flows
- Enable events → Record usage → Query dashboard → Only aggregates shown
- Disable events → Record usage → Nothing stored → Re-enable → Previous data still there

## Privacy Enforcement Test (CRITICAL)

```typescript
// apps/api/src/__tests__/events.privacy.test.ts
// THIS FILE MUST PASS BEFORE ANY PR MERGE

describe('PRIVACY ENFORCEMENT', () => {
  describe('usage_events schema', () => {
    it('has no user_id column', async () => {
      const columns = await getTableColumns('usage_events')
      expect(columns.find(c => c.name === 'user_id')).toBeUndefined()
    })

    it('cannot join to users table', async () => {
      const fks = await getForeignKeys('usage_events')
      const userFk = fks.find(fk => fk.referenced_table === 'users')
      expect(userFk).toBeUndefined()
    })
  })

  describe('POST /api/events', () => {
    it('never stores user_id', async () => {
      const tenantJwt = await createTenantJwt({
        tenant_id: 'test-tenant',
        sub: 'user-123' // This should NOT be stored
      })

      await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${tenantJwt}`)
        .send({ resource_type: 'skill', resource_id: 'abc', action: 'invoke' })

      // Check database directly
      const events = await db.query('SELECT * FROM usage_events WHERE tenant_id = $1', ['test-tenant'])

      events.rows.forEach(event => {
        expect(event.user_id).toBeUndefined()
        expect(JSON.stringify(event)).not.toContain('user-123')
      })
    })
  })

  describe('events_enabled setting', () => {
    it('new tenants have events_enabled=false by default', async () => {
      const tenant = await createTenant()
      const settings = await getTenantSettings(tenant.id)
      expect(settings.events_enabled).toBe(false)
    })

    it('events_enabled=false discards all events', async () => {
      const tenant = await createTenant() // events_enabled=false by default
      const jwt = await createTenantJwt({ tenant_id: tenant.id })

      const response = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ resource_type: 'skill', resource_id: 'abc', action: 'invoke' })

      expect(response.status).toBe(204)

      // Verify nothing stored
      const events = await db.query('SELECT * FROM usage_events WHERE tenant_id = $1', [tenant.id])
      expect(events.rows).toHaveLength(0)
    })
  })

  describe('GET /api/usage', () => {
    it('response contains no user fields', async () => {
      const response = await request(app)
        .get('/api/usage')
        .set('Authorization', `Bearer ${adminJwt}`)

      const body = JSON.stringify(response.body)
      expect(body).not.toContain('user_id')
      expect(body).not.toContain('user_email')
      expect(body).not.toContain('user_name')
    })
  })
})
```

## Acceptance Criteria
1. **usage_events table has NO user_id column**
2. **New tenants have events_enabled=false by default**
3. Events discarded (204 returned) when events_enabled=false
4. Events upserted into 15-minute buckets when enabled
5. All usage queries return aggregates only, no user data
6. tenant_id extracted from JWT only, never from request body
7. Privacy enforcement tests pass
8. Admin UI shows events_enabled toggle with privacy explanation

## Review Checklist
- [ ] **Is there ANY code path that could store user_id?**
- [ ] **Is events_enabled defaulting to false in migration?**
- [ ] Does the 204 response reveal whether events were stored?
- [ ] Can metadata contain identifying information?
- [ ] Are aggregation queries truly anonymous?
- [ ] Is the privacy explanation in Admin UI clear?

## Dependencies
- Depends on: Day 1 (auth), Day 15 (Admin UI settings)
- Blocks: Day 18 (Hook integration sends events), Day 19 (Dashboard queries)

## Risk Factors
- **Accidental user_id storage** — Mitigation: Schema prevents it, tests verify it
- **Metadata leakage** — Mitigation: Strict validation of metadata contents
- **Re-identification through aggregates** — Mitigation: Minimum bucket sizes
- **events_enabled default changed** — Mitigation: Migration sets false, tests verify
