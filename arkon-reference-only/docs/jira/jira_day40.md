# TAG-40: Domain-Specific Preprocessing Pipelines

## Description

**Suggested Points:** 8 (High — implementing domain detection and enrichment patterns from agent-research-assistant's genetics pipeline; extensible framework for team-specific domains)

## Objective

Implement a domain-specific preprocessing framework inspired by the genetics pipeline from agent-research-assistant, enabling teams to define custom pattern detection, entity extraction, external API enrichment, and prompt augmentation for their specific domains.

## Requirements

### Domain Pipeline Framework

```typescript
interface DomainPipeline {
  name: string
  description: string

  // Pattern detection
  patterns: RegExp[]

  // Entity extraction from detected content
  extractor: (text: string) => Promise<ExtractedEntity[]>

  // External API enrichment
  enricher: (entities: ExtractedEntity[]) => Promise<EnrichedData>

  // System prompt augmentation
  promptBuilder: (enriched: EnrichedData) => string

  // Mandatory tool injection (optional)
  mandatoryTools?: string[]
}

interface ExtractedEntity {
  type: string
  value: string
  position: { start: number; end: number }
  confidence: number
}

interface EnrichedData {
  entities: EnrichedEntity[]
  context: string
  sources: string[]
}
```

### Pattern Detection System

```typescript
// Pattern registry for domain detection
class DomainDetector {
  private domains: Map<string, DomainPipeline> = new Map()

  register(pipeline: DomainPipeline): void {
    this.domains.set(pipeline.name, pipeline)
  }

  detect(text: string): DetectionResult {
    const results: DomainMatch[] = []

    for (const [name, pipeline] of this.domains) {
      for (const pattern of pipeline.patterns) {
        const matches = text.matchAll(pattern)
        for (const match of matches) {
          results.push({
            domain: name,
            pattern: pattern.source,
            match: match[0],
            position: match.index!,
          })
        }
      }
    }

    if (results.length === 0) {
      return { detected: false, domains: [] }
    }

    // Group by domain, sort by match count
    const domainCounts = new Map<string, number>()
    results.forEach(r => {
      domainCounts.set(r.domain, (domainCounts.get(r.domain) || 0) + 1)
    })

    const sortedDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([domain]) => domain)

    return {
      detected: true,
      domains: sortedDomains,
      matches: results,
    }
  }
}
```

### Example: Software Development Domain

```typescript
const softwareDevelopmentPipeline: DomainPipeline = {
  name: 'software-development',
  description: 'Detects software development patterns: issues, PRs, errors',

  patterns: [
    // Issue/ticket references
    /\b(JIRA|RGDEV|TAG|ISSUE)-\d+\b/gi,
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
    const ticketPattern = /\b(JIRA|RGDEV|TAG|ISSUE)-(\d+)\b/gi
    for (const match of text.matchAll(ticketPattern)) {
      entities.push({
        type: 'ticket',
        value: match[0],
        position: { start: match.index!, end: match.index! + match[0].length },
        confidence: 1.0,
      })
    }

    // Extract error messages
    const errorPattern = /\b(Error|Exception):\s*(.+?)(?:\n|$)/gi
    for (const match of text.matchAll(errorPattern)) {
      entities.push({
        type: 'error',
        value: match[2],
        position: { start: match.index!, end: match.index! + match[0].length },
        confidence: 0.9,
      })
    }

    return entities
  },

  enricher: async (entities: ExtractedEntity[]) => {
    const enriched: EnrichedEntity[] = []
    const sources: string[] = []

    for (const entity of entities) {
      if (entity.type === 'ticket') {
        // Fetch ticket details from JIRA API
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
        } catch (e) {
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

    const tickets = enriched.entities.filter(e => e.type === 'ticket')
    if (tickets.length > 0) {
      sections.push('### Referenced Tickets')
      tickets.forEach(t => {
        const e = t.enrichment
        if (e) {
          sections.push(`- **${t.value}**: ${e.title} (${e.status})`)
        } else {
          sections.push(`- **${t.value}**: (details unavailable)`)
        }
      })
    }

    const errors = enriched.entities.filter(e => e.type === 'error')
    if (errors.length > 0) {
      sections.push('\n### Detected Errors')
      errors.forEach(e => {
        sections.push(`- \`${e.value}\``)
      })
    }

    return sections.join('\n')
  },

  mandatoryTools: ['search_knowledge_base', 'search_skills'],
}
```

### Example: Security Research Domain

```typescript
const securityResearchPipeline: DomainPipeline = {
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
    for (const match of text.matchAll(cvePattern)) {
      entities.push({
        type: 'cve',
        value: match[0].toUpperCase(),
        position: { start: match.index!, end: match.index! + match[0].length },
        confidence: 1.0,
      })
    }

    // Extract MITRE ATT&CK techniques
    const attackPattern = /T\d{4}(\.\d{3})?/g
    for (const match of text.matchAll(attackPattern)) {
      entities.push({
        type: 'attack_technique',
        value: match[0],
        position: { start: match.index!, end: match.index! + match[0].length },
        confidence: 0.95,
      })
    }

    return entities
  },

  enricher: async (entities: ExtractedEntity[]) => {
    const enriched: EnrichedEntity[] = []

    for (const entity of entities) {
      if (entity.type === 'cve') {
        // Fetch CVE details from NVD API
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
      } else if (entity.type === 'attack_technique') {
        // Fetch from MITRE ATT&CK
        const technique = await mitreApi.getTechnique(entity.value)
        enriched.push({
          ...entity,
          enrichment: {
            name: technique.name,
            tactic: technique.tactic,
            description: technique.description?.slice(0, 200),
          },
        })
      }
    }

    return { entities: enriched, context: '', sources: ['NVD', 'MITRE ATT&CK'] }
  },

  promptBuilder: (enriched: EnrichedData) => {
    // Build security-focused context
    const parts: string[] = ['## Security Research Context\n']

    const cves = enriched.entities.filter(e => e.type === 'cve')
    if (cves.length > 0) {
      parts.push('### CVE Analysis')
      cves.forEach(c => {
        if (c.enrichment) {
          parts.push(`- **${c.value}** (${c.enrichment.severity}, CVSS ${c.enrichment.score})`)
          parts.push(`  ${c.enrichment.description?.slice(0, 150)}...`)
        }
      })
    }

    return parts.join('\n')
  },
}
```

## Implementation Notes
- Backend: New `packages/agent-domains/` package
- Frontend: Domain detection indicators in chat UI
- CLI: Domain testing commands
- Database: External API caching

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/agent-domains/src/__tests__/detector.test.ts` | `detects single domain` | Domain identified |
| `packages/agent-domains/src/__tests__/detector.test.ts` | `detects multiple domains` | All detected |
| `packages/agent-domains/src/__tests__/detector.test.ts` | `ranks by match count` | Most matches first |
| `packages/agent-domains/src/__tests__/software.test.ts` | `extracts ticket refs` | Entities found |
| `packages/agent-domains/src/__tests__/software.test.ts` | `enriches from JIRA` | Details fetched |
| `packages/agent-domains/src/__tests__/security.test.ts` | `extracts CVEs` | CVEs found |
| `packages/agent-domains/src/__tests__/security.test.ts` | `enriches from NVD` | Details fetched |
| `packages/agent-domains/src/__tests__/prompt.test.ts` | `builds augmented prompt` | Sections correct |

