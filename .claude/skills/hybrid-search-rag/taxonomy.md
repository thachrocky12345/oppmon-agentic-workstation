# Query Expansion Taxonomy

## Overview

Query expansion improves recall by adding synonyms and related terms to the search query. This is critical for:

- **Technical jargon**: "CI/CD" → "continuous integration", "deployment", "pipeline"
- **Abbreviations**: "MCP" → "model context protocol"
- **Conceptual similarity**: "testing" → "test", "unit test", "e2e", "qa"

## Taxonomy Structure

```typescript
// apps/api/src/lib/search/taxonomy.ts

/**
 * Canonical term → array of synonyms (including the canonical term)
 * First entry is always the canonical/primary term
 */
export const SKILL_TAXONOMY: Record<string, string[]> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // VERSION CONTROL
  // ═══════════════════════════════════════════════════════════════════════════
  'git': [
    'git', 'version control', 'vcs', 'source control',
    'repository', 'repo', 'commit', 'branch', 'merge',
    'pull request', 'pr', 'checkout', 'clone', 'push', 'pull',
    'rebase', 'cherry-pick', 'stash', 'diff', 'blame',
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPLOYMENT & CI/CD
  // ═══════════════════════════════════════════════════════════════════════════
  'deployment': [
    'deploy', 'deployment', 'release', 'ship', 'publish',
    'ci/cd', 'ci', 'cd', 'continuous integration', 'continuous deployment',
    'pipeline', 'build', 'artifact', 'rollback', 'rollout',
    'staging', 'production', 'environment',
  ],

  'docker': [
    'docker', 'container', 'containerization', 'dockerfile',
    'docker-compose', 'image', 'registry', 'kubernetes', 'k8s',
    'pod', 'helm', 'orchestration',
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // TESTING
  // ═══════════════════════════════════════════════════════════════════════════
  'testing': [
    'test', 'testing', 'unit test', 'integration test', 'e2e',
    'end-to-end', 'qa', 'quality assurance', 'tdd', 'bdd',
    'coverage', 'assertion', 'mock', 'stub', 'fixture',
    'vitest', 'jest', 'playwright', 'cypress',
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // DEBUGGING & MONITORING
  // ═══════════════════════════════════════════════════════════════════════════
  'debugging': [
    'debug', 'debugging', 'troubleshoot', 'troubleshooting',
    'fix', 'error', 'bug', 'issue', 'trace', 'stack trace',
    'breakpoint', 'inspect', 'diagnose', 'root cause',
  ],

  'logging': [
    'log', 'logging', 'logger', 'trace', 'tracing',
    'observability', 'monitoring', 'metrics', 'telemetry',
    'pino', 'winston', 'console', 'stdout',
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // DATABASE
  // ═══════════════════════════════════════════════════════════════════════════
  'database': [
    'database', 'db', 'sql', 'query', 'postgresql', 'postgres',
    'mysql', 'mongodb', 'mongo', 'redis', 'cache',
    'migration', 'schema', 'table', 'index', 'orm', 'prisma',
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // API & NETWORKING
  // ═══════════════════════════════════════════════════════════════════════════
  'api': [
    'api', 'rest', 'restful', 'graphql', 'grpc', 'rpc',
    'endpoint', 'route', 'http', 'request', 'response',
    'fetch', 'axios', 'webhook', 'websocket', 'ws',
  ],

  'authentication': [
    'auth', 'authentication', 'authorization', 'authz', 'authn',
    'login', 'logout', 'session', 'token', 'jwt', 'oauth',
    'sso', 'mfa', '2fa', 'password', 'credential', 'rbac',
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // AI & LLM
  // ═══════════════════════════════════════════════════════════════════════════
  'llm': [
    'llm', 'language model', 'large language model',
    'gpt', 'claude', 'anthropic', 'openai', 'ai', 'ml',
    'completion', 'chat', 'prompt', 'inference',
  ],

  'embedding': [
    'embedding', 'embeddings', 'vector', 'vectorization',
    'semantic', 'similarity', 'cosine', 'pgvector',
    'text-embedding', 'ada', 'encode',
  ],

  'rag': [
    'rag', 'retrieval', 'retrieval augmented generation',
    'augmented', 'generation', 'context', 'grounding',
    'knowledge base', 'semantic search', 'hybrid search',
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // FRONTEND
  // ═══════════════════════════════════════════════════════════════════════════
  'react': [
    'react', 'reactjs', 'component', 'jsx', 'tsx', 'hook',
    'useState', 'useEffect', 'context', 'redux', 'zustand',
  ],

  'nextjs': [
    'next', 'nextjs', 'next.js', 'app router', 'pages router',
    'server component', 'client component', 'ssr', 'ssg', 'isr',
  ],

  'styling': [
    'css', 'style', 'styling', 'tailwind', 'tailwindcss',
    'sass', 'scss', 'styled-components', 'emotion',
    'responsive', 'layout', 'flexbox', 'grid',
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════════════════════════════════
  'security': [
    'security', 'secure', 'vulnerability', 'exploit',
    'xss', 'csrf', 'injection', 'sql injection',
    'sanitize', 'validate', 'escape', 'owasp',
  ],

  'encryption': [
    'encrypt', 'encryption', 'decrypt', 'decryption',
    'hash', 'hashing', 'bcrypt', 'sha', 'aes', 'rsa',
    'key', 'secret', 'certificate', 'ssl', 'tls', 'https',
  ],
};

/**
 * MCP Server specific taxonomy
 */
export const MCP_TAXONOMY: Record<string, string[]> = {
  'filesystem': [
    'file', 'filesystem', 'fs', 'directory', 'folder',
    'read', 'write', 'delete', 'copy', 'move', 'path',
  ],

  'browser': [
    'browser', 'web', 'puppeteer', 'playwright', 'selenium',
    'screenshot', 'scrape', 'crawl', 'navigate', 'click',
  ],

  'search': [
    'search', 'find', 'query', 'lookup', 'fetch',
    'google', 'bing', 'duckduckgo', 'brave',
  ],

  'database_mcp': [
    'database', 'db', 'sql', 'query', 'postgres', 'sqlite',
    'mysql', 'mongodb', 'redis', 'supabase',
  ],

  'github': [
    'github', 'gh', 'git', 'repository', 'repo',
    'issue', 'pr', 'pull request', 'commit', 'branch',
  ],
};

/**
 * Tool/Function taxonomy
 */
export const TOOL_TAXONOMY: Record<string, string[]> = {
  'read_file': [
    'read', 'read file', 'get file', 'file contents',
    'cat', 'view', 'open', 'load',
  ],

  'write_file': [
    'write', 'write file', 'create file', 'save',
    'update file', 'modify file', 'edit file',
  ],

  'execute': [
    'execute', 'run', 'exec', 'shell', 'command',
    'bash', 'terminal', 'cli', 'script',
  ],

  'search_code': [
    'search', 'find', 'grep', 'ripgrep', 'rg',
    'locate', 'where', 'lookup', 'glob',
  ],
};
```

