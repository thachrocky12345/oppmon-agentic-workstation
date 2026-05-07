#!/usr/bin/env node
/**
 * OppMon CLI - oppmon command
 *
 * AI Gateway management CLI for skills, MCP servers, RAG, and chat.
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
import { createDoctorCommand } from './commands/doctor.js'
import { createChatCommand } from './commands/chat.js'
import { loadTokensCache } from './lib/credentials.js'

const program = new Command()

// Package version (will be replaced during build)
const VERSION = '0.1.0'

program
  .name('oppmon')
  .description('OppMon CLI - AI Gateway management tool')
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
program.addCommand(createDoctorCommand())
program.addCommand(createChatCommand())

// Add examples to help output
program.addHelpText('after', `
${chalk.bold('Examples:')}
  $ oppmon login                       # Authenticate with OAuth device flow
  $ oppmon login --headless            # Authenticate using TAG_TOKEN env var
  $ oppmon status                      # Show current auth status
  $ oppmon logout                      # Clear stored credentials

${chalk.bold('Chat (RAG-grounded):')}
  $ oppmon chat                        # Interactive REPL
  $ oppmon chat "summarize the docs"   # One-shot
  $ oppmon chat -p ollama -m llama3.2:latest -c <colId> "your question"
  $ oppmon chat --no-stream "..."      # Non-streaming response

${chalk.bold('Project Init:')}
  $ oppmon init                        # Interactive project setup wizard
  $ oppmon init --team my-team         # Initialize with specific team
  $ oppmon init --yes                  # Accept all defaults

${chalk.bold('Skills Sync:')}
  $ oppmon sync skills list            # Show sync status of all skills
  $ oppmon sync skills push            # Push all local skills to remote
  $ oppmon sync skills pull            # Pull all remote skills to local

${chalk.bold('MCP Sync:')}
  $ oppmon sync mcp list               # Show sync status of MCP servers
  $ oppmon sync mcp push               # Push all local MCP servers to remote
  $ oppmon sync mcp pull               # Pull all remote MCP servers to local

${chalk.bold('RAG Ingestion:')}
  $ oppmon rag ingest README.md        # Ingest a single document
  $ oppmon rag ingest-dir ./docs       # Ingest all documents in a directory
  $ oppmon rag search "how to auth"    # Semantic search across embeddings
  $ oppmon rag query "explain auth"    # Full RAG query with LLM response
  $ oppmon rag list                    # List all embeddings
  $ oppmon rag stats                   # Show embedding statistics
  $ oppmon rag status                  # Show RAG pipeline status

${chalk.bold('Event Collection:')}
  $ oppmon hooks install               # Install Claude Code event hook
  $ oppmon hooks uninstall             # Remove event hook
  $ oppmon hooks status                # Check hook installation
  $ oppmon events enable               # Enable event collection
  $ oppmon events disable              # Disable event collection
  $ oppmon events status               # Show event collection status
  $ oppmon events flush                # Manually flush buffered events

${chalk.bold('Diagnostics:')}
  $ oppmon doctor                      # Run all diagnostic checks
  $ oppmon doctor auth                 # Check authentication only
  $ oppmon doctor network              # Check API connectivity only
  $ oppmon doctor sync                 # Check sync state
  $ oppmon doctor --fix                # Attempt to auto-fix issues

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

  console.error(chalk.gray(`\nRun 'oppmon --help' for available commands.\n`))
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
    console.error(chalk.yellow('\n💡 Hint: Run "oppmon login" to authenticate first.'))
    console.error(chalk.gray('   Or set TAG_TOKEN environment variable for headless auth.\n'))
  } else if (message.includes('Not authenticated')) {
    console.error(chalk.yellow('\n💡 Hint: Run "oppmon login" to authenticate.'))
  } else if (message.includes('ENOENT')) {
    console.error(chalk.yellow('\n💡 Hint: File or directory not found. Check the path and try again.\n'))
  }

  process.exit(1)
})
