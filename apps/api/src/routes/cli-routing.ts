// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * CLI Routing Config API
 *
 * Provides routing configuration for CLI tools.
 *
 * Endpoints:
 * - GET /api/cli/routing-config - Get routing configuration for authenticated user
 */

import { Router, Response } from 'express';
import { prisma } from '@oppmon/database';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest } from '../middleware/request-auth.js';
import { buildRBACContext } from '../middleware/rbac.js';

export const cliRoutingRouter = Router();

interface RoutingConfig {
  gatewayUrl: string;
  tenantId: string;
  teamId?: string;
  teamName?: string;
  defaultModel?: {
    displayName: string;
    modelIdentifier: string;
    providerTemplateId: string | null;
  };
  availableModels: Array<{
    displayName: string;
    modelIdentifier: string;
    providerTemplateId: string | null;
  }>;
  virtualKey?: {
    id: string;
    keyPrefix: string;
    label: string | null;
  };
}

/**
 * GET /api/cli/routing-config
 * Get routing configuration for the current user
 */
cliRoutingRouter.get(
  '/routing-config',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rbacCtx = await buildRBACContext(req);

    if (!rbacCtx) {
      throw ApiError.unauthorized('Authentication required');
    }

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: rbacCtx.tenantId },
      select: {
        id: true,
        name: true,
        fallbackDefaultModelId: true,
      },
    });

    if (!tenant) {
      throw ApiError.notFound('Tenant not found');
    }

    // Get user's teams
    const userTeams = await prisma.teamMember.findMany({
      where: { userId: rbacCtx.userId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            defaultModelId: true,
          },
        },
      },
    });

    // Determine primary team
    const primaryTeam = userTeams[0]?.team || null;

    // Get available models (tenant-wide and team-specific)
    const models = await prisma.model.findMany({
      where: {
        tenantId: rbacCtx.tenantId,
        enabled: true,
        deletedAt: null,
        OR: [
          { scope: 'TENANT' },
          { scope: 'TEAM', teamId: { in: rbacCtx.teamIds } },
        ],
      },
      select: {
        id: true,
        displayName: true,
        modelIdentifier: true,
        providerTemplateId: true,
      },
      orderBy: { displayName: 'asc' },
    });

    // Determine default model
    let defaultModel = null;

    // First check team default
    if (primaryTeam?.defaultModelId) {
      defaultModel = models.find((m) => m.id === primaryTeam.defaultModelId);
    }

    // Fall back to tenant default
    if (!defaultModel && tenant.fallbackDefaultModelId) {
      defaultModel = models.find((m) => m.id === tenant.fallbackDefaultModelId);
    }

    // Fall back to first available model
    if (!defaultModel && models.length > 0) {
      defaultModel = models[0];
    }

    // Get user's virtual keys
    const virtualKey = await prisma.virtualKey.findFirst({
      where: {
        userId: rbacCtx.userId,
        tenantId: rbacCtx.tenantId,
        enabled: true,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: {
        id: true,
        keyPrefix: true,
        label: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build response
    const config: RoutingConfig = {
      gatewayUrl: process.env.GATEWAY_URL || 'https://gateway.oppmon.example',
      tenantId: tenant.id,
      teamId: primaryTeam?.id,
      teamName: primaryTeam?.name,
      defaultModel: defaultModel
        ? {
            displayName: defaultModel.displayName,
            modelIdentifier: defaultModel.modelIdentifier,
            providerTemplateId: defaultModel.providerTemplateId,
          }
        : undefined,
      availableModels: models.map((m) => ({
        displayName: m.displayName,
        modelIdentifier: m.modelIdentifier,
        providerTemplateId: m.providerTemplateId,
      })),
      virtualKey: virtualKey || undefined,
    };

    res.json({ data: config });
  })
);
