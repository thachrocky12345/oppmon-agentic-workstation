/**
 * Domain-Specific Preprocessing Pipelines
 *
 * Extensible framework for domain detection, entity extraction,
 * external API enrichment, and prompt augmentation.
 */

// ============================================================================
// Types
// ============================================================================

export interface ExtractedEntity {
  type: string
  value: string
  position: { start: number; end: number }
  confidence: number
}

export interface EnrichedEntity extends ExtractedEntity {
  enrichment: Record<string, unknown> | null
}

export interface EnrichedData {
  entities: EnrichedEntity[]
  context: string
  sources: string[]
}

export interface DomainPipeline {
  name: string
  description: string
  patterns: RegExp[]
  extractor: (text: string) => Promise<ExtractedEntity[]>
  enricher: (entities: ExtractedEntity[]) => Promise<EnrichedData>
  promptBuilder: (enriched: EnrichedData) => string
  mandatoryTools?: string[]
}

export interface DomainMatch {
  domain: string
  pattern: string
  match: string
  position: number
}

export interface DetectionResult {
  detected: boolean
  domains: string[]
  matches?: DomainMatch[]
}

// ============================================================================
// Domain Detector
// ============================================================================

export class DomainDetector {
  private domains: Map<string, DomainPipeline> = new Map()
  private cache: Map<string, DetectionResult> = new Map()

  register(pipeline: DomainPipeline): void {
    this.domains.set(pipeline.name, pipeline)
  }

  detect(text: string): DetectionResult {
    // Check cache
    const cacheKey = text.slice(0, 500) // Use first 500 chars for cache key
    const cached = this.cache.get(cacheKey)
    if (cached) return cached

    const results: DomainMatch[] = []

    for (const [name, pipeline] of this.domains) {
      for (const pattern of pipeline.patterns) {
        // Create new regex for each match to avoid issues with global flag
        const regex = new RegExp(pattern.source, pattern.flags)
        let match: RegExpExecArray | null

        while ((match = regex.exec(text)) !== null) {
          results.push({
            domain: name,
            pattern: pattern.source,
            match: match[0],
            position: match.index,
          })

          // Prevent infinite loop for zero-length matches
          if (match[0].length === 0) break
        }
      }
    }

    if (results.length === 0) {
      const result = { detected: false, domains: [] }
      this.cache.set(cacheKey, result)
      return result
    }

    // Group by domain, sort by match count
    const domainCounts = new Map<string, number>()
    results.forEach((r) => {
      domainCounts.set(r.domain, (domainCounts.get(r.domain) || 0) + 1)
    })

    const sortedDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([domain]) => domain)

    const result: DetectionResult = {
      detected: true,
      domains: sortedDomains,
      matches: results,
    }

    this.cache.set(cacheKey, result)
    return result
  }

  getPipeline(name: string): DomainPipeline | undefined {
    return this.domains.get(name)
  }

  listDomains(): string[] {
    return Array.from(this.domains.keys())
  }

  clearCache(): void {
    this.cache.clear()
  }
}

// ============================================================================
// Software Development Domain
// ============================================================================

// Mock JIRA API for enrichment (replace with real implementation)
const jiraApi = {
  getIssue: async (
    key: string
  ): Promise<{
    fields: {
      summary: string
      status: { name: string }
      assignee?: { displayName: string }
      priority?: { name: string }
    }
  }> => ({
    fields: {
      summary: `Issue ${key} summary`,
      status: { name: 'In Progress' },
      assignee: { displayName: 'Developer' },
      priority: { name: 'Medium' },
    },
  }),
}

