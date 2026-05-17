// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Grep-able Markers System
 * Scans content for audit markers and generates reports
 */

import { promises as fs } from 'fs'
import { glob } from 'glob'
import * as path from 'path'

// ============================================================================
// Marker Types
// ============================================================================

export const MARKER_TYPES = {
  DRAFT: '[DRAFT]',
  DRAFT_VERSION: /\[DRAFT v\d+\]/,
  VERIFY: /\[VERIFY:\s*([^\]]+)\]/,
  NOT_READ: '[NOT READ]',
  TODO: /\[TODO:\s*([^\]]+)\]/,
  VIVA: '[VIVA?]',
  CHECK: /\[CHECK:\s*([^\]]+)\]/,
  CITE: /\[CITE:\s*([^\]]+)\]/,
} as const

export type MarkerType = keyof typeof MARKER_TYPES

export interface FoundMarker {
  type: MarkerType
  location: {
    file: string
    line: number
    column: number
  }
  context: string // Surrounding text
  reason?: string // For markers with content like [VERIFY: reason]
  rawMatch: string
}

export interface AuditReport {
  scannedAt: Date
  directory: string
  totalFiles: number
  totalMarkers: number
  byType: Record<MarkerType, FoundMarker[]>
  summary: {
    drafts: number
    verifications: number
    unreadPapers: number
    todos: number
    vivaPoints: number
    checks: number
    citations: number
  }
}

// ============================================================================
// Marker Scanner
// ============================================================================

export class MarkerScanner {
  private patterns: Map<MarkerType, RegExp> = new Map()

