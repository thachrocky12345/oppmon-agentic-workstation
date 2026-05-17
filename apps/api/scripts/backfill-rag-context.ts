/**
 * Backfill RAG Contextual Retrieval
 *
 * Walks rag_documents where `summary IS NULL` (i.e. ingested before
 * Contextual Retrieval shipped) and:
 *   1. re-reads the file from storage
 *   2. re-extracts the text
 *   3. asks the contextualizer for summary + per-chunk prefixes
 *   4. UPDATEs rag_documents.summary{,_model,_updated_at}
 *   5. UPDATEs each rag_chunks row with context_prefix
 *   6. re-embeds each chunk with `prefix + content` (so the embedding
 *      matches the new BM25 source = the `content_search` generated column)
 *   7. writes an audit log row `kind='rag.contextualize'`
 *
 * Crash semantics: idempotent. The `summary IS NULL` filter naturally
 * skips already-processed docs. Missing files are logged and skipped.
 *
 * Usage:
 *   pnpm tsx apps/api/scripts/backfill-rag-context.ts --collection col_xxx --dry-run
 *   pnpm tsx apps/api/scripts/backfill-rag-context.ts --collection col_xxx --limit 50
 *   pnpm tsx apps/api/scripts/backfill-rag-context.ts --tenant t_yyy --resume-from doc_zzz
 *
 * Flags:
 *   --tenant <id>          Restrict to one tenant
 *   --collection <id>      Restrict to one collection (RECOMMENDED — per-collection opt-in)
 *   --limit <n>            Process at most n docs
 *   --resume-from <doc_id> Skip until this doc id (lexicographic, inclusive)
 *   --dry-run              Plan only; no DB writes, no LLM calls
 *   --failure-log <path>   Append failures (one JSON per line); default backfill-failures.jsonl
 *
 * Safety: this script writes to every chunk of every matching document.
 * Always start with --dry-run, then --limit 1, then --limit 10, then full.
 */

import { query, transaction } from '../src/lib/db.js';
import { contextualize } from '../src/services/rag-contextualizer.js';
import { extractText, UnsupportedMimeTypeError } from '../src/services/rag-extract.js';
import { getDocumentStorage } from '../src/lib/storage/index.js';
import { createEmbeddingClient } from '../src/lib/embedding/index.js';
import { logAudit } from '../src/lib/audit.js';
import { appendFile } from 'fs/promises';

// ============================================================================
// CLI parsing
// ============================================================================

interface CliArgs {
  tenant?: string;
  collection?: string;
  limit?: number;
  resumeFrom?: string;
  dryRun: boolean;
  failureLog: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: CliArgs = { dryRun: false, failureLog: 'backfill-failures.jsonl' };

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    switch (k) {
      case '--tenant':
        args.tenant = v;
        i++;
        break;
      case '--collection':
        args.collection = v;
        i++;
        break;
      case '--limit':
        args.limit = parseInt(v, 10);
        i++;
        break;
      case '--resume-from':
        args.resumeFrom = v;
        i++;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--failure-log':
        args.failureLog = v;
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`Usage: backfill-rag-context.ts [options]

  --tenant <id>          Restrict to one tenant
  --collection <id>      Restrict to one collection
  --limit <n>            Process at most n docs
  --resume-from <doc_id> Skip until this id (inclusive)
  --dry-run              Plan only — no writes, no LLM calls
  --failure-log <path>   Failures file (default backfill-failures.jsonl)
`);
}

// ============================================================================
// Candidate query
// ============================================================================

interface CandidateDoc {
  id: string;
  tenant_id: string;
  collection_id: string;
  mime_type: string;
  original_filename: string;
  chunk_count: number;
}

async function findCandidates(args: CliArgs): Promise<CandidateDoc[]> {
  const where: string[] = ['summary IS NULL', 'deleted_at IS NULL', "extraction_status = 'EXTRACTED'"];
  const params: unknown[] = [];

  if (args.tenant) {
    params.push(args.tenant);
    where.push(`tenant_id = $${params.length}`);
  }
  if (args.collection) {
    params.push(args.collection);
    where.push(`collection_id = $${params.length}`);
  }
  if (args.resumeFrom) {
    params.push(args.resumeFrom);
    where.push(`id >= $${params.length}`);
  }

  let sql = `
    SELECT id, tenant_id, collection_id, mime_type, original_filename, chunk_count
    FROM rag_documents
    WHERE ${where.join(' AND ')}
    ORDER BY id ASC
  `;
  if (args.limit && Number.isFinite(args.limit)) {
    sql += ` LIMIT ${args.limit}`;
  }

  const res = await query(sql, params);
  return res.rows as CandidateDoc[];
}

// ============================================================================
// Per-document worker
// ============================================================================

interface Failure {
  doc_id: string;
  reason: string;
  err?: string;
  at: string;
}

