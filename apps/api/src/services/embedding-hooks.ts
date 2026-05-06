/**
 * Auto-Embedding Hooks Service
 *
 * Provides automatic embedding generation for entities:
 * - Skills: Embed on create/update, delete on soft delete
 * - Agents: Embed on create/update, delete on status change to deleted
 *
 * Features:
 * - Background embedding (non-blocking)
 * - Content formatting for optimal embedding quality
 * - Metadata extraction for search filtering
 * - Error handling with logging
 * - Re-indexing support
 */

import { pino } from 'pino';
import { embed, deleteSourceEmbeddings, embedBatch } from './embedding.js';
import { prisma } from '@oppmon/database';

const logger = pino({ name: 'embedding-hooks' });

// ============================================================================
// Configuration
// ============================================================================

/**
 * Whether auto-embedding is enabled
 */
export function isAutoEmbeddingEnabled(): boolean {
  return process.env.AUTO_EMBEDDING_ENABLED !== 'false';
}

/**
 * Supported source types for auto-embedding
 */
export const EMBEDDABLE_TYPES = ['skill', 'agent'] as const;
export type EmbeddableType = typeof EMBEDDABLE_TYPES[number];

// ============================================================================
// Content Formatters
// ============================================================================

/**
 * Format skill data for embedding
 * Creates a rich text representation that captures semantic meaning
 */
export function formatSkillContent(skill: {
  name: string;
  description?: string | null;
  content: string;
  scope: string;
  version: number;
}): string {
  const parts: string[] = [];

  // Add skill name and description for context
  parts.push(`Skill: ${skill.name}`);
  if (skill.description) {
    parts.push(`Description: ${skill.description}`);
  }
  parts.push(`Scope: ${skill.scope}`);
  parts.push(`Version: ${skill.version}`);

  // Add the main content
  parts.push('');
  parts.push('Content:');
  parts.push(skill.content);

  return parts.join('\n');
}

/**
 * Extract metadata from skill for embedding
 */
export function extractSkillMetadata(skill: {
  id: string;
  name: string;
  scope: string;
  version: number;
  teamId?: string | null;
}): Record<string, unknown> {
  return {
    name: skill.name,
    scope: skill.scope,
    version: skill.version,
    teamId: skill.teamId,
  };
}

/**
 * Format agent data for embedding
 */
export function formatAgentContent(agent: {
  name: string;
  description?: string | null;
  framework?: string;
  status?: string;
  config?: Record<string, unknown>;
}): string {
  const parts: string[] = [];

  parts.push(`Agent: ${agent.name}`);
  if (agent.description) {
    parts.push(`Description: ${agent.description}`);
  }
  if (agent.framework) {
    parts.push(`Framework: ${agent.framework}`);
  }
  if (agent.status) {
    parts.push(`Status: ${agent.status}`);
  }

  // Include relevant config keys (avoid sensitive data)
  if (agent.config) {
    const safeConfigKeys = ['type', 'version', 'capabilities', 'model'];
    const configInfo = Object.entries(agent.config)
      .filter(([key]) => safeConfigKeys.includes(key))
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ');
    if (configInfo) {
      parts.push(`Config: ${configInfo}`);
    }
  }

  return parts.join('\n');
}

/**
 * Extract metadata from agent for embedding
 */
export function extractAgentMetadata(agent: {
  id: string;
  name: string;
  framework?: string;
  status?: string;
  teamId?: string | null;
}): Record<string, unknown> {
  return {
    name: agent.name,
    framework: agent.framework,
    status: agent.status,
    teamId: agent.teamId,
  };
}

// ============================================================================
// Embedding Hooks
// ============================================================================

/**
 * Embed a skill (call after create or update)
 * Runs in background to not block the main operation
 */
export async function embedSkill(
  tenantId: string,
  skill: {
    id: string;
    name: string;
    description?: string | null;
    content: string;
    scope: string;
    version: number;
    teamId?: string | null;
  },
  options: { blocking?: boolean } = {}
): Promise<void> {
  if (!isAutoEmbeddingEnabled()) {
    logger.debug({ skillId: skill.id }, 'Auto-embedding disabled, skipping skill');
    return;
  }

  const doEmbed = async () => {
    try {
      const content = formatSkillContent(skill);
      const metadata = extractSkillMetadata(skill);

      await embed(tenantId, {
        content,
        sourceType: 'skill',
        sourceId: skill.id,
        metadata,
        skipIfExists: false, // Always update on content change
      });

      logger.info({ skillId: skill.id, name: skill.name }, 'Skill embedded successfully');
    } catch (error) {
      logger.error({ error, skillId: skill.id }, 'Failed to embed skill');
      // Don't throw - embedding failure shouldn't break the main operation
    }
  };

  if (options.blocking) {
    await doEmbed();
  } else {
    // Run in background
    setImmediate(() => {
      doEmbed().catch((error) => {
        logger.error({ error, skillId: skill.id }, 'Background skill embedding failed');
      });
    });
  }
}

