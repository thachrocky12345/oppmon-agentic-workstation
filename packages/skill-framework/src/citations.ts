/**
 * Citation Verification System
 * Validates BibTeX files and checks for common issues
 */

// ============================================================================
// Types
// ============================================================================

export interface BibEntry {
  type: string // article, inproceedings, book, etc.
  key: string // Citation key
  fields: Record<string, string>
  raw: string // Original BibTeX string
  lineNumber: number
}

export interface VerificationError {
  type: 'duplicate_key' | 'missing_field' | 'malformed' | 'todo_marker' | 'invalid_year'
  message: string
  entry?: BibEntry
  line?: number
}

export interface VerificationWarning {
  type: 'missing_optional' | 'unusual_venue' | 'old_paper' | 'self_citation'
  message: string
  entry?: BibEntry
}

export interface VerificationResult {
  valid: boolean
  totalEntries: number
  errors: VerificationError[]
  warnings: VerificationWarning[]
  entries: BibEntry[]
}

// ============================================================================
// Required Fields by Entry Type
// ============================================================================

export const REQUIRED_FIELDS: Record<string, string[]> = {
  article: ['author', 'title', 'journal', 'year'],
  inproceedings: ['author', 'title', 'booktitle', 'year'],
  book: ['author', 'title', 'publisher', 'year'],
  incollection: ['author', 'title', 'booktitle', 'publisher', 'year'],
  techreport: ['author', 'title', 'institution', 'year'],
  phdthesis: ['author', 'title', 'school', 'year'],
  mastersthesis: ['author', 'title', 'school', 'year'],
  misc: ['author', 'title', 'year'],
  online: ['author', 'title', 'url', 'year'],
  unpublished: ['author', 'title', 'note'],
}

export const OPTIONAL_FIELDS: Record<string, string[]> = {
  article: ['volume', 'number', 'pages', 'doi'],
  inproceedings: ['pages', 'doi', 'organization'],
  book: ['edition', 'isbn'],
}

// ============================================================================
// BibTeX Parser
// ============================================================================

export class BibTeXParser {
  /**
   * Parse a BibTeX file content
   * @param content - The BibTeX file content
   * @returns Array of parsed entries
   */
  parse(content: string): { entries: BibEntry[]; errors: VerificationError[] } {
    const entries: BibEntry[] = []
    const errors: VerificationError[] = []

    // Match BibTeX entries
    const entryRegex = /@(\w+)\s*\{([^,]+),\s*([\s\S]*?)\n\}/g

    let match
    while ((match = entryRegex.exec(content)) !== null) {
      const type = match[1].toLowerCase()
      const key = match[2].trim()
      const fieldsStr = match[3]
      const lineNumber = content.substring(0, match.index).split('\n').length

      try {
        const fields = this.parseFields(fieldsStr)

        entries.push({
          type,
          key,
          fields,
          raw: match[0],
          lineNumber,
        })
      } catch (e) {
        errors.push({
          type: 'malformed',
          message: `Failed to parse entry '${key}': ${e instanceof Error ? e.message : String(e)}`,
          line: lineNumber,
        })
      }
    }

    return { entries, errors }
  }

  /**
   * Parse the fields from a BibTeX entry
   * @param fieldsStr - The fields portion of an entry
   * @returns Parsed fields as key-value pairs
   */
  private parseFields(fieldsStr: string): Record<string, string> {
    const fields: Record<string, string> = {}

    // Match field = value or field = {value} or field = "value"
    const fieldRegex = /(\w+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)"|(\d+))/g

    let match
    while ((match = fieldRegex.exec(fieldsStr)) !== null) {
      const fieldName = match[1].toLowerCase()
      const value = match[2] || match[3] || match[4] || ''
      fields[fieldName] = value.trim()
    }

    return fields
  }
}

// ============================================================================
// Citation Verifier
// ============================================================================

export class CitationVerifier {
  private parser: BibTeXParser

  constructor() {
    this.parser = new BibTeXParser()
  }

