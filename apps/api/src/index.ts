// Load environment variables FIRST before any other imports
import { config } from 'dotenv';
config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { pino } from 'pino';

// Import route modules
import { authRouter } from './routes/auth.js';
import { oauthRouter } from './routes/oauth.js';
import { agentsRouter } from './routes/agents.js';
import { eventsRouter } from './routes/events.js';
import { dashboardRouter } from './routes/dashboard.js';
import { adminRouter } from './routes/admin.js';
import { analyticsRouter } from './routes/analytics.js';
import { complianceRouter } from './routes/compliance.js';
import { costsRouter } from './routes/costs.js';
import { toolsRouter } from './routes/tools.js';
import { workflowsRouter } from './routes/workflows.js';
import { gatewayRouter } from './routes/gateway.js';
import { infraRouter } from './routes/infra.js';
import { journalRouter } from './routes/journal.js';
import { incidentsRouter } from './routes/incidents.js';
import { notificationsRouter } from './routes/notifications.js';
import { securityRouter } from './routes/security.js';
import { healthRouter } from './routes/health.js';
import { skillsRouter } from './routes/skills.js';
import { llmRouter } from './routes/llm.js';
import { embeddingRouter } from './routes/embedding.js';
import { ragRouter } from './routes/rag.js';
import { ragAdminRouter } from './routes/rag-admin.js';
import { ragChatRouter } from './routes/rag-chat.js';
import { mcpRouter } from './routes/mcp.js';
import { usageRouter } from './routes/usage.js';
import { teamsRouter } from './routes/teams.js';
import { modelsRouter } from './routes/models.js';
import { virtualKeysRouter } from './routes/virtual-keys.js';
import { cliRoutingRouter } from './routes/cli-routing.js';

// Import middleware
import { errorHandler } from './middleware/error-handler.js';
import { requestAuth, optionalAuth } from './middleware/request-auth.js';
import { tenantContext } from './middleware/tenant-context.js';
import { rateLimiter } from './middleware/rate-limiter.js';

// Bundle: requestAuth then tenantContext. Every authenticated route gets a
// `req.dbTx` factory that wraps Prisma transactions with the correct
// `app.current_tenant` GUC for RLS enforcement.
const authChain = [requestAuth, tenantContext];

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

const app = express();
const port = parseInt(process.env.PORT || '3001', 10);

// Security middleware
app.use(helmet());

// CORS - allow frontend origins
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3002')
  .split(',')
  .map(o => o.trim());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

// Rate limiting
app.use(rateLimiter);

// Health check (no auth required)
app.use('/api/health', healthRouter);

// Auth routes (some endpoints don't require auth)
app.use('/api/auth', authRouter);
app.use('/api/auth', oauthRouter);

// Protected routes — authChain = [requestAuth, tenantContext]
app.use('/api/agents', authChain, agentsRouter);
app.use('/api/events', authChain, eventsRouter);
app.use('/api/dashboard', authChain, dashboardRouter);
app.use('/api/admin', authChain, adminRouter);
app.use('/api/admin/teams', authChain, teamsRouter);
app.use('/api/analytics', authChain, analyticsRouter);
app.use('/api/compliance', authChain, complianceRouter);
app.use('/api/costs', authChain, costsRouter);
app.use('/api/tools', authChain, toolsRouter);
app.use('/api/workflows', authChain, workflowsRouter);
app.use('/api/gateway', authChain, gatewayRouter);
app.use('/api/infra', authChain, infraRouter);
app.use('/api/journal', authChain, journalRouter);
app.use('/api/incidents', authChain, incidentsRouter);
app.use('/api/notifications', authChain, notificationsRouter);
app.use('/api/security', authChain, securityRouter);
app.use('/api/skills', authChain, skillsRouter);
app.use('/api/llm', authChain, llmRouter);
app.use('/api/embedding', authChain, embeddingRouter);
app.use('/api/rag', authChain, ragRouter);
app.use('/api/rag', authChain, ragChatRouter);
app.use('/api/admin/rag', authChain, ragAdminRouter);
app.use('/api/mcp', authChain, mcpRouter);
// Alias: frontend admin pages call /api/admin/mcp; same router.
app.use('/api/admin/mcp', authChain, mcpRouter);
app.use('/api/models', authChain, modelsRouter);
app.use('/api/virtual-keys', authChain, virtualKeysRouter);
app.use('/api/cli', authChain, cliRoutingRouter);

// Usage API - Uses optionalAuth for privacy-first design
// POST /events returns 204 even without auth (graceful degradation)
// Other endpoints have their own requireRole middleware for protection
app.use('/api/usage', optionalAuth, usageRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(port, '0.0.0.0', () => {
  logger.info(`OppMon Backend API running on port ${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { app };
