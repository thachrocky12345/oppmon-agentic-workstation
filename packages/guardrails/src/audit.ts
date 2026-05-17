// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Audit Logging
 *
 * Privacy-preserving audit logging for security events.
 */

import type {
  AuditEvent,
  AuditEventType,
  AuditOutcome,
  AuditEventDetails,
  ContentFlag,
} from './types.js'

// =============================================================================
// Audit Storage Interface
// =============================================================================

export interface AuditStorage {
  append(event: AuditEvent): Promise<void>
  query(filter: AuditQueryFilter): Promise<AuditEvent[]>
  count(filter: AuditQueryFilter): Promise<number>
}

export interface AuditQueryFilter {
  eventType?: AuditEventType | AuditEventType[]
  tenantId?: string
  outcome?: AuditOutcome
  startTime?: Date
  endTime?: Date
  limit?: number
  offset?: number
}

// =============================================================================
// In-Memory Storage
// =============================================================================

/**
 * In-memory audit storage for testing
 */
export class InMemoryAuditStorage implements AuditStorage {
  private events: AuditEvent[] = []

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event)
  }

  async query(filter: AuditQueryFilter): Promise<AuditEvent[]> {
    let results = this.events.filter((e) => this.matchesFilter(e, filter))

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // Apply pagination
    if (filter.offset) {
      results = results.slice(filter.offset)
    }
    if (filter.limit) {
      results = results.slice(0, filter.limit)
    }

    return results
  }

  async count(filter: AuditQueryFilter): Promise<number> {
    return this.events.filter((e) => this.matchesFilter(e, filter)).length
  }

  clear(): void {
    this.events = []
  }

  getAll(): AuditEvent[] {
    return [...this.events]
  }

  private matchesFilter(event: AuditEvent, filter: AuditQueryFilter): boolean {
    if (filter.eventType) {
      const types = Array.isArray(filter.eventType)
        ? filter.eventType
        : [filter.eventType]
      if (!types.includes(event.eventType)) return false
    }

    if (filter.tenantId && event.tenantId !== filter.tenantId) {
      return false
    }

    if (filter.outcome && event.details.outcome !== filter.outcome) {
      return false
    }

    if (filter.startTime && event.timestamp < filter.startTime) {
      return false
    }

    if (filter.endTime && event.timestamp > filter.endTime) {
      return false
    }

    return true
  }
}

// =============================================================================
// Alerter Interface
// =============================================================================

export interface AuditAlert {
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  details: AuditEventDetails
  eventType: AuditEventType
  tenantId: string
}

export interface Alerter {
  send(alert: AuditAlert): Promise<void>
}

/**
 * Console alerter for development
 */
export class ConsoleAlerter implements Alerter {
  async send(alert: AuditAlert): Promise<void> {
    const prefix = {
      low: '[INFO]',
      medium: '[WARN]',
      high: '[ALERT]',
      critical: '[CRITICAL]',
    }[alert.severity]

    console.log(`${prefix} Security Event: ${alert.message}`)
    console.log(`  Type: ${alert.eventType}`)
    console.log(`  Tenant: ${alert.tenantId}`)
    console.log(`  Outcome: ${alert.details.outcome}`)
    if (alert.details.reason) {
      console.log(`  Reason: ${alert.details.reason}`)
    }
  }
}

/**
 * In-memory alerter for testing
 */
export class InMemoryAlerter implements Alerter {
  private alerts: AuditAlert[] = []

  async send(alert: AuditAlert): Promise<void> {
    this.alerts.push(alert)
  }

  getAlerts(): AuditAlert[] {
    return [...this.alerts]
  }

  clear(): void {
    this.alerts = []
  }
}

// =============================================================================
// Audit Logger
// =============================================================================

export interface AuditLoggerConfig {
  storage: AuditStorage
  alerter?: Alerter
  criticalEvents?: AuditEventType[]
}

/**
 * Privacy-preserving audit logger
 *
 * Note: Does NOT log user_id by design to protect privacy.
 */
export class AuditLogger {
  private storage: AuditStorage
  private alerter?: Alerter
  private criticalEvents: Set<AuditEventType>

  constructor(config: AuditLoggerConfig) {
    this.storage = config.storage
    this.alerter = config.alerter
    this.criticalEvents = new Set(
      config.criticalEvents ?? [
        'scope_violation',
        'credential_detected',
        'phi_detected',
      ]
    )
  }

  /**
   * Log an audit event
   */
  async log(event: AuditEvent): Promise<void> {
    // Store event
    await this.storage.append(event)

    // Alert on critical events
    if (this.alerter && this.isCritical(event)) {
      await this.alerter.send({
        severity: this.getSeverity(event),
        message: `Security event: ${event.eventType}`,
        details: event.details,
        eventType: event.eventType,
        tenantId: event.tenantId,
      })
    }
  }

  /**
   * Log a scope violation
   */
  async logScopeViolation(
    tenantId: string,
    requestId: string,
    action: string,
    reason: string
  ): Promise<void> {
    await this.log({
      timestamp: new Date(),
      eventType: 'scope_violation',
      tenantId,
      requestId,
      details: {
        action,
        outcome: 'blocked',
        reason,
      },
    })
  }

  /**
   * Log content filtering
   */
  async logContentFiltered(
    tenantId: string,
    requestId: string,
    outcome: AuditOutcome,
    flags: ContentFlag[],
    reason?: string
  ): Promise<void> {
    const eventType = flags.includes('pii_detected')
      ? 'pii_detected'
      : flags.includes('phi_detected')
      ? 'phi_detected'
      : flags.includes('credential_detected')
      ? 'credential_detected'
      : 'content_filtered'

    await this.log({
      timestamp: new Date(),
      eventType,
      tenantId,
      requestId,
      details: {
        action: 'content_filter',
        outcome,
        reason,
        flags,
      },
    })
  }

  /**
   * Log tool blocked
   */
  async logToolBlocked(
    tenantId: string,
    requestId: string,
    tool: string,
    reason: string
  ): Promise<void> {
    await this.log({
      timestamp: new Date(),
      eventType: 'tool_blocked',
      tenantId,
      requestId,
      details: {
        action: `tool:${tool}`,
        outcome: 'blocked',
        reason,
      },
    })
  }

  /**
   * Query audit events
   */
  async query(filter: AuditQueryFilter): Promise<AuditEvent[]> {
    return this.storage.query(filter)
  }

  /**
   * Count audit events
   */
  async count(filter: AuditQueryFilter): Promise<number> {
    return this.storage.count(filter)
  }

  private isCritical(event: AuditEvent): boolean {
    return this.criticalEvents.has(event.eventType)
  }

  private getSeverity(event: AuditEvent): 'low' | 'medium' | 'high' | 'critical' {
    switch (event.eventType) {
      case 'credential_detected':
        return 'critical'
      case 'phi_detected':
      case 'scope_violation':
        return 'high'
      case 'tool_blocked':
      case 'pii_detected':
        return 'medium'
      default:
        return 'low'
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an audit logger with in-memory storage
 */
export function createInMemoryAuditLogger(): {
  logger: AuditLogger
  storage: InMemoryAuditStorage
  alerter: InMemoryAlerter
} {
  const storage = new InMemoryAuditStorage()
  const alerter = new InMemoryAlerter()
  const logger = new AuditLogger({ storage, alerter })
  return { logger, storage, alerter }
}
