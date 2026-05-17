// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Status Command
 *
 * Shows current authentication state and user context.
 */

import chalk from 'chalk'
import { Command } from 'commander'
import { isAuthenticated, getCurrentUser } from '../lib/auth.js'
import { getTokens } from '../lib/credentials.js'
import { getApiUrl } from '../lib/config.js'
import { EXIT_CODES } from '../lib/types.js'

interface StatusOutput {
  authenticated: boolean
  user?: {
    email: string
    name: string
    role: string
  }
  tenant?: {
    id: string
    name: string
  }
  teams?: Array<{ id: string; name: string; role: string }>
  tokenExpiresIn?: string
  tokenExpiresAt?: string
  apiEndpoint: string
}

export function createStatusCommand(): Command {
  const command = new Command('status')
    .description('Show current authentication state and user context')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const apiEndpoint = getApiUrl()
        const authenticated = await isAuthenticated()

        if (!authenticated) {
          if (options.json) {
            console.log(JSON.stringify({
              authenticated: false,
              apiEndpoint,
            }, null, 2))
          } else {
            console.log()
            console.log(chalk.bold('Status'))
            console.log()
            console.log(`  Authenticated: ${chalk.red('No')}`)
            console.log(`  API Endpoint:  ${chalk.dim(apiEndpoint)}`)
            console.log()
            console.log(chalk.yellow('Run `tag login` to authenticate.'))
          }
          process.exit(EXIT_CODES.AUTH_REQUIRED)
        }

        // Get user info and token expiration
        const user = await getCurrentUser()
        const tokens = await getTokens()

        if (!user) {
          if (options.json) {
            console.log(JSON.stringify({
              authenticated: false,
              apiEndpoint,
            }, null, 2))
          } else {
            console.log(chalk.yellow('Session expired. Run `tag login` to re-authenticate.'))
          }
          process.exit(EXIT_CODES.AUTH_REQUIRED)
        }

        // Calculate token expiration
        let expiresIn: string | undefined
        let expiresAt: string | undefined
        if (tokens?.expiresAt) {
          const now = Math.floor(Date.now() / 1000)
          const diff = tokens.expiresAt - now

          if (diff > 0) {
            expiresIn = formatDuration(diff)
            expiresAt = new Date(tokens.expiresAt * 1000).toISOString()
          } else {
            expiresIn = 'expired'
          }
        }

        if (options.json) {
          const output: StatusOutput = {
            authenticated: true,
            user: {
              email: user.email,
              name: user.name,
              role: user.role,
            },
            tenant: {
              id: user.tenantId,
              name: user.tenantName,
            },
            teams: user.teams,
            tokenExpiresIn: expiresIn,
            tokenExpiresAt: expiresAt,
            apiEndpoint,
          }
          console.log(JSON.stringify(output, null, 2))
        } else {
          console.log()
          console.log(chalk.bold('Status'))
          console.log()
          console.log(`  Authenticated: ${chalk.green('Yes')}`)
          console.log(`  User:          ${chalk.cyan(user.email)} (${user.name})`)
          console.log(`  Role:          ${chalk.yellow(user.role)}`)
          console.log(`  Tenant:        ${chalk.magenta(user.tenantName)}`)

          if (user.teams && user.teams.length > 0) {
            console.log(`  Teams:         ${user.teams.map(t => chalk.blue(t.name)).join(', ')}`)
          }

          if (expiresIn) {
            const expiresColor = expiresIn === 'expired' ? chalk.red : chalk.green
            console.log(`  Token Expires: ${expiresColor(expiresIn)}`)
          }

          console.log(`  API Endpoint:  ${chalk.dim(apiEndpoint)}`)
          console.log()
        }

        process.exit(EXIT_CODES.SUCCESS)
      } catch (error) {
        if (options.json) {
          console.log(JSON.stringify({
            error: (error as Error).message,
          }, null, 2))
        } else {
          console.error(chalk.red('Status check failed:'), (error as Error).message)
        }
        process.exit(EXIT_CODES.ERROR)
      }
    })

  return command
}

/**
 * Format duration in human-readable form
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `in ${seconds} seconds`
  }

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`
  }

  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600)
    return `in ${hours} hour${hours !== 1 ? 's' : ''}`
  }

  const days = Math.floor(seconds / 86400)
  return `in ${days} day${days !== 1 ? 's' : ''}`
}
