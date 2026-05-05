/**
 * Shared constants for the Arkon platform
 */

// ============================================================================
// JWT Configuration
// ============================================================================

export const JWT_CONFIG = {
  /** Default token expiration time */
  EXPIRES_IN: "7d",
  /** Refresh token expiration time */
  REFRESH_EXPIRES_IN: "30d",
  /** Algorithm for signing tokens */
  ALGORITHM: "HS256" as const,
  /** Token issuer */
  ISSUER: "arkon",
} as const;

// ============================================================================
// OAuth Providers
// ============================================================================

export const OAUTH_PROVIDERS = {
  GITHUB: {
    id: "github",
    name: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    userUrl: "https://api.github.com/user",
    emailUrl: "https://api.github.com/user/emails",
    scopes: ["read:user", "user:email"],
  },
  GOOGLE: {
    id: "google",
    name: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scopes: ["openid", "email", "profile"],
  },
} as const;

// ============================================================================
// API Configuration
// ============================================================================

export const API_CONFIG = {
  /** Default page size for paginated responses */
  DEFAULT_PAGE_SIZE: 20,
  /** Maximum page size for paginated responses */
  MAX_PAGE_SIZE: 100,
  /** Rate limit window in milliseconds */
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  /** Maximum requests per rate limit window */
  RATE_LIMIT_MAX_REQUESTS: 100,
} as const;

// ============================================================================
// Event Types
// ============================================================================

export const EVENT_TYPES = {
  AGENT_STARTED: "agent.started",
  AGENT_STOPPED: "agent.stopped",
  AGENT_ERROR: "agent.error",
  AGENT_HEARTBEAT: "agent.heartbeat",
  REQUEST_RECEIVED: "request.received",
  REQUEST_COMPLETED: "request.completed",
  REQUEST_FAILED: "request.failed",
  THREAT_DETECTED: "threat.detected",
  COST_THRESHOLD: "cost.threshold",
} as const;

// ============================================================================
// Severity Levels
// ============================================================================

export const SEVERITY_LEVELS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
} as const;
