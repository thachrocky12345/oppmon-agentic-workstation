/**
 * Hybrid Search Service
 *
 * Orchestrates BM25 + vector search with RRF fusion, query expansion,
 * and confidence scoring.
 */

import { prisma } from '@oppmon/database';
import {
  HybridSearchOptions,
  HybridSearchResponse,
  SearchResult,
  SearchStrategy,
  ConfidenceBreakdown,
  BM25Result,
  VectorResult,
} from '../lib/search/types.js';
import { bm25Search, bm25SearchWithExpansion, hasSearchVector } from '../lib/search/bm25.js';
import { vectorSearch, getEmbeddingCount } from '../lib/search/vector.js';
import { rrfTwoLists } from '../lib/search/rrf.js';
import { expandQuery } from '../lib/search/taxonomy.js';
import { computeConfidence } from '../lib/search/confidence.js';
import { getWeights, DEFAULT_WEIGHTS } from '../lib/search/config.js';
import { EmbeddingProvider } from '../lib/embedding/index.js';

// ============================================================================
// Main Hybrid Search
// ============================================================================

/**
 * Execute hybrid search combining BM25 and vector search
 */
export async function hybridSearch(
  tenantId: string,
  options: HybridSearchOptions & { embeddingProvider?: EmbeddingProvider }
): Promise<HybridSearchResponse> {
  const startTime = Date.now();
  const {
    query,
    sourceTypes,
    topK = 10,
    threshold = 0.5,
    strategy = 'hybrid',
    scoringPreset = 'default',
    scoringWeights,
    embeddingProvider,
  } = options;

  // Expand query terms
  const expandedTerms = expandQuery(query, sourceTypes);
  const expandedQuery = expandedTerms.join(' ');

  // Get scoring weights
  const weights = getWeights(scoringPreset, scoringWeights);

  // Track timings
  const timings = {
    bm25Ms: 0,
    vectorMs: 0,
    fusionMs: 0,
    totalMs: 0,
  };

  let bm25Results: BM25Result[] = [];
  let vectorResults: VectorResult[] = [];

  // Execute searches based on strategy
  if (strategy === 'bm25' || strategy === 'hybrid') {
    const bm25Start = Date.now();
    try {
      // Check if search_vector exists
      const hasBM25 = await hasSearchVector('skills');
      if (hasBM25) {
        bm25Results = await bm25Search({
          tenantId,
          query: expandedQuery,
          sourceTypes,
          topK: topK * 2, // Get more for fusion
        });
      }
    } catch (error) {
      console.warn('[Search] BM25 search failed, continuing with vector only:', error);
    }
    timings.bm25Ms = Date.now() - bm25Start;
  }

  if (strategy === 'vector' || strategy === 'hybrid') {
    const vectorStart = Date.now();
    try {
      vectorResults = await vectorSearch({
        tenantId,
        query,
        sourceTypes,
        topK: topK * 2, // Get more for fusion
        threshold,
        embeddingProvider,
      });
    } catch (error) {
      console.warn('[Search] Vector search failed, continuing with BM25 only:', error);
    }
    timings.vectorMs = Date.now() - vectorStart;
  }

  // Fuse results
  const fusionStart = Date.now();
  let fusedResults: Array<{
    id: string;
    rrfScore: number;
    bm25Rank?: number;
    vectorRank?: number;
  }>;

  if (strategy === 'hybrid' && bm25Results.length > 0 && vectorResults.length > 0) {
    // Use RRF to merge
    fusedResults = rrfTwoLists(
      bm25Results.map(r => ({ id: r.id, score: r.score })),
      vectorResults.map(r => ({ id: r.id, score: r.score }))
    );
  } else if (bm25Results.length > 0) {
    // BM25 only
    fusedResults = bm25Results.map((r, i) => ({
      id: r.id,
      rrfScore: r.score,
      bm25Rank: i + 1,
    }));
  } else if (vectorResults.length > 0) {
    // Vector only
    fusedResults = vectorResults.map((r, i) => ({
      id: r.id,
      rrfScore: r.score,
      vectorRank: i + 1,
    }));
  } else {
    fusedResults = [];
  }

  timings.fusionMs = Date.now() - fusionStart;

  // Enrich results with content
  const topResults = fusedResults.slice(0, topK);
  const enrichedResults = await enrichResults(
    tenantId,
    topResults,
    bm25Results,
    vectorResults
  );

  // Compute confidence
  const totalItems = await getEmbeddingCount(tenantId, sourceTypes);
  const confidence = computeConfidence(
    {
      query,
      filters: {
        sourceType: sourceTypes.length === 1 ? sourceTypes[0] : undefined,
      },
      bm25Ids: bm25Results.map(r => r.id),
      vectorIds: vectorResults.map(r => r.id),
      results: topResults.map(r => ({ id: r.id, score: r.rrfScore })),
      totalItems,
    },
    weights
  );

  timings.totalMs = Date.now() - startTime;

  return {
    results: enrichedResults,
    confidence,
    debug: {
      bm25Count: bm25Results.length,
      vectorCount: vectorResults.length,
      mergedCount: fusedResults.length,
      queryExpansion: expandedTerms,
      strategy,
      timings,
    },
  };
}

// ============================================================================
// Result Enrichment
// ============================================================================

/**
 * Enrich fused results with full content and metadata
 */
