# TAG-47: Security & Ethics Guardrails

## Description

**Suggested Points:** 8 (High — implementing content filtering, scope boundaries for skills, defensive-only security research constraints, PII/PHI leak prevention, and audit trails for sensitive operations)

## Objective

Implement comprehensive security and ethics guardrails for the agent system, including explicit scope boundaries (in-scope vs out-of-scope), content filtering, defensive-only constraints for security research, PII/PHI leak prevention, and audit logging for sensitive operations.

## Requirements

### Scope Boundary Framework

```typescript
// packages/guardrails/src/scope.ts

interface ScopeBoundary {
  name: string
  category: 'security' | 'privacy' | 'ethics' | 'compliance'

  // What the skill/agent CAN help with
  inScope: ScopeItem[]

  // What the skill/agent will NOT help with
  outOfScope: ScopeItem[]

  // How to handle boundary violations
  violationHandler: (request: string, violation: ViolationType) => GuardrailResponse
}

interface ScopeItem {
  description: string
  examples: string[]
  rationale?: string
}

// Example: Security Research Scope
const securityResearchScope: ScopeBoundary = {
  name: 'security-research',
  category: 'security',

  inScope: [
    {
      description: 'Analyzing vulnerability classes, root causes, and mitigations',
      examples: ['Explain how SQL injection works', 'What are common buffer overflow mitigations?'],
    },
    {
      description: 'Studying attacker techniques to design detectors and defenses',
      examples: ['How do I detect lateral movement?', 'What indicators suggest ransomware?'],
    },
    {
      description: 'Building datasets and benchmarks for security ML',
      examples: ['How to structure a malware classification dataset?', 'What features are useful for network anomaly detection?'],
    },
    {
      description: 'CVE analysis, SoK papers, taxonomy work',
      examples: ['Summarize CVE-2024-1234', 'Categorize these vulnerabilities by CWE'],
    },
    {
      description: 'Responsible disclosure processes',
      examples: ['How do I report a vulnerability to a vendor?', 'What is coordinated disclosure?'],
    },
    {
      description: 'Threat modeling for defensive purposes',
      examples: ['Help me threat model my API', 'What STRIDE threats apply here?'],
    },
  ],

  outOfScope: [
    {
      description: 'Producing functional exploits for unpatched vulnerabilities',
      examples: ['Write an exploit for CVE-2024-XXXX', 'Give me working shellcode'],
      rationale: 'Could enable attacks on unpatched systems',
    },
    {
      description: 'Generating malware, ransomware, or weaponized PoCs',
      examples: ['Write a keylogger', 'Create ransomware that encrypts files'],
      rationale: 'Direct harm potential',
    },
    {
      description: 'Attacking systems the user does not own or have authorization for',
      examples: ['How do I hack my ex\'s email?', 'Penetrate this production server'],
      rationale: 'Unauthorized access is illegal',
    },
    {
      description: 'Bypassing protections on unauthorized systems',
      examples: ['How to bypass WAF on target.com?', 'Evade this specific EDR'],
      rationale: 'Facilitates unauthorized access',
    },
    {
      description: 'Surveillance, stalkerware, or tracking without consent',
      examples: ['Track someone\'s location', 'Monitor my partner\'s messages'],
      rationale: 'Privacy violation and potential abuse',
    },
    {
      description: 'Generating phishing content or social engineering scripts',
      examples: ['Write a phishing email', 'Create a pretexting script'],
      rationale: 'Facilitates fraud and deception',
    },
  ],

  violationHandler: (request, violation) => {
    return {
      allowed: false,
      message: `This request falls outside my scope. I focus on defensive security research. ${violation.reason}`,
      suggestion: violation.alternative,
      logEvent: true,
    }
  },
}
```

### Content Filter

