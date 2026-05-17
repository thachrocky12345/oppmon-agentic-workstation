// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Query Expansion Taxonomy
 *
 * Canonical term → synonym mappings for improved recall
 */

// ============================================================================
// Skill Taxonomy
// ============================================================================

export const SKILL_TAXONOMY: Record<string, string[]> = {
  // Version Control
  'git': [
    'git', 'version control', 'vcs', 'source control',
    'repository', 'repo', 'commit', 'branch', 'merge',
    'pull request', 'pr', 'checkout', 'clone', 'push', 'pull',
    'rebase', 'cherry-pick', 'stash', 'diff', 'blame',
  ],

  // Deployment & CI/CD
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

  // Testing
  'testing': [
    'test', 'testing', 'unit test', 'integration test', 'e2e',
    'end-to-end', 'qa', 'quality assurance', 'tdd', 'bdd',
    'coverage', 'assertion', 'mock', 'stub', 'fixture',
    'vitest', 'jest', 'playwright', 'cypress',
  ],

  // Debugging & Monitoring
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

  // Database
  'database': [
    'database', 'db', 'sql', 'query', 'postgresql', 'postgres',
    'mysql', 'mongodb', 'mongo', 'redis', 'cache',
    'migration', 'schema', 'table', 'index', 'orm', 'prisma',
  ],

  // API & Networking
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

  // AI & LLM
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

  // Frontend
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

  // Security
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

// ============================================================================
// MCP Server Taxonomy
// ============================================================================

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

  'slack': [
    'slack', 'message', 'channel', 'workspace',
    'notification', 'chat', 'team',
  ],

  'email': [
    'email', 'mail', 'smtp', 'send', 'receive',
    'inbox', 'outbox', 'attachment',
  ],
};

// ============================================================================
// Tool Taxonomy
// ============================================================================

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

// ============================================================================
// Synonym Maps (Reverse Lookups)
// ============================================================================

function buildSynonymMap(taxonomy: Record<string, string[]>): Map<string, string> {
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

// ============================================================================
// Query Expansion
// ============================================================================

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
  const taxonomies: Record<string, string[]>[] = [];

  if (sourceTypes.includes('skill')) {
    maps.push(SKILL_SYNONYM_MAP);
    taxonomies.push(SKILL_TAXONOMY);
  }
  if (sourceTypes.includes('mcp_server')) {
    maps.push(MCP_SYNONYM_MAP);
    taxonomies.push(MCP_TAXONOMY);
  }
  if (sourceTypes.includes('tool')) {
    maps.push(TOOL_SYNONYM_MAP);
    taxonomies.push(TOOL_TAXONOMY);
  }

  // Expand each token
  for (const token of tokens) {
    for (let i = 0; i < maps.length; i++) {
      const map = maps[i];
      const taxonomy = taxonomies[i];

      const canonical = map.get(token);
      if (canonical && taxonomy[canonical]) {
        // Add up to maxExpansions synonyms
        const synonyms = taxonomy[canonical].slice(0, maxExpansions);
        for (const syn of synonyms) {
          expanded.add(syn.toLowerCase());
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

/**
 * Get all synonyms for a canonical term
 */
export function getSynonyms(
  canonical: string,
  sourceType: 'skill' | 'mcp_server' | 'tool' = 'skill'
): string[] {
  const taxonomy = sourceType === 'skill' ? SKILL_TAXONOMY
    : sourceType === 'mcp_server' ? MCP_TAXONOMY
    : TOOL_TAXONOMY;

  return taxonomy[canonical] || [];
}
