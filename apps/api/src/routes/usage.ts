/**
 * Usage Events API
 *
 * Privacy-first usage event collection and aggregation.
 * CRITICAL: This API NEVER stores or returns user_id.
 * Events are discarded when events_enabled=false.
 */

import { Router, Response } from 'express'
import { z } from 'zod'
import { query } from '../lib/db.js'
import { asyncHandler, ApiError } from '../middleware/error-handler.js'
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js'

export const usageRouter = Router()

// Event schema - no user identifiers allowed
const eventSchema = z.object({
  resource_type: z.enum(['skill', 'mcp_server', 'rag_query']),
  resource_id: z.string().min(1),
  action: z.string().min(1).max(50),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
})

const batchEventSchema = z.object({
  events: z.array(eventSchema).max(100),
})

/**
 * Calculate 15-minute bucket timestamp
 */
function getBucketTimestamp(timestamp: Date): Date {
  const bucket = new Date(timestamp)
  bucket.setMinutes(Math.floor(bucket.getMinutes() / 15) * 15)
  bucket.setSeconds(0)
  bucket.setMilliseconds(0)
  return bucket
}

/**
 * Check if events are enabled for tenant
 */
async function isEventsEnabled(tenant_id: string): Promise<boolean> {
  const result = await query(
    'SELECT "events_enabled" FROM tenant_settings WHERE "tenant_id" = $1',
    [tenant_id]
  )
  // Default to false if no settings exist (privacy by default)
  return result.rows[0]?.events_enabled ?? false
}

/**
 * POST /api/usage/events
 *
 * Record a single usage event.
 * Always returns 204 regardless of whether event was stored.
 * This prevents information leakage about events_enabled state.
 */
usageRouter.post('/events', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.tenantId

    // Graceful degradation: if not authenticated, just return 204
    if (!tenant_id) {
      return res.status(204).send()
    }

    // Parse and validate event - gracefully handle malformed events
    const parseResult = eventSchema.safeParse(req.body)
    if (!parseResult.success) {
      console.warn('Malformed usage event received', parseResult.error.errors)
      // Return 204 even for malformed events (graceful degradation)
      return res.status(204).send()
    }

    const event = parseResult.data

    // Check if events are enabled for this tenant
    const enabled = await isEventsEnabled(tenant_id)
    if (!enabled) {
      // Discard event silently - return 204 to hide state
      return res.status(204).send()
    }

    // Calculate bucket timestamp
    const eventTime = event.timestamp ? new Date(event.timestamp) : new Date()
    const bucket_timestamp = getBucketTimestamp(eventTime)

    // Upsert into bucket (increment count if exists)
    await query(
      `INSERT INTO usage_events ("id", "tenant_id", "resource_type", "resource_id", "action", "bucket_timestamp", "count", "metadata", "created_at")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1, $6, NOW())
       ON CONFLICT ("tenant_id", "resource_type", "resource_id", "action", "bucket_timestamp")
       DO UPDATE SET "count" = usage_events."count" + 1`,
      [
        tenant_id,
        event.resource_type,
        event.resource_id,
        event.action,
        bucket_timestamp,
        event.metadata ? JSON.stringify(event.metadata) : null,
      ]
    )

    // Always return 204 with no body
    res.status(204).send()
  } catch (error) {
    console.error('Error recording usage event', error)
    // Return 204 even on error (graceful degradation)
    res.status(204).send()
  }
}))

/**
 * POST /api/usage/events/batch
 *
 * Record multiple events at once.
 * Always returns 204 regardless of success/failure.
 */
usageRouter.post('/events/batch', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tenant_id = req.tenantId

    // Graceful degradation: if not authenticated, just return 204
    if (!tenant_id) {
      return res.status(204).send()
    }

    const parseResult = batchEventSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(204).send()
    }

    const enabled = await isEventsEnabled(tenant_id)
    if (!enabled) {
      return res.status(204).send()
    }

    const { events } = parseResult.data

    // Process events in parallel
    await Promise.all(
      events.map(async (event) => {
        const eventTime = event.timestamp ? new Date(event.timestamp) : new Date()
        const bucket_timestamp = getBucketTimestamp(eventTime)

        try {
          await query(
            `INSERT INTO usage_events ("id", "tenant_id", "resource_type", "resource_id", "action", "bucket_timestamp", "count", "metadata", "created_at")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1, $6, NOW())
             ON CONFLICT ("tenant_id", "resource_type", "resource_id", "action", "bucket_timestamp")
             DO UPDATE SET "count" = usage_events."count" + 1`,
            [
              tenant_id,
              event.resource_type,
              event.resource_id,
              event.action,
              bucket_timestamp,
              event.metadata ? JSON.stringify(event.metadata) : null,
            ]
          )
        } catch {
          // Silently ignore individual event failures
        }
      })
    )

    res.status(204).send()
  } catch (error) {
    console.error('Error recording batch usage events', error)
    res.status(204).send()
  }
}))

/**
 * GET /api/usage
 *
 * Get usage aggregates for the tenant.
 * CRITICAL: Returns counts only, no user data.
 */