  constructor() {
    // Convert marker definitions to regex patterns
    this.patterns.set('DRAFT', /\[DRAFT\]/g)
    this.patterns.set('DRAFT_VERSION', /\[DRAFT v\d+\]/g)
    this.patterns.set('VERIFY', /\[VERIFY:\s*([^\]]+)\]/g)
    this.patterns.set('NOT_READ', /\[NOT READ\]/g)
    this.patterns.set('TODO', /\[TODO:\s*([^\]]+)\]/g)
    this.patterns.set('VIVA', /\[VIVA\?\]/g)
    this.patterns.set('CHECK', /\[CHECK:\s*([^\]]+)\]/g)
    this.patterns.set('CITE', /\[CITE:\s*([^\]]+)\]/g)
  }

  /**
   * Scan a single piece of content for markers
   * @param content - The content to scan
   * @param file - The file path for location info
   * @returns Array of found markers
   */
  scan(content: string, file: string = 'inline'): FoundMarker[] {
    const markers: FoundMarker[] = []
    const lines = content.split('\n')

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]

      for (const [type, pattern] of this.patterns) {
        // Reset regex state
        pattern.lastIndex = 0

        let match
        while ((match = pattern.exec(line)) !== null) {
          const marker: FoundMarker = {
            type,
            location: {
              file,
              line: lineIndex + 1,
              column: match.index + 1,
            },
            context: this.getContext(lines, lineIndex),
            rawMatch: match[0],
          }

          // Extract reason for markers with content
          if (['VERIFY', 'TODO', 'CHECK', 'CITE'].includes(type) && match[1]) {
            marker.reason = match[1].trim()
          }

          markers.push(marker)
        }
      }
    }

    return markers
  }

  /**
   * Get surrounding context for a marker
   * @param lines - All lines
   * @param lineIndex - Index of the marker line
   * @param contextLines - Number of lines before/after to include
   * @returns Context string
   */
  private getContext(lines: string[], lineIndex: number, contextLines: number = 1): string {
    const start = Math.max(0, lineIndex - contextLines)
    const end = Math.min(lines.length, lineIndex + contextLines + 1)
    return lines.slice(start, end).join('\n')
  }

  /**
   * Scan a file for markers
   * @param filePath - Path to the file
   * @returns Array of found markers
   */
  async scanFile(filePath: string): Promise<FoundMarker[]> {
    const content = await fs.readFile(filePath, 'utf-8')
    return this.scan(content, filePath)
  }

  /**
   * Scan a directory for markers
   * @param directory - Directory to scan
   * @param patterns - Glob patterns for files to include
   * @returns Audit report
   */
  async scanDirectory(
    directory: string,
    patterns: string[] = ['**/*.md', '**/*.txt', '**/*.tex']
  ): Promise<AuditReport> {
    const allMarkers: FoundMarker[] = []
    let totalFiles = 0

    for (const pattern of patterns) {
      const files = await glob(path.join(directory, pattern).replace(/\\/g, '/'))

      for (const file of files) {
        totalFiles++
        const markers = await this.scanFile(file)
        allMarkers.push(...markers)
      }
    }

    // Group by type
    const byType: Record<MarkerType, FoundMarker[]> = {
      DRAFT: [],
      DRAFT_VERSION: [],
      VERIFY: [],
      NOT_READ: [],
      TODO: [],
      VIVA: [],
      CHECK: [],
      CITE: [],
    }

    for (const marker of allMarkers) {
      byType[marker.type].push(marker)
    }

    return {
      scannedAt: new Date(),
      directory,
      totalFiles,
      totalMarkers: allMarkers.length,
      byType,
      summary: {
        drafts: byType.DRAFT.length + byType.DRAFT_VERSION.length,
        verifications: byType.VERIFY.length,
        unreadPapers: byType.NOT_READ.length,
        todos: byType.TODO.length,
        vivaPoints: byType.VIVA.length,
        checks: byType.CHECK.length,
        citations: byType.CITE.length,
      },
    }
  }

  /**
   * Generate a human-readable audit report
   * @param report - The audit report
   * @returns Formatted report string
   */
  formatReport(report: AuditReport): string {
    const lines: string[] = []

    lines.push('=== Draft Audit Report ===')
    lines.push('')
    lines.push(`Scanned: ${report.directory}`)
    lines.push(`Files: ${report.totalFiles}`)
    lines.push(`Total markers: ${report.totalMarkers}`)
    lines.push('')

    // Summary
    lines.push('--- Summary ---')
    lines.push(`[DRAFT] sections: ${report.summary.drafts}`)
    lines.push(`[VERIFY] items: ${report.summary.verifications}`)
    lines.push(`[NOT READ] papers: ${report.summary.unreadPapers}`)
    lines.push(`[TODO] items: ${report.summary.todos}`)
    lines.push(`[VIVA?] points: ${report.summary.vivaPoints}`)
    lines.push(`[CHECK] items: ${report.summary.checks}`)
    lines.push(`[CITE] needed: ${report.summary.citations}`)
    lines.push('')

    // Details for verification items
    if (report.byType.VERIFY.length > 0) {
      lines.push('--- Verification Needed ---')
      for (const marker of report.byType.VERIFY) {
        lines.push(`  ${marker.location.file}:${marker.location.line} - ${marker.reason}`)
      }
      lines.push('')
    }

    // Details for TODO items
    if (report.byType.TODO.length > 0) {
      lines.push('--- TODO Items ---')
      for (const marker of report.byType.TODO) {
        lines.push(`  ${marker.location.file}:${marker.location.line} - ${marker.reason}`)
      }
      lines.push('')
    }

    // Details for unread papers
    if (report.byType.NOT_READ.length > 0) {
      lines.push('--- Unread Papers ---')
      for (const marker of report.byType.NOT_READ) {
        lines.push(`  ${marker.location.file}:${marker.location.line}`)
      }
      lines.push('')
    }

    // Details for VIVA points
    if (report.byType.VIVA.length > 0) {
      lines.push('--- VIVA Vulnerability Points ---')
      for (const marker of report.byType.VIVA) {
        lines.push(`  ${marker.location.file}:${marker.location.line}`)
        lines.push(`    ${marker.context.split('\n')[0]}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Quick scan of content for a specific marker type
 * @param content - Content to scan
 * @param type - Marker type to find
 * @returns Array of found markers
 */
export function findMarkers(content: string, type: MarkerType): FoundMarker[] {
  const scanner = new MarkerScanner()
  return scanner.scan(content).filter((m) => m.type === type)
}

/**
 * Check if content has any markers
 * @param content - Content to check
 * @returns True if any markers found
 */
export function hasMarkers(content: string): boolean {
  const scanner = new MarkerScanner()
  return scanner.scan(content).length > 0
}

/**
 * Count markers by type in content
 * @param content - Content to scan
 * @returns Counts by marker type
 */
export function countMarkers(content: string): Record<MarkerType, number> {
  const scanner = new MarkerScanner()
  const markers = scanner.scan(content)

  const counts: Record<MarkerType, number> = {
    DRAFT: 0,
    DRAFT_VERSION: 0,
    VERIFY: 0,
    NOT_READ: 0,
    TODO: 0,
    VIVA: 0,
    CHECK: 0,
    CITE: 0,
  }

  for (const marker of markers) {
    counts[marker.type]++
  }

  return counts
}
