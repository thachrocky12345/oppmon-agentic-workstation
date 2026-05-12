/**
 * RAG Admin API Routes
 *
 * Admin endpoints for managing RAG collections and documents.
 *
 * Endpoints:
 * - GET    /api/rag/collections          - List collections
 * - GET    /api/rag/collections/:id      - Get collection details
 * - POST   /api/rag/collections          - Create collection
 * - PATCH  /api/rag/collections/:id      - Update collection
 * - DELETE /api/rag/collections/:id      - Soft delete collection
 * - POST   /api/rag/collections/:id/documents - Upload document
 * - GET    /api/rag/documents/:id        - Get document details
 * - GET    /api/rag/documents/:id/status - Get extraction status
 * - POST   /api/rag/documents/:id/reindex - Re-index document
 * - DELETE /api/rag/documents/:id        - Delete document
 * - GET    /api/rag/documents/:id/view   - View/download document
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { AuthenticatedRequest, requireRole } from '../middleware/request-auth.js';
import { logAudit, getClientIp } from '../lib/audit.js';
import { getDocumentStorage } from '../lib/storage/index.js';
import { createEmbeddingClient, computeContentHash } from '../lib/embedding/index.js';
import { Readable } from 'stream';
import { createId } from '@paralleldrive/cuid2';
import busboy from 'busboy';

export const ragAdminRouter = Router();

// ============================================================================
// Helper Types and Functions
// ============================================================================

/**
 * Get required auth context with proper types
 * These are guaranteed to be set by requestAuth middleware
 */
function getAuthContext(req: AuthenticatedRequest): { tenantId: string; userId: string } {
  if (!req.tenantId || !req.userId) {
    throw ApiError.unauthorized('Authentication required');
  }
  return { tenantId: req.tenantId, userId: req.userId };
}

// ============================================================================
// Validation Schemas
// ============================================================================

const createCollectionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  scope: z.enum(['TENANT', 'TEAM']),
  teamId: z.string().optional().nullable(),
});

const updateCollectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
});

const listCollectionsQuerySchema = z.object({
  scope: z.enum(['TENANT', 'TEAM']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// ============================================================================
// Collection Routes
// ============================================================================

/**
 * GET /api/rag/collections
 * List RAG collections accessible to the user
 */
ragAdminRouter.get('/collections', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const queryParams = listCollectionsQuerySchema.parse(req.query);
  const { tenantId, userId } = getAuthContext(req);

  // Get user's team memberships
  const teamResult = await query(`
    SELECT team_id AS "teamId" FROM team_members WHERE user_id = $1
  `, [userId]);
  const teamIds = teamResult.rows.map((r: any) => r.teamId);

  // Build query based on user's access
  // Tenant admins see all tenant collections
  // Other users see tenant-scoped + their team-scoped collections
  const isTenantAdmin = req.user?.role === 'TENANT_ADMIN';

  let whereClause: string;
  const params: unknown[] = [tenantId];

  if (isTenantAdmin) {
    whereClause = `WHERE c.tenant_id = $1 AND c.deleted_at IS NULL`;
  } else {
    whereClause = `
      WHERE c.tenant_id = $1
      AND c.deleted_at IS NULL
      AND (c.scope = 'TENANT' OR c.team_id = ANY($2))
    `;
    params.push(teamIds);
  }

  if (queryParams.scope) {
    params.push(queryParams.scope);
    whereClause += ` AND c.scope = $${params.length}`;
  }

  // Get collections with document counts
  const result = await query(`
    SELECT
      c.id, c.name, c.description, c.scope,
      c.team_id AS "teamId",
      c.created_by_id AS "createdById",
      c.created_at AS "createdAt",
      c.updated_at AS "updatedAt",
      COUNT(d.id) FILTER (WHERE d.deleted_at IS NULL) as document_count,
      COALESCE(SUM(d.chunk_count) FILTER (WHERE d.deleted_at IS NULL), 0) as total_chunks,
      t.name as team_name
    FROM rag_collections c
    LEFT JOIN rag_documents d ON d.collection_id = c.id
    LEFT JOIN teams t ON t.id = c.team_id
    ${whereClause}
    GROUP BY c.id, t.name
    ORDER BY c.created_at DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `, [...params, queryParams.limit, queryParams.offset]);

  // Get total count
  const countResult = await query(`
    SELECT COUNT(*) as total FROM rag_collections c ${whereClause}
  `, params);

  res.json({
    data: result.rows,
    meta: {
      total: parseInt(countResult.rows[0]?.total || '0', 10),
      limit: queryParams.limit,
      offset: queryParams.offset,
    },
  });
}));

/**
 * GET /api/rag/collections/:id
 * Get collection details with documents
 */
ragAdminRouter.get('/collections/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId } = getAuthContext(req);

  const result = await query(`
    SELECT c.*, t.name as team_name
    FROM rag_collections c
    LEFT JOIN teams t ON t.id = c.team_id
    WHERE c.id = $1 AND c.tenant_id = $2 AND c.deleted_at IS NULL
  `, [req.params.id, tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Collection not found');
  }

  // Get recent documents
  const documents = await query(`
    SELECT
      id,
      original_filename AS "originalFilename",
      mime_type AS "mimeType",
      size_bytes AS "sizeBytes",
      extraction_status AS "extractionStatus",
      extraction_error AS "extractionError",
      chunk_count AS "chunkCount",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM rag_documents
    WHERE collection_id = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 50
  `, [req.params.id]);

  res.json({
    data: {
      ...result.rows[0],
      documents: documents.rows,
    },
  });
}));

