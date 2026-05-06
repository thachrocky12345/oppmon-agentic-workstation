import { Router, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';

export const toolsRouter = Router();

/**
 * Tools Routes
 *
 * NOTE: The current Prisma schema does not include tables for live agent runs,
 * approvals, commands, command executions, or a scheduled-events calendar
 * (`active_runs`, `approvals`, `commands`, `command_executions`,
 * `scheduled_events`).
 *
 * These endpoints are stubs returning empty data or 501 Not Implemented until
 * the corresponding tables and migrations are added.
 */

// ============================================
// Live Agents
// ============================================

toolsRouter.get('/agents-live', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ data: [], message: 'Live agent runs not yet implemented' });
}));

toolsRouter.get('/agents-live/:id', asyncHandler(async (_req: AuthenticatedRequest, _res: Response) => {
  throw ApiError.notFound('Active run not found');
}));

toolsRouter.post('/agents-live/:id/pause', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Live agent control not yet implemented' });
}));

toolsRouter.post('/agents-live/:id/resume', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Live agent control not yet implemented' });
}));

toolsRouter.post('/agents-live/:id/kill', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Live agent control not yet implemented' });
}));

// ============================================
// Approvals
// ============================================

toolsRouter.get('/approvals', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ data: [], message: 'Approvals not yet implemented' });
}));

toolsRouter.post('/approvals/:id/approve', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Approvals not yet implemented' });
}));

toolsRouter.post('/approvals/:id/deny', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Approvals not yet implemented' });
}));

// ============================================
// Commands
// ============================================

toolsRouter.get('/commands', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ data: [], message: 'Commands registry not yet implemented' });
}));

toolsRouter.post('/commands/:id/execute', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Command execution not yet implemented' });
}));

// ============================================
// Calendar
// ============================================

toolsRouter.get('/calendar', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ data: [], message: 'Scheduled events not yet implemented' });
}));

const scheduleEventSchema = z.object({
  title: z.string().min(1).max(255),
  scheduledAt: z.string().datetime(),
  type: z.enum(['workflow', 'report', 'maintenance', 'other']),
  config: z.record(z.unknown()).optional(),
});

toolsRouter.post('/calendar', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  scheduleEventSchema.parse(req.body);
  res.status(501).json({ error: 'Scheduled events not yet implemented' });
}));

toolsRouter.delete('/calendar/:id', asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
  res.status(501).json({ error: 'Scheduled events not yet implemented' });
}));
