/**
 * Skill Body Parser
 * Parses the markdown body of SKILL.md files to extract structured content
 */

import { SkillSection, Example, ParsedSkillBody } from './types.js'

// ============================================================================
// Markdown Parsing Utilities
// ============================================================================

/**
 * Extract heading level from a line
 * @param line - The line to check
 * @returns Heading level (1-6) or 0 if not a heading
 */
function getHeadingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s/)
  return match ? match[1].length : 0
}

/**
 * Extract heading title from a line
 * @param line - The heading line
 * @returns The heading text without # symbols
 */
function getHeadingTitle(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').trim()
}

/**
 * Check if a line is a list item
 * @param line - The line to check
 * @returns True if the line is a list item
 */
function isListItem(line: string): boolean {
  return /^[\s]*[-*+]\s/.test(line) || /^[\s]*\d+\.\s/.test(line)
}

/**
 * Extract list item content from a line
 * @param line - The list item line
 * @returns The content without the bullet/number
 */
function getListItemContent(line: string): string {
  return line.replace(/^[\s]*[-*+]\s+/, '').replace(/^[\s]*\d+\.\s+/, '').trim()
}

// ============================================================================
// Section Extraction
// ============================================================================

interface RawSection {
  title: string
  level: number
  lines: string[]
}

/**
 * Split markdown into raw sections by headings
 * @param content - The markdown content
 * @returns Array of raw sections
 */
function splitIntoSections(content: string): RawSection[] {
  const lines = content.split('\n')
  const sections: RawSection[] = []
  let currentSection: RawSection | null = null

  for (const line of lines) {
    const level = getHeadingLevel(line)

    if (level > 0) {
      // Start a new section
      if (currentSection) {
        sections.push(currentSection)
      }
      currentSection = {
        title: getHeadingTitle(line),
        level,
        lines: [],
      }
    } else if (currentSection) {
      currentSection.lines.push(line)
    }
  }

  // Push the last section
  if (currentSection) {
    sections.push(currentSection)
  }

  return sections
}

/**
 * Build nested section structure from flat sections
 * @param sections - Flat array of sections
 * @returns Nested section structure
 */
function buildSectionTree(sections: RawSection[]): SkillSection[] {
  const result: SkillSection[] = []
  const stack: { section: SkillSection; level: number }[] = []

  for (const raw of sections) {
    const section: SkillSection = {
      title: raw.title,
      level: raw.level,
      content: raw.lines.join('\n').trim(),
      subsections: [],
    }

    // Pop sections from stack that are same level or higher
    while (stack.length > 0 && stack[stack.length - 1].level >= raw.level) {
      stack.pop()
    }

    // Add to parent or root
    if (stack.length > 0) {
      stack[stack.length - 1].section.subsections.push(section)
    } else {
      result.push(section)
    }

    stack.push({ section, level: raw.level })
  }

  return result
}

// ============================================================================
// Content Extraction
// ============================================================================

/**
 * Find a section by title keywords
 * @param sections - The sections to search
 * @param keywords - Keywords to match in section titles
 * @returns The matching section or undefined
 */
function findSection(sections: SkillSection[], keywords: string[]): SkillSection | undefined {
  for (const section of sections) {
    const titleLower = section.title.toLowerCase()
    if (keywords.some((kw) => titleLower.includes(kw))) {
      return section
    }

    // Search subsections
    const found = findSection(section.subsections, keywords)
    if (found) return found
  }
  return undefined
}

/**
 * Extract list items from a section's content
 * @param section - The section to extract from
 * @returns Array of list item contents
 */
function extractListItems(section: SkillSection): string[] {
  const items: string[] = []
  const lines = section.content.split('\n')

  for (const line of lines) {
    if (isListItem(line)) {
      items.push(getListItemContent(line))
    }
  }

  return items
}

/**
 * Extract code blocks from content
 * @param content - The markdown content
 * @returns Array of code examples
 */
function extractCodeBlocks(content: string): Example[] {
  const examples: Example[] = []
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g

  let match
  while ((match = codeBlockRegex.exec(content)) !== null) {
    examples.push({
      language: match[1] || 'text',
      code: match[2].trim(),
    })
  }

  return examples
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse the body of a SKILL.md file
 * @param markdown - The markdown content (without frontmatter)
 * @returns Parsed skill body with structured sections
 */
export function parseSkillBody(markdown: string): ParsedSkillBody {
  const rawSections = splitIntoSections(markdown)
  const sections = buildSectionTree(rawSections)

  // Extract anti-patterns
  const antiPatternsSection = findSection(sections, [
    'anti-pattern',
    'antipattern',
    'pitfall',
    'avoid',
    'don\'t',
    'do not',
  ])
  const antiPatterns = antiPatternsSection ? extractListItems(antiPatternsSection) : []

  // Extract deliverables
  const deliverablesSection = findSection(sections, [
    'deliverable',
    'output',
    'result',
    'produce',
  ])
  const deliverables = deliverablesSection ? extractListItems(deliverablesSection) : []

  // Extract all code examples
  const examples = extractCodeBlocks(markdown)

  return {
    sections,
    antiPatterns,
    deliverables,
    examples,
    rawContent: markdown,
  }
}

/**
 * Get a flat list of all section titles
 * @param sections - The sections to flatten
 * @returns Array of section titles
 */
export function getAllSectionTitles(sections: SkillSection[]): string[] {
  const titles: string[] = []

  function collectTitles(secs: SkillSection[]) {
    for (const section of secs) {
      titles.push(section.title)
      collectTitles(section.subsections)
    }
  }

  collectTitles(sections)
  return titles
}

/**
 * Get section content by path (e.g., "Process/Phase 1")
 * @param sections - The sections to search
 * @param path - The section path separated by /
 * @returns The section content or undefined
 */
export function getSectionByPath(sections: SkillSection[], path: string): SkillSection | undefined {
  const parts = path.split('/').map((p) => p.trim().toLowerCase())
  let current: SkillSection[] = sections

  for (const part of parts) {
    const found = current.find((s) => s.title.toLowerCase() === part)
    if (!found) return undefined
    if (part === parts[parts.length - 1]) return found
    current = found.subsections
  }

  return undefined
}
