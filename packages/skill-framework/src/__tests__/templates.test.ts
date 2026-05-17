// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Templates System Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  TemplateManager,
  ExperimentLogSchema,
  CorpusEntrySchema,
  ThreatEntrySchema,
  generateExperimentId,
  parseMarkdownTable,
} from '../templates.js'

describe('TemplateManager', () => {
  let manager: TemplateManager

  beforeEach(() => {
    manager = new TemplateManager()
  })

  describe('registration', () => {
    it('has built-in templates registered', () => {
      const templates = manager.list()

      expect(templates).toContain('experiment-log')
      expect(templates).toContain('corpus-table')
      expect(templates).toContain('stride-table')
    })

    it('retrieves template by name', () => {
      const template = manager.get('experiment-log')

      expect(template).toBeDefined()
      expect(template?.name).toBe('experiment-log')
      expect(template?.format).toBe('markdown')
    })
  })

  describe('validation', () => {
    it('validates against schema', () => {
      const validExperiment = {
        id: 'exp-20240115-test',
        hypothesis: 'Removing X will decrease Y by 5%',
        status: 'planned',
        setup: {
          dataset: { name: 'TestSet' },
          model: { architecture: 'ResNet' },
          baselines: [{ name: 'Baseline', justification: 'Standard' }],
          hyperparameters: [{ name: 'lr', value: '0.001' }],
          seeds: [42, 123, 456],
          compute: { hardware: '4x A100' },
        },
        threatsToValidity: ['Test not contaminated'],
        artifacts: {},
      }

      const result = manager.validate('experiment-log', validExperiment)
      expect(result.valid).toBe(true)
    })

    it('returns errors for invalid data', () => {
      const invalidExperiment = {
        id: 'bad-id', // Wrong format
        hypothesis: 'short', // Too short
      }

      const result = manager.validate('experiment-log', invalidExperiment)

      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('returns error for non-existent template', () => {
      const result = manager.validate('non-existent', {})

      expect(result.valid).toBe(false)
      expect(result.errors?.[0]).toContain('not found')
    })
  })

  describe('examples', () => {
    it('returns template example', () => {
      const example = manager.getExample('experiment-log')

      expect(example).toBeDefined()
      expect(example).toContain('exp-')
      expect(example).toContain('Hypothesis')
    })
  })
})

describe('ExperimentLogSchema', () => {
  it('validates correct experiment ID format', () => {
    const valid = { id: 'exp-20240115-my-experiment' }
    const invalid = { id: 'experiment-123' }

    expect(ExperimentLogSchema.shape.id.safeParse(valid.id).success).toBe(true)
    expect(ExperimentLogSchema.shape.id.safeParse(invalid.id).success).toBe(false)
  })

  it('requires minimum 3 seeds', () => {
    const valid = { seeds: [1, 2, 3] }
    const invalid = { seeds: [1, 2] }

    expect(
      ExperimentLogSchema.shape.setup.shape.seeds.safeParse(valid.seeds).success
    ).toBe(true)
    expect(
      ExperimentLogSchema.shape.setup.shape.seeds.safeParse(invalid.seeds).success
    ).toBe(false)
  })

  it('validates status enum', () => {
    expect(ExperimentLogSchema.shape.status.safeParse('planned').success).toBe(true)
    expect(ExperimentLogSchema.shape.status.safeParse('running').success).toBe(true)
    expect(ExperimentLogSchema.shape.status.safeParse('complete').success).toBe(true)
    expect(ExperimentLogSchema.shape.status.safeParse('abandoned').success).toBe(true)
    expect(ExperimentLogSchema.shape.status.safeParse('invalid').success).toBe(false)
  })
})

describe('CorpusEntrySchema', () => {
  it('validates corpus entry', () => {
    const valid = {
      id: 1,
      citationKey: 'smith2020',
      year: 2020,
      venue: 'NeurIPS',
      type: 'empirical',
      keyClaim: 'SOTA results',
      status: '[READ]',
    }

    expect(CorpusEntrySchema.safeParse(valid).success).toBe(true)
  })

  it('validates type enum', () => {
    const types = ['empirical', 'theoretical', 'survey', 'SoK', 'position', 'tool']

    for (const type of types) {
      expect(CorpusEntrySchema.shape.type.safeParse(type).success).toBe(true)
    }

    expect(CorpusEntrySchema.shape.type.safeParse('invalid').success).toBe(false)
  })

  it('validates status enum', () => {
    expect(CorpusEntrySchema.shape.status.safeParse('[READ]').success).toBe(true)
    expect(CorpusEntrySchema.shape.status.safeParse('[NOT READ]').success).toBe(true)
    expect(CorpusEntrySchema.shape.status.safeParse('read').success).toBe(false)
  })
})

describe('ThreatEntrySchema', () => {
  it('validates STRIDE threat', () => {
    const valid = {
      threat: 'Spoofing',
      property: 'Authentication',
      attackScenario: 'Attacker forges token',
      likelihood: 'Medium',
      impact: 'High',
      mitigation: 'Verify signature',
    }

    expect(ThreatEntrySchema.safeParse(valid).success).toBe(true)
  })

  it('validates threat enum', () => {
    const threats = [
      'Spoofing',
      'Tampering',
      'Repudiation',
      'Info Disclosure',
      'DoS',
      'Elevation',
    ]

    for (const threat of threats) {
      expect(ThreatEntrySchema.shape.threat.safeParse(threat).success).toBe(true)
    }
  })

  it('validates likelihood and impact enums', () => {
    const levels = ['Low', 'Medium', 'High']

    for (const level of levels) {
      expect(ThreatEntrySchema.shape.likelihood.safeParse(level).success).toBe(true)
      expect(ThreatEntrySchema.shape.impact.safeParse(level).success).toBe(true)
    }
  })
})

describe('generateExperimentId', () => {
  it('generates correct format', () => {
    const id = generateExperimentId('My Test Experiment')

    expect(id).toMatch(/^exp-\d{8}-my-test-experiment$/)
  })

  it('handles special characters', () => {
    const id = generateExperimentId('Test! @#$ Experiment')

    // After removing special chars, multiple dashes may remain
    expect(id).toMatch(/^exp-\d{8}-test[-]*experiment$/)
  })

  it('uses current date', () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const id = generateExperimentId('test')

    expect(id).toContain(today)
  })
})

describe('parseMarkdownTable', () => {
  it('parses markdown table', () => {
    const table = `
| Name | Year | Status |
|------|------|--------|
| Smith | 2020 | [READ] |
| Jones | 2021 | [NOT READ] |
`
    const rows = parseMarkdownTable(table)

    expect(rows.length).toBe(2)
    expect(rows[0].Name).toBe('Smith')
    expect(rows[0].Year).toBe('2020')
    expect(rows[1].Status).toBe('[NOT READ]')
  })

  it('handles empty table', () => {
    const rows = parseMarkdownTable('')
    expect(rows).toEqual([])
  })

  it('handles table with only header', () => {
    const table = `
| Name | Year |
|------|------|
`
    const rows = parseMarkdownTable(table)
    expect(rows).toEqual([])
  })
})
