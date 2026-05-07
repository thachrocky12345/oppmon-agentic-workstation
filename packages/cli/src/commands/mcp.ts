/**
 * MCP Command
 *
 * Manage MCP server registry — list, show, create, update, delete, toggle.
 *
 * Usage:
 *   oppmon mcp list                           List all visible MCP servers
 *   oppmon mcp show <id|name>                 Show one server
 *   oppmon mcp create                         Interactive create wizard
 *   oppmon mcp update <id|name>               Update command/args/env/scope
 *   oppmon mcp delete <id|name>               Soft-delete a server
 *   oppmon mcp toggle <id|name>               Enable / disable
 *
 * NOTE: For local-config workflows (.mcp.json), use `oppmon sync mcp`.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { createInterface } from 'readline'
import {
  createApiClient,
  McpServer,
  CreateMcpServerInput,
  UpdateMcpServerInput,
} from '../lib/api.js'
import { isAuthenticated } from '../lib/credentials.js'
import { EXIT_CODES } from '../lib/types.js'

// ============================================================================
// Helpers
// ============================================================================

function requireAuth(): void {
  if (!isAuthenticated()) {
    console.error(chalk.red('Error: Not authenticated. Run "oppmon login" first.'))
    process.exit(EXIT_CODES.AUTH_REQUIRED)
  }
}

function fail(msg: string): never {
  console.error(chalk.red(`Error: ${msg}`))
  process.exit(EXIT_CODES.ERROR)
}

function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a)))
}

function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

/** CUIDs start with 'c' followed by 24+ alphanumerics. Anything else = name. */
function looksLikeId(s: string): boolean {
  return /^c[a-z0-9]{24,}$/i.test(s)
}

/** Resolve a server by id-or-name. */
async function resolveServer(idOrName: string): Promise<McpServer> {
  const api = createApiClient()
  if (looksLikeId(idOrName)) {
    const r = await api.getMcpServer(idOrName)
    return r.data
  }
  const r = await api.getMcpServerByName(idOrName)
  if (!r) fail(`MCP server "${idOrName}" not found`)
  return r
}

function scopeBadge(scope: 'TENANT' | 'TEAM'): string {
  return scope === 'TENANT' ? chalk.magenta('TENANT') : chalk.cyan('TEAM  ')
}

function statusBadge(enabled: boolean): string {
  return enabled ? chalk.green('● on ') : chalk.gray('○ off')
}

/** Parse "key=value key2=value2" or KEY=VAL JSON-ish into a Record. */
function parseEnv(input: string | undefined): Record<string, string> | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  if (!trimmed) return {}
  // Try JSON first
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(parsed)) out[k] = String(v)
        return out
      }
    } catch {
      fail(`--env JSON is invalid: ${trimmed}`)
    }
  }
  // Otherwise: space- or comma-separated KEY=VALUE pairs
  const out: Record<string, string> = {}
  for (const pair of trimmed.split(/[\s,]+/)) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    if (eq < 0) fail(`--env entry "${pair}" must be KEY=VALUE`)
    out[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  return out
}

/** Parse a string like "-y @some/server" into an args array. */
function parseArgs(input: string | undefined): string[] | undefined {
  if (input === undefined) return undefined
  const trimmed = input.trim()
  if (!trimmed) return []
  // Try JSON array first
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      fail(`--args JSON is invalid: ${trimmed}`)
    }
  }
  // Otherwise: shell-style whitespace split (no quote handling — keep simple)
  return trimmed.split(/\s+/)
}

// ============================================================================
// list
// ============================================================================

interface ListOptions {
  scope?: string
  search?: string
  enabled?: boolean
  disabled?: boolean
  json?: boolean
  limit?: string
}

