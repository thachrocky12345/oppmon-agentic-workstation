// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

/**
 * Guardrails Package
 *
 * Security and ethics guardrails for Arkon AI Gateway.
 *
 * @example
 * ```typescript
 * import {
 *   createDefaultFilter,
 *   createDefaultGuardRegistry,
 *   createDefaultConstitution,
 *   createInMemoryAuditLogger,
 *   SECURITY_RESEARCH_SCOPE,
 * } from '@arkon/guardrails'
 *
 * // Filter content
 * const filter = createDefaultFilter()
 * const result = filter.filterInput('Check this SSN: 123-45-6789')
 * if (result.flags.includes('pii_detected')) {
 *   console.log('PII detected:', result.detectedTypes)
 * }
 *
 * // Guard tool execution
 * const guards = createDefaultGuardRegistry()
 * const context = { tenantId: 't1', requestId: 'r1', permissions: [] }
 * const guardResult = guards.preExecute('shell', { command: 'rm -rf /' }, context)
 * if (!guardResult.allowed) {
 *   console.log('Blocked:', guardResult.reason)
 * }
 *
 * // Check constitution compliance
 * const constitution = createDefaultConstitution()
 * const agentContext = { tenantId: 't1', threadId: 'th1' }
 * const compliance = constitution.check('Write malware', agentContext)
 * if (!compliance.compliant) {
 *   console.log('Violations:', compliance.violations)
 * }
 *
 * // Audit logging
 * const { logger } = createInMemoryAuditLogger()
 * await logger.logScopeViolation('t1', 'r1', 'exploit', 'Offensive security')
 * ```
 *
 * @packageDocumentation
 */

// Types
export type {
  ScopeCategory,
  ScopeItem,
  ViolationType,
  GuardrailResponse,
  ScopeBoundary,
  ContentFlag,
  FilterResult,
  FilterLayer,
  ExecutionContext,
  GuardResult,
  ToolGuard,
  AuditEventType,
  AuditOutcome,
  AuditEventDetails,
  AuditEvent,
  EnforcementLevel,
  Principle,
  ConstitutionResult,
  AgentContext,
} from './types.js'

export { AuditEventSchema } from './types.js'

// Scope Boundaries
export {
  ScopeBoundaryRegistry,
  checkRequestScope,
  SECURITY_RESEARCH_SCOPE,
  PRIVACY_SCOPE,
  createDefaultScopeRegistry,
} from './scope.js'

// Content Filters
export {
  MultiLayerFilter,
  PIIFilter,
  PHIFilter,
  CredentialFilter,
  HarmfulContentFilter,
  createDefaultFilter,
  createFilter,
} from './filter.js'

export type { ContentFilter } from './filter.js'

// Tool Guards
export {
  ToolGuardRegistry,
  ShellGuard,
  SQLGuard,
  NetworkGuard,
  FileGuard,
  createDefaultGuardRegistry,
} from './tools.js'

// Audit Logging
export {
  InMemoryAuditStorage,
  ConsoleAlerter,
  InMemoryAlerter,
  AuditLogger,
  createInMemoryAuditLogger,
} from './audit.js'

export type {
  AuditStorage,
  AuditQueryFilter,
  AuditAlert,
  Alerter,
  AuditLoggerConfig,
} from './audit.js'

// Constitution
export {
  DEFAULT_PRINCIPLES,
  EthicsConstitution,
  createDefaultConstitution,
} from './constitution.js'

export type { Constitution } from './constitution.js'
