/**
 * Intent-Based Trigger Matcher
 * Matches user messages to skills using exact trigger phrases and semantic similarity
 */

import {
  LoadedSkill,
  MatchedSkill,
  TriggerMatcherConfig,
  DEFAULT_MATCHER_CONFIG,
} from './types.js'

// ============================================================================
// Embedding Types
// ============================================================================

export type EmbeddingFunction = (text: string) => Promise<number[]>

// ============================================================================
// Cosine Similarity
// ============================================================================

/**
 * Calculate cosine similarity between two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity (0-1)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}

// ============================================================================
// Trigger Matcher
// ============================================================================

export class TriggerMatcher {
  private skills: Map<string, LoadedSkill> = new Map()
  private embeddings: Map<string, number[]> = new Map()
  private config: TriggerMatcherConfig
  private embedFn?: EmbeddingFunction

  constructor(config: Partial<TriggerMatcherConfig> = {}, embedFn?: EmbeddingFunction) {
    this.config = { ...DEFAULT_MATCHER_CONFIG, ...config }
    this.embedFn = embedFn
  }

  /**
   * Register a skill for trigger matching
   * @param skill - The loaded skill
   */
  async registerSkill(skill: LoadedSkill): Promise<void> {
    this.skills.set(skill.frontmatter.name, skill)

    // Compute and cache embedding for semantic matching
    if (this.embedFn && !skill.embedding) {
      const embedding = await this.embedFn(skill.frontmatter.description)
      this.embeddings.set(skill.frontmatter.name, embedding)
      skill.embedding = embedding
    } else if (skill.embedding) {
      this.embeddings.set(skill.frontmatter.name, skill.embedding)
    }
  }

  /**
   * Unregister a skill
   * @param name - The skill name
   */
  unregisterSkill(name: string): void {
    this.skills.delete(name)
    this.embeddings.delete(name)
  }

  /**
   * Clear all registered skills
   */
  clear(): void {
    this.skills.clear()
    this.embeddings.clear()
  }

  /**
   * Match user message against registered skills
   * @param userMessage - The user's message
   * @returns Array of matched skills sorted by confidence
   */
  async matchSkills(userMessage: string): Promise<MatchedSkill[]> {
    const matches: MatchedSkill[] = []
    const messageLower = userMessage.toLowerCase()

    // Strategy 1: Exact trigger phrase matching
    for (const [name, skill] of this.skills) {
      for (const trigger of skill.frontmatter.triggers) {
        if (messageLower.includes(trigger.toLowerCase())) {
          matches.push({
            skill: name,
            confidence: this.config.exactMatchWeight,
            matchType: 'exact',
            matchedTrigger: trigger,
          })
          break // Only match once per skill
        }
      }
    }

    // Strategy 2: Tag matching
    for (const [name, skill] of this.skills) {
      const existingMatch = matches.find((m) => m.skill === name)
      if (existingMatch) continue // Skip if already matched

      for (const tag of skill.frontmatter.tags) {
        if (messageLower.includes(tag.toLowerCase())) {
          matches.push({
            skill: name,
            confidence: this.config.tagMatchWeight,
            matchType: 'tag',
            matchedTag: tag,
          })
          break
        }
      }
    }

    // Strategy 3: Semantic similarity to description
    if (this.embedFn) {
      const messageEmbedding = await this.embedFn(userMessage)

      for (const [name, skill] of this.skills) {
        const existingMatch = matches.find((m) => m.skill === name)
        if (existingMatch) continue // Skip if already matched

        const descEmbedding = this.embeddings.get(name)
        if (!descEmbedding) continue

        const similarity = cosineSimilarity(messageEmbedding, descEmbedding)

        if (similarity >= this.config.minSemanticScore) {
          matches.push({
            skill: name,
            confidence: similarity * this.config.semanticMatchWeight,
            matchType: 'semantic',
          })
        }
      }
    }

    // Sort by confidence (descending) and return top results
    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxResults)
  }

  /**
   * Get all registered skills
   * @returns Array of skill names
   */
  getRegisteredSkills(): string[] {
    return Array.from(this.skills.keys())
  }

  /**
   * Check if a skill is registered
   * @param name - The skill name
   * @returns True if registered
   */
  hasSkill(name: string): boolean {
    return this.skills.has(name)
  }

  /**
   * Update the embedding function
   * @param embedFn - New embedding function
   */
  setEmbeddingFunction(embedFn: EmbeddingFunction): void {
    this.embedFn = embedFn
  }

  /**
   * Recompute all embeddings
   */
  async recomputeEmbeddings(): Promise<void> {
    if (!this.embedFn) return

    for (const [name, skill] of this.skills) {
      const embedding = await this.embedFn(skill.frontmatter.description)
      this.embeddings.set(name, embedding)
      skill.embedding = embedding
    }
  }
}

// ============================================================================
// Simple Keyword Matcher (No Embeddings)
// ============================================================================

/**
 * Simple keyword-based matcher that doesn't require embeddings
 * Useful for basic matching without AI dependencies
 */
export class SimpleKeywordMatcher {
  private skills: Map<string, LoadedSkill> = new Map()

  /**
   * Register a skill
   * @param skill - The loaded skill
   */
  registerSkill(skill: LoadedSkill): void {
    this.skills.set(skill.frontmatter.name, skill)
  }

  /**
   * Unregister a skill
   * @param name - The skill name
   */
  unregisterSkill(name: string): void {
    this.skills.delete(name)
  }

  /**
   * Match using exact trigger and tag matching only
   * @param userMessage - The user's message
   * @returns Array of matched skills
   */
  matchSkills(userMessage: string): MatchedSkill[] {
    const matches: MatchedSkill[] = []
    const messageLower = userMessage.toLowerCase()

    for (const [name, skill] of this.skills) {
      // Check triggers
      for (const trigger of skill.frontmatter.triggers) {
        if (messageLower.includes(trigger.toLowerCase())) {
          matches.push({
            skill: name,
            confidence: 1.0,
            matchType: 'exact',
            matchedTrigger: trigger,
          })
          break
        }
      }

      // Check tags if no trigger match
      if (!matches.find((m) => m.skill === name)) {
        for (const tag of skill.frontmatter.tags) {
          if (messageLower.includes(tag.toLowerCase())) {
            matches.push({
              skill: name,
              confidence: 0.7,
              matchType: 'tag',
              matchedTag: tag,
            })
            break
          }
        }
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 3)
  }
}
