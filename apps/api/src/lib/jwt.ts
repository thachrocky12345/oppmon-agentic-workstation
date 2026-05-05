/**
 * JWT Utilities with Team Context
 *
 * Provides JWT signing and verification with support for
 * multi-tenant team memberships
 */

import jwt from "jsonwebtoken";
import type { JWTClaims, TeamMembership, Role, TeamRole } from "@arkon/shared";

const JWT_SECRET =
  process.env.JWT_SECRET || "development-secret-change-in-production";
const JWT_EXPIRES_IN: jwt.SignOptions["expiresIn"] = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];
const JWT_ISSUER = "arkon";

/**
 * Sign a JWT with user and team context
 */
export function signToken(payload: {
  userId: string;
  email: string;
  tenantId: string;
  role: Role;
  teams: TeamMembership[];
}): string {
  const claims: Omit<JWTClaims, "iat" | "exp"> = {
    sub: payload.userId,
    email: payload.email,
    tenantId: payload.tenantId,
    role: payload.role,
    teams: payload.teams,
  };

  return jwt.sign(claims, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: JWT_ISSUER,
  });
}

/**
 * Verify and decode a JWT
 */
export function verifyToken(token: string): JWTClaims {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
    });

    if (typeof decoded === "string") {
      throw new Error("Invalid token format");
    }

    return decoded as JWTClaims;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error("Token has expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error("Invalid token");
    }
    throw error;
  }
}

/**
 * Decode a JWT without verification (for debugging)
 */
export function decodeToken(token: string): JWTClaims | null {
  const decoded = jwt.decode(token);

  if (!decoded || typeof decoded === "string") {
    return null;
  }

  return decoded as JWTClaims;
}

/**
 * Check if user has a specific team role
 */
export function hasTeamRole(
  claims: JWTClaims,
  teamId: string,
  role: TeamRole
): boolean {
  const team = claims.teams.find((t) => t.teamId === teamId);
  if (!team) return false;

  // ADMIN has all permissions
  if (team.role === "ADMIN") return true;

  return team.role === role;
}

/**
 * Check if user is a member of a team
 */
export function isTeamMember(claims: JWTClaims, teamId: string): boolean {
  return claims.teams.some((t) => t.teamId === teamId);
}

/**
 * Check if user is tenant admin
 */
export function isTenantAdmin(claims: JWTClaims): boolean {
  return claims.role === "TENANT_ADMIN";
}

/**
 * Get all team IDs user belongs to
 */
export function getUserTeamIds(claims: JWTClaims): string[] {
  return claims.teams.map((t) => t.teamId);
}

export { JWT_SECRET, JWT_EXPIRES_IN, JWT_ISSUER };
