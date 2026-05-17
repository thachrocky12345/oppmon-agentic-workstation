// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Skill Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { SkillRegistry, createSkillRegistry } from '../registry.js'

// Create a temporary directory for test skills
async function createTempSkillsDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), `skill-test-${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })
  return tempDir
}

// Create a valid SKILL.md file
async function createSkillFile(dir: string, name: string, content?: string): Promise<string> {
  const skillDir = path.join(dir, name)
  await fs.mkdir(skillDir, { recursive: true })

  const skillContent =
    content ||
    `---
name: ${name}
description: "A test skill for ${name}. This description is long enough to pass validation for testing purposes."
version: "1.0.0"
author: test
category: development
triggers:
  - "test ${name}"
  - "${name} trigger"
tags:
  - test
  - ${name}
---

# ${name.charAt(0).toUpperCase() + name.slice(1)} Skill

## Process

Do things.

## Anti-patterns

- Don't do bad things

## Deliverables

- Good output
`

  const filePath = path.join(skillDir, 'SKILL.md')
  await fs.writeFile(filePath, skillContent, 'utf-8')
  return filePath
}

// Clean up temp directory
async function cleanupTempDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

describe('SkillRegistry', () => {
  let tempDir: string
  let registry: SkillRegistry

  beforeEach(async () => {
    tempDir = await createTempSkillsDir()
  })

  afterEach(async () => {
    if (registry) {
      await registry.dispose()
    }
    await cleanupTempDir(tempDir)
  })

  describe('loadFromDirectory', () => {
    it('loads all skills from directory', async () => {
      await createSkillFile(tempDir, 'skill-one')
      await createSkillFile(tempDir, 'skill-two')
      await createSkillFile(tempDir, 'skill-three')

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      expect(registry.size).toBe(3)
      expect(registry.hasSkill('skill-one')).toBe(true)
      expect(registry.hasSkill('skill-two')).toBe(true)
      expect(registry.hasSkill('skill-three')).toBe(true)
    })

    it('handles nested skill directories', async () => {
      const nestedDir = path.join(tempDir, 'research', 'academic')
      await fs.mkdir(nestedDir, { recursive: true })

      await fs.writeFile(
        path.join(nestedDir, 'SKILL.md'),
        `---
name: nested-skill
description: "A nested skill that lives deep in the directory structure for testing purposes."
version: "1.0.0"
author: test
category: research
triggers:
  - "nested trigger"
tags: []
---

# Nested Skill
`
      )

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      expect(registry.hasSkill('nested-skill')).toBe(true)
    })

    it('skips invalid skill files', async () => {
      await createSkillFile(tempDir, 'valid-skill')

      // Create invalid skill
      const invalidDir = path.join(tempDir, 'invalid-skill')
      await fs.mkdir(invalidDir, { recursive: true })
      await fs.writeFile(
        path.join(invalidDir, 'SKILL.md'),
        '# No frontmatter here'
      )

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      expect(registry.size).toBe(1)
      expect(registry.hasSkill('valid-skill')).toBe(true)
    })

    it('emits events during loading', async () => {
      await createSkillFile(tempDir, 'test-skill')

      const events: { type: string; skill: string }[] = []

      registry = new SkillRegistry({ skillsDir: tempDir })
      registry.subscribe((event) => {
        events.push({ type: event.type, skill: event.skill })
      })

      await registry.loadFromDirectory()

      expect(events.some((e) => e.type === 'skill:loaded')).toBe(true)
    })
  })

  describe('getSkill', () => {
    it('returns loaded skill by name', async () => {
      await createSkillFile(tempDir, 'my-skill')

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      const skill = registry.getSkill('my-skill')

      expect(skill).toBeDefined()
      expect(skill?.frontmatter.name).toBe('my-skill')
      expect(skill?.frontmatter.triggers).toContain('test my-skill')
    })

    it('returns undefined for non-existent skill', async () => {
      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      const skill = registry.getSkill('non-existent')

      expect(skill).toBeUndefined()
    })
  })

  describe('listSkills', () => {
    it('lists all skills', async () => {
      await createSkillFile(tempDir, 'skill-a')
      await createSkillFile(tempDir, 'skill-b')

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      const skills = registry.listSkills()

      expect(skills.length).toBe(2)
      expect(skills.map((s) => s.name)).toContain('skill-a')
      expect(skills.map((s) => s.name)).toContain('skill-b')
    })

    it('filters by category', async () => {
      await createSkillFile(tempDir, 'dev-skill')

      const researchDir = path.join(tempDir, 'research-skill')
      await fs.mkdir(researchDir, { recursive: true })
      await fs.writeFile(
        path.join(researchDir, 'SKILL.md'),
        `---