async function processDocument(doc: CandidateDoc, dryRun: boolean): Promise<{ ok: true } | Failure> {
  const storage = getDocumentStorage();

  // 1. Read file
  let buffer: Buffer;
  try {
    const stream = await storage.get(doc.tenant_id, doc.id, doc.original_filename);
    const parts: Buffer[] = [];
    for await (const chunk of stream) parts.push(chunk as Buffer);
    buffer = Buffer.concat(parts);
  } catch (err) {
    return { doc_id: doc.id, reason: 'file_not_found', err: (err as Error).message, at: new Date().toISOString() };
  }

  // 2. Re-extract text
  let text: string;
  try {
    text = await extractText(doc.mime_type, buffer);
  } catch (err) {
    if (err instanceof UnsupportedMimeTypeError) {
      return { doc_id: doc.id, reason: 'unsupported_mime', err: err.mime, at: new Date().toISOString() };
    }
    return { doc_id: doc.id, reason: 'extract_failed', err: (err as Error).message, at: new Date().toISOString() };
  }

  // 3. Load existing chunks in order
  const chunkRows = (
    await query(
      `SELECT id, chunk_index, content
       FROM rag_chunks
       WHERE document_id = $1 AND tenant_id = $2
       ORDER BY chunk_index ASC`,
      [doc.id, doc.tenant_id],
    )
  ).rows as Array<{ id: string; chunk_index: number; content: string }>;

  if (chunkRows.length === 0) {
    return { doc_id: doc.id, reason: 'no_chunks', at: new Date().toISOString() };
  }

  const chunkTexts = chunkRows.map((r) => r.content);

  if (dryRun) {
    console.log(
      `[dry-run] doc=${doc.id} tenant=${doc.tenant_id} chunks=${chunkRows.length} mime=${doc.mime_type}`,
    );
    return { ok: true };
  }

  // 4. Contextualize (soft-fails inside; never throws)
  const ctx = await contextualize({ fullText: text, chunks: chunkTexts });

  // If contextualizer fell back, abort — don't waste embedding cost
  // on a write that won't improve retrieval. Log and move on.
  if (ctx.model === 'fallback') {
    return { doc_id: doc.id, reason: 'contextualizer_fallback', at: new Date().toISOString() };
  }

  // 5. Re-embed each chunk with prefix + content
  const embeddingClient = createEmbeddingClient('openai');
  const augmented = chunkRows.map((r, i) => (ctx.prefixes[i] ? `${ctx.prefixes[i]}\n\n${r.content}` : r.content));
  const embResp = await embeddingClient.embed({ input: augmented });

  // 6. Persist everything in a single transaction
  await transaction(async (client) => {
    for (let i = 0; i < chunkRows.length; i++) {
      const row = chunkRows[i];
      const prefix = ctx.prefixes[i] || null;
      const emb = embResp.embeddings[i];
      await client.query(
        `UPDATE rag_chunks
         SET context_prefix = $2, embedding = $3::vector
         WHERE id = $1`,
        [row.id, prefix, `[${emb.embedding.join(',')}]`],
      );
    }

    await client.query(
      `UPDATE rag_documents
       SET summary = $2, summary_model = $3, summary_updated_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [doc.id, ctx.summary || null, ctx.model],
    );
  });

  // 7. Audit
  logAudit({
    actorType: 'system',
    action: 'rag.contextualize',
    targetType: 'rag_document',
    targetId: doc.id,
    tenantId: doc.tenant_id,
    metadata: {
      collection_id: doc.collection_id,
      chunk_count: chunkRows.length,
      summary_model: ctx.model,
      summary_chars: ctx.summary.length,
    },
  });

  return { ok: true };
}

// ============================================================================
// Entrypoint
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('[backfill] starting', {
    tenant: args.tenant ?? '(any)',
    collection: args.collection ?? '(any)',
    limit: args.limit ?? '(no limit)',
    resumeFrom: args.resumeFrom ?? '(beginning)',
    dryRun: args.dryRun,
  });

  const candidates = await findCandidates(args);
  console.log(`[backfill] ${candidates.length} candidate document(s)`);

  if (candidates.length === 0) {
    console.log('[backfill] nothing to do — exiting');
    return;
  }

  let ok = 0;
  let skipped = 0;
  const failures: Failure[] = [];

  for (const doc of candidates) {
    try {
      const result = await processDocument(doc, args.dryRun);
      if ('ok' in result) {
        ok++;
        if (!args.dryRun) {
          console.log(`[backfill] ✓ ${doc.id} (${doc.original_filename})`);
        }
      } else {
        skipped++;
        failures.push(result);
        console.log(`[backfill] skip ${doc.id}: ${result.reason}${result.err ? ' — ' + result.err : ''}`);
      }
    } catch (err) {
      // Unexpected error — bubble into the failure log but don't crash the run.
      const fail: Failure = {
        doc_id: doc.id,
        reason: 'unexpected',
        err: (err as Error).message,
        at: new Date().toISOString(),
      };
      failures.push(fail);
      skipped++;
      console.error(`[backfill] ✗ ${doc.id} unexpected:`, err);
    }
  }

  // Append failures to the failure log so the operator can re-run with
  // --resume-from after fixing root causes.
  if (failures.length > 0 && !args.dryRun) {
    const lines = failures.map((f) => JSON.stringify(f)).join('\n') + '\n';
    await appendFile(args.failureLog, lines);
    console.log(`[backfill] wrote ${failures.length} failure(s) to ${args.failureLog}`);
  }

  console.log(`[backfill] done — ok=${ok} skipped=${skipped} total=${candidates.length}`);
  // Exit non-zero if everything was skipped — likely a misconfig.
  if (ok === 0 && skipped > 0 && !args.dryRun) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
