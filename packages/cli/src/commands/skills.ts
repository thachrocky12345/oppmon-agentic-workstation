// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Skills Command
 *
 * Manage the skills registry — list, show, create from local file, update,
 * delete, toggle, view versions, and lint a local SKILL.md.
 *
 * Usage:
 *   oppmon skills list                            List all visible skills
 *   oppmon skills show <id|name>                  Show one skill
 *   oppmon skills create [file]                   Push a local SKILL.md
 *   oppmon skills update <id|name> [file]         Update content from file
 *   oppmon skills delete <id|name>                Soft-delete a skill
 *   oppmon skills toggle <id|name>                Enable / disable
 *   oppmon skills versions <id|name>              List version history
 *   oppmon skills lint <file>                     Validate frontmatter locally
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import * as fs from 'fs/promises'
import { createInterface } from 'readline'
import {
  createApiClient,
  Skill,
  CreateSkillInput,
  UpdateSkillInput,
} from '../lib/api.js'
import { isAuthenticated } from '../lib/credentials.js'
import { EXIT_CODES } from '../lib/types.js'
import { parseSkillMetadata, hashContent } from '../lib/skills.js'

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

/** CUIDs start with 'c' followed by 24 alphanumerics. Anything else = name. */
function looksLikeId(s: string): boolean {
  return /^c[a-z0-9]{24,}$/i.test(s)
}

/** Resolve a skill by id-or-name to a fetched Skill record. */
async function resolveSkill(idOrName: string): Promise<Skill> {
  const api = createApiClient()
  if (looksLikeId(idOrName)) {
    const r = await api.getSkill(idOrName)
    return r.data
  }
  const r = await api.getSkillByName(idOrName)
  if (!r) fail(`Skill "${idOrName}" not found`)
  return r
}

function scopeBadge(scope: 'TENANT' | 'TEAM'): string {
  return scope === 'TENANT' ? chalk.magenta('TENANT') : chalk.cyan('TEAM  ')
}

// ============================================================================
// list
// ============================================================================

interface ListOptions {
  scope?: string
  search?: string
  json?: boolean
  limit?: string
}

async function listCommand(options: ListOptions): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Fetching skills...').start()

  try {
    const response = await api.listSkills({
      scope: options.scope as 'TENANT' | 'TEAM' | undefined,
      search: options.search,
      limit: options.limit ? parseInt(options.limit, 10) : 100,
    })
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response, null, 2))
      return
    }

    const skills = response.data
    if (skills.length === 0) {
      console.log(chalk.yellow('No skills found.'))
      console.log(chalk.dim('Author one in .claude/skills/<name>/SKILL.md, then: oppmon skills create'))
      return
    }

    console.log(chalk.bold(`\nSkills (${response.meta?.total ?? skills.length}):\n`))
    console.log(
      chalk.dim(
        `${'Name'.padEnd(28)} ${'Scope'.padEnd(8)} ${'v'.padEnd(4)} ${'sha256 (8)'.padEnd(11)} Description`
      )
    )
    console.log(chalk.dim('-'.repeat(95)))

    for (const s of skills) {
      const name = truncate(s.name, 27).padEnd(28)
      const scope = scopeBadge(s.scope) + '  '
      const v = ('v' + s.version).padEnd(4)
      const sha = chalk.dim(s.sha256.slice(0, 8) + ' ')
      const desc = truncate(s.description || chalk.dim('(no description)'), 40)
      console.log(`${name} ${scope} ${v} ${sha}  ${desc}`)
    }

    console.log('')
    console.log(
      chalk.dim(
        `Showing ${skills.length} of ${response.meta?.total ?? skills.length}. Use --limit to widen.`
      )
    )
  } catch (error) {
    spinner.fail('Failed to fetch skills')
    fail((error as Error).message)
  }
}

// ============================================================================
// show
// ============================================================================

