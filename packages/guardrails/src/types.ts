/**
 * Guardrails Types
 *
 * Core types for security and ethics guardrails.
 */

import { z } from 'zod'

// =============================================================================
// Scope Boundary Types
// =============================================================================

export type ScopeCategory = 'security' | 'privacy' | 'ethics' | 'compliance'

export interface ScopeItem {
  description: string
  examples: string[]
  rationale?: string
}

export interface ViolationType {
  scope: string
  item: string
  reason: string
  alternative?: string
}

export interface GuardrailResponse {
  allowed: boolean
  message: string
  suggestion?: string
  logEvent: boolean
}

export interface ScopeBoundary {
  name: string
  category: ScopeCategory
  inScope: ScopeItem[]
  outOfScope: ScopeItem[]
  violationHandler: (request: string, violation: ViolationType) => GuardrailResponse
}

// =============================================================================
// Content Filter Types
// =============================================================================

export type ContentFlag =
  | 'pii_detected'
  | 'phi_detected'
  | 'credential_detected'
  | 'exploit_code'
  | 'malicious_payload'
  | 'harmful_instruction'
  | 'scope_violation'

export interface FilterResult {
  allowed: boolean
  flags: ContentFlag[]
  sanitized?: string
  reason?: string
  detectedTypes?: string[]
}

export interface FilterLayer {
  name: string
  check(content: string): FilterResult
}

// =============================================================================
// Tool Guard Types
// =============================================================================

export interface ExecutionContext {
  tenantId: string
  requestId: string
  userId?: string
  permissions: string[]
}

export interface GuardResult {
  allowed: boolean
  reason?: string
  modifications?: {
    args?: unknown
    result?: unknown
  }
}

export interface ToolGuard {
  name: string
  appliesTo: string[]
  preExecute(tool: string, args: unknown, context: ExecutionContext): GuardResult
  postExecute?(tool: string, result: unknown, context: ExecutionContext): GuardResult
}

// =============================================================================
// Audit Types
// =============================================================================

export type AuditEventType =
  | 'scope_violation'
  | 'content_filtered'
  | 'tool_blocked'
  | 'pii_detected'
  | 'phi_detected'
  | 'credential_detected'
  | 'rate_limited'
  | 'sensitive_access'

export type AuditOutcome = 'allowed' | 'blocked' | 'flagged'

export interface AuditEventDetails {
  action: string
  resource?: string
  outcome: AuditOutcome
  reason?: string
  flags?: ContentFlag[]
}

export interface AuditEvent {
  timestamp: Date
  eventType: AuditEventType
  tenantId: string
  requestId: string
  details: AuditEventDetails
}

export const AuditEventSchema = z.object({
  timestamp: z.date(),
  eventType: z.enum([
    'scope_violation',
    'content_filtered',
    'tool_blocked',
    'pii_detected',
    'phi_detected',
    'credential_detected',
    'rate_limited',
    'sensitive_access',
  ]),
  tenantId: z.string(),
  requestId: z.string(),
  details: z.object({
    action: z.string(),
    resource: z.string().optional(),
    outcome: z.enum(['allowed', 'blocked', 'flagged']),
    reason: z.string().optional(),
    flags: z.array(z.string()).optional(),
  }),
})

// =============================================================================
// Constitution Types
// =============================================================================

export type EnforcementLevel = 'hard' | 'soft'

export interface Principle {
  name: string
  description: string
  enforcement: EnforcementLevel
}

export interface ConstitutionResult {
  compliant: boolean
  violations: string[]
  warnings: string[]
}

export interface AgentContext {
  tenantId: string
  threadId: string
  skillName?: string
  toolCalls?: string[]
}
