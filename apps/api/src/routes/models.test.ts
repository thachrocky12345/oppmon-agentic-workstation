/**
 * Model Registry Routes Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { modelsRouter } from './models.js';
import { errorHandler } from '../middleware/error-handler.js';

// Mock dependencies
vi.mock('@oppmon/database', () => ({
  prisma: {
    model: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    modelSecret: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    teamMember: {
      findMany: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  ModelScope: {
    TENANT: 'TENANT',
    TEAM: 'TEAM',
  },
}));

vi.mock('../middleware/rbac.js', () => ({
  rbac: () => (req: any, _res: any, next: any) => {
    req.rbacContext = {
      tenantId: 'test-tenant',
      userId: 'test-user',
      teamIds: ['team-1', 'team-2'],
      role: 'tenant_admin',
    };
    next();
  },
  buildRBACContext: vi.fn().mockResolvedValue({
    tenantId: 'test-tenant',
    userId: 'test-user',
    teamIds: ['team-1', 'team-2'],
    role: 'tenant_admin',
  }),
  RBACContext: {},
}));

vi.mock('../services/models.js', () => ({
  listModels: vi.fn(),
  getModel: vi.fn(),
  createModel: vi.fn(),
  updateModel: vi.fn(),
  deleteModel: vi.fn(),
  rotateModelSecret: vi.fn(),
}));

vi.mock('../validators/index.js', () => ({
  validateConnection: vi.fn(),
  validateYamlConfig: vi.fn(),
}));

vi.mock('../services/audit.js', () => ({
  logCreate: vi.fn(),
  logUpdate: vi.fn(),
  logDelete: vi.fn(),
  getAuditContext: vi.fn().mockReturnValue(null),
}));

vi.mock('@oppmon/shared', () => ({
  providerRegistry: {
    has: vi.fn().mockReturnValue(true),
    getAll: vi.fn().mockReturnValue([
      {
        id: 'anthropic',
        displayName: 'Anthropic',
        description: 'Claude models',
        category: 'cloud',
        icon: 'anthropic',
        fields: [],
        docsUrl: 'https://docs.anthropic.com',
        setupSteps: [],
        supportsStreaming: true,
        supportsFunctionCalling: true,
        defaultModel: 'claude-sonnet-4-20250514',
      },
    ]),
  },
}));

import { listModels, getModel, createModel, updateModel, deleteModel } from '../services/models.js';
import { validateConnection, validateYamlConfig } from '../validators/index.js';
import { buildRBACContext } from '../middleware/rbac.js';
import { providerRegistry } from '@oppmon/shared';

// Create app for testing
const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req: any, _res, next) => {
  req.user = { id: 'test-user', tenantId: 'test-tenant', email: 'test@example.com' };
  next();
});

app.use('/api/models', modelsRouter);
app.use(errorHandler);

describe('Model Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/models', () => {
    it('returns list of models', async () => {
      vi.mocked(listModels).mockResolvedValueOnce({
        models: [
          {
            id: 'model-1',
            displayName: 'Claude Sonnet',
            providerTemplateId: 'anthropic',
            modelIdentifier: 'claude-sonnet-4-20250514',
            scope: 'TENANT',
            enabled: true,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });

      const res = await request(app).get('/api/models');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].displayName).toBe('Claude Sonnet');
      expect(res.body.meta.total).toBe(1);
    });

    it('supports filtering by scope', async () => {
      vi.mocked(listModels).mockResolvedValueOnce({
        models: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      await request(app).get('/api/models?scope=TEAM');

      expect(listModels).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'TEAM' }),
        expect.any(Object)
      );
    });

    it('supports search parameter', async () => {
      vi.mocked(listModels).mockResolvedValueOnce({
        models: [],
        total: 0,
        limit: 20,
        offset: 0,
      });

      await request(app).get('/api/models?search=claude');

      expect(listModels).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'claude' }),
        expect.any(Object)
      );
    });
  });

  describe('GET /api/models/providers', () => {
    it('returns list of provider templates', async () => {
      const res = await request(app).get('/api/models/providers');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('displayName');
    });
  });

  describe('GET /api/models/:id', () => {
    it('returns model by ID', async () => {
      vi.mocked(getModel).mockResolvedValueOnce({
        id: 'model-1',
        displayName: 'Claude Sonnet',
        providerTemplateId: 'anthropic',
        modelIdentifier: 'claude-sonnet-4-20250514',
        scope: 'TENANT',
        enabled: true,
      });

      const res = await request(app).get('/api/models/model-1');

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe('model-1');
    });

    it('returns 404 for non-existent model', async () => {
      vi.mocked(getModel).mockResolvedValueOnce(null);

      const res = await request(app).get('/api/models/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/models', () => {
    it('creates a new model', async () => {
      vi.mocked(createModel).mockResolvedValueOnce({
        id: 'new-model',
        displayName: 'New Claude Model',
        providerTemplateId: 'anthropic',
        modelIdentifier: 'claude-sonnet-4-20250514',
        scope: 'TENANT',
        enabled: true,
      });

      const res = await request(app)
        .post('/api/models')
        .send({
          displayName: 'New Claude Model',
          providerTemplateId: 'anthropic',
          modelIdentifier: 'claude-sonnet-4-20250514',
          publicConfig: { max_tokens: 4096 },
          secretConfig: { api_key: 'sk-test' },
          scope: 'TENANT',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.displayName).toBe('New Claude Model');
      expect(createModel).toHaveBeenCalledWith(
        'test-tenant',
        'test-user',
        expect.objectContaining({
          displayName: 'New Claude Model',
          providerTemplateId: 'anthropic',
        })
      );
    });

    it('validates required fields', async () => {
      const res = await request(app)
        .post('/api/models')
        .send({
          displayName: 'Test Model',
          modelIdentifier: 'test',
          // Missing providerTemplateId and yamlOverride
          scope: 'TENANT',
        });

      expect(res.status).toBe(400);
    });

    it('validates provider template exists', async () => {
      vi.mocked(providerRegistry.has).mockReturnValueOnce(false);

      const res = await request(app)
        .post('/api/models')
        .send({
          displayName: 'Test Model',
          providerTemplateId: 'unknown-provider',
          modelIdentifier: 'test',
          scope: 'TENANT',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unknown provider');
    });
  });

  describe('PATCH /api/models/:id', () => {
    it('updates an existing model', async () => {
      vi.mocked(updateModel).mockResolvedValueOnce({
        model: {
          id: 'model-1',
          displayName: 'Updated Name',
          providerTemplateId: 'anthropic',
          modelIdentifier: 'claude-sonnet-4-20250514',
          scope: 'TENANT',
          enabled: true,
        },
        beforeState: { displayName: 'Old Name' },
      });

      const res = await request(app)
        .patch('/api/models/model-1')
        .send({ displayName: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.displayName).toBe('Updated Name');
    });

    it('can toggle enabled status', async () => {
      vi.mocked(updateModel).mockResolvedValueOnce({
        model: {
          id: 'model-1',
          displayName: 'Test',
          enabled: false,
        },
        beforeState: { enabled: true },
      });

      const res = await request(app)
        .patch('/api/models/model-1')
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(updateModel).toHaveBeenCalledWith(
        'model-1',
        'test-tenant',
        expect.objectContaining({ enabled: false })
      );
    });
  });

  describe('DELETE /api/models/:id', () => {
    it('soft deletes a model', async () => {
      vi.mocked(deleteModel).mockResolvedValueOnce({
        model: {
          id: 'model-1',
          displayName: 'Test',
          deletedAt: new Date(),
        },
        beforeState: { deletedAt: null },
      });

      const res = await request(app).delete('/api/models/model-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/models/test', () => {
    it('tests connection with provider template', async () => {
      vi.mocked(validateConnection).mockResolvedValueOnce({
        ok: true,
        latencyMs: 150,
      });

      const res = await request(app)
        .post('/api/models/test')
        .send({
          providerTemplateId: 'anthropic',
          publicConfig: { model: 'claude-sonnet-4-20250514' },
          secretConfig: { api_key: 'sk-test' },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(true);
      expect(res.body.data.latencyMs).toBe(150);
    });

    it('tests connection with YAML override', async () => {
      vi.mocked(validateYamlConfig).mockResolvedValueOnce({
        ok: true,
        latencyMs: 200,
      });

      const res = await request(app)
        .post('/api/models/test')
        .send({
          yamlOverride: `
model: anthropic/claude-sonnet-4-20250514
api_key: sk-test
          `,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(true);
    });

    it('returns error details on connection failure', async () => {
      vi.mocked(validateConnection).mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
          hint: 'Check your API key',
        },
      });

      const res = await request(app)
        .post('/api/models/test')
        .send({
          providerTemplateId: 'anthropic',
          secretConfig: { api_key: 'invalid-key' },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(false);
      expect(res.body.data.error.code).toBe('AUTH_FAILED');
    });

    it('requires either providerTemplateId or yamlOverride', async () => {
      const res = await request(app)
        .post('/api/models/test')
        .send({
          publicConfig: { model: 'test' },
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/models/:id/rotate-secret', () => {
    it('rotates model credentials', async () => {
      vi.mocked(getModel).mockResolvedValueOnce({
        id: 'model-1',
        secretRef: 'secret-ref',
      });

      const res = await request(app)
        .post('/api/models/model-1/rotate-secret')
        .send({
          secretConfig: { api_key: 'sk-new-key' },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('validates secretConfig is required', async () => {
      const res = await request(app)
        .post('/api/models/model-1/rotate-secret')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
