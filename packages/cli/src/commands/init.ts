// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Init Command
 *
 * Initialize a project with team-specific configuration for skills and MCP servers.
 *
 * Usage:
 *   tag init                   - Interactive setup wizard
 *   tag init --team <team-id>  - Associate project with specific team
 *   tag init --yes             - Accept all defaults (non-interactive)
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { createApiClient } from '../lib/api.js'
import { isAuthenticated } from '../lib/credentials.js'
import { EXIT_CODES } from '../lib/types.js'

// ============================================================================
// Types
// ============================================================================

export interface ProjectConfig {
  version: string
  teamId?: string
  skills: string[]
  mcpServers: string[]
  syncOnCd: boolean
  createdAt: string
  updatedAt: string
}

export interface ProjectState {
  lastSync?: string
  syncedItems: {
    skills: string[]
    mcpServers: string[]
  }
}

// ============================================================================
// Constants
// ============================================================================

const TAG_DIR = '.tag'
const CONFIG_FILE = 'config.json'
const STATE_FILE = 'state.json'
const GITIGNORE_FILE = '.gitignore'
const CONFIG_VERSION = '1.0.0'

// ============================================================================
// File Operations
// ============================================================================

export function getTagDir(cwd?: string): string {
  return path.join(cwd || process.cwd(), TAG_DIR)
}

export function getConfigPath(cwd?: string): string {
  return path.join(getTagDir(cwd), CONFIG_FILE)
}

export function getStatePath(cwd?: string): string {
  return path.join(getTagDir(cwd), STATE_FILE)
}

export function isInitialized(cwd?: string): boolean {
  return fs.existsSync(getTagDir(cwd)) && fs.existsSync(getConfigPath(cwd))
}

export function readProjectConfig(cwd?: string): ProjectConfig | null {
  const configPath = getConfigPath(cwd)
  if (!fs.existsSync(configPath)) {
    return null
  }
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(content) as ProjectConfig
  } catch {
    return null
  }
}

export function writeProjectConfig(config: ProjectConfig, cwd?: string): void {
  const tagDir = getTagDir(cwd)
  if (!fs.existsSync(tagDir)) {
    fs.mkdirSync(tagDir, { recursive: true })
  }
  const configPath = getConfigPath(cwd)
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

export function readProjectState(cwd?: string): ProjectState | null {
  const statePath = getStatePath(cwd)
  if (!fs.existsSync(statePath)) {
    return null
  }
  try {
    const content = fs.readFileSync(statePath, 'utf-8')
    return JSON.parse(content) as ProjectState
  } catch {
    return null
  }
}

export function writeProjectState(state: ProjectState, cwd?: string): void {
  const tagDir = getTagDir(cwd)
  if (!fs.existsSync(tagDir)) {
    fs.mkdirSync(tagDir, { recursive: true })
  }
  const statePath = getStatePath(cwd)
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf-8')
}

// ============================================================================
// .gitignore Operations
// ============================================================================

export function checkGitignore(cwd?: string): { exists: boolean; hasTagDir: boolean; hasStateFile: boolean } {
  const gitignorePath = path.join(cwd || process.cwd(), GITIGNORE_FILE)
  if (!fs.existsSync(gitignorePath)) {
    return { exists: false, hasTagDir: false, hasStateFile: false }
  }

  const content = fs.readFileSync(gitignorePath, 'utf-8')
  const lines = content.split('\n').map(l => l.trim())

  return {
    exists: true,
    hasTagDir: lines.some(l => l === '.tag/' || l === '.tag' || l === '/.tag/' || l === '/.tag'),
    hasStateFile: lines.some(l => l.includes('.tag/state.json') || l.includes('state.json')),
  }
}

export function addToGitignore(entries: string[], cwd?: string): void {
  const gitignorePath = path.join(cwd || process.cwd(), GITIGNORE_FILE)
  let content = ''

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8')
  }

  // Ensure newline at end
  if (content && !content.endsWith('\n')) {
    content += '\n'
  }

  // Add entries
  const toAdd = entries.filter(e => !content.includes(e))
  if (toAdd.length > 0) {
    if (!content.includes('# tag CLI')) {
      content += '\n# tag CLI\n'
    }
    content += toAdd.join('\n') + '\n'
    fs.writeFileSync(gitignorePath, content, 'utf-8')
  }
}

