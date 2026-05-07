/**
 * RAG Command
 *
 * Manage RAG (Retrieval-Augmented Generation) content ingestion and queries.
 *
 * Usage:
 *   tag rag ingest <file>        - Ingest a single document
 *   tag rag ingest-dir <dir>     - Ingest all documents in a directory
 *   tag rag search <query>       - Semantic search across embeddings
 *   tag rag query <query>        - Full RAG query with LLM response
 *   tag rag list                 - List all embeddings
 *   tag rag stats                - Show embedding statistics
 *   tag rag coverage             - Show embedding coverage
 *   tag rag reindex              - Trigger re-indexing
 *   tag rag delete <id>          - Delete an embedding
 *   tag rag status               - Show RAG pipeline status
 */

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import * as path from 'path'
import { createApiClient } from '../lib/api.js'
import {
  getDocumentInfo,
  readDocument,
  generateSourceId,
  chunkDocument,
  listDocuments,
  formatSize,
  isSupported,
} from '../lib/documents.js'
import { EXIT_CODES } from '../lib/types.js'
import { isAuthenticated } from '../lib/credentials.js'

// ============================================================================
// Helpers
// ============================================================================

function requireAuth(): void {
  if (!isAuthenticated()) {
    console.error(chalk.red('Error: Not authenticated. Run "oppmon login" first.'))
    process.exit(EXIT_CODES.AUTH_REQUIRED)
  }
}

function formatScore(score: number): string {
  const pct = (score * 100).toFixed(1)
  if (score >= 0.9) return chalk.green(`${pct}%`)
  if (score >= 0.7) return chalk.yellow(`${pct}%`)
  return chalk.dim(`${pct}%`)
}

// ============================================================================
// Ingest Commands
// ============================================================================

interface IngestOptions {
  sourceType?: string
  chunkSize?: string
  overlap?: string
  dryRun?: boolean
  provider?: string
}

