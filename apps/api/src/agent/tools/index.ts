/**
 * Agent Tools Index
 *
 * Central registration point for all built-in tools.
 */

import type { Toolbox } from '../toolbox'
import { registerRetrievalTools } from './retrieval'

/**
 * Register all built-in tools with the toolbox
 */
export function registerBuiltinTools(toolbox: Toolbox): void {
  registerRetrievalTools(toolbox)
}

export { registerRetrievalTools }
