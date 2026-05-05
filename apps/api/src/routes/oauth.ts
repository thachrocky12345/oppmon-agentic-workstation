/**
 * OAuth 2.0 Routes
 *
 * Handles OAuth authentication flows for GitHub and other providers
 */

import { Router, Request, Response } from "express";
import { generateState, OAuth2RequestError } from "arctic";
import { query } from "../lib/db.js";
import { asyncHandler, ApiError } from "../middleware/error-handler.js";
import {
  github,
  getGitHubUser,
  getPrimaryEmail,
  isOAuthConfigured,
  oauthConfig,
} from "../lib/oauth.js";
import { signToken } from "../lib/jwt.js";
import type { Role, TeamRole, TeamMembership } from "@arkon/shared";

export const oauthRouter = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3002";

/**
 * GET /api/auth/github
 * Initiate GitHub OAuth flow
 */
oauthRouter.get(
  "/github",
  asyncHandler(async (req: Request, res: Response) => {
    if (!oauthConfig.github.configured) {
      throw ApiError.internal("GitHub OAuth is not configured");
    }

    const state = generateState();
    const url = github.createAuthorizationURL(state, [...oauthConfig.github.scopes]);

    // Set state cookie for CSRF protection
    res.cookie("github_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10 * 1000, // 10 minutes
      sameSite: "lax",
    });

    res.redirect(url.toString());
  })
);

/**
 * GET /api/auth/github/callback
 * Handle GitHub OAuth callback
 */
oauthRouter.get(
  "/github/callback",
  asyncHandler(async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const storedState = req.cookies?.github_oauth_state;

    // Validate state for CSRF protection
    if (!code || !state || state !== storedState) {
      throw ApiError.badRequest("Invalid OAuth state");
    }

    // Clear state cookie
    res.clearCookie("github_oauth_state");

    try {
      // Exchange code for tokens
      const tokens = await github.validateAuthorizationCode(code);
      const accessToken = tokens.accessToken();

      // Get user info from GitHub
      const githubUser = await getGitHubUser(accessToken);
      const email = githubUser.email || (await getPrimaryEmail(accessToken));
      const name = githubUser.name || githubUser.login;

      // Find or create user
      let userId: string;
      let tenantId: string;
      let role: Role = "MEMBER" as Role;

      // Check if user exists
      const existingUser = await query<{
        id: string;
        tenant_id: string;
        role: string;
      }>("SELECT id, tenant_id, role FROM users WHERE email = $1", [
        email.toLowerCase(),
      ]);

      if (existingUser.rows.length > 0) {
        // Existing user - update OAuth account
        userId = existingUser.rows[0].id;
        tenantId = existingUser.rows[0].tenant_id;
        role = existingUser.rows[0].role as Role;

        // Upsert OAuth account
        await query(
          `INSERT INTO oauth_accounts (user_id, provider, provider_account_id, access_token)
           VALUES ($1, 'GITHUB', $2, $3)
           ON CONFLICT (provider, provider_account_id)
           DO UPDATE SET access_token = $3, updated_at = NOW()`,
          [userId, githubUser.id.toString(), accessToken]
        );
      } else {
        // New user - create tenant, user, and OAuth account
        const tenantResult = await query<{ id: string }>(
          `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
          [name, `tenant-${Date.now()}`]
        );
        tenantId = tenantResult.rows[0].id;
        role = "TENANT_ADMIN" as Role;

        const userResult = await query<{ id: string }>(
          `INSERT INTO users (email, name, role, tenant_id, active)
           VALUES ($1, $2, $3, $4, true)
           RETURNING id`,
          [email.toLowerCase(), name, role, tenantId]
        );
        userId = userResult.rows[0].id;

        // Create OAuth account
        await query(
          `INSERT INTO oauth_accounts (user_id, provider, provider_account_id, access_token)
           VALUES ($1, 'GITHUB', $2, $3)`,
          [userId, githubUser.id.toString(), accessToken]
        );

        // Create default team
        const teamResult = await query<{ id: string }>(
          `INSERT INTO teams (name, tenant_id) VALUES ($1, $2) RETURNING id`,
          ["Default", tenantId]
        );

        // Add user to default team as admin
        await query(
          `INSERT INTO team_members (user_id, team_id, role) VALUES ($1, $2, 'ADMIN')`,
          [userId, teamResult.rows[0].id]
        );
      }

      // Fetch team memberships
      const teamsResult = await query<{
        team_id: string;
        team_name: string;
        role: string;
      }>(
        `SELECT tm.team_id, t.name as team_name, tm.role
         FROM team_members tm
         JOIN teams t ON t.id = tm.team_id
         WHERE tm.user_id = $1`,
        [userId]
      );

      const teams: TeamMembership[] = teamsResult.rows.map((row) => ({
        teamId: row.team_id,
        teamName: row.team_name,
        role: row.role as TeamRole,
      }));

      // Generate JWT with team context
      const token = signToken({
        userId,
        email: email.toLowerCase(),
        tenantId,
        role,
        teams,
      });

      // Redirect to frontend with token
      res.redirect(`${FRONTEND_URL}/auth/callback?token=${token}`);
    } catch (error) {
      if (error instanceof OAuth2RequestError) {
        throw ApiError.badRequest("OAuth authentication failed");
      }
      throw error;
    }
  })
);

/**
 * GET /api/auth/providers
 * List available OAuth providers
 */
oauthRouter.get("/providers", (req: Request, res: Response) => {
  const providers = [];

  if (oauthConfig.github.configured) {
    providers.push({
      id: "github",
      name: "GitHub",
      authUrl: "/api/auth/github",
    });
  }

  res.json({ providers });
});

/**
 * GET /api/auth/oauth-status
 * Check OAuth configuration status
 */
oauthRouter.get("/oauth-status", (req: Request, res: Response) => {
  res.json({
    configured: isOAuthConfigured(),
    providers: {
      github: oauthConfig.github.configured,
    },
  });
});
