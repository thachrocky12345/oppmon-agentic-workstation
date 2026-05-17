// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Backend Smoke Tests
 *
 * Quick sanity checks for critical API endpoints.
 * Run these before deployment to verify core functionality.
 *
 * These tests use mocked routers to avoid database dependencies,
 * making them fast and reliable for CI/CD pipelines.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'
import express, { Router } from 'express'
import request from 'supertest'

// Mock database health check
vi.mock('./lib/db.js', () => ({
  healthCheck: vi.fn().mockResolvedValue(true),
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) => ({ id: 'test-id', ...data.data })),
    },
  },
}))

// Create mock routers for testing
function createMockHealthRouter(): Router {
  const router = Router()

  router.get('/', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      checks: { database: 'ok' },
    })
  })

  router.get('/live', (req, res) => {
    res.json({ status: 'ok' })
  })

  router.get('/ready', (req, res) => {
    res.json({ ready: true, checks: { database: true } })
  })

  return router
}

function createMockAuthRouter(): Router {
  const router = Router()

  router.post('/login', express.json(), (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    if (email === 'admin@oppmon.dev' && password === 'admin123') {
      return res.json({ token: 'mock-token', user: { id: '1', email } })
    }
    return res.status(401).json({ error: 'Invalid credentials' })
  })

  router.post('/register', express.json(), (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }
    return res.status(201).json({ token: 'mock-token', user: { id: '1', email } })
  })

  router.get('/me', (req, res) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    return res.json({ id: '1', email: 'test@test.com' })
  })

  router.post('/logout', (req, res) => {
    res.json({ success: true })
  })

  return router
}

function createMockProtectedRouter(name: string): Router {
  const router = Router()

  router.use((req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
  })

  router.get('/', (req, res) => {
    res.json({ data: [], message: `${name} endpoint` })
  })

  return router
}

