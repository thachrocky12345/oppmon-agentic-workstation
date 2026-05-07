import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { createId } from '@paralleldrive/cuid2';
import { query } from '../lib/db.js';
import { asyncHandler, ApiError } from '../middleware/error-handler.js';
import { requestAuth, AuthenticatedRequest } from '../middleware/request-auth.js';
import { getTokenVersion } from '../lib/token-version.js';
import { prisma } from '@oppmon/database';
import { SYSTEM_TENANT_ID } from '@oppmon/shared';

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
const DEVICE_CODE_EXPIRES_IN = 300; // 5 minutes
const DEVICE_CODE_INTERVAL = 5; // 5 seconds polling interval

// In-memory store for device codes (use Redis in production)
interface DeviceCodeEntry {
  deviceCode: string;
  userCode: string;
  expiresAt: number;
  userId?: string;
  authorized: boolean;
  denied: boolean;
}

const deviceCodes = new Map<string, DeviceCodeEntry>();

// Cleanup expired device codes periodically
setInterval(() => {
  const now = Date.now();
  Array.from(deviceCodes.entries()).forEach(([code, entry]) => {
    if (entry.expiresAt < now) {
      deviceCodes.delete(code);
    }
  });
}, 60000); // Every minute

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
authRouter.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  // Find user by email (using snake_case column names)
  const result = await query<{
    id: string;
    email: string;
    password_hash: string;
    role: string;
    tenant_id: string;
    name: string | null;
    is_active: boolean;
  }>(
    'SELECT id, email, password_hash, role, tenant_id, name, is_active FROM users WHERE email = $1',
    [email.toLowerCase()],
  );

  if (result.rows.length === 0) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw ApiError.unauthorized('Account is deactivated');
  }

  // Verify password
  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Generate JWT — embed token version snapshot for event-driven revocation.
  // `issuer: 'oppmon'` MUST match the verifier in apps/web/src/middleware.ts;
  // omitting it causes the edge middleware to reject the token and bounce the
  // user back to /login.
  const tv = await getTokenVersion(user.id);
  const isSystem = user.tenant_id === SYSTEM_TENANT_ID;
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      tv,
      ...(isSystem ? { isSystem: true } : {}),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: 'oppmon' },
  );

  // Update updated_at timestamp
  await query('UPDATE users SET updated_at = NOW() WHERE id = $1', [user.id]);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenant_id,
    },
  });
}));

/**
 * POST /api/auth/register
 * Create a new user account
 */
authRouter.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name } = registerSchema.parse(req.body);

  // Check if email already exists
  const existing = await query(
    'SELECT id FROM users WHERE email = $1',
    [email.toLowerCase()],
  );

  if (existing.rows.length > 0) {
    throw ApiError.conflict('Email already registered');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Generate IDs (Prisma's cuid() is client-side, so we need to generate for raw SQL)
  const tenantId = createId();
  const userId = createId();

  // Create default tenant for new user (using snake_case column names)
  await query(
    `INSERT INTO tenants (id, name, slug, is_active, created_at, updated_at) VALUES ($1, $2, $3, true, NOW(), NOW())`,
    [tenantId, name || email.split('@')[0], `tenant-${Date.now()}`],
  );

  // Create user - name defaults to email prefix if not provided
  const userName = name || email.split('@')[0];
  await query(
    `INSERT INTO users (id, email, password_hash, name, role, tenant_id, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())`,
    [userId, email.toLowerCase(), passwordHash, userName, 'TENANT_ADMIN', tenantId],
  );

  // Seed the token version row so subsequent revocations have a counter to bump.
  await prisma.tokenVersion.create({ data: { userId, version: 1 } });

  // Generate JWT — embed initial token version (1).
  // `issuer` must match the web edge middleware verifier.
  const token = jwt.sign(
    {
      sub: userId,
      email: email.toLowerCase(),
      role: 'TENANT_ADMIN',
      tenantId,
      tv: 1,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: 'oppmon' },
  );

  res.status(201).json({
    token,
    user: {
      id: userId,
      email: email.toLowerCase(),
      name: userName,
      role: 'TENANT_ADMIN',
      tenantId,
    },
  });
}));