/**
 * POST /api/rag/collections
 * Create a new collection
 */
ragAdminRouter.post('/collections', requireRole('TEAM_ADMIN', 'TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = createCollectionSchema.parse(req.body);
  const { tenantId, userId } = getAuthContext(req);

  // Validate team access for team-scoped collections
  if (input.scope === 'TEAM' && input.teamId) {
    const teamCheck = await query(`
      SELECT tm.role FROM team_members tm
      WHERE tm.user_id = $1 AND tm.team_id = $2
    `, [userId, input.teamId]);

    if (teamCheck.rows.length === 0) {
      throw ApiError.forbidden('You are not a member of this team');
    }

    // Must be team admin to create team-scoped collection
    if (teamCheck.rows[0].role !== 'ADMIN' && req.user?.role !== 'TENANT_ADMIN') {
      throw ApiError.forbidden('Only team admins can create team-scoped collections');
    }
  }

  // Tenant-scoped requires tenant admin
  if (input.scope === 'TENANT' && req.user?.role !== 'TENANT_ADMIN') {
    throw ApiError.forbidden('Only tenant admins can create tenant-scoped collections');
  }

  const collectionId = createId();
  const result = await query(`
    INSERT INTO rag_collections (id, tenant_id, name, description, scope, team_id, created_by_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    RETURNING *
  `, [
    collectionId,
    tenantId,
    input.name,
    input.description || null,
    input.scope,
    input.scope === 'TEAM' ? input.teamId : null,
    userId,
  ]);

  logAudit({
    actorType: 'user',
    actorId: userId,
    action: 'rag.collection.create',
    targetType: 'rag_collection',
    targetId: result.rows[0].id,
    newValue: result.rows[0],
    tenantId: tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ data: result.rows[0] });
}));

/**
 * PATCH /api/rag/collections/:id
 * Update collection metadata
 */
ragAdminRouter.patch('/collections/:id', requireRole('TEAM_ADMIN', 'TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const input = updateCollectionSchema.parse(req.body);
  const { tenantId, userId } = getAuthContext(req);

  // Check collection exists and user has access
  const current = await query(`
    SELECT *, team_id AS "teamId" FROM rag_collections
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `, [req.params.id, tenantId]);

  if (current.rows.length === 0) {
    throw ApiError.notFound('Collection not found');
  }

  const collection = current.rows[0];

  // Check permission
  if (collection.scope === 'TEAM' && collection.teamId) {
    const teamCheck = await query(`
      SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2
    `, [userId, collection.teamId]);

    if (teamCheck.rows.length === 0 || (teamCheck.rows[0].role !== 'ADMIN' && req.user?.role !== 'TENANT_ADMIN')) {
      throw ApiError.forbidden('Only team admins can update this collection');
    }
  } else if (collection.scope === 'TENANT' && req.user?.role !== 'TENANT_ADMIN') {
    throw ApiError.forbidden('Only tenant admins can update tenant-scoped collections');
  }

  const updates: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }

  if (input.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }

  values.push(req.params.id, tenantId);

  const result = await query(`
    UPDATE rag_collections SET ${updates.join(', ')}
    WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex}
    RETURNING *
  `, values);

  logAudit({
    actorType: 'user',
    actorId: userId,
    action: 'rag.collection.update',
    targetType: 'rag_collection',
    targetId: req.params.id,
    oldValue: collection,
    newValue: result.rows[0],
    tenantId: tenantId,
    ipAddress: getClientIp(req),
  });

  res.json({ data: result.rows[0] });
}));

