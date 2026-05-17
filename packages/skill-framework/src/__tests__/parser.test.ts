// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Skill Body Parser Tests
 */

import { describe, it, expect } from 'vitest'
import { parseSkillBody, getAllSectionTitles, getSectionByPath } from '../parser.js'

describe('parseSkillBody', () => {
  const sampleMarkdown = `# Literature Review

## Process

### Phase 1: Scope the Review
Define your research question and search strategy.

1. Identify key terms
2. Define inclusion criteria
3. Select databases

### Phase 2: Build Corpus
Collect papers systematically.

## Anti-patterns to Flag

- Listing papers chronologically instead of thematically
- Generating fake citations
- Citing papers without reading them
- Ignoring seminal works

## Deliverables

- Structured corpus table
- Synthesis by theme
- Gap analysis document
- Research positioning statement

## Examples

\`\`\`python
def search_papers(query: str) -> list:
    return semantic_scholar.search(query)
\`\`\`

\`\`\`typescript
interface Paper {
  title: string;
  year: number;
  citations: number;
}
\`\`\`
`

  describe('section extraction', () => {
    it('extracts all top-level sections', () => {
      const result = parseSkillBody(sampleMarkdown)

      expect(result.sections.length).toBe(1) // One H1
      expect(result.sections[0].title).toBe('Literature Review')
      expect(result.sections[0].subsections.length).toBe(4) // Process, Anti-patterns, Deliverables, Examples
    })

    it('builds nested section structure', () => {
      const result = parseSkillBody(sampleMarkdown)

      const processSection = result.sections[0].subsections.find(
        (s) => s.title === 'Process'
      )

      expect(processSection).toBeDefined()
      expect(processSection?.subsections.length).toBe(2) // Phase 1, Phase 2
      expect(processSection?.subsections[0].title).toBe('Phase 1: Scope the Review')
    })

    it('preserves section content', () => {
      const result = parseSkillBody(sampleMarkdown)

      const phase1 = result.sections[0].subsections[0].subsections[0]
      expect(phase1.content).toContain('Define your research question')
      expect(phase1.content).toContain('1. Identify key terms')
    })
  })

  describe('anti-patterns extraction', () => {
    it('extracts anti-patterns list items', () => {
      const result = parseSkillBody(sampleMarkdown)

      expect(result.antiPatterns.length).toBe(4)
      expect(result.antiPatterns).toContain(
        'Listing papers chronologically instead of thematically'
      )
      expect(result.antiPatterns).toContain('Generating fake citations')
    })

    it('returns empty array when no anti-patterns section', () => {
      const noAntiPatterns = `# Simple Skill

## Process
Do something.
`
      const result = parseSkillBody(noAntiPatterns)
      expect(result.antiPatterns).toEqual([])
    })

    it('finds anti-patterns with alternate titles', () => {
      const altTitle = `# Skill

## Pitfalls to Avoid
- First pitfall
- Second pitfall
`
      const result = parseSkillBody(altTitle)
      expect(result.antiPatterns.length).toBe(2)
    })
  })

  describe('deliverables extraction', () => {
    it('extracts deliverables list items', () => {
      const result = parseSkillBody(sampleMarkdown)

      expect(result.deliverables.length).toBe(4)
      expect(result.deliverables).toContain('Structured corpus table')
      expect(result.deliverables).toContain('Gap analysis document')
    })

    it('finds deliverables with alternate titles', () => {
      const altTitle = `# Skill

## Outputs
- Output one
- Output two
`
      const result = parseSkillBody(altTitle)
      expect(result.deliverables.length).toBe(2)
    })
  })

  describe('code examples extraction', () => {
    it('extracts code blocks with language', () => {
      const result = parseSkillBody(sampleMarkdown)

      expect(result.examples.length).toBe(2)
      expect(result.examples[0].language).toBe('python')
      expect(result.examples[1].language).toBe('typescript')
    })

    it('preserves code content', () => {
      const result = parseSkillBody(sampleMarkdown)

      expect(result.examples[0].code).toContain('def search_papers')
      expect(result.examples[1].code).toContain('interface Paper')
    })

    it('handles code blocks without language', () => {
      const noLang = `# Skill

\`\`\`
plain code block
\`\`\`
`
      const result = parseSkillBody(noLang)
      expect(result.examples.length).toBe(1)
      expect(result.examples[0].language).toBe('text')
    })
  })

  describe('raw content', () => {
    it('preserves raw markdown content', () => {
      const result = parseSkillBody(sampleMarkdown)
      expect(result.rawContent).toBe(sampleMarkdown)
    })
  })
})

describe('getAllSectionTitles', () => {
  it('returns flat list of all section titles', () => {
    const result = parseSkillBody(`# Top Level

## Section A

### Subsection A1

### Subsection A2

## Section B
`)

    const titles = getAllSectionTitles(result.sections)

    expect(titles).toEqual([
      'Top Level',
      'Section A',
      'Subsection A1',
      'Subsection A2',
      'Section B',
    ])
  })
})

describe('getSectionByPath', () => {
  const markdown = `# Root

## Process

### Phase 1
Content of phase 1.

### Phase 2
Content of phase 2.

## Results
Final results.
`

  it('finds section by exact path', () => {
    const result = parseSkillBody(markdown)
    const section = getSectionByPath(result.sections, 'Root/Process/Phase 1')

    expect(section).toBeDefined()
    expect(section?.title).toBe('Phase 1')
    expect(section?.content).toContain('Content of phase 1')
  })

  it('returns undefined for non-existent path', () => {
    const result = parseSkillBody(markdown)
    const section = getSectionByPath(result.sections, 'Root/NonExistent')

    expect(section).toBeUndefined()
  })

  it('handles case insensitivity', () => {
    const result = parseSkillBody(markdown)
    const section = getSectionByPath(result.sections, 'root/process/phase 1')

    expect(section).toBeDefined()
  })
})