async function listCommand(options: ListOptions): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Fetching MCP servers...').start()

  try {
    const enabled =
      options.enabled === true ? true : options.disabled === true ? false : undefined

    const response = await api.listMcpServers({
      scope: options.scope as 'TENANT' | 'TEAM' | undefined,
      search: options.search,
      enabled,
      limit: options.limit ? parseInt(options.limit, 10) : 100,
    })
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response, null, 2))
      return
    }

    const servers = response.data
    if (servers.length === 0) {
      console.log(chalk.yellow('No MCP servers found.'))
      console.log(chalk.dim('Register one: oppmon mcp create  (or: oppmon sync mcp push)'))
      return
    }

    console.log(chalk.bold(`\nMCP Servers (${response.meta?.total ?? servers.length}):\n`))
    console.log(
      chalk.dim(
        `${'Name'.padEnd(28)} ${'Scope'.padEnd(8)} ${'On'.padEnd(5)} ${'v'.padEnd(8)} ${'Command'.padEnd(20)} sha256`
      )
    )
    console.log(chalk.dim('-'.repeat(95)))

    for (const s of servers) {
      const name = truncate(s.name, 27).padEnd(28)
      const scope = scopeBadge(s.scope) + '  '
      const status = statusBadge(s.enabled).padEnd(5)
      const v = ('v' + s.version).slice(0, 8).padEnd(8)
      const cmd = truncate(s.command, 19).padEnd(20)
      const sha = chalk.dim(s.sha256.slice(0, 8))
      console.log(`${name} ${scope} ${status} ${v} ${cmd} ${sha}`)
    }

    console.log('')
    console.log(
      chalk.dim(
        `Showing ${servers.length} of ${response.meta?.total ?? servers.length}. Use --limit to widen.`
      )
    )
  } catch (error) {
    spinner.fail('Failed to fetch MCP servers')
    fail((error as Error).message)
  }
}

// ============================================================================
// show
// ============================================================================

async function showCommand(idOrName: string, options: { json?: boolean }): Promise<void> {
  requireAuth()
  const spinner = ora(`Fetching MCP server ${idOrName}...`).start()

  try {
    const server = await resolveServer(idOrName)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(server, null, 2))
      return
    }

    console.log(chalk.bold(`\n${server.name}`))
    console.log(chalk.dim('-'.repeat(60)))
    console.log(`  ${chalk.dim('id'.padEnd(15))} ${server.id}`)
    console.log(`  ${chalk.dim('scope'.padEnd(15))} ${scopeBadge(server.scope)}`)
    if (server.teamId) {
      console.log(`  ${chalk.dim('teamId'.padEnd(15))} ${server.teamId}`)
    }
    console.log(`  ${chalk.dim('enabled'.padEnd(15))} ${statusBadge(server.enabled)}`)
    console.log(`  ${chalk.dim('version'.padEnd(15))} v${server.version}`)
    console.log(`  ${chalk.dim('sha256'.padEnd(15))} ${chalk.dim(server.sha256)}`)
    console.log(`  ${chalk.dim('description'.padEnd(15))} ${server.description || chalk.dim('(none)')}`)
    console.log(`  ${chalk.dim('createdAt'.padEnd(15))} ${server.createdAt}`)
    console.log(`  ${chalk.dim('updatedAt'.padEnd(15))} ${server.updatedAt}`)

    console.log(chalk.bold('\n  command:'))
    console.log(`    ${chalk.cyan(server.command)} ${(server.args || []).map((a) => chalk.gray(a)).join(' ')}`)

    const envEntries = Object.entries(server.env || {})
    console.log(chalk.bold('\n  env:'))
    if (envEntries.length === 0) {
      console.log(`    ${chalk.dim('(empty)')}`)
    } else {
      for (const [k, v] of envEntries) {
        console.log(`    ${chalk.cyan(k)}=${chalk.gray(v)}`)
      }
    }
    console.log('')
  } catch (error) {
    spinner.fail('Failed to fetch MCP server')
    fail((error as Error).message)
  }
}

// ============================================================================
// create
// ============================================================================

interface CreateOptions {
  name?: string
  description?: string
  command?: string
  args?: string
  env?: string
  version?: string
  scope?: string
  team?: string
  off?: boolean
  yes?: boolean
}

