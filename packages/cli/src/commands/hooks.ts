/**
 * Hooks Command
 *
 * Install, uninstall, and check status of Claude Code hooks.
 *
 * Usage:
 *   tag hooks install     - Install event capture hook
 *   tag hooks uninstall   - Remove event capture hook
 *   tag hooks status      - Check hook installation status
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CLAUDE_DIR = join(homedir(), '.claude')
const HOOKS_FILE = join(CLAUDE_DIR, 'hooks.json')

// The hook script that captures events (must be <1ms execution)
const HOOK_SCRIPT = `#!/usr/bin/env node
// OppMon event capture hook - executes in <1ms
// This hook is called by Claude Code on skill/tool invocations

const fs = require('fs');
const path = require('path');

const BUFFER_FILE = path.join(require('os').homedir(), '.tag', 'events.buffer');
const SETTINGS_FILE = path.join(require('os').homedir(), '.tag', 'events.settings');

try {
  // Quick check if events enabled (sync read, ~0.1ms)
  if (!fs.existsSync(SETTINGS_FILE)) process.exit(0);
  const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
  if (!settings.enabled) process.exit(0);

  // Parse hook input from stdin or args
  const input = process.argv[2] || process.env.CLAUDE_HOOK_INPUT || '{}';
  const data = JSON.parse(input);

  // Only capture skill and mcp invocations
  const resourceType = data.type || data.resource_type;
  if (!['skill', 'mcp_server', 'tool'].includes(resourceType)) process.exit(0);

  // Build event (no user data, just resource info)
  const event = {
    resource_type: resourceType === 'tool' ? 'mcp_server' : resourceType,
    resource_id: data.name || data.id || 'unknown',
    action: data.action || 'invoke',
    timestamp: new Date().toISOString(),
    metadata: data.metadata || undefined
  };

  // Ensure dir exists
  const tagDir = path.dirname(BUFFER_FILE);
  if (!fs.existsSync(tagDir)) fs.mkdirSync(tagDir, { recursive: true });

  // Append event (append-only, no locking needed)
  fs.appendFileSync(BUFFER_FILE, JSON.stringify(event) + '\\n');
} catch (e) {
  // Silent fail - never block Claude Code
}
`

interface ClaudeHooksConfig {
  hooks?: {
    preToolCall?: string[]
    postToolCall?: string[]
    preSkillInvoke?: string[]
    postSkillInvoke?: string[]
  }
}

const HOOK_ID = 'oppmon-event-capture'
const HOOK_COMMAND = `node -e "${HOOK_SCRIPT.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`

/**
 * Read Claude hooks configuration
 */
function readHooksConfig(): ClaudeHooksConfig {
  try {
    if (existsSync(HOOKS_FILE)) {
      return JSON.parse(readFileSync(HOOKS_FILE, 'utf-8'))
    }
  } catch {
    // Ignore parse errors
  }
  return {}
}

/**
 * Write Claude hooks configuration
 */
function writeHooksConfig(config: ClaudeHooksConfig): void {
  if (!existsSync(CLAUDE_DIR)) {
    mkdirSync(CLAUDE_DIR, { recursive: true })
  }
  writeFileSync(HOOKS_FILE, JSON.stringify(config, null, 2))
}

/**
 * Check if hook is installed
 */
function isHookInstalled(): boolean {
  const config = readHooksConfig()
  const hooks = config.hooks?.postSkillInvoke || []
  return hooks.some(h => h.includes(HOOK_ID) || h.includes('oppmon'))
}

/**
 * Install the event capture hook
 */
