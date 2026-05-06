/**
 * MCP Server Service
 *
 * Business logic for MCP server registry operations.
 */

import { prisma } from "@oppmon/database";
import type { SkillScope } from "@oppmon/database";
import { createHash } from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface McpServer {
  id: string;
  tenantId: string;
  teamId: string | null;
  name: string;
  description: string | null;
  command: string;
  args: string[];
  env: Record<string, string>;
  version: string;
  sha256: string;
  scope: SkillScope;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateMcpServerInput {
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  version?: string;
  scope: SkillScope;
  teamId?: string | null;
  enabled?: boolean;
}

export interface UpdateMcpServerInput {
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  version?: string;
  scope?: SkillScope;
  teamId?: string | null;
  enabled?: boolean;
}

export interface McpServerFilter {
  tenantId: string;
  teamIds: string[];
  scope?: SkillScope;
  search?: string;
  enabled?: boolean;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Calculate SHA256 hash of MCP server configuration
 */
function hashConfig(config: {
  command: string;
  args: string[];
  env: Record<string, string>;
  version: string;
}): string {
  const content = JSON.stringify({
    command: config.command,
    args: config.args,
    env: config.env,
    version: config.version,
  });
  return createHash("sha256").update(content).digest("hex");
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * List MCP servers with filters
 */
export async function listMcpServers(
  filter: McpServerFilter,
  options: PaginationOptions = {}
): Promise<{ servers: McpServer[]; total: number; limit: number; offset: number }> {
  const { limit = 50, offset = 0 } = options;

  // Build the base scope filter
  const scopeFilter = [
    { scope: "TENANT" as const },
    { scope: "TEAM" as const, teamId: { in: filter.teamIds } },
  ];

  const where: Record<string, unknown> = {
    tenantId: filter.tenantId,
    deletedAt: null,
  };

  if (filter.scope) {
    where.scope = filter.scope;
  }

  if (filter.enabled !== undefined) {
    where.enabled = filter.enabled;
  }

  // Combine scope filter with search filter using AND
  if (filter.search) {
    where.AND = [
      { OR: scopeFilter },
      {
        OR: [
          { name: { contains: filter.search, mode: "insensitive" } },
          { description: { contains: filter.search, mode: "insensitive" } },
        ],
      },
    ];
  } else {
    where.OR = scopeFilter;
  }

  const [servers, total] = await Promise.all([
    prisma.mcpServer.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
      skip: offset,
    }),
    prisma.mcpServer.count({ where }),
  ]);

  return {
    servers: servers.map((s) => ({
      ...s,
      env: s.env as Record<string, string>,
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Get a single MCP server by ID
 */
export async function getMcpServer(
  id: string,
  access: { tenantId: string; teamIds: string[] }
): Promise<McpServer | null> {
  const server = await prisma.mcpServer.findFirst({
    where: {
      id,
      tenantId: access.tenantId,
      deletedAt: null,
      OR: [
        { scope: "TENANT" },
        { scope: "TEAM", teamId: { in: access.teamIds } },
      ],
    },
  });

  if (!server) return null;

  return {
    ...server,
    env: server.env as Record<string, string>,
  };
}

/**
 * Get MCP server by name
 */
export async function getMcpServerByName(
  tenantId: string,
  name: string
): Promise<McpServer | null> {
  const server = await prisma.mcpServer.findFirst({
    where: {
      tenantId,
      name,
      deletedAt: null,
    },
  });

  if (!server) return null;

  return {
    ...server,
    env: server.env as Record<string, string>,
  };
}

/**
 * Create a new MCP server
 */
export async function createMcpServer(
  tenantId: string,
  input: CreateMcpServerInput
): Promise<McpServer> {
  const args = input.args || [];
  const env = input.env || {};
  const version = input.version || "1.0.0";

  const sha256 = hashConfig({
    command: input.command,
    args,
    env,
    version,
  });

  const server = await prisma.mcpServer.create({
    data: {
      tenantId,
      teamId: input.scope === "TEAM" ? input.teamId : null,
      name: input.name,
      description: input.description,
      command: input.command,
      args,
      env,
      version,
      sha256,
      scope: input.scope,
      enabled: input.enabled ?? true,
    },
  });

  return {
    ...server,
    env: server.env as Record<string, string>,
  };
}

/**
 * Update an existing MCP server
 */
export async function updateMcpServer(
  id: string,
  input: UpdateMcpServerInput
): Promise<{ server: McpServer; beforeState: McpServer }> {
  const existing = await prisma.mcpServer.findUnique({
    where: { id },
  });

  if (!existing || existing.deletedAt) {
    throw new Error("MCP server not found");
  }

  const beforeState: McpServer = {
    ...existing,
    env: existing.env as Record<string, string>,
  };

  // Calculate new hash if config changed
  const command = input.command ?? existing.command;
  const args = input.args ?? existing.args;
  const env = (input.env ?? existing.env) as Record<string, string>;
  const version = input.version ?? existing.version;

  const sha256 = hashConfig({ command, args, env, version });

  const server = await prisma.mcpServer.update({
    where: { id },
    data: {
      description: input.description,
      command: input.command,
      args: input.args,
      env: input.env,
      version: input.version,
      sha256,
      scope: input.scope,
      teamId: input.scope === "TEAM" ? input.teamId : null,
      enabled: input.enabled,
    },
  });

  return {
    server: {
      ...server,
      env: server.env as Record<string, string>,
    },
    beforeState,
  };
}

/**
 * Soft delete an MCP server
 */
export async function deleteMcpServer(
  id: string
): Promise<{ server: McpServer; beforeState: McpServer }> {
  const existing = await prisma.mcpServer.findUnique({
    where: { id },
  });

  if (!existing || existing.deletedAt) {
    throw new Error("MCP server not found");
  }

  const beforeState: McpServer = {
    ...existing,
    env: existing.env as Record<string, string>,
  };

  const server = await prisma.mcpServer.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return {
    server: {
      ...server,
      env: server.env as Record<string, string>,
    },
    beforeState,
  };
}

/**
 * Toggle MCP server enabled status
 */
export async function toggleMcpServer(
  id: string,
  enabled: boolean
): Promise<McpServer> {
  const server = await prisma.mcpServer.update({
    where: { id },
    data: { enabled },
  });

  return {
    ...server,
    env: server.env as Record<string, string>,
  };
}