/**
 * POST /api/auth/logout
 * Invalidate the current session
 * Note: Does not require auth - just clears the client-side cookie
 */
authRouter.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  // In a more complete implementation, you'd invalidate the token
  // by adding it to a blacklist or using short-lived tokens with refresh tokens

  // Clear the auth cookie
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax');

  // Redirect to login page (for form submissions)
  const acceptHeader = req.get('Accept') || '';
  if (acceptHeader.includes('text/html')) {
    res.redirect('/login');
  } else {
    res.json({ success: true });
  }
}));

/**
 * GET /api/auth/me
 * Get current user info with tenant and team memberships
 */
authRouter.get('/me', requestAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Get user info (using snake_case column names)
  const userResult = await query<{
    id: string;
    email: string;
    name: string | null;
    role: string;
    tenant_id: string;
    created_at: Date;
  }>(
    'SELECT id, email, name, role, tenant_id, created_at FROM users WHERE id = $1',
    [req.user!.id],
  );

  if (userResult.rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  const user = userResult.rows[0];

  // Get tenant info
  const tenantResult = await query<{
    id: string;
    name: string;
    slug: string;
  }>(
    'SELECT id, name, slug FROM tenants WHERE id = $1',
    [user.tenant_id],
  );

  const tenant = tenantResult.rows[0];

  // Get team memberships
  const teamsResult = await query<{
    team_id: string;
    team_name: string;
    role: string;
  }>(
    `SELECT tm.team_id, t.name as team_name, tm.role
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id
     WHERE tm.user_id = $1`,
    [user.id],
  );

  const teams = teamsResult.rows.map(row => ({
    teamId: row.team_id,
    teamName: row.team_name,
    role: row.role,
  }));

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tenantId: user.tenant_id,
    },
    tenant: tenant ? {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
    } : null,
    teams,
    createdAt: user.created_at,
  });
}));

/**
 * GET /api/auth/sessions
 * List active sessions for current user
 */
