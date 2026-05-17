// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Chat Command — interactive RAG chat from the terminal.
 *
 * Streams from POST /api/rag/chat/stream (SSE NDJSON) so tokens render as
 * they arrive. Use:
 *   oppmon chat                      # interactive REPL
 *   oppmon chat "summarize the docs" # one-shot
 *   oppmon chat --provider ollama --model llama3.2:latest -c <colId> ...
 *
 * Exits the REPL on /exit, /quit, EOF, or Ctrl-C.
 */

import { Command } from 'commander'
import chalk from 'chalk'
import { createInterface } from 'readline'
import { getApiUrl } from '../lib/config.js'
import { getAccessToken } from '../lib/credentials.js'
import { EXIT_CODES } from '../lib/types.js'

interface ChatOptions {
  provider?: string
  model?: string
  collection?: string[]
  webFallback?: boolean
  enableTools?: boolean
  noStream?: boolean
  systemPrompt?: string
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface StreamChunk {
  type: 'content' | 'citation' | 'error' | 'done'
  data: Record<string, unknown>
}

export function createChatCommand(): Command {
  const cmd = new Command('chat')
    .description('Chat with the RAG-grounded LLM (interactive or one-shot)')
    .argument('[message...]', 'Optional one-shot message; omit for interactive REPL')
    .option('-p, --provider <provider>', 'LLM provider (anthropic | openai | ollama | cerebras)')
    .option('-m, --model <model>', 'Model identifier (e.g. llama3.2:latest, claude-sonnet-4-...)')
    .option('-c, --collection <id...>', 'RAG collection ID to ground on (repeatable)')
    .option('--no-stream', 'Disable streaming; print the full response when ready')
    .option('--web-fallback', 'Allow web fallback when RAG yields no context')
    .option('--enable-tools', 'Enable tool calling')
    .option('--system <prompt>', 'System prompt')
    .action(async (messageArgs: string[], options: ChatOptions) => {
      const token = getAccessToken()
      if (!token) {
        console.error(chalk.red('Not authenticated. Run "oppmon login" first.'))
        process.exit(EXIT_CODES.AUTH_REQUIRED)
      }

      const apiUrl = getApiUrl()
      const conversation: ChatMessage[] = []

      // One-shot path: positional message provided
      if (messageArgs && messageArgs.length > 0) {
        const text = messageArgs.join(' ')
        conversation.push({ role: 'user', content: text })
        await sendOnce(apiUrl, token, conversation, options)
        process.exit(EXIT_CODES.SUCCESS)
      }

      // Interactive REPL
      console.log(chalk.bold('\n  oppmon chat — interactive\n'))
      console.log(chalk.dim('  Type a message and press Enter. /exit to quit, /reset to clear context.\n'))
      if (options.provider || options.model) {
        console.log(chalk.dim(`  provider=${options.provider ?? 'default'} model=${options.model ?? 'default'}`))
      }
      if (options.collection?.length) {
        console.log(chalk.dim(`  collections=${options.collection.join(',')}`))
      }
      console.log()

      const rl = createInterface({ input: process.stdin, output: process.stdout })
      const prompt = chalk.cyan('you ▸ ')

      const ask = () => rl.question(prompt, async (line) => {
        const input = line.trim()
        if (!input) return ask()
        if (input === '/exit' || input === '/quit') { rl.close(); return }
        if (input === '/reset') {
          conversation.length = 0
          console.log(chalk.dim('  (context cleared)\n'))
          return ask()
        }
        conversation.push({ role: 'user', content: input })
        process.stdout.write(chalk.green('bot ▸ '))
        const reply = await sendOnce(apiUrl, token, conversation, options)
        if (reply) {
          conversation.push({ role: 'assistant', content: reply })
        }
        ask()
      })

      rl.on('close', () => {
        console.log(chalk.dim('\n  goodbye'))
        process.exit(EXIT_CODES.SUCCESS)
      })

      ask()
    })

  return cmd
}

/**
 * Send the conversation, render the assistant reply, return the full text.
 * Honors --no-stream by hitting the non-stream endpoint.
 */
async function sendOnce(
  apiUrl: string,
  token: string,
  conversation: ChatMessage[],
  options: ChatOptions
): Promise<string | null> {
  const body = {
    messages: conversation,
    collectionIds: options.collection?.length ? options.collection : undefined,
    model: options.model,
    provider: options.provider,
    webFallback: !!options.webFallback,
    enableTools: !!options.enableTools,
    systemPrompt: options.systemPrompt,
  }

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  if (options.noStream) {
    try {
      const res = await fetch(`${apiUrl}/api/rag/chat`, {
        method: 'POST', headers, body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.text()
        console.error(chalk.red(`\n  ${res.status}: ${err}\n`))
        return null
      }
      const json = (await res.json()) as { data?: { message?: { content?: string } } }
      const content = json.data?.message?.content ?? ''
      console.log(content + '\n')
      return content
    } catch (e) {
      console.error(chalk.red(`\n  ${(e as Error).message}\n`))
      return null
    }
  }

  // Streaming path
  let fullText = ''
  let streamErrorMessage: string | null = null
  const citations: Array<Record<string, unknown>> = []

  try {
    const res = await fetch(`${apiUrl}/api/rag/chat/stream`, {
      method: 'POST', headers, body: JSON.stringify(body),
    })
    if (!res.ok || !res.body) {
      const err = await res.text().catch(() => `HTTP ${res.status}`)
      console.error(chalk.red(`\n  stream failed: ${err}\n`))
      return null
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6).trim()
        if (payload === '[DONE]') continue
        try {
          const chunk = JSON.parse(payload) as StreamChunk
          if (chunk.type === 'content') {
            const c = (chunk.data as { content?: string }).content ?? ''
            process.stdout.write(c)
            fullText += c
          } else if (chunk.type === 'citation') {
            citations.push(chunk.data)
          } else if (chunk.type === 'error') {
            streamErrorMessage = (chunk.data as { message?: string }).message ?? 'stream error'
          }
        } catch {
          // malformed chunk; skip
        }
      }
    }
  } catch (e) {
    console.error(chalk.red(`\n  ${(e as Error).message}\n`))
    return null
  }

  if (streamErrorMessage) {
    console.error(chalk.red(`\n  ${streamErrorMessage}\n`))
    return null
  }

  console.log() // newline after token stream
  if (citations.length) {
    console.log(chalk.dim(`  citations: ${citations.length}`))
  }
  console.log()
  return fullText
}
