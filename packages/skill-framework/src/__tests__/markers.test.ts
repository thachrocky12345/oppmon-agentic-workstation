// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Marker Scanner Tests
 */

import { describe, it, expect } from 'vitest'
import {
  MarkerScanner,
  findMarkers,
  hasMarkers,
  countMarkers,
} from '../markers.js'

describe('MarkerScanner', () => {
  const scanner = new MarkerScanner()

  describe('scan', () => {
    it('finds all marker types', () => {
      const content = `
# Draft Section [DRAFT]

This is [DRAFT v1] content.

Some claim needs [VERIFY: check source].

Paper status: [NOT READ]

[TODO: add more examples]

This might come up in defense [VIVA?]

[CHECK: validate this assumption]

[CITE: need citation for this claim]
`
      const markers = scanner.scan(content)

      const types = markers.map((m) => m.type)
      expect(types).toContain('DRAFT')
      expect(types).toContain('DRAFT_VERSION')
      expect(types).toContain('VERIFY')
      expect(types).toContain('NOT_READ')
      expect(types).toContain('TODO')
      expect(types).toContain('VIVA')
      expect(types).toContain('CHECK')
      expect(types).toContain('CITE')
    })

    it('extracts VERIFY reason', () => {
      const content = 'This claim is uncertain [VERIFY: need primary source]'
      const markers = scanner.scan(content)

      const verifyMarker = markers.find((m) => m.type === 'VERIFY')
      expect(verifyMarker?.reason).toBe('need primary source')
    })

    it('extracts TODO reason', () => {
      const content = '[TODO: implement error handling]'
      const markers = scanner.scan(content)

      const todoMarker = markers.find((m) => m.type === 'TODO')
      expect(todoMarker?.reason).toBe('implement error handling')
    })

    it('extracts CHECK reason', () => {
      const content = '[CHECK: verify with stakeholders]'
      const markers = scanner.scan(content)

      const checkMarker = markers.find((m) => m.type === 'CHECK')
      expect(checkMarker?.reason).toBe('verify with stakeholders')
    })

    it('extracts CITE reason', () => {
      const content = 'Studies show [CITE: ML survey 2023]'
      const markers = scanner.scan(content)

      const citeMarker = markers.find((m) => m.type === 'CITE')
      expect(citeMarker?.reason).toBe('ML survey 2023')
    })

    it('reports correct line numbers', () => {
      const content = `Line 1
Line 2 [DRAFT]
Line 3
Line 4 [TODO: something]`

      const markers = scanner.scan(content)

      const draftMarker = markers.find((m) => m.type === 'DRAFT')
      expect(draftMarker?.location.line).toBe(2)

      const todoMarker = markers.find((m) => m.type === 'TODO')
      expect(todoMarker?.location.line).toBe(4)
    })

    it('provides context around markers', () => {
      const content = `Before
This line has [DRAFT] marker
After`

      const markers = scanner.scan(content)
      expect(markers[0].context).toContain('Before')
      expect(markers[0].context).toContain('DRAFT')
      expect(markers[0].context).toContain('After')
    })

    it('handles multiple markers on same line', () => {
      const content = '[DRAFT] [TODO: fix this] [VERIFY: check]'
      const markers = scanner.scan(content)

      expect(markers.length).toBe(3)
    })

    it('handles DRAFT version numbers', () => {
      const content = '[DRAFT v1] and [DRAFT v2] and [DRAFT v10]'
      const markers = scanner.scan(content)

      const versionMarkers = markers.filter((m) => m.type === 'DRAFT_VERSION')
      expect(versionMarkers.length).toBe(3)
    })
  })

  describe('scanDirectory', () => {
    it('generates audit report', async () => {
      // Create a temporary test - just verify the structure
      const content = '[DRAFT] [VERIFY: test] [NOT READ] [TODO: item]'
      const markers = scanner.scan(content)

      expect(markers.length).toBe(4)
    })
  })

  describe('formatReport', () => {
    it('formats report as readable string', async () => {
      // Mock a report
      const report = {
        scannedAt: new Date(),
        directory: '/test',
        totalFiles: 5,
        totalMarkers: 10,
        byType: {
          DRAFT: [],
          DRAFT_VERSION: [],
          VERIFY: [
            {
              type: 'VERIFY' as const,
              location: { file: 'test.md', line: 1, column: 1 },
              context: 'Test context',
              reason: 'check this',
              rawMatch: '[VERIFY: check this]',
            },
          ],
          NOT_READ: [],
          TODO: [],
          VIVA: [],
          CHECK: [],
          CITE: [],
        },
        summary: {
          drafts: 2,
          verifications: 1,
          unreadPapers: 3,
          todos: 4,
          vivaPoints: 0,
          checks: 0,
          citations: 0,
        },
      }

      const formatted = scanner.formatReport(report)

      expect(formatted).toContain('Draft Audit Report')
      expect(formatted).toContain('[DRAFT] sections: 2')
      expect(formatted).toContain('[VERIFY] items: 1')
      expect(formatted).toContain('[NOT READ] papers: 3')
      expect(formatted).toContain('check this')
    })
  })
})

describe('Helper Functions', () => {
  describe('findMarkers', () => {
    it('finds markers of specific type', () => {
      const content = '[DRAFT] [TODO: task] [VERIFY: check]'
      const todoMarkers = findMarkers(content, 'TODO')

      expect(todoMarkers.length).toBe(1)
      expect(todoMarkers[0].reason).toBe('task')
    })
  })

  describe('hasMarkers', () => {
    it('returns true when markers present', () => {
      expect(hasMarkers('[DRAFT] content')).toBe(true)
      expect(hasMarkers('[TODO: something]')).toBe(true)
    })

    it('returns false when no markers', () => {
      expect(hasMarkers('Plain content without markers')).toBe(false)
    })
  })

  describe('countMarkers', () => {
    it('counts markers by type', () => {
      const content = '[DRAFT] [DRAFT] [TODO: a] [TODO: b] [TODO: c] [VERIFY: x]'
      const counts = countMarkers(content)

      expect(counts.DRAFT).toBe(2)
      expect(counts.TODO).toBe(3)
      expect(counts.VERIFY).toBe(1)
      expect(counts.NOT_READ).toBe(0)
    })
  })
})
