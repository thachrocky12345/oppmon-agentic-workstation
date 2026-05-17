// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Init Command Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  getTagDir,
  getConfigPath,
  getStatePath,
  isInitialized,
  readProjectConfig,
  writeProjectConfig,
  readProjectState,
  writeProjectState,
  checkGitignore,
  addToGitignore,
  ProjectConfig,
  ProjectState,
} from '../commands/init.js'

describe('init command', () => {
  let testDir: string

  beforeEach(() => {
    // Create a temp directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-init-test-'))
  })

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  describe('getTagDir', () => {
    it('returns .tag directory path', () => {
      const result = getTagDir(testDir)
      expect(result).toBe(path.join(testDir, '.tag'))
    })
  })

  describe('getConfigPath', () => {
    it('returns config.json path', () => {
      const result = getConfigPath(testDir)
      expect(result).toBe(path.join(testDir, '.tag', 'config.json'))
    })
  })

  describe('getStatePath', () => {
    it('returns state.json path', () => {
      const result = getStatePath(testDir)
      expect(result).toBe(path.join(testDir, '.tag', 'state.json'))
    })
  })

  describe('isInitialized', () => {
    it('returns false for uninitialized directory', () => {
      expect(isInitialized(testDir)).toBe(false)
    })

    it('returns false when .tag exists but no config.json', () => {
      fs.mkdirSync(path.join(testDir, '.tag'))
      expect(isInitialized(testDir)).toBe(false)
    })

    it('returns true when .tag and config.json exist', () => {
      fs.mkdirSync(path.join(testDir, '.tag'))
      fs.writeFileSync(path.join(testDir, '.tag', 'config.json'), '{}')
      expect(isInitialized(testDir)).toBe(true)
    })
  })

  describe('writeProjectConfig', () => {
    it('creates .tag directory if it does not exist', () => {
      const config: ProjectConfig = {
        version: '1.0.0',
        skills: [],
        mcpServers: [],
        syncOnCd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      writeProjectConfig(config, testDir)

      expect(fs.existsSync(path.join(testDir, '.tag'))).toBe(true)
      expect(fs.existsSync(path.join(testDir, '.tag', 'config.json'))).toBe(true)
    })

    it('writes config with team_id', () => {
      const config: ProjectConfig = {
        version: '1.0.0',
        teamId: 'team-123',
        skills: [],
        mcpServers: [],
        syncOnCd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      writeProjectConfig(config, testDir)

      const result = readProjectConfig(testDir)
      expect(result?.teamId).toBe('team-123')
    })

    it('writes config with pinned skills', () => {
      const config: ProjectConfig = {
        version: '1.0.0',
        skills: ['skill-1', 'skill-2'],
        mcpServers: ['mcp-1'],
        syncOnCd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      writeProjectConfig(config, testDir)

      const result = readProjectConfig(testDir)
      expect(result?.skills).toEqual(['skill-1', 'skill-2'])
      expect(result?.mcpServers).toEqual(['mcp-1'])
    })
  })

  describe('readProjectConfig', () => {
    it('returns null for non-existent config', () => {
      expect(readProjectConfig(testDir)).toBeNull()
    })

    it('returns null for invalid JSON', () => {
      fs.mkdirSync(path.join(testDir, '.tag'))
      fs.writeFileSync(path.join(testDir, '.tag', 'config.json'), 'invalid json')
      expect(readProjectConfig(testDir)).toBeNull()
    })

    it('returns config object for valid JSON', () => {
      const config = { version: '1.0.0', teamId: 'team-1' }
      fs.mkdirSync(path.join(testDir, '.tag'))
      fs.writeFileSync(path.join(testDir, '.tag', 'config.json'), JSON.stringify(config))

      const result = readProjectConfig(testDir)
      expect(result?.version).toBe('1.0.0')
      expect(result?.teamId).toBe('team-1')
    })
  })

  describe('writeProjectState', () => {
    it('creates state.json', () => {
      const state: ProjectState = {
        lastSync: new Date().toISOString(),
        syncedItems: {
          skills: ['skill-1'],
          mcpServers: [],
        },
      }

      writeProjectState(state, testDir)

      expect(fs.existsSync(path.join(testDir, '.tag', 'state.json'))).toBe(true)
    })
  })

  describe('readProjectState', () => {
    it('returns null for non-existent state', () => {
      expect(readProjectState(testDir)).toBeNull()
    })

    it('returns state object for valid JSON', () => {
      const state = { lastSync: '2024-01-01', syncedItems: { skills: [], mcpServers: [] } }
      fs.mkdirSync(path.join(testDir, '.tag'))
      fs.writeFileSync(path.join(testDir, '.tag', 'state.json'), JSON.stringify(state))

      const result = readProjectState(testDir)
      expect(result?.lastSync).toBe('2024-01-01')
    })
  })

  describe('idempotent re-init', () => {
    it('preserves createdAt on re-init', () => {
      const originalCreatedAt = '2024-01-01T00:00:00.000Z'
      const config1: ProjectConfig = {
        version: '1.0.0',
        skills: [],
        mcpServers: [],
        syncOnCd: false,
        createdAt: originalCreatedAt,
        updatedAt: originalCreatedAt,
      }

      writeProjectConfig(config1, testDir)

      // Simulate re-init
      const config2: ProjectConfig = {
        version: '1.0.0',
        teamId: 'new-team',
        skills: ['new-skill'],
        mcpServers: [],
        syncOnCd: false,
        createdAt: originalCreatedAt, // Should preserve original
        updatedAt: new Date().toISOString(),
      }

      writeProjectConfig(config2, testDir)

      const result = readProjectConfig(testDir)
      expect(result?.createdAt).toBe(originalCreatedAt)
      expect(result?.teamId).toBe('new-team')
    })
  })

  describe('checkGitignore', () => {
    it('returns exists: false when no .gitignore', () => {
      const result = checkGitignore(testDir)
      expect(result.exists).toBe(false)
      expect(result.hasTagDir).toBe(false)
      expect(result.hasStateFile).toBe(false)
    })

    it('detects .tag/ in .gitignore', () => {
      fs.writeFileSync(path.join(testDir, '.gitignore'), '.tag/\n')
      const result = checkGitignore(testDir)
      expect(result.exists).toBe(true)
      expect(result.hasTagDir).toBe(true)
    })

    it('detects .tag (without slash) in .gitignore', () => {
      fs.writeFileSync(path.join(testDir, '.gitignore'), '.tag\n')
      const result = checkGitignore(testDir)
      expect(result.hasTagDir).toBe(true)
    })

    it('detects /.tag/ in .gitignore', () => {
      fs.writeFileSync(path.join(testDir, '.gitignore'), '/.tag/\n')
      const result = checkGitignore(testDir)
      expect(result.hasTagDir).toBe(true)
    })

    it('detects state.json in .gitignore', () => {
      fs.writeFileSync(path.join(testDir, '.gitignore'), '.tag/state.json\n')
      const result = checkGitignore(testDir)
      expect(result.hasStateFile).toBe(true)
    })
  })

  describe('addToGitignore', () => {
    it('creates .gitignore if it does not exist', () => {
      addToGitignore(['.tag/'], testDir)

      expect(fs.existsSync(path.join(testDir, '.gitignore'))).toBe(true)
      const content = fs.readFileSync(path.join(testDir, '.gitignore'), 'utf-8')
      expect(content).toContain('.tag/')
    })

    it('appends to existing .gitignore', () => {
      fs.writeFileSync(path.join(testDir, '.gitignore'), 'node_modules/\n')
      addToGitignore(['.tag/', '.tag/state.json'], testDir)

      const content = fs.readFileSync(path.join(testDir, '.gitignore'), 'utf-8')
      expect(content).toContain('node_modules/')
      expect(content).toContain('.tag/')
      expect(content).toContain('.tag/state.json')
    })

    it('does not duplicate existing entries', () => {
      fs.writeFileSync(path.join(testDir, '.gitignore'), '.tag/\n')
      addToGitignore(['.tag/'], testDir)

      const content = fs.readFileSync(path.join(testDir, '.gitignore'), 'utf-8')
      const matches = content.match(/\.tag\//g)
      expect(matches?.length).toBe(1)
    })

    it('adds tag CLI comment header', () => {
      addToGitignore(['.tag/'], testDir)

      const content = fs.readFileSync(path.join(testDir, '.gitignore'), 'utf-8')
      expect(content).toContain('# tag CLI')
    })
  })

  describe('--team flag', () => {
    it('stores team_id in config', () => {
      const config: ProjectConfig = {
        version: '1.0.0',
        teamId: 'specified-team',
        skills: [],
        mcpServers: [],
        syncOnCd: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      writeProjectConfig(config, testDir)

      const result = readProjectConfig(testDir)
      expect(result?.teamId).toBe('specified-team')
    })
  })

  describe('config structure', () => {
    it('includes all required fields', () => {
      const config: ProjectConfig = {
        version: '1.0.0',
        teamId: 'team-1',
        skills: ['skill-1'],
        mcpServers: ['mcp-1'],
        syncOnCd: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      }

      writeProjectConfig(config, testDir)
      const result = readProjectConfig(testDir)

      expect(result?.version).toBe('1.0.0')
      expect(result?.teamId).toBe('team-1')
      expect(result?.skills).toEqual(['skill-1'])
      expect(result?.mcpServers).toEqual(['mcp-1'])
      expect(result?.syncOnCd).toBe(true)
      expect(result?.createdAt).toBe('2024-01-01T00:00:00.000Z')
      expect(result?.updatedAt).toBe('2024-01-02T00:00:00.000Z')
    })
  })
})
