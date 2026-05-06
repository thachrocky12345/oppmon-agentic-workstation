/**
 * Skill Registry
 * Manages loading, caching, and hot-reloading of skills from disk
 */

import { promises as fs } from 'fs'
import { watch, FSWatcher } from 'chokidar'
import { glob } from 'glob'
import * as path from 'path'

import {
  LoadedSkill,
  SkillSummary,
  SkillCategory,
  SkillRegistryEvent,
  SkillRegistryEventHandler,
} from './types.js'
import { parseFrontmatter } from './frontmatter.js'
import { parseSkillBody } from './parser.js'
import { TriggerMatcher, EmbeddingFunction } from './trigger.js'

// ============================================================================
// Skill Registry
// ============================================================================

export interface SkillRegistryOptions {
  skillsDir: string
  enableHotReload?: boolean
  embedFn?: EmbeddingFunction
}

export class SkillRegistry {
  private skills: Map<string, LoadedSkill> = new Map()
  private skillsDir: string
  private watcher: FSWatcher | null = null
  private eventHandlers: Set<SkillRegistryEventHandler> = new Set()
  private triggerMatcher: TriggerMatcher
  private embedFn?: EmbeddingFunction

  constructor(options: SkillRegistryOptions) {
    this.skillsDir = options.skillsDir
    this.embedFn = options.embedFn
    this.triggerMatcher = new TriggerMatcher({}, options.embedFn)

    if (options.enableHotReload) {
      this.enableHotReload()
    }
  }

  /**
   * Load all skills from the skills directory
   */
  async loadFromDirectory(): Promise<void> {
    const pattern = path.join(this.skillsDir, '**/SKILL.md').replace(/\\/g, '/')
    const skillFiles = await glob(pattern)

    for (const file of skillFiles) {
      await this.loadSkillFile(file)
    }

    // Pre-compute embeddings for semantic matching
    if (this.embedFn) {
      await this.triggerMatcher.recomputeEmbeddings()
    }
  }

  /**
   * Load a single skill file
   * @param filePath - Path to the SKILL.md file
   */
  private async loadSkillFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const result = parseFrontmatter(content)

      if (!result.valid || !result.data) {
        console.warn(`Invalid skill ${filePath}: ${result.errors?.join(', ')}`)
        this.emit({
          type: 'skill:error',
          skill: filePath,
          error: result.errors?.join(', ') || 'Unknown error',
        })
        return
      }

      const body = parseSkillBody(result.data.body)

      const skill: LoadedSkill = {
        path: filePath,
        frontmatter: result.data.frontmatter,
        body,
        loadedAt: new Date(),
      }

      const skillName = result.data.frontmatter.name

      // Check for existing skill
      const isReload = this.skills.has(skillName)

      this.skills.set(skillName, skill)
      await this.triggerMatcher.registerSkill(skill)

      this.emit({
        type: isReload ? 'skill:reloaded' : 'skill:loaded',
        skill: skillName,
        path: filePath,
      })
    } catch (error) {
      console.error(`Error loading skill ${filePath}:`, error)
      this.emit({
        type: 'skill:error',
        skill: filePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Enable hot reloading of skill files
   */
  enableHotReload(): void {
    if (this.watcher) return

    const pattern = path.join(this.skillsDir, '**/SKILL.md')

    this.watcher = watch(pattern, {
      ignoreInitial: true,
      persistent: true,
    })

    this.watcher.on('change', async (filePath) => {
      console.log(`Skill file changed: ${filePath}`)
      await this.loadSkillFile(filePath)
    })

    this.watcher.on('add', async (filePath) => {
      console.log(`New skill file: ${filePath}`)
      await this.loadSkillFile(filePath)
    })

    this.watcher.on('unlink', (filePath) => {
      console.log(`Skill file removed: ${filePath}`)
      // Find and remove the skill by path
      for (const [name, skill] of this.skills) {
        if (skill.path === filePath) {
          this.skills.delete(name)
          this.triggerMatcher.unregisterSkill(name)
          this.emit({ type: 'skill:removed', skill: name })
          break
        }
      }
    })
  }

  /**
   * Disable hot reloading
   */
  disableHotReload(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  /**
   * Get a skill by name
   * @param name - The skill name
   * @returns The loaded skill or undefined
   */
  getSkill(name: string): LoadedSkill | undefined {
    return this.skills.get(name)
  }

  /**
   * Check if a skill exists
   * @param name - The skill name
   * @returns True if the skill exists
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name)
  }

  /**
   * List all skills, optionally filtered by category
   * @param category - Optional category filter
   * @returns Array of skill summaries
   */
  listSkills(category?: SkillCategory): SkillSummary[] {
    return Array.from(this.skills.values())
      .filter((s) => !category || s.frontmatter.category === category)
      .map((s) => ({
        name: s.frontmatter.name,
        description: s.frontmatter.description.slice(0, 200),
        category: s.frontmatter.category,
        triggers: s.frontmatter.triggers,
        tags: s.frontmatter.tags,
      }))
  }

  /**
   * Get all loaded skills
   * @returns Map of skill name to loaded skill
   */
  getAllSkills(): Map<string, LoadedSkill> {
    return new Map(this.skills)
  }

  /**
   * Get the number of loaded skills
   * @returns Number of skills
   */
  get size(): number {
    return this.skills.size
  }

  /**
   * Match a user message to skills using the trigger matcher
   * @param userMessage - The user's message
   * @returns Array of matched skills
   */
  async matchSkills(userMessage: string) {
    return this.triggerMatcher.matchSkills(userMessage)
  }

  /**
   * Subscribe to registry events
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  subscribe(handler: SkillRegistryEventHandler): () => void {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  /**
   * Emit a registry event
   * @param event - The event to emit
   */
  private emit(event: SkillRegistryEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event)
      } catch (error) {
        console.error('Error in event handler:', error)
      }
    }
  }

  /**
   * Reload a specific skill by name
   * @param name - The skill name
   */
  async reloadSkill(name: string): Promise<void> {
    const skill = this.skills.get(name)
    if (skill) {
      await this.loadSkillFile(skill.path)
    }
  }

  /**
   * Reload all skills
   */
  async reloadAll(): Promise<void> {
    this.skills.clear()
    this.triggerMatcher.clear()
    await this.loadFromDirectory()
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.disableHotReload()
    this.skills.clear()
    this.triggerMatcher.clear()
    this.eventHandlers.clear()
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a skill registry with default options
 * @param skillsDir - Directory containing skills
 * @param options - Additional options
 * @returns Configured skill registry
 */
export async function createSkillRegistry(
  skillsDir: string,
  options: Partial<Omit<SkillRegistryOptions, 'skillsDir'>> = {}
): Promise<SkillRegistry> {
  const registry = new SkillRegistry({
    skillsDir,
    ...options,
  })

  await registry.loadFromDirectory()
  return registry
}
