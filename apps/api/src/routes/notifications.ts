import { Router, Response } from 'express';
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';

export const notificationsRouter = Router();

/**
 * Notifications Routes
 *
 * NOTE: notifications schema only has:
 *   id, user_id, type, title, message, is_read, created_at
 * There is no tenant_id, read_at, channel, or updated_at column.
 * Tenant scoping is enforced via user_id ownership.
 *
 * NOTE: notification_preferences table does not exist; preferences endpoints
 * return defaults / 501 until that table is added.
 */

/**
 * GET /api/notifications
 * List notifications for the current user
 */
notificationsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { unreadOnly, limit = 50, offset = 0 } = req.query;

  let whereClause = 'WHERE user_id = $1';
  const params: unknown[] = [req.userId];

  if (unreadOnly === 'true') {
    whereClause += ' AND is_read = false';
  }

  const result = await query(`
    SELECT
      id,
      user_id   AS "userId",
      type,
      title,
      message,
      is_read   AS "isRead",
      created_at AS "createdAt"
    FROM notifications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM notifications ${whereClause}
  `, params);

  const unreadCount = await query(`
    SELECT COUNT(*) as unread FROM notifications
    WHERE user_id = $1 AND is_read = false
  `, [req.userId]);

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
      UPDATE notifications SET is_read = true
      WHERE user_id = $1 AND is_read = false
    `, [req.userId]);
  } else if (Array.isArray(notificationIds) && notificationIds.length > 0) {
    await query(`
      UPDATE notifications SET is_read = true
      WHERE id = ANY($1) AND user_id = $2
    `, [notificationIds, req.userId]);
  } else {
    throw ApiError.badRequest('Either notificationIds or all=true is required');
  }

  res.json({ success: true });
}));

/**
 * GET /api/notifications/preferences
 * Get notification preferences
 *
 * NOTE: notification_preferences table does not exist. Returns defaults.
 */
notificationsRouter.get('/preferences', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({
    email: true,
    push: true,
    slack: false,
    incidents: true,
    budgetAlerts: true,
    securityAlerts: true,
    weeklyDigest: true,
  });
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
 *
 * NOTE: notification_preferences table does not exist. Returns 501.
 */
notificationsRouter.put('/preferences', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  preferencesSchema.parse(req.body);

  res.status(501).json({
    error: 'Notification preferences not yet implemented',
    message: 'The notification_preferences table is not present in this schema.',
  });
}));

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
notificationsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(`
    DELETE FROM notifications
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `, [req.params.id, req.userId]);

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
  const { message } = req.body;

  if (!message) {
    throw ApiError.badRequest('message is required');
  }

  const id = createId();
  const result = await query(`
    INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
    VALUES ($1, $2, 'test', 'Test Notification', $3, false, NOW())
    RETURNING
      id,
      user_id    AS "userId",
      type,
      title,
      message,
      is_read    AS "isRead",
      created_at AS "createdAt"
  `, [id, req.userId, message]);

  res.json({
    message: 'Test notification sent',
    notification: result.rows[0],
  });
}));