async function ingestCommand(filePath: string, options: IngestOptions): Promise<void> {
  requireAuth()

  const absolutePath = path.resolve(filePath)
  const spinner = ora(`Reading ${filePath}...`).start()

  try {
    // Check file exists and is supported
    if (!isSupported(absolutePath)) {
      spinner.fail(`File type not supported for ingestion: ${filePath}`)
      process.exit(EXIT_CODES.ERROR)
    }

    const info = await getDocumentInfo(absolutePath)
    const content = await readDocument(absolutePath)
    const sourceType = options.sourceType || 'document'
    const sourceId = generateSourceId(absolutePath, process.cwd())

    spinner.text = `Chunking ${info.name}...`

    const chunkSize = options.chunkSize ? parseInt(options.chunkSize, 10) : 2000
    const overlap = options.overlap ? parseInt(options.overlap, 10) : 200
    const chunks = chunkDocument(content, info, { maxChunkSize: chunkSize, chunkOverlap: overlap })

    if (options.dryRun) {
      spinner.stop()
      console.log(chalk.bold('\nDry Run - Document Analysis:\n'))
      console.log(`  File: ${info.name}`)
      console.log(`  Size: ${formatSize(info.size)}`)
      console.log(`  Type: ${info.mimeType}`)
      console.log(`  Source ID: ${sourceId}`)
      console.log(`  Chunks: ${chunks.length}`)
      console.log(`  Chunk size: ${chunkSize} chars`)
      console.log(`  Overlap: ${overlap} chars`)
      console.log('')
      console.log(chalk.dim('Use without --dry-run to ingest'))
      return
    }

    spinner.text = `Ingesting ${chunks.length} chunk(s)...`

    const api = createApiClient()

    // Batch embed all chunks
    const items = chunks.map((chunk, idx) => ({
      content: chunk.content,
      sourceType,
      sourceId: chunks.length > 1 ? `${sourceId}#chunk-${idx}` : sourceId,
      metadata: {
        ...chunk.metadata,
        originalSourceId: sourceId,
        path: absolutePath,
      },
    }))

    const result = await api.embedBatch({
      items,
      provider: options.provider as 'openai' | 'gemini' | 'voyage' | 'cohere' | undefined,
      skipIfExists: true,
    })

    spinner.succeed(`Ingested ${info.name}`)

    console.log(chalk.dim(`\n  Chunks: ${result.meta.total}`))
    console.log(chalk.dim(`  Created: ${result.meta.created}`))
    console.log(chalk.dim(`  Skipped: ${result.meta.skipped}`))
  } catch (error) {
    spinner.fail('Ingestion failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

interface IngestDirOptions extends IngestOptions {
  recursive?: boolean
  pattern?: string
}

async function ingestDirCommand(dirPath: string, options: IngestDirOptions): Promise<void> {
  requireAuth()

  const absolutePath = path.resolve(dirPath)
  const spinner = ora(`Scanning ${dirPath}...`).start()

  try {
    const documents = await listDocuments(absolutePath, options.recursive !== false)

    if (documents.length === 0) {
      spinner.fail('No supported documents found')
      return
    }

    spinner.stop()
    console.log(chalk.bold(`\nFound ${documents.length} document(s) to ingest\n`))

    if (options.dryRun) {
      console.log(chalk.dim('Documents:'))
      for (const doc of documents.slice(0, 20)) {
        console.log(chalk.dim(`  - ${path.relative(absolutePath, doc.path)} (${formatSize(doc.size)})`))
      }
      if (documents.length > 20) {
        console.log(chalk.dim(`  ... and ${documents.length - 20} more`))
      }
      console.log('')
      console.log(chalk.dim('Use without --dry-run to ingest'))
      return
    }

    const api = createApiClient()
    const sourceType = options.sourceType || 'document'
    const chunkSize = options.chunkSize ? parseInt(options.chunkSize, 10) : 2000
    const overlap = options.overlap ? parseInt(options.overlap, 10) : 200

    let totalCreated = 0
    let totalSkipped = 0
    let totalFailed = 0

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      const relativePath = path.relative(absolutePath, doc.path)

      spinner.start(`[${i + 1}/${documents.length}] Ingesting ${relativePath}...`)

      try {
        const content = await readDocument(doc.path)
        const sourceId = generateSourceId(doc.path, absolutePath)
        const chunks = chunkDocument(content, doc, { maxChunkSize: chunkSize, chunkOverlap: overlap })

        const items = chunks.map((chunk, idx) => ({
          content: chunk.content,
          sourceType,
          sourceId: chunks.length > 1 ? `${sourceId}#chunk-${idx}` : sourceId,
          metadata: {
            ...chunk.metadata,
            originalSourceId: sourceId,
            path: doc.path,
          },
        }))

        const result = await api.embedBatch({
          items,
          provider: options.provider as 'openai' | 'gemini' | 'voyage' | 'cohere' | undefined,
          skipIfExists: true,
        })

        totalCreated += result.meta.created
        totalSkipped += result.meta.skipped
      } catch (error) {
        totalFailed++
        // Continue with next file
      }
    }

    spinner.succeed(`Ingestion complete`)

    console.log(chalk.bold('\nResults:'))
    console.log(`  Documents: ${documents.length}`)
    console.log(`  Embeddings created: ${chalk.green(totalCreated.toString())}`)
    console.log(`  Embeddings skipped: ${chalk.yellow(totalSkipped.toString())}`)
    if (totalFailed > 0) {
      console.log(`  Failed: ${chalk.red(totalFailed.toString())}`)
    }
  } catch (error) {
    spinner.fail('Ingestion failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

// ============================================================================
// Search & Query Commands
// ============================================================================

interface SearchOptions {
  sourceType?: string
  limit?: string
  threshold?: string
  content?: boolean
  json?: boolean
}

async function searchCommand(query: string, options: SearchOptions): Promise<void> {
  requireAuth()

  const spinner = ora('Searching...').start()

  try {
    const api = createApiClient()

    const response = await api.searchEmbeddings({
      query,
      sourceType: options.sourceType,
      limit: options.limit ? parseInt(options.limit, 10) : 10,
      threshold: options.threshold ? parseFloat(options.threshold) : 0,
      includeContent: options.content,
      includeMetadata: true,
    })

    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2))
      return
    }

    if (response.data.length === 0) {
      console.log(chalk.yellow('\nNo results found.'))
      return
    }

    console.log(chalk.bold(`\nSearch Results (${response.data.length}):\n`))

    for (const result of response.data) {
      console.log(`${formatScore(result.score)} ${chalk.cyan(result.sourceType)}:${chalk.white(result.sourceId)}`)
      if (result.content && options.content) {
        const preview = result.content.substring(0, 200).replace(/\n/g, ' ')
        console.log(chalk.dim(`    ${preview}${result.content.length > 200 ? '...' : ''}`))
      }
    }
  } catch (error) {
    spinner.fail('Search failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

interface QueryOptions {
  sourceType?: string
  topK?: string
  threshold?: string
  llmProvider?: string
  llmModel?: string
  temperature?: string
  maxTokens?: string
  systemPrompt?: string
  noSources?: boolean
  json?: boolean
}

async function queryCommand(query: string, options: QueryOptions): Promise<void> {
  requireAuth()

  const spinner = ora('Querying...').start()

  try {
    const api = createApiClient()

    const response = await api.ragQuery({
      query,
      sourceTypes: options.sourceType ? [options.sourceType] : undefined,
      topK: options.topK ? parseInt(options.topK, 10) : undefined,
      threshold: options.threshold ? parseFloat(options.threshold) : undefined,
      llmProvider: options.llmProvider as 'ollama' | 'cerebras' | 'anthropic' | undefined,
      llmModel: options.llmModel,
      temperature: options.temperature ? parseFloat(options.temperature) : undefined,
      maxTokens: options.maxTokens ? parseInt(options.maxTokens, 10) : undefined,
      systemPrompt: options.systemPrompt,
      includeSources: !options.noSources,
    })

    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2))
      return
    }

    console.log(chalk.bold('\nAnswer:\n'))
    console.log(response.data.answer)

    if (response.data.sources.length > 0 && !options.noSources) {
      console.log(chalk.bold('\n\nSources:'))
      for (const source of response.data.sources) {
        console.log(`  ${formatScore(source.score)} ${chalk.cyan(source.sourceType)}:${chalk.white(source.sourceId)}`)
      }
    }

    console.log(chalk.dim(`\n[${response.data.provider}/${response.data.model}] ${response.data.usage.totalTokens} tokens`))
  } catch (error) {
    spinner.fail('Query failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

// ============================================================================
// Management Commands
// ============================================================================

interface ListOptions {
  sourceType?: string
  limit?: string
  offset?: string
  json?: boolean
}

async function listCommand(options: ListOptions): Promise<void> {
  requireAuth()

  const spinner = ora('Fetching embeddings...').start()

  try {
    const api = createApiClient()

    const response = await api.listEmbeddings({
      sourceType: options.sourceType,
      limit: options.limit ? parseInt(options.limit, 10) : 50,
      offset: options.offset ? parseInt(options.offset, 10) : 0,
    })

    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response, null, 2))
      return
    }

    if (response.data.length === 0) {
      console.log(chalk.yellow('\nNo embeddings found.'))
      return
    }

    console.log(chalk.bold(`\nEmbeddings (${response.meta?.total || response.data.length} total):\n`))
    console.log(chalk.dim(`${'ID'.padEnd(28)} ${'Source Type'.padEnd(15)} ${'Source ID'.padEnd(40)} Provider`))
    console.log(chalk.dim('-'.repeat(100)))

    for (const emb of response.data) {
      const sourceId = emb.sourceId.length > 38 ? emb.sourceId.substring(0, 35) + '...' : emb.sourceId
      console.log(`${emb.id.padEnd(28)} ${emb.sourceType.padEnd(15)} ${sourceId.padEnd(40)} ${emb.provider}`)
    }

    if (response.meta && response.meta.total > response.data.length) {
      console.log(chalk.dim(`\nShowing ${response.data.length} of ${response.meta.total}. Use --offset to paginate.`))
    }
  } catch (error) {
    spinner.fail('Failed to list embeddings')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

interface StatsOptions {
  json?: boolean
}

async function statsCommand(options: StatsOptions): Promise<void> {
  requireAuth()

  const spinner = ora('Fetching statistics...').start()

  try {
    const api = createApiClient()
    const response = await api.getEmbeddingStats()

    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2))
      return
    }

    console.log(chalk.bold('\nEmbedding Statistics:\n'))
    console.log(`  Total embeddings: ${chalk.cyan(response.data.total.toString())}`)

    if (Object.keys(response.data.bySourceType).length > 0) {
      console.log(chalk.bold('\n  By Source Type:'))
      for (const [type, count] of Object.entries(response.data.bySourceType)) {
        console.log(`    ${type}: ${count}`)
      }
    }

    if (Object.keys(response.data.byProvider).length > 0) {
      console.log(chalk.bold('\n  By Provider:'))
      for (const [provider, count] of Object.entries(response.data.byProvider)) {
        console.log(`    ${provider}: ${count}`)
      }
    }

    if (Object.keys(response.data.byModel).length > 0) {
      console.log(chalk.bold('\n  By Model:'))
      for (const [model, count] of Object.entries(response.data.byModel)) {
        console.log(`    ${model}: ${count}`)
      }
    }
  } catch (error) {
    spinner.fail('Failed to fetch statistics')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

async function coverageCommand(options: StatsOptions): Promise<void> {
  requireAuth()

  const spinner = ora('Fetching coverage...').start()

  try {
    const api = createApiClient()
    const response = await api.getEmbeddingCoverage()

    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2))
      return
    }

    console.log(chalk.bold('\nEmbedding Coverage:\n'))

    for (const [type, stats] of Object.entries(response.data)) {
      const pct = (stats.coverage * 100).toFixed(1)
      const color = stats.coverage >= 0.9 ? chalk.green : stats.coverage >= 0.5 ? chalk.yellow : chalk.red
      console.log(`  ${type}: ${stats.embedded}/${stats.total} ${color(`(${pct}%)`)}`)
    }
  } catch (error) {
    spinner.fail('Failed to fetch coverage')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

interface ReindexOptions {
  types?: string
  batchSize?: string
  dryRun?: boolean
  json?: boolean
}

async function reindexCommand(options: ReindexOptions): Promise<void> {
  requireAuth()

  const spinner = ora('Triggering reindex...').start()

  try {
    const api = createApiClient()

    const types = options.types?.split(',').map((t) => t.trim()) as Array<'skill' | 'agent'> | undefined

    const response = await api.reindex({
      types,
      batchSize: options.batchSize ? parseInt(options.batchSize, 10) : undefined,
      dryRun: options.dryRun,
    })

    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2))
      return
    }

    console.log(chalk.bold(`\nReindex ${options.dryRun ? '(Dry Run)' : ''} Results:\n`))

    for (const [type, stats] of Object.entries(response.data.results)) {
      console.log(`  ${type}:`)
      console.log(`    Total: ${stats.total}`)
      console.log(`    Processed: ${chalk.green(stats.processed.toString())}`)
      if (stats.failed > 0) {
        console.log(`    Failed: ${chalk.red(stats.failed.toString())}`)
      }
    }

    console.log(chalk.bold('\n  Totals:'))
    console.log(`    Total: ${response.data.totals.total}`)
    console.log(`    Processed: ${chalk.green(response.data.totals.processed.toString())}`)
    if (response.data.totals.failed > 0) {
      console.log(`    Failed: ${chalk.red(response.data.totals.failed.toString())}`)
    }
  } catch (error) {
    spinner.fail('Reindex failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

async function deleteCommand(id: string): Promise<void> {
  requireAuth()

  const spinner = ora(`Deleting embedding ${id}...`).start()

  try {
    const api = createApiClient()
    await api.deleteEmbedding(id)

    spinner.succeed(`Deleted embedding ${id}`)
  } catch (error) {
    spinner.fail('Delete failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

async function statusCommand(options: StatsOptions): Promise<void> {
  requireAuth()

  const spinner = ora('Fetching RAG status...').start()

  try {
    const api = createApiClient()
    const response = await api.getRagStatus()

    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2))
      return
    }

    console.log(chalk.bold('\nRAG Pipeline Status:\n'))
    console.log(`  LLM Available: ${response.data.llmAvailable ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`  Embedding Available: ${response.data.embeddingAvailable ? chalk.green('Yes') : chalk.red('No')}`)
    console.log(`  Default LLM Provider: ${response.data.defaultLlmProvider}`)
    console.log(`  Default Embedding Provider: ${response.data.defaultEmbeddingProvider}`)

    console.log(chalk.bold('\n  Configuration:'))
    console.log(`    Top-K: ${response.data.config.defaultTopK}`)
    console.log(`    Threshold: ${response.data.config.defaultThreshold}`)
    console.log(`    Max Context Tokens: ${response.data.config.maxContextTokens}`)
    console.log(`    Strategy: ${response.data.config.strategy}`)
  } catch (error) {
    spinner.fail('Failed to fetch status')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

// ============================================================================
// Collections (rag-admin)
// ============================================================================

/** CUIDs start with 'c' followed by 24 alphanumerics. Anything else = name. */
function looksLikeCuid(s: string): boolean {
  return /^c[a-z0-9]{24,}$/i.test(s)
}

async function resolveCollectionId(idOrName: string): Promise<string> {
  if (looksLikeCuid(idOrName)) return idOrName
  const api = createApiClient()
  const list = await api.listRagCollections({ limit: 200 })
  const match = list.data.find((c) => c.name === idOrName)
  if (!match) {
    console.error(chalk.red(`Error: collection "${idOrName}" not found`))
    process.exit(EXIT_CODES.ERROR)
  }
  return match.id
}

interface CollectionsListOptions {
  scope?: 'TENANT' | 'TEAM'
  limit?: string
  offset?: string
  json?: boolean
}

async function collectionsListCommand(options: CollectionsListOptions): Promise<void> {
  requireAuth()
  const spinner = ora('Fetching collections...').start()
  try {
    const api = createApiClient()
    const resp = await api.listRagCollections({
      scope: options.scope,
      limit: options.limit ? parseInt(options.limit, 10) : 50,
      offset: options.offset ? parseInt(options.offset, 10) : 0,
    })
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(resp, null, 2))
      return
    }

    if (resp.data.length === 0) {
      console.log(chalk.dim('No collections found.'))
      return
    }

    console.log(
      chalk.bold(
        `\n  ${'NAME'.padEnd(28)} ${'SCOPE'.padEnd(7)} ${'DOCS'.padStart(5)} ${'CHUNKS'.padStart(7)}  ID`
      )
    )
    console.log(chalk.dim(`  ${'-'.repeat(28)} ${'-'.repeat(7)} ${'-'.repeat(5)} ${'-'.repeat(7)}  ${'-'.repeat(28)}`))
    for (const c of resp.data) {
      const docs = String(c.document_count ?? 0).padStart(5)
      const chunks = String(c.total_chunks ?? 0).padStart(7)
      const scope = c.scope === 'TENANT' ? chalk.magenta('TENANT ') : chalk.cyan('TEAM   ')
      const name = (c.name || '').padEnd(28)
      console.log(`  ${name} ${scope} ${docs} ${chunks}  ${chalk.dim(c.id)}`)
    }
    console.log(
      chalk.dim(
        `\n  ${resp.data.length} of ${resp.meta.total} collection(s)` +
          (resp.meta.offset ? `  (offset ${resp.meta.offset})` : '')
      )
    )
  } catch (error) {
    spinner.fail('Failed to fetch collections')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

async function collectionsShowCommand(
  idOrName: string,
  options: { json?: boolean }
): Promise<void> {
  requireAuth()
  const spinner = ora('Fetching collection...').start()
  try {
    const id = await resolveCollectionId(idOrName)
    const api = createApiClient()
    const resp = await api.getRagCollection(id)
    spinner.stop()

    if (options.json) {
      console.log(JSON.stringify(resp.data, null, 2))
      return
    }

    const c = resp.data as RagCollectionDetail
    console.log(chalk.bold(`\n${c.name}`))
    if (c.description) console.log(chalk.dim(c.description))
    console.log()
    console.log(`  ID:           ${chalk.dim(c.id)}`)
    console.log(
      `  Scope:        ${c.scope === 'TENANT' ? chalk.magenta('TENANT') : chalk.cyan('TEAM')}`
    )
    if (c.team_id || c.teamId) console.log(`  Team:         ${c.team_id ?? c.teamId}`)
    if (c.created_at || c.createdAt)
      console.log(`  Created:      ${c.created_at ?? c.createdAt}`)
    if (c.updated_at || c.updatedAt)
      console.log(`  Updated:      ${c.updated_at ?? c.updatedAt}`)

    const docs = c.documents ?? []
    console.log(chalk.bold(`\n  Documents (${docs.length}):`))
    if (docs.length === 0) {
      console.log(chalk.dim('    (none)'))
    } else {
      for (const d of docs) {
        const status = formatExtractionStatus(d.extractionStatus ?? d.extraction_status)
        const filename = d.originalFilename ?? d.original_filename ?? '?'
        const chunks = d.chunkCount ?? d.chunk_count ?? 0
        console.log(
          `    ${status}  ${filename.padEnd(40)} ${String(chunks).padStart(4)} chunks  ${chalk.dim(d.id)}`
        )
      }
    }
  } catch (error) {
    spinner.fail('Failed to fetch collection')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

interface CollectionsCreateOptions {
  name?: string
  description?: string
  scope?: string
  team?: string
}

async function collectionsCreateCommand(options: CollectionsCreateOptions): Promise<void> {
  requireAuth()

  const name = options.name?.trim()
  if (!name) {
    console.error(chalk.red('Error: --name is required'))
    process.exit(EXIT_CODES.ERROR)
  }
  const scope = (options.scope || 'TEAM').toUpperCase() as 'TENANT' | 'TEAM'
  if (scope !== 'TENANT' && scope !== 'TEAM') {
    console.error(chalk.red('Error: --scope must be TENANT or TEAM'))
    process.exit(EXIT_CODES.ERROR)
  }
  if (scope === 'TEAM' && !options.team) {
    console.error(chalk.red('Error: --team <id> is required for TEAM scope'))
    process.exit(EXIT_CODES.ERROR)
  }

  const spinner = ora(`Creating collection "${name}"...`).start()
  try {
    const api = createApiClient()
    const resp = await api.createRagCollection({
      name,
      description: options.description,
      scope,
      teamId: scope === 'TEAM' ? options.team : undefined,
    })
    spinner.succeed(`Created collection "${name}" (${chalk.dim(resp.data.id)})`)
  } catch (error) {
    spinner.fail('Create failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

async function collectionsDeleteCommand(
  idOrName: string,
  options: { yes?: boolean }
): Promise<void> {
  requireAuth()

  const id = await resolveCollectionId(idOrName)

  if (!options.yes) {
    console.error(
      chalk.yellow(
        `Refusing to delete without --yes. This will soft-delete the collection and all its documents.`
      )
    )
    process.exit(EXIT_CODES.ERROR)
  }

  const spinner = ora(`Deleting collection ${id}...`).start()
  try {
    const api = createApiClient()
    await api.deleteRagCollection(id)
    spinner.succeed(`Deleted collection ${chalk.dim(id)}`)
  } catch (error) {
    spinner.fail('Delete failed')
    console.error(chalk.red(`Error: ${(error as Error).message}`))
    process.exit(EXIT_CODES.ERROR)
  }
}

function formatExtractionStatus(status?: string): string {
  switch (status) {
    case 'EXTRACTED':
      return chalk.green('●')
    case 'EXTRACTING':
    case 'PENDING':
      return chalk.yellow('●')
    case 'FAILED':
      return chalk.red('●')
    default:
      return chalk.dim('○')
  }
}

// Permissive shape — backend mixes camel and snake case for collection details.
type RagCollectionDetail = {
  id: string
  name: string
  description?: string | null
  scope: 'TENANT' | 'TEAM'
  team_id?: string | null
  teamId?: string | null
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
  documents?: Array<{
    id: string
    originalFilename?: string
    original_filename?: string
    chunkCount?: number
    chunk_count?: number
    extractionStatus?: string
    extraction_status?: string
  }>
}

// ============================================================================
// Command Setup
// ============================================================================

export function createRagCommand(): Command {
  const rag = new Command('rag').description('RAG content ingestion and queries')

  // Ingest single file
  rag
    .command('ingest <file>')
    .description('Ingest a single document for RAG')
    .option('-t, --source-type <type>', 'Source type (default: document)')
    .option('-c, --chunk-size <size>', 'Max chunk size in characters (default: 2000)')
    .option('-o, --overlap <size>', 'Chunk overlap in characters (default: 200)')
    .option('-p, --provider <provider>', 'Embedding provider (openai, gemini, voyage, cohere)')
    .option('--dry-run', 'Show what would be ingested without actually ingesting')
    .action(ingestCommand)

  // Ingest directory
  rag
    .command('ingest-dir <directory>')
    .description('Ingest all supported documents in a directory')
    .option('-t, --source-type <type>', 'Source type (default: document)')
    .option('-c, --chunk-size <size>', 'Max chunk size in characters (default: 2000)')
    .option('-o, --overlap <size>', 'Chunk overlap in characters (default: 200)')
    .option('-p, --provider <provider>', 'Embedding provider (openai, gemini, voyage, cohere)')
    .option('-r, --recursive', 'Recursively scan subdirectories (default: true)')
    .option('--dry-run', 'Show what would be ingested without actually ingesting')
    .action(ingestDirCommand)

  // Search
  rag
    .command('search <query>')
    .description('Semantic search across embeddings')
    .option('-t, --source-type <type>', 'Filter by source type')
    .option('-l, --limit <n>', 'Max results (default: 10)')
    .option('--threshold <n>', 'Minimum similarity score 0-1 (default: 0)')
    .option('-c, --content', 'Include content in results')
    .option('--json', 'Output as JSON')
    .action(searchCommand)

  // Query (full RAG)
  rag
    .command('query <query>')
    .description('Full RAG query with LLM response')
    .option('-t, --source-type <type>', 'Filter by source type')
    .option('-k, --top-k <n>', 'Number of documents to retrieve (default: 5)')
    .option('--threshold <n>', 'Minimum similarity score 0-1')
    .option('--llm-provider <provider>', 'LLM provider (ollama, cerebras, anthropic)')
    .option('--llm-model <model>', 'LLM model name')
    .option('--temperature <n>', 'LLM temperature 0-2')
    .option('--max-tokens <n>', 'Max response tokens')
    .option('-s, --system-prompt <prompt>', 'Custom system prompt')
    .option('--no-sources', 'Omit source citations')
    .option('--json', 'Output as JSON')
    .action(queryCommand)

  // List
  rag
    .command('list')
    .alias('ls')
    .description('List all embeddings')
    .option('-t, --source-type <type>', 'Filter by source type')
    .option('-l, --limit <n>', 'Max results (default: 50)')
    .option('--offset <n>', 'Offset for pagination')
    .option('--json', 'Output as JSON')
    .action(listCommand)

  // Stats
  rag
    .command('stats')
    .description('Show embedding statistics')
    .option('--json', 'Output as JSON')
    .action(statsCommand)

  // Coverage
  rag
    .command('coverage')
    .description('Show embedding coverage for skills and agents')
    .option('--json', 'Output as JSON')
    .action(coverageCommand)

  // Reindex
  rag
    .command('reindex')
    .description('Trigger re-indexing of all embeddable content')
    .option('--types <types>', 'Comma-separated types to reindex (skill, agent)')
    .option('--batch-size <n>', 'Batch size for processing')
    .option('--dry-run', 'Show what would be reindexed without actually reindexing')
    .option('--json', 'Output as JSON')
    .action(reindexCommand)

  // Delete
  rag
    .command('delete <id>')
    .description('Delete an embedding by ID')
    .action(deleteCommand)

  // Status
  rag
    .command('status')
    .description('Show RAG pipeline status and configuration')
    .option('--json', 'Output as JSON')
    .action(statusCommand)

  // Collections (admin)
  const collections = new Command('collections')
    .alias('coll')
    .description('Manage RAG document collections (admin)')

  collections
    .command('list')
    .alias('ls')
    .description('List collections you can see')
    .option('-s, --scope <scope>', 'Filter by TENANT or TEAM')
    .option('-l, --limit <n>', 'Max rows (default 50)')
    .option('--offset <n>', 'Offset for pagination')
    .option('--json', 'Output as JSON')
    .action(collectionsListCommand)

  collections
    .command('show <idOrName>')
    .alias('get')
    .description('Show one collection with its documents')
    .option('--json', 'Output as JSON')
    .action(collectionsShowCommand)

  collections
    .command('create')
    .alias('new')
    .description('Create a new collection (admin only)')
    .option('-n, --name <name>', 'Collection name (required)')
    .option('-d, --description <text>', 'Description')
    .option('-s, --scope <scope>', 'TENANT or TEAM (default TEAM)')
    .option('--team <teamId>', 'teamId (required when scope is TEAM)')
    .action(collectionsCreateCommand)

  collections
    .command('delete <idOrName>')
    .alias('rm')
    .description('Soft-delete a collection (admin only)')
    .option('-y, --yes', 'Skip confirmation')
    .action(collectionsDeleteCommand)

  collections.action(() => collections.outputHelp())
  rag.addCommand(collections)

  // Default action
  rag.action(() => {
    rag.outputHelp()
  })

  return rag
}
