/**
 * Models Command
 *
 * Manage AI model registry — list, show, create, test, delete, rotate.
 *
 * Usage:
 *   oppmon models list                              List all visible models
 *   oppmon models providers                         List provider templates
 *   oppmon models show <id>                         Show one model
 *   oppmon models create                            Interactive create wizard
 *   oppmon models test --provider <id>              Test connection (no persist)
 *   oppmon models delete <id>                       Soft-delete a model
 *   oppmon models rotate <id>                       Rotate the model's secret
 *   oppmon models toggle <id>                       Enable / disable
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { createInterface } from 'readline'
import {
  createApiClient,
  Model,
  ModelScope,
  ProviderTemplate,
  ProviderField,
  CreateModelInput,
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

const PROVIDER_ICONS: Record<string, string> = {
  anthropic: '🔮',
  bedrock: '☁️',
  'azure-openai': '🔷',
  openai: '🤖',
  ollama: '🦙',
  cerebras: '⚡',
  'openai-compatible': '🔌',
}

function providerLabel(id: string | null): string {
  if (!id) return chalk.dim('yaml')
  return `${PROVIDER_ICONS[id] || ''} ${id}`.trim()
}

function truncate(str: string, n: number): string {
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a)))
}

function fail(msg: string): never {
  console.error(chalk.red(`Error: ${msg}`))
  process.exit(EXIT_CODES.ERROR)
}

// ============================================================================
// list
// ============================================================================

interface ListOptions {
  scope?: string
  provider?: string
  search?: string
  enabled?: boolean
  disabled?: boolean
  json?: boolean
  limit?: string
}

async function listCommand(options: ListOptions): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Fetching models...').start()

  try {
    const enabled =
      options.enabled === true ? true : options.disabled === true ? false : undefined

    const response = await api.listModels({
      scope: options.scope as ModelScope | undefined,
      providerTemplateId: options.provider,
      search: options.search,
      enabled,
      limit: options.limit ? parseInt(options.limit, 10) : 100,
    })

    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response, null, 2))
      return
    }

    const models = response.data
    if (models.length === 0) {
      console.log(chalk.yellow('No models found.'))
      console.log(chalk.dim('Create one with: oppmon models create'))
      return
    }

    console.log(chalk.bold(`\nModels (${response.meta?.total ?? models.length}):\n`))
    console.log(
      chalk.dim(
        `${'Name'.padEnd(28)} ${'Provider'.padEnd(22)} ${'Identifier'.padEnd(28)} ${'Scope'.padEnd(8)} ${'On'.padEnd(4)} Secret`
      )
    )
    console.log(chalk.dim('-'.repeat(105)))

    for (const m of models) {
      const name = truncate(m.displayName, 27).padEnd(28)
      const provider = truncate(providerLabel(m.providerTemplateId), 21).padEnd(22)
      const ident = truncate(m.modelIdentifier, 27).padEnd(28)
      const scope = m.scope.padEnd(8)
      const on = m.enabled ? chalk.green('  ✓') : chalk.red('  ✗')
      const secret = m.hasSecret ? chalk.green('✓ stored') : chalk.dim('—')
      console.log(`${name} ${provider} ${ident} ${scope} ${on}    ${secret}`)
    }

    console.log('')
    console.log(
      chalk.dim(
        `Showing ${models.length} of ${response.meta?.total ?? models.length}. Use --limit to widen.`
      )
    )
  } catch (error) {
    spinner.fail('Failed to fetch models')
    fail((error as Error).message)
  }
}

// ============================================================================
// providers
// ============================================================================

async function providersCommand(options: { json?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Fetching provider templates...').start()

  try {
    const response = await api.listProviders()
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2))
      return
    }

    console.log(chalk.bold('\nAvailable Provider Templates:\n'))
    console.log(
      chalk.dim(`${'ID'.padEnd(22)} ${'Display Name'.padEnd(22)} ${'Category'.padEnd(12)} Default Model`)
    )
    console.log(chalk.dim('-'.repeat(85)))

    for (const p of response.data) {
      const icon = PROVIDER_ICONS[p.id] || ' '
      const id = `${icon} ${p.id}`.padEnd(22)
      const name = truncate(p.displayName, 21).padEnd(22)
      const cat = p.category.padEnd(12)
      const def = p.defaultModel ? chalk.cyan(p.defaultModel) : chalk.dim('—')
      console.log(`${id} ${name} ${cat} ${def}`)
    }

    console.log('')
    console.log(chalk.dim(`Inspect a template: oppmon models providers --json | jq '.[] | select(.id=="anthropic")'`))
  } catch (error) {
    spinner.fail('Failed to fetch providers')
    fail((error as Error).message)
  }
}

// ============================================================================
// show
// ============================================================================

async function showCommand(id: string, options: { json?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora(`Fetching model ${id}...`).start()

  try {
    const response = await api.getModel(id)
    spinner.stop()
    const m = response.data

    if (options.json) {
      console.log(JSON.stringify(m, null, 2))
      return
    }

    console.log(chalk.bold(`\n${m.displayName}`))
    console.log(chalk.dim('─'.repeat(50)))
    console.log(`  ${chalk.dim('id'.padEnd(20))} ${m.id}`)
    console.log(`  ${chalk.dim('provider'.padEnd(20))} ${providerLabel(m.providerTemplateId)}`)
    console.log(`  ${chalk.dim('model identifier'.padEnd(20))} ${m.modelIdentifier}`)
    console.log(`  ${chalk.dim('scope'.padEnd(20))} ${m.scope}${m.teamId ? ` (team ${m.teamId})` : ''}`)
    console.log(`  ${chalk.dim('enabled'.padEnd(20))} ${m.enabled ? chalk.green('yes') : chalk.red('no')}`)
    console.log(`  ${chalk.dim('secret stored'.padEnd(20))} ${m.hasSecret ? chalk.green('yes') : chalk.dim('no')}`)
    console.log(`  ${chalk.dim('yaml mode'.padEnd(20))} ${m.isYamlMode ? chalk.cyan('yes') : 'no'}`)
    console.log(`  ${chalk.dim('last synced'.padEnd(20))} ${m.lastSyncedAt || chalk.dim('never')}`)
    console.log(`  ${chalk.dim('created'.padEnd(20))} ${m.createdAt}`)

    if (m.publicConfig && Object.keys(m.publicConfig).length > 0) {
      console.log(chalk.dim('\nPublic config:'))
      for (const [k, v] of Object.entries(m.publicConfig)) {
        console.log(`  ${chalk.dim(k.padEnd(20))} ${JSON.stringify(v)}`)
      }
    }
    console.log('')
  } catch (error) {
    spinner.fail('Failed to fetch model')
    fail((error as Error).message)
  }
}

// ============================================================================
// create (interactive wizard)
// ============================================================================

async function createCommand(options: {
  provider?: string
  name?: string
  model?: string
  scope?: string
  team?: string
  yes?: boolean
}): Promise<void> {
  requireAuth()
  const api = createApiClient()

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const close = () => rl.close()

  try {
    // 1. Fetch provider list
    const providersSpin = ora('Loading provider templates...').start()
    const provResp = await api.listProviders()
    providersSpin.stop()
    const providers = provResp.data

    // 2. Pick provider
    let template: ProviderTemplate | undefined
    if (options.provider) {
      template = providers.find((p) => p.id === options.provider)
      if (!template) fail(`Unknown provider "${options.provider}". Run: oppmon models providers`)
    } else {
      console.log(chalk.bold('\n1. Choose a provider:\n'))
      providers.forEach((p, i) => {
        const icon = PROVIDER_ICONS[p.id] || ' '
        console.log(
          `  ${chalk.cyan(String(i + 1).padStart(2))}. ${icon} ${chalk.bold(p.displayName)} ${chalk.dim(`(${p.id})`)}`
        )
        console.log(`      ${chalk.dim(p.description)}`)
      })
      const pick = (await ask(rl, chalk.cyan('\n  pick a number ▸ '))).trim()
      const idx = parseInt(pick, 10) - 1
      if (Number.isNaN(idx) || idx < 0 || idx >= providers.length) fail('Invalid selection')
      template = providers[idx]
    }

    console.log(chalk.dim(`\n  using ${template.displayName} ${chalk.cyan(`(${template.id})`)}\n`))

    // 3. Display name
    const displayName =
      options.name?.trim() ||
      (await ask(rl, chalk.cyan('  display name ▸ '))).trim() ||
      fail('Display name is required')
    if (!displayName) fail('Display name is required')

    // 4. Model identifier
    const modelIdentifier =
      options.model?.trim() ||
      (
        await ask(
          rl,
          chalk.cyan(`  model identifier ${template.defaultModel ? chalk.dim(`[${template.defaultModel}]`) : ''} ▸ `)
        )
      ).trim() ||
      template.defaultModel ||
      fail('Model identifier is required')

    // 5. Scope
    const scope: ModelScope =
      (options.scope?.toUpperCase() as ModelScope) ||
      ((await ask(rl, chalk.cyan('  scope (TENANT/TEAM) [TEAM] ▸ '))).trim().toUpperCase() as ModelScope) ||
      'TEAM'
    if (scope !== 'TENANT' && scope !== 'TEAM') fail('Scope must be TENANT or TEAM')

    let teamId: string | undefined = options.team
    if (scope === 'TEAM' && !teamId) {
      teamId = (await ask(rl, chalk.cyan('  teamId (blank = current default) ▸ '))).trim() || undefined
    }

    // 6. Walk template fields
    const publicConfig: Record<string, unknown> = {}
    const secretConfig: Record<string, string> = {}

    console.log(chalk.bold('\n2. Provider configuration:\n'))
    for (const f of template.fields as ProviderField[]) {
      const def = f.default !== undefined ? chalk.dim(` [${f.default}]`) : ''
      const req = f.required ? chalk.red('*') : ' '
      const lock = f.secret ? chalk.yellow(' (secret)') : ''
      const raw = (await ask(rl, `  ${req} ${f.label}${lock}${def} ▸ `)).trim()
      const val = raw || (f.default !== undefined ? String(f.default) : '')

      if (f.required && !val) fail(`Field "${f.key}" is required`)
      if (!val) continue

      if (f.secret) {
        secretConfig[f.key] = val
      } else if (f.type === 'number') {
        publicConfig[f.key] = Number(val)
      } else if (f.type === 'boolean') {
        publicConfig[f.key] = val === 'true' || val === '1' || val === 'yes'
      } else if (f.type === 'json') {
        try {
          publicConfig[f.key] = JSON.parse(val)
        } catch {
          fail(`Field "${f.key}" must be valid JSON`)
        }
      } else {
        publicConfig[f.key] = val
      }
    }

    // 7. Test before save?
    let doTest = options.yes
    if (!doTest) {
      const ans = (await ask(rl, chalk.cyan('\n  test connection before saving? (Y/n) ▸ '))).trim().toLowerCase()
      doTest = ans === '' || ans === 'y' || ans === 'yes'
    }

    if (doTest) {
      const tspin = ora('Testing connection...').start()
      try {
        const result = await api.testModelConnection({
          providerTemplateId: template.id,
          publicConfig,
          secretConfig,
        })
        if (result.data.success) {
          tspin.succeed(
            `Connection OK${result.data.latencyMs ? ` (${result.data.latencyMs}ms)` : ''}`
          )
        } else {
          tspin.fail(`Connection failed${result.data.message ? `: ${result.data.message}` : ''}`)
          if (result.data.errors?.length) {
            for (const e of result.data.errors) console.error(chalk.red(`    • ${e}`))
          }
          const cont = (await ask(rl, chalk.yellow('\n  save anyway? (y/N) ▸ '))).trim().toLowerCase()
          if (cont !== 'y' && cont !== 'yes') {
            console.log(chalk.dim('Aborted.'))
            return
          }
        }
      } catch (err) {
        tspin.fail(`Connection test errored: ${(err as Error).message}`)
      }
    }

    // 8. Save
    const saveSpin = ora('Creating model...').start()
    const input: CreateModelInput = {
      displayName,
      providerTemplateId: template.id,
      modelIdentifier,
      publicConfig,
      secretConfig: Object.keys(secretConfig).length > 0 ? secretConfig : undefined,
      scope,
      teamId,
    }

    try {
      const created = await api.createModel(input)
      saveSpin.succeed(`Model "${created.data.displayName}" created (${created.data.id})`)
      console.log(chalk.dim('\nNext: oppmon models test --provider ' + template.id))
      console.log(chalk.dim('      oppmon models list'))
    } catch (error) {
      saveSpin.fail('Create failed')
      fail((error as Error).message)
    }
  } finally {
    close()
  }
}

// ============================================================================
// test
// ============================================================================

async function testCommand(options: {
  provider?: string
  config?: string
  secrets?: string
  yaml?: string
  json?: boolean
}): Promise<void> {
  requireAuth()
  const api = createApiClient()

  if (!options.provider && !options.yaml) {
    fail('Either --provider <id> or --yaml <file> is required')
  }

  let publicConfig: Record<string, unknown> = {}
  let secretConfig: Record<string, string> = {}
  let yamlOverride: string | undefined

  if (options.yaml) {
    const fs = await import('fs/promises')
    yamlOverride = await fs.readFile(options.yaml, 'utf-8')
  }

  if (options.config) {
    try {
      publicConfig = JSON.parse(options.config)
    } catch {
      fail('--config must be valid JSON')
    }
  }
  if (options.secrets) {
    try {
      secretConfig = JSON.parse(options.secrets)
    } catch {
      fail('--secrets must be valid JSON')
    }
  }

  const spinner = ora('Testing connection...').start()
  try {
    const response = await api.testModelConnection({
      providerTemplateId: options.provider,
      publicConfig,
      secretConfig,
      yamlOverride,
    })
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2))
      return
    }

    const r = response.data
    if (r.success) {
      console.log(chalk.green(`✓ Connection OK${r.latencyMs ? ` (${r.latencyMs}ms)` : ''}`))
      if (r.message) console.log(chalk.dim(`  ${r.message}`))
    } else {
      console.log(chalk.red(`✗ Connection failed`))
      if (r.message) console.log(chalk.dim(`  ${r.message}`))
      if (r.errors?.length) for (const e of r.errors) console.log(chalk.red(`    • ${e}`))
      process.exit(EXIT_CODES.ERROR)
    }
  } catch (error) {
    spinner.fail('Test failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// delete
// ============================================================================

async function deleteCommand(id: string, options: { yes?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()

  if (!options.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ans = (await ask(rl, chalk.yellow(`Soft-delete model ${id}? (y/N) ▸ `))).trim().toLowerCase()
    rl.close()
    if (ans !== 'y' && ans !== 'yes') {
      console.log(chalk.dim('Aborted.'))
      return
    }
  }

  const spinner = ora(`Deleting ${id}...`).start()
  try {
    await api.deleteModel(id)
    spinner.succeed(`Model ${id} deleted (soft).`)
    console.log(chalk.dim('Run with --include-deleted in the UI to recover.'))
  } catch (error) {
    spinner.fail('Delete failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// rotate
// ============================================================================

async function rotateCommand(id: string, options: { secrets?: string }): Promise<void> {
  requireAuth()
  const api = createApiClient()

  let secretConfig: Record<string, string>

  if (options.secrets) {
    try {
      secretConfig = JSON.parse(options.secrets)
    } catch {
      fail('--secrets must be valid JSON')
    }
  } else {
    // interactive: walk one or more key/value pairs
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    secretConfig = {}
    console.log(chalk.dim('Enter new secret values. Leave key blank to finish.\n'))
    while (true) {
      const k = (await ask(rl, chalk.cyan('  secret key   ▸ '))).trim()
      if (!k) break
      const v = (await ask(rl, chalk.cyan('  secret value ▸ '))).trim()
      if (!v) {
        console.log(chalk.dim('  (skipped — empty value)'))
        continue
      }
      secretConfig[k] = v
    }
    rl.close()
    if (Object.keys(secretConfig).length === 0) {
      fail('No secrets provided.')
    }
  }

  const spinner = ora(`Rotating secret for ${id}...`).start()
  try {
    await api.rotateModelSecret(id, secretConfig)
    spinner.succeed(`Secret rotated for ${id}`)
  } catch (error) {
    spinner.fail('Rotate failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// toggle
// ============================================================================

async function toggleCommand(id: string, options: { on?: boolean; off?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()

  let enabled: boolean
  if (options.on) enabled = true
  else if (options.off) enabled = false
  else {
    // flip current state
    const m = await api.getModel(id)
    enabled = !m.data.enabled
  }

  const spinner = ora(`${enabled ? 'Enabling' : 'Disabling'} ${id}...`).start()
  try {
    const updated = await api.updateModel(id, { enabled })
    spinner.succeed(`Model ${updated.data.displayName} ${enabled ? chalk.green('enabled') : chalk.red('disabled')}`)
  } catch (error) {
    spinner.fail('Toggle failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// Command Setup
// ============================================================================

export function createModelsCommand(): Command {
  const models = new Command('models').description('Manage AI model registry (list, create, test, rotate, delete)')

  models
    .command('list')
    .alias('ls')
    .description('List all visible models')
    .option('-s, --scope <scope>', 'Filter by scope (TENANT or TEAM)')
    .option('-p, --provider <id>', 'Filter by provider template id')
    .option('--search <text>', 'Filter by display name')
    .option('--enabled', 'Only show enabled')
    .option('--disabled', 'Only show disabled')
    .option('--limit <n>', 'Max rows (default 100)')
    .option('--json', 'Output as JSON')
    .action(listCommand)

  models
    .command('providers')
    .alias('templates')
    .description('List available provider templates')
    .option('--json', 'Output as JSON')
    .action(providersCommand)

  models
    .command('show <id>')
    .alias('get')
    .description('Show details for one model')
    .option('--json', 'Output as JSON')
    .action(showCommand)

  models
    .command('create')
    .alias('new')
    .description('Interactive wizard to create a new model')
    .option('-p, --provider <id>', 'Provider template id (skip prompt)')
    .option('-n, --name <name>', 'Display name')
    .option('-m, --model <id>', 'Model identifier (e.g. claude-3-5-sonnet-20241022)')
    .option('-s, --scope <scope>', 'TENANT or TEAM (default TEAM)')
    .option('--team <id>', 'teamId for TEAM-scoped models')
    .option('-y, --yes', 'Skip the test-before-save prompt and just save')
    .action(createCommand)

  models
    .command('test')
    .description('Test a connection without persisting')
    .option('-p, --provider <id>', 'Provider template id')
    .option('-c, --config <json>', 'Public config as JSON string')
    .option('-s, --secrets <json>', 'Secret config as JSON string')
    .option('--yaml <file>', 'YAML override file (instead of provider+config)')
    .option('--json', 'Output as JSON')
    .action(testCommand)

  models
    .command('delete <id>')
    .alias('rm')
    .description('Soft-delete a model')
    .option('-y, --yes', 'Skip confirmation')
    .action(deleteCommand)

  models
    .command('rotate <id>')
    .description('Rotate the secret for a model')
    .option('-s, --secrets <json>', 'Secret config as JSON (skip prompt)')
    .action(rotateCommand)

  models
    .command('toggle <id>')
    .description('Enable or disable a model (flip current if no flag)')
    .option('--on', 'Force enable')
    .option('--off', 'Force disable')
    .action(toggleCommand)

  models.action(() => models.outputHelp())

  return models
}