// ============================================================================
// Interactive Wizard
// ============================================================================

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function promptSelect(question: string, options: { value: string; label: string }[]): Promise<string> {
  console.log(chalk.bold(question))
  options.forEach((opt, i) => {
    console.log(`  ${chalk.cyan(i + 1)}. ${opt.label}`)
  })

  const answer = await prompt(chalk.dim('Enter number: '))
  const index = parseInt(answer, 10) - 1

  if (index >= 0 && index < options.length) {
    return options[index].value
  }

  // Default to first option
  return options[0]?.value || ''
}

async function promptYesNo(question: string, defaultYes = true): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]'
  const answer = await prompt(`${question} ${chalk.dim(hint)} `)

  if (!answer) return defaultYes
  return answer.toLowerCase().startsWith('y')
}

interface WizardOptions {
  teams: Array<{ id: string; name: string }>
  skills: Array<{ id: string; name: string }>
  mcpServers: Array<{ id: string; name: string }>
}

async function runWizard(options: WizardOptions): Promise<{
  teamId?: string
  skills: string[]
  mcpServers: string[]
  addToGitignore: boolean
  runSync: boolean
}> {
  console.log('')
  console.log(chalk.bold('🚀 Tag Project Setup Wizard'))
  console.log(chalk.dim('Configure this project for tag CLI integration.\n'))

  // Step 1: Team selection
  let teamId: string | undefined
  if (options.teams.length > 1) {
    teamId = await promptSelect(
      'Which team should this project belong to?',
      options.teams.map(t => ({ value: t.id, label: t.name }))
    )
  } else if (options.teams.length === 1) {
    teamId = options.teams[0].id
    console.log(chalk.dim(`Using team: ${options.teams[0].name}`))
  }
  console.log('')

  // Step 2: Skills selection (simplified - just confirm using all team skills)
  const skills: string[] = []
  if (options.skills.length > 0) {
    const useAll = await promptYesNo(
      `Include all ${options.skills.length} available skills for this project?`,
      true
    )
    if (useAll) {
      skills.push(...options.skills.map(s => s.name))
    }
  }
  console.log('')

  // Step 3: MCP servers selection
  const mcpServers: string[] = []
  if (options.mcpServers.length > 0) {
    const useAll = await promptYesNo(
      `Include all ${options.mcpServers.length} available MCP servers for this project?`,
      true
    )
    if (useAll) {
      mcpServers.push(...options.mcpServers.map(s => s.name))
    }
  }
  console.log('')

  // Step 4: .gitignore
  const addGitignore = await promptYesNo(
    'Add .tag/ to .gitignore (recommended)?',
    true
  )
  console.log('')

  // Step 5: Initial sync
  const runSync = await promptYesNo(
    'Run initial sync now?',
    true
  )

  return { teamId, skills, mcpServers, addToGitignore: addGitignore, runSync }
}

// ============================================================================
// Init Command
// ============================================================================

interface InitOptions {
  team?: string
  yes?: boolean
  force?: boolean
}