  /**
   * Verify a BibTeX file content
   * @param content - The BibTeX file content
   * @returns Verification result
   */
  verify(content: string): VerificationResult {
    const { entries, errors } = this.parser.parse(content)
    const warnings: VerificationWarning[] = []

    // Check for duplicates
    const seenKeys = new Map<string, BibEntry>()
    for (const entry of entries) {
      const existing = seenKeys.get(entry.key)
      if (existing) {
        errors.push({
          type: 'duplicate_key',
          message: `Duplicate citation key '${entry.key}' (also at line ${existing.lineNumber})`,
          entry,
          line: entry.lineNumber,
        })
      } else {
        seenKeys.set(entry.key, entry)
      }
    }

    // Check required fields
    for (const entry of entries) {
      const required = REQUIRED_FIELDS[entry.type] || []

      for (const field of required) {
        if (!entry.fields[field]) {
          errors.push({
            type: 'missing_field',
            message: `Entry '${entry.key}' missing required field '${field}'`,
            entry,
            line: entry.lineNumber,
          })
        }
      }

      // Check for TODO markers in fields
      for (const [field, value] of Object.entries(entry.fields)) {
        if (
          value.includes('[TODO') ||
          value.includes('???') ||
          value.includes('XXX')
        ) {
          errors.push({
            type: 'todo_marker',
            message: `Entry '${entry.key}' has placeholder in field '${field}'`,
            entry,
            line: entry.lineNumber,
          })
        }
      }

      // Check year validity
      if (entry.fields.year) {
        const year = parseInt(entry.fields.year)
        const currentYear = new Date().getFullYear()

        if (isNaN(year) || year < 1800 || year > currentYear + 1) {
          errors.push({
            type: 'invalid_year',
            message: `Entry '${entry.key}' has invalid year '${entry.fields.year}'`,
            entry,
            line: entry.lineNumber,
          })
        }

        // Warn about old papers
        if (year < currentYear - 20) {
          warnings.push({
            type: 'old_paper',
            message: `Entry '${entry.key}' is from ${year} (${currentYear - year} years old)`,
            entry,
          })
        }
      }

      // Check for missing optional fields
      const optional = OPTIONAL_FIELDS[entry.type] || []
      const missingOptional = optional.filter((f) => !entry.fields[f])
      if (missingOptional.length > 0) {
        warnings.push({
          type: 'missing_optional',
          message: `Entry '${entry.key}' missing optional fields: ${missingOptional.join(', ')}`,
          entry,
        })
      }
    }

    return {
      valid: errors.length === 0,
      totalEntries: entries.length,
      errors,
      warnings,
      entries,
    }
  }

  /**
   * Verify a BibTeX file
   * @param filePath - Path to the .bib file
   * @returns Verification result
   */
  async verifyFile(filePath: string): Promise<VerificationResult> {
    const fs = await import('fs')
    const content = await fs.promises.readFile(filePath, 'utf-8')
    return this.verify(content)
  }

  /**
   * Format verification result as string
   * @param result - The verification result
   * @returns Formatted string
   */
  formatResult(result: VerificationResult): string {
    const lines: string[] = []

    if (result.valid) {
      lines.push(`✓ ${result.totalEntries} entries verified`)
    } else {
      lines.push(`✗ ${result.errors.length} errors found:`)
      for (const error of result.errors) {
        lines.push(`  - Line ${error.line || '?'}: ${error.message}`)
      }
    }

    if (result.warnings.length > 0) {
      lines.push('')
      lines.push(`⚠ ${result.warnings.length} warnings:`)
      for (const warning of result.warnings) {
        lines.push(`  - ${warning.message}`)
      }
    }

    return lines.join('\n')
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Quick check if a BibTeX string has any errors
 * @param content - BibTeX content
 * @returns True if valid
 */
export function isValidBibTeX(content: string): boolean {
  const verifier = new CitationVerifier()
  return verifier.verify(content).valid
}

/**
 * Get all citation keys from BibTeX content
 * @param content - BibTeX content
 * @returns Array of citation keys
 */
export function getCitationKeys(content: string): string[] {
  const verifier = new CitationVerifier()
  const result = verifier.verify(content)
  return result.entries.map((e) => e.key)
}

/**
 * Find duplicate citation keys
 * @param content - BibTeX content
 * @returns Array of duplicate keys
 */
export function findDuplicateKeys(content: string): string[] {
  const verifier = new CitationVerifier()
  const result = verifier.verify(content)

  return result.errors
    .filter((e) => e.type === 'duplicate_key')
    .map((e) => e.entry?.key || '')
    .filter((k) => k !== '')
}
