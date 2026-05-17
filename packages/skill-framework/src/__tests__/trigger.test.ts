// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Trigger Matcher Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TriggerMatcher, SimpleKeywordMatcher, cosineSimilarity } from '../trigger.js'
import type { LoadedSkill, SkillFrontmatter, ParsedSkillBody } from '../types.js'

// Helper to create a mock skill
function createMockSkill(
  name: string,
  triggers: string[],
  tags: string[] = [],
  embedding?: number[]
): LoadedSkill {
  const frontmatter: SkillFrontmatter = {
    name,
    description: `Description for ${name} skill that helps with various tasks`,
    version: '1.0.0',
    author: 'test',
    category: 'development',
    triggers,
    tags,
  }

  const body: ParsedSkillBody = {
    sections: [],
    antiPatterns: [],
    deliverables: [],
    examples: [],
    rawContent: '',
  }

  return {
    path: `/skills/${name}/SKILL.md`,
    frontmatter,
    body,
    loadedAt: new Date(),
    embedding,
  }
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = [1, 2, 3]
    const b = [1, 2, 3]
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0]
    const b = [0, 1, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(0)
  })

  it('returns -1 for opposite vectors', () => {
    const a = [1, 2, 3]
    const b = [-1, -2, -3]
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1)
  })

  it('handles normalized vectors', () => {
    const a = [0.6, 0.8, 0]
    const b = [0.6, 0.8, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0)
  })

  it('throws for different length vectors', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow()
  })
})