async function initCommand(options: InitOptions): Promise<void> {
  const spinner = ora('Initializing project...').start()
  const cwd = process.cwd()
  const projectName = path.basename(cwd)

  // Check authentication
  if (!isAuthenticated()) {
    spinner.fail('Not authenticated')
    console.error(chalk.red('Error: Not authenticated. Run "oppmon login" first.'))
    process.exit(EXIT_CODES.AUTH_REQUIRED)
  }

  // Check if already initialized
  const existingConfig = readProjectConfig(cwd)
  if (existingConfig && !options.force && !options.yes) {
    spinner.stop()
    console.log(chalk.yellow('Project already initialized.'))
    console.log(chalk.dim(`Config: ${getConfigPath(cwd)}`))
    console.log('')

    const reinit = await promptYesNo('Re-initialize with new settings?', false)
    if (!reinit) {
      console.log(chalk.dim('Keeping existing configuration.'))
      return
    }
    spinner.start('Re-initializing project...')
  }

  try {
    // Get user info and available resources
    const api = createApiClient()

    spinner.text = 'Fetching user info and available resources...'

    const [userResponse, skillsResponse, mcpResponse] = await Promise.all([
      api.getMe().catch(() => ({ user: { id: '', email: '', tenantId: '', role: '', teams: [] } })),
      api.listSkills({ limit: 100 }).catch(() => ({ data: [] })),
      api.listMcpServers({ limit: 100 }).catch(() => ({ data: [] })),
    ])

    const teams: Array<{ id: string; name: string }> = userResponse.user?.teams?.map(
      (t: { id: string; name: string }) => ({ id: t.id, name: t.name })
    ) || []
    const skills = skillsResponse.data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))
    const mcpServers = mcpResponse.data.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))

    spinner.stop()

    // Determine configuration
    let teamId = options.team
    let pinnedSkills: string[] = []
    let pinnedMcpServers: string[] = []
    let shouldAddGitignore = options.yes
    let shouldRunSync = false

    if (options.yes) {
      // Non-interactive: use defaults
      if (!teamId && teams.length === 1) {
        teamId = teams[0].id
      }
      // Pin all available resources by default
      pinnedSkills = skills.map((s: { name: string }) => s.name)
      pinnedMcpServers = mcpServers.map((s: { name: string }) => s.name)
      shouldAddGitignore = true
    } else {
      // Interactive wizard
      const wizardResult = await runWizard({ teams, skills, mcpServers })
      teamId = wizardResult.teamId
      pinnedSkills = wizardResult.skills
      pinnedMcpServers = wizardResult.mcpServers
      shouldAddGitignore = wizardResult.addToGitignore
      shouldRunSync = wizardResult.runSync
    }

    // Validate team if specified
    if (teamId) {
      const validTeam = teams.find(t => t.id === teamId || t.name.toLowerCase() === teamId?.toLowerCase())
      if (!validTeam && teams.length > 0) {
        console.error(chalk.red(`Error: Team "${teamId}" not found or you're not a member.`))
        console.log(chalk.dim('Available teams: ' + teams.map(t => t.name).join(', ')))
        process.exit(EXIT_CODES.ERROR)
      }
      if (validTeam) {
        teamId = validTeam.id
      }
    }

    // Create configuration
    const now = new Date().toISOString()
    const config: ProjectConfig = {
      version: CONFIG_VERSION,
      teamId,
      skills: pinnedSkills,
      mcpServers: pinnedMcpServers,
      syncOnCd: false,
      createdAt: existingConfig?.createdAt || now,
      updatedAt: now,
    }

    // Write configuration
    const writingSpinner = ora('Writing configuration...').start()
    writeProjectConfig(config, cwd)

    // Initialize state file
    const state: ProjectState = readProjectState(cwd) || {
      syncedItems: { skills: [], mcpServers: [] },
    }
    writeProjectState(state, cwd)

    writingSpinner.succeed('Configuration created')

    // Handle .gitignore
    const gitignoreStatus = checkGitignore(cwd)
    if (shouldAddGitignore) {
      const entriesToAdd: string[] = []
      if (!gitignoreStatus.hasTagDir) {
        entriesToAdd.push('.tag/')
      }
      // Always ensure state.json is ignored (even if .tag/ is committed)
      if (!gitignoreStatus.hasStateFile) {
        entriesToAdd.push('.tag/state.json')
      }

      if (entriesToAdd.length > 0) {
        addToGitignore(entriesToAdd, cwd)
        console.log(chalk.green('  ✓ Updated .gitignore'))
      }
    } else if (!gitignoreStatus.hasTagDir) {
      console.log(chalk.yellow('  ⚠ Consider adding .tag/ to .gitignore'))
    }

    // Print summary
    console.log('')
    console.log(chalk.bold('✅ Project initialized: ') + chalk.cyan(projectName))
    console.log('')
    console.log(chalk.dim('Configuration:'))
    console.log(chalk.dim(`  Directory: ${getTagDir(cwd)}`))
    if (teamId) {
      const teamName = teams.find(t => t.id === teamId)?.name || teamId
      console.log(chalk.dim(`  Team: ${teamName}`))
    }
    console.log(chalk.dim(`  Skills: ${pinnedSkills.length} pinned`))
    console.log(chalk.dim(`  MCP Servers: ${pinnedMcpServers.length} pinned`))
    console.log('')

    // Run sync if requested
    if (shouldRunSync) {
      console.log(chalk.dim('Running initial sync...'))
      console.log(chalk.dim('Run "oppmon sync skills pull" and "oppmon sync mcp pull" to sync.'))
    }

    console.log(chalk.bold('Next steps:'))
    console.log(chalk.dim('  oppmon sync skills pull   # Pull skills from remote'))
    console.log(chalk.dim('  oppmon sync mcp pull      # Pull MCP servers from remote'))
    console.log('')

  } catch (error) {
    spinner.fail('Initialization failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

// ============================================================================
// Command Setup
// ============================================================================

export function createInitCommand(): Command {
  const init = new Command('init')
    .description('Initialize project with tag configuration')
    .option('-t, --team <team-id>', 'Associate project with specific team')
    .option('-y, --yes', 'Accept all defaults (non-interactive)')
    .option('-f, --force', 'Force re-initialization')
    .action(initCommand)

  return init
}
