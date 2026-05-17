// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Doctor Command
 *
 * Diagnostic tool to check system health and fix common issues.
 * Helps users troubleshoot problems with authentication, network,
 * sync state, and Claude Code integration.
 */

import chalk from 'chalk'
import { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { getTokens } from '../lib/credentials.js'
import { getApiUrl } from '../lib/config.js'
import { EXIT_CODES } from '../lib/types.js'

// Check result interface
interface CheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  suggestion?: string
  fixable?: boolean
  fix?: () => Promise<void>
}

// Symbols for output
const PASS = chalk.green('✓')
const WARN = chalk.yellow('⚠')
const FAIL = chalk.red('✗')

/**
 * Format duration in human-readable form
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = Math.floor((timestamp - now) / 1000)

  if (diff < 0) {
    return 'expired'
  }

  if (diff < 60) {
    return `in ${diff} seconds`
  }

  if (diff < 3600) {
    const minutes = Math.floor(diff / 60)
    return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`
  }

  if (diff < 86400) {
    const hours = Math.floor(diff / 3600)
    return `in ${hours} hour${hours !== 1 ? 's' : ''}`
  }

  const days = Math.floor(diff / 86400)
  return `in ${days} day${days !== 1 ? 's' : ''}`
}

/**
 * Check authentication status
 */
async function checkAuth(): Promise<CheckResult> {
  const tokens = await getTokens()

  if (!tokens?.accessToken) {
    return {
      name: 'Authentication',
      status: 'fail',
      message: 'No authentication token found',
      suggestion: 'Run `tag login` to authenticate',
      fixable: false,
    }
  }

  // Check expiration
  if (tokens.expiresAt) {
    const now = Math.floor(Date.now() / 1000)
    if (tokens.expiresAt < now) {
      return {
        name: 'Authentication',
        status: 'fail',
        message: 'Token expired',
        suggestion: 'Run `tag login` to re-authenticate',
        fixable: false,
      }
    }

    const expiresIn = formatRelativeTime(tokens.expiresAt * 1000)
    return {
      name: 'Authentication',
      status: 'pass',
      message: `Token valid, expires ${expiresIn}`,
    }
  }

  return {
    name: 'Authentication',
    status: 'pass',
    message: 'Token present (no expiration info)',
  }
}

/**
 * Check network connectivity to API
 */