async function showCommand(idOrName: string, options: { json?: boolean; content?: boolean }): Promise<void> {
  requireAuth()
  const spinner = ora(`Fetching skill ${idOrName}...`).start()

  try {
    const s = await resolveSkill(idOrName)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(s, null, 2))
      return
    }

    console.log(chalk.bold(`\n${s.name}`))
    console.log(chalk.dim('─'.repeat(50)))
    console.log(`  ${chalk.dim('id'.padEnd(15))} ${s.id}`)
    console.log(`  ${chalk.dim('description'.padEnd(15))} ${s.description || chalk.dim('—')}`)
    console.log(`  ${chalk.dim('version'.padEnd(15))} v${s.version}`)
    console.log(`  ${chalk.dim('sha256'.padEnd(15))} ${chalk.dim(s.sha256)}`)
    console.log(`  ${chalk.dim('scope'.padEnd(15))} ${s.scope}${s.teamId ? ` (team ${s.teamId})` : ''}`)
    console.log(`  ${chalk.dim('created'.padEnd(15))} ${s.createdAt}`)
    console.log(`  ${chalk.dim('updated'.padEnd(15))} ${s.updatedAt}`)

    if (options.content) {
      console.log(chalk.dim('\n--- content ---'))
      console.log(s.content)
      console.log(chalk.dim('--- end ---\n'))
    } else {
      console.log(chalk.dim('\nUse --content to print the full SKILL.md\n'))
    }
  } catch (error) {
    spinner.fail('Failed to fetch skill')
    fail((error as Error).message)
  }
}

// ============================================================================
// create
// ============================================================================

interface CreateOptions {
  scope?: string
  team?: string
  name?: string
  description?: string
  yes?: boolean
}

