# TAG-19: Usage Dashboard + Polish

## Description

**Suggested Points:** 5 (Medium — dashboard visualization, empty state handling, mobile responsiveness, and privacy-compliant data display; builds on existing data infrastructure)

## Objective

Build the usage analytics dashboard with aggregate visualizations, implement proper empty states for all components, ensure mobile responsiveness throughout the Admin UI, and verify no user data leakage in any dashboard component.

## Requirements

### Usage Dashboard
- Time-series chart: Events per 15-min bucket over selected period
- Breakdown chart: Events by resource_type (skill, MCP, RAG)
- Resource ranking: Most used skills/MCP servers
- Period selector: Last 24h, 7d, 30d, custom range
- **All data is aggregates only — no individual user data**

### Dashboard Components
- `UsageOverview` — Key metrics: total events, active resources, trend
- `TimeSeriesChart` — Line/bar chart of events over time
- `ResourceBreakdown` — Pie/donut chart by resource type
- `TopResources` — Ranked list of most-used resources
- `ActivityHeatmap` — Hour/day usage patterns (optional)

### Empty States
- Every list/table has empty state message
- Every chart shows "No data" gracefully
- Clear guidance on how to populate data
- No broken layouts when data absent
- "Events collection is disabled" state when events_enabled=false

### Mobile Responsiveness
- Dashboard usable on tablet (1024px)
- Essential functions on mobile (768px)
- Tables scroll horizontally on narrow screens
- Charts resize appropriately
- Touch-friendly interactions

### Privacy Compliance Verification
- **No user_id anywhere in dashboard queries or responses**
- **No ability to drill down to individual users**
- Audit dashboard code for user data leakage
- Review all API responses for user fields

## Implementation Notes
- Backend: Aggregation queries on usage_events
- Frontend: Chart library (Chart.js, Recharts, or similar)
- CLI: N/A
- Database: Optimized queries with proper indexes

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/web/src/__tests__/dashboard.test.ts` | `renders with data` | Charts displayed |
| `apps/web/src/__tests__/dashboard.test.ts` | `renders empty state` | Empty message shown |
| `apps/web/src/__tests__/dashboard.test.ts` | `period selector works` | Data filtered by period |
| `apps/web/src/__tests__/dashboard.test.ts` | `no user data in display` | No user fields rendered |
| `apps/web/src/__tests__/charts.test.ts` | `time series renders` | Chart visible |
| `apps/web/src/__tests__/charts.test.ts` | `breakdown renders` | Pie chart visible |
| `apps/web/src/__tests__/charts.test.ts` | `handles zero data` | No data message shown |
| `apps/web/src/__tests__/responsive.test.ts` | `mobile layout works` | No overflow at 768px |
| `apps/web/src/__tests__/responsive.test.ts` | `tablet layout works` | Full function at 1024px |
| `apps/web/src/__tests__/empty-states.test.ts` | `teams list empty` | Empty message shown |
| `apps/web/src/__tests__/empty-states.test.ts` | `skills list empty` | Empty message shown |
| `apps/web/src/__tests__/empty-states.test.ts` | `audit log empty` | Empty message shown |

### Test Coverage Requirements
- 100% coverage on empty state rendering
- All responsive breakpoints tested
- Privacy audit tests for all dashboard queries

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `dashboard with data` | Events exist | 1. Open dashboard | Charts with data |
| `dashboard empty` | No events | 1. Open dashboard | Empty states shown |
| `events disabled state` | events_enabled=false | 1. Open dashboard | "Collection disabled" message |
| `period selector` | 7d of events | 1. Select 24h | Only 24h data shown |
| `mobile viewport` | Dashboard loaded | 1. Set viewport 768px | Layout correct |
| `tablet viewport` | Dashboard loaded | 1. Set viewport 1024px | Full functionality |
| `no user data leak` | Events exist | 1. Inspect all API responses | No user fields |
| `top resources query` | Usage data | 1. View top resources | Ranked by count only |

### End-to-End Flows
- Events exist → Dashboard loads → All charts render → Drill into resource → No user data shown
- No events → Dashboard loads → Empty states → Enable events → Guidance shown
- Mobile user → Dashboard loads → Touch interactions → Full functionality

## Privacy Verification Test (CRITICAL)

```typescript
// apps/web/src/__tests__/dashboard.privacy.test.ts

