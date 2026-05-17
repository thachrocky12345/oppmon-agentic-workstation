// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * YAML Frontmatter Parser
 * Extracts and validates YAML frontmatter from SKILL.md files
 */

import * as yaml from 'yaml'
import { SkillFrontmatter, SkillFrontmatterSchema, ValidationResult } from './types.js'

// Regex to match YAML frontmatter between --- delimiters
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/

/**
 * Parse frontmatter from a SKILL.md file content
 * @param content - The full content of the SKILL.md file
 * @returns The frontmatter string and remaining body, or null if no frontmatter found
 */
export function extractFrontmatter(content: string): {
  frontmatter: string
  body: string
} | null {
  const match = content.match(FRONTMATTER_REGEX)
  if (!match) {
    return null
  }

  const frontmatter = match[1]
  const body = content.slice(match[0].length).trim()

  return { frontmatter, body }
}

/**
 * Parse YAML string into an object
 * @param yamlString - The YAML content to parse
 * @returns Parsed object or null on error
 */
export function parseYaml(yamlString: string): unknown {
  try {
    return yaml.parse(yamlString)
  } catch (error) {
    throw new Error(`Invalid YAML: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Validate parsed frontmatter against the schema
 * @param data - The parsed YAML data
 * @returns Validation result with typed data or errors
 */
export function validateFrontmatter(data: unknown): ValidationResult<SkillFrontmatter> {
  const result = SkillFrontmatterSchema.safeParse(data)

  if (result.success) {
    return {
      valid: true,
      data: result.data,
    }
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })

  return {
    valid: false,
    errors,
  }
}

/**
 * Parse and validate frontmatter from SKILL.md content
 * @param content - The full content of the SKILL.md file
 * @returns Validation result with frontmatter and body
 */
export function parseFrontmatter(content: string): ValidationResult<{
  frontmatter: SkillFrontmatter
  body: string
}> {
  const extracted = extractFrontmatter(content)

  if (!extracted) {
    return {
      valid: false,
      errors: ['No YAML frontmatter found. File must start with ---'],
    }
  }

  let parsed: unknown
  try {
    parsed = parseYaml(extracted.frontmatter)
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : 'Invalid YAML'],
    }
  }

  const validation = validateFrontmatter(parsed)

  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
    }
  }

  return {
    valid: true,
    data: {
      frontmatter: validation.data!,
      body: extracted.body,
    },
  }
}

/**
 * Generate YAML frontmatter from a SkillFrontmatter object
 * @param frontmatter - The frontmatter object to serialize
 * @returns YAML string with --- delimiters
 */
export function generateFrontmatter(frontmatter: SkillFrontmatter): string {
  const yamlContent = yaml.stringify(frontmatter, {
    lineWidth: 0, // No wrapping
    defaultStringType: 'QUOTE_DOUBLE',
  })

  return `---\n${yamlContent}---\n`
}
