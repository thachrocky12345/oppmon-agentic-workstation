/**
 * Analytics Command
 *
 * Inspect tenant analytics, usage events, costs, and audit log.
 *
 * Usage:
 *   oppmon analytics summary                       Tenant overview
 *   oppmon analytics agents                        Per-agent activity
 *   oppmon analytics models                        Per-model token + request counts
 *   oppmon analytics errors                        Error distribution + trend
 *   oppmon analytics usage                         Privacy-first usage events
 *   oppmon analytics top                           Most-invoked skills/MCPs/RAG
 *   oppmon analytics costs                         Estimated LLM spend
 *   oppmon analytics audit                         Audit log entries (compliance)
 *   oppmon analytics settings                      Show usage event collection state
 *   oppmon analytics enable                        Turn usage event collection on
 *   oppmon analytics disable                       Turn usage event collection off
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { createApiClient, AuditLogFilter } from '../lib/api.js'
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

function truncate(str: string, n: number): string {
  if (!str) return ''
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

function fmtNum(n: number | string | undefined | null): string {
  if (n === null || n === undefined) return '0'
  const num = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(num)) return '0'
  return num.toLocaleString('en-US')
}

function fmtCost(n: number | string | undefined | null): string {
  if (n === null || n === undefined) return '$0.00'
  const num = typeof n === 'string' ? Number(n) : n
  if (!Number.isFinite(num)) return '$0.00'
  return '$' + num.toFixed(num < 1 ? 4 : 2)
}

function fmtPct(numerator: number, denominator: number): string {
  if (!denominator) return '0.0%'
  return ((numerator / denominator) * 100).toFixed(1) + '%'
}

function periodOpt(opts: { period?: string }, allowed: string[], fallback: string): string {
  const p = opts.period || fallback
  if (!allowed.includes(p)) {
    fail(`--period must be one of: ${allowed.join(', ')}`)
  }
  return p
}

function actionColor(action: string): string {
  switch (action) {
    case 'CREATE':
      return chalk.green(action)
    case 'UPDATE':
      return chalk.yellow(action)
    case 'DELETE':
      return chalk.red(action)
    case 'DENIED':
      return chalk.bgRed.white(action)
    case 'READ':
      return chalk.dim(action)
    default:
      return action
  }
}

// ============================================================================
// summary
// ============================================================================

interface SummaryOptions {
  period?: string
  json?: boolean
}

async function summaryCommand(options: SummaryOptions): Promise<void> {
  requireAuth()
  const period = periodOpt(options, ['7d', '30d', '90d'], '7d') as '7d' | '30d' | '90d'
  const api = createApiClient()
  const spinner = ora('Fetching analytics overview...').start()

  try {
    const data = await api.getAnalyticsOverview(period)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(data, null, 2))
      return
    }

    const s = data.summary
    console.log(chalk.bold(`\nAnalytics Summary (${period}):\n`))
    console.log(`  ${chalk.dim('Total events     ')} ${fmtNum(s.totalEvents)}`)
    console.log(
      `  ${chalk.dim('Errors           ')} ${fmtNum(s.totalErrors)} ${chalk.dim(
        `(${fmtPct(s.totalErrors, s.totalEvents)})`
      )}`
    )
    console.log(`  ${chalk.dim('Active agents    ')} ${fmtNum(s.activeAgents)}`)
    console.log(`  ${chalk.dim('Active days      ')} ${fmtNum(s.activeDays)}`)
    console.log(`  ${chalk.dim('LLM requests     ')} ${fmtNum(s.totalRequests)}`)
    console.log(`  ${chalk.dim('LLM tokens       ')} ${fmtNum(s.totalTokens)}`)
    console.log(`  ${chalk.dim('Estimated cost   ')} ${chalk.cyan(fmtCost(s.estimatedCost))}`)

    if (data.topAgents?.length) {
      console.log(chalk.bold('\nTop agents (by event count):'))
      console.log(chalk.dim(`  ${'Agent'.padEnd(28)} ${'Events'.padStart(10)} ${'Errors'.padStart(8)}`))
      console.log(chalk.dim('  ' + '-'.repeat(48)))
      for (const a of data.topAgents.slice(0, 5)) {
        const name = truncate(a.name, 27).padEnd(28)
        const ev = fmtNum(a.total_events).padStart(10)
        const er = fmtNum(a.total_errors).padStart(8)
        console.log(`  ${name} ${ev} ${er}`)
      }
    }

    if (data.trend?.length) {
      console.log(chalk.bold('\nDaily trend (events):'))
      const max = Math.max(1, ...data.trend.map((t) => Number(t.events) || 0))
      for (const row of data.trend.slice(-14)) {
        const events = Number(row.events) || 0
        const bar = '█'.repeat(Math.max(1, Math.round((events / max) * 30)))
        console.log(
          `  ${chalk.dim(row.day.slice(0, 10).padEnd(11))} ${chalk.cyan(bar.padEnd(30))} ${fmtNum(
            events
          )}`
        )
      }
    }

    console.log('')
  } catch (error) {
    spinner.fail('Failed to fetch analytics overview')
    fail((error as Error).message)
  }
}

// ============================================================================
// agents
// ============================================================================

async function agentsCommand(options: { period?: string; limit?: string; json?: boolean }): Promise<void> {
  requireAuth()
  const period = periodOpt(options, ['7d', '30d', '90d'], '7d') as '7d' | '30d' | '90d'
  const limit = options.limit ? parseInt(options.limit, 10) : 20
  const api = createApiClient()
  const spinner = ora('Fetching per-agent analytics...').start()

  try {
    const r = await api.getAnalyticsAgents(period)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(r, null, 2))
      return
    }

    const rows = r.data.slice(0, limit)
    if (rows.length === 0) {
      console.log(chalk.yellow('No agent activity found for this period.'))
      return
    }

    console.log(chalk.bold(`\nAgents (${period}):\n`))
    console.log(
      chalk.dim(
        `${'Name'.padEnd(28)} ${'Status'.padEnd(10)} ${'Events'.padStart(8)} ${'Errors'.padStart(7)} ${'ErrRate'.padStart(7)} ${'Days'.padStart(5)}`
      )
    )
    console.log(chalk.dim('-'.repeat(76)))
    for (const a of rows) {
      const name = truncate(a.name, 27).padEnd(28)
      const status = (a.status || '—').padEnd(10)
      const ev = fmtNum(a.total_events).padStart(8)
      const er = fmtNum(a.total_errors).padStart(7)
      const rate = fmtPct(Number(a.total_errors) || 0, Number(a.total_events) || 0).padStart(7)
      const days = fmtNum(a.active_days).padStart(5)
      console.log(`${name} ${status} ${ev} ${er} ${rate} ${days}`)
    }
    console.log('')
  } catch (error) {
    spinner.fail('Failed to fetch agent analytics')
    fail((error as Error).message)
  }
}

// ============================================================================
// models
// ============================================================================

async function modelsCommand(options: { period?: string; json?: boolean }): Promise<void> {
  requireAuth()
  const period = periodOpt(options, ['7d', '30d', '90d'], '7d') as '7d' | '30d' | '90d'
  const api = createApiClient()
  const spinner = ora('Fetching per-model usage...').start()

  try {
    const r = await api.getAnalyticsModels(period)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(r, null, 2))
      return
    }

    const rows = r.data
    if (rows.length === 0) {
      console.log(chalk.yellow('No model activity found.'))
      return
    }

    console.log(chalk.bold(`\nModels (${period}):\n`))
    console.log(
      chalk.dim(
        `${'Model'.padEnd(36)} ${'Provider'.padEnd(12)} ${'Requests'.padStart(10)} ${'In Toks'.padStart(11)} ${'Out Toks'.padStart(11)} ${'Days'.padStart(5)}`
      )
    )
    console.log(chalk.dim('-'.repeat(95)))
    for (const m of rows) {
      const name = truncate(m.model, 35).padEnd(36)
      const prov = truncate(m.provider, 11).padEnd(12)
      const req = fmtNum(m.request_count).padStart(10)
      const inT = fmtNum(m.total_input_tokens).padStart(11)
      const outT = fmtNum(m.total_output_tokens).padStart(11)
      const days = fmtNum(m.active_days).padStart(5)
      console.log(`${name} ${prov} ${req} ${inT} ${outT} ${days}`)
    }
    console.log('')
  } catch (error) {
    spinner.fail('Failed to fetch model analytics')
    fail((error as Error).message)
  }
}

// ============================================================================
// errors
// ============================================================================

async function errorsCommand(options: { period?: string; json?: boolean }): Promise<void> {
  requireAuth()
  const period = periodOpt(options, ['7d', '30d'], '7d') as '7d' | '30d'
  const api = createApiClient()
  const spinner = ora('Fetching error analytics...').start()

  try {
    const data = await api.getAnalyticsErrors(period)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(data, null, 2))
      return
    }

    const totalErrors = data.byType.reduce((s, r) => s + (Number(r.count) || 0), 0)
    console.log(chalk.bold(`\nErrors (${period}) — total: ${fmtNum(totalErrors)}\n`))

    if (data.byType.length === 0) {
      console.log(chalk.green('  No errors recorded for this period. ✨'))
      console.log('')
      return
    }

    console.log(chalk.bold('  By type:'))
    for (const row of data.byType.slice(0, 10)) {
      const pct = fmtPct(Number(row.count) || 0, totalErrors)
      console.log(
        `    ${chalk.red(truncate(row.error_type, 36).padEnd(38))} ${fmtNum(row.count).padStart(7)}  ${chalk.dim(pct)}`
      )
    }

    if (data.byAgent?.length) {
      console.log(chalk.bold('\n  By agent:'))
      for (const row of data.byAgent.slice(0, 10)) {
        console.log(
          `    ${chalk.dim(truncate(row.name, 36).padEnd(38))} ${fmtNum(row.error_count).padStart(7)}`
        )
      }
    }

    if (data.trend?.length) {
      console.log(chalk.bold('\n  Daily trend:'))
      const max = Math.max(1, ...data.trend.map((t) => Number(t.count) || 0))
      for (const row of data.trend.slice(-14)) {
        const cnt = Number(row.count) || 0
        const bar = '█'.repeat(Math.max(1, Math.round((cnt / max) * 30)))
        console.log(`    ${chalk.dim(row.date.slice(0, 10).padEnd(11))} ${chalk.red(bar.padEnd(30))} ${fmtNum(cnt)}`)
      }
    }
    console.log('')
  } catch (error) {
    spinner.fail('Failed to fetch error analytics')
    fail((error as Error).message)
  }
}

// ============================================================================
// usage
// ============================================================================

async function usageCommand(options: { period?: string; json?: boolean }): Promise<void> {
  requireAuth()
  const period = periodOpt(options, ['24h', '7d', '30d'], '7d') as '24h' | '7d' | '30d'
  const api = createApiClient()
  const spinner = ora('Fetching usage events...').start()

  try {
    const r = await api.getUsageStats(period)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(r, null, 2))
      return
    }

    const stats = r.data
    console.log(chalk.bold(`\nUsage (${period}):\n`))
    console.log(`  ${chalk.dim('Total events     ')} ${fmtNum(stats.totalEvents)}`)
    console.log(`  ${chalk.dim('Time series buckets ')} ${fmtNum(stats.timeSeries.length)}`)

    if (stats.byResourceType?.length) {
      console.log(chalk.bold('\n  By resource type:'))
      for (const row of stats.byResourceType) {
        const t = (row.resourceType || '—').padEnd(18)
        console.log(`    ${chalk.cyan(t)} ${fmtNum(row.count).padStart(10)}`)
      }
    }

    if (stats.byAction?.length) {
      console.log(chalk.bold('\n  By action:'))
      for (const row of stats.byAction) {
        const a = (row.action || '—').padEnd(18)
        console.log(`    ${chalk.magenta(a)} ${fmtNum(row.count).padStart(10)}`)
      }
    }
    console.log('')
    console.log(
      chalk.dim(
        '  Privacy-first: counts only, no user_id is recorded. See `oppmon analytics settings`.\n'
      )
    )
  } catch (error) {
    spinner.fail('Failed to fetch usage stats')
    fail((error as Error).message)
  }
}

// ============================================================================
// top
// ============================================================================

async function topCommand(options: {
  period?: string
  type?: string
  limit?: string
  json?: boolean
}): Promise<void> {
  requireAuth()
  const period = periodOpt(options, ['24h', '7d', '30d'], '7d') as '24h' | '7d' | '30d'
  const limit = options.limit ? parseInt(options.limit, 10) : 10
  let resourceType: 'skill' | 'mcp_server' | 'rag_query' | undefined
  if (options.type) {
    const allowed = ['skill', 'mcp_server', 'rag_query']
    if (!allowed.includes(options.type)) fail(`--type must be one of: ${allowed.join(', ')}`)
    resourceType = options.type as 'skill' | 'mcp_server' | 'rag_query'
  }

  const api = createApiClient()
  const spinner = ora('Fetching top resources...').start()

  try {
    const r = await api.getUsageTopResources({ period, limit, resourceType })
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(r, null, 2))
      return
    }

    if (r.data.length === 0) {
      console.log(chalk.yellow('No usage events recorded for this period.'))
      console.log(chalk.dim('Tip: run `oppmon analytics settings` — events may be disabled.'))
      return
    }

    console.log(
      chalk.bold(
        `\nTop resources (${period}${resourceType ? ', type=' + resourceType : ''}):\n`
      )
    )
    console.log(chalk.dim(`${'Rank'.padEnd(5)} ${'Type'.padEnd(14)} ${'ID'.padEnd(38)} ${'Count'.padStart(8)}`))
    console.log(chalk.dim('-'.repeat(70)))
    r.data.forEach((row, i) => {
      const rank = ('#' + (i + 1)).padEnd(5)
      const t = (row.resource_type || '—').padEnd(14)
      const id = truncate(row.resource_id, 37).padEnd(38)
      const cnt = fmtNum(row.count).padStart(8)
      console.log(`${chalk.cyan(rank)} ${t} ${chalk.dim(id)} ${cnt}`)
    })
    console.log('')
  } catch (error) {
    spinner.fail('Failed to fetch top resources')
    fail((error as Error).message)
  }
}

// ============================================================================
// costs
// ============================================================================

async function costsCommand(options: { period?: string; byModel?: boolean; json?: boolean }): Promise<void> {
  requireAuth()
  const period = periodOpt(options, ['7d', '30d', '90d'], '30d') as '7d' | '30d' | '90d'
  const api = createApiClient()
  const spinner = ora('Fetching cost analytics...').start()

  try {
    const overview = await api.getCostsOverview(period)
    let byModel: { data: Array<{ model_id: string; provider: string; input_tokens: number; output_tokens: number; request_count: number; total_tokens: number; total_cost: number }> } | null = null
    if (options.byModel) {
      const limited = period === '90d' ? '30d' : period
      byModel = await api.getCostsByModel(limited as '7d' | '30d')
    }
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify({ overview, byModel }, null, 2))
      return
    }

    const s = overview.summary
    console.log(chalk.bold(`\nCosts (${period}):\n`))
    console.log(`  ${chalk.dim('Total cost       ')} ${chalk.cyan(fmtCost(s.total_cost))}`)
    console.log(`  ${chalk.dim('Total tokens     ')} ${fmtNum(s.total_tokens)}`)
    console.log(`  ${chalk.dim('Avg daily cost   ')} ${fmtCost(s.avg_daily_cost)}`)
    console.log(`  ${chalk.dim('Active users     ')} ${fmtNum(s.active_users)}`)

    if (overview.trend?.length) {
      console.log(chalk.bold('\n  Daily spend:'))
      const max = Math.max(1e-9, ...overview.trend.map((t) => Number(t.cost) || 0))
      for (const row of overview.trend.slice(-14)) {
        const c = Number(row.cost) || 0
        const bar = '█'.repeat(Math.max(1, Math.round((c / max) * 30)))
        console.log(
          `    ${chalk.dim(row.day.slice(0, 10).padEnd(11))} ${chalk.green(bar.padEnd(30))} ${fmtCost(c)}`
        )
      }
    }

    if (byModel?.data?.length) {
      console.log(chalk.bold('\n  By model:'))
      console.log(
        chalk.dim(
          `    ${'Model'.padEnd(36)} ${'Provider'.padEnd(12)} ${'Requests'.padStart(10)} ${'Tokens'.padStart(12)} ${'Cost'.padStart(10)}`
        )
      )
      console.log(chalk.dim('    ' + '-'.repeat(85)))
      for (const m of byModel.data) {
        const name = truncate(m.model_id, 35).padEnd(36)
        const prov = truncate(m.provider, 11).padEnd(12)
        const req = fmtNum(m.request_count).padStart(10)
        const toks = fmtNum(m.total_tokens).padStart(12)
        const cost = fmtCost(m.total_cost).padStart(10)
        console.log(`    ${name} ${prov} ${req} ${toks} ${chalk.cyan(cost)}`)
      }
    }

    console.log('')
    console.log(
      chalk.dim('  Cost = total_tokens × $0.000001. Tune by registering per-model pricing.\n')
    )
  } catch (error) {
    spinner.fail('Failed to fetch costs')
    fail((error as Error).message)
  }
}

// ============================================================================
// audit
// ============================================================================

async function auditCommand(options: {
  resourceType?: string
  resourceId?: string
  action?: string
  actor?: string
  start?: string
  end?: string
  limit?: string
  offset?: string
  json?: boolean
}): Promise<void> {
  requireAuth()
  const filter: AuditLogFilter = {}
  if (options.resourceType) filter.resourceType = options.resourceType
  if (options.resourceId) filter.resourceId = options.resourceId
  if (options.actor) filter.actorId = options.actor
  if (options.start) filter.startDate = options.start
  if (options.end) filter.endDate = options.end
  if (options.limit) filter.limit = parseInt(options.limit, 10)
  if (options.offset) filter.offset = parseInt(options.offset, 10)
  if (options.action) {
    const a = options.action.toUpperCase()
    if (!['CREATE', 'READ', 'UPDATE', 'DELETE', 'DENIED'].includes(a)) {
      fail('--action must be CREATE, READ, UPDATE, DELETE, or DENIED')
    }
    filter.action = a as 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'DENIED'
  }

  const api = createApiClient()
  const spinner = ora('Fetching audit log...').start()

  try {
    const r = await api.queryAuditLog(filter)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(r, null, 2))
      return
    }

    if (r.data.length === 0) {
      console.log(chalk.yellow('No audit log entries match.'))
      return
    }

    console.log(chalk.bold(`\nAudit log (${r.data.length} of ${r.total}):\n`))
    console.log(
      chalk.dim(
        `${'When (UTC)'.padEnd(20)} ${'Action'.padEnd(8)} ${'Resource'.padEnd(18)} ${'ResourceID'.padEnd(28)} Actor`
      )
    )
    console.log(chalk.dim('-'.repeat(95)))

    for (const e of r.data) {
      const ts = (e.createdAt || '').slice(0, 19).replace('T', ' ').padEnd(20)
      const act = actionColor(e.action).padEnd(8 + (actionColor(e.action).length - e.action.length))
      const rt = truncate(e.resourceType, 17).padEnd(18)
      const rid = truncate(e.resourceId, 27).padEnd(28)
      console.log(`${chalk.dim(ts)} ${act} ${rt} ${chalk.dim(rid)} ${e.actorId.slice(0, 16)}…`)
    }

    console.log('')
    console.log(
      chalk.dim(
        `Showing ${r.data.length} of ${r.total} entries. Use --limit / --offset / --start / --end to refine.\n`
      )
    )
  } catch (error) {
    spinner.fail('Failed to fetch audit log')
    fail((error as Error).message)
  }
}

// ============================================================================
// settings / enable / disable
// ============================================================================

async function settingsCommand(options: { json?: boolean }): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora('Fetching usage settings...').start()
  try {
    const r = await api.getUsageSettings()
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(r, null, 2))
      return
    }
    const enabled = r.data.eventsEnabled
    console.log(chalk.bold('\nUsage event collection:'))
    console.log(
      `  state: ${enabled ? chalk.green('● enabled') : chalk.gray('○ disabled')}\n`
    )
    if (!enabled) {
      console.log(
        chalk.dim('  Toggle with `oppmon analytics enable`. While disabled, /api/usage POSTs return 204 silently.\n')
      )
    } else {
      console.log(
        chalk.dim(
          '  Counts-only events are bucketed into 15-minute windows. No user_id is ever recorded.\n'
        )
      )
    }
  } catch (error) {
    spinner.fail('Failed to fetch usage settings')
    fail((error as Error).message)
  }
}

async function setEnabledCommand(enabled: boolean): Promise<void> {
  requireAuth()
  const api = createApiClient()
  const spinner = ora(`${enabled ? 'Enabling' : 'Disabling'} usage events...`).start()
  try {
    await api.updateUsageSettings(enabled)
    spinner.succeed(
      `Usage event collection ${enabled ? chalk.green('enabled') : chalk.red('disabled')}`
    )
    if (enabled) {
      console.log(chalk.dim('  /api/usage POSTs will now upsert into 15-minute aggregate buckets.'))
    } else {
      console.log(chalk.dim('  /api/usage POSTs will return 204 without persisting (privacy default).'))
    }
  } catch (error) {
    spinner.fail('Update failed')
    fail((error as Error).message)
  }
}

// ============================================================================
// Command Setup
// ============================================================================

export function createAnalyticsCommand(): Command {
  const analytics = new Command('analytics').description(
    'Inspect tenant analytics, usage events, costs, and audit log'
  )

  analytics
    .command('summary')
    .alias('overview')
    .description('Tenant overview: events, errors, agents, tokens, estimated cost')
    .option('-p, --period <period>', '7d | 30d | 90d (default 7d)')
    .option('--json', 'Output as JSON')
    .action(summaryCommand)

  analytics
    .command('agents')
    .description('Per-agent activity (events, errors, error rate, active days)')
    .option('-p, --period <period>', '7d | 30d | 90d (default 7d)')
    .option('--limit <n>', 'Max rows (default 20)')
    .option('--json', 'Output as JSON')
    .action(agentsCommand)

  analytics
    .command('models')
    .description('Per-model token + request counts')
    .option('-p, --period <period>', '7d | 30d | 90d (default 7d)')
    .option('--json', 'Output as JSON')
    .action(modelsCommand)

  analytics
    .command('errors')
    .description('Error distribution by type, agent, and daily trend')
    .option('-p, --period <period>', '7d | 30d (default 7d)')
    .option('--json', 'Output as JSON')
    .action(errorsCommand)

  analytics
    .command('usage')
    .description('Privacy-first usage events (counts-only, no user_id)')
    .option('-p, --period <period>', '24h | 7d | 30d (default 7d)')
    .option('--json', 'Output as JSON')
    .action(usageCommand)

  analytics
    .command('top')
    .description('Most-invoked skills / MCP servers / RAG collections')
    .option('-p, --period <period>', '24h | 7d | 30d (default 7d)')
    .option('-t, --type <type>', 'Filter by skill | mcp_server | rag_query')
    .option('--limit <n>', 'Max rows (default 10)')
    .option('--json', 'Output as JSON')
    .action(topCommand)

  analytics
    .command('costs')
    .description('Estimated LLM spend (token-based)')
    .option('-p, --period <period>', '7d | 30d | 90d (default 30d)')
    .option('--by-model', 'Include per-model breakdown')
    .option('--json', 'Output as JSON')
    .action(costsCommand)

  analytics
    .command('audit')
    .description('Compliance audit log (filtered)')
    .option('--resource-type <type>', 'Filter by resource type (skill, agent, mcp_server, …)')
    .option('--resource-id <id>', 'Filter by specific resource id')
    .option('-a, --action <action>', 'CREATE | READ | UPDATE | DELETE | DENIED')
    .option('--actor <userId>', 'Filter by actor user id')
    .option('--start <iso>', 'Start date (ISO 8601)')
    .option('--end <iso>', 'End date (ISO 8601)')
    .option('--limit <n>', 'Max rows (default 100)')
    .option('--offset <n>', 'Offset for pagination')
    .option('--json', 'Output as JSON')
    .action(auditCommand)

  analytics
    .command('settings')
    .description('Show usage event collection state (events_enabled flag)')
    .option('--json', 'Output as JSON')
    .action(settingsCommand)

  analytics
    .command('enable')
    .description('Turn usage event collection on (TENANT_ADMIN)')
    .action(() => setEnabledCommand(true))

  analytics
    .command('disable')
    .description('Turn usage event collection off (TENANT_ADMIN)')
    .action(() => setEnabledCommand(false))

  analytics.action(() => analytics.outputHelp())

  return analytics
}
