/**
 * OAuth 2.0 Provider Configuration
 *
 * Uses the Arctic library for OAuth flows
 * Currently supports GitHub, can add more providers
 */

import { GitHub } from "arctic";

// Environment variables
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const GITHUB_REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI ||
  "http://localhost:3001/api/auth/github/callback";

// Initialize GitHub OAuth client
export const github = new GitHub(GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URI);

// GitHub user info types
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

/**
 * Fetch GitHub user profile
 */
export async function getGitHubUser(
  accessToken: string
): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub user: ${response.statusText}`);
  }

  return response.json() as Promise<GitHubUser>;
}

/**
 * Fetch GitHub user emails (in case primary email is not public)
 */
export async function getGitHubEmails(
  accessToken: string
): Promise<GitHubEmail[]> {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub emails: ${response.statusText}`);
  }

  return response.json() as Promise<GitHubEmail[]>;
}

/**
 * Get primary email from GitHub user
 */
export async function getPrimaryEmail(accessToken: string): Promise<string> {
  const emails = await getGitHubEmails(accessToken);
  const primary = emails.find((e) => e.primary && e.verified);

  if (!primary) {
    const verified = emails.find((e) => e.verified);
    if (!verified) {
      throw new Error("No verified email found on GitHub account");
    }
    return verified.email;
  }

  return primary.email;
}

/**
 * Check if OAuth is configured
 */
export function isOAuthConfigured(): boolean {
  return Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET);
}

/**
 * OAuth provider configuration
 */
export const oauthConfig = {
  github: {
    clientId: GITHUB_CLIENT_ID,
    redirectUri: GITHUB_REDIRECT_URI,
    scopes: ["read:user", "user:email"],
    configured: Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
  },
} as const;