```typescript
// packages/guardrails/src/filter.ts

interface ContentFilter {
  // Check input before processing
  filterInput(content: string): FilterResult

  // Check output before returning
  filterOutput(content: string): FilterResult

  // Check tool calls before execution
  filterToolCall(tool: string, args: unknown): FilterResult
}

interface FilterResult {
  allowed: boolean
  flags: ContentFlag[]
  sanitized?: string  // Cleaned version if applicable
  reason?: string
}

type ContentFlag =
  | 'pii_detected'
  | 'phi_detected'
  | 'credential_detected'
  | 'exploit_code'
  | 'malicious_payload'
  | 'harmful_instruction'
  | 'scope_violation'

class MultiLayerFilter implements ContentFilter {
  private layers: FilterLayer[]

  filterInput(content: string): FilterResult {
    const flags: ContentFlag[] = []

    for (const layer of this.layers) {
      const result = layer.check(content)
      if (!result.allowed) {
        return result
      }
      flags.push(...result.flags)
    }

    return { allowed: true, flags }
  }
}

// Built-in filter layers
class PIIFilter implements FilterLayer {
  private patterns = {
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  }

  check(content: string): FilterResult {
    const detected: string[] = []

    for (const [type, pattern] of Object.entries(this.patterns)) {
      if (pattern.test(content)) {
        detected.push(type)
      }
    }

    return {
      allowed: true,  // Allow but flag
      flags: detected.length > 0 ? ['pii_detected'] : [],
      reason: detected.length > 0 ? `Detected PII types: ${detected.join(', ')}` : undefined,
    }
  }
}

class PHIFilter implements FilterLayer {
  private patterns = {
    medicalRecordNumber: /\bMRN[:\s]*\d+\b/gi,
    diagnosis: /\b(diagnosis|dx)[:\s]*.+/gi,
    medication: /\b(medication|rx)[:\s]*.+/gi,
    healthInsurance: /\b(policy|member)\s*#?\s*\d+\b/gi,
  }

  // ... similar to PII filter
}

class CredentialFilter implements FilterLayer {
  private patterns = {
    apiKey: /\b(api[_-]?key|apikey)[:\s=]*['"a-zA-Z0-9-_]+/gi,
    password: /\b(password|passwd|pwd)[:\s=]*\S+/gi,
    token: /\b(token|bearer)[:\s=]*[a-zA-Z0-9-_.]+/gi,
    awsKey: /\bAKIA[0-9A-Z]{16}\b/g,
    privateKey: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  }

  check(content: string): FilterResult {
    for (const [type, pattern] of Object.entries(this.patterns)) {
      if (pattern.test(content)) {
        return {
          allowed: false,
          flags: ['credential_detected'],
          reason: `Detected potential credential: ${type}. Never include credentials in agent requests.`,
        }
      }
    }
    return { allowed: true, flags: [] }
  }
}
```

### Tool Execution Guards

```typescript
// packages/guardrails/src/tools.ts

interface ToolGuard {
  // Check before tool execution
  preExecute(tool: string, args: unknown, context: ExecutionContext): GuardResult

  // Check after tool execution
  postExecute(tool: string, result: unknown, context: ExecutionContext): GuardResult
}

interface GuardResult {
  allowed: boolean
  reason?: string
  modifications?: {
    args?: unknown
    result?: unknown
  }
}

// Dangerous tool categories
const RESTRICTED_TOOLS = {
  shell: ['execute_command', 'run_script', 'shell'],
  network: ['http_request', 'fetch_url', 'call_api'],
  file: ['write_file', 'delete_file', 'modify_file'],
  database: ['execute_sql', 'raw_query'],
}

class ShellGuard implements ToolGuard {
  private allowedCommands = ['ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc']
  private blockedPatterns = [
    /rm\s+-rf/,
    /curl.*\|.*sh/,
    /wget.*\|.*bash/,
    />\s*\/dev\/sd/,
    /dd\s+if=/,
    /mkfs/,
    /:(){ :|:& };:/,  // Fork bomb
  ]

  preExecute(tool: string, args: { command: string }): GuardResult {
    const cmd = args.command.toLowerCase()

    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(cmd)) {
        return {
          allowed: false,
          reason: `Blocked dangerous command pattern: ${pattern}`,
        }
      }
    }

    // Warn on unrestricted commands
    const firstWord = cmd.split(/\s+/)[0]
    if (!this.allowedCommands.includes(firstWord)) {
      return {
        allowed: false,
        reason: `Command '${firstWord}' requires explicit user approval`,
      }
    }

    return { allowed: true }
  }
}

class SQLGuard implements ToolGuard {
  private blockedStatements = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE', 'INSERT', 'UPDATE']

  preExecute(tool: string, args: { query: string }): GuardResult {
    const query = args.query.toUpperCase()

    for (const stmt of this.blockedStatements) {
      if (query.includes(stmt)) {
        return {
          allowed: false,
          reason: `Write operations (${stmt}) require explicit approval. Agent only has read access.`,
        }
      }
    }

    return { allowed: true }
  }
}
```

### Audit Logging

```typescript
// packages/guardrails/src/audit.ts

interface AuditEvent {
  timestamp: Date
  eventType: AuditEventType
  tenantId: string
  requestId: string
  details: {
    action: string
    resource?: string
    outcome: 'allowed' | 'blocked' | 'flagged'
    reason?: string
    flags?: ContentFlag[]
  }
  // NO user_id - privacy by design
}

type AuditEventType =
  | 'scope_violation'
  | 'content_filtered'
  | 'tool_blocked'
  | 'pii_detected'
  | 'phi_detected'
  | 'credential_detected'
  | 'rate_limited'
  | 'sensitive_access'

class AuditLogger {
  async log(event: AuditEvent): Promise<void> {
    // Store in append-only audit log
    await this.storage.append(event)

    // Alert on critical events
    if (this.isCritical(event)) {
      await this.alerter.send({
        severity: 'high',
        message: `Security event: ${event.eventType}`,
        details: event.details,
      })
    }
  }

  private isCritical(event: AuditEvent): boolean {
    return [
      'scope_violation',
      'credential_detected',
      'phi_detected',
    ].includes(event.eventType)
  }
}
```