/**
 * Delete skill embedding (call after soft delete)
 */
export async function deleteSkillEmbedding(
  tenantId: string,
  skillId: string,
  options: { blocking?: boolean } = {}
): Promise<void> {
  const doDelete = async () => {
    try {
      const deleted = await deleteSourceEmbeddings(tenantId, 'skill', skillId);
      logger.info({ skillId, deletedCount: deleted }, 'Skill embedding deleted');
    } catch (error) {
      logger.error({ error, skillId }, 'Failed to delete skill embedding');
    }
  };

  if (options.blocking) {
    await doDelete();
  } else {
    setImmediate(() => {
      doDelete().catch((error) => {
        logger.error({ error, skillId }, 'Background skill embedding deletion failed');
      });
    });
  }
}

/**
 * Embed an agent (call after create or update)
 */
export async function embedAgent(
  tenantId: string,
  agent: {
    id: string;
    name: string;
    description?: string | null;
    framework?: string;
    status?: string;
    config?: Record<string, unknown>;
    teamId?: string | null;
  },
  options: { blocking?: boolean } = {}
): Promise<void> {
  if (!isAutoEmbeddingEnabled()) {
    logger.debug({ agentId: agent.id }, 'Auto-embedding disabled, skipping agent');
    return;
  }

  const doEmbed = async () => {
    try {
      const content = formatAgentContent(agent);
      const metadata = extractAgentMetadata(agent);

      await embed(tenantId, {
        content,
        sourceType: 'agent',
        sourceId: agent.id,
        metadata,
        skipIfExists: false,
      });

      logger.info({ agentId: agent.id, name: agent.name }, 'Agent embedded successfully');
    } catch (error) {
      logger.error({ error, agentId: agent.id }, 'Failed to embed agent');
    }
  };

  if (options.blocking) {
    await doEmbed();
  } else {
    setImmediate(() => {
      doEmbed().catch((error) => {
        logger.error({ error, agentId: agent.id }, 'Background agent embedding failed');
      });
    });
  }
}

/**
 * Delete agent embedding (call after deletion)
 */
export async function deleteAgentEmbedding(
  tenantId: string,
  agentId: string,
  options: { blocking?: boolean } = {}
): Promise<void> {
  const doDelete = async () => {
    try {
      const deleted = await deleteSourceEmbeddings(tenantId, 'agent', agentId);
      logger.info({ agentId, deletedCount: deleted }, 'Agent embedding deleted');
    } catch (error) {
      logger.error({ error, agentId }, 'Failed to delete agent embedding');
    }
  };

  if (options.blocking) {
    await doDelete();
  } else {
    setImmediate(() => {
      doDelete().catch((error) => {
        logger.error({ error, agentId }, 'Background agent embedding deletion failed');
      });
    });
  }
}

// ============================================================================
// Re-indexing Functions
// ============================================================================