/**
 * DELETE /api/rag/collections/:id
 * Soft delete collection (cascades to documents)
 */
ragAdminRouter.delete('/collections/:id', requireRole('TEAM_ADMIN', 'TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId, userId } = getAuthContext(req);

  // Check collection exists
  const current = await query(`
    SELECT * FROM rag_collections
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `, [req.params.id, tenantId]);

  if (current.rows.length === 0) {
    throw ApiError.notFound('Collection not found');
  }

  const collection = current.rows[0];

  // Check permission
  if (collection.scope === 'TENANT' && req.user?.role !== 'TENANT_ADMIN') {
    throw ApiError.forbidden('Only tenant admins can delete tenant-scoped collections');
  }

  // Soft delete collection
  await query(`
    UPDATE rag_collections SET deleted_at = NOW()
    WHERE id = $1 AND tenant_id = $2
  `, [req.params.id, tenantId]);

  // Soft delete all documents
  await query(`
    UPDATE rag_documents SET deleted_at = NOW()
    WHERE collection_id = $1
  `, [req.params.id]);

  logAudit({
    actorType: 'user',
    actorId: userId,
    action: 'rag.collection.delete',
    targetType: 'rag_collection',
    targetId: req.params.id,
    oldValue: collection,
    tenantId: tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(204).send();
}));

// ============================================================================
// Document Routes
// ============================================================================

const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Infer MIME type from filename extension
 * Browsers often send .md files as application/octet-stream
 */
function inferMimeType(filename: string, reportedMimeType: string): string {
  // If the browser reported a specific type, trust it (unless it's generic)
  if (reportedMimeType && reportedMimeType !== 'application/octet-stream') {
    return reportedMimeType;
  }

  // Infer from extension
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'text/markdown';
    case 'txt':
      return 'text/plain';
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'html':
    case 'htm':
      return 'text/html';
    default:
      return reportedMimeType;
  }
}

/**
 * POST /api/rag/collections/:id/documents
 * Upload document to collection
 */
ragAdminRouter.post('/collections/:collectionId/documents', requireRole('TEAM_ADMIN', 'TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId, userId } = getAuthContext(req);

  // Verify collection exists and user has access
  const collectionResult = await query(`
    SELECT *, team_id AS "teamId" FROM rag_collections
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `, [req.params.collectionId, tenantId]);

  if (collectionResult.rows.length === 0) {
    throw ApiError.notFound('Collection not found');
  }

  const collection = collectionResult.rows[0];

  // Check permission for team-scoped collections
  if (collection.scope === 'TEAM' && collection.teamId) {
    const teamCheck = await query(`
      SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2
    `, [userId, collection.teamId]);

    if (teamCheck.rows.length === 0 || (teamCheck.rows[0].role !== 'ADMIN' && req.user?.role !== 'TENANT_ADMIN')) {
      throw ApiError.forbidden('Only team admins can upload to this collection');
    }
  }

  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE_SIZE },
    });

    let documentId: string | null = null;
    let hasFile = false;

    bb.on('file', async (name, file, info) => {
      hasFile = true;
      const { filename, mimeType: reportedMimeType } = info;

      // Infer MIME type from extension if browser sent generic type
      const mimeType = inferMimeType(filename, reportedMimeType);

      // Validate mime type
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        file.resume();
        reject(ApiError.badRequest(`File type '${reportedMimeType}' is not supported. Allowed: PDF, DOCX, MD, TXT, HTML`));
        return;
      }

      documentId = createId();
      const storage = getDocumentStorage();

      try {
        // Store file
        const storageResult = await storage.put(
          tenantId,
          documentId,
          filename,
          file as unknown as Readable
        );

        // Check for duplicate
        const existingDoc = await query(`
          SELECT id FROM rag_documents
          WHERE collection_id = $1 AND file_sha256 = $2 AND deleted_at IS NULL
        `, [req.params.collectionId, storageResult.sha256]);

        if (existingDoc.rows.length > 0) {
          // Delete the just-uploaded file and return existing
          await storage.delete(tenantId, documentId);
          res.json({
            data: { id: existingDoc.rows[0].id },
            message: 'Document already exists in this collection',
          });
          resolve(undefined);
          return;
        }

        // Insert document record
        const docResult = await query(`
          INSERT INTO rag_documents (
            id, collection_id, tenant_id, original_filename, mime_type,
            size_bytes, file_path, file_sha256, extraction_status, uploaded_by_id,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9, NOW(), NOW())
          RETURNING *
        `, [
          documentId,
          req.params.collectionId,
          tenantId,
          filename,
          mimeType,
          storageResult.size,
          storageResult.path,
          storageResult.sha256,
          userId,
        ]);

        logAudit({
          actorType: 'user',
          actorId: userId,
          action: 'rag.document.upload',
          targetType: 'rag_document',
          targetId: documentId,
          metadata: { collectionId: req.params.collectionId, filename, size: storageResult.size },
          tenantId: tenantId,
          ipAddress: getClientIp(req),
        });

        // Queue extraction job (inline for now, could be async)
        processDocumentExtraction(documentId, tenantId).catch(err => {
          console.error(`Extraction failed for document ${documentId}:`, err);
        });

        res.status(202).json({
          data: docResult.rows[0],
          message: 'Document uploaded. Extraction in progress.',
        });
        resolve(undefined);
      } catch (error) {
        reject(error);
      }
    });

    bb.on('close', () => {
      if (!hasFile) {
        reject(ApiError.badRequest('No file provided'));
      }
    });

    bb.on('error', reject);
    req.pipe(bb);
  });
}));

