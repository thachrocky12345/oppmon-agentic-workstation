/**
 * Login Command
 *
 * Authenticates user via OAuth device code flow or headless mode.
 */

import chalk from 'chalk'
import ora from 'ora'
import open from 'open'
import { Command } from 'commander'
import {
  initiateDeviceCodeFlow,
  pollForToken,
  completeLogin,
  loginHeadless,
  isAuthenticated,
} from '../lib/auth.js'
import { EXIT_CODES } from '../lib/types.js'

export function createLoginCommand(): Command {
  const command = new Command('login')
    .description('Authenticate with the Arkon Gateway')
    .option('--headless', 'Use headless mode for CI environments (expects TAG_TOKEN or TOKEN env var)')
    .option('--no-open', 'Do not automatically open browser')
    .action(async (options) => {
      try {
        // Check if already authenticated
        if (await isAuthenticated()) {
          console.log(chalk.yellow('Already authenticated. Use `tag logout` first to re-authenticate.'))
          process.exit(EXIT_CODES.SUCCESS)
        }

        // Headless mode for CI
        if (options.headless) {
          const spinner = ora('Authenticating with token...').start()
          try {
            await loginHeadless()
            spinner.succeed('Authenticated successfully (headless mode)')
            process.exit(EXIT_CODES.SUCCESS)
          } catch (error) {
            spinner.fail((error as Error).message)
            process.exit(EXIT_CODES.ERROR)
          }
        }

        // Device code flow
        const spinner = ora('Initiating authentication...').start()

        let deviceCode: Awaited<ReturnType<typeof initiateDeviceCodeFlow>>
        try {
          deviceCode = await initiateDeviceCodeFlow()
          spinner.stop()
        } catch (error) {
          spinner.fail('Failed to initiate authentication')
          console.error(chalk.red((error as Error).message))
          process.exit(EXIT_CODES.ERROR)
        }

        // Display instructions
        console.log()
        console.log(chalk.bold('To authenticate, visit:'))
        console.log()
        console.log(`  ${chalk.cyan(deviceCode.verificationUri)}`)
        console.log()
        console.log(chalk.bold('And enter the code:'))
        console.log()
        console.log(`  ${chalk.yellow.bold(deviceCode.userCode)}`)
        console.log()

        // Try to open browser
        if (options.open !== false) {
          try {
            await open(deviceCode.verificationUri)
            console.log(chalk.dim('(Browser opened automatically)'))
          } catch {
            // Ignore if browser can't be opened
          }
        }

        console.log()

        // Poll for completion
        const pollSpinner = ora('Waiting for authorization...').start()
        let pollCount = 0

        try {
          const tokenResponse = await pollForToken(
            deviceCode.deviceCode,
            deviceCode.interval,
            () => {
              pollCount++
              if (pollCount % 3 === 0) {
                pollSpinner.text = `Waiting for authorization... (${Math.floor((Date.now() - pollCount * deviceCode.interval * 1000) / 1000)}s)`
              }
            }
          )

          await completeLogin(tokenResponse)
          pollSpinner.succeed('Authenticated successfully!')

          console.log()
          console.log(chalk.green('You are now logged in.'))
          console.log(chalk.dim('Run `tag status` to see your account details.'))

          process.exit(EXIT_CODES.SUCCESS)
        } catch (error) {
          pollSpinner.fail((error as Error).message)
          process.exit(EXIT_CODES.ERROR)
        }
      } catch (error) {
        console.error(chalk.red('Login failed:'), (error as Error).message)
        process.exit(EXIT_CODES.ERROR)
      }
    })

  return command
}