export const softwareDevelopmentPipeline: DomainPipeline = {
  name: 'software-development',
  description: 'Detects software development patterns: issues, PRs, errors',

  patterns: [
    // Issue/ticket references
    /\b(JIRA|RGDEV|TAG|ISSUE|OPPMON)-\d+\b/gi,
    // GitHub URLs
    /github\.com\/[\w-]+\/[\w-]+\/(issues|pull)\/\d+/gi,
    // Error patterns
    /\b(Error|Exception|TypeError|ReferenceError):\s*.+/gi,
    // Stack traces
    /at\s+[\w.]+\s+\(.+:\d+:\d+\)/gi,
    // Package names
    /@[\w-]+\/[\w-]+@[\d.]+/g,
  ],

  extractor: async (text: string) => {
    const entities: ExtractedEntity[] = []

    // Extract ticket references
    const ticketPattern = /\b(JIRA|RGDEV|TAG|ISSUE|OPPMON)-(\d+)\b/gi
    let match: RegExpExecArray | null
    while ((match = ticketPattern.exec(text)) !== null) {
      entities.push({
        type: 'ticket',
        value: match[0].toUpperCase(),
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 1.0,
      })
    }

    // Extract error messages
    const errorPattern = /\b(Error|Exception):\s*(.+?)(?:\n|$)/gi
    while ((match = errorPattern.exec(text)) !== null) {
      entities.push({
        type: 'error',
        value: match[2].trim(),
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 0.9,
      })
    }

    // Extract GitHub URLs
    const githubPattern =
      /github\.com\/([\w-]+)\/([\w-]+)\/(issues|pull)\/(\d+)/gi
    while ((match = githubPattern.exec(text)) !== null) {
      entities.push({
        type: 'github_ref',
        value: match[0],
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 1.0,
      })
    }

    return entities
  },

  enricher: async (entities: ExtractedEntity[]) => {
    const enriched: EnrichedEntity[] = []
    const sources: string[] = []

    for (const entity of entities) {
      if (entity.type === 'ticket') {
        try {
          const ticket = await jiraApi.getIssue(entity.value)
          enriched.push({
            ...entity,
            enrichment: {
              title: ticket.fields.summary,
              status: ticket.fields.status.name,
              assignee: ticket.fields.assignee?.displayName,
              priority: ticket.fields.priority?.name,
            },
          })
          sources.push(`JIRA: ${entity.value}`)
        } catch {
          enriched.push({ ...entity, enrichment: null })
        }
      } else {
        enriched.push({ ...entity, enrichment: null })
      }
    }

    return {
      entities: enriched,
      context: buildContextSummary(enriched),
      sources,
    }
  },

  promptBuilder: (enriched: EnrichedData) => {
    if (enriched.entities.length === 0) return ''

    const sections: string[] = ['## Detected Development Context\n']

    const tickets = enriched.entities.filter((e) => e.type === 'ticket')
    if (tickets.length > 0) {
      sections.push('### Referenced Tickets')
      tickets.forEach((t) => {
        const e = t.enrichment as {
          title?: string
          status?: string
        } | null
        if (e) {
          sections.push(`- **${t.value}**: ${e.title} (${e.status})`)
        } else {
          sections.push(`- **${t.value}**: (details unavailable)`)
        }
      })
    }

    const errors = enriched.entities.filter((e) => e.type === 'error')
    if (errors.length > 0) {
      sections.push('\n### Detected Errors')
      errors.forEach((e) => {
        sections.push(`- \`${e.value}\``)
      })
    }

    return sections.join('\n')
  },

  mandatoryTools: ['search_knowledge_base', 'search_skills'],
}

// ============================================================================
// Security Research Domain
// ============================================================================

// Mock NVD API (replace with real implementation)
const nvdApi = {
  getCVE: async (
    cveId: string
  ): Promise<{
    descriptions: Array<{ value: string }>
    metrics?: {
      cvssMetricV31?: Array<{
        cvssData: { baseSeverity: string; baseScore: number }
      }>
    }
    references?: Array<{ url: string }>
  }> => ({
    descriptions: [{ value: `Description for ${cveId}` }],
    metrics: {
      cvssMetricV31: [
        { cvssData: { baseSeverity: 'HIGH', baseScore: 7.5 } },
      ],
    },
    references: [{ url: 'https://example.com/ref' }],
  }),
}

// Mock MITRE ATT&CK API
const mitreApi = {
  getTechnique: async (
    techniqueId: string
  ): Promise<{
    name: string
    tactic: string
    description?: string
  }> => ({
    name: `Technique ${techniqueId}`,
    tactic: 'Initial Access',
    description: `Description of technique ${techniqueId}`,
  }),
}