async function enrichResults(
  tenantId: string,
  fusedResults: Array<{
    id: string;
    rrfScore: number;
    bm25Rank?: number;
    vectorRank?: number;
  }>,
  bm25Results: BM25Result[],
  vectorResults: VectorResult[]
): Promise<SearchResult[]> {
  if (fusedResults.length === 0) {
    return [];
  }

  // Create lookup maps
  const bm25Map = new Map(bm25Results.map(r => [r.id, r]));
  const vectorMap = new Map(vectorResults.map(r => [r.id, r]));

  // Get IDs by source type
  const skillIds = fusedResults
    .filter(r => bm25Map.get(r.id)?.sourceType === 'skill' || vectorMap.get(r.id)?.sourceType === 'skill')
    .map(r => r.id);
  const mcpIds = fusedResults
    .filter(r => bm25Map.get(r.id)?.sourceType === 'mcp_server' || vectorMap.get(r.id)?.sourceType === 'mcp_server')
    .map(r => r.id);

  // Fetch content from database
  const [skills, mcpServers, embeddings] = await Promise.all([
    skillIds.length > 0
      ? prisma.skill.findMany({
          where: { id: { in: skillIds }, tenantId },
          select: { id: true, name: true, description: true, content: true },
        })
      : [],
    mcpIds.length > 0
      ? prisma.mcpServer.findMany({
          where: { id: { in: mcpIds }, tenantId },
          select: { id: true, name: true, description: true, command: true, args: true },
        })
      : [],
    // Also get embedding content for items not in direct tables
    prisma.embedding.findMany({
      where: {
        tenantId,
        OR: fusedResults.map(r => ({
          sourceId: vectorMap.get(r.id)?.sourceId || r.id,
        })),
      },
      select: { id: true, sourceType: true, sourceId: true, content: true, metadata: true },
    }),
  ]);

  // Create content lookup
  const contentMap = new Map<string, { content: string; sourceType: string; sourceId: string; metadata?: Record<string, unknown> }>();

  for (const skill of skills) {
    contentMap.set(skill.id, {
      content: `${skill.name}\n${skill.description || ''}\n${skill.content}`.trim(),
      sourceType: 'skill',
      sourceId: skill.id,
      metadata: { name: skill.name, description: skill.description },
    });
  }

  for (const mcp of mcpServers) {
    contentMap.set(mcp.id, {
      content: `${mcp.name}\n${mcp.description || ''}\n${mcp.command} ${mcp.args?.join(' ') || ''}`.trim(),
      sourceType: 'mcp_server',
      sourceId: mcp.id,
      metadata: { name: mcp.name, description: mcp.description, command: mcp.command },
    });
  }

  for (const emb of embeddings) {
    if (!contentMap.has(emb.sourceId)) {
      contentMap.set(emb.sourceId, {
        content: emb.content,
        sourceType: emb.sourceType,
        sourceId: emb.sourceId,
        metadata: emb.metadata as Record<string, unknown> | undefined,
      });
    }
  }

  // Build final results
  return fusedResults.map(r => {
    const bm25 = bm25Map.get(r.id);
    const vector = vectorMap.get(r.id);
    const sourceId = vector?.sourceId || bm25?.sourceId || r.id;
    const info = contentMap.get(r.id) || contentMap.get(sourceId) || {
      content: vector?.content || '',
      sourceType: bm25?.sourceType || vector?.sourceType || 'unknown',
      sourceId: sourceId,
    };

    return {
      id: r.id,
      sourceType: info.sourceType,
      sourceId: info.sourceId,
      content: info.content,
      scores: {
        bm25: bm25?.score || 0,
        vector: vector?.score || 0,
        rrf: r.rrfScore,
        final: r.rrfScore,
      },
      metadata: info.metadata,
    };
  });
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Search for skills only
 */
export async function searchSkills(
  tenantId: string,
  query: string,
  options: {
    topK?: number;
    strategy?: SearchStrategy;
    embeddingProvider?: EmbeddingProvider;
  } = {}
): Promise<HybridSearchResponse> {
  return hybridSearch(tenantId, {
    query,
    sourceTypes: ['skill'],
    ...options,
  });
}

/**
 * Search for MCP servers only
 */
export async function searchMcpServers(
  tenantId: string,
  query: string,
  options: {
    topK?: number;
    strategy?: SearchStrategy;
    embeddingProvider?: EmbeddingProvider;
  } = {}
): Promise<HybridSearchResponse> {
  return hybridSearch(tenantId, {
    query,
    sourceTypes: ['mcp_server'],
    ...options,
  });
}

/**
 * Get search status (check if hybrid search is available)
 */
export async function getSearchStatus(): Promise<{
  bm25Available: boolean;
  vectorAvailable: boolean;
  hybridAvailable: boolean;
  tables: {
    skills: boolean;
    mcpServers: boolean;
    agents: boolean;
    workflows: boolean;
  };
}> {
  const [skills, mcpServers, agents, workflows] = await Promise.all([
    hasSearchVector('skills'),
    hasSearchVector('mcp_servers'),
    hasSearchVector('agents'),
    hasSearchVector('workflows'),
  ]);

  const bm25Available = skills || mcpServers || agents || workflows;
  const vectorAvailable = true; // Always available via pgvector

  return {
    bm25Available,
    vectorAvailable,
    hybridAvailable: bm25Available && vectorAvailable,
    tables: {
      skills,
      mcpServers,
      agents,
      workflows,
    },
  };
}
