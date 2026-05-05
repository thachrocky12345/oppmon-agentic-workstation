/**
 * Logout Command
 *
 * Clears all stored credentials.
 */

import chalk from 'chalk'
import ora from 'ora'
import { Command } from 'commander'
import { logout, isAuthenticated } from '../lib/auth.js'
import { EXIT_CODES } from '../lib/types.js'

export function createLogoutCommand(): Command {
  const command = new Command('logout')
    .description('Log out and clear stored credentials')
    .action(async () => {
      try {
        const authenticated = await isAuthenticated()

        if (!authenticated) {
          console.log(chalk.yellow('Not currently logged in.'))
          process.exit(EXIT_CODES.SUCCESS)
        }

        const spinner = ora('Logging out...').start()

        try {
          await logout()
          spinner.succeed('Logged out successfully')

          console.log()
          console.log(chalk.dim('All stored credentials have been cleared.'))

          process.exit(EXIT_CODES.SUCCESS)
        } catch (error) {
          spinner.fail('Failed to log out')
          console.error(chalk.red((error as Error).message))
          process.exit(EXIT_CODES.ERROR)
        }
      } catch (error) {
        console.error(chalk.red('Logout failed:'), (error as Error).message)
        process.exit(EXIT_CODES.ERROR)
      }
    })

  return command
}