export interface ReindexResult {
  total: number;
  processed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

/**
 * Re-index all skills for a tenant
 */
export async function reindexAllSkills(
  tenantId: string,
  options: { batchSize?: number; dryRun?: boolean } = {}
): Promise<ReindexResult> {
  const { batchSize = 50, dryRun = false } = options;
  const result: ReindexResult = { total: 0, processed: 0, failed: 0, errors: [] };

  // Count total skills
  result.total = await prisma.skill.count({
    where: { tenantId, deletedAt: null },
  });

  if (dryRun) {
    logger.info({ tenantId, total: result.total }, 'Dry run: would reindex skills');
    return result;
  }

  let offset = 0;

  while (true) {
    const skills = await prisma.skill.findMany({
      where: { tenantId, deletedAt: null },
      take: batchSize,
      skip: offset,
      select: {
        id: true,
        name: true,
        description: true,
        content: true,
        scope: true,
        version: true,
        teamId: true,
      },
    });

    if (skills.length === 0) break;

    // Prepare batch items
    const items = skills.map((skill) => ({
      content: formatSkillContent(skill),
      sourceType: 'skill',
      sourceId: skill.id,
      metadata: extractSkillMetadata(skill),
    }));

    try {
      await embedBatch(tenantId, {
        items,
        skipIfExists: false, // Force re-embed
      });
      result.processed += skills.length;
    } catch (error) {
      // Try individual embedding for failed batch
      for (const skill of skills) {
        try {
          await embedSkill(tenantId, skill, { blocking: true });
          result.processed++;
        } catch (individualError) {
          result.failed++;
          result.errors.push({
            id: skill.id,
            error: individualError instanceof Error ? individualError.message : String(individualError),
          });
        }
      }
    }

    offset += batchSize;
    logger.info(
      { tenantId, processed: result.processed, total: result.total },
      'Skills reindex progress'
    );
  }

  logger.info(
    { tenantId, ...result },
    'Skills reindex completed'
  );

  return result;
}

/**
 * Re-index all agents for a tenant
 */
export async function reindexAllAgents(
  tenantId: string,
  options: { batchSize?: number; dryRun?: boolean } = {}
): Promise<ReindexResult> {
  const { batchSize = 50, dryRun = false } = options;
  const result: ReindexResult = { total: 0, processed: 0, failed: 0, errors: [] };

  // Count total active agents
  result.total = await prisma.agent.count({
    where: { tenantId, status: { not: 'INACTIVE' } },
  });

  if (dryRun) {
    logger.info({ tenantId, total: result.total }, 'Dry run: would reindex agents');
    return result;
  }

  let offset = 0;

  while (true) {
    const agents = await prisma.agent.findMany({
      where: { tenantId, status: { not: 'INACTIVE' } },
      take: batchSize,
      skip: offset,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        config: true,
        teamId: true,
      },
    });

    if (agents.length === 0) break;

    // Prepare batch items
    const items = agents.map((agent) => ({
      content: formatAgentContent({
        ...agent,
        config: agent.config as Record<string, unknown>,
      }),
      sourceType: 'agent',
      sourceId: agent.id,
      metadata: extractAgentMetadata({
        ...agent,
        status: agent.status,
      }),
    }));

    try {
      await embedBatch(tenantId, {
        items,
        skipIfExists: false,
      });
      result.processed += agents.length;
    } catch (error) {
      // Try individual embedding for failed batch
      for (const agent of agents) {
        try {
          await embedAgent(
            tenantId,
            { ...agent, config: agent.config as Record<string, unknown> },
            { blocking: true }
          );
          result.processed++;
        } catch (individualError) {
          result.failed++;
          result.errors.push({
            id: agent.id,
            error: individualError instanceof Error ? individualError.message : String(individualError),
          });
        }
      }
    }

    offset += batchSize;
    logger.info(
      { tenantId, processed: result.processed, total: result.total },
      'Agents reindex progress'
    );
  }

  logger.info(
    { tenantId, ...result },
    'Agents reindex completed'
  );

  return result;
}

/**
 * Re-index all embeddable content for a tenant
 */
export async function reindexAll(
  tenantId: string,
  options: { batchSize?: number; dryRun?: boolean; types?: EmbeddableType[] } = {}
): Promise<Record<EmbeddableType, ReindexResult>> {
  const types = options.types || [...EMBEDDABLE_TYPES];
  const results: Record<string, ReindexResult> = {};

  for (const type of types) {
    logger.info({ tenantId, type }, `Starting reindex for ${type}`);

    switch (type) {
      case 'skill':
        results.skill = await reindexAllSkills(tenantId, options);
        break;
      case 'agent':
        results.agent = await reindexAllAgents(tenantId, options);
        break;
    }
  }

  return results as Record<EmbeddableType, ReindexResult>;
}

// ============================================================================
// Status Functions
// ============================================================================

export interface EmbeddingStatus {
  sourceType: string;
  sourceId: string;
  hasEmbedding: boolean;
  embeddingId?: string;
  lastUpdated?: Date;
  contentHash?: string;
}

/**
 * Check embedding status for a specific entity
 */
export async function getEmbeddingStatus(
  tenantId: string,
  sourceType: string,
  sourceId: string
): Promise<EmbeddingStatus> {
  const embedding = await prisma.embedding.findFirst({
    where: { tenantId, sourceType, sourceId },
    select: {
      id: true,
      updatedAt: true,
      contentHash: true,
    },
  });

  return {
    sourceType,
    sourceId,
    hasEmbedding: !!embedding,
    embeddingId: embedding?.id,
    lastUpdated: embedding?.updatedAt,
    contentHash: embedding?.contentHash,
  };
}

/**
 * Get embedding coverage statistics
 */
export async function getEmbeddingCoverage(tenantId: string): Promise<{
  skills: { total: number; embedded: number; coverage: number };
  agents: { total: number; embedded: number; coverage: number };
}> {
  // Count skills
  const totalSkills = await prisma.skill.count({
    where: { tenantId, deletedAt: null },
  });

  const embeddedSkills = await prisma.embedding.count({
    where: { tenantId, sourceType: 'skill' },
  });

  // Count agents
  const totalAgents = await prisma.agent.count({
    where: { tenantId, status: { not: 'INACTIVE' } },
  });

  const embeddedAgents = await prisma.embedding.count({
    where: { tenantId, sourceType: 'agent' },
  });

  return {
    skills: {
      total: totalSkills,
      embedded: embeddedSkills,
      coverage: totalSkills > 0 ? (embeddedSkills / totalSkills) * 100 : 0,
    },
    agents: {
      total: totalAgents,
      embedded: embeddedAgents,
      coverage: totalAgents > 0 ? (embeddedAgents / totalAgents) * 100 : 0,
    },
  };
}