/**
 * GET /api/rag/documents/:id
 * Get document details
 */
ragAdminRouter.get('/documents/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId } = getAuthContext(req);

  const result = await query(`
    SELECT d.*, c.name as collection_name, c.scope, c.team_id AS "teamId"
    FROM rag_documents d
    JOIN rag_collections c ON c.id = d.collection_id
    WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
  `, [req.params.id, tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Document not found');
  }

  res.json({ data: result.rows[0] });
}));

/**
 * GET /api/rag/documents/:id/chunks
 * Get document chunks
 */
ragAdminRouter.get('/documents/:id/chunks', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId } = getAuthContext(req);
  const documentId = req.params.id;

  // Verify document exists and user has access
  const docResult = await query(`
    SELECT d.id FROM rag_documents d
    JOIN rag_collections c ON c.id = d.collection_id
    WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
  `, [documentId, tenantId]);

  if (docResult.rows.length === 0) {
    throw ApiError.notFound('Document not found');
  }

  // Get chunks with pagination
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = (page - 1) * limit;

  const chunksResult = await query(`
    SELECT
      id,
      chunk_index AS "chunkIndex",
      content,
      token_count AS "tokenCount",
      page_number AS "pageNumber",
      created_at AS "createdAt"
    FROM rag_chunks
    WHERE document_id = $1 AND tenant_id = $2
    ORDER BY chunk_index
    LIMIT $3 OFFSET $4
  `, [documentId, tenantId, limit, offset]);

  const countResult = await query(`
    SELECT COUNT(*) as total FROM rag_chunks
    WHERE document_id = $1 AND tenant_id = $2
  `, [documentId, tenantId]);

  res.json({
    data: chunksResult.rows,
    meta: {
      page,
      limit,
      total: parseInt(countResult.rows[0].total),
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
    },
  });
}));

/**
 * GET /api/rag/documents/:id/status
 * Get document extraction status
 */
ragAdminRouter.get('/documents/:id/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId } = getAuthContext(req);

  const result = await query(`
    SELECT
      extraction_status AS "extractionStatus",
      extraction_error AS "extractionError",
      chunk_count AS "chunkCount"
    FROM rag_documents
    WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
  `, [req.params.id, tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Document not found');
  }

  res.json({ data: result.rows[0] });
}));

/**
 * POST /api/rag/documents/:id/reindex
 * Re-index document (delete chunks and re-extract)
 */