async function installCommand(): Promise<void> {
  console.log(chalk.bold('\nInstalling OppMon event capture hook...\n'))

  if (isHookInstalled()) {
    console.log(chalk.yellow('Hook is already installed.'))
    console.log(chalk.dim(`Config: ${HOOKS_FILE}`))
    return
  }

  const config = readHooksConfig()
  if (!config.hooks) {
    config.hooks = {}
  }

  // Install hook for skill invocations
  if (!config.hooks.postSkillInvoke) {
    config.hooks.postSkillInvoke = []
  }
  config.hooks.postSkillInvoke.push(`# ${HOOK_ID}\n${HOOK_COMMAND}`)

  // Install hook for tool calls (MCP)
  if (!config.hooks.postToolCall) {
    config.hooks.postToolCall = []
  }
  config.hooks.postToolCall.push(`# ${HOOK_ID}\n${HOOK_COMMAND}`)

  writeHooksConfig(config)

  console.log(chalk.green('✓ Hook installed successfully'))
  console.log(chalk.dim(`\nConfig: ${HOOKS_FILE}`))
  console.log(chalk.dim('\nThe hook will capture skill and MCP tool invocations.'))
  console.log(chalk.dim('Events are buffered locally and flushed every 30 seconds.'))
  console.log(chalk.dim('\nTo enable event collection, run: tag events enable'))
}

/**
 * Uninstall the event capture hook
 */
async function uninstallCommand(): Promise<void> {
  console.log(chalk.bold('\nUninstalling OppMon event capture hook...\n'))

  if (!isHookInstalled()) {
    console.log(chalk.yellow('Hook is not installed.'))
    return
  }

  const config = readHooksConfig()

  if (config.hooks) {
    // Remove from postSkillInvoke
    if (config.hooks.postSkillInvoke) {
      config.hooks.postSkillInvoke = config.hooks.postSkillInvoke.filter(
        h => !h.includes(HOOK_ID) && !h.includes('oppmon')
      )
      if (config.hooks.postSkillInvoke.length === 0) {
        delete config.hooks.postSkillInvoke
      }
    }

    // Remove from postToolCall
    if (config.hooks.postToolCall) {
      config.hooks.postToolCall = config.hooks.postToolCall.filter(
        h => !h.includes(HOOK_ID) && !h.includes('oppmon')
      )
      if (config.hooks.postToolCall.length === 0) {
        delete config.hooks.postToolCall
      }
    }

    // Clean up empty hooks object
    if (Object.keys(config.hooks).length === 0) {
      delete config.hooks
    }
  }

  writeHooksConfig(config)

  console.log(chalk.green('✓ Hook uninstalled successfully'))
  console.log(chalk.dim(`\nConfig: ${HOOKS_FILE}`))
}

/**
 * Check hook installation status
 */
async function statusCommand(): Promise<void> {
  console.log(chalk.bold('\nOppMon Hook Status\n'))

  const installed = isHookInstalled()
  const config = readHooksConfig()

  console.log(`Installation: ${installed ? chalk.green('✓ Installed') : chalk.yellow('✗ Not installed')}`)
  console.log(`Config file:  ${chalk.dim(HOOKS_FILE)}`)
  console.log(`Config exists: ${existsSync(HOOKS_FILE) ? chalk.green('Yes') : chalk.yellow('No')}`)

  if (config.hooks) {
    console.log(chalk.bold('\nConfigured Hooks:'))
    if (config.hooks.postSkillInvoke?.length) {
      console.log(`  postSkillInvoke: ${config.hooks.postSkillInvoke.length} hook(s)`)
    }
    if (config.hooks.postToolCall?.length) {
      console.log(`  postToolCall: ${config.hooks.postToolCall.length} hook(s)`)
    }
    if (config.hooks.preSkillInvoke?.length) {
      console.log(`  preSkillInvoke: ${config.hooks.preSkillInvoke.length} hook(s)`)
    }
    if (config.hooks.preToolCall?.length) {
      console.log(`  preToolCall: ${config.hooks.preToolCall.length} hook(s)`)
    }
  }

  console.log('')

  if (!installed) {
    console.log(chalk.dim('Run "tag hooks install" to install the event capture hook.'))
  }
}

/**
 * Create hooks command
 */
export function createHooksCommand(): Command {
  const hooks = new Command('hooks')
    .description('Manage Claude Code event capture hooks')

  hooks
    .command('install')
    .description('Install event capture hook into Claude Code')
    .action(installCommand)

  hooks
    .command('uninstall')
    .description('Remove event capture hook from Claude Code')
    .action(uninstallCommand)

  hooks
    .command('status')
    .description('Check hook installation status')
    .action(statusCommand)

  // Default action: show status
  hooks.action(statusCommand)

  return hooks
}
