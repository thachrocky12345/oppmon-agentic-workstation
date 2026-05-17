// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Sync Command
 *
 * Synchronize skills and MCP servers between local files and remote API
 *
 * Usage:
 *   tag sync skills list          - Show local vs remote skills
 *   tag sync skills push [name]   - Push skill(s) to remote
 *   tag sync skills pull [name]   - Pull skill(s) from remote
 *   tag sync mcp list             - Show local vs remote MCP servers
 *   tag sync mcp push [name]      - Push MCP server(s) to remote
 *   tag sync mcp pull [name]      - Pull MCP server(s) from remote
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { createApiClient, Skill, McpServer } from '../lib/api.js'
import {
  listLocalSkills,
  getLocalSkill,
  writeLocalSkill,
  LocalSkill,
  parseSkillMetadata,
} from '../lib/skills.js'
import {
  listLocalMcpServers,
  getLocalMcpServer,
  setLocalMcpServer,
  LocalMcpServer,
} from '../lib/mcp.js'
import {
  getSyncedSkills,
  setSyncedSkills,
  getSyncedMcpServers,
  setSyncedMcpServers,
  setLastSync,
} from '../lib/config.js'
import { SyncedSkill, SyncedMcpServer, EXIT_CODES } from '../lib/types.js'
import { isAuthenticated } from '../lib/credentials.js'

// ============================================================================
// Common
// ============================================================================

type SyncStatusType = 'synced' | 'local-only' | 'remote-only' | 'modified' | 'conflict'

function requireAuth(): void {
  if (!isAuthenticated()) {
    console.error(chalk.red('Error: Not authenticated. Run "oppmon login" first.'))
    process.exit(EXIT_CODES.AUTH_REQUIRED)
  }
}

function formatStatus(status: SyncStatusType): string {
  switch (status) {
    case 'synced':
      return chalk.green('✓ synced')
    case 'local-only':
      return chalk.yellow('↑ local only')
    case 'remote-only':
      return chalk.cyan('↓ remote only')
    case 'modified':
      return chalk.blue('~ modified')
    case 'conflict':
      return chalk.red('⚠ conflict')
  }
}

// ============================================================================
// Skills Sync
// ============================================================================

interface SkillSyncStatus {
  name: string
  local: LocalSkill | null
  remote: Skill | null
  synced: SyncedSkill | null
  status: SyncStatusType
}

