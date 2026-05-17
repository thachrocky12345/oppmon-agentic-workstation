// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * CLI Configuration Management
 *
 * Manages persistent configuration stored at ~/.tag/config.json
 */

import Conf from 'conf'
import type { CliConfig, SyncedSkill, SyncedMcpServer } from './types.js'

const DEFAULT_API_URL = process.env.TAG_API_URL || 'http://localhost:3001'

interface ConfigSchema {
  apiUrl: string
  lastSync?: string
  syncedSkills: SyncedSkill[]
  syncedMcpServers: SyncedMcpServer[]
}

const config = new Conf<ConfigSchema>({
  projectName: 'tag',
  projectSuffix: '',
  defaults: {
    apiUrl: DEFAULT_API_URL,
    syncedSkills: [],
    syncedMcpServers: [],
  },
})

export function getConfig(): CliConfig {
  return {
    apiUrl: config.get('apiUrl'),
    lastSync: config.get('lastSync'),
    syncedSkills: config.get('syncedSkills'),
    syncedMcpServers: config.get('syncedMcpServers'),
  }
}

export function getApiUrl(): string {
  return config.get('apiUrl')
}

export function setApiUrl(url: string): void {
  config.set('apiUrl', url)
}

export function getLastSync(): string | undefined {
  return config.get('lastSync')
}

export function setLastSync(timestamp: string): void {
  config.set('lastSync', timestamp)
}

export function getSyncedSkills(): SyncedSkill[] {
  return config.get('syncedSkills')
}

export function setSyncedSkills(skills: SyncedSkill[]): void {
  config.set('syncedSkills', skills)
}

export function getSyncedMcpServers(): SyncedMcpServer[] {
  return config.get('syncedMcpServers')
}

export function setSyncedMcpServers(servers: SyncedMcpServer[]): void {
  config.set('syncedMcpServers', servers)
}

export function clearConfig(): void {
  config.clear()
}

export function getConfigPath(): string {
  return config.path
}
