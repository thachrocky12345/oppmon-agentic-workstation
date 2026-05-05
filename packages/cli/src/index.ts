#!/usr/bin/env node
/**
 * Arkon CLI - tag command
 *
 * AI Gateway management CLI for skills, MCP servers, and RAG.
 */

import { Command, CommanderError } from 'commander'
import chalk from 'chalk'
import { createLoginCommand } from './commands/login.js'
import { createLogoutCommand } from './commands/logout.js'
import { createStatusCommand } from './commands/status.js'
import { createSyncCommand } from './commands/sync.js'
import { createRagCommand } from './commands/rag.js'
import { createInitCommand } from './commands/init.js'
import { createHooksCommand } from './commands/hooks.js'
import { createEventsCommand } from './commands/events.js'
import { loadTokensCache } from './lib/credentials.js'

const program = new Command()

// Package version (will be replaced during build)
const VERSION = '0.1.0'

program
  .name('tag')
  .description('Arkon CLI - AI Gateway management tool')
  .version(VERSION, '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display help for command')
  .configureOutput({
    outputError: (str, write) => {
      // Custom error output for better DX
      write(chalk.red(str))
    }
  })

// Add commands
program.addCommand(createLoginCommand())
program.addCommand(createLogoutCommand())
program.addCommand(createStatusCommand())
program.addCommand(createSyncCommand())
program.addCommand(createRagCommand())
program.addCommand(createInitCommand())
program.addCommand(createHooksCommand())
program.addCommand(createEventsCommand())

// Add examples to help output
program.addHelpText('after', `
${chalk.bold('Examples:')}
  $ tag login                    # Authenticate with OAuth device flow
  $ tag login --headless         # Authenticate using TAG_TOKEN env var
  $ tag status                   # Show current auth status
  $ tag logout                   # Clear stored credentials

${chalk.bold('Project Init:')}
  $ tag init                     # Interactive project setup wizard
  $ tag init --team my-team      # Initialize with specific team
  $ tag init --yes               # Accept all defaults (non-interactive)

${chalk.bold('Skills Sync:')}
  $ tag sync skills list         # Show sync status of all skills
  $ tag sync skills push         # Push all local skills to remote
  $ tag sync skills push myskill # Push specific skill
  $ tag sync skills pull         # Pull all remote skills to local

${chalk.bold('MCP Sync:')}
  $ tag sync mcp list            # Show sync status of MCP servers
  $ tag sync mcp push            # Push all local MCP servers to remote
  $ tag sync mcp push myserver   # Push specific MCP server
  $ tag sync mcp pull            # Pull all remote MCP servers to local

${chalk.bold('RAG Ingestion:')}
  $ tag rag ingest README.md     # Ingest a single document
  $ tag rag ingest-dir ./docs    # Ingest all documents in a directory
  $ tag rag search "how to auth" # Semantic search across embeddings
  $ tag rag query "explain auth" # Full RAG query with LLM response
  $ tag rag list                 # List all embeddings
  $ tag rag stats                # Show embedding statistics
  $ tag rag status               # Show RAG pipeline status

${chalk.bold('Event Collection:')}
  $ tag hooks install            # Install Claude Code event hook
  $ tag hooks uninstall          # Remove event hook
  $ tag hooks status             # Check hook installation
  $ tag events enable            # Enable event collection
  $ tag events disable           # Disable event collection
  $ tag events status            # Show event collection status
  $ tag events flush             # Manually flush buffered events

${chalk.bold('Environment Variables:')}
  TAG_API_URL    API endpoint (default: http://localhost:3001)
  TAG_TOKEN      Access token for headless authentication

${chalk.bold('Exit Codes:')}
  0  Success
  1  Error
  2  Authentication required
`)

// Handle unknown commands gracefully
program.on('command:*', (operands) => {
  const unknownCommand = operands[0]
  const availableCommands = program.commands.map(c => c.name())

  console.error(chalk.red(`\nerror: unknown command '${unknownCommand}'`))

  // Suggest similar commands
  const similar = availableCommands.filter(cmd =>
    cmd.includes(unknownCommand) || unknownCommand.includes(cmd)
  )

  if (similar.length > 0) {
    console.error(chalk.yellow(`\nDid you mean: ${similar.join(', ')}?`))
  }

  console.error(chalk.gray(`\nRun 'tag --help' for available commands.\n`))
  process.exit(1)
})

async function main() {
  // Load token cache for synchronous access
  await loadTokensCache()

  // Parse arguments
  try {
    await program.parseAsync(process.argv)
  } catch (error) {
    if (error instanceof CommanderError) {
      // Commander already printed the error
      process.exit(error.exitCode)
    }
    throw error
  }

  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp()
  }
}

main().catch((error) => {
  // Format error messages nicely
  const message = error instanceof Error ? error.message : String(error)

  console.error(chalk.red(`\n✖ Error: ${message}`))

  // Provide actionable hints for common errors
  if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    console.error(chalk.yellow('\n💡 Hint: Make sure the API server is running (pnpm dev:api)'))
    console.error(chalk.gray('   You can also set TAG_API_URL to point to a different server.\n'))
  } else if (message.includes('Unauthorized') || message.includes('401')) {
    console.error(chalk.yellow('\n💡 Hint: Run "tag login" to authenticate first.'))
    console.error(chalk.gray('   Or set TAG_TOKEN environment variable for headless auth.\n'))
  } else if (message.includes('Not authenticated')) {
    console.error(chalk.yellow('\n💡 Hint: Run "tag login" to authenticate.'))
  } else if (message.includes('ENOENT')) {
    console.error(chalk.yellow('\n💡 Hint: File or directory not found. Check the path and try again.\n'))
  }

  process.exit(1)
})