authRouter.get('/sessions', requestAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const result = await query(
    `SELECT id, created_at, user_agent, ip_address
     FROM user_sessions
     WHERE user_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [req.user!.id],
  );

  res.json(result.rows);
}));

// ============================================================================
// Device Code Flow (RFC 8628) - For CLI Authentication
// ============================================================================

/**
 * Generate a user-friendly code (e.g., "ABCD-1234")
 */
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O to avoid confusion
  const nums = '23456789'; // No 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  code += '-';
  for (let i = 0; i < 4; i++) {
    code += nums.charAt(Math.floor(Math.random() * nums.length));
  }
  return code;
}

/**
 * POST /api/auth/device/code
 * Initiate device code flow for CLI authentication
 */
authRouter.post('/device/code', asyncHandler(async (req: Request, res: Response) => {
  const deviceCode = randomBytes(32).toString('hex');
  const userCode = generateUserCode();
  const expiresAt = Date.now() + (DEVICE_CODE_EXPIRES_IN * 1000);

  // Store the device code
  deviceCodes.set(deviceCode, {
    deviceCode,
    userCode,
    expiresAt,
    authorized: false,
    denied: false,
  });

  // Also index by user code for web UI lookup
  deviceCodes.set(userCode, deviceCodes.get(deviceCode)!);

  const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;

  res.json({
    deviceCode,
    userCode,
    verificationUri: `${baseUrl}/device`,
    verificationUriComplete: `${baseUrl}/device?code=${userCode}`,
    expiresIn: DEVICE_CODE_EXPIRES_IN,
    interval: DEVICE_CODE_INTERVAL,
  });
}));

/**
 * POST /api/auth/device/token
 * Poll for token after user authorizes device code
 */
authRouter.post('/device/token', asyncHandler(async (req: Request, res: Response) => {
  const { deviceCode } = z.object({
    deviceCode: z.string(),
  }).parse(req.body);

  const entry = deviceCodes.get(deviceCode);

  if (!entry) {
    throw ApiError.badRequest('Invalid device code');
  }

  // Check expiration
  if (entry.expiresAt < Date.now()) {
    deviceCodes.delete(deviceCode);
    deviceCodes.delete(entry.userCode);
    res.status(400).json({ error: 'expired_token' });
    return;
  }

  // Check if denied
  if (entry.denied) {
    deviceCodes.delete(deviceCode);
    deviceCodes.delete(entry.userCode);
    res.status(400).json({ error: 'access_denied' });
    return;
  }

  // Check if not yet authorized
  if (!entry.authorized || !entry.userId) {
    res.status(400).json({ error: 'authorization_pending' });
    return;
  }

  // Get user info for token
  const userResult = await query<{
    id: string;
    email: string;
    role: string;
    tenant_id: string;
    name: string | null;
  }>(
    'SELECT id, email, role, tenant_id, name FROM users WHERE id = $1',
    [entry.userId],
  );

  if (userResult.rows.length === 0) {
    throw ApiError.notFound('User not found');
  }

  const user = userResult.rows[0];

  // Generate JWT
  const expiresIn = 86400; // 24 hours for CLI tokens
  const tv = await getTokenVersion(user.id);
  const isSystem = user.tenant_id === SYSTEM_TENANT_ID;
  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      tv,
      ...(isSystem ? { isSystem: true } : {}),
    },
    JWT_SECRET,
    { expiresIn, issuer: 'oppmon' },
  );

  // Generate refresh token
  const refreshToken = randomBytes(32).toString('hex');

  // Clean up device code
  deviceCodes.delete(deviceCode);
  deviceCodes.delete(entry.userCode);

  res.json({
    accessToken,
    refreshToken,
    expiresIn,
    tokenType: 'Bearer',
  });
}));

/**
 * POST /api/auth/device/authorize
 * Web UI calls this to authorize a device code
 */
authRouter.post('/device/authorize', requestAuth, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { userCode, action } = z.object({
    userCode: z.string(),
    action: z.enum(['approve', 'deny']),
  }).parse(req.body);

  const entry = deviceCodes.get(userCode);

  if (!entry) {
    throw ApiError.badRequest('Invalid or expired code');
  }

  if (entry.expiresAt < Date.now()) {
    deviceCodes.delete(entry.deviceCode);
    deviceCodes.delete(userCode);
    throw ApiError.badRequest('Code has expired');
  }

  if (action === 'approve') {
    entry.authorized = true;
    entry.userId = req.user!.id;
  } else {
    entry.denied = true;
  }

  res.json({ success: true });
}));

/**
 * GET /api/auth/device/verify
 * Check if a user code is valid (for web UI)
 */
authRouter.get('/device/verify', asyncHandler(async (req: Request, res: Response) => {
  const { code } = z.object({
    code: z.string(),
  }).parse(req.query);

  const entry = deviceCodes.get(code);

  if (!entry || entry.expiresAt < Date.now()) {
    res.json({ valid: false });
    return;
  }

  res.json({
    valid: true,
    expiresIn: Math.floor((entry.expiresAt - Date.now()) / 1000),
  });
}));

/**
 * POST /api/auth/refresh
 * Refresh an access token using a refresh token
 */
authRouter.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = z.object({
    refreshToken: z.string(),
  }).parse(req.body);

  // In a full implementation, you'd validate the refresh token from a database
  // For now, we accept any refresh token and require the user to re-authenticate
  // if the access token is completely expired

  res.status(400).json({
    error: 'invalid_grant',
    message: 'Refresh token invalid or expired. Please re-authenticate.',
  });
}));