usageRouter.get('/', requireRole('TENANT_ADMIN', 'TEAM_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.tenantId!
  const { period = '7d' } = req.query

  // Calculate start date based on period
  const startDate = new Date()
  switch (period) {
    case '24h':
      startDate.setHours(startDate.getHours() - 24)
      break
    case '7d':
      startDate.setDate(startDate.getDate() - 7)
      break
    case '30d':
      startDate.setDate(startDate.getDate() - 30)
      break
    default:
      startDate.setDate(startDate.getDate() - 7)
  }

  // Get time series data
  const timeSeriesResult = await query(
    `SELECT "bucket_timestamp", SUM("count") as total
     FROM usage_events
     WHERE "tenant_id" = $1 AND "bucket_timestamp" >= $2
     GROUP BY "bucket_timestamp"
     ORDER BY "bucket_timestamp" ASC`,
    [tenant_id, startDate]
  )

  // Get breakdown by resource type
  const byResourceTypeResult = await query(
    `SELECT "resource_type", SUM("count") as total
     FROM usage_events
     WHERE "tenant_id" = $1 AND "bucket_timestamp" >= $2
     GROUP BY "resource_type"`,
    [tenant_id, startDate]
  )

  // Get breakdown by action
  const byActionResult = await query(
    `SELECT "action", SUM("count") as total
     FROM usage_events
     WHERE "tenant_id" = $1 AND "bucket_timestamp" >= $2
     GROUP BY "action"`,
    [tenant_id, startDate]
  )

  // Calculate totals
  const timeSeriesRows = timeSeriesResult.rows as Array<{ bucket_timestamp: Date; total: string }>
  const byResourceTypeRows = byResourceTypeResult.rows as Array<{ resource_type: string; total: string }>
  const byActionRows = byActionResult.rows as Array<{ action: string; total: string }>

  const totalEvents = timeSeriesRows.reduce(
    (sum, bucket) => sum + parseInt(bucket.total, 10),
    0
  )

  // CRITICAL: Response contains NO user data
  res.json({
    data: {
      period,
      totalEvents,
      timeSeries: timeSeriesRows.map((bucket) => ({
        timestamp: bucket.bucket_timestamp,
        count: parseInt(bucket.total, 10),
      })),
      byResourceType: byResourceTypeRows.map((rt) => ({
        resource_type: rt.resource_type,
        count: parseInt(rt.total, 10),
      })),
      byAction: byActionRows.map((a) => ({
        action: a.action,
        count: parseInt(a.total, 10),
      })),
    },
  })
}))

/**
 * GET /api/usage/top-resources
 *
 * Get top used resources.
 * CRITICAL: Returns counts only, no user breakdown.
 */
usageRouter.get('/top-resources', requireRole('TENANT_ADMIN', 'TEAM_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.tenantId!
  const { period = '7d', limit = '10', resource_type } = req.query

  const startDate = new Date()
  switch (period) {
    case '24h':
      startDate.setHours(startDate.getHours() - 24)
      break
    case '7d':
      startDate.setDate(startDate.getDate() - 7)
      break
    case '30d':
      startDate.setDate(startDate.getDate() - 30)
      break
  }

  const params: (string | Date | number)[] = [tenant_id, startDate, parseInt(limit as string, 10)]
  let whereClause = '"tenant_id" = $1 AND "bucket_timestamp" >= $2'

  if (resource_type) {
    whereClause += ' AND "resource_type" = $4'
    params.push(resource_type as string)
  }

  const result = await query(
    `SELECT "resource_type", "resource_id", SUM("count") as total
     FROM usage_events
     WHERE ${whereClause}
     GROUP BY "resource_type", "resource_id"
     ORDER BY total DESC
     LIMIT $3`,
    params
  )

  // CRITICAL: Response contains count only, no users field
  const topResourceRows = result.rows as Array<{ resource_type: string; resource_id: string; total: string }>
  res.json({
    data: topResourceRows.map((r) => ({
      resource_type: r.resource_type,
      resource_id: r.resource_id,
      count: parseInt(r.total, 10),
      // NO users field - this is intentional
    })),
  })
}))

/**
 * GET /api/usage/settings
 *
 * Get tenant usage settings including events_enabled state.
 */
usageRouter.get('/settings', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.tenantId!

  const result = await query(
    'SELECT "events_enabled" FROM tenant_settings WHERE "tenant_id" = $1',
    [tenant_id]
  )

  res.json({
    data: {
      eventsEnabled: result.rows[0]?.events_enabled ?? false,
    },
  })
}))

/**
 * PUT /api/usage/settings
 *
 * Update tenant usage settings.
 */
usageRouter.put('/settings', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenant_id = req.tenantId!
  // Accept either camelCase (frontend convention) or snake_case (legacy).
  const events_enabled = req.body?.eventsEnabled ?? req.body?.events_enabled

  if (typeof events_enabled !== 'boolean') {
    throw ApiError.badRequest('eventsEnabled must be a boolean')
  }

  await query(
    `INSERT INTO tenant_settings (id, tenant_id, events_enabled, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
     ON CONFLICT (tenant_id)
     DO UPDATE SET events_enabled = $2, updated_at = NOW()`,
    [tenant_id, events_enabled]
  )

  res.json({
    data: {
      eventsEnabled: events_enabled,
    },
  })
}))