describe('dashboard privacy verification', () => {
  it('GET /api/usage response contains no user fields', async () => {
    // Generate some events
    await generateTestEvents(100)

    const response = await request(app)
      .get('/api/usage')
      .query({ period: '7d' })
      .set('Authorization', `Bearer ${adminJwt}`)

    // Stringify and search for any user-related fields
    const body = JSON.stringify(response.body)

    const userFields = [
      'user_id', 'userId', 'user_email', 'userEmail',
      'user_name', 'userName', 'actor_id', 'actorId',
      'created_by', 'createdBy'
    ]

    userFields.forEach(field => {
      expect(body.toLowerCase()).not.toContain(field.toLowerCase())
    })
  })

  it('top resources shows count only, no user breakdown', async () => {
    const response = await request(app)
      .get('/api/usage/top-resources')
      .set('Authorization', `Bearer ${adminJwt}`)

    response.body.forEach((resource: any) => {
      expect(resource).toHaveProperty('resource_id')
      expect(resource).toHaveProperty('count')
      expect(resource).not.toHaveProperty('users')
      expect(resource).not.toHaveProperty('user_breakdown')
    })
  })

  it('cannot drill down to user level', async () => {
    // Attempt to query user-level data
    const response = await request(app)
      .get('/api/usage/by-user')
      .set('Authorization', `Bearer ${adminJwt}`)

    // Should be 404 or explicitly forbidden
    expect([404, 403]).toContain(response.status)
  })
})
```

## Empty State Components

```typescript
// apps/web/src/components/EmptyState.tsx

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description: string
  action?: {
    label: string
    href: string
  }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <a href={action.href} className="action-button">
          {action.label}
        </a>
      )}
    </div>
  )
}

// Usage examples
export const EmptySkillsList = () => (
  <EmptyState
    icon={<SkillsIcon />}
    title="No skills yet"
    description="Create your first skill to get started"
    action={{ label: "Create Skill", href: "/admin/skills/new" }}
  />
)

export const EmptyDashboard = () => (
  <EmptyState
    icon={<ChartIcon />}
    title="No usage data"
    description="Usage data will appear here once team members start using skills"
  />
)

export const EventsDisabledState = () => (
  <EmptyState
    icon={<InfoIcon />}
    title="Event collection is disabled"
    description="Enable event collection in settings to see usage analytics"
    action={{ label: "Go to Settings", href: "/admin/settings" }}
  />
)
```

## Acceptance Criteria
1. Usage dashboard shows time-series and breakdown charts
2. Period selector filters data correctly
3. Top resources ranked by usage count
4. **No user data anywhere in dashboard**
5. Empty states shown for all data-dependent components
6. Mobile layout functional at 768px
7. Tablet layout fully functional at 1024px
8. "Events disabled" state when events_enabled=false

## Review Checklist
- [ ] **Is there any path to see user-level data in the dashboard?**
- [ ] Do empty states provide helpful next steps?
- [ ] Is the mobile layout tested on actual devices?
- [ ] Do charts degrade gracefully with no data?
- [ ] Are dashboard queries efficient (proper indexes)?
- [ ] Is the events_enabled state prominent?

## Dependencies
- Depends on: Day 15 (Admin UI foundation), Day 17 (Events API), Day 18 (Event collection)
- Blocks: Day 20 (Polish requires dashboard complete)

## Risk Factors
- **Chart library performance** — Mitigation: Lazy load charts, limit data points
- **Mobile layout breakage** — Mitigation: Comprehensive viewport testing
- **Empty state confusion** — Mitigation: Clear guidance, action buttons
- **User data leakage** — Mitigation: Privacy tests, code review