export const securityResearchPipeline: DomainPipeline = {
  name: 'security-research',
  description: 'Detects security research patterns: CVEs, CWEs, attack techniques',

  patterns: [
    // CVE identifiers
    /CVE-\d{4}-\d{4,}/gi,
    // CWE references
    /CWE-\d+/gi,
    // MITRE ATT&CK
    /T\d{4}(\.\d{3})?/g,
    // IP addresses
    /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    // Hash patterns (MD5, SHA1, SHA256)
    /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/g,
  ],

  extractor: async (text: string) => {
    const entities: ExtractedEntity[] = []

    // Extract CVEs
    const cvePattern = /CVE-\d{4}-\d{4,}/gi
    let match: RegExpExecArray | null
    while ((match = cvePattern.exec(text)) !== null) {
      entities.push({
        type: 'cve',
        value: match[0].toUpperCase(),
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 1.0,
      })
    }

    // Extract CWEs
    const cwePattern = /CWE-\d+/gi
    while ((match = cwePattern.exec(text)) !== null) {
      entities.push({
        type: 'cwe',
        value: match[0].toUpperCase(),
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 1.0,
      })
    }

    // Extract MITRE ATT&CK techniques
    const attackPattern = /T\d{4}(\.\d{3})?/g
    while ((match = attackPattern.exec(text)) !== null) {
      entities.push({
        type: 'attack_technique',
        value: match[0],
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 0.95,
      })
    }

    // Extract hashes
    const hashPattern =
      /\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/g
    while ((match = hashPattern.exec(text)) !== null) {
      const hashLength = match[0].length
      const hashType =
        hashLength === 32 ? 'md5' : hashLength === 40 ? 'sha1' : 'sha256'
      entities.push({
        type: 'hash',
        value: match[0].toLowerCase(),
        position: { start: match.index, end: match.index + match[0].length },
        confidence: 0.8,
        // Additional metadata stored in value prefix
      })
    }

    return entities
  },

  enricher: async (entities: ExtractedEntity[]) => {
    const enriched: EnrichedEntity[] = []
    const sources: string[] = []

    for (const entity of entities) {
      if (entity.type === 'cve') {
        try {
          const cve = await nvdApi.getCVE(entity.value)
          enriched.push({
            ...entity,
            enrichment: {
              description: cve.descriptions[0]?.value,
              severity: cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity,
              score: cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore,
              references: cve.references?.slice(0, 3),
            },
          })
          sources.push('NVD')
        } catch {
          enriched.push({ ...entity, enrichment: null })
        }
      } else if (entity.type === 'attack_technique') {
        try {
          const technique = await mitreApi.getTechnique(entity.value)
          enriched.push({
            ...entity,
            enrichment: {
              name: technique.name,
              tactic: technique.tactic,
              description: technique.description?.slice(0, 200),
            },
          })
          sources.push('MITRE ATT&CK')
        } catch {
          enriched.push({ ...entity, enrichment: null })
        }
      } else {
        enriched.push({ ...entity, enrichment: null })
      }
    }

    return {
      entities: enriched,
      context: '',
      sources: [...new Set(sources)],
    }
  },

  promptBuilder: (enriched: EnrichedData) => {
    const parts: string[] = ['## Security Research Context\n']

    const cves = enriched.entities.filter((e) => e.type === 'cve')
    if (cves.length > 0) {
      parts.push('### CVE Analysis')
      cves.forEach((c) => {
        const e = c.enrichment as {
          severity?: string
          score?: number
          description?: string
        } | null
        if (e) {
          parts.push(`- **${c.value}** (${e.severity}, CVSS ${e.score})`)
          if (e.description) {
            parts.push(`  ${e.description.slice(0, 150)}...`)
          }
        } else {
          parts.push(`- **${c.value}** (details unavailable)`)
        }
      })
    }

    const techniques = enriched.entities.filter(
      (e) => e.type === 'attack_technique'
    )
    if (techniques.length > 0) {
      parts.push('\n### MITRE ATT&CK Techniques')
      techniques.forEach((t) => {
        const e = t.enrichment as {
          name?: string
          tactic?: string
        } | null
        if (e) {
          parts.push(`- **${t.value}**: ${e.name} (${e.tactic})`)
        } else {
          parts.push(`- **${t.value}**`)
        }
      })
    }

    const hashes = enriched.entities.filter((e) => e.type === 'hash')
    if (hashes.length > 0) {
      parts.push('\n### Detected Hashes')
      hashes.forEach((h) => {
        parts.push(`- \`${h.value}\``)
      })
    }

    return parts.join('\n')
  },

  mandatoryTools: ['search_knowledge_base'],
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildContextSummary(entities: EnrichedEntity[]): string {
  const parts: string[] = []

  const byType = new Map<string, EnrichedEntity[]>()
  entities.forEach((e) => {
    const list = byType.get(e.type) || []
    list.push(e)
    byType.set(e.type, list)
  })

  for (const [type, list] of byType) {
    parts.push(`${type}: ${list.map((e) => e.value).join(', ')}`)
  }

  return parts.join('\n')
}

// ============================================================================
// Domain Pipeline Registry
// ============================================================================

export function createDefaultDetector(): DomainDetector {
  const detector = new DomainDetector()
  detector.register(softwareDevelopmentPipeline)
  detector.register(securityResearchPipeline)
  return detector
}

/**
 * Process text through domain pipelines
 */
export async function processDomainContext(
  text: string,
  detector: DomainDetector
): Promise<{
  detectedDomains: string[]
  enrichedContext: string
  mandatoryTools: string[]
  sources: string[]
}> {
  const detection = detector.detect(text)

  if (!detection.detected) {
    return {
      detectedDomains: [],
      enrichedContext: '',
      mandatoryTools: [],
      sources: [],
    }
  }

  const allEnrichedContext: string[] = []
  const allMandatoryTools: string[] = []
  const allSources: string[] = []

  for (const domainName of detection.domains) {
    const pipeline = detector.getPipeline(domainName)
    if (!pipeline) continue

    // Extract entities
    const entities = await pipeline.extractor(text)

    // Enrich entities
    const enriched = await pipeline.enricher(entities)

    // Build prompt context
    const context = pipeline.promptBuilder(enriched)
    if (context) {
      allEnrichedContext.push(context)
    }

    // Collect mandatory tools
    if (pipeline.mandatoryTools) {
      allMandatoryTools.push(...pipeline.mandatoryTools)
    }

    // Collect sources
    allSources.push(...enriched.sources)
  }

  return {
    detectedDomains: detection.domains,
    enrichedContext: allEnrichedContext.join('\n\n'),
    mandatoryTools: [...new Set(allMandatoryTools)],
    sources: [...new Set(allSources)],
  }
}
