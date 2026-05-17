// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Local Skills Management
 *
 * Manages skill files in .claude/skills/ directory
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'

export interface LocalSkill {
  name: string
  path: string
  content: string
  sha256: string
  description?: string
}

export interface SkillMetadata {
  name: string
  description?: string
  scope?: 'TENANT' | 'TEAM'
  teamId?: string
}

const SKILLS_DIR = '.claude/skills'
const SKILL_FILE = 'SKILL.md'

/**
 * Find the project root (directory containing .claude/skills)
 */
export async function findProjectRoot(startDir?: string): Promise<string | null> {
  let dir = startDir || process.cwd()

  while (dir !== path.parse(dir).root) {
    const skillsPath = path.join(dir, SKILLS_DIR)
    try {
      const stat = await fs.stat(skillsPath)
      if (stat.isDirectory()) {
        return dir
      }
    } catch {
      // Directory doesn't exist, continue searching
    }
    dir = path.dirname(dir)
  }

  return null
}

/**
 * Get the skills directory path
 */
export async function getSkillsDir(projectRoot?: string): Promise<string> {
  const root = projectRoot || (await findProjectRoot())
  if (!root) {
    throw new Error(
      'No .claude/skills directory found. Initialize with "mkdir -p .claude/skills"'
    )
  }
  return path.join(root, SKILLS_DIR)
}

/**
 * Calculate SHA256 hash of content
 */
export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Parse skill metadata from SKILL.md frontmatter
 */
export function parseSkillMetadata(content: string): SkillMetadata {
  const lines = content.split('\n')
  const metadata: SkillMetadata = { name: '' }

  // Check for YAML frontmatter
  if (lines[0]?.trim() === '---') {
    let i = 1
    while (i < lines.length && lines[i]?.trim() !== '---') {
      const line = lines[i]
      const match = line.match(/^([\w-]+):\s*(.*)$/)
      if (match) {
        const [, key, value] = match
        const trimmedValue = value.trim().replace(/^["']|["']$/g, '')
        const normalizedKey = key.toLowerCase().replace(/-/g, '_')
        switch (normalizedKey) {
          case 'name':
            metadata.name = trimmedValue
            break
          case 'description':
            metadata.description = trimmedValue
            break
          case 'scope':
            metadata.scope = trimmedValue.toUpperCase() as 'TENANT' | 'TEAM'
            break
          case 'teamid':
          case 'team_id':
            metadata.teamId = trimmedValue
            break
        }
      }
      i++
    }
  }

  // If no name in frontmatter, derive from first heading
  if (!metadata.name) {
    const headingMatch = content.match(/^#\s+(.+)$/m)
    if (headingMatch) {
      metadata.name = headingMatch[1].trim()
    }
  }

  return metadata
}

/**
 * Read a single skill from directory
 */
export async function readLocalSkill(skillDir: string): Promise<LocalSkill | null> {
  const skillPath = path.join(skillDir, SKILL_FILE)

  try {
    const content = await fs.readFile(skillPath, 'utf-8')
    const metadata = parseSkillMetadata(content)
    const name = metadata.name || path.basename(skillDir)

    return {
      name,
      path: skillDir,
      content,
      sha256: hashContent(content),
      description: metadata.description,
    }
  } catch {
    return null
  }
}

/**
 * List all local skills
 */
export async function listLocalSkills(projectRoot?: string): Promise<LocalSkill[]> {
  const skillsDir = await getSkillsDir(projectRoot)
  const skills: LocalSkill[] = []

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const skillDir = path.join(skillsDir, entry.name)
        const skill = await readLocalSkill(skillDir)
        if (skill) {
          skills.push(skill)
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get a single local skill by name
 */
export async function getLocalSkill(
  name: string,
  projectRoot?: string
): Promise<LocalSkill | null> {
  const skillsDir = await getSkillsDir(projectRoot)
  const skillDir = path.join(skillsDir, name)
  return readLocalSkill(skillDir)
}

/**
 * Write a skill to local directory
 */
export async function writeLocalSkill(
  name: string,
  content: string,
  projectRoot?: string
): Promise<LocalSkill> {
  const skillsDir = await getSkillsDir(projectRoot)
  const skillDir = path.join(skillsDir, name)

  // Create skill directory if it doesn't exist
  await fs.mkdir(skillDir, { recursive: true })

  const skillPath = path.join(skillDir, SKILL_FILE)
  await fs.writeFile(skillPath, content, 'utf-8')

  return {
    name,
    path: skillDir,
    content,
    sha256: hashContent(content),
  }
}

/**
 * Delete a local skill
 */
export async function deleteLocalSkill(
  name: string,
  projectRoot?: string
): Promise<boolean> {
  const skillsDir = await getSkillsDir(projectRoot)
  const skillDir = path.join(skillsDir, name)

  try {
    await fs.rm(skillDir, { recursive: true })
    return true
  } catch {
    return false
  }
}

/**
 * Check if skills directory exists
 */
export async function skillsDirExists(projectRoot?: string): Promise<boolean> {
  try {
    const skillsDir = await getSkillsDir(projectRoot)
    await fs.access(skillsDir)
    return true
  } catch {
    return false
  }
}