async function createCommand(options: CreateOptions): Promise<void> {
  requireAuth()
  const api = createApiClient()

  // Interactive prompts for any missing required field
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  let name = options.name
  let command = options.command
  let argsRaw = options.args
  let envRaw = options.env
  let description = options.description
  let scope = (options.scope as 'TENANT' | 'TEAM' | undefined) ?? 'TEAM'
  let teamId = options.team
  const enabled = options.off ? false : true

  try {
    if (!name) {
      name = (await ask(rl, chalk.cyan('Server name: '))).trim()
      if (!name) fail('Name is required')
    }
    if (!command) {
      command = (await ask(rl, chalk.cyan('Command (e.g. npx, node, python3): '))).trim()
      if (!command) fail('Command is required')
    }
    if (argsRaw === undefined) {
      argsRaw = (await ask(rl, chalk.cyan('Args (space-separated, blank for none): '))).trim()
    }
    if (description === undefined) {
      description = (await ask(rl, chalk.cyan('Description (optional): '))).trim() || undefined
    }
    if (envRaw === undefined) {
      envRaw = (await ask(rl, chalk.cyan('Env (KEY=VAL pairs or JSON, blank for none): '))).trim()
    }
    if (!options.scope) {
      const ans = (await ask(rl, chalk.cyan('Scope (TENANT or TEAM, default TEAM): '))).trim().toUpperCase()
      scope = ans === 'TENANT' ? 'TENANT' : 'TEAM'
    }
    if (scope === 'TEAM' && !teamId) {
      const ans = (await ask(rl, chalk.cyan('Team id (blank to skip): '))).trim()
      teamId = ans || undefined
    }
  } finally {
    rl.close()
  }

  if (scope !== 'TENANT' && scope !== 'TEAM') {
    fail('--scope must be TENANT or TEAM')
  }

  const args = parseArgs(argsRaw) ?? []
  const env = parseEnv(envRaw) ?? {}

  const input: CreateMcpServerInput = {
    name,
    command,
    args,
    env,
    scope,
    enabled,
  }
  if (description) input.description = description
  if (options.version) input.version = options.version
  if (teamId) input.teamId = teamId

  // Confirmation summary
  console.log(chalk.bold('\nAbout to register:'))
  console.log(`  ${chalk.dim('name'.padEnd(12))} ${name}`)
  console.log(`  ${chalk.dim('scope'.padEnd(12))} ${scopeBadge(scope)}`)
  if (teamId) console.log(`  ${chalk.dim('team'.padEnd(12))} ${teamId}`)
  console.log(`  ${chalk.dim('command'.padEnd(12))} ${command} ${args.join(' ')}`)
  if (Object.keys(env).length) {
    console.log(`  ${chalk.dim('env'.padEnd(12))} ${Object.keys(env).join(', ')}`)
  }
  console.log('')

  if (!options.yes) {
    const rl2 = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const answer = (await ask(rl2, chalk.yellow('Proceed? [y/N] '))).trim().toLowerCase()
      if (answer !== 'y' && answer !== 'yes') {
        console.log(chalk.dim('Cancelled.'))
        return
      }
    } finally {
      rl2.close()
    }
  }

  const spinner = ora(`Creating MCP server "${name}"...`).start()
  try {
    const created = await api.createMcpServer(input)
    spinner.succeed(`MCP server "${created.data.name}" registered`)
    console.log(chalk.dim(`  id:      ${created.data.id}`))
    console.log(chalk.dim(`  sha256:  ${created.data.sha256.slice(0, 16)}...`))
  } catch (error) {
    spinner.fail('Create failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// update
// ============================================================================

interface UpdateOptions {
  description?: string
  command?: string
  args?: string
  env?: string
  version?: string
  scope?: string
  team?: string
  on?: boolean
  off?: boolean
}

async function updateCommand(idOrName: string, options: UpdateOptions): Promise<void> {
  requireAuth()
  const api = createApiClient()

  const target = await resolveServer(idOrName)

  const input: UpdateMcpServerInput = {}
  if (options.description !== undefined) input.description = options.description
  if (options.command !== undefined) input.command = options.command
  if (options.args !== undefined) input.args = parseArgs(options.args)
  if (options.env !== undefined) input.env = parseEnv(options.env)
  if (options.version !== undefined) input.version = options.version
  if (options.scope !== undefined) {
    if (options.scope !== 'TENANT' && options.scope !== 'TEAM') {
      fail('--scope must be TENANT or TEAM')
    }
    input.scope = options.scope
  }
  if (options.team !== undefined) input.teamId = options.team
  if (options.on) input.enabled = true
  if (options.off) input.enabled = false

  if (Object.keys(input).length === 0) {
    fail('No fields to update. Pass --command / --args / --env / --description / --scope / --team / --on / --off / --version')
  }

  const spinner = ora(`Updating "${target.name}"...`).start()
  try {
    const updated = await api.updateMcpServer(target.id, input)
    spinner.succeed(`MCP server "${updated.data.name}" updated`)
    console.log(chalk.dim(`  sha256:  ${updated.data.sha256.slice(0, 16)}...`))
  } catch (error) {
    spinner.fail('Update failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// delete
// ============================================================================

async function deleteCommand(idOrName: string, options: { yes?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()

  const target = await resolveServer(idOrName)

  if (!options.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
      console.log(chalk.yellow(`\nAbout to delete MCP server "${target.name}" (${target.id}).`))
      console.log(chalk.dim('This is a soft delete — history is preserved.'))
      const answer = (await ask(rl, chalk.yellow('Proceed? [y/N] '))).trim().toLowerCase()
      if (answer !== 'y' && answer !== 'yes') {
        console.log(chalk.dim('Cancelled.'))
        return
      }
    } finally {
      rl.close()
    }
  }

  const spinner = ora(`Deleting "${target.name}"...`).start()
  try {
    await api.deleteMcpServer(target.id)
    spinner.succeed(`MCP server "${target.name}" deleted`)
  } catch (error) {
    spinner.fail('Delete failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// toggle
// ============================================================================

async function toggleCommand(
  idOrName: string,
  options: { on?: boolean; off?: boolean }
): Promise<void> {
  requireAuth()
  const api = createApiClient()

  const target = await resolveServer(idOrName)

  let enabled: boolean
  if (options.on) enabled = true
  else if (options.off) enabled = false
  else enabled = !target.enabled

  const spinner = ora(`${enabled ? 'Enabling' : 'Disabling'} ${target.name}...`).start()
  try {
    const updated = await api.toggleMcpServer(target.id, enabled)
    spinner.succeed(
      `MCP server "${updated.data.name}" ${enabled ? chalk.green('enabled') : chalk.red('disabled')}`
    )
  } catch (error) {
    spinner.fail('Toggle failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// Command Setup
// ============================================================================

export function createMcpCommand(): Command {
  const mcp = new Command('mcp').description(
    'Manage MCP servers (list, show, create, update, delete, toggle). For local-config sync use `oppmon sync mcp`.'
  )

  mcp
    .command('list')
    .alias('ls')
    .description('List all visible MCP servers')
    .option('-s, --scope <scope>', 'Filter by scope (TENANT or TEAM)')
    .option('--search <text>', 'Filter by name or description')
    .option('--enabled', 'Only show enabled servers')
    .option('--disabled', 'Only show disabled servers')
    .option('--limit <n>', 'Max rows (default 100)')
    .option('--json', 'Output as JSON')
    .action(listCommand)

  mcp
    .command('show <idOrName>')
    .alias('get')
    .description('Show one MCP server')
    .option('--json', 'Output as JSON')
    .action(showCommand)

  mcp
    .command('create')
    .alias('new')
    .description('Register a new MCP server (interactive)')
    .option('-n, --name <name>', 'Server name')
    .option('-d, --description <text>', 'Description')
    .option('-c, --command <cmd>', 'Executable (e.g. npx, node)')
    .option('-a, --args <args>', 'Args (space-separated or JSON array)')
    .option('-e, --env <env>', 'KEY=VAL pairs or JSON object')
    .option('--version <version>', 'Semantic version (default 1.0.0)')
    .option('-s, --scope <scope>', 'TENANT or TEAM (default TEAM)')
    .option('--team <id>', 'teamId for TEAM scope')
    .option('--off', 'Create disabled')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(createCommand)

  mcp
    .command('update <idOrName>')
    .description('Update an MCP server (any field)')
    .option('-d, --description <text>', 'New description')
    .option('-c, --command <cmd>', 'New executable')
    .option('-a, --args <args>', 'New args (space-separated or JSON)')
    .option('-e, --env <env>', 'New env (KEY=VAL or JSON)')
    .option('--version <version>', 'New version')
    .option('-s, --scope <scope>', 'Move to TENANT or TEAM')
    .option('--team <id>', 'Move to a different team')
    .option('--on', 'Force enable')
    .option('--off', 'Force disable')
    .action(updateCommand)

  mcp
    .command('delete <idOrName>')
    .alias('rm')
    .description('Soft-delete an MCP server (history preserved)')
    .option('-y, --yes', 'Skip confirmation')
    .action(deleteCommand)

  mcp
    .command('toggle <idOrName>')
    .description('Enable or disable an MCP server')
    .option('--on', 'Force enable')
    .option('--off', 'Force disable')
    .action(toggleCommand)

  mcp.action(() => mcp.outputHelp())

  return mcp
}
