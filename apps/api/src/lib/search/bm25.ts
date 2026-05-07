/**
 * BM25 Search Implementation
 *
 * PostgreSQL full-text search using tsvector and ts_rank_cd
 */

import { prisma } from '@oppmon/database';
import { BM25Result, BM25SearchOptions } from './types.js';
import { BM25_NORMALIZATION, BM25_MIN_SCORE } from './config.js';
import { expandQuery } from './taxonomy.js';

// ============================================================================
// Main BM25 Search
// ============================================================================

/**
 * Execute BM25 search across multiple source types
 */
export async function bm25Search(
  options: BM25SearchOptions
): Promise<BM25Result[]> {
  const { tenantId, query, sourceTypes, topK = 100, minScore = BM25_MIN_SCORE } = options;

  // Build UNION query for all source types
  const queries: string[] = [];

  if (sourceTypes.includes('skill')) {
    queries.push(`
      SELECT id, 'skill' as "sourceType", id as "sourceId",
             ts_rank_cd(search_vector, query, ${BM25_NORMALIZATION}) as score
      FROM skills,
           plainto_tsquery('english', $1) query
      WHERE search_vector @@ query
        AND tenant_id = $2
        AND deleted_at IS NULL
    `);
  }

  if (sourceTypes.includes('mcp_server')) {
    queries.push(`
      SELECT id, 'mcp_server' as "sourceType", id as "sourceId",
             ts_rank_cd(search_vector, query, ${BM25_NORMALIZATION}) as score
      FROM mcp_servers,
           plainto_tsquery('english', $1) query
      WHERE search_vector @@ query
        AND tenant_id = $2
        AND deleted_at IS NULL
    `);
  }

  if (sourceTypes.includes('agent')) {
    queries.push(`
      SELECT id, 'agent' as "sourceType", id as "sourceId",
             ts_rank_cd(search_vector, query, ${BM25_NORMALIZATION}) as score
      FROM agents,
           plainto_tsquery('english', $1) query
      WHERE search_vector @@ query
        AND tenant_id = $2
    `);
  }

  if (sourceTypes.includes('workflow')) {
    queries.push(`
      SELECT id, 'workflow' as "sourceType", id as "sourceId",
             ts_rank_cd(search_vector, query, ${BM25_NORMALIZATION}) as score
      FROM workflows,
           plainto_tsquery('english', $1) query
      WHERE search_vector @@ query
        AND tenant_id = $2
    `);
  }

  if (queries.length === 0) {
    return [];
  }

  const unionQuery = `
    WITH all_results AS (
      ${queries.join(' UNION ALL ')}
    )
    SELECT id, source_type, source_id, score
    FROM all_results
    WHERE score >= $3
    ORDER BY score DESC
    LIMIT $4
  `;

  const results = await prisma.$queryRawUnsafe<BM25Result[]>(
    unionQuery,
    query,
    tenantId,
    minScore,
    topK
  );

  return results.map(r => ({
    ...r,
    score: Number(r.score),
  }));
}

/**
 * Search a single source type (simpler API)
 */
export async function bm25SearchSingle(
  tenantId: string,
  sourceType: 'skill' | 'mcp_server' | 'agent' | 'workflow',
  query: string,
  topK: number = 100
): Promise<Array<{ id: string; score: number }>> {
  const tableConfig: Record<string, { table: string; deletedFilter: string }> = {
    skill: { table: 'skills', deletedFilter: 'AND deleted_at IS NULL' },
    mcp_server: { table: 'mcp_servers', deletedFilter: 'AND deleted_at IS NULL' },
    agent: { table: 'agents', deletedFilter: '' },
    workflow: { table: 'workflows', deletedFilter: '' },
  };

  const { table, deletedFilter } = tableConfig[sourceType];

  const results = await prisma.$queryRawUnsafe<Array<{ id: string; score: number }>>(
    `
    SELECT id, ts_rank_cd(search_vector, query, ${BM25_NORMALIZATION}) as score
    FROM ${table},
         plainto_tsquery('english', $1) query
    WHERE search_vector @@ query
      AND tenant_id = $2
      ${deletedFilter}
    ORDER BY score DESC
    LIMIT $3
    `,
    query,
    tenantId,
    topK
  );

  return results.map(r => ({
    id: r.id,
    score: Number(r.score),
  }));
}

/**
 * BM25 search with query expansion
 */
export async function bm25SearchWithExpansion(
  tenantId: string,
  rawQuery: string,
  sourceTypes: string[],
  topK: number = 100
): Promise<BM25Result[]> {
  // Expand query terms
  const expandedTerms = expandQuery(rawQuery, sourceTypes);
  const searchQuery = expandedTerms.join(' | '); // OR for expanded terms

  // Build source type filter
  const sourceFilters: string[] = [];

  if (sourceTypes.includes('skill')) {
    sourceFilters.push(`
      SELECT id, 'skill' as "sourceType", id as "sourceId",
             ts_rank_cd(search_vector, query, ${BM25_NORMALIZATION}) as score
      FROM skills,
           websearch_to_tsquery('english', $1) query
      WHERE search_vector @@ query
        AND tenant_id = $2
        AND deleted_at IS NULL
    `);
  }

  if (sourceTypes.includes('mcp_server')) {
    sourceFilters.push(`
      SELECT id, 'mcp_server' as "sourceType", id as "sourceId",
             ts_rank_cd(search_vector, query, ${BM25_NORMALIZATION}) as score
      FROM mcp_servers,
           websearch_to_tsquery('english', $1) query
      WHERE search_vector @@ query
        AND tenant_id = $2
        AND deleted_at IS NULL
    `);
  }

  if (sourceFilters.length === 0) {
    return [];
  }

  const unionQuery = `
    WITH all_results AS (
      ${sourceFilters.join(' UNION ALL ')}
    )
    SELECT id, source_type, source_id, score
    FROM all_results
    WHERE score >= ${BM25_MIN_SCORE}
    ORDER BY score DESC
    LIMIT $3
  `;

  const results = await prisma.$queryRawUnsafe<BM25Result[]>(
    unionQuery,
    searchQuery,
    tenantId,
    topK
  );

  return results.map(r => ({
    ...r,
    score: Number(r.score),
  }));
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if search_vector column exists for a table
 */
export async function hasSearchVector(tableName: string): Promise<boolean> {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = ${tableName}
        AND column_name = 'search_vector'
    ) as exists
  `;

  return result[0]?.exists ?? false;
}

/**
 * Manually update search vector for a record
 * (useful for testing or manual backfill)
 */
export async function updateSearchVector(
  tableName: 'skills' | 'mcp_servers' | 'agents' | 'workflows',
  id: string
): Promise<void> {
  const updateQueries: Record<string, string> = {
    skills: `
      UPDATE skills SET search_vector =
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'C')
      WHERE id = $1
    `,
    mcp_servers: `
      UPDATE mcp_servers SET search_vector =
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(command, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(array_to_string(args, ' '), '')), 'D')
      WHERE id = $1
    `,
    agents: `
      UPDATE agents SET search_vector =
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      WHERE id = $1
    `,
    workflows: `
      UPDATE workflows SET search_vector =
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      WHERE id = $1
    `,
  };

  await prisma.$executeRawUnsafe(updateQueries[tableName], id);
}