### Test Coverage Requirements
- All domain pipelines tested
- External API mocking for enrichment
- Prompt building verified

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `ticket detection + enrichment` | JIRA mock | 1. Message with "RGDEV-123" | Ticket details in context |
| `CVE detection + enrichment` | NVD mock | 1. Message with "CVE-2024-1234" | CVE details in context |
| `multi-domain detection` | Both mocks | 1. Message with ticket + CVE | Both domains processed |
| `mandatory tools injected` | Software domain | 1. Detect 2. Check tools | Tools added to call |
| `graceful API failure` | API error | 1. Detect 2. Enrichment fails | Continues without enrichment |

### End-to-End Flows
- User mentions CVE → Detected → NVD enrichment → Security context added → Tools suggested → Response

## Acceptance Criteria
1. Domain detector with regex pattern matching
2. Extensible pipeline framework for new domains
3. Entity extraction with position tracking
4. External API enrichment with caching
5. Prompt augmentation with domain context
6. Mandatory tool injection when domain detected
7. Graceful handling of API failures
8. At least 2 example domains implemented

## Review Checklist
- [ ] Are patterns efficient (no catastrophic backtracking)?
- [ ] Is external API caching implemented?
- [ ] Are API failures handled gracefully?
- [ ] Is the framework extensible for new domains?
- [ ] Are confidence scores meaningful?
- [ ] Is prompt augmentation within token limits?

## Dependencies
- Depends on: Day 36-38 (Agent infrastructure)
- Blocks: Day 41 (Integration)

## Risk Factors
- **Regex performance** — Mitigation: Test patterns, avoid backtracking
- **External API rate limits** — Mitigation: Caching, rate limiting
- **Over-detection** — Mitigation: Confidence thresholds, confirmation
- **Prompt bloat** — Mitigation: Limit enrichment length
