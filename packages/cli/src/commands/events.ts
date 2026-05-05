/**
 * Events Command
 *
 * Enable, disable, and manage event collection.
 *
 * Usage:
 *   tag events enable      - Enable event collection
 *   tag events disable     - Disable event collection
 *   tag events status      - Show event collection status
 *   tag events flush       - Manually flush buffered events
 *   tag events clear       - Clear buffered events
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import {
  isEventsEnabled,
  setEventsEnabled,
  getEventSettings,
  getBufferSize,
  getBufferPath,
  clearBuffer,
  getSettingsPath,
} from '../lib/event-buffer.js'
import { flushEvents, getFlushStatus } from '../services/event-flusher.js'
import { isAuthenticated } from '../lib/credentials.js'
import { EXIT_CODES } from '../lib/types.js'

/**
 * Enable event collection
 */
async function enableCommand(): Promise<void> {
  console.log(chalk.bold('\nEnabling event collection...\n'))

  if (isEventsEnabled()) {
    console.log(chalk.yellow('Event collection is already enabled.'))
    return
  }

  setEventsEnabled(true)

  console.log(chalk.green('✓ Event collection enabled'))
  console.log(chalk.dim('\nEvents will be buffered locally and flushed every 30 seconds.'))
  console.log(chalk.dim('Make sure the hook is installed: tag hooks status'))

  if (!isAuthenticated()) {
    console.log(chalk.yellow('\n⚠ Warning: Not authenticated. Events will buffer but not flush.'))
    console.log(chalk.dim('Run "tag login" to authenticate.'))
  }
}

/**
 * Disable event collection
 */
async function disableCommand(): Promise<void> {
  console.log(chalk.bold('\nDisabling event collection...\n'))

  if (!isEventsEnabled()) {
    console.log(chalk.yellow('Event collection is already disabled.'))
    return
  }

  setEventsEnabled(false)

  console.log(chalk.green('✓ Event collection disabled'))
  console.log(chalk.dim('\nNo new events will be captured.'))

  const bufferSize = getBufferSize()
  if (bufferSize > 0) {
    console.log(chalk.dim(`\n${bufferSize} buffered events remain.`))
    console.log(chalk.dim('Run "tag events flush" to send them, or "tag events clear" to discard.'))
  }
}

/**
 * Show event collection status
 */
async function statusCommand(): Promise<void> {
  console.log(chalk.bold('\nEvent Collection Status\n'))

  const status = getFlushStatus()
  const settings = getEventSettings()

  // Collection status
  console.log(`Collection: ${status.enabled ? chalk.green('✓ Enabled') : chalk.yellow('✗ Disabled')}`)
  console.log(`Auth:       ${status.authenticated ? chalk.green('✓ Authenticated') : chalk.yellow('✗ Not authenticated')}`)

  // Buffer info
  console.log(chalk.bold('\nBuffer:'))
  console.log(`  Events:    ${status.bufferSize}`)
  console.log(`  Location:  ${chalk.dim(getBufferPath())}`)

  // Flush info
  console.log(chalk.bold('\nFlush Stats:'))
  if (settings.lastFlush) {
    const lastFlushDate = new Date(settings.lastFlush)
    const ago = Math.round((Date.now() - lastFlushDate.getTime()) / 1000)
    console.log(`  Last flush:    ${lastFlushDate.toLocaleString()} (${ago}s ago)`)
  } else {
    console.log(`  Last flush:    ${chalk.dim('Never')}`)
  }
  console.log(`  Total flushed: ${settings.totalFlushed || 0}`)

  // Settings file
  console.log(chalk.bold('\nSettings:'))
  console.log(`  Location: ${chalk.dim(getSettingsPath())}`)

  console.log('')

  // Warnings
  if (status.enabled && !status.authenticated) {
    console.log(chalk.yellow('⚠ Events are enabled but not authenticated.'))
    console.log(chalk.dim('Run "tag login" to allow event flushing.'))
  }

  if (status.bufferSize > 5000) {
    console.log(chalk.yellow(`⚠ Buffer is large (${status.bufferSize} events).`))
    console.log(chalk.dim('Consider running "tag events flush" or "tag events clear".'))
  }
}

/**
 * Manually flush buffered events
 */
async function flushCommand(): Promise<void> {
  const spinner = ora('Flushing events...').start()

  if (!isAuthenticated()) {
    spinner.fail('Not authenticated')
    console.error(chalk.red('\nRun "tag login" first.'))
    process.exit(EXIT_CODES.AUTH_REQUIRED)
  }

  const bufferSize = getBufferSize()
  if (bufferSize === 0) {
    spinner.succeed('No events to flush')
    return
  }

  spinner.text = `Flushing ${bufferSize} events...`

  const result = await flushEvents()

  if (result.success) {
    spinner.succeed(`Flushed ${result.flushed} events`)
  } else {
    spinner.warn(`Flushed ${result.flushed}, failed ${result.failed}`)
    if (result.error) {
      console.error(chalk.red(`Error: ${result.error}`))
    }
  }

  if (result.remaining > 0) {
    console.log(chalk.dim(`\n${result.remaining} events remain in buffer.`))
  }
}

/**
 * Clear buffered events
 */
async function clearCommand(options: { force?: boolean }): Promise<void> {
  const bufferSize = getBufferSize()

  if (bufferSize === 0) {
    console.log(chalk.yellow('Buffer is already empty.'))
    return
  }

  if (!options.force) {
    console.log(chalk.yellow(`\nThis will discard ${bufferSize} buffered events.`))
    console.log(chalk.dim('Use --force to confirm, or run "tag events flush" to send them first.'))
    return
  }

  clearBuffer()
  console.log(chalk.green(`✓ Cleared ${bufferSize} events from buffer`))
}

/**
 * Create events command
 */
export function createEventsCommand(): Command {
  const events = new Command('events')
    .description('Manage event collection and buffering')

  events
    .command('enable')
    .description('Enable event collection')
    .action(enableCommand)

  events
    .command('disable')
    .description('Disable event collection')
    .action(disableCommand)

  events
    .command('status')
    .description('Show event collection status')
    .action(statusCommand)

  events
    .command('flush')
    .description('Manually flush buffered events to server')
    .action(flushCommand)

  events
    .command('clear')
    .description('Clear buffered events without sending')
    .option('-f, --force', 'Force clear without confirmation')
    .action(clearCommand)

  // Default action: show status
  events.action(statusCommand)

  return events
}
