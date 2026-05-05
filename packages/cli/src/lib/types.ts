/**
 * CLI Types
 */

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: number // Unix timestamp
}

export interface UserInfo {
  userId: string
  email: string
  name: string
  tenantId: string
  tenantName: string
  role: string
  teams: Array<{ id: string; name: string; role: string }>
}

export interface DeviceCodeResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface TokenResponse {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  tokenType: string
}

export interface StatusInfo {
  authenticated: boolean
  user?: UserInfo
  tokenExpiresAt?: number
  apiEndpoint: string
}

export interface CliConfig {
  apiUrl: string
  lastSync?: string
  syncedSkills?: SyncedSkill[]
  syncedMcpServers?: SyncedMcpServer[]
}

export interface SyncedSkill {
  id: string
  name: string
  version: number
  sha256: string
  syncedAt: string
}

export interface SyncedMcpServer {
  id: string
  name: string
  version: string
  sha256: string
  syncedAt: string
}

export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  AUTH_REQUIRED: 2,
} as const

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES]