ragAdminRouter.post('/documents/:id/reindex', requireRole('TEAM_ADMIN', 'TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId, userId } = getAuthContext(req);

  const result = await query(`
    SELECT d.*, c.scope, c.team_id AS "teamId"
    FROM rag_documents d
    JOIN rag_collections c ON c.id = d.collection_id
    WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
  `, [req.params.id, tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Document not found');
  }

  // Delete existing chunks
  await query(`DELETE FROM rag_chunks WHERE document_id = $1`, [req.params.id]);

  // Reset status
  await query(`
    UPDATE rag_documents
    SET extraction_status = 'PENDING', extraction_error = NULL, chunk_count = 0, updated_at = NOW()
    WHERE id = $1
  `, [req.params.id]);

  // Queue extraction
  processDocumentExtraction(req.params.id, tenantId).catch(err => {
    console.error(`Re-extraction failed for document ${req.params.id}:`, err);
  });

  logAudit({
    actorType: 'user',
    actorId: userId,
    action: 'rag.document.reindex',
    targetType: 'rag_document',
    targetId: req.params.id,
    tenantId: tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(202).json({ message: 'Re-indexing started' });
}));

/**
 * DELETE /api/rag/documents/:id
 * Soft delete document
 */
ragAdminRouter.delete('/documents/:id', requireRole('TEAM_ADMIN', 'TENANT_ADMIN'), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId, userId } = getAuthContext(req);

  const result = await query(`
    SELECT d.*, c.scope, c.team_id AS "teamId"
    FROM rag_documents d
    JOIN rag_collections c ON c.id = d.collection_id
    WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
  `, [req.params.id, tenantId]);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Document not found');
  }

  // Soft delete document (chunks will be orphaned but ignored in queries)
  await query(`
    UPDATE rag_documents SET deleted_at = NOW() WHERE id = $1
  `, [req.params.id]);

  logAudit({
    actorType: 'user',
    actorId: userId,
    action: 'rag.document.delete',
    targetType: 'rag_document',
    targetId: req.params.id,
    oldValue: result.rows[0],
    tenantId: tenantId,
    ipAddress: getClientIp(req),
  });

  res.status(204).send();
}));

/**
 * GET /api/rag/documents/:id/view
 * Stream document file for viewing/download
 */
ragAdminRouter.get('/documents/:id/view', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { tenantId, userId } = getAuthContext(req);

  const result = await query(`
    SELECT
      d.*,
      d.original_filename AS "originalFilename",
      d.mime_type AS "mimeType",
      c.scope,
      c.team_id AS "teamId"
    FROM rag_documents d
    JOIN rag_collections c ON c.id = d.collection_id
    WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
  `, [req.params.id, tenantId]);

  if (result.rows.length === 0) {
    // Return 404 (not 403) to avoid leaking existence
    throw ApiError.notFound('Document not found');
  }

  const doc = result.rows[0];

  // Check team access for team-scoped collections
  if (doc.scope === 'TEAM' && doc.teamId) {
    const teamCheck = await query(`
      SELECT 1 FROM team_members WHERE user_id = $1 AND team_id = $2
    `, [userId, doc.teamId]);

    if (teamCheck.rows.length === 0 && req.user?.role !== 'TENANT_ADMIN') {
      throw ApiError.notFound('Document not found');
    }
  }

  const storage = getDocumentStorage();
  const fileStream = await storage.get(tenantId, req.params.id, doc.originalFilename);

  // Set headers
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${doc.originalFilename}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');

  // Log view
  logAudit({
    actorType: 'user',
    actorId: userId,
    action: 'rag.document.view',
    targetType: 'rag_document',
    targetId: req.params.id,
    tenantId: tenantId,
    ipAddress: getClientIp(req),
  });

  fileStream.pipe(res);
}));

// ============================================================================
// Document Extraction Pipeline
// ============================================================================

/**
 * Extract text from document, chunk, and embed
 */
