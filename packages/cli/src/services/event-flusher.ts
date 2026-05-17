// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Event Flusher Service
 *
 * Background service that flushes buffered events to the API.
 * Runs every 30 seconds when events are enabled.
 */

import { createApiClient } from '../lib/api.js'
import {
  readBufferedEvents,
  clearBuffer,
  getEventSettings,
  setEventSettings,
  isEventsEnabled,
  getBufferSize,
  truncateBuffer,
} from '../lib/event-buffer.js'
import { isAuthenticated } from '../lib/credentials.js'

const FLUSH_INTERVAL_MS = 30000 // 30 seconds
const BATCH_SIZE = 100 // Max events per API call

export interface FlushResult {
  success: boolean
  flushed: number
  failed: number
  remaining: number
  error?: string
}

/**
 * Flush buffered events to the API
 *
 * Returns the result of the flush operation.
 */
export async function flushEvents(): Promise<FlushResult> {
  // Check if events are enabled
  if (!isEventsEnabled()) {
    return { success: true, flushed: 0, failed: 0, remaining: 0 }
  }

  // Check if authenticated
  if (!isAuthenticated()) {
    return {
      success: false,
      flushed: 0,
      failed: 0,
      remaining: getBufferSize(),
      error: 'Not authenticated',
    }
  }

  // Truncate if over limit
  truncateBuffer()

  // Read buffered events
  const events = readBufferedEvents()
  if (events.length === 0) {
    return { success: true, flushed: 0, failed: 0, remaining: 0 }
  }

  const api = createApiClient()
  let flushed = 0
  let failed = 0

  // Process in batches
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE)

    try {
      await api.recordUsageEvents(batch)
      flushed += batch.length
    } catch {
      // Try sending events one by one on batch failure
      for (const event of batch) {
        try {
          await api.recordUsageEvent(event)
          flushed++
        } catch {
          failed++
        }
      }
    }
  }

  // Clear buffer after successful flush
  if (failed === 0) {
    clearBuffer()
  }

  // Update settings with flush info
  const settings = getEventSettings()
  settings.lastFlush = new Date().toISOString()
  settings.totalFlushed = (settings.totalFlushed || 0) + flushed
  setEventSettings(settings)

  return {
    success: failed === 0,
    flushed,
    failed,
    remaining: failed,
  }
}

/**
 * Start the background flush timer
 *
 * Returns a function to stop the timer.
 */
export function startFlushTimer(): () => void {
  const intervalId = setInterval(async () => {
    if (isEventsEnabled() && isAuthenticated()) {
      await flushEvents()
    }
  }, FLUSH_INTERVAL_MS)

  return () => clearInterval(intervalId)
}

/**
 * Get flush status information
 */
export function getFlushStatus(): {
  enabled: boolean
  authenticated: boolean
  bufferSize: number
  lastFlush?: string
  totalFlushed?: number
} {
  const settings = getEventSettings()

  return {
    enabled: settings.enabled,
    authenticated: isAuthenticated(),
    bufferSize: getBufferSize(),
    lastFlush: settings.lastFlush,
    totalFlushed: settings.totalFlushed,
  }
}