async function getSkillSyncStatus(): Promise<SkillSyncStatus[]> {
  const api = createApiClient()
  const [localSkills, remoteResponse, syncedSkills] = await Promise.all([
    listLocalSkills(),
    api.listSkills({ limit: 100 }),
    Promise.resolve(getSyncedSkills()),
  ])

  const remoteSkills = remoteResponse.data
  const statusMap = new Map<string, SkillSyncStatus>()

  for (const local of localSkills) {
    statusMap.set(local.name, {
      name: local.name,
      local,
      remote: null,
      synced: syncedSkills.find((s) => s.name === local.name) || null,
      status: 'local-only',
    })
  }

  for (const remote of remoteSkills) {
    const existing = statusMap.get(remote.name)
    if (existing) {
      existing.remote = remote
      if (existing.local!.sha256 === remote.sha256) {
        existing.status = 'synced'
      } else if (existing.synced) {
        const localChanged = existing.local!.sha256 !== existing.synced.sha256
        const remoteChanged = remote.sha256 !== existing.synced.sha256
        existing.status = localChanged && remoteChanged ? 'conflict' : 'modified'
      } else {
        existing.status = 'conflict'
      }
    } else {
      statusMap.set(remote.name, {
        name: remote.name,
        local: null,
        remote,
        synced: syncedSkills.find((s) => s.name === remote.name) || null,
        status: 'remote-only',
      })
    }
  }

  return Array.from(statusMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}

async function skillsListCommand(options: { json?: boolean }): Promise<void> {
  requireAuth()
  const spinner = ora('Fetching skill status...').start()

  try {
    const statuses = await getSkillSyncStatus()
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(statuses, null, 2))
      return
    }

    if (statuses.length === 0) {
      console.log(chalk.yellow('No skills found locally or remotely.'))
      console.log(chalk.dim('Create skills in .claude/skills/<name>/SKILL.md'))
      return
    }

    console.log(chalk.bold('\nSkills Sync Status:\n'))
    console.log(chalk.dim(`${'Name'.padEnd(30)} ${'Status'.padEnd(20)} ${'Local'.padEnd(10)} Remote`))
    console.log(chalk.dim('-'.repeat(75)))

    for (const status of statuses) {
      const localVersion = status.local ? `v${status.synced?.version || '?'}` : '-'
      const remoteVersion = status.remote ? `v${status.remote.version}` : '-'
      console.log(`${status.name.padEnd(30)} ${formatStatus(status.status).padEnd(30)} ${localVersion.padEnd(10)} ${remoteVersion}`)
    }

    console.log('')
    printSyncSummary(statuses.map((s) => s.status))
  } catch (error) {
    spinner.fail('Failed to fetch skill status')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

async function skillsPushCommand(name: string | undefined, options: { force?: boolean; all?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Preparing to push skills...').start()

  try {
    let skillsToPush: LocalSkill[]

    if (options.all || !name) {
      skillsToPush = await listLocalSkills()
      if (skillsToPush.length === 0) {
        spinner.fail('No local skills found')
        return
      }
    } else {
      const skill = await getLocalSkill(name)
      if (!skill) {
        spinner.fail(`Local skill "${name}" not found`)
        process.exit(EXIT_CODES.ERROR)
      }
      skillsToPush = [skill]
    }

    spinner.text = `Pushing ${skillsToPush.length} skill(s)...`

    const syncedSkills = getSyncedSkills()
    const results: { name: string; success: boolean; error?: string }[] = []

    for (const local of skillsToPush) {
      try {
        const metadata = parseSkillMetadata(local.content)
        const remote = await api.getSkillByName(local.name)

        if (remote) {
          if (remote.sha256 === local.sha256 && !options.force) {
            results.push({ name: local.name, success: true })
            continue
          }
          await api.updateSkill(remote.id, { content: local.content, description: metadata.description })
        } else {
          await api.createSkill({
            name: local.name,
            content: local.content,
            description: metadata.description,
            scope: metadata.scope || 'TEAM',
            teamId: metadata.teamId,
          })
        }

        updateSyncRecord(syncedSkills, local.name, remote?.id || local.name, remote ? remote.version + 1 : 1, local.sha256)
        results.push({ name: local.name, success: true })
      } catch (error) {
        results.push({ name: local.name, success: false, error: (error as Error).message })
      }
    }

    setSyncedSkills(syncedSkills)
    setLastSync(new Date().toISOString())
    spinner.stop()
    printResults('Push', results)
  } catch (error) {
    spinner.fail('Push failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

async function skillsPullCommand(name: string | undefined, options: { force?: boolean; all?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Fetching remote skills...').start()

  try {
    let skillsToPull: Skill[]

    if (options.all || !name) {
      const response = await api.listSkills({ limit: 100 })
      skillsToPull = response.data
      if (skillsToPull.length === 0) {
        spinner.fail('No remote skills found')
        return
      }
    } else {
      const skill = await api.getSkillByName(name)
      if (!skill) {
        spinner.fail(`Remote skill "${name}" not found`)
        process.exit(EXIT_CODES.ERROR)
      }
      skillsToPull = [skill]
    }

    spinner.text = `Pulling ${skillsToPull.length} skill(s)...`

    const syncedSkills = getSyncedSkills()
    const results: { name: string; success: boolean; error?: string }[] = []

    for (const remote of skillsToPull) {
      try {
        const local = await getLocalSkill(remote.name)

        if (local && local.sha256 !== remote.sha256 && !options.force) {
          const synced = syncedSkills.find((s) => s.name === remote.name)
          if (synced && local.sha256 !== synced.sha256) {
            results.push({ name: remote.name, success: false, error: 'Local changes exist. Use --force to overwrite.' })
            continue
          }
        }

        await writeLocalSkill(remote.name, remote.content)
        updateSyncRecord(syncedSkills, remote.name, remote.id, remote.version, remote.sha256)
        results.push({ name: remote.name, success: true })
      } catch (error) {
        results.push({ name: remote.name, success: false, error: (error as Error).message })
      }
    }

    setSyncedSkills(syncedSkills)
    setLastSync(new Date().toISOString())
    spinner.stop()
    printResults('Pull', results)
  } catch (error) {
    spinner.fail('Pull failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

// ============================================================================
// MCP Sync
// ============================================================================

interface McpSyncStatus {
  name: string
  local: LocalMcpServer | null
  remote: McpServer | null
  synced: SyncedMcpServer | null
  status: SyncStatusType
}

async function getMcpSyncStatus(): Promise<McpSyncStatus[]> {
  const api = createApiClient()
  const [localServers, remoteResponse, syncedServers] = await Promise.all([
    listLocalMcpServers(),
    api.listMcpServers({ limit: 100 }),
    Promise.resolve(getSyncedMcpServers()),
  ])

  const remoteServers = remoteResponse.data
  const statusMap = new Map<string, McpSyncStatus>()

  for (const local of localServers) {
    statusMap.set(local.name, {
      name: local.name,
      local,
      remote: null,
      synced: syncedServers.find((s) => s.name === local.name) || null,
      status: 'local-only',
    })
  }

  for (const remote of remoteServers) {
    const existing = statusMap.get(remote.name)
    if (existing) {
      existing.remote = remote
      if (existing.local!.sha256 === remote.sha256) {
        existing.status = 'synced'
      } else if (existing.synced) {
        const localChanged = existing.local!.sha256 !== existing.synced.sha256
        const remoteChanged = remote.sha256 !== existing.synced.sha256
        existing.status = localChanged && remoteChanged ? 'conflict' : 'modified'
      } else {
        existing.status = 'conflict'
      }
    } else {
      statusMap.set(remote.name, {
        name: remote.name,
        local: null,
        remote,
        synced: syncedServers.find((s) => s.name === remote.name) || null,
        status: 'remote-only',
      })
    }
  }

  return Array.from(statusMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}

async function mcpListCommand(options: { json?: boolean }): Promise<void> {
  requireAuth()
  const spinner = ora('Fetching MCP server status...').start()

  try {
    const statuses = await getMcpSyncStatus()
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(statuses, null, 2))
      return
    }

    if (statuses.length === 0) {
      console.log(chalk.yellow('No MCP servers found locally or remotely.'))
      console.log(chalk.dim('Create .mcp.json in your project root'))
      return
    }

    console.log(chalk.bold('\nMCP Servers Sync Status:\n'))
    console.log(chalk.dim(`${'Name'.padEnd(30)} ${'Status'.padEnd(20)} ${'Command'.padEnd(20)}`))
    console.log(chalk.dim('-'.repeat(75)))

    for (const status of statuses) {
      const command = status.local?.command || status.remote?.command || '-'
      console.log(`${status.name.padEnd(30)} ${formatStatus(status.status).padEnd(30)} ${command.padEnd(20)}`)
    }

    console.log('')
    printSyncSummary(statuses.map((s) => s.status))
  } catch (error) {
    spinner.fail('Failed to fetch MCP server status')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

async function mcpPushCommand(name: string | undefined, options: { force?: boolean; all?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Preparing to push MCP servers...').start()

  try {
    let serversToPush: LocalMcpServer[]

    if (options.all || !name) {
      serversToPush = await listLocalMcpServers()
      if (serversToPush.length === 0) {
        spinner.fail('No local MCP servers found')
        return
      }
    } else {
      const server = await getLocalMcpServer(name)
      if (!server) {
        spinner.fail(`Local MCP server "${name}" not found`)
        process.exit(EXIT_CODES.ERROR)
      }
      serversToPush = [server]
    }

    spinner.text = `Pushing ${serversToPush.length} MCP server(s)...`

    const syncedServers = getSyncedMcpServers()
    const results: { name: string; success: boolean; error?: string }[] = []

    for (const local of serversToPush) {
      try {
        const remote = await api.getMcpServerByName(local.name)

        if (remote) {
          if (remote.sha256 === local.sha256 && !options.force) {
            results.push({ name: local.name, success: true })
            continue
          }
          await api.updateMcpServer(remote.id, {
            command: local.command,
            args: local.args,
            env: local.env,
          })
        } else {
          await api.createMcpServer({
            name: local.name,
            command: local.command,
            args: local.args,
            env: local.env,
            scope: 'TEAM',
          })
        }

        updateMcpSyncRecord(syncedServers, local.name, remote?.id || local.name, remote?.version || '1.0.0', local.sha256)
        results.push({ name: local.name, success: true })
      } catch (error) {
        results.push({ name: local.name, success: false, error: (error as Error).message })
      }
    }

    setSyncedMcpServers(syncedServers)
    setLastSync(new Date().toISOString())
    spinner.stop()
    printResults('Push', results)
  } catch (error) {
    spinner.fail('Push failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

async function mcpPullCommand(name: string | undefined, options: { force?: boolean; all?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Fetching remote MCP servers...').start()

  try {
    let serversToPull: McpServer[]

    if (options.all || !name) {
      const response = await api.listMcpServers({ limit: 100 })
      serversToPull = response.data
      if (serversToPull.length === 0) {
        spinner.fail('No remote MCP servers found')
        return
      }
    } else {
      const server = await api.getMcpServerByName(name)
      if (!server) {
        spinner.fail(`Remote MCP server "${name}" not found`)
        process.exit(EXIT_CODES.ERROR)
      }
      serversToPull = [server]
    }

    spinner.text = `Pulling ${serversToPull.length} MCP server(s)...`

    const syncedServers = getSyncedMcpServers()
    const results: { name: string; success: boolean; error?: string }[] = []

    for (const remote of serversToPull) {
      try {
        const local = await getLocalMcpServer(remote.name)

        if (local && local.sha256 !== remote.sha256 && !options.force) {
          const synced = syncedServers.find((s) => s.name === remote.name)
          if (synced && local.sha256 !== synced.sha256) {
            results.push({ name: remote.name, success: false, error: 'Local changes exist. Use --force to overwrite.' })
            continue
          }
        }

        await setLocalMcpServer(remote.name, {
          command: remote.command,
          args: remote.args,
          env: remote.env,
        })

        updateMcpSyncRecord(syncedServers, remote.name, remote.id, remote.version, remote.sha256)
        results.push({ name: remote.name, success: true })
      } catch (error) {
        results.push({ name: remote.name, success: false, error: (error as Error).message })
      }
    }

    setSyncedMcpServers(syncedServers)
    setLastSync(new Date().toISOString())
    spinner.stop()
    printResults('Pull', results)
  } catch (error) {
    spinner.fail('Pull failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

// ============================================================================
// Helpers
// ============================================================================

function updateSyncRecord(records: SyncedSkill[], name: string, id: string, version: number, sha256: string): void {
  const idx = records.findIndex((r) => r.name === name)
  const record: SyncedSkill = { id, name, version, sha256, syncedAt: new Date().toISOString() }
  if (idx >= 0) {
    records[idx] = record
  } else {
    records.push(record)
  }
}

function updateMcpSyncRecord(records: SyncedMcpServer[], name: string, id: string, version: string, sha256: string): void {
  const idx = records.findIndex((r) => r.name === name)
  const record: SyncedMcpServer = { id, name, version, sha256, syncedAt: new Date().toISOString() }
  if (idx >= 0) {
    records[idx] = record
  } else {
    records.push(record)
  }
}

function printResults(action: string, results: { name: string; success: boolean; error?: string }[]): void {
  console.log(chalk.bold(`\n${action} Results:\n`))
  for (const result of results) {
    if (result.success) {
      console.log(chalk.green(`  ✓ ${result.name}`))
    } else {
      console.log(chalk.red(`  ✗ ${result.name}: ${result.error}`))
    }
  }

  const successful = results.filter((r) => r.success).length
  const failed = results.filter((r) => !r.success).length

  console.log('')
  console.log(chalk.dim(`${action}ed ${successful}/${results.length} successfully.`))
  if (failed > 0) {
    process.exit(EXIT_CODES.ERROR)
  }
}

function printSyncSummary(statuses: SyncStatusType[]): void {
  const synced = statuses.filter((s) => s === 'synced').length
  const localOnly = statuses.filter((s) => s === 'local-only').length
  const remoteOnly = statuses.filter((s) => s === 'remote-only').length
  const modified = statuses.filter((s) => s === 'modified').length
  const conflicts = statuses.filter((s) => s === 'conflict').length

  console.log(chalk.dim('Summary:'))
  if (synced > 0) console.log(chalk.green(`  ✓ ${synced} synced`))
  if (localOnly > 0) console.log(chalk.yellow(`  ↑ ${localOnly} local only (push to sync)`))
  if (remoteOnly > 0) console.log(chalk.cyan(`  ↓ ${remoteOnly} remote only (pull to sync)`))
  if (modified > 0) console.log(chalk.blue(`  ~ ${modified} modified`))
  if (conflicts > 0) console.log(chalk.red(`  ⚠ ${conflicts} conflicts (resolve manually)`))
}

// ============================================================================
// Command Setup
// ============================================================================

export function createSyncCommand(): Command {
  const sync = new Command('sync').description('Sync skills and MCP configurations with remote')

  // Skills subcommand group
  const skills = new Command('skills').description('Sync skills between local and remote')

  skills
    .command('list')
    .alias('ls')
    .description('Show sync status of all skills')
    .option('--json', 'Output as JSON')
    .action(skillsListCommand)

  skills
    .command('push [name]')
    .description('Push local skill(s) to remote')
    .option('-f, --force', 'Force push even if remote is newer')
    .option('-a, --all', 'Push all local skills')
    .action(skillsPushCommand)

  skills
    .command('pull [name]')
    .description('Pull remote skill(s) to local')
    .option('-f, --force', 'Force pull even if local has changes')
    .option('-a, --all', 'Pull all remote skills')
    .action(skillsPullCommand)

  sync.addCommand(skills)

  // MCP subcommand group
  const mcp = new Command('mcp').description('Sync MCP servers between local .mcp.json and remote')

  mcp
    .command('list')
    .alias('ls')
    .description('Show sync status of all MCP servers')
    .option('--json', 'Output as JSON')
    .action(mcpListCommand)

  mcp
    .command('push [name]')
    .description('Push local MCP server(s) to remote')
    .option('-f, --force', 'Force push even if remote is newer')
    .option('-a, --all', 'Push all local MCP servers')
    .action(mcpPushCommand)

  mcp
    .command('pull [name]')
    .description('Pull remote MCP server(s) to local')
    .option('-f, --force', 'Force pull even if local has changes')
    .option('-a, --all', 'Pull all remote MCP servers')
    .action(mcpPullCommand)

  sync.addCommand(mcp)

  // Routing subcommand
  const routing = new Command('routing').description('Sync AI Gateway routing configuration')

  routing
    .command('fetch')
    .description('Fetch routing config and write .envrc for AI Gateway')
    .option('--output <file>', 'Output file path', '.envrc')
    .option('--json', 'Output as JSON instead of .envrc')
    .action(routingFetchCommand)

  sync.addCommand(routing)

  // Default action: show help
  sync.action(() => {
    sync.outputHelp()
  })

  return sync
}

// ============================================================================
// Routing Sync
// ============================================================================

interface RoutingConfig {
  gatewayUrl: string
  tenantId: string
  teamId?: string
  teamName?: string
  defaultModel?: {
    displayName: string
    modelIdentifier: string
    providerTemplateId: string | null
  }
  availableModels: Array<{
    displayName: string
    modelIdentifier: string
    providerTemplateId: string | null
  }>
  virtualKey?: {
    id: string
    keyPrefix: string
    label: string | null
  }
}

async function routingFetchCommand(options: { output?: string; json?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Fetching routing configuration...').start()

  try {
    const response = await api.getRoutingConfig()
    const config: RoutingConfig = response.data

    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(config, null, 2))
      return
    }

    // Generate .envrc content
    const envrcContent = generateEnvrc(config)

    if (options.output) {
      const fs = await import('fs/promises')
      const outputPath = options.output

      // Check if file exists and ask for confirmation
      try {
        await fs.access(outputPath)
        console.log(chalk.yellow(`\nWarning: ${outputPath} already exists.`))
        console.log(chalk.dim('The tag-managed section will be updated.\n'))
      } catch {
        // File doesn't exist, that's fine
      }

      // Read existing content if any
      let existingContent = ''
      try {
        existingContent = await fs.readFile(outputPath, 'utf-8')
      } catch {
        // File doesn't exist
      }

      // Merge with existing content
      const mergedContent = mergeEnvrc(existingContent, envrcContent)
      await fs.writeFile(outputPath, mergedContent)

      console.log(chalk.green(`\n✓ Routing config written to ${outputPath}`))
      console.log(chalk.dim('\nTo activate: source ' + outputPath))
    } else {
      // Print to stdout
      console.log(envrcContent)
    }

    // Print summary
    console.log(chalk.bold('\nRouting Configuration:'))
    console.log(chalk.dim('  Gateway URL: ') + config.gatewayUrl)
    console.log(chalk.dim('  Tenant: ') + config.tenantId)
    if (config.teamName) {
      console.log(chalk.dim('  Team: ') + config.teamName)
    }
    if (config.defaultModel) {
      console.log(chalk.dim('  Default Model: ') + config.defaultModel.displayName)
    }
    console.log(chalk.dim('  Available Models: ') + config.availableModels.length)
    if (config.virtualKey) {
      console.log(chalk.dim('  API Key: ') + `sk-tag-${config.virtualKey.keyPrefix}-...`)
    } else {
      console.log(chalk.yellow('  API Key: ') + chalk.dim('None found. Run "tag virtual-key create"'))
    }

  } catch (error) {
    spinner.fail('Failed to fetch routing configuration')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

function generateEnvrc(config: RoutingConfig): string {
  const lines: string[] = [
    '# --- tag managed (do not edit manually) ---',
    `# Last synced: ${new Date().toISOString()}`,
    '',
  ]

  // Gateway URL for ANTHROPIC_BASE_URL
  lines.push(`export ANTHROPIC_BASE_URL="${config.gatewayUrl}"`)

  // Auth token (if available)
  if (config.virtualKey) {
    lines.push(`export ANTHROPIC_AUTH_TOKEN="sk-tag-${config.virtualKey.keyPrefix}-<YOUR_SECRET>"`)
    lines.push(`# Note: Replace <YOUR_SECRET> with your actual key secret`)
  }

  // Routing info as comments
  lines.push('')
  if (config.defaultModel) {
    lines.push(`# Routing: ${config.defaultModel.displayName} (${config.defaultModel.providerTemplateId || 'custom'})`)
  }
  if (config.teamName) {
    lines.push(`# Team: ${config.teamName}`)
  }

  lines.push('')
  lines.push('# --- end tag managed ---')

  return lines.join('\n')
}

function mergeEnvrc(existing: string, newContent: string): string {
  const startMarker = '# --- tag managed'
  const endMarker = '# --- end tag managed ---'

  // Find existing tag-managed section
  const startIdx = existing.indexOf(startMarker)
  const endIdx = existing.indexOf(endMarker)

  if (startIdx >= 0 && endIdx > startIdx) {
    // Replace existing section
    const before = existing.substring(0, startIdx)
    const after = existing.substring(endIdx + endMarker.length)
    return before + newContent + after
  }

  // No existing section, append
  if (existing.trim()) {
    return existing.trimEnd() + '\n\n' + newContent
  }

  return newContent
}
