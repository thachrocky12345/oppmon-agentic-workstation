/**
 * Arkon AI Gateway Router
 *
 * Routes API requests to tenant-specific LiteLLM containers based on virtual key prefix.
 *
 * Endpoints:
 * - POST /v1/messages          - Anthropic Messages API (proxied)
 * - POST /v1/chat/completions  - OpenAI Chat API (proxied)
 * - POST /v1/completions       - OpenAI Completions API (proxied)
 * - POST /v1/embeddings        - Embeddings API (proxied)
 * - GET  /health               - Router health check
 * - GET  /ready                - Readiness check (requires downstream health)
 */

import { config } from 'dotenv';
config();

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pino } from 'pino';
import { authMiddleware, createProxy } from './proxy.js';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

const app = express();
const port = parseInt(process.env.PORT || '3003', 10);

// Security middleware
app.use(helmet());

// CORS - allow all origins for API access
app.use(cors());

// Health check endpoints
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'arkon-router',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', async (_req: Request, res: Response) => {
  try {
    // TODO: Check that at least one downstream container is healthy
    res.json({
      status: 'ready',
      service: 'arkon-router',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      service: 'arkon-router',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Model info endpoint (returns available models for authenticated tenant)
app.get(
  '/v1/models',
  authMiddleware,
  createProxy()
);

// API routes - all proxied through auth + proxy middleware
const proxyRoutes = [
  '/v1/messages',           // Anthropic Messages API
  '/v1/chat/completions',   // OpenAI Chat API
  '/v1/completions',        // OpenAI Completions API
  '/v1/embeddings',         // Embeddings API
];

const proxy = createProxy();

for (const route of proxyRoutes) {
  app.post(route, authMiddleware, proxy);
}

// Catch-all for other /v1/* routes
app.all('/v1/*', authMiddleware, proxy);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: 'Not found',
      type: 'not_found',
    },
  });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
  logger.error({ err }, 'Unhandled error');

  res.status(500).json({
    error: {
      message: 'Internal server error',
      type: 'internal_error',
    },
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  logger.info(`Arkon Router running on port ${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { app };
