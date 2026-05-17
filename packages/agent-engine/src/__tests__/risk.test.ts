// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Risk Gate Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  RiskGate,
  KillSwitch,
  RateLimiter,
  ConfidenceThreshold,
  ContentFilter,
  TenantIsolation,
  createDefaultRiskGate,
} from '../risk.js'
import type { AgentRequest, AgentResponse, Interceptor, Decision } from '../types.js'

// Test fixtures
const chatRequest: AgentRequest = {
  type: 'chat',
  data: {
    tenantId: 'tenant-1',
    threadId: 'thread-1',
    message: 'Hello, world!',
    tools: [],
    maxIterations: 5,
  },
}

const chatResponse: AgentResponse = {
  type: 'chatStream',
  data: {
    type: 'text',
    content: 'Hello!',
  },
}

describe('RiskGate', () => {
  let gate: RiskGate

  beforeEach(() => {
    gate = new RiskGate()
  })

  describe('interceptor chain', () => {
    it('allows when no interceptors', () => {
      const decision = gate.check(chatRequest, chatResponse)
      expect(decision.type).toBe('allow')
    })

    it('checks all interceptors in order', () => {
      const order: number[] = []

      const interceptor1: Interceptor = {
        name: 'first',
        check: () => {
          order.push(1)
          return { type: 'allow' }
        },
      }

      const interceptor2: Interceptor = {
        name: 'second',
        check: () => {
          order.push(2)
          return { type: 'allow' }
        },
      }

      gate.addInterceptor(interceptor1)
      gate.addInterceptor(interceptor2)

      gate.check(chatRequest, chatResponse)

      expect(order).toEqual([1, 2])
    })

    it('stops on first deny', () => {
      const order: number[] = []

      const interceptor1: Interceptor = {
        name: 'first',
        check: () => {
          order.push(1)
          return { type: 'deny', reason: 'Denied by first' }
        },
      }

      const interceptor2: Interceptor = {
        name: 'second',
        check: () => {
          order.push(2)
          return { type: 'allow' }
        },
      }

      gate.addInterceptor(interceptor1)
      gate.addInterceptor(interceptor2)

      const decision = gate.check(chatRequest, chatResponse)

      expect(decision.type).toBe('deny')
      expect(order).toEqual([1]) // Second was never called
    })

    it('removes interceptors', () => {
      gate.addInterceptor({ name: 'test', check: () => ({ type: 'allow' }) })
      expect(gate.listInterceptors()).toContain('test')

      gate.removeInterceptor('test')
      expect(gate.listInterceptors()).not.toContain('test')
    })
  })
})

describe('KillSwitch', () => {
  let killSwitch: KillSwitch

  beforeEach(() => {
    killSwitch = new KillSwitch()
  })

  it('allows when disabled', () => {
    const decision = killSwitch.check(chatRequest, chatResponse)
    expect(decision.type).toBe('allow')
  })

  it('denies when enabled', () => {
    killSwitch.enable()

    const decision = killSwitch.check(chatRequest, chatResponse)

    expect(decision.type).toBe('deny')
    expect((decision as { type: 'deny'; reason: string }).reason).toContain('Kill switch')
  })

  it('allows after disable', () => {
    killSwitch.enable()
    killSwitch.disable()

    const decision = killSwitch.check(chatRequest, chatResponse)
    expect(decision.type).toBe('allow')
  })

  it('reports enabled state', () => {
    expect(killSwitch.isEnabled()).toBe(false)
    killSwitch.enable()
    expect(killSwitch.isEnabled()).toBe(true)
  })
})

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter(3) // 3 requests per minute
  })

  it('allows requests under limit', () => {
    expect(limiter.check(chatRequest, chatResponse).type).toBe('allow')
    expect(limiter.check(chatRequest, chatResponse).type).toBe('allow')
    expect(limiter.check(chatRequest, chatResponse).type).toBe('allow')
  })

  it('denies requests over limit', () => {
    limiter.check(chatRequest, chatResponse)
    limiter.check(chatRequest, chatResponse)
    limiter.check(chatRequest, chatResponse)

    const decision = limiter.check(chatRequest, chatResponse)

    expect(decision.type).toBe('deny')
    expect((decision as { type: 'deny'; reason: string }).reason).toContain('Rate limit')
  })

  it('tracks per tenant', () => {
    const tenant1: AgentRequest = {
      type: 'chat',
      data: { ...chatRequest.data, tenantId: 'tenant-1' },
    }

    const tenant2: AgentRequest = {
      type: 'chat',
      data: { ...chatRequest.data, tenantId: 'tenant-2' },
    }

    // Use all quota for tenant 1
    limiter.check(tenant1, chatResponse)
    limiter.check(tenant1, chatResponse)
    limiter.check(tenant1, chatResponse)

    // Tenant 2 should still have quota
    expect(limiter.check(tenant2, chatResponse).type).toBe('allow')

    // Tenant 1 is over limit
    expect(limiter.check(tenant1, chatResponse).type).toBe('deny')
  })

  it('resets counters', () => {
    limiter.check(chatRequest, chatResponse)
    limiter.check(chatRequest, chatResponse)
    limiter.check(chatRequest, chatResponse)

    limiter.resetCounters()

    expect(limiter.check(chatRequest, chatResponse).type).toBe('allow')
  })
})

