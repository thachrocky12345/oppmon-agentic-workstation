/**
 * Skills Module Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import {
  hashContent,
  parseSkillMetadata,
  listLocalSkills,
  getLocalSkill,
  writeLocalSkill,
  deleteLocalSkill,
} from '../lib/skills.js'

describe('Skills Module', () => {
  let tempDir: string

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = path.join(os.tmpdir(), `tag-test-${Date.now()}`)
    await fs.mkdir(path.join(tempDir, '.claude', 'skills'), { recursive: true })
  })

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe('hashContent', () => {
    it('returns consistent SHA256 hash', () => {
      const content = 'test content'
      const hash1 = hashContent(content)
      const hash2 = hashContent(content)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA256 hex length
    })

    it('returns different hashes for different content', () => {
      const hash1 = hashContent('content 1')
      const hash2 = hashContent('content 2')

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('parseSkillMetadata', () => {
    it('parses YAML frontmatter', () => {
      const content = `---
name: test-skill
description: A test skill
scope: TENANT
---
# Test Skill

This is a test.`

      const metadata = parseSkillMetadata(content)

      expect(metadata.name).toBe('test-skill')
      expect(metadata.description).toBe('A test skill')
      expect(metadata.scope).toBe('TENANT')
    })

    it('extracts name from heading if no frontmatter', () => {
      const content = `# My Skill Name

This is the skill content.`

      const metadata = parseSkillMetadata(content)

      expect(metadata.name).toBe('My Skill Name')
    })

    it('handles missing metadata gracefully', () => {
      const content = 'Just some plain content without metadata.'

      const metadata = parseSkillMetadata(content)

      expect(metadata.name).toBe('')
    })

    it('parses teamId variations', () => {
      const variations = [
        { content: '---\nteamId: team-123\n---', expected: 'team-123' },
        { content: '---\nteam_id: team-456\n---', expected: 'team-456' },
        { content: '---\nteam-id: team-789\n---', expected: 'team-789' },
      ]

      for (const { content, expected } of variations) {
        const metadata = parseSkillMetadata(content)
        expect(metadata.teamId).toBe(expected)
      }
    })
  })

  describe('local skill operations', () => {
    it('writes and reads a skill', async () => {
      const skillContent = `---
name: test-skill
description: Test description
---
# Test Skill

Content here.`

      const written = await writeLocalSkill('test-skill', skillContent, tempDir)

      expect(written.name).toBe('test-skill')
      expect(written.content).toBe(skillContent)
      expect(written.sha256).toBeTruthy()

      const read = await getLocalSkill('test-skill', tempDir)

      expect(read).not.toBeNull()
      expect(read!.name).toBe('test-skill')
      expect(read!.content).toBe(skillContent)
      expect(read!.sha256).toBe(written.sha256)
    })

    it('lists all local skills', async () => {
      // Skills with explicit names in frontmatter
      await writeLocalSkill('skill-a', '---\nname: skill-a\n---\n# Skill A', tempDir)
      await writeLocalSkill('skill-b', '---\nname: skill-b\n---\n# Skill B', tempDir)
      await writeLocalSkill('skill-c', '---\nname: skill-c\n---\n# Skill C', tempDir)

      const skills = await listLocalSkills(tempDir)

      expect(skills).toHaveLength(3)
      expect(skills.map((s) => s.name)).toEqual(['skill-a', 'skill-b', 'skill-c'])
    })

    it('deletes a skill', async () => {
      await writeLocalSkill('to-delete', '# Delete Me', tempDir)

      const beforeDelete = await getLocalSkill('to-delete', tempDir)
      expect(beforeDelete).not.toBeNull()

      const deleted = await deleteLocalSkill('to-delete', tempDir)
      expect(deleted).toBe(true)

      const afterDelete = await getLocalSkill('to-delete', tempDir)
      expect(afterDelete).toBeNull()
    })

    it('returns null for non-existent skill', async () => {
      const skill = await getLocalSkill('non-existent', tempDir)
      expect(skill).toBeNull()
    })
  })
})
