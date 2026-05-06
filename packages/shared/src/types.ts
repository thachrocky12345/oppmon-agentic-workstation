/**
 * Shared types for the OppMon platform
 */

// ============================================================================
// Role Enums
// ============================================================================

export enum Role {
  TENANT_ADMIN = "TENANT_ADMIN",
  TEAM_ADMIN = "TEAM_ADMIN",
  MEMBER = "MEMBER",
}

export enum TeamRole {
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
}

export enum AgentStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  ERROR = "ERROR",
  PENDING = "PENDING",
}

export enum IncidentSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum IncidentStatus {
  OPEN = "OPEN",
  INVESTIGATING = "INVESTIGATING",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

// ============================================================================
// JWT & Auth Types
// ============================================================================

export interface TeamMembership {
  teamId: string;
  teamName: string;
  role: TeamRole;
}

export interface JWTClaims {
  /** User ID (subject) */
  sub: string;
  /** User email */
  email: string;
  /** Tenant ID */
  tenantId: string;
  /** User's role within the tenant */
  role: Role;
  /** Teams the user belongs to */
  teams: TeamMembership[];
  /** Token issued at (Unix timestamp) */
  iat: number;
  /** Token expiration (Unix timestamp) */
  exp: number;
}

export interface OAuthProvider {
  id: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
}

// ============================================================================
// API Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export interface ApiMeta {
  timestamp: string;
  requestId: string;
}

// ============================================================================
// Entity Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Team {
  id: string;
  name: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMember {
  id: string;
  userId: string;
  teamId: string;
  role: TeamRole;
  createdAt: Date;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  status: AgentStatus;
  tenantId: string;
  teamId?: string;
  config: Record<string, unknown>;
  lastSeen?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Incident {
  id: string;
  agentId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: Date;
  resolvedAt?: Date;
}