## Query Expansion Function

```typescript
// apps/api/src/lib/search/taxonomy.ts (continued)

/**
 * Build reverse synonym map: any synonym → canonical term
 */
function buildSynonymMap(
  taxonomy: Record<string, string[]>
): Map<string, string> {
  const map = new Map<string, string>();

  for (const [canonical, synonyms] of Object.entries(taxonomy)) {
    for (const synonym of synonyms) {
      map.set(synonym.toLowerCase(), canonical);
    }
  }

  return map;
}

const SKILL_SYNONYM_MAP = buildSynonymMap(SKILL_TAXONOMY);
const MCP_SYNONYM_MAP = buildSynonymMap(MCP_TAXONOMY);
const TOOL_SYNONYM_MAP = buildSynonymMap(TOOL_TAXONOMY);

/**
 * Expand query terms using taxonomy
 *
 * @param query - Raw search query
 * @param sourceTypes - Which taxonomies to use
 * @param maxExpansions - Max synonyms to add per term
 */
export function expandQuery(
  query: string,
  sourceTypes: string[] = ['skill', 'mcp_server', 'tool'],
  maxExpansions: number = 5
): string[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const expanded = new Set<string>(tokens);

  // Select which synonym maps to use
  const maps: Map<string, string>[] = [];
  if (sourceTypes.includes('skill')) maps.push(SKILL_SYNONYM_MAP);
  if (sourceTypes.includes('mcp_server')) maps.push(MCP_SYNONYM_MAP);
  if (sourceTypes.includes('tool')) maps.push(TOOL_SYNONYM_MAP);

  // Expand each token
  for (const token of tokens) {
    for (const map of maps) {
      const canonical = map.get(token);
      if (canonical) {
        // Get synonyms from the appropriate taxonomy
        const taxonomy = sourceTypes.includes('skill') ? SKILL_TAXONOMY
          : sourceTypes.includes('mcp_server') ? MCP_TAXONOMY
          : TOOL_TAXONOMY;

        const synonyms = taxonomy[canonical];
        if (synonyms) {
          // Add up to maxExpansions synonyms
          for (const syn of synonyms.slice(0, maxExpansions)) {
            expanded.add(syn.toLowerCase());
          }
        }
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Get canonical term for a query token
 */
export function getCanonical(
  token: string,
  sourceType: 'skill' | 'mcp_server' | 'tool' = 'skill'
): string | undefined {
  const map = sourceType === 'skill' ? SKILL_SYNONYM_MAP
    : sourceType === 'mcp_server' ? MCP_SYNONYM_MAP
    : TOOL_SYNONYM_MAP;

  return map.get(token.toLowerCase());
}
```

