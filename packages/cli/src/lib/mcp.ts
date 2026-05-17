// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Local MCP Configuration Management
 *
 * Manages .mcp.json files for MCP server configurations.
 * Standard Claude MCP format:
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "command": "npx",
 *       "args": ["-y", "@some/mcp-server"],
 *       "env": {}
 *     }
 *   }
 * }
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpConfigFile {
  mcpServers: Record<string, McpServerConfig>
}

export interface LocalMcpServer {
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  sha256: string
}

const MCP_FILE_NAMES = ['.mcp.json', 'mcp.json']
const CLAUDE_DIR = '.claude'

/**
 * Find the project root (directory containing .claude or .mcp.json)
 */
export async function findProjectRoot(startDir?: string): Promise<string | null> {
  let dir = startDir || process.cwd()

  while (dir !== path.parse(dir).root) {
    // Check for .mcp.json
    for (const filename of MCP_FILE_NAMES) {
      const mcpPath = path.join(dir, filename)
      try {
        await fs.access(mcpPath)
        return dir
      } catch {
        // File doesn't exist, continue
      }
    }

    // Check for .claude directory
    const claudeDir = path.join(dir, CLAUDE_DIR)
    try {
      const stat = await fs.stat(claudeDir)
      if (stat.isDirectory()) {
        return dir
      }
    } catch {
      // Directory doesn't exist, continue
    }

    dir = path.dirname(dir)
  }

  return null
}

/**
 * Get the MCP config file path
 */
export async function getMcpConfigPath(projectRoot?: string): Promise<string | null> {
  const root = projectRoot || (await findProjectRoot())
  if (!root) return null

  // Check existing files first
  for (const filename of MCP_FILE_NAMES) {
    const mcpPath = path.join(root, filename)
    try {
      await fs.access(mcpPath)
      return mcpPath
    } catch {
      // File doesn't exist
    }
  }

  // Default to .mcp.json
  return path.join(root, '.mcp.json')
}

/**
 * Calculate SHA256 hash of MCP server config
 */
export function hashMcpConfig(config: McpServerConfig): string {
  const content = JSON.stringify({
    command: config.command,
    args: config.args || [],
    env: config.env || {},
  })
  return crypto.createHash('sha256').update(content).digest('hex')
}

/**
 * Read the MCP config file
 */
export async function readMcpConfig(projectRoot?: string): Promise<McpConfigFile | null> {
  const configPath = await getMcpConfigPath(projectRoot)
  if (!configPath) return null

  try {
    const content = await fs.readFile(configPath, 'utf-8')
    return JSON.parse(content) as McpConfigFile
  } catch {
    return null
  }
}

/**
 * Write the MCP config file
 */
export async function writeMcpConfig(
  config: McpConfigFile,
  projectRoot?: string
): Promise<string> {
  const root = projectRoot || (await findProjectRoot()) || process.cwd()
  const configPath = path.join(root, '.mcp.json')

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
  return configPath
}

/**
 * List all local MCP servers from config file
 */
export async function listLocalMcpServers(projectRoot?: string): Promise<LocalMcpServer[]> {
  const config = await readMcpConfig(projectRoot)
  if (!config || !config.mcpServers) return []

  const servers: LocalMcpServer[] = []

  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    servers.push({
      name,
      command: serverConfig.command,
      args: serverConfig.args || [],
      env: serverConfig.env || {},
      sha256: hashMcpConfig(serverConfig),
    })
  }

  return servers.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get a single local MCP server by name
 */
export async function getLocalMcpServer(
  name: string,
  projectRoot?: string
): Promise<LocalMcpServer | null> {
  const config = await readMcpConfig(projectRoot)
  if (!config || !config.mcpServers || !config.mcpServers[name]) return null

  const serverConfig = config.mcpServers[name]
  return {
    name,
    command: serverConfig.command,
    args: serverConfig.args || [],
    env: serverConfig.env || {},
    sha256: hashMcpConfig(serverConfig),
  }
}

/**
 * Add or update an MCP server in config
 */
export async function setLocalMcpServer(
  name: string,
  serverConfig: McpServerConfig,
  projectRoot?: string
): Promise<LocalMcpServer> {
  let config = await readMcpConfig(projectRoot)
  if (!config) {
    config = { mcpServers: {} }
  }
  if (!config.mcpServers) {
    config.mcpServers = {}
  }

  config.mcpServers[name] = {
    command: serverConfig.command,
    args: serverConfig.args || [],
    env: serverConfig.env || {},
  }

  await writeMcpConfig(config, projectRoot)

  return {
    name,
    command: serverConfig.command,
    args: serverConfig.args || [],
    env: serverConfig.env || {},
    sha256: hashMcpConfig(serverConfig),
  }
}

/**
 * Remove an MCP server from config
 */
export async function removeLocalMcpServer(
  name: string,
  projectRoot?: string
): Promise<boolean> {
  const config = await readMcpConfig(projectRoot)
  if (!config || !config.mcpServers || !config.mcpServers[name]) return false

  delete config.mcpServers[name]
  await writeMcpConfig(config, projectRoot)
  return true
}

/**
 * Check if MCP config file exists
 */
export async function mcpConfigExists(projectRoot?: string): Promise<boolean> {
  const configPath = await getMcpConfigPath(projectRoot)
  if (!configPath) return false

  try {
    await fs.access(configPath)
    return true
  } catch {
    return false
  }
}

/**
 * Initialize an empty MCP config file
 */
export async function initMcpConfig(projectRoot?: string): Promise<string> {
  const config: McpConfigFile = { mcpServers: {} }
  return writeMcpConfig(config, projectRoot)
}