async function checkNetwork(): Promise<CheckResult> {
  const apiUrl = getApiUrl()
  const start = Date.now()

  try {
    const response = await fetch(`${apiUrl}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    const latency = Date.now() - start

    if (response.ok) {
      if (latency > 2000) {
        return {
          name: 'Network',
          status: 'warn',
          message: `API reachable but slow (${latency}ms)`,
          suggestion: 'Network seems slow, some operations may timeout',
        }
      }
      return {
        name: 'Network',
        status: 'pass',
        message: `API reachable (${latency}ms)`,
      }
    }

    return {
      name: 'Network',
      status: 'warn',
      message: `API returned ${response.status}`,
      suggestion: 'API may be having issues',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    if (message.includes('ECONNREFUSED')) {
      return {
        name: 'Network',
        status: 'fail',
        message: `Cannot connect to API at ${apiUrl}`,
        suggestion: `Check if the API server is running, or set TAG_API_URL to the correct endpoint`,
      }
    }

    if (message.includes('timeout') || message.includes('abort')) {
      return {
        name: 'Network',
        status: 'fail',
        message: 'API request timed out',
        suggestion: 'Check your network connection',
      }
    }

    return {
      name: 'Network',
      status: 'fail',
      message: `Network error: ${message}`,
      suggestion: 'Check your network connection and API endpoint',
    }
  }
}

/**
 * Check Claude Code integration
 */
async function checkClaudeCode(): Promise<CheckResult> {
  const claudeDir = join(homedir(), '.claude')

  // Check if Claude Code is installed
  if (!existsSync(claudeDir)) {
    return {
      name: 'Claude Code',
      status: 'warn',
      message: 'Claude Code directory not found',
      suggestion: 'Install Claude Code to use skills',
    }
  }

  // Check for hooks directory
  const hooksDir = join(claudeDir, 'hooks')
  const hookFile = join(hooksDir, 'postToolUse.sh')

  if (!existsSync(hookFile)) {
    return {
      name: 'Claude Code',
      status: 'warn',
      message: 'Event hooks not installed',
      suggestion: 'Run `tag hooks install` to enable usage tracking',
      fixable: true,
      fix: async () => {
        // Create hooks directory if needed
        if (!existsSync(hooksDir)) {
          mkdirSync(hooksDir, { recursive: true })
        }

        // Create basic hook script
        const hookScript = `#!/bin/bash
# OppMon event collection hook
# This sends tool usage events to the OppMon API

# Only send if enabled
if [ -f ~/.tag/events_enabled ]; then
  curl -s -X POST "$(cat ~/.tag/api_url 2>/dev/null || echo 'http://localhost:3001')/api/events" \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $(cat ~/.tag/access_token 2>/dev/null)" \\
    -d '{"tool": "'"$TOOL_NAME"'", "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' \\
    > /dev/null 2>&1 &
fi
`
        writeFileSync(hookFile, hookScript, { mode: 0o755 })
      },
    }
  }

  return {
    name: 'Claude Code',
    status: 'pass',
    message: 'Claude Code configured with hooks',
  }
}

/**
 * Check sync state
 */
async function checkSyncState(): Promise<CheckResult> {
  const tagDir = join(homedir(), '.tag')
  const stateFile = join(tagDir, 'state.json')

  // Check if state file exists
  if (!existsSync(stateFile)) {
    return {
      name: 'Sync State',
      status: 'warn',
      message: 'No sync state (first sync not run)',
      suggestion: 'Run `tag sync skills pull` to sync skills',
    }
  }

  // Try to parse the state file
  try {
    const content = readFileSync(stateFile, 'utf-8')
    const state = JSON.parse(content)

    // Validate basic structure
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid state format')
    }

    const skillCount = state.skills ? Object.keys(state.skills).length : 0
    const mcpCount = state.mcpServers ? Object.keys(state.mcpServers).length : 0

    return {
      name: 'Sync State',
      status: 'pass',
      message: `Valid (${skillCount} skills, ${mcpCount} MCP servers)`,
    }
  } catch (error) {
    return {
      name: 'Sync State',
      status: 'fail',
      message: 'Sync state corrupted',
      suggestion: 'Run `tag doctor --fix` to repair',
      fixable: true,
      fix: async () => {
        // Backup corrupted file
        if (existsSync(stateFile)) {
          const backupFile = `${stateFile}.backup.${Date.now()}`
          const content = readFileSync(stateFile)
          writeFileSync(backupFile, content)
        }

        // Create fresh state
        const freshState = {
          version: 1,
          lastSync: null,
          skills: {},
          mcpServers: {},
        }
        writeFileSync(stateFile, JSON.stringify(freshState, null, 2))
      },
    }
  }
}

/**
 * Check CLI installation
 */
async function checkInstallation(): Promise<CheckResult> {
  const tagDir = join(homedir(), '.tag')

  // Check if .tag directory exists
  if (!existsSync(tagDir)) {
    return {
      name: 'Installation',
      status: 'warn',
      message: 'Configuration directory not found',
      suggestion: 'Run `tag init` to set up the CLI',
      fixable: true,
      fix: async () => {
        mkdirSync(tagDir, { recursive: true })
      },
    }
  }

  return {
    name: 'Installation',
    status: 'pass',
    message: 'CLI configured correctly',
  }
}

/**
 * Run all diagnostic checks
 */
async function runAllChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // Run checks in order of dependency
  results.push(await checkInstallation())
  results.push(await checkAuth())
  results.push(await checkNetwork())
  results.push(await checkClaudeCode())
  results.push(await checkSyncState())

  return results
}

/**
 * Run a specific check by name
 */
async function runCheck(name: string): Promise<CheckResult | null> {
  switch (name.toLowerCase()) {
    case 'auth':
    case 'authentication':
      return checkAuth()
    case 'network':
    case 'api':
      return checkNetwork()
    case 'claude':
    case 'claudecode':
    case 'claude-code':
      return checkClaudeCode()
    case 'sync':
    case 'state':
      return checkSyncState()
    case 'install':
    case 'installation':
      return checkInstallation()
    default:
      return null
  }
}

/**
 * Print a check result
 */
function printResult(result: CheckResult): void {
  const symbol = result.status === 'pass' ? PASS : result.status === 'warn' ? WARN : FAIL
  const nameColor = result.status === 'pass' ? chalk.green : result.status === 'warn' ? chalk.yellow : chalk.red

  console.log(`${symbol} ${nameColor(result.name)}`)
  console.log(`   ${result.message}`)

  if (result.suggestion) {
    console.log(`   ${chalk.dim('→')} ${chalk.dim(result.suggestion)}`)
  }
}

/**
 * Print summary of all results
 */
function printSummary(results: CheckResult[]): void {
  const passed = results.filter(r => r.status === 'pass').length
  const warnings = results.filter(r => r.status === 'warn').length
  const failed = results.filter(r => r.status === 'fail').length

  console.log()
  console.log(chalk.bold('Summary:'), `${chalk.green(passed)} passed, ${chalk.yellow(warnings)} warnings, ${chalk.red(failed)} errors`)
}

export function createDoctorCommand(): Command {
  const command = new Command('doctor')
    .description('Diagnose and fix common issues')
    .argument('[check]', 'Specific check to run (auth, network, claude, sync, install)')
    .option('--fix', 'Attempt to automatically fix detected issues')
    .option('--json', 'Output as JSON')
    .action(async (check: string | undefined, options: { fix?: boolean; json?: boolean }) => {
      try {
        let results: CheckResult[]

        if (check) {
          // Run specific check
          const result = await runCheck(check)
          if (!result) {
            if (options.json) {
              console.log(JSON.stringify({ error: `Unknown check: ${check}` }))
            } else {
              console.error(chalk.red(`Unknown check: ${check}`))
              console.log()
              console.log('Available checks: auth, network, claude, sync, install')
            }
            process.exit(EXIT_CODES.ERROR)
          }
          results = [result]
        } else {
          // Run all checks
          results = await runAllChecks()
        }

        // Apply fixes if requested
        if (options.fix) {
          for (const result of results) {
            if (result.fixable && result.fix) {
              if (!options.json) {
                console.log(chalk.dim(`Fixing: ${result.name}...`))
              }
              await result.fix()
              // Re-run the check to update status
              if (check) {
                const updated = await runCheck(check)
                if (updated) {
                  results[0] = updated
                }
              }
            }
          }

          // Re-run all checks to show updated status
          if (!check) {
            results = await runAllChecks()
          }
        }

        // Output results
        if (options.json) {
          const output = results.map(r => ({
            name: r.name,
            status: r.status,
            message: r.message,
            suggestion: r.suggestion,
            fixable: r.fixable || false,
          }))

          const summary = {
            passed: results.filter(r => r.status === 'pass').length,
            warnings: results.filter(r => r.status === 'warn').length,
            errors: results.filter(r => r.status === 'fail').length,
          }

          console.log(JSON.stringify({ checks: output, summary }, null, 2))
        } else {
          console.log()
          console.log(chalk.bold('OppMon CLI Diagnostics'))
          console.log()

          for (const result of results) {
            printResult(result)
            console.log()
          }

          printSummary(results)

          // Suggest --fix if there are fixable issues
          const fixable = results.filter(r => r.fixable && r.status !== 'pass')
          if (fixable.length > 0 && !options.fix) {
            console.log()
            console.log(chalk.dim(`Run \`tag doctor --fix\` to attempt automatic repairs.`))
          }
        }

        // Exit with appropriate code
        const hasErrors = results.some(r => r.status === 'fail')
        process.exit(hasErrors ? EXIT_CODES.ERROR : EXIT_CODES.SUCCESS)
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({ error: (error as Error).message }))
        } else {
          console.error(chalk.red('Doctor check failed:'), (error as Error).message)
        }
        process.exit(EXIT_CODES.ERROR)
      }
    })

  return command
}
