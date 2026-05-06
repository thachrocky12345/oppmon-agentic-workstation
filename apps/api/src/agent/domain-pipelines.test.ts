/**
 * Domain Pipelines Tests
 *
 * Tests for domain detection, extraction, enrichment, and prompt building.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DomainDetector,
  softwareDevelopmentPipeline,
  securityResearchPipeline,
  createDefaultDetector,
  processDomainContext,
  type DomainPipeline,
} from './domain-pipelines'

describe('DomainDetector', () => {
  let detector: DomainDetector

  beforeEach(() => {
    detector = new DomainDetector()
  })

  it('detects single domain', () => {
    detector.register(softwareDevelopmentPipeline)

    const result = detector.detect('Fix JIRA-123 ticket')

    expect(result.detected).toBe(true)
    expect(result.domains).toContain('software-development')
  })

  it('detects multiple domains', () => {
    detector.register(softwareDevelopmentPipeline)
    detector.register(securityResearchPipeline)

    const result = detector.detect(
      'Check CVE-2024-1234 related to OPPMON-567 ticket'
    )

    expect(result.detected).toBe(true)
    expect(result.domains).toContain('software-development')
    expect(result.domains).toContain('security-research')
  })

  it('ranks by match count', () => {
    detector.register(softwareDevelopmentPipeline)
    detector.register(securityResearchPipeline)

    // More security matches than dev matches
    const result = detector.detect(
      'CVE-2024-1234 CVE-2024-5678 CVE-2024-9999 and JIRA-1'
    )

    expect(result.detected).toBe(true)
    // Security should be first (3 CVEs vs 1 ticket)
    expect(result.domains[0]).toBe('security-research')
  })

  it('returns not detected when no patterns match', () => {
    detector.register(softwareDevelopmentPipeline)

    const result = detector.detect('Hello world, how are you?')

    expect(result.detected).toBe(false)
    expect(result.domains).toHaveLength(0)
  })

  it('caches detection results', () => {
    detector.register(softwareDevelopmentPipeline)

    const text = 'Fix JIRA-123 ticket'
    const result1 = detector.detect(text)
    const result2 = detector.detect(text)

    // Same reference means cache hit
    expect(result1).toBe(result2)
  })
})

describe('Software Development Pipeline', () => {
  describe('extractor', () => {
    it('extracts ticket refs', async () => {
      const text = 'Working on JIRA-123 and OPPMON-456'

      const entities = await softwareDevelopmentPipeline.extractor(text)

      const tickets = entities.filter((e) => e.type === 'ticket')
      expect(tickets).toHaveLength(2)
      expect(tickets[0].value).toBe('JIRA-123')
      expect(tickets[1].value).toBe('OPPMON-456')
    })

    it('extracts error messages', async () => {
      const text = 'Got Error: Cannot read property of undefined'

      const entities = await softwareDevelopmentPipeline.extractor(text)

      const errors = entities.filter((e) => e.type === 'error')
      expect(errors).toHaveLength(1)
      expect(errors[0].value).toBe('Cannot read property of undefined')
    })

    it('extracts GitHub URLs', async () => {
      const text = 'See github.com/org/repo/issues/123'

      const entities = await softwareDevelopmentPipeline.extractor(text)

      const refs = entities.filter((e) => e.type === 'github_ref')
      expect(refs).toHaveLength(1)
    })
  })

  describe('enricher', () => {
    it('enriches from JIRA', async () => {
      const entities = [
        {
          type: 'ticket',
          value: 'JIRA-123',
          position: { start: 0, end: 8 },
          confidence: 1.0,
        },
      ]

      const enriched = await softwareDevelopmentPipeline.enricher(entities)

      expect(enriched.entities[0].enrichment).toBeDefined()
      expect(enriched.sources).toContain('JIRA: JIRA-123')
    })
  })

  describe('promptBuilder', () => {
    it('builds augmented prompt', () => {
      const enriched = {
        entities: [
          {
            type: 'ticket',
            value: 'JIRA-123',
            position: { start: 0, end: 8 },
            confidence: 1.0,
            enrichment: {
              title: 'Fix login bug',
              status: 'In Progress',
            },
          },
          {
            type: 'error',
            value: 'TypeError: null is not an object',
            position: { start: 20, end: 50 },
            confidence: 0.9,
            enrichment: null,
          },
        ],
        context: '',
        sources: [],
      }

      const prompt = softwareDevelopmentPipeline.promptBuilder(enriched)

      expect(prompt).toContain('## Detected Development Context')
      expect(prompt).toContain('JIRA-123')
      expect(prompt).toContain('Fix login bug')
      expect(prompt).toContain('In Progress')
      expect(prompt).toContain('TypeError: null is not an object')
    })
  })
})

describe('Security Research Pipeline', () => {
  describe('extractor', () => {
    it('extracts CVEs', async () => {
      const text = 'Investigating CVE-2024-1234 and CVE-2023-56789'

      const entities = await securityResearchPipeline.extractor(text)

      const cves = entities.filter((e) => e.type === 'cve')
      expect(cves).toHaveLength(2)
      expect(cves[0].value).toBe('CVE-2024-1234')
    })

    it('extracts MITRE ATT&CK techniques', async () => {
      const text = 'Uses T1566 for initial access'

      const entities = await securityResearchPipeline.extractor(text)

      const techniques = entities.filter((e) => e.type === 'attack_technique')
      expect(techniques).toHaveLength(1)
      expect(techniques[0].value).toBe('T1566')
    })

    it('extracts hashes', async () => {
      const text = 'Hash: d41d8cd98f00b204e9800998ecf8427e' // MD5

      const entities = await securityResearchPipeline.extractor(text)

      const hashes = entities.filter((e) => e.type === 'hash')
      expect(hashes).toHaveLength(1)
    })

    it('extracts CWEs', async () => {
      const text = 'Related to CWE-79 and CWE-89'

      const entities = await securityResearchPipeline.extractor(text)

      const cwes = entities.filter((e) => e.type === 'cwe')
      expect(cwes).toHaveLength(2)
    })
  })

  describe('enricher', () => {
    it('enriches from NVD', async () => {
      const entities = [
        {
          type: 'cve',
          value: 'CVE-2024-1234',
          position: { start: 0, end: 13 },
          confidence: 1.0,
        },
      ]

      const enriched = await securityResearchPipeline.enricher(entities)

      expect(enriched.entities[0].enrichment).toBeDefined()
      expect(enriched.sources).toContain('NVD')
    })

    it('enriches from MITRE ATT&CK', async () => {
      const entities = [
        {
          type: 'attack_technique',
          value: 'T1566',
          position: { start: 0, end: 5 },
          confidence: 0.95,
        },
      ]

      const enriched = await securityResearchPipeline.enricher(entities)

      expect(enriched.entities[0].enrichment).toBeDefined()
      expect(enriched.sources).toContain('MITRE ATT&CK')
    })
  })

  describe('promptBuilder', () => {
    it('builds security context', () => {
      const enriched = {
        entities: [
          {
            type: 'cve',
            value: 'CVE-2024-1234',
            position: { start: 0, end: 13 },
            confidence: 1.0,
            enrichment: {
              severity: 'HIGH',
              score: 7.5,
              description: 'A critical vulnerability...',
            },
          },
        ],
        context: '',
        sources: ['NVD'],
      }

      const prompt = securityResearchPipeline.promptBuilder(enriched)

      expect(prompt).toContain('## Security Research Context')
      expect(prompt).toContain('CVE-2024-1234')
      expect(prompt).toContain('HIGH')
      expect(prompt).toContain('7.5')
    })
  })
})

describe('processDomainContext', () => {
  it('processes multi-domain detection', async () => {
    const detector = createDefaultDetector()

    const result = await processDomainContext(
      'Check CVE-2024-1234 related to JIRA-567',
      detector
    )

    expect(result.detectedDomains.length).toBeGreaterThanOrEqual(1)
    expect(result.enrichedContext).toBeTruthy()
    expect(result.mandatoryTools.length).toBeGreaterThan(0)
  })

  it('returns empty for undetected domains', async () => {
    const detector = createDefaultDetector()

    const result = await processDomainContext('Hello world', detector)

    expect(result.detectedDomains).toHaveLength(0)
    expect(result.enrichedContext).toBe('')
    expect(result.mandatoryTools).toHaveLength(0)
  })

  it('collects mandatory tools', async () => {
    const detector = createDefaultDetector()

    const result = await processDomainContext('Fix OPPMON-123 bug', detector)

    expect(result.mandatoryTools).toContain('search_knowledge_base')
    expect(result.mandatoryTools).toContain('search_skills')
  })
})

describe('Pattern Safety', () => {
  it('handles regex without catastrophic backtracking', () => {
    const detector = createDefaultDetector()

    // Long string that could cause backtracking in bad patterns
    const longString = 'a'.repeat(10000)

    const start = Date.now()
    detector.detect(longString)
    const duration = Date.now() - start

    // Should complete quickly (< 100ms)
    expect(duration).toBeLessThan(100)
  })
})