name: research-skill
description: "A research skill for testing category filtering functionality properly."
version: "1.0.0"
author: test
category: research
triggers:
  - "research trigger"
tags: []
---

# Research Skill
`
      )

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      const researchSkills = registry.listSkills('research')

      expect(researchSkills.length).toBe(1)
      expect(researchSkills[0].name).toBe('research-skill')
    })

    it('returns skill summaries with truncated description', async () => {
      await createSkillFile(tempDir, 'test-skill')

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      const skills = registry.listSkills()

      expect(skills[0].description.length).toBeLessThanOrEqual(200)
      expect(skills[0].triggers).toBeDefined()
      expect(skills[0].tags).toBeDefined()
    })
  })

  describe('matchSkills', () => {
    it('matches skills by trigger', async () => {
      await createSkillFile(tempDir, 'test-skill')

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      const matches = await registry.matchSkills('I want to test test-skill please')

      expect(matches.length).toBeGreaterThan(0)
      expect(matches[0].skill).toBe('test-skill')
    })
  })

  describe('reloadSkill', () => {
    it('reloads a specific skill', async () => {
      const skillPath = await createSkillFile(tempDir, 'reload-test')

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      const originalSkill = registry.getSkill('reload-test')
      const originalDate = originalSkill?.loadedAt

      // Wait a bit to ensure timestamp differs
      await new Promise((r) => setTimeout(r, 10))

      await registry.reloadSkill('reload-test')

      const reloadedSkill = registry.getSkill('reload-test')
      expect(reloadedSkill?.loadedAt).not.toEqual(originalDate)
    })
  })

  describe('reloadAll', () => {
    it('reloads all skills', async () => {
      await createSkillFile(tempDir, 'skill-a')
      await createSkillFile(tempDir, 'skill-b')

      registry = new SkillRegistry({ skillsDir: tempDir })
      await registry.loadFromDirectory()

      expect(registry.size).toBe(2)

      // Add a new skill
      await createSkillFile(tempDir, 'skill-c')

      await registry.reloadAll()

      expect(registry.size).toBe(3)
    })
  })

  describe('event subscription', () => {
    it('allows subscribing and unsubscribing', async () => {
      await createSkillFile(tempDir, 'test-skill')

      registry = new SkillRegistry({ skillsDir: tempDir })

      const events: string[] = []
      const unsubscribe = registry.subscribe((event) => {
        events.push(event.type)
      })

      await registry.loadFromDirectory()

      expect(events.length).toBeGreaterThan(0)

      unsubscribe()
      events.length = 0

      await registry.reloadAll()

      // Should not receive events after unsubscribing
      expect(events.length).toBe(0)
    })
  })
})

describe('createSkillRegistry', () => {
  let tempDir: string
  let registry: SkillRegistry

  beforeEach(async () => {
    tempDir = await createTempSkillsDir()
  })

  afterEach(async () => {
    if (registry) {
      await registry.dispose()
    }
    await cleanupTempDir(tempDir)
  })

  it('creates and loads registry in one call', async () => {
    await createSkillFile(tempDir, 'test-skill')

    registry = await createSkillRegistry(tempDir)

    expect(registry.size).toBe(1)
    expect(registry.hasSkill('test-skill')).toBe(true)
  })
})
