# ADR-0006: [AUTO] Privacy-First Usage Analytics

**Date:** 2026-05-05

**Status:** Accepted

## Context

The Arkon platform needs to track usage analytics for features like skills, MCP servers, and RAG queries. This data is valuable for understanding platform adoption, identifying popular features, and making informed decisions about future development.

However, collecting usage data raises privacy concerns, especially in enterprise environments where users may be hesitant to have their individual actions tracked. The platform serves as an AI Gateway for sensitive AI agent operations, making privacy a critical consideration.

We needed to design an analytics system that provides useful aggregate insights while respecting user privacy.

## Decision

We implemented a **privacy-first usage analytics system** with the following design principles:

1. **No User ID**: The `UsageEvent` model intentionally has **no `user_id` column**. Events are aggregated at the tenant level only.

2. **Opt-in by Default**: Usage events are disabled by default (`eventsEnabled: false` in `TenantSettings`). Tenants must explicitly opt-in.

3. **Time Bucketing**: Events are aggregated into 15-minute buckets (`bucketTimestamp`) to further reduce identifiability while maintaining useful analytics.

4. **Count Aggregation**: Instead of storing individual events, we increment a `count` field for matching (tenantId, resourceType, resourceId, action, bucketTimestamp) combinations.

5. **Non-identifying Metadata**: The `metadata` field stores only non-identifying information.

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| Full user-level tracking | Complete analytics, individual usage patterns | Privacy concerns, GDPR/CCPA complexity, user resistance | Too invasive for enterprise clients |
| Anonymous user IDs | Per-session tracking without PII | Still allows tracking patterns, pseudo-anonymous | Can be combined with other data to identify users |
| No analytics at all | Perfect privacy | No usage insights, harder to improve platform | Business need for aggregate understanding |
| Differential privacy | Mathematical privacy guarantees | Complex implementation, requires large datasets | Over-engineering for current scale |

## Consequences

### Positive

- **Privacy by design**: Impossible to track individual user actions
- **GDPR/CCPA compliant**: No personal data in analytics
- **Enterprise-friendly**: Addresses common enterprise privacy concerns
- **Simple data model**: Easy to query aggregate metrics
- **Reduced storage**: Bucketed aggregation reduces row count

### Negative

- **No individual insights**: Cannot analyze per-user behavior
- **No funnel analysis**: Cannot track user journeys
- **Limited debugging**: Cannot correlate issues to specific users via analytics
- **Delayed insights**: 15-minute buckets mean real-time analytics are coarse

## Related

- [Data Model Diagram](../diagrams/data-model.md) - Shows TenantSettings and UsageEvent models
- `packages/database/prisma/schema.prisma` - Schema definition with comments explaining privacy decisions
- `apps/api/src/routes/usage.ts` - Usage API endpoints