describe('TriggerMatcher', () => {
  let matcher: TriggerMatcher

  beforeEach(() => {
    matcher = new TriggerMatcher()
  })

  describe('exact trigger matching', () => {
    it('matches exact trigger phrase', async () => {
      const skill = createMockSkill('literature-review', [
        'survey a field',
        'gap analysis',
        'literature review',
      ])

      await matcher.registerSkill(skill)

      const matches = await matcher.matchSkills('I need help with a literature review')

      expect(matches.length).toBeGreaterThan(0)
      expect(matches[0].skill).toBe('literature-review')
      expect(matches[0].confidence).toBe(1.0)
      expect(matches[0].matchType).toBe('exact')
      expect(matches[0].matchedTrigger).toBe('literature review')
    })

    it('matches case-insensitively', async () => {
      const skill = createMockSkill('test-skill', ['Run Tests', 'EXECUTE TESTS'])
      await matcher.registerSkill(skill)

      const matches = await matcher.matchSkills('I want to run tests')

      expect(matches.length).toBe(1)
      expect(matches[0].matchedTrigger).toBe('Run Tests')
    })

    it('matches partial phrases in message', async () => {
      const skill = createMockSkill('code-review', ['review code', 'check code'])
      await matcher.registerSkill(skill)

      const matches = await matcher.matchSkills(
        'Can you please review code for security issues?'
      )

      expect(matches.length).toBe(1)
    })
  })

  describe('tag matching', () => {
    it('matches by tag when no trigger match', async () => {
      const skill = createMockSkill('security-audit', ['audit security'], ['security', 'compliance'])
      await matcher.registerSkill(skill)

      const matches = await matcher.matchSkills('I need help with security')

      expect(matches.length).toBe(1)
      expect(matches[0].matchType).toBe('tag')
      expect(matches[0].matchedTag).toBe('security')
      expect(matches[0].confidence).toBeLessThan(1.0)
    })

    it('prefers trigger match over tag match', async () => {
      const skill = createMockSkill('security-audit', ['audit security'], ['security'])
      await matcher.registerSkill(skill)

      const matches = await matcher.matchSkills('audit security please')

      expect(matches.length).toBe(1)
      expect(matches[0].matchType).toBe('exact')
    })
  })

  describe('semantic matching', () => {
    it('matches semantically when embedding function provided', async () => {
      // Mock embedding function that returns similar embeddings for related terms
      const mockEmbed = vi.fn(async (text: string) => {
        if (text.includes('literature') || text.includes('survey') || text.includes('papers')) {
          return [0.9, 0.1, 0.1]
        }
        if (text.includes('test') || text.includes('verify')) {
          return [0.1, 0.9, 0.1]
        }
        return [0.33, 0.33, 0.33]
      })

      const semanticMatcher = new TriggerMatcher({}, mockEmbed)

      const litReviewSkill = createMockSkill('literature-review', ['literature review'])
      const testSkill = createMockSkill('testing', ['run tests'])

      await semanticMatcher.registerSkill(litReviewSkill)
      await semanticMatcher.registerSkill(testSkill)

      // Query about papers should match literature review
      const matches = await semanticMatcher.matchSkills('I need to review some papers')

      // Should have semantic match
      const semanticMatch = matches.find((m) => m.matchType === 'semantic')
      expect(semanticMatch).toBeDefined()
    })
  })

  describe('multiple skills', () => {
    it('returns top 3 matches sorted by confidence', async () => {
      const skill1 = createMockSkill('skill-a', ['trigger alpha'])
      const skill2 = createMockSkill('skill-b', ['trigger beta'])
      const skill3 = createMockSkill('skill-c', ['trigger gamma'])
      const skill4 = createMockSkill('skill-d', ['trigger delta'])

      await matcher.registerSkill(skill1)
      await matcher.registerSkill(skill2)
      await matcher.registerSkill(skill3)
      await matcher.registerSkill(skill4)

      const matches = await matcher.matchSkills(
        'trigger alpha, trigger beta, trigger gamma, trigger delta'
      )

      expect(matches.length).toBe(3) // Limited to maxResults
      expect(matches.every((m) => m.confidence === 1.0)).toBe(true)
    })

    it('returns empty array when no matches', async () => {
      const skill = createMockSkill('test-skill', ['very specific trigger'])
      await matcher.registerSkill(skill)

      const matches = await matcher.matchSkills('completely unrelated query')

      expect(matches).toEqual([])
    })
  })

  describe('skill management', () => {
    it('unregisters skills', async () => {
      const skill = createMockSkill('test-skill', ['test'])
      await matcher.registerSkill(skill)

      expect(matcher.hasSkill('test-skill')).toBe(true)

      matcher.unregisterSkill('test-skill')

      expect(matcher.hasSkill('test-skill')).toBe(false)
    })

    it('clears all skills', async () => {
      await matcher.registerSkill(createMockSkill('skill-1', ['one']))
      await matcher.registerSkill(createMockSkill('skill-2', ['two']))

      expect(matcher.getRegisteredSkills().length).toBe(2)

      matcher.clear()

      expect(matcher.getRegisteredSkills().length).toBe(0)
    })
  })
})

describe('SimpleKeywordMatcher', () => {
  let matcher: SimpleKeywordMatcher

  beforeEach(() => {
    matcher = new SimpleKeywordMatcher()
  })

  it('matches by trigger', () => {
    const skill = createMockSkill('test-skill', ['run tests', 'execute tests'])
    matcher.registerSkill(skill)

    const matches = matcher.matchSkills('run tests please')

    expect(matches.length).toBe(1)
    expect(matches[0].confidence).toBe(1.0)
    expect(matches[0].matchType).toBe('exact')
  })

  it('matches by tag when no trigger match', () => {
    const skill = createMockSkill('security-skill', ['audit'], ['security', 'compliance'])
    matcher.registerSkill(skill)

    const matches = matcher.matchSkills('check security issues')

    expect(matches.length).toBe(1)
    expect(matches[0].confidence).toBe(0.7)
    expect(matches[0].matchType).toBe('tag')
  })

  it('returns sorted results', () => {
    matcher.registerSkill(createMockSkill('skill-a', ['keyword'], ['tag-a']))
    matcher.registerSkill(createMockSkill('skill-b', [], ['keyword']))

    const matches = matcher.matchSkills('keyword test')

    // Trigger match (1.0) should come before tag match (0.7)
    expect(matches[0].skill).toBe('skill-a')
    expect(matches[0].confidence).toBe(1.0)
  })
})
