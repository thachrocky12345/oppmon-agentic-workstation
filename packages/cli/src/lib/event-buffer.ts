/**
 * Event Buffer Management
 *
 * Non-blocking event buffer for Claude Code hooks.
 * CRITICAL: All operations must complete in <1ms to not block Claude Code.
 *
 * Events are stored in ~/.tag/events.buffer with a 10k event cap.
 * Buffer is flushed every 30 seconds by the flush service.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'

const TAG_DIR = join(homedir(), '.tag')
const BUFFER_FILE = join(TAG_DIR, 'events.buffer')
const SETTINGS_FILE = join(TAG_DIR, 'events.settings')
const MAX_BUFFER_SIZE = 10000

export interface BufferedEvent {
  resource_type: 'skill' | 'mcp_server' | 'rag_query'
  resource_id: string
  action: string
  timestamp: string
  metadata?: Record<string, unknown>
}

export interface EventSettings {
  enabled: boolean
  lastFlush?: string
  totalFlushed?: number
}

/**
 * Ensure ~/.tag directory exists
 */
function ensureTagDir(): void {
  if (!existsSync(TAG_DIR)) {
    mkdirSync(TAG_DIR, { recursive: true })
  }
}

/**
 * Get event settings
 */
export function getEventSettings(): EventSettings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const content = readFileSync(SETTINGS_FILE, 'utf-8')
      return JSON.parse(content)
    }
  } catch {
    // Ignore parse errors
  }
  return { enabled: false }
}

/**
 * Save event settings
 */
export function setEventSettings(settings: EventSettings): void {
  ensureTagDir()
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2))
}

/**
 * Check if events are enabled
 */
export function isEventsEnabled(): boolean {
  return getEventSettings().enabled
}

/**
 * Enable/disable events
 */
export function setEventsEnabled(enabled: boolean): void {
  const settings = getEventSettings()
  settings.enabled = enabled
  setEventSettings(settings)
}

/**
 * Append event to buffer (non-blocking, <1ms)
 *
 * CRITICAL: This function must be ultra-fast.
 * - Uses append-only writes (no read-modify-write)
 * - No validation beyond basic structure
 * - Silently drops events on any error
 */
export function appendEvent(event: BufferedEvent): boolean {
  try {
    // Quick check if events are enabled
    if (!isEventsEnabled()) {
      return false
    }

    ensureTagDir()

    // Append as single line (JSONL format for fast parsing)
    const line = JSON.stringify(event) + '\n'
    appendFileSync(BUFFER_FILE, line)

    return true
  } catch {
    // Silently fail - never block Claude Code
    return false
  }
}

/**
 * Read all buffered events
 */
export function readBufferedEvents(): BufferedEvent[] {
  try {
    if (!existsSync(BUFFER_FILE)) {
      return []
    }

    const content = readFileSync(BUFFER_FILE, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)

    return lines.slice(0, MAX_BUFFER_SIZE).map(line => {
      try {
        return JSON.parse(line) as BufferedEvent
      } catch {
        return null
      }
    }).filter((e): e is BufferedEvent => e !== null)
  } catch {
    return []
  }
}

/**
 * Get buffer size (number of events)
 */
export function getBufferSize(): number {
  try {
    if (!existsSync(BUFFER_FILE)) {
      return 0
    }

    const content = readFileSync(BUFFER_FILE, 'utf-8')
    return content.trim().split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

/**
 * Clear the buffer
 */
export function clearBuffer(): void {
  try {
    if (existsSync(BUFFER_FILE)) {
      writeFileSync(BUFFER_FILE, '')
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Truncate buffer if it exceeds max size
 * Keeps the most recent events
 */
export function truncateBuffer(): number {
  try {
    const events = readBufferedEvents()
    if (events.length > MAX_BUFFER_SIZE) {
      const truncated = events.slice(-MAX_BUFFER_SIZE)
      writeFileSync(BUFFER_FILE, truncated.map(e => JSON.stringify(e)).join('\n') + '\n')
      return events.length - MAX_BUFFER_SIZE
    }
    return 0
  } catch {
    return 0
  }
}

/**
 * Get buffer file path (for debugging/status)
 */
export function getBufferPath(): string {
  return BUFFER_FILE
}

/**
 * Get settings file path (for debugging/status)
 */
export function getSettingsPath(): string {
  return SETTINGS_FILE
}
