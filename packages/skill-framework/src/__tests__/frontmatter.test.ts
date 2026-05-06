/**
 * Frontmatter Parser Tests
 */

import { describe, it, expect } from 'vitest'
import {
  extractFrontmatter,
  parseYaml,
  validateFrontmatter,
  parseFrontmatter,
  generateFrontmatter,
} from '../frontmatter.js'
import type { SkillFrontmatter } from '../types.js'

describe('extractFrontmatter', () => {
  it('extracts valid frontmatter from content', () => {
    const content = `---
name: test-skill
version: "1.0.0"
---

# Test Skill

Body content here.`

    const result = extractFrontmatter(content)

    expect(result).not.toBeNull()
    expect(result?.frontmatter).toContain('name: test-skill')
    expect(result?.body).toBe('# Test Skill\n\nBody content here.')
  })

  it('returns null when no frontmatter present', () => {
    const content = '# Just a heading\n\nSome content.'
    const result = extractFrontmatter(content)
    expect(result).toBeNull()
  })

  it('handles Windows line endings', () => {
    const content = '---\r\nname: test\r\n---\r\n\r\nBody'
    const result = extractFrontmatter(content)
    expect(result).not.toBeNull()
    expect(result?.frontmatter).toBe('name: test')
  })
})

describe('parseYaml', () => {
  it('parses valid YAML', () => {
    const yaml = `
name: test-skill
version: "1.0.0"
triggers:
  - "trigger one"
  - "trigger two"
`
    const result = parseYaml(yaml)
    expect(result).toEqual({
      name: 'test-skill',
      version: '1.0.0',
      triggers: ['trigger one', 'trigger two'],
    })
  })

  it('throws on invalid YAML', () => {
    const badYaml = `
name: test
  broken: indentation
`
    expect(() => parseYaml(badYaml)).toThrow()
  })
})

describe('validateFrontmatter', () => {
  const validFrontmatter = {
    name: 'literature-review',
    description: 'Use this skill when the user wants to survey a field, map related work, or perform gap analysis. It helps understand the state of the art in a research area.',
    version: '1.0.0',
    author: 'team-research',
    category: 'research',
    triggers: ['survey a field', 'gap analysis', 'literature review'],
    tags: ['research', 'academic'],
  }

  it('validates correct frontmatter', () => {
    const result = validateFrontmatter(validFrontmatter)
    expect(result.valid).toBe(true)
    expect(result.data).toEqual(validFrontmatter)
  })

  it('rejects missing required fields', () => {
    const missing = { name: 'test' }
    const result = validateFrontmatter(missing)
    expect(result.valid).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors?.some((e) => e.includes('description'))).toBe(true)
  })

  it('validates name is kebab-case', () => {
    const camelCase = { ...validFrontmatter, name: 'literatureReview' }
    const result = validateFrontmatter(camelCase)
    expect(result.valid).toBe(false)
    expect(result.errors?.some((e) => e.includes('kebab-case'))).toBe(true)
  })

  it('validates version is semver', () => {
    const badVersion = { ...validFrontmatter, version: 'v1' }
    const result = validateFrontmatter(badVersion)
    expect(result.valid).toBe(false)
    expect(result.errors?.some((e) => e.includes('semver'))).toBe(true)
  })

  it('requires at least one trigger', () => {
    const noTriggers = { ...validFrontmatter, triggers: [] }
    const result = validateFrontmatter(noTriggers)
    expect(result.valid).toBe(false)
    expect(result.errors?.some((e) => e.includes('trigger'))).toBe(true)
  })

  it('validates category enum', () => {
    const badCategory = { ...validFrontmatter, category: 'invalid' }
    const result = validateFrontmatter(badCategory)
    expect(result.valid).toBe(false)
  })

  it('allows optional fields', () => {
    const withOptional = {
      ...validFrontmatter,
      dependencies: ['auth-skill'],
      mandatoryTools: ['search', 'database'],
    }
    const result = validateFrontmatter(withOptional)
    expect(result.valid).toBe(true)
    expect(result.data?.dependencies).toEqual(['auth-skill'])
  })
})

describe('parseFrontmatter', () => {
  const validSkillMd = `---
name: test-skill
description: "This is a test skill that does testing things. It helps validate the skill framework functionality properly."
version: "1.0.0"
author: test-author
category: development
triggers:
  - "run tests"
  - "test this"
tags:
  - testing
---

# Test Skill

## Process

1. Do something
2. Do another thing

## Anti-patterns

- Don't do this
- Avoid that
`

  it('parses valid SKILL.md content', () => {
    const result = parseFrontmatter(validSkillMd)

    expect(result.valid).toBe(true)
    expect(result.data?.frontmatter.name).toBe('test-skill')
    expect(result.data?.body).toContain('# Test Skill')
  })

  it('returns error for missing frontmatter', () => {
    const result = parseFrontmatter('# No frontmatter\n\nJust content.')
    expect(result.valid).toBe(false)
    expect(result.errors?.some((e) => e.includes('frontmatter'))).toBe(true)
  })

  it('returns validation errors for invalid frontmatter', () => {
    const invalid = `---
name: InvalidName
---

# Content`

    const result = parseFrontmatter(invalid)
    expect(result.valid).toBe(false)
  })
})

describe('generateFrontmatter', () => {
  it('generates valid YAML frontmatter', () => {
    const frontmatter: SkillFrontmatter = {
      name: 'test-skill',
      description: 'A test skill description that is long enough to pass validation',
      version: '1.0.0',
      author: 'test',
      category: 'development',
      triggers: ['trigger one'],
      tags: ['test'],
    }

    const result = generateFrontmatter(frontmatter)

    expect(result.startsWith('---\n')).toBe(true)
    expect(result.endsWith('---\n')).toBe(true)
    // YAML library quotes keys, so check for the actual output format
    expect(result).toContain('test-skill')
    expect(result).toContain('trigger one')
  })
})