## Usage Examples

```typescript
// Basic expansion
expandQuery('git commit');
// → ['git', 'commit', 'version control', 'vcs', 'repository', 'branch', ...]

// Expansion with source type filter
expandQuery('filesystem read', ['mcp_server']);
// → ['filesystem', 'read', 'file', 'fs', 'directory', ...]

// Limited expansion
expandQuery('testing', ['skill'], 3);
// → ['testing', 'test', 'unit test', 'integration test']
```

## Building Custom Taxonomies

### From Existing Skills

Analyze existing skill content to build taxonomy:

```typescript
async function buildTaxonomyFromSkills(tenantId: string) {
  const skills = await prisma.skill.findMany({
    where: { tenantId, deletedAt: null },
    select: { name: true, description: true, content: true },
  });

  // Extract frequent terms
  const termCounts = new Map<string, number>();
  for (const skill of skills) {
    const text = `${skill.name} ${skill.description} ${skill.content}`;
    const tokens = text.toLowerCase().split(/\s+/);
    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }
  }

  // Group by co-occurrence
  // ... clustering logic
}
```

### From User Queries

Learn synonyms from search logs:

```typescript
async function learnSynonymsFromSearches() {
  const searches = await prisma.searchLog.findMany({
    where: {
      createdAt: { gte: subDays(new Date(), 30) },
      hasClicks: true, // Only successful searches
    },
  });

  // Find queries that led to same result
  const queryToResults = new Map<string, Set<string>>();
  for (const search of searches) {
    const key = search.clickedResultId;
    const queries = queryToResults.get(key) || new Set();
    queries.add(search.query);
    queryToResults.set(key, queries);
  }

  // Queries leading to same result are synonyms
  // ...
}
```

## Testing Taxonomy

```typescript
import { describe, it, expect } from 'vitest';
import { expandQuery, getCanonical } from './taxonomy.js';

describe('taxonomy', () => {
  it('expands git to related terms', () => {
    const expanded = expandQuery('git');

    expect(expanded).toContain('git');
    expect(expanded).toContain('version control');
    expect(expanded).toContain('commit');
  });

  it('maps synonyms to canonical', () => {
    expect(getCanonical('vcs')).toBe('git');
    expect(getCanonical('ci/cd')).toBe('deployment');
    expect(getCanonical('e2e')).toBe('testing');
  });

  it('handles unknown terms', () => {
    const expanded = expandQuery('xyzunknown');

    expect(expanded).toEqual(['xyzunknown']);
  });

  it('respects maxExpansions', () => {
    const expanded = expandQuery('git', ['skill'], 2);

    // Should have original + 2 expansions max per match
    expect(expanded.length).toBeLessThanOrEqual(10);
  });
});
```

## Maintenance

### Adding New Terms

1. Identify gaps from search logs (queries with low results)
2. Add canonical term and synonyms
3. Run tests to verify expansion
4. Deploy and monitor recall improvements

### Updating Existing Terms

```typescript
// In taxonomy.ts, add to appropriate category:

'newconcept': [
  'newconcept', 'synonym1', 'synonym2', 'related term',
],
```

### Versioning

Consider versioning taxonomy for A/B testing:

```typescript
export const TAXONOMY_V1 = { /* old mappings */ };
export const TAXONOMY_V2 = { /* new mappings */ };

export function getTaxonomy(version: string = 'v2') {
  return version === 'v1' ? TAXONOMY_V1 : TAXONOMY_V2;
}
```
