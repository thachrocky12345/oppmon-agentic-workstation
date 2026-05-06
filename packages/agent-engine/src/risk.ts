/**
 * Risk Gate - Interceptor Chain
 * Security layer for filtering and modifying agent requests/responses
 */

import type { AgentRequest, AgentResponse, Decision, Interceptor } from './types.js'

// ============================================================================
// Risk Gate
// ============================================================================

export class RiskGate {
  private interceptors: Interceptor[] = []

  /**
   * Add an interceptor to the chain
   * @param interceptor - Interceptor to add
   */
  addInterceptor(interceptor: Interceptor): void {
    this.interceptors.push(interceptor)
  }

  /**
   * Remove an interceptor by name
   * @param name - Interceptor name
   */
  removeInterceptor(name: string): void {
    this.interceptors = this.interceptors.filter((i) => i.name !== name)
  }

  /**
   * Get all interceptor names
   * @returns Array of interceptor names
   */
  listInterceptors(): string[] {
    return this.interceptors.map((i) => i.name)
  }

  /**
   * Check request/response against all interceptors
   * @param request - The agent request
   * @param response - The agent response
   * @returns Final decision
   */
  check(request: AgentRequest, response: AgentResponse): Decision {
    for (const interceptor of this.interceptors) {
      const decision = interceptor.check(request, response)

      if (decision.type !== 'allow') {
        return decision
      }
    }

    return { type: 'allow' }
  }
}

// ============================================================================
// Built-in Interceptors
// ============================================================================

/**
 * Kill switch - immediately deny all requests when enabled
 */
export class KillSwitch implements Interceptor {
  name = 'kill-switch'
  private enabled = false

  enable(): void {
    this.enabled = true
  }

  disable(): void {
    this.enabled = false
  }

  isEnabled(): boolean {
    return this.enabled
  }

  check(): Decision {
    if (this.enabled) {
      return { type: 'deny', reason: 'Kill switch is enabled' }
    }
    return { type: 'allow' }
  }
}

/**
 * Rate limiter - limit requests per tenant
 */
export class RateLimiter implements Interceptor {
  name = 'rate-limiter'
  private requestsPerMinute: number
  private counters: Map<string, { count: number; resetAt: number }> = new Map()

  constructor(requestsPerMinute: number = 60) {
    this.requestsPerMinute = requestsPerMinute
  }

  setLimit(requestsPerMinute: number): void {
    this.requestsPerMinute = requestsPerMinute
  }

  check(request: AgentRequest): Decision {
    // Extract tenant ID from request
    let tenantId = 'default'
    if (request.type === 'chat') {
      tenantId = request.data.tenantId
    } else if (request.type === 'vectorSearch') {
      tenantId = request.data.tenantFilter
    }

    const now = Date.now()
    const entry = this.counters.get(tenantId)

    if (!entry || now > entry.resetAt) {
      // Start new window
      this.counters.set(tenantId, {
        count: 1,
        resetAt: now + 60000,
      })
      return { type: 'allow' }
    }

    if (entry.count >= this.requestsPerMinute) {
      return {
        type: 'deny',
        reason: `Rate limit exceeded: ${this.requestsPerMinute} requests per minute`,
      }
    }

    entry.count++
    return { type: 'allow' }
  }

  resetCounters(): void {
    this.counters.clear()
  }
}

/**
 * Confidence threshold - deny low-confidence responses
 */
export class ConfidenceThreshold implements Interceptor {
  name = 'confidence-threshold'
  private minConfidence: number

  constructor(minConfidence: number = 0.7) {
    this.minConfidence = minConfidence
  }

  setThreshold(minConfidence: number): void {
    this.minConfidence = minConfidence
  }

  check(_request: AgentRequest, response: AgentResponse): Decision {
    // Check vector search results for score
    if (response.type === 'vectorResults') {
      const lowConfidence = response.data.filter((d) => d.score < this.minConfidence)

      if (lowConfidence.length > 0 && response.data.length === lowConfidence.length) {
        return {
          type: 'deny',
          reason: `All results below confidence threshold (${this.minConfidence})`,
        }
      }
    }

    return { type: 'allow' }
  }
}

/**
 * Content filter - block requests/responses with certain patterns
 */
export class ContentFilter implements Interceptor {
  name = 'content-filter'
  private blockedPatterns: RegExp[] = []

  constructor(patterns: RegExp[] = []) {
    this.blockedPatterns = patterns
  }

  addPattern(pattern: RegExp): void {
    this.blockedPatterns.push(pattern)
  }

  clearPatterns(): void {
    this.blockedPatterns = []
  }

  check(request: AgentRequest, response: AgentResponse): Decision {
    // Check request content
    if (request.type === 'chat') {
      const content = request.data.message
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(content)) {
          return {
            type: 'deny',
            reason: `Content blocked by filter: ${pattern.source}`,
          }
        }
      }
    }

    // Check response content
    if (response.type === 'chatStream' && response.data.content) {
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(response.data.content)) {
          return {
            type: 'deny',
            reason: `Response blocked by filter: ${pattern.source}`,
          }
        }
      }
    }

    return { type: 'allow' }
  }
}

/**
 * Tenant isolation - ensure requests only access allowed tenant data
 */
export class TenantIsolation implements Interceptor {
  name = 'tenant-isolation'
  private allowedTenants: Set<string> = new Set()

  addTenant(tenantId: string): void {
    this.allowedTenants.add(tenantId)
  }

  removeTenant(tenantId: string): void {
    this.allowedTenants.delete(tenantId)
  }

  allowAll(): void {
    this.allowedTenants.clear()
  }

  check(request: AgentRequest): Decision {
    // Skip check if no tenants configured (allow all)
    if (this.allowedTenants.size === 0) {
      return { type: 'allow' }
    }

    let tenantId: string | null = null

    if (request.type === 'chat') {
      tenantId = request.data.tenantId
    } else if (request.type === 'vectorSearch') {
      tenantId = request.data.tenantFilter
    }

    if (tenantId && !this.allowedTenants.has(tenantId)) {
      return {
        type: 'deny',
        reason: `Tenant '${tenantId}' not authorized`,
      }
    }

    return { type: 'allow' }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a risk gate with default interceptors
 * @returns Configured risk gate
 */
export function createDefaultRiskGate(): RiskGate {
  const gate = new RiskGate()

  gate.addInterceptor(new KillSwitch())
  gate.addInterceptor(new RateLimiter(60))
  gate.addInterceptor(new ContentFilter())

  return gate
}