async function processDocumentExtraction(documentId: string, tenantId: string): Promise<void> {
  // Update status to extracting
  await query(`
    UPDATE rag_documents SET extraction_status = 'EXTRACTING', updated_at = NOW()
    WHERE id = $1
  `, [documentId]);

  try {
    // Get document info
    const docResult = await query(`
      SELECT
        *,
        original_filename AS "originalFilename",
        mime_type AS "mimeType"
      FROM rag_documents WHERE id = $1
    `, [documentId]);

    if (docResult.rows.length === 0) {
      throw new Error('Document not found');
    }

    const doc = docResult.rows[0];
    const storage = getDocumentStorage();

    // Read file
    const fileStream = await storage.get(tenantId, documentId, doc.originalFilename);
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) {
      chunks.push(chunk as Buffer);
    }
    const fileContent = Buffer.concat(chunks);

    // Extract text based on mime type
    let text: string;
    switch (doc.mimeType) {
      case 'text/plain':
      case 'text/markdown':
        text = fileContent.toString('utf-8');
        break;
      case 'text/html':
        // Simple HTML to text (strip tags)
        text = fileContent.toString('utf-8').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        break;
      case 'application/pdf': {
        // PDF extraction requires pdf-parse library
        const pdfParseModule = await import('pdf-parse') as any;
        const pdfParseFn = pdfParseModule.default || pdfParseModule;
        const pdfData = await pdfParseFn(fileContent);
        text = pdfData.text;
        break;
      }
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        // DOCX extraction requires mammoth
        const mammoth = await import('mammoth');
        const mammothResult = await mammoth.extractRawText({ buffer: fileContent });
        text = mammothResult.value;
        break;
      default:
        throw new Error(`Unsupported file type: ${doc.mimeType}`);
    }

    // Chunk the text
    const textChunks = chunkText(text, { maxChunkSize: 800, overlap: 200 });

    if (textChunks.length === 0) {
      throw new Error('No text content extracted from document');
    }

    // Get embedding client
    const embeddingClient = createEmbeddingClient('openai');

    // Process chunks in batches
    const BATCH_SIZE = 50;
    let totalChunks = 0;

    for (let i = 0; i < textChunks.length; i += BATCH_SIZE) {
      const batch = textChunks.slice(i, i + BATCH_SIZE);

      // Generate embeddings - pass as EmbeddingRequest
      const embeddingResponse = await embeddingClient.embed({ input: batch });

      // Insert chunks with embeddings
      for (let j = 0; j < batch.length; j++) {
        const chunkIndex = i + j;
        const chunkContent = batch[j];
        const embeddingResult = embeddingResponse.embeddings[j];

        await query(`
          INSERT INTO rag_chunks (id, document_id, tenant_id, chunk_index, content, token_count, embedding, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW())
        `, [
          createId(),
          documentId,
          tenantId,
          chunkIndex,
          chunkContent,
          Math.ceil(chunkContent.length / 4), // Rough token estimate
          `[${embeddingResult.embedding.join(',')}]`,
        ]);

        totalChunks++;
      }
    }

    // Update document status
    await query(`
      UPDATE rag_documents
      SET extraction_status = 'EXTRACTED', chunk_count = $2, updated_at = NOW()
      WHERE id = $1
    `, [documentId, totalChunks]);

  } catch (error) {
    console.error(`Document extraction failed for ${documentId}:`, error);

    await query(`
      UPDATE rag_documents
      SET extraction_status = 'FAILED', extraction_error = $2, updated_at = NOW()
      WHERE id = $1
    `, [documentId, (error as Error).message]);
  }
}

/**
 * Chunk text into segments with overlap
 * Exported for testing
 */
export function chunkText(
  text: string,
  options: { maxChunkSize?: number; overlap?: number } = {}
): string[] {
  const { maxChunkSize = 800, overlap = 200 } = options;

  // Split by paragraphs first
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // If paragraph fits in current chunk
    if (currentChunk.length + trimmedPara.length + 2 <= maxChunkSize) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${trimmedPara}` : trimmedPara;
    } else {
      // Save current chunk if not empty
      if (currentChunk) {
        chunks.push(currentChunk);
      }

      // If paragraph itself is too long, split by sentences
      if (trimmedPara.length > maxChunkSize) {
        const sentences = trimmedPara.split(/(?<=[.!?])\s+/);
        currentChunk = '';

        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 1 <= maxChunkSize) {
            currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk);
              // Add overlap from end of previous chunk
              const words = currentChunk.split(' ');
              const overlapText = words.slice(-Math.ceil(overlap / 5)).join(' ');
              currentChunk = overlapText ? `${overlapText} ${sentence}` : sentence;
            } else {
              // Sentence is too long, just add it
              chunks.push(sentence);
              currentChunk = '';
            }
          }
        }
      } else {
        // Add overlap from previous chunk
        if (chunks.length > 0) {
          const prevChunk = chunks[chunks.length - 1];
          const words = prevChunk.split(' ');
          const overlapText = words.slice(-Math.ceil(overlap / 5)).join(' ');
          currentChunk = overlapText ? `${overlapText}\n\n${trimmedPara}` : trimmedPara;
        } else {
          currentChunk = trimmedPara;
        }
      }
    }
  }

  // Don't forget the last chunk
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
