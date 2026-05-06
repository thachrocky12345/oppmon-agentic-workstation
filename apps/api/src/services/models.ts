/**
 * Model Service
 * Business logic for model registry CRUD operations
 */

import { prisma, ModelScope } from '@arkon/database';
import { createId } from '@paralleldrive/cuid2';
import {
  providerRegistry,
  validateRequiredFields,
  extractSecretFields,
} from '@arkon/shared';
import { storeSecret, retrieveSecret, updateSecret, deleteSecret } from '../crypto/secret-vault.js';

// ============================================================================
// Types
// ============================================================================

export interface ModelFilter {
  tenantId: string;
  teamIds: string[];
  scope?: ModelScope;
  enabled?: boolean;
  search?: string;
  providerTemplateId?: string;
}

export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface CreateModelInput {
  displayName: string;
  providerTemplateId?: string;
  modelIdentifier: string;
  publicConfig: Record<string, unknown>;
  secretConfig?: Record<string, string>;
  yamlOverride?: string;
  scope: ModelScope;
  teamId?: string;
}

export interface UpdateModelInput {
  displayName?: string;
  modelIdentifier?: string;
  publicConfig?: Record<string, unknown>;
  secretConfig?: Record<string, string>;
  yamlOverride?: string;
  scope?: ModelScope;
  teamId?: string;
  enabled?: boolean;
}

