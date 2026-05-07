import { Router, Response } from 'express';
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';
import { bumpTokenVersion } from '../lib/token-version.js';

export const teamsRouter = Router();

// All teams routes require admin role
teamsRouter.use(requireRole('TENANT_ADMIN'));

/**
 * GET /api/admin/teams
 * List all teams for the tenant
 *
 * NOTE: Database columns are snake_case per Prisma @map() directives.
 * RETURNING aliases preserve camelCase for API response shape.
 */
teamsRouter.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { search, limit = '10', offset = '0' } = req.query;

  let whereClause = 'WHERE t.tenant_id = $1';
  const params: unknown[] = [req.tenantId];

  if (search) {
    params.push(`%${search}%`);
    whereClause += ` AND t.name ILIKE $${params.length}`;
  }

  // Get total count
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM teams t ${whereClause}`,
    params
  );

  // Get teams with member count
  const result = await query(`
    SELECT
      t.id,
      t.name,
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as "memberCount"
    FROM teams t
    ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, parseInt(limit as string), parseInt(offset as string)]);

  res.json({
    data: result.rows,
    meta: {
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    },
  });
}));

/**
 * GET /api/admin/teams/:id
 * Get a single team with members
 */
teamsRouter.get('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const result = await query(`
    SELECT
      t.id,
      t.name,
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM teams t
    WHERE t.id = $1 AND t.tenant_id = $2
  `, [id, req.tenantId]);

  if (result.rows.length === 0) {
    throw new ApiError(404, 'Team not found');
  }

  // Get members
  const membersResult = await query(`
    SELECT
      tm.id,
      tm.user_id AS "userId",
      tm.role,
      tm.created_at AS "createdAt",
      u.email,
      u.name as "userName"
    FROM team_members tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.team_id = $1
    ORDER BY tm.created_at DESC
  `, [id]);

  res.json({
    data: {
      ...result.rows[0],
      members: membersResult.rows,
    },
  });
}));

const createTeamSchema = z.object({
  name: z.string().min(1).max(255),
});

/**
 * POST /api/admin/teams
 * Create a new team
 */
teamsRouter.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = createTeamSchema.parse(req.body);

  // Check if team name already exists for this tenant
  const existing = await query(
    'SELECT id FROM teams WHERE tenant_id = $1 AND name = $2',
    [req.tenantId, data.name]
  );

  if (existing.rows.length > 0) {
    throw new ApiError(400, 'A team with this name already exists');
  }

  const teamId = createId();
  const now = new Date();
  const result = await query(`
    INSERT INTO teams (id, name, tenant_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, name, created_at AS "createdAt", updated_at AS "updatedAt"
  `, [teamId, data.name, req.tenantId, now, now]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'team.create',
    targetType: 'team',
    targetId: result.rows[0].id,
    newValue: result.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ data: result.rows[0] });
}));

const updateTeamSchema = z.object({
  name: z.string().min(1).max(255),
});

/**
 * PUT /api/admin/teams/:id
 * Update a team
 */
teamsRouter.put('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = updateTeamSchema.parse(req.body);

  // Check if team exists
  const existing = await query(
    'SELECT * FROM teams WHERE id = $1 AND tenant_id = $2',
    [id, req.tenantId]
  );

  if (existing.rows.length === 0) {
    throw new ApiError(404, 'Team not found');
  }

  // Check if new name conflicts with another team
  const conflict = await query(
    'SELECT id FROM teams WHERE tenant_id = $1 AND name = $2 AND id != $3',
    [req.tenantId, data.name, id]
  );

  if (conflict.rows.length > 0) {
    throw new ApiError(400, 'A team with this name already exists');
  }

  const result = await query(`
    UPDATE teams
    SET name = $1, updated_at = NOW()
    WHERE id = $2 AND tenant_id = $3
    RETURNING id, name, created_at AS "createdAt", updated_at AS "updatedAt"
  `, [data.name, id, req.tenantId]);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'team.update',
    targetType: 'team',
    targetId: id,
    oldValue: existing.rows[0],
    newValue: result.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({ data: result.rows[0] });
}));

/**
 * DELETE /api/admin/teams/:id
 * Delete a team
 */
teamsRouter.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const existing = await query(
    'SELECT * FROM teams WHERE id = $1 AND tenant_id = $2',
    [id, req.tenantId]
  );

  if (existing.rows.length === 0) {
    throw new ApiError(404, 'Team not found');
  }

  // Capture members BEFORE the cascade so we can revoke their JWTs.
  // Team membership influences authorization (canAccess team-scoped resources),
  // so deleting the team must invalidate every member's outstanding tokens.
  const memberRows = await query<{ user_id: string }>(
    'SELECT user_id FROM team_members WHERE team_id = $1',
    [id],
  );

  await query('DELETE FROM teams WHERE id = $1', [id]);

  await Promise.all(
    memberRows.rows.map((m) => bumpTokenVersion(m.user_id)),
  );

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'team.delete',
    targetType: 'team',
    targetId: id,
    oldValue: existing.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(204).send();
}));

const addMemberSchema = z.object({
  userId: z.string(),
  role: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
});

/**
 * POST /api/admin/teams/:id/members
 * Add a member to a team
 */
teamsRouter.post('/:id/members', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const data = addMemberSchema.parse(req.body);

  // Check team exists
  const team = await query(
    'SELECT id FROM teams WHERE id = $1 AND tenant_id = $2',
    [id, req.tenantId]
  );

  if (team.rows.length === 0) {
    throw new ApiError(404, 'Team not found');
  }

  // Check user exists and belongs to same tenant
  const user = await query(
    'SELECT id, email FROM users WHERE id = $1 AND tenant_id = $2',
    [data.userId, req.tenantId]
  );

  if (user.rows.length === 0) {
    throw new ApiError(404, 'User not found');
  }

  // Check if already a member
  const existing = await query(
    'SELECT id FROM team_members WHERE team_id = $1 AND user_id = $2',
    [id, data.userId]
  );

  if (existing.rows.length > 0) {
    throw new ApiError(400, 'User is already a member of this team');
  }

  const memberId = createId();
  const result = await query(`
    INSERT INTO team_members (id, team_id, user_id, role, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING id, user_id AS "userId", role, created_at AS "createdAt"
  `, [memberId, id, data.userId, data.role]);

  // Membership change ⇒ this user's authorization surface changed. Bump their
  // token version so any outstanding JWTs are rejected on next request.
  await bumpTokenVersion(data.userId);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'team.member.add',
    targetType: 'team_member',
    targetId: result.rows[0].id,
    newValue: { teamId: id, ...result.rows[0] },
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ data: result.rows[0] });
}));

/**
 * DELETE /api/admin/teams/:id/members/:memberId
 * Remove a member from a team
 */
teamsRouter.delete('/:id/members/:memberId', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { id, memberId } = req.params;

  // Check team exists
  const team = await query(
    'SELECT id FROM teams WHERE id = $1 AND tenant_id = $2',
    [id, req.tenantId]
  );

  if (team.rows.length === 0) {
    throw new ApiError(404, 'Team not found');
  }

  const existing = await query(
    'SELECT * FROM team_members WHERE id = $1 AND team_id = $2',
    [memberId, id]
  );

  if (existing.rows.length === 0) {
    throw new ApiError(404, 'Team member not found');
  }

  await query('DELETE FROM team_members WHERE id = $1', [memberId]);

  // Membership change ⇒ user's authorization surface shrank. Force JWT
  // rotation so cached team-share grants don't outlive the membership.
  await bumpTokenVersion(existing.rows[0].user_id);

  logAudit({
    actorType: 'user',
    actorId: req.userId,
    action: 'team.member.remove',
    targetType: 'team_member',
    targetId: memberId,
    oldValue: existing.rows[0],
    tenantId: req.tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(204).send();
}));