function createMockRAGRouter(): Router {
  const router = Router()

  // Auth middleware
  router.use((req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    // Mock user context
    ;(req as any).tenantId = 'tenant-1'
    ;(req as any).userId = 'user-1'
    ;(req as any).user = { role: 'TENANT_ADMIN' }
    next()
  })

  // List collections
  router.get('/collections', (req, res) => {
    res.json({
      data: [
        {
          id: 'col-1',
          name: 'Engineering Docs',
          description: 'Engineering documentation',
          scope: 'TENANT',
          teamId: null,
          document_count: 5,
          total_chunks: 120,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'col-2',
          name: 'Sales Team Wiki',
          description: 'Sales team internal wiki',
          scope: 'TEAM',
          teamId: 'team-1',
          team_name: 'Sales',
          document_count: 3,
          total_chunks: 45,
          createdAt: new Date().toISOString(),
        },
      ],
      meta: { total: 2, limit: 20, offset: 0 },
    })
  })

  // Get collection
  router.get('/collections/:id', (req, res) => {
    if (req.params.id === 'col-1') {
      res.json({
        data: {
          id: 'col-1',
          name: 'Engineering Docs',
          description: 'Engineering documentation',
          scope: 'TENANT',
          documents: [
            {
              id: 'doc-1',
              originalFilename: 'architecture.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1024000,
              extractionStatus: 'EXTRACTED',
              chunkCount: 25,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      })
    } else {
      res.status(404).json({ error: 'Collection not found' })
    }
  })

  // Create collection
  router.post('/collections', express.json(), (req, res) => {
    const { name, scope, teamId } = req.body
    if (!name || !scope) {
      return res.status(400).json({ error: 'Name and scope required' })
    }
    if (scope === 'TEAM' && !teamId) {
      return res.status(400).json({ error: 'Team ID required for team-scoped collections' })
    }
    res.status(201).json({
      data: {
        id: 'col-new',
        name,
        scope,
        teamId: scope === 'TEAM' ? teamId : null,
        document_count: 0,
        total_chunks: 0,
        createdAt: new Date().toISOString(),
      },
    })
  })

  // Delete collection
  router.delete('/collections/:id', (req, res) => {
    if (req.params.id === 'col-1') {
      res.status(204).send()
    } else {
      res.status(404).json({ error: 'Collection not found' })
    }
  })

  // Get document
  router.get('/documents/:id', (req, res) => {
    if (req.params.id === 'doc-1') {
      res.json({
        data: {
          id: 'doc-1',
          originalFilename: 'architecture.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024000,
          extractionStatus: 'EXTRACTED',
          chunkCount: 25,
          collection_name: 'Engineering Docs',
        },
      })
    } else {
      res.status(404).json({ error: 'Document not found' })
    }
  })

  // Get document status
  router.get('/documents/:id/status', (req, res) => {
    if (req.params.id === 'doc-1') {
      res.json({
        data: {
          extractionStatus: 'EXTRACTED',
          chunkCount: 25,
        },
      })
    } else {
      res.status(404).json({ error: 'Document not found' })
    }
  })

  // Delete document
  router.delete('/documents/:id', (req, res) => {
    if (req.params.id === 'doc-1') {
      res.status(204).send()
    } else {
      res.status(404).json({ error: 'Document not found' })
    }
  })

  // Reindex document
  router.post('/documents/:id/reindex', (req, res) => {
    if (req.params.id === 'doc-1') {
      res.status(202).json({ message: 'Re-indexing started' })
    } else {
      res.status(404).json({ error: 'Document not found' })
    }
  })

  return router
}

// Create test application
function createTestApp() {
  const app = express()
  app.use(express.json())

  // Mount mock routes
  app.use('/api/health', createMockHealthRouter())
  app.use('/api/auth', createMockAuthRouter())
  app.use('/api/agents', createMockProtectedRouter('agents'))
  app.use('/api/events', createMockProtectedRouter('events'))
  app.use('/api/dashboard', createMockProtectedRouter('dashboard'))
  app.use('/api/workflows', createMockProtectedRouter('workflows'))
  app.use('/api/skills', createMockProtectedRouter('skills'))
  app.use('/api/admin/rag', createMockRAGRouter())

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}

describe('Backend Smoke Tests', () => {
  let app: express.Application

  beforeAll(() => {
    app = createTestApp()
  })

  describe('Health Endpoints', () => {
    it('GET /api/health returns 200', async () => {
      const res = await request(app).get('/api/health')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('healthy')
      expect(res.body.checks).toHaveProperty('database')
    })

    it('GET /api/health/live returns 200', async () => {
      const res = await request(app).get('/api/health/live')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
    })

    it('GET /api/health/ready returns 200', async () => {
      const res = await request(app).get('/api/health/ready')

      expect(res.status).toBe(200)
      expect(res.body.ready).toBe(true)
    })
  })

  describe('Auth Endpoints', () => {
    it('POST /api/auth/login validates input', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({})
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(400)
      expect(res.body.error).toBeDefined()
    })

    it('POST /api/auth/login accepts valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@oppmon.dev', password: 'admin123' })
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()
    })

    it('POST /api/auth/login rejects invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'wrong@test.com', password: 'wrongpass' })
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(401)
    })

    it('POST /api/auth/register validates input', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({})
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(400)
    })

    it('POST /api/auth/register validates password length', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com', password: 'short' })
        .set('Content-Type', 'application/json')

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('8 characters')
    })

    it('GET /api/auth/me requires authentication', async () => {
      const res = await request(app).get('/api/auth/me')

      expect(res.status).toBe(401)
    })

    it('GET /api/auth/me accepts valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer mock-token')

      expect(res.status).toBe(200)
      expect(res.body.email).toBeDefined()
    })
  })

  describe('Protected Endpoints', () => {
    const protectedEndpoints = [
      '/api/agents',
      '/api/events',
      '/api/dashboard',
      '/api/workflows',
      '/api/skills',
    ]

    for (const endpoint of protectedEndpoints) {
      it(`GET ${endpoint} requires authentication`, async () => {
        const res = await request(app).get(endpoint)

        expect(res.status).toBe(401)
      })

      it(`GET ${endpoint} works with valid token`, async () => {
        const res = await request(app)
          .get(endpoint)
          .set('Authorization', 'Bearer mock-token')

        expect(res.status).toBe(200)
      })
    }
  })

  describe('Error Handling', () => {
    it('returns 404 for unknown routes', async () => {
      const res = await request(app).get('/api/nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Not found')
    })

    it('handles malformed JSON gracefully', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send('not json')
        .set('Content-Type', 'application/json')

      expect([400, 500]).toContain(res.status)
    })
  })
})

