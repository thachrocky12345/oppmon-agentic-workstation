// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Skill Framework Types
 * Defines the structure of skills, frontmatter, and matching results
 */

import { z } from 'zod'

// ============================================================================
// Skill Categories
// ============================================================================

export const SkillCategorySchema = z.enum([
  'research',
  'security',
  'development',
  'operations',
  'compliance',
  'automation',
])

export type SkillCategory = z.infer<typeof SkillCategorySchema>

// ============================================================================
// YAML Frontmatter Schema
// ============================================================================

export const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'Name must be lowercase-kebab-case'),
  description: z
    .string()
    .min(50, 'Description should be at least 50 characters'),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format (e.g., 1.0.0)'),
  author: z.string().min(1),
  category: SkillCategorySchema,
  triggers: z
    .array(z.string())
    .min(1, 'At least one trigger is required')
    .max(15, 'Maximum 15 triggers allowed'),
  tags: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).optional(),
  mandatoryTools: z.array(z.string()).optional(),
})

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>

// ============================================================================
// Parsed Skill Body
// ============================================================================

export interface SkillSection {
  title: string
  level: number // 1-6 for h1-h6
  content: string
  subsections: SkillSection[]
}

export interface Example {
  language: string
  code: string
  description?: string
}

export interface ParsedSkillBody {
  sections: SkillSection[]
  antiPatterns: string[]
  deliverables: string[]
  examples: Example[]
  rawContent: string
}

// ============================================================================
// Loaded Skill
// ============================================================================

export interface LoadedSkill {
  path: string
  frontmatter: SkillFrontmatter
  body: ParsedSkillBody
  loadedAt: Date
  embedding?: number[]
}

export interface SkillSummary {
  name: string
  description: string
  category: SkillCategory
  triggers: string[]
  tags: string[]
}

// ============================================================================
// Trigger Matching
// ============================================================================

export type MatchType = 'exact' | 'semantic' | 'tag'

export interface MatchedSkill {
  skill: string
  confidence: number
  matchType: MatchType
  matchedTrigger?: string
  matchedTag?: string
}

export interface TriggerMatcherConfig {
  exactMatchWeight: number
  semanticMatchWeight: number
  tagMatchWeight: number
  minSemanticScore: number
  maxResults: number
}

export const DEFAULT_MATCHER_CONFIG: TriggerMatcherConfig = {
  exactMatchWeight: 1.0,
  semanticMatchWeight: 0.85,
  tagMatchWeight: 0.7,
  minSemanticScore: 0.75,
  maxResults: 3,
}

// ============================================================================
// Validation Results
// ============================================================================

export interface ValidationResult<T> {
  valid: boolean
  data?: T
  errors?: string[]
}

// ============================================================================
// Registry Events
// ============================================================================

export type SkillRegistryEvent =
  | { type: 'skill:loaded'; skill: string; path: string }
  | { type: 'skill:reloaded'; skill: string; path: string }
  | { type: 'skill:removed'; skill: string }
  | { type: 'skill:error'; skill: string; error: string }

export type SkillRegistryEventHandler = (event: SkillRegistryEvent) => void