describe('ConfidenceThreshold', () => {
  let threshold: ConfidenceThreshold

  beforeEach(() => {
    threshold = new ConfidenceThreshold(0.7)
  })

  it('allows high-confidence results', () => {
    const response: AgentResponse = {
      type: 'vectorResults',
      data: [
        { id: '1', content: 'doc1', score: 0.9, metadata: {} },
        { id: '2', content: 'doc2', score: 0.8, metadata: {} },
      ],
    }

    expect(threshold.check(chatRequest, response).type).toBe('allow')
  })

  it('denies when all results below threshold', () => {
    const response: AgentResponse = {
      type: 'vectorResults',
      data: [
        { id: '1', content: 'doc1', score: 0.5, metadata: {} },
        { id: '2', content: 'doc2', score: 0.6, metadata: {} },
      ],
    }

    const decision = threshold.check(chatRequest, response)
    expect(decision.type).toBe('deny')
  })

  it('allows if some results above threshold', () => {
    const response: AgentResponse = {
      type: 'vectorResults',
      data: [
        { id: '1', content: 'doc1', score: 0.9, metadata: {} },
        { id: '2', content: 'doc2', score: 0.5, metadata: {} },
      ],
    }

    expect(threshold.check(chatRequest, response).type).toBe('allow')
  })
})

describe('ContentFilter', () => {
  let filter: ContentFilter

  beforeEach(() => {
    filter = new ContentFilter([
      /password/i,
      /secret/i,
      /api[_-]?key/i,
    ])
  })

  it('allows clean content', () => {
    expect(filter.check(chatRequest, chatResponse).type).toBe('allow')
  })

  it('blocks request with blocked pattern', () => {
    const badRequest: AgentRequest = {
      type: 'chat',
      data: {
        ...chatRequest.data,
        message: 'What is my password?',
      },
    }

    const decision = filter.check(badRequest, chatResponse)
    expect(decision.type).toBe('deny')
  })

  it('blocks response with blocked pattern', () => {
    const badResponse: AgentResponse = {
      type: 'chatStream',
      data: {
        type: 'text',
        content: 'Your API_KEY is xyz123',
      },
    }

    const decision = filter.check(chatRequest, badResponse)
    expect(decision.type).toBe('deny')
  })

  it('adds patterns dynamically', () => {
    filter.addPattern(/forbidden/i)

    const badRequest: AgentRequest = {
      type: 'chat',
      data: {
        ...chatRequest.data,
        message: 'Tell me the forbidden knowledge',
      },
    }

    expect(filter.check(badRequest, chatResponse).type).toBe('deny')
  })
})

describe('TenantIsolation', () => {
  let isolation: TenantIsolation

  beforeEach(() => {
    isolation = new TenantIsolation()
  })

  it('allows all when no tenants configured', () => {
    expect(isolation.check(chatRequest, chatResponse).type).toBe('allow')
  })

  it('allows configured tenants', () => {
    isolation.addTenant('tenant-1')

    expect(isolation.check(chatRequest, chatResponse).type).toBe('allow')
  })

  it('denies unconfigured tenants', () => {
    isolation.addTenant('tenant-1')

    const otherRequest: AgentRequest = {
      type: 'chat',
      data: { ...chatRequest.data, tenantId: 'tenant-2' },
    }

    expect(isolation.check(otherRequest, chatResponse).type).toBe('deny')
  })

  it('allows all after allowAll()', () => {
    isolation.addTenant('tenant-1')
    isolation.allowAll()

    const anyRequest: AgentRequest = {
      type: 'chat',
      data: { ...chatRequest.data, tenantId: 'any-tenant' },
    }

    expect(isolation.check(anyRequest, chatResponse).type).toBe('allow')
  })
})

describe('createDefaultRiskGate', () => {
  it('creates gate with default interceptors', () => {
    const gate = createDefaultRiskGate()
    const interceptors = gate.listInterceptors()

    expect(interceptors).toContain('kill-switch')
    expect(interceptors).toContain('rate-limiter')
    expect(interceptors).toContain('content-filter')
  })
})
