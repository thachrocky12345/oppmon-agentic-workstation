# TAG-10-RUST: RAG Ingestion CLI with Rust Embeddings

## Description

**Suggested Points:** 5 (Medium — RAG ingestion CLI using Rust vector operations for embedding processing and deduplication)

**Track:** Rust Early

## Objective

Implement RAG document ingestion CLI commands that leverage the existing Rust vectors crate for embedding operations, content hashing, and deduplication.

## Requirements

### CLI Commands

```typescript
// packages/cli/src/commands/ingest.ts
import { Command } from 'commander'

export function registerIngestCommand(program: Command): void {
  const ingest = program
    .command('ingest')
    .description('Ingest documents into team knowledge base')

  ingest
    .command('file <path>')
    .description('Ingest a single file')
    .option('--chunk-size <tokens>', 'Chunk size in tokens', '800')
    .option('--overlap <tokens>', 'Overlap between chunks', '100')
    .action(ingestFile)

  ingest
    .command('dir <path>')
    .description('Ingest all files in directory')
    .option('--pattern <glob>', 'File pattern', '**/*.{md,txt,pdf}')
    .option('--recursive', 'Process subdirectories', true)
    .action(ingestDirectory)

  ingest
    .command('url <url>')
    .description('Ingest content from URL')
    .action(ingestUrl)

  ingest
    .command('status')
    .description('Show ingestion status and statistics')
    .action(showStatus)
}
```

### Ingestion Pipeline with Rust

```typescript
// packages/cli/src/ingest/pipeline.ts
import { sha256Hex, batchCosine } from '../engine'
import { chunk } from './chunker'

interface IngestOptions {
  chunkSize: number
  overlap: number
  deduplicate: boolean
}

export async function ingestDocument(
  content: string,
  metadata: DocumentMetadata,
  options: IngestOptions,
): Promise<IngestResult> {
  // 1. Compute content hash with Rust
  const contentHash = sha256Hex(Buffer.from(content))

  // 2. Check for duplicate (same hash = same content)
  const existing = await api.checkDocumentHash(contentHash)
  if (existing && !options.force) {
    return { status: 'skipped', reason: 'duplicate', hash: contentHash }
  }

  // 3. Chunk the document
  const chunks = chunk(content, {
    maxTokens: options.chunkSize,
    overlap: options.overlap,
  })

  // 4. Generate embeddings (API call, but processing in Rust)
  const embeddings = await api.generateEmbeddings(chunks.map(c => c.text))

  // 5. Deduplicate chunks using Rust similarity
  let finalChunks = chunks.map((c, i) => ({
    ...c,
    embedding: embeddings[i],
  }))

  if (options.deduplicate) {
    finalChunks = deduplicateChunks(finalChunks, 0.95)
  }

  // 6. Store in knowledge base
  const result = await api.storeChunks({
    documentHash: contentHash,
    metadata,
    chunks: finalChunks,
  })

  return {
    status: 'success',
    hash: contentHash,
    chunksCreated: finalChunks.length,
    chunksSkipped: chunks.length - finalChunks.length,
  }
}

function deduplicateChunks(
  chunks: ChunkWithEmbedding[],
  threshold: number,
): ChunkWithEmbedding[] {
  const kept: ChunkWithEmbedding[] = []

  for (const chunk of chunks) {
    if (kept.length === 0) {
      kept.push(chunk)
      continue
    }

    // Use Rust batch cosine for efficiency
    const similarities = batchCosine(
      chunk.embedding,
      kept.map(k => k.embedding),
    )

    const maxSim = Math.max(...similarities)
    if (maxSim < threshold) {
      kept.push(chunk)
    }
  }

  return kept
}
```

### Chunking Strategy

