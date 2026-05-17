// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * MCP Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import {
  hashMcpConfig,
  listLocalMcpServers,
  getLocalMcpServer,
  setLocalMcpServer,
  removeLocalMcpServer,
  readMcpConfig,
  writeMcpConfig,
} from '../lib/mcp.js'

describe('MCP Module', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `tag-mcp-test-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('hashMcpConfig', () => {
    it('returns consistent SHA256 hash', () => {
      const config = {
        command: 'npx',
        args: ['-y', '@some/mcp-server'],
        env: { API_KEY: 'test' },
      }

      const hash1 = hashMcpConfig(config)
      const hash2 = hashMcpConfig(config)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64)
    })

    it('returns different hashes for different configs', () => {
      const config1 = { command: 'npx', args: ['-y', 'server1'] }
      const config2 = { command: 'npx', args: ['-y', 'server2'] }

      const hash1 = hashMcpConfig(config1)
      const hash2 = hashMcpConfig(config2)

      expect(hash1).not.toBe(hash2)
    })

    it('handles missing optional fields', () => {
      const config = { command: 'node' }

      const hash = hashMcpConfig(config)

      expect(hash).toHaveLength(64)
    })
  })

  describe('readMcpConfig / writeMcpConfig', () => {
    it('writes and reads config file', async () => {
      const config = {
        mcpServers: {
          'test-server': {
            command: 'npx',
            args: ['-y', '@test/mcp'],
            env: { KEY: 'value' },
          },
        },
      }

      await writeMcpConfig(config, tempDir)

      const read = await readMcpConfig(tempDir)

      expect(read).toEqual(config)
    })

    it('returns null for non-existent config', async () => {
      const read = await readMcpConfig(tempDir)
      expect(read).toBeNull()
    })
  })

  describe('local MCP server operations', () => {
    it('sets and gets an MCP server', async () => {
      // Initialize with empty config first
      await writeMcpConfig({ mcpServers: {} }, tempDir)

      const server = await setLocalMcpServer(
        'my-server',
        {
          command: 'node',
          args: ['server.js'],
          env: { PORT: '3000' },
        },
        tempDir
      )

      expect(server.name).toBe('my-server')
      expect(server.command).toBe('node')
      expect(server.args).toEqual(['server.js'])
      expect(server.env).toEqual({ PORT: '3000' })
      expect(server.sha256).toHaveLength(64)

      const retrieved = await getLocalMcpServer('my-server', tempDir)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.name).toBe('my-server')
      expect(retrieved!.command).toBe('node')
    })

    it('lists all MCP servers', async () => {
      await writeMcpConfig({ mcpServers: {} }, tempDir)

      await setLocalMcpServer('server-a', { command: 'npx', args: ['a'] }, tempDir)
      await setLocalMcpServer('server-b', { command: 'npx', args: ['b'] }, tempDir)
      await setLocalMcpServer('server-c', { command: 'npx', args: ['c'] }, tempDir)

      const servers = await listLocalMcpServers(tempDir)

      expect(servers).toHaveLength(3)
      expect(servers.map((s) => s.name)).toEqual(['server-a', 'server-b', 'server-c'])
    })

    it('removes an MCP server', async () => {
      await writeMcpConfig({ mcpServers: {} }, tempDir)
      await setLocalMcpServer('to-remove', { command: 'node' }, tempDir)

      const beforeRemove = await getLocalMcpServer('to-remove', tempDir)
      expect(beforeRemove).not.toBeNull()

      const removed = await removeLocalMcpServer('to-remove', tempDir)
      expect(removed).toBe(true)

      const afterRemove = await getLocalMcpServer('to-remove', tempDir)
      expect(afterRemove).toBeNull()
    })

    it('returns null for non-existent server', async () => {
      await writeMcpConfig({ mcpServers: {} }, tempDir)

      const server = await getLocalMcpServer('non-existent', tempDir)
      expect(server).toBeNull()
    })

    it('returns false when removing non-existent server', async () => {
      await writeMcpConfig({ mcpServers: {} }, tempDir)

      const removed = await removeLocalMcpServer('non-existent', tempDir)
      expect(removed).toBe(false)
    })
  })
})
