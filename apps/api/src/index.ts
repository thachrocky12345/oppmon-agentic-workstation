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
import { mcpRouter } from './routes/mcp.js';
import { usageRouter } from './routes/usage.js';
import { teamsRouter } from './routes/teams.js';
import { modelsRouter } from './routes/models.js';
import { virtualKeysRouter } from './routes/virtual-keys.js';
import { cliRoutingRouter } from './routes/cli-routing.js';

// Import middleware
import { errorHandler } from './middleware/error-handler.js';
import { requestAuth, optionalAuth } from './middleware/request-auth.js';
import { rateLimiter } from './middleware/rate-limiter.js';

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

// Protected routes
app.use('/api/agents', requestAuth, agentsRouter);
app.use('/api/events', requestAuth, eventsRouter);
app.use('/api/dashboard', requestAuth, dashboardRouter);
app.use('/api/admin', requestAuth, adminRouter);
app.use('/api/admin/teams', requestAuth, teamsRouter);
app.use('/api/analytics', requestAuth, analyticsRouter);
app.use('/api/compliance', requestAuth, complianceRouter);
app.use('/api/costs', requestAuth, costsRouter);
app.use('/api/tools', requestAuth, toolsRouter);
app.use('/api/workflows', requestAuth, workflowsRouter);
app.use('/api/gateway', requestAuth, gatewayRouter);
app.use('/api/infra', requestAuth, infraRouter);
app.use('/api/journal', requestAuth, journalRouter);
app.use('/api/incidents', requestAuth, incidentsRouter);
app.use('/api/notifications', requestAuth, notificationsRouter);
app.use('/api/security', requestAuth, securityRouter);
app.use('/api/skills', requestAuth, skillsRouter);
app.use('/api/llm', requestAuth, llmRouter);
app.use('/api/embedding', requestAuth, embeddingRouter);
app.use('/api/rag', requestAuth, ragRouter);
app.use('/api/mcp', requestAuth, mcpRouter);
app.use('/api/models', requestAuth, modelsRouter);
app.use('/api/virtual-keys', requestAuth, virtualKeysRouter);
app.use('/api/cli', requestAuth, cliRoutingRouter);

// Usage API - Uses optionalAuth for privacy-first design
// POST /events returns 204 even without auth (graceful degradation)
// Other endpoints have their own requireRole middleware for protection
app.use('/api/usage', optionalAuth, usageRouter);

// Error handling
app.use(errorHandler);

// Start server
app.listen(port, '0.0.0.0', () => {
  logger.info(`Arkon Backend API running on port ${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export { app };
