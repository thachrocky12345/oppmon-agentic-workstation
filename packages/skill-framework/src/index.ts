// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Skill Framework
 *
 * A framework for defining, loading, and matching skills using YAML frontmatter
 * and intent-based trigger matching.
 *
 * @example
 * ```typescript
 * import { createSkillRegistry, TriggerMatcher } from '@arkon/skill-framework'
 *
 * // Create a registry and load skills
 * const registry = await createSkillRegistry('./skills', {
 *   enableHotReload: true,
 * })
 *
 * // List all research skills
 * const researchSkills = registry.listSkills('research')
 *
 * // Match user message to skills
 * const matches = await registry.matchSkills('help me review literature')
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  SkillCategory,
  SkillFrontmatter,
  SkillSection,
  Example,
  ParsedSkillBody,
  LoadedSkill,
  SkillSummary,
  MatchType,
  MatchedSkill,
  TriggerMatcherConfig,
  ValidationResult,
  SkillRegistryEvent,
  SkillRegistryEventHandler,
} from './types.js'

export {
  SkillCategorySchema,
  SkillFrontmatterSchema,
  DEFAULT_MATCHER_CONFIG,
} from './types.js'

// Frontmatter
export {
  extractFrontmatter,
  parseYaml,
  validateFrontmatter,
  parseFrontmatter,
  generateFrontmatter,
} from './frontmatter.js'

// Parser
export {
  parseSkillBody,
  getAllSectionTitles,
  getSectionByPath,
} from './parser.js'

// Trigger Matching
export {
  TriggerMatcher,
  SimpleKeywordMatcher,
  cosineSimilarity,
} from './trigger.js'

export type { EmbeddingFunction } from './trigger.js'

// Registry
export {
  SkillRegistry,
  createSkillRegistry,
} from './registry.js'

export type { SkillRegistryOptions } from './registry.js'

// Workflow System
export {
  WorkflowManager,
  WorkflowPhaseSchema,
  SkillWorkflowSchema,
  LITERATURE_REVIEW_WORKFLOW,
  EXPERIMENT_WORKFLOW,
} from './workflow.js'

export type {
  WorkflowPhase,
  SkillWorkflow,
  WorkflowState,
  PhaseState,
  ValidationCheckResult,
  WorkflowProgress,
} from './workflow.js'

// Markers System
export {
  MARKER_TYPES,
  MarkerScanner,
  findMarkers,
  hasMarkers,
  countMarkers,
} from './markers.js'

export type {
  MarkerType,
  FoundMarker,
  AuditReport,
} from './markers.js'

// Citations
export {
  BibTeXParser,
  CitationVerifier,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  isValidBibTeX,
  getCitationKeys,
  findDuplicateKeys,
} from './citations.js'

export type {
  BibEntry,
  VerificationError,
  VerificationWarning,
  VerificationResult,
} from './citations.js'

// Templates
export {
  TemplateManager,
  ExperimentLogSchema,
  CorpusEntrySchema,
  ThreatEntrySchema,
  EXPERIMENT_LOG_TEMPLATE,
  CORPUS_TABLE_TEMPLATE,
  STRIDE_TABLE_TEMPLATE,
  generateExperimentId,
  parseMarkdownTable,
} from './templates.js'

export type {
  OutputTemplate,
  TemplateSection,
  ExperimentLog,
  CorpusEntry,
  ThreatEntry,
} from './templates.js'
