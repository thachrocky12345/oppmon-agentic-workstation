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
async function isEventsEnabled(tenantId: string): Promise<boolean> {
  const result = await query(
    'SELECT "eventsEnabled" FROM tenant_settings WHERE "tenantId" = $1',
    [tenantId]
  )
  // Default to false if no settings exist (privacy by default)
  return result.rows[0]?.eventsEnabled ?? false
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
    const tenantId = req.tenantId

    // Graceful degradation: if not authenticated, just return 204
    if (!tenantId) {
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
    const enabled = await isEventsEnabled(tenantId)
    if (!enabled) {
      // Discard event silently - return 204 to hide state
      return res.status(204).send()
    }

    // Calculate bucket timestamp
    const eventTime = event.timestamp ? new Date(event.timestamp) : new Date()
    const bucketTimestamp = getBucketTimestamp(eventTime)

    // Upsert into bucket (increment count if exists)
    await query(
      `INSERT INTO usage_events ("id", "tenantId", "resourceType", "resourceId", "action", "bucketTimestamp", "count", "metadata", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1, $6, NOW())
       ON CONFLICT ("tenantId", "resourceType", "resourceId", "action", "bucketTimestamp")
       DO UPDATE SET "count" = usage_events."count" + 1`,
      [
        tenantId,
        event.resource_type,
        event.resource_id,
        event.action,
        bucketTimestamp,
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
    const tenantId = req.tenantId

    // Graceful degradation: if not authenticated, just return 204
    if (!tenantId) {
      return res.status(204).send()
    }

    const parseResult = batchEventSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(204).send()
    }

    const enabled = await isEventsEnabled(tenantId)
    if (!enabled) {
      return res.status(204).send()
    }

    const { events } = parseResult.data

    // Process events in parallel
    await Promise.all(
      events.map(async (event) => {
        const eventTime = event.timestamp ? new Date(event.timestamp) : new Date()
        const bucketTimestamp = getBucketTimestamp(eventTime)

        try {
          await query(
            `INSERT INTO usage_events ("id", "tenantId", "resourceType", "resourceId", "action", "bucketTimestamp", "count", "metadata", "createdAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 1, $6, NOW())
             ON CONFLICT ("tenantId", "resourceType", "resourceId", "action", "bucketTimestamp")
             DO UPDATE SET "count" = usage_events."count" + 1`,
            [
              tenantId,
              event.resource_type,
              event.resource_id,
              event.action,
              bucketTimestamp,
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
  const tenantId = req.tenantId!
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
    `SELECT "bucketTimestamp", SUM("count") as total
     FROM usage_events
     WHERE "tenantId" = $1 AND "bucketTimestamp" >= $2
     GROUP BY "bucketTimestamp"
     ORDER BY "bucketTimestamp" ASC`,
    [tenantId, startDate]
  )

  // Get breakdown by resource type
  const byResourceTypeResult = await query(
    `SELECT "resourceType", SUM("count") as total
     FROM usage_events
     WHERE "tenantId" = $1 AND "bucketTimestamp" >= $2
     GROUP BY "resourceType"`,
    [tenantId, startDate]
  )

  // Get breakdown by action
  const byActionResult = await query(
    `SELECT "action", SUM("count") as total
     FROM usage_events
     WHERE "tenantId" = $1 AND "bucketTimestamp" >= $2
     GROUP BY "action"`,
    [tenantId, startDate]
  )

  // Calculate totals
  const timeSeriesRows = timeSeriesResult.rows as Array<{ bucketTimestamp: Date; total: string }>
  const byResourceTypeRows = byResourceTypeResult.rows as Array<{ resourceType: string; total: string }>
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
        timestamp: bucket.bucketTimestamp,
        count: parseInt(bucket.total, 10),
      })),
      byResourceType: byResourceTypeRows.map((rt) => ({
        resourceType: rt.resourceType,
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
  const tenantId = req.tenantId!
  const { period = '7d', limit = '10', resourceType } = req.query

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

  const params: (string | Date | number)[] = [tenantId, startDate, parseInt(limit as string, 10)]
  let whereClause = '"tenantId" = $1 AND "bucketTimestamp" >= $2'

  if (resourceType) {
    whereClause += ' AND "resourceType" = $4'
    params.push(resourceType as string)
  }

  const result = await query(
    `SELECT "resourceType", "resourceId", SUM("count") as total
     FROM usage_events
     WHERE ${whereClause}
     GROUP BY "resourceType", "resourceId"
     ORDER BY total DESC
     LIMIT $3`,
    params
  )

  // CRITICAL: Response contains count only, no users field
  const topResourceRows = result.rows as Array<{ resourceType: string; resourceId: string; total: string }>
  res.json({
    data: topResourceRows.map((r) => ({
      resourceType: r.resourceType,
      resourceId: r.resourceId,
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
  const tenantId = req.tenantId!

  const result = await query(
    'SELECT "eventsEnabled" FROM tenant_settings WHERE "tenantId" = $1',
    [tenantId]
  )

  res.json({
    data: {
      eventsEnabled: result.rows[0]?.eventsEnabled ?? false,
    },
  })
}))

/**
 * PUT /api/usage/settings
 *
 * Update tenant usage settings.
 */
usageRouter.put('/settings', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const tenantId = req.tenantId!
  const { eventsEnabled } = req.body

  if (typeof eventsEnabled !== 'boolean') {
    throw ApiError.badRequest('eventsEnabled must be a boolean')
  }

  await query(
    `INSERT INTO tenant_settings ("id", "tenantId", "eventsEnabled", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
     ON CONFLICT ("tenantId")
     DO UPDATE SET "eventsEnabled" = $2, "updatedAt" = NOW()`,
    [tenantId, eventsEnabled]
  )

  res.json({
    data: {
      eventsEnabled,
    },
  })
}))