### Ethics Constitution

```typescript
// packages/guardrails/src/constitution.ts

/**
 * Core principles that apply to ALL agent interactions.
 * These cannot be overridden by skills or user requests.
 */
const CONSTITUTION = {
  principles: [
    {
      name: 'plan_first',
      description: 'Plan before executing. No monolithic generation.',
      enforcement: 'soft',  // Reminder, not hard block
    },
    {
      name: 'cite_not_invent',
      description: 'Never fabricate references, statistics, CVE numbers, or dataset names.',
      enforcement: 'hard',
    },
    {
      name: 'defensive_only',
      description: 'Security work is for defensive research, threat modeling, vulnerability detection.',
      enforcement: 'hard',
    },
    {
      name: 'reproducibility',
      description: 'Research must be traceable to data, code, hyperparameters, seeds.',
      enforcement: 'soft',
    },
    {
      name: 'tag_uncertainty',
      description: 'Mark uncertain claims with [VERIFY: reason].',
      enforcement: 'soft',
    },
    {
      name: 'distinguish_sources',
      description: 'Mark AI-generated content [DRAFT], never silently merge.',
      enforcement: 'soft',
    },
  ],

  check(request: string, context: AgentContext): ConstitutionResult {
    const violations: string[] = []

    for (const principle of this.principles) {
      if (principle.enforcement === 'hard') {
        const violates = this.checkPrinciple(principle, request, context)
        if (violates) {
          violations.push(principle.name)
        }
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
    }
  }
}
```

## Implementation Notes
- Backend: `packages/guardrails/` package
- Frontend: Guardrail status indicators in UI
- CLI: `tag guardrails test`, `tag audit query`
- Database: audit_events table (append-only)

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `packages/guardrails/src/__tests__/scope.test.ts` | `allows in-scope request` | Allowed |
| `packages/guardrails/src/__tests__/scope.test.ts` | `blocks out-of-scope request` | Blocked with reason |
| `packages/guardrails/src/__tests__/filter.test.ts` | `detects SSN` | PII flag |
| `packages/guardrails/src/__tests__/filter.test.ts` | `detects API key` | Credential blocked |
| `packages/guardrails/src/__tests__/filter.test.ts` | `detects PHI` | PHI flag |
| `packages/guardrails/src/__tests__/tools.test.ts` | `blocks rm -rf` | Blocked |
| `packages/guardrails/src/__tests__/tools.test.ts` | `blocks DELETE SQL` | Blocked |
| `packages/guardrails/src/__tests__/tools.test.ts` | `allows read commands` | Allowed |
| `packages/guardrails/src/__tests__/audit.test.ts` | `logs violation` | Event stored |
| `packages/guardrails/src/__tests__/constitution.test.ts` | `enforces defensive_only` | Hard block |

### Test Coverage Requirements
- All content patterns tested
- All tool guards tested
- Audit logging verified

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `scope violation` | Security skill | 1. Request exploit code | Blocked, logged |
| `PII in request` | Filter active | 1. Include SSN | Flagged, allowed |
| `credential leak` | Filter active | 1. Include API key | Blocked |
| `shell command` | Tool guard | 1. Execute rm -rf | Blocked |
| `audit query` | Events logged | 1. Query by type | Events returned |
| `constitution check` | Full request | 1. Fabricate citation | Blocked |

### End-to-End Flows
- Request with scope violation → Blocked → Audit logged → User informed
- Request with PII → Flagged → Processed with warning → Audit logged

## Acceptance Criteria
1. Scope boundary framework with in/out definitions
2. Content filter for PII, PHI, credentials
3. Tool execution guards for shell, SQL, network
4. Audit logging for all security events
5. Ethics constitution with hard/soft enforcement
6. No user_id in audit logs (privacy by design)
7. Alert system for critical events
8. Defensively-focused security research constraints

## Review Checklist
- [ ] Are all out-of-scope items clearly defined?
- [ ] Do filters catch common PII patterns?
- [ ] Are credential patterns comprehensive?
- [ ] Do tool guards prevent destructive operations?
- [ ] Is audit log append-only and tamper-evident?
- [ ] Are alerts configured for critical events?

## Dependencies
- Depends on: Day 43 (Skill framework), Day 37 (Tool system)
- Blocks: Day 48 (Integration testing)

## Risk Factors
- **False positives** — Mitigation: Tunable thresholds, allow-lists
- **Pattern evasion** — Mitigation: Multiple detection layers
- **Performance impact** — Mitigation: Efficient regex, caching
- **Over-blocking** — Mitigation: Clear explanations, appeal process