async function createCommand(file: string | undefined, options: CreateOptions): Promise<void> {
  requireAuth()
  const api = createApiClient()

  if (!file) {
    fail(
      'Usage: oppmon skills create <path-to-SKILL.md>\nExample: oppmon skills create .claude/skills/code-review/SKILL.md'
    )
  }

  let content: string
  try {
    content = await fs.readFile(file, 'utf-8')
  } catch (error) {
    fail(`Could not read ${file}: ${(error as Error).message}`)
  }

  // Lint frontmatter so we fail fast before the network call
  const meta = parseSkillMetadata(content)
  const name = options.name?.trim() || meta.name
  if (!name) fail('No skill name found in frontmatter and --name not supplied')

  const scope = ((options.scope || meta.scope || 'TEAM').toUpperCase() as 'TENANT' | 'TEAM')
  if (scope !== 'TENANT' && scope !== 'TEAM') fail('Scope must be TENANT or TEAM')

  const teamId = options.team || meta.teamId
  if (scope === 'TEAM' && !teamId) {
    // It's optional in the schema (server will use the user's default team) but warn.
    console.log(chalk.yellow('  warn: TEAM scope without teamId — server will use your default team membership'))
  }

  const description = options.description || meta.description

  console.log(chalk.bold('\nReady to create:\n'))
  console.log(`  ${chalk.dim('name'.padEnd(15))} ${name}`)
  console.log(`  ${chalk.dim('scope'.padEnd(15))} ${scope}${teamId ? ` (team ${teamId})` : ''}`)
  console.log(`  ${chalk.dim('description'.padEnd(15))} ${description || chalk.dim('—')}`)
  console.log(`  ${chalk.dim('content'.padEnd(15))} ${content.length} bytes (sha256 ${hashContent(content).slice(0, 8)}…)`)

  if (!options.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ans = (await ask(rl, chalk.cyan('\n  proceed? (Y/n) ▸ '))).trim().toLowerCase()
    rl.close()
    if (ans && ans !== 'y' && ans !== 'yes') {
      console.log(chalk.dim('Aborted.'))
      return
    }
  }

  const spinner = ora('Creating skill...').start()
  try {
    const input: CreateSkillInput = { name, content, description, scope, teamId }
    const created = await api.createSkill(input)
    spinner.succeed(`Skill "${created.data.name}" created (${created.data.id}, v${created.data.version})`)
    console.log(chalk.dim(`\nNext: oppmon skills show ${created.data.name}`))
  } catch (error) {
    spinner.fail('Create failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// update
// ============================================================================

async function updateCommand(
  idOrName: string,
  file: string | undefined,
  options: { description?: string; scope?: string; team?: string }
): Promise<void> {
  requireAuth()
  const api = createApiClient()

  const target = await resolveSkill(idOrName)

  const input: UpdateSkillInput = {}

  if (file) {
    try {
      input.content = await fs.readFile(file, 'utf-8')
    } catch (error) {
      fail(`Could not read ${file}: ${(error as Error).message}`)
    }
  }
  if (options.description !== undefined) input.description = options.description
  if (options.scope) {
    const scope = options.scope.toUpperCase() as 'TENANT' | 'TEAM'
    if (scope !== 'TENANT' && scope !== 'TEAM') fail('Scope must be TENANT or TEAM')
    input.scope = scope
  }
  if (options.team) input.teamId = options.team

  if (Object.keys(input).length === 0) {
    fail('Nothing to update. Pass a file path or one of --description / --scope / --team.')
  }

  const spinner = ora(`Updating ${target.name}...`).start()
  try {
    const updated = await api.updateSkill(target.id, input)
    spinner.succeed(
      `Skill "${updated.data.name}" updated (now v${updated.data.version}, sha256 ${updated.data.sha256.slice(0, 8)}…)`
    )
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

  const target = await resolveSkill(idOrName)

  if (!options.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ans = (await ask(rl, chalk.yellow(`Soft-delete skill "${target.name}" (${target.id})? (y/N) ▸ `)))
      .trim()
      .toLowerCase()
    rl.close()
    if (ans !== 'y' && ans !== 'yes') {
      console.log(chalk.dim('Aborted.'))
      return
    }
  }

  const spinner = ora(`Deleting ${target.name}...`).start()
  try {
    await api.deleteSkill(target.id)
    spinner.succeed(`Skill "${target.name}" deleted (soft).`)
    console.log(chalk.dim('Versions history is preserved. The unique-name slot is held until purge.'))
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

  const target = await resolveSkill(idOrName)

  let enabled: boolean
  if (options.on) enabled = true
  else if (options.off) enabled = false
  else enabled = !target.enabled

  const spinner = ora(`${enabled ? 'Enabling' : 'Disabling'} ${target.name}...`).start()
  try {
    const updated = await api.toggleSkill(target.id, enabled)
    spinner.succeed(`Skill "${updated.data.name}" ${enabled ? chalk.green('enabled') : chalk.red('disabled')}`)
  } catch (error) {
    spinner.fail('Toggle failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// versions
// ============================================================================

async function versionsCommand(idOrName: string, options: { json?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()

  const target = await resolveSkill(idOrName)
  const spinner = ora(`Fetching version history for ${target.name}...`).start()

  try {
    const response = await api.getSkillVersions(target.id)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2))
      return
    }

    if (response.data.length === 0) {
      console.log(chalk.yellow('No versions found.'))
      return
    }

    console.log(chalk.bold(`\nVersions of ${target.name}:\n`))
    console.log(chalk.dim(`${'Version'.padEnd(8)} ${'Created At'.padEnd(26)} ${'sha256 (8)'.padEnd(11)} Author`))
    console.log(chalk.dim('-'.repeat(70)))

    for (const v of response.data) {
      const ver = ('v' + v.version).padEnd(8)
      const created = v.createdAt.padEnd(26)
      const sha = chalk.dim(v.sha256.slice(0, 8) + ' ')
      const author = v.createdBy?.name || v.createdBy?.email || v.createdById
      console.log(`${ver} ${created} ${sha}  ${author}`)
    }
    console.log('')
  } catch (error) {
    spinner.fail('Failed to fetch versions')
    fail((error as Error).message)
  }
}

// ============================================================================
// lint (local — no API call)
// ============================================================================

interface LintIssue {
  severity: 'error' | 'warn'
  field: string
  message: string
}

async function lintCommand(file: string, options: { json?: boolean }): Promise<void> {
  let content: string
  try {
    content = await fs.readFile(file, 'utf-8')
  } catch (error) {
    fail(`Could not read ${file}: ${(error as Error).message}`)
  }

  const issues: LintIssue[] = []

  // 1. Frontmatter present?
  if (!content.startsWith('---\n')) {
    issues.push({ severity: 'error', field: 'frontmatter', message: 'Missing YAML frontmatter (file must start with `---`)' })
  }

  const meta = parseSkillMetadata(content)

  // 2. Name
  if (!meta.name) {
    issues.push({ severity: 'error', field: 'name', message: 'Required — must be lowercase-kebab-case' })
  } else if (!/^[a-z][a-z0-9-]*$/.test(meta.name)) {
    issues.push({
      severity: 'error',
      field: 'name',
      message: `"${meta.name}" must match ^[a-z][a-z0-9-]*$ (lowercase-kebab-case)`,
    })
  }

  // 3. Description
  if (!meta.description) {
    issues.push({ severity: 'warn', field: 'description', message: 'Recommended — give the matcher something to work with' })
  } else if (meta.description.length < 50) {
    issues.push({
      severity: 'warn',
      field: 'description',
      message: `Only ${meta.description.length} chars (skill-framework recommends ≥ 50)`,
    })
  }

  // 4. Scope
  if (meta.scope && meta.scope !== 'TENANT' && meta.scope !== 'TEAM') {
    issues.push({ severity: 'error', field: 'scope', message: 'Must be TENANT or TEAM' })
  }

  // 5. Look for the framework's recommended fields (version, author, category, triggers)
  const frontmatterBlock = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  for (const f of ['version', 'author', 'category', 'triggers']) {
    if (!new RegExp(`^${f}:`, 'm').test(frontmatterBlock)) {
      issues.push({
        severity: 'warn',
        field: f,
        message: `Missing — @arkon/skill-framework expects this for trigger matching`,
      })
    }
  }

  // 6. Body
  if (!content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()) {
    issues.push({ severity: 'error', field: 'body', message: 'Empty body — at least one section is required' })
  }

  if (options.json) {
    console.log(JSON.stringify({ file, name: meta.name, issues }, null, 2))
    return
  }

  console.log(chalk.bold(`\nLint: ${file}\n`))
  console.log(`  ${chalk.dim('name'.padEnd(15))} ${meta.name || chalk.red('(missing)')}`)
  console.log(`  ${chalk.dim('description'.padEnd(15))} ${meta.description || chalk.dim('(missing)')}`)
  console.log(`  ${chalk.dim('scope'.padEnd(15))} ${meta.scope || chalk.dim('(default: TEAM)')}`)
  console.log(`  ${chalk.dim('sha256'.padEnd(15))} ${chalk.dim(hashContent(content))}`)

  if (issues.length === 0) {
    console.log(chalk.green('\n✓ No issues found.\n'))
    return
  }

  const errors = issues.filter((i) => i.severity === 'error')
  const warns = issues.filter((i) => i.severity === 'warn')

  console.log(chalk.bold(`\n${errors.length} error(s), ${warns.length} warning(s):\n`))
  for (const i of issues) {
    const tag = i.severity === 'error' ? chalk.red('  ✗ error ') : chalk.yellow('  ⚠ warn  ')
    console.log(`${tag} ${chalk.dim(i.field.padEnd(15))} ${i.message}`)
  }
  console.log('')

  if (errors.length > 0) {
    process.exit(EXIT_CODES.ERROR)
  }
}

// ============================================================================
// Command Setup
// ============================================================================

export function createSkillsCommand(): Command {
  const skills = new Command('skills').description('Manage skills registry (list, show, create, update, delete, toggle, versions, lint)')

  skills
    .command('list')
    .alias('ls')
    .description('List all visible skills')
    .option('-s, --scope <scope>', 'Filter by scope (TENANT or TEAM)')
    .option('--search <text>', 'Filter by name or description')
    .option('--limit <n>', 'Max rows (default 100)')
    .option('--json', 'Output as JSON')
    .action(listCommand)

  skills
    .command('show <idOrName>')
    .alias('get')
    .description('Show one skill')
    .option('--content', 'Print the full SKILL.md content')
    .option('--json', 'Output as JSON')
    .action(showCommand)

  skills
    .command('create [file]')
    .alias('new')
    .description('Push a local SKILL.md to the registry')
    .option('-n, --name <name>', 'Override name from frontmatter')
    .option('-d, --description <text>', 'Override description')
    .option('-s, --scope <scope>', 'TENANT or TEAM (default TEAM)')
    .option('--team <id>', 'teamId for TEAM scope')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(createCommand)

  skills
    .command('update <idOrName> [file]')
    .description('Update an existing skill (creates a new version)')
    .option('-d, --description <text>', 'Update description only')
    .option('-s, --scope <scope>', 'Move to TENANT or TEAM')
    .option('--team <id>', 'Move to a different team')
    .action(updateCommand)

  skills
    .command('delete <idOrName>')
    .alias('rm')
    .description('Soft-delete a skill (history preserved)')
    .option('-y, --yes', 'Skip confirmation')
    .action(deleteCommand)

  skills
    .command('toggle <idOrName>')
    .description('Enable or disable a skill (admin only)')
    .option('--on', 'Force enable')
    .option('--off', 'Force disable')
    .action(toggleCommand)

  skills
    .command('versions <idOrName>')
    .alias('history')
    .description('List version history')
    .option('--json', 'Output as JSON')
    .action(versionsCommand)

  skills
    .command('lint <file>')
    .description('Validate a local SKILL.md against frontmatter rules (no API call)')
    .option('--json', 'Output as JSON')
    .action(lintCommand)

  skills.action(() => skills.outputHelp())

  return skills
}
