/**
 * Audit Logging Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  InMemoryAuditStorage,
  InMemoryAlerter,
  AuditLogger,
  createInMemoryAuditLogger,
} from '../audit.js'
import type { AuditEvent } from '../types.js'

describe('InMemoryAuditStorage', () => {
  let storage: InMemoryAuditStorage

  beforeEach(() => {
    storage = new InMemoryAuditStorage()
  })

  it('appends events', async () => {
    const event: AuditEvent = {
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 'tenant-1',
      requestId: 'request-1',
      details: {
        action: 'test',
        outcome: 'blocked',
      },
    }

    await storage.append(event)
    const events = await storage.query({})

    expect(events).toHaveLength(1)
    expect(events[0].eventType).toBe('scope_violation')
  })

  it('queries by event type', async () => {
    await storage.append({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 't1',
      requestId: 'r1',
      details: { action: 'a', outcome: 'blocked' },
    })

    await storage.append({
      timestamp: new Date(),
      eventType: 'pii_detected',
      tenantId: 't1',
      requestId: 'r2',
      details: { action: 'b', outcome: 'flagged' },
    })

    const results = await storage.query({ eventType: 'scope_violation' })
    expect(results).toHaveLength(1)
    expect(results[0].requestId).toBe('r1')
  })

  it('queries by tenant', async () => {
    await storage.append({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 'tenant-1',
      requestId: 'r1',
      details: { action: 'a', outcome: 'blocked' },
    })

    await storage.append({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 'tenant-2',
      requestId: 'r2',
      details: { action: 'b', outcome: 'blocked' },
    })

    const results = await storage.query({ tenantId: 'tenant-1' })
    expect(results).toHaveLength(1)
  })

  it('queries by outcome', async () => {
    await storage.append({
      timestamp: new Date(),
      eventType: 'pii_detected',
      tenantId: 't1',
      requestId: 'r1',
      details: { action: 'a', outcome: 'flagged' },
    })

    await storage.append({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 't1',
      requestId: 'r2',
      details: { action: 'b', outcome: 'blocked' },
    })

    const results = await storage.query({ outcome: 'blocked' })
    expect(results).toHaveLength(1)
    expect(results[0].requestId).toBe('r2')
  })

  it('queries by time range', async () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    await storage.append({
      timestamp: yesterday,
      eventType: 'scope_violation',
      tenantId: 't1',
      requestId: 'r1',
      details: { action: 'a', outcome: 'blocked' },
    })

    await storage.append({
      timestamp: lastWeek,
      eventType: 'scope_violation',
      tenantId: 't1',
      requestId: 'r2',
      details: { action: 'b', outcome: 'blocked' },
    })

    const results = await storage.query({
      startTime: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    })
    expect(results).toHaveLength(1)
    expect(results[0].requestId).toBe('r1')
  })

  it('supports pagination', async () => {
    for (let i = 0; i < 10; i++) {
      await storage.append({
        timestamp: new Date(Date.now() + i * 1000),
        eventType: 'scope_violation',
        tenantId: 't1',
        requestId: `r${i}`,
        details: { action: `a${i}`, outcome: 'blocked' },
      })
    }

    const page1 = await storage.query({ limit: 3 })
    expect(page1).toHaveLength(3)

    const page2 = await storage.query({ limit: 3, offset: 3 })
    expect(page2).toHaveLength(3)
    expect(page2[0].requestId).not.toBe(page1[0].requestId)
  })

  it('counts events', async () => {
    await storage.append({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 't1',
      requestId: 'r1',
      details: { action: 'a', outcome: 'blocked' },
    })

    await storage.append({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 't1',
      requestId: 'r2',
      details: { action: 'b', outcome: 'blocked' },
    })

    const count = await storage.count({ eventType: 'scope_violation' })
    expect(count).toBe(2)
  })

  it('clears all events', async () => {
    await storage.append({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 't1',
      requestId: 'r1',
      details: { action: 'a', outcome: 'blocked' },
    })

    storage.clear()

    const events = await storage.query({})
    expect(events).toHaveLength(0)
  })
})

describe('AuditLogger', () => {
  let logger: AuditLogger
  let storage: InMemoryAuditStorage
  let alerter: InMemoryAlerter

  beforeEach(() => {
    const result = createInMemoryAuditLogger()
    logger = result.logger
    storage = result.storage
    alerter = result.alerter
  })

  it('logs events', async () => {
    await logger.log({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 'tenant-1',
      requestId: 'request-1',
      details: {
        action: 'exploit',
        outcome: 'blocked',
        reason: 'Offensive security',
      },
    })

    const events = storage.getAll()
    expect(events).toHaveLength(1)
  })

  it('alerts on critical events', async () => {
    await logger.log({
      timestamp: new Date(),
      eventType: 'credential_detected',
      tenantId: 'tenant-1',
      requestId: 'request-1',
      details: {
        action: 'content_filter',
        outcome: 'blocked',
        reason: 'API key detected',
      },
    })

    const alerts = alerter.getAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('critical')
  })

  it('alerts on scope violations', async () => {
    await logger.log({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId: 'tenant-1',
      requestId: 'request-1',
      details: {
        action: 'exploit',
        outcome: 'blocked',
      },
    })

    const alerts = alerter.getAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('high')
  })

  it('alerts on PHI detection', async () => {
    await logger.log({
      timestamp: new Date(),
      eventType: 'phi_detected',
      tenantId: 'tenant-1',
      requestId: 'request-1',
      details: {
        action: 'content_filter',
        outcome: 'flagged',
      },
    })

    const alerts = alerter.getAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].severity).toBe('high')
  })

  it('does not alert on non-critical events', async () => {
    await logger.log({
      timestamp: new Date(),
      eventType: 'rate_limited',
      tenantId: 'tenant-1',
      requestId: 'request-1',
      details: {
        action: 'request',
        outcome: 'blocked',
      },
    })

    const alerts = alerter.getAlerts()
    expect(alerts).toHaveLength(0)
  })

  it('logs scope violation helper', async () => {
    await logger.logScopeViolation(
      'tenant-1',
      'request-1',
      'write_exploit',
      'Offensive security request'
    )

    const events = storage.getAll()
    expect(events).toHaveLength(1)
    expect(events[0].eventType).toBe('scope_violation')
    expect(events[0].details.reason).toContain('Offensive')
  })

  it('logs content filtered helper', async () => {
    await logger.logContentFiltered(
      'tenant-1',
      'request-1',
      'flagged',
      ['pii_detected'],
      'SSN detected'
    )

    const events = storage.getAll()
    expect(events).toHaveLength(1)
    expect(events[0].eventType).toBe('pii_detected')
    expect(events[0].details.flags).toContain('pii_detected')
  })

  it('logs tool blocked helper', async () => {
    await logger.logToolBlocked(
      'tenant-1',
      'request-1',
      'shell',
      'Dangerous command'
    )

    const events = storage.getAll()
    expect(events).toHaveLength(1)
    expect(events[0].eventType).toBe('tool_blocked')
    expect(events[0].details.action).toBe('tool:shell')
  })

  it('queries events', async () => {
    await logger.logScopeViolation('t1', 'r1', 'a', 'r')
    await logger.logScopeViolation('t2', 'r2', 'b', 'r')

    const results = await logger.query({ tenantId: 't1' })
    expect(results).toHaveLength(1)
  })

  it('counts events', async () => {
    await logger.logScopeViolation('t1', 'r1', 'a', 'r')
    await logger.logScopeViolation('t1', 'r2', 'b', 'r')

    const count = await logger.count({ tenantId: 't1' })
    expect(count).toBe(2)
  })
})