```typescript
// packages/cli/src/ingest/chunker.ts
import { encode } from 'gpt-tokenizer'

interface ChunkOptions {
  maxTokens: number
  overlap: number
}

interface Chunk {
  text: string
  startOffset: number
  endOffset: number
  tokenCount: number
}

export function chunk(text: string, options: ChunkOptions): Chunk[] {
  const { maxTokens, overlap } = options
  const chunks: Chunk[] = []

  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/)
  let currentChunk = ''
  let currentTokens = 0
  let startOffset = 0
  let textOffset = 0

  for (const para of paragraphs) {
    const paraTokens = encode(para).length

    if (currentTokens + paraTokens > maxTokens && currentChunk) {
      // Save current chunk
      chunks.push({
        text: currentChunk.trim(),
        startOffset,
        endOffset: textOffset,
        tokenCount: currentTokens,
      })

      // Start new chunk with overlap
      const overlapText = getOverlapText(currentChunk, overlap)
      currentChunk = overlapText + para + '\n\n'
      currentTokens = encode(currentChunk).length
      startOffset = textOffset - overlapText.length
    } else {
      currentChunk += para + '\n\n'
      currentTokens += paraTokens
    }

    textOffset += para.length + 2
  }

  // Don't forget last chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      startOffset,
      endOffset: textOffset,
      tokenCount: currentTokens,
    })
  }

  return chunks
}

function getOverlapText(text: string, overlapTokens: number): string {
  const tokens = encode(text)
  if (tokens.length <= overlapTokens) return text

  const overlapTokenSlice = tokens.slice(-overlapTokens)
  // Decode back to text (approximate, may cut words)
  return decode(overlapTokenSlice)
}
```

### Progress Display

```typescript
// packages/cli/src/ingest/progress.ts
import cliProgress from 'cli-progress'
import chalk from 'chalk'

export function createProgressBar(total: number, label: string) {
  return new cliProgress.SingleBar({
    format: `${label} |${chalk.cyan('{bar}')}| {percentage}% | {value}/{total} | {status}`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
  })
}

export async function ingestWithProgress(
  files: string[],
  options: IngestOptions,
): Promise<IngestSummary> {
  const bar = createProgressBar(files.length, 'Ingesting')
  bar.start(files.length, 0, { status: 'starting...' })

  const results: IngestResult[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    bar.update(i, { status: path.basename(file) })

    try {
      const content = await fs.readFile(file, 'utf-8')
      const result = await ingestDocument(content, {
        source: file,
        filename: path.basename(file),
      }, options)
      results.push(result)
    } catch (error) {
      results.push({
        status: 'error',
        file,
        error: error.message,
      })
    }
  }

  bar.update(files.length, { status: 'complete' })
  bar.stop()

  return summarizeResults(results)
}
```

## Unit Tests

### Required Unit Tests

| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `src/__tests__/ingest/chunker.test.ts` | `respects max tokens` | All chunks <= maxTokens |
| `src/__tests__/ingest/chunker.test.ts` | `applies overlap` | Consecutive chunks overlap |
| `src/__tests__/ingest/chunker.test.ts` | `handles empty input` | Returns empty array |
| `src/__tests__/ingest/pipeline.test.ts` | `detects duplicates` | Returns skipped status |
| `src/__tests__/ingest/pipeline.test.ts` | `deduplicates similar chunks` | Reduces chunk count |
| `src/__tests__/ingest/pipeline.test.ts` | `uses Rust for hashing` | sha256Hex called |

## Integration Tests

| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `ingest markdown file` | Sample .md | 1. Ingest 2. Search | Content found |
| `ingest directory` | 5 files | 1. Ingest dir | All processed |
| `duplicate detection` | Same file twice | 1. Ingest 2. Ingest | Second skipped |
| `chunk deduplication` | Repetitive content | 1. Ingest | Fewer chunks than naive |

## Acceptance Criteria

1. `tag ingest file` processes single files
2. `tag ingest dir` processes directories recursively
3. Content hashing uses Rust SHA256
4. Chunk deduplication uses Rust batch cosine
5. Progress bar shows real-time status
6. Duplicate documents are skipped
7. Errors don't stop batch processing

## Dependencies

- Depends on: Day 4 (Rust vectors), Day 5 (NAPI)
- Blocks: Day 12 (E2E smoke test)
