/**
 * Authorization helper — `canAccess`
 *
 * Single source of truth for "is this user allowed to perform <level> on
 * <resourceType:resourceId>?". Resolution is intentionally explicit:
 *
 *   1. System Tenant user                                  ⇒ allow
 *   2. TENANT_ADMIN of the resource's tenant                ⇒ allow
 *   3. Resource owner (createdById === user.id)             ⇒ allow
 *   4. Member of the resource's team with sufficient role   ⇒ allow
 *   5. Matching ResourceShare row (user OR team grantee)    ⇒ allow
 *   6. Otherwise                                            ⇒ deny
 *
 * Pass the Prisma transaction client from `req.dbTx` so the lookups run
 * inside the same RLS-scoped transaction as the caller's queries. The
 * helper deliberately does NOT swallow errors — let RLS denials bubble up
 * as 0-row reads so callers see "not found" rather than leaking existence.
 */

import type { Prisma } from '@oppmon/database';

type AccessLevel = 'read' | 'write' | 'admin';

const LEVEL_RANK: Record<AccessLevel, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

const TEAM_ROLE_RANK: Record<string, number> = {
  MEMBER: 1,
  ADMIN: 3,
};

/** Caller-provided user context. Mirrors the shape on `req.user`. */
export interface AuthzUser {
  id: string;
  tenantId: string;
  role: string;
  isSystem: boolean;
}

export type ResourceType =
  | 'skill'
  | 'agent'
  | 'model'
  | 'rag_collection'
  | 'mcp_server'
  | 'workflow';

/** Maps logical resource types to the Prisma model + the column that holds the owner/team/tenant. */
interface ResourceMeta {
  /** Model accessor on Prisma.TransactionClient. */
  model:
    | 'skill'
    | 'agent'
    | 'model'
    | 'ragCollection'
    | 'mcpServer'
    | 'workflow';
  /** Column on the model that stores the creator's user id, if any. */
  ownerField?: 'createdById' | 'userId' | 'ownerId';
  /** Column on the model that stores the team id, if any. */
  teamField?: 'teamId';
}

const RESOURCE_META: Record<ResourceType, ResourceMeta> = {
  skill: { model: 'skill', ownerField: 'createdById', teamField: 'teamId' },
  agent: { model: 'agent', ownerField: 'createdById', teamField: 'teamId' },
  model: { model: 'model', ownerField: 'createdById' },
  rag_collection: { model: 'ragCollection', ownerField: 'createdById', teamField: 'teamId' },
  mcp_server: { model: 'mcpServer', ownerField: 'createdById' },
  workflow: { model: 'workflow', ownerField: 'createdById', teamField: 'teamId' },
};

interface ResourceRow {
  tenantId: string;
  createdById?: string | null;
  userId?: string | null;
  ownerId?: string | null;
  teamId?: string | null;
}

/**
 * Decide whether `user` may perform `level` on the given resource.
 * Returns false when the resource doesn't exist or RLS hides it.
 */
export async function canAccess(
  tx: Prisma.TransactionClient,
  user: AuthzUser,
  resourceType: ResourceType,
  resourceId: string,
  level: AccessLevel,
): Promise<boolean> {
  // Step 1 — System Tenant short-circuit.
  if (user.isSystem) return true;

  const meta = RESOURCE_META[resourceType];
  if (!meta) return false;

  // Use $queryRawUnsafe-free path: dynamic dispatch via the typed accessor.
  // The Prisma client's TransactionClient is a union of model accessors;
  // we cast to the minimal shape we need.
  const accessor = (tx as unknown as Record<string, {
    findUnique: (args: { where: { id: string }; select: Record<string, boolean> }) => Promise<ResourceRow | null>;
  }>)[meta.model];

  const select: Record<string, boolean> = { tenantId: true };
  if (meta.ownerField) select[meta.ownerField] = true;
  if (meta.teamField) select[meta.teamField] = true;

  const row = await accessor.findUnique({ where: { id: resourceId }, select });
  if (!row) return false;

  // Step 2 — TENANT_ADMIN of the resource's tenant.
  if (user.role === 'TENANT_ADMIN' && row.tenantId === user.tenantId) {
    return true;
  }

  // Cross-tenant access for non-system users is forbidden regardless of role.
  if (row.tenantId !== user.tenantId) return false;

  // Step 3 — Owner short-circuit.
  const ownerId = meta.ownerField ? row[meta.ownerField] ?? null : null;
  if (ownerId && ownerId === user.id) return true;

  // Step 4 — Team membership with sufficient role.
  const teamId = meta.teamField ? row.teamId ?? null : null;
  if (teamId) {
    const membership = await tx.teamMember.findUnique({
      where: { userId_teamId: { userId: user.id, teamId } },
      select: { role: true },
    });
    if (membership) {
      const teamRank = TEAM_ROLE_RANK[membership.role] ?? 0;
      // Read requires any membership; write/admin require team admin.
      if (level === 'read' && teamRank >= 1) return true;
      if (level !== 'read' && teamRank >= TEAM_ROLE_RANK.ADMIN) return true;
    }
  }

  // Step 5 — Explicit ResourceShare grant.
  const userTeamIds = (
    await tx.teamMember.findMany({
      where: { userId: user.id },
      select: { teamId: true },
    })
  ).map((m) => m.teamId);

  const now = new Date();
  const share = await tx.resourceShare.findFirst({
    where: {
      tenantId: row.tenantId,
      resourceType,
      resourceId,
      OR: [
        { granteeUserId: user.id },
        ...(userTeamIds.length > 0 ? [{ granteeTeamId: { in: userTeamIds } }] : []),
      ],
      AND: [
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      ],
    },
    select: { accessLevel: true },
  });

  if (share) {
    const granted = LEVEL_RANK[share.accessLevel as AccessLevel] ?? 0;
    if (granted >= LEVEL_RANK[level]) return true;
  }

  // Step 6 — Default deny.
  return false;
}
