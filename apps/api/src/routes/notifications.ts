import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';

export const notificationsRouter = Router();

/**
 * GET /api/notifications
 * List notifications for the current user
 */
notificationsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { unreadOnly, limit = 50, offset = 0 } = req.query;

  let whereClause = 'WHERE user_id = $1 AND tenant_id = $2';
  const params: unknown[] = [req.userId, req.tenantId];

  if (unreadOnly === 'true') {
    whereClause += ' AND read_at IS NULL';
  }

  const result = await query(`
    SELECT * FROM notifications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $3 OFFSET $4
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM notifications ${whereClause}
  `, params);

  const unreadCount = await query(`
    SELECT COUNT(*) as unread FROM notifications
    WHERE user_id = $1 AND tenant_id = $2 AND read_at IS NULL
  `, [req.userId, req.tenantId]);

  res.json({
    data: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    unread: parseInt(unreadCount.rows[0].unread, 10),
    limit: Number(limit),
    offset: Number(offset),
  });
}));

/**
 * POST /api/notifications/mark-read
 * Mark notifications as read
 */
notificationsRouter.post('/mark-read', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { notificationIds, all } = req.body;

  if (all) {
    await query(`
      UPDATE notifications SET read_at = NOW()
      WHERE user_id = $1 AND tenant_id = $2 AND read_at IS NULL
    `, [req.userId, req.tenantId]);
  } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    await query(`
      UPDATE notifications SET read_at = NOW()
      WHERE id = ANY($1) AND user_id = $2 AND tenant_id = $3
    `, [notificationIds, req.userId, req.tenantId]);
  } else {
    throw ApiError.badRequest('Either notificationIds or all=true is required');
  }

  res.json({ success: true });
}));

/**
 * GET /api/notifications/preferences
 * Get notification preferences
 */
notificationsRouter.get('/preferences', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    SELECT * FROM notification_preferences
    WHERE user_id = $1 AND tenant_id = $2
  `, [req.userId, req.tenantId]);

  if (result.rows.length === 0) {
    // Return defaults
    res.json({
      email: true,
      push: true,
      slack: false,
      incidents: true,
      budgetAlerts: true,
      securityAlerts: true,
      weeklyDigest: true,
    });
    return;
  }

  res.json(result.rows[0].preferences);
}));

const preferencesSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  slack: z.boolean().optional(),
  incidents: z.boolean().optional(),
  budgetAlerts: z.boolean().optional(),
  securityAlerts: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
});

/**
 * PUT /api/notifications/preferences
 * Update notification preferences
 */
notificationsRouter.put('/preferences', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = preferencesSchema.parse(req.body);

  await query(`
    INSERT INTO notification_preferences (user_id, tenant_id, preferences)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, tenant_id)
    DO UPDATE SET preferences = $3, updated_at = NOW()
  `, [req.userId, req.tenantId, JSON.stringify(data)]);

  res.json(data);
}));

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
notificationsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    DELETE FROM notifications
    WHERE id = $1 AND user_id = $2 AND tenant_id = $3
    RETURNING id
  `, [req.params.id, req.userId, req.tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Notification not found');
  }

  res.status(204).send();
}));

/**
 * POST /api/notifications/test
 * Send a test notification (admin only)
 */
notificationsRouter.post('/test', requireRole('TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { channel, message } = req.body;

  if (!channel || !message) {
    throw ApiError.badRequest('channel and message are required');
  }

  // Create a test notification
  const result = await query(`
    INSERT INTO notifications (user_id, tenant_id, type, title, message, channel)
    VALUES ($1, $2, 'test', 'Test Notification', $3, $4)
    RETURNING *
  `, [req.userId, req.tenantId, message, channel]);

  res.json({
    message: 'Test notification sent',
    notification: result.rows[0],
  });
}));