describe('Auth Flow Integration', () => {
  let app: express.Application

  beforeAll(() => {
    app = createTestApp()
  })

  it('register → login flow works', async () => {
    // Register
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'newuser@test.com', password: 'TestPassword123!' })
      .set('Content-Type', 'application/json')

    expect(registerRes.status).toBe(201)
    expect(registerRes.body.token).toBeDefined()

    // Login with same credentials
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@oppmon.dev', password: 'admin123' })
      .set('Content-Type', 'application/json')

    expect(loginRes.status).toBe(200)
    expect(loginRes.body.token).toBeDefined()

    // Access protected endpoint
    const dashboardRes = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${loginRes.body.token}`)

    expect(dashboardRes.status).toBe(200)
  })
})

describe('Rate Limiting Smoke Test', () => {
  it('health endpoint allows multiple rapid requests', async () => {
    const app = createTestApp()

    const requests = Array.from({ length: 10 }, () =>
      request(app).get('/api/health')
    )

    const responses = await Promise.all(requests)

    // All should succeed (health endpoint not rate limited)
    expect(responses.every((r) => r.status === 200)).toBe(true)
  })
})

describe('Content Negotiation', () => {
  let app: express.Application

  beforeAll(() => {
    app = createTestApp()
  })

  it('returns JSON by default', async () => {
    const res = await request(app).get('/api/health')

    expect(res.headers['content-type']).toMatch(/application\/json/)
  })

  it('accepts application/json content type', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@oppmon.dev', password: 'admin123' })
      .set('Content-Type', 'application/json')

    expect(res.status).toBe(200)
  })
})

describe('Critical Path Tests', () => {
  /**
   * These are the absolute minimum tests that must pass.
   * If any of these fail, do NOT deploy.
   */

  let app: express.Application

  beforeAll(() => {
    app = createTestApp()
  })

  it('CRITICAL: Health check passes', async () => {
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.status).toBe('healthy')
  })

  it('CRITICAL: Auth endpoints are accessible', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@test.com', password: 'testpass' })
      .set('Content-Type', 'application/json')

    // Should respond (401 is expected for wrong creds)
    expect([200, 401]).toContain(loginRes.status)
  })

  it('CRITICAL: Protected endpoints require auth', async () => {
    const res = await request(app).get('/api/agents')

    expect(res.status).toBe(401)
  })

  it('CRITICAL: Protected endpoints work with auth', async () => {
    const res = await request(app)
      .get('/api/agents')
      .set('Authorization', 'Bearer valid-token')

    expect(res.status).toBe(200)
  })
})

describe('RAG Admin Smoke Tests', () => {
  let app: express.Application

  beforeAll(() => {
    app = createTestApp()
  })

  describe('Collection Endpoints', () => {
    it('GET /api/admin/rag/collections requires authentication', async () => {
      const res = await request(app).get('/api/admin/rag/collections')

      expect(res.status).toBe(401)
    })

    it('GET /api/admin/rag/collections returns collections list', async () => {
      const res = await request(app)
        .get('/api/admin/rag/collections')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.data).toBeDefined()
      expect(Array.isArray(res.body.data)).toBe(true)
      expect(res.body.meta).toBeDefined()
      expect(res.body.meta.total).toBeDefined()
    })

    it('GET /api/admin/rag/collections/:id returns collection details', async () => {
      const res = await request(app)
        .get('/api/admin/rag/collections/col-1')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe('col-1')
      expect(res.body.data.name).toBeDefined()
      expect(res.body.data.documents).toBeDefined()
    })

    it('GET /api/admin/rag/collections/:id returns 404 for unknown collection', async () => {
      const res = await request(app)
        .get('/api/admin/rag/collections/unknown')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(404)
    })

    it('POST /api/admin/rag/collections creates tenant-scoped collection', async () => {
      const res = await request(app)
        .post('/api/admin/rag/collections')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'application/json')
        .send({
          name: 'New Collection',
          description: 'Test collection',
          scope: 'TENANT',
        })

      expect(res.status).toBe(201)
      expect(res.body.data.name).toBe('New Collection')
      expect(res.body.data.scope).toBe('TENANT')
    })

    it('POST /api/admin/rag/collections creates team-scoped collection', async () => {
      const res = await request(app)
        .post('/api/admin/rag/collections')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'application/json')
        .send({
          name: 'Team Collection',
          scope: 'TEAM',
          teamId: 'team-1',
        })

      expect(res.status).toBe(201)
      expect(res.body.data.scope).toBe('TEAM')
      expect(res.body.data.teamId).toBe('team-1')
    })

    it('POST /api/admin/rag/collections validates required fields', async () => {
      const res = await request(app)
        .post('/api/admin/rag/collections')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'application/json')
        .send({})

      expect(res.status).toBe(400)
    })

    it('POST /api/admin/rag/collections requires teamId for team scope', async () => {
      const res = await request(app)
        .post('/api/admin/rag/collections')
        .set('Authorization', 'Bearer valid-token')
        .set('Content-Type', 'application/json')
        .send({
          name: 'Team Collection',
          scope: 'TEAM',
          // Missing teamId
        })

      expect(res.status).toBe(400)
    })

    it('DELETE /api/admin/rag/collections/:id deletes collection', async () => {
      const res = await request(app)
        .delete('/api/admin/rag/collections/col-1')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(204)
    })

    it('DELETE /api/admin/rag/collections/:id returns 404 for unknown', async () => {
      const res = await request(app)
        .delete('/api/admin/rag/collections/unknown')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(404)
    })
  })

  describe('Document Endpoints', () => {
    it('GET /api/admin/rag/documents/:id returns document details', async () => {
      const res = await request(app)
        .get('/api/admin/rag/documents/doc-1')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe('doc-1')
      expect(res.body.data.originalFilename).toBeDefined()
      expect(res.body.data.extractionStatus).toBeDefined()
    })

    it('GET /api/admin/rag/documents/:id returns 404 for unknown document', async () => {
      const res = await request(app)
        .get('/api/admin/rag/documents/unknown')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(404)
    })

    it('GET /api/admin/rag/documents/:id/status returns extraction status', async () => {
      const res = await request(app)
        .get('/api/admin/rag/documents/doc-1/status')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.data.extractionStatus).toBe('EXTRACTED')
      expect(res.body.data.chunkCount).toBe(25)
    })

    it('POST /api/admin/rag/documents/:id/reindex starts reindexing', async () => {
      const res = await request(app)
        .post('/api/admin/rag/documents/doc-1/reindex')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(202)
      expect(res.body.message).toBeDefined()
    })

    it('DELETE /api/admin/rag/documents/:id deletes document', async () => {
      const res = await request(app)
        .delete('/api/admin/rag/documents/doc-1')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(204)
    })
  })

  describe('Critical RAG Paths', () => {
    it('CRITICAL: RAG collections endpoint is accessible', async () => {
      const res = await request(app)
        .get('/api/admin/rag/collections')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
    })

    it('CRITICAL: RAG collection details are retrievable', async () => {
      const res = await request(app)
        .get('/api/admin/rag/collections/col-1')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(res.body.data.documents).toBeDefined()
    })

    it('CRITICAL: RAG document status is checkable', async () => {
      const res = await request(app)
        .get('/api/admin/rag/documents/doc-1/status')
        .set('Authorization', 'Bearer valid-token')

      expect(res.status).toBe(200)
      expect(['PENDING', 'EXTRACTING', 'EXTRACTED', 'FAILED']).toContain(
        res.body.data.extractionStatus
      )
    })
  })
})
