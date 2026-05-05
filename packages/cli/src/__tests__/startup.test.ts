/**
 * CLI Startup Performance Tests
 *
 * Ensures CLI starts within acceptable time limits.
 * Day 13: DX improvements - CLI should start fast.
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import * as path from 'path'

const CLI_PATH = path.resolve(__dirname, '../../dist/index.js')

describe('CLI Startup Performance', () => {
  it('CLI --help executes under 1000ms', () => {
    const start = Date.now()

    try {
      execSync(`node "${CLI_PATH}" --help`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      })
    } catch {
      // Help may exit with 0 or 1, we just care about timing
    }

    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
  })

  it('CLI --version executes under 500ms', () => {
    const start = Date.now()

    try {
      execSync(`node "${CLI_PATH}" --version`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      })
    } catch {
      // Version may exit with 0 or 1, we just care about timing
    }

    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(500)
  })

  it('CLI invalid command fails quickly under 1000ms', () => {
    const start = Date.now()

    try {
      execSync(`node "${CLI_PATH}" nonexistent-command 2>&1`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      })
    } catch {
      // Expected to fail, we just care about timing
    }

    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
  })
})

describe('CLI Help Text Completeness', () => {
  it('all main commands have help text', () => {
    const commands = [
      'login',
      'logout',
      'status',
      'init',
      'sync',
      'rag',
    ]

    for (const cmd of commands) {
      try {
        const output = execSync(`node "${CLI_PATH}" ${cmd} --help`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 5000,
        })

        // Should have some help content
        expect(output.length).toBeGreaterThan(50)
        // Should mention the command or Usage
        expect(output.toLowerCase()).toMatch(/(usage|options|description|commands)/i)
      } catch (error) {
        // Some commands may exit non-zero on help, check stderr
        const err = error as { stdout?: string; stderr?: string }
        const output = err.stdout || err.stderr || ''
        expect(output.length).toBeGreaterThan(0)
      }
    }
  })

  it('sub-commands have help text', () => {
    const subCommands = [
      'sync skills',
      'sync mcp',
      'rag ingest',
      'rag search',
      'rag query',
      'rag list',
      'rag status',
    ]

    for (const cmd of subCommands) {
      try {
        const output = execSync(`node "${CLI_PATH}" ${cmd} --help`, {
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 5000,
        })

        expect(output.length).toBeGreaterThan(20)
      } catch (error) {
        const err = error as { stdout?: string; stderr?: string }
        const output = err.stdout || err.stderr || ''
        // At minimum should have some output
        expect(output.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('CLI Error Messages', () => {
  it('unknown command shows helpful error', () => {
    try {
      execSync(`node "${CLI_PATH}" nonexistent-command 2>&1`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 5000,
      })
      // Should have exited with error
      expect.fail('Should have thrown an error')
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; status?: number }
      const output = (err.stdout || '') + (err.stderr || '')

      // Should indicate unknown command
      expect(output.toLowerCase()).toContain('unknown command')
      // Should suggest help
      expect(output.toLowerCase()).toContain('help')
    }
  })
})