export interface ModelWithoutSecrets {
  id: string;
  tenantId: string;
  scope: ModelScope;
  teamId: string | null;
  displayName: string;
  providerTemplateId: string | null;
  modelIdentifier: string;
  publicConfig: Record<string, unknown>;
  hasSecret: boolean;
  isYamlMode: boolean;
  enabled: boolean;
  createdById: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// List Models
// ============================================================================

export async function listModels(
  filter: ModelFilter,
  options: PaginationOptions = {}
): Promise<{ models: ModelWithoutSecrets[]; total: number; limit: number; offset: number }> {
  const { limit = 20, offset = 0 } = options;

  // Build where clause
  const where: Record<string, unknown> = {
    tenantId: filter.tenantId,
    deletedAt: null,
  };

  // Filter by scope
  if (filter.scope) {
    where.scope = filter.scope;
  }

  // Team visibility: user can see tenant-scoped OR team-scoped models for their teams
  where.OR = [
    { scope: 'TENANT' },
    { scope: 'TEAM', teamId: { in: filter.teamIds } },
  ];

  // Filter by enabled status
  if (filter.enabled !== undefined) {
    where.enabled = filter.enabled;
  }

  // Filter by provider
  if (filter.providerTemplateId) {
    where.providerTemplateId = filter.providerTemplateId;
  }

  // Search by display name
  if (filter.search) {
    where.displayName = {
      contains: filter.search,
      mode: 'insensitive',
    };
  }

  const [models, total] = await Promise.all([
    prisma.model.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        tenantId: true,
        scope: true,
        teamId: true,
        displayName: true,
        providerTemplateId: true,
        modelIdentifier: true,
        publicConfig: true,
        secretRef: true,
        yamlOverride: true,
        enabled: true,
        createdById: true,
        lastSyncedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.model.count({ where }),
  ]);

  // Transform to ModelWithoutSecrets
  const transformedModels: ModelWithoutSecrets[] = models.map((m) => ({
    id: m.id,
    tenantId: m.tenantId,
    scope: m.scope,
    teamId: m.teamId,
    displayName: m.displayName,
    providerTemplateId: m.providerTemplateId,
    modelIdentifier: m.modelIdentifier,
    publicConfig: m.publicConfig as Record<string, unknown>,
    hasSecret: !!m.secretRef,
    isYamlMode: !m.providerTemplateId && !!m.yamlOverride,
    enabled: m.enabled,
    createdById: m.createdById,
    lastSyncedAt: m.lastSyncedAt,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }));

  return {
    models: transformedModels,
    total,
    limit,
    offset,
  };
}

// ============================================================================
// Get Model
// ============================================================================

export async function getModel(
  id: string,
  context: { tenantId: string; teamIds: string[] }
): Promise<ModelWithoutSecrets | null> {
  const model = await prisma.model.findFirst({
    where: {
      id,
      tenantId: context.tenantId,
      deletedAt: null,
      OR: [
        { scope: 'TENANT' },
        { scope: 'TEAM', teamId: { in: context.teamIds } },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      scope: true,
      teamId: true,
      displayName: true,
      providerTemplateId: true,
      modelIdentifier: true,
      publicConfig: true,
      secretRef: true,
      yamlOverride: true,
      enabled: true,
      createdById: true,
      lastSyncedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!model) return null;

  return {
    id: model.id,
    tenantId: model.tenantId,
    scope: model.scope,
    teamId: model.teamId,
    displayName: model.displayName,
    providerTemplateId: model.providerTemplateId,
    modelIdentifier: model.modelIdentifier,
    publicConfig: model.publicConfig as Record<string, unknown>,
    hasSecret: !!model.secretRef,
    isYamlMode: !model.providerTemplateId && !!model.yamlOverride,
    enabled: model.enabled,
    createdById: model.createdById,
    lastSyncedAt: model.lastSyncedAt,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

// ============================================================================
// Create Model
// ============================================================================

export async function createModel(
  tenantId: string,
  userId: string,
  input: CreateModelInput
): Promise<ModelWithoutSecrets> {
  // Validate provider template if specified
  if (input.providerTemplateId) {
    const template = providerRegistry.get(input.providerTemplateId);
    if (!template) {
      throw new Error(`Unknown provider template: ${input.providerTemplateId}`);
    }

    // Validate required fields
    const allConfig = { ...input.publicConfig, ...input.secretConfig };
    const validation = validateRequiredFields(input.providerTemplateId, allConfig);
    if (!validation.valid) {
      throw new Error(`Missing required fields: ${validation.missingFields.join(', ')}`);
    }
  }

  // Store secret if provided
  let secretRef: string | undefined;
  if (input.secretConfig && Object.keys(input.secretConfig).length > 0) {
    secretRef = await storeSecret(tenantId, input.secretConfig);
  }

  const model = await prisma.model.create({
    data: {
      id: createId(),
      tenantId,
      scope: input.scope,
      teamId: input.teamId,
      displayName: input.displayName,
      providerTemplateId: input.providerTemplateId,
      modelIdentifier: input.modelIdentifier,
      publicConfig: input.publicConfig,
      secretRef,
      yamlOverride: input.yamlOverride,
      enabled: true,
      createdById: userId,
    },
  });

  return {
    id: model.id,
    tenantId: model.tenantId,
    scope: model.scope,
    teamId: model.teamId,
    displayName: model.displayName,
    providerTemplateId: model.providerTemplateId,
    modelIdentifier: model.modelIdentifier,
    publicConfig: model.publicConfig as Record<string, unknown>,
    hasSecret: !!model.secretRef,
    isYamlMode: !model.providerTemplateId && !!model.yamlOverride,
    enabled: model.enabled,
    createdById: model.createdById,
    lastSyncedAt: model.lastSyncedAt,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  };
}

// ============================================================================
// Update Model
// ============================================================================

export async function updateModel(
  id: string,
  tenantId: string,
  input: UpdateModelInput
): Promise<{ model: ModelWithoutSecrets; beforeState: Record<string, unknown> }> {
  const existing = await prisma.model.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new Error('Model not found');
  }

  const beforeState = {
    displayName: existing.displayName,
    modelIdentifier: existing.modelIdentifier,
    publicConfig: existing.publicConfig,
    scope: existing.scope,
    teamId: existing.teamId,
    enabled: existing.enabled,
  };

  // Handle secret update
  let secretRef = existing.secretRef;
  if (input.secretConfig && Object.keys(input.secretConfig).length > 0) {
    if (existing.secretRef) {
      await updateSecret(existing.secretRef, input.secretConfig);
    } else {
      secretRef = await storeSecret(tenantId, input.secretConfig);
    }
  }

  const updateData: Record<string, unknown> = {};

  if (input.displayName !== undefined) {
    updateData.displayName = input.displayName;
  }
  if (input.modelIdentifier !== undefined) {
    updateData.modelIdentifier = input.modelIdentifier;
  }
  if (input.publicConfig !== undefined) {
    updateData.publicConfig = input.publicConfig;
  }
  if (input.yamlOverride !== undefined) {
    updateData.yamlOverride = input.yamlOverride;
  }
  if (input.scope !== undefined) {
    updateData.scope = input.scope;
  }
  if (input.teamId !== undefined) {
    updateData.teamId = input.teamId;
  }
  if (input.enabled !== undefined) {
    updateData.enabled = input.enabled;
  }
  if (secretRef !== existing.secretRef) {
    updateData.secretRef = secretRef;
  }

  const model = await prisma.model.update({
    where: { id },
    data: updateData,
  });

  return {
    model: {
      id: model.id,
      tenantId: model.tenantId,
      scope: model.scope,
      teamId: model.teamId,
      displayName: model.displayName,
      providerTemplateId: model.providerTemplateId,
      modelIdentifier: model.modelIdentifier,
      publicConfig: model.publicConfig as Record<string, unknown>,
      hasSecret: !!model.secretRef,
      isYamlMode: !model.providerTemplateId && !!model.yamlOverride,
      enabled: model.enabled,
      createdById: model.createdById,
      lastSyncedAt: model.lastSyncedAt,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    },
    beforeState,
  };
}

// ============================================================================
// Delete Model (Soft Delete)
// ============================================================================

export async function deleteModel(
  id: string,
  tenantId: string
): Promise<{ model: ModelWithoutSecrets; beforeState: Record<string, unknown> }> {
  const existing = await prisma.model.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new Error('Model not found');
  }

  const beforeState = {
    displayName: existing.displayName,
    enabled: existing.enabled,
    deletedAt: existing.deletedAt,
  };

  // Soft delete
  const model = await prisma.model.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  return {
    model: {
      id: model.id,
      tenantId: model.tenantId,
      scope: model.scope,
      teamId: model.teamId,
      displayName: model.displayName,
      providerTemplateId: model.providerTemplateId,
      modelIdentifier: model.modelIdentifier,
      publicConfig: model.publicConfig as Record<string, unknown>,
      hasSecret: !!model.secretRef,
      isYamlMode: !model.providerTemplateId && !!model.yamlOverride,
      enabled: model.enabled,
      createdById: model.createdById,
      lastSyncedAt: model.lastSyncedAt,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    },
    beforeState,
  };
}

// ============================================================================
// Rotate Secret
// ============================================================================

export async function rotateModelSecret(
  id: string,
  tenantId: string,
  newSecretConfig: Record<string, string>
): Promise<void> {
  const existing = await prisma.model.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
  });

  if (!existing) {
    throw new Error('Model not found');
  }

  if (!existing.secretRef) {
    // Create new secret
    const secretRef = await storeSecret(tenantId, newSecretConfig);
    await prisma.model.update({
      where: { id },
      data: { secretRef },
    });
  } else {
    // Update existing secret
    await updateSecret(existing.secretRef, newSecretConfig);
  }
}

// ============================================================================
// Get Model with Decrypted Secrets (Internal Use Only)
// ============================================================================

export async function getModelWithSecrets(
  id: string,
  tenantId: string
): Promise<{
  model: ModelWithoutSecrets;
  secrets: Record<string, string>;
} | null> {
  const model = await prisma.model.findFirst({
    where: {
      id,
      tenantId,
      deletedAt: null,
    },
  });

  if (!model) return null;

  let secrets: Record<string, string> = {};
  if (model.secretRef) {
    secrets = await retrieveSecret(model.secretRef);
  }

  return {
    model: {
      id: model.id,
      tenantId: model.tenantId,
      scope: model.scope,
      teamId: model.teamId,
      displayName: model.displayName,
      providerTemplateId: model.providerTemplateId,
      modelIdentifier: model.modelIdentifier,
      publicConfig: model.publicConfig as Record<string, unknown>,
      hasSecret: !!model.secretRef,
      isYamlMode: !model.providerTemplateId && !!model.yamlOverride,
      enabled: model.enabled,
      createdById: model.createdById,
      lastSyncedAt: model.lastSyncedAt,
      createdAt: model.createdAt,
      updatedAt: model.updatedAt,
    },
    secrets,
  };
}

// ============================================================================
// Get All Enabled Models for Tenant (for LiteLLM config generation)
// ============================================================================

export async function getEnabledModelsForTenant(
  tenantId: string
): Promise<Array<{
  model: ModelWithoutSecrets;
  secrets: Record<string, string>;
  yamlOverride?: string;
}>> {
  const models = await prisma.model.findMany({
    where: {
      tenantId,
      enabled: true,
      deletedAt: null,
    },
    orderBy: { displayName: 'asc' },
  });

  const results = await Promise.all(
    models.map(async (m) => {
      let secrets: Record<string, string> = {};
      if (m.secretRef) {
        try {
          secrets = await retrieveSecret(m.secretRef);
        } catch (error) {
          console.error(`Failed to decrypt secrets for model ${m.id}:`, error);
        }
      }

      return {
        model: {
          id: m.id,
          tenantId: m.tenantId,
          scope: m.scope,
          teamId: m.teamId,
          displayName: m.displayName,
          providerTemplateId: m.providerTemplateId,
          modelIdentifier: m.modelIdentifier,
          publicConfig: m.publicConfig as Record<string, unknown>,
          hasSecret: !!m.secretRef,
          isYamlMode: !m.providerTemplateId && !!m.yamlOverride,
          enabled: m.enabled,
          createdById: m.createdById,
          lastSyncedAt: m.lastSyncedAt,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        },
        secrets,
        yamlOverride: m.yamlOverride || undefined,
      };
    })
  );

  return results;
}
