# TAG-29: Enhanced Admin with Audit Actions

## Description

**Suggested Points:** 8 (High — implementing Django-style admin patterns in Node.js/Next.js, audit logging infrastructure, custom admin actions with job queues; learning from Lumy-Backend's production patterns)

## Objective

Implement enhanced admin functionality inspired by Lumy-Backend's Django admin patterns, including custom admin actions with comprehensive audit logging, fraud detection logging, and async job retry capabilities for failed operations.

## Requirements

### Audit Logging Infrastructure
- Dedicated audit loggers per domain (e.g., `attribution.fraud`, `billing.errors`)
- Structured logging with full context:
  ```typescript
  auditLogger.warn('Admin override: status change', {
    resource_id: token.id,
    resource_type: 'attribution_token',
    previous_status: 'INELIGIBLE',
    new_status: 'PENDING',
    admin_user: request.user.email,
    admin_ip: request.ip,
    reason: 'disputed by provider',
    timestamp: new Date().toISOString(),
  })
  ```
- Log BEFORE making changes (capture original state)
- Immutable audit trail in `audit_log` table

### Custom Admin Actions (Pattern from Lumy-Backend)
- **Bulk Status Updates** with audit trail
- **Retry Failed Operations** via job queue
- **Export Selected Records** to CSV
- **Clear/Archive Old Data** with confirmation

### Admin Action: Retry Failed Jobs
```typescript
// Pattern from certn_access_fees/admin.py
interface AdminAction {
  name: string
  description: string
  confirmationRequired: boolean
  handler: (selectedIds: string[], context: AdminContext) => Promise<ActionResult>
}

const retryFailedCharges: AdminAction = {
  name: 'retry_failed_charges',
  description: 'Retry failed Stripe charges',
  confirmationRequired: true,
  handler: async (ids, ctx) => {
    const queue = getQueue('default')
    let queued = 0

    for (const id of ids) {
      await queue.add('process_charge', { feeId: id, retryCount: 1 })
      await db.update('access_fees', id, { status: 'SCHEDULED' })
      auditLogger.info('Charge retry queued', { fee_id: id, admin: ctx.user.email })
      queued++
    }

    return { success: true, message: `Queued ${queued} charges for retry` }
  }
}
```

### Protected Delete Operations
- Disable delete for sensitive resources (audit-critical data)
- Soft delete with `deleted_at` timestamp
- Admin override requires elevated permission + reason

### Fraud Detection Logging
- Separate fraud logger with alerting integration
- Pattern detection for suspicious admin actions
- Rate limiting on bulk operations

## Implementation Notes
- Backend: New `src/admin/actions/` directory for admin action handlers
- Frontend: Admin UI action buttons with confirmation modals
- CLI: N/A
- Database: Enhanced audit_log schema, add fraud_alerts table

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `apps/api/src/admin/__tests__/actions.test.ts` | `logs before state change` | Audit log has original state |
| `apps/api/src/admin/__tests__/actions.test.ts` | `bulk action creates individual logs` | One log per affected record |
| `apps/api/src/admin/__tests__/actions.test.ts` | `retry action queues jobs` | Jobs added to queue |
| `apps/api/src/admin/__tests__/actions.test.ts` | `confirmation required for destructive actions` | Action rejected without confirm |
| `apps/api/src/admin/__tests__/audit.test.ts` | `audit log immutable` | UPDATE/DELETE rejected on audit_log |
| `apps/api/src/admin/__tests__/audit.test.ts` | `fraud logger captures context` | All required fields present |
| `apps/api/src/admin/__tests__/delete.test.ts` | `sensitive resources cannot be deleted` | 403 on delete attempt |
| `apps/api/src/admin/__tests__/delete.test.ts` | `soft delete sets deleted_at` | Timestamp set, record exists |

### Test Coverage Requirements
- 100% coverage on admin action handlers
- 100% coverage on audit logging
- All permission scenarios tested

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `bulk retry with audit` | 5 failed charges | 1. Select all 2. Retry action | 5 jobs queued, 5 audit logs |
| `protected delete` | Sensitive record | 1. Attempt delete via API | 403 Forbidden |
| `soft delete flow` | Normal record | 1. Delete 2. Query with filter | Record hidden, exists in DB |
| `audit log query` | Actions performed | 1. Query audit log | All actions visible with context |
| `fraud alert trigger` | Suspicious pattern | 1. Rapid bulk changes | Alert created |

### End-to-End Flows
- Admin performs bulk action → Audit logged → Jobs queued → Status updated → Dashboard reflects
- Suspicious activity → Fraud logger captures → Alert sent → Admin notified

## Admin Action Framework

```typescript
// apps/api/src/admin/framework/action-registry.ts

interface AdminActionContext {
  user: { id: string; email: string; role: string }
  ip: string
  userAgent: string
  timestamp: Date
}

interface AdminActionResult {
  success: boolean
  message: string
  affectedCount?: number
  errors?: Array<{ id: string; error: string }>
}

abstract class BaseAdminAction {
  abstract name: string
  abstract description: string
  abstract resourceType: string

  // Override in subclass
  confirmationRequired = false
  requiredRole: 'tenant_admin' | 'team_admin' = 'tenant_admin'
  maxBatchSize = 100

  // Audit logging built-in
  protected async logAction(
    action: string,
    resourceId: string,
    beforeState: any,
    afterState: any,
    context: AdminActionContext
  ) {
    await db.insert('audit_log', {
      tenant_id: context.user.tenantId,
      resource_type: this.resourceType,
      resource_id: resourceId,
      action,
      actor_id: context.user.id,
      actor_email: context.user.email,
      before_state: beforeState,
      after_state: afterState,
      ip_address: context.ip,
      user_agent: context.userAgent,
      created_at: context.timestamp,
    })
  }

  // Subclass implements
  abstract execute(ids: string[], context: AdminActionContext): Promise<AdminActionResult>

  // Validation hook
  async validate(ids: string[], context: AdminActionContext): Promise<{ valid: boolean; reason?: string }> {
    if (ids.length > this.maxBatchSize) {
      return { valid: false, reason: `Max ${this.maxBatchSize} items per action` }
    }
    return { valid: true }
  }
}

// Example implementation
class RetryFailedChargesAction extends BaseAdminAction {
  name = 'retry_failed_charges'
  description = 'Queue failed charges for retry'
  resourceType = 'access_fee'
  confirmationRequired = true

  async execute(ids: string[], context: AdminActionContext): Promise<AdminActionResult> {
    const queue = getQueue('default')
    const results = { success: 0, failed: 0, errors: [] }

    for (const id of ids) {
      const fee = await db.findById('access_fees', id)
      if (fee.status !== 'FAILED_CHARGE') continue

      const beforeState = { ...fee }

      await queue.add('process_charge', { feeId: id })
      await db.update('access_fees', id, { status: 'SCHEDULED' })

      await this.logAction('retry_charge', id, beforeState, { status: 'SCHEDULED' }, context)
      results.success++
    }

    return {
      success: true,
      message: `Queued ${results.success} charges for retry`,
      affectedCount: results.success,
    }
  }
}
```

## Acceptance Criteria
1. Admin actions framework with registration pattern
2. All actions log to audit_log before state change
3. Bulk actions create individual audit entries
4. Retry action queues jobs correctly
5. Delete disabled for sensitive resources
6. Soft delete implemented where appropriate
7. Fraud detection logger captures suspicious patterns
8. All admin actions require appropriate role

## Review Checklist
- [ ] Is audit log truly immutable (no UPDATE/DELETE)?
- [ ] Does logging happen BEFORE the state change?
- [ ] Are bulk actions rate-limited?
- [ ] Is the confirmation flow secure (not bypassable)?
- [ ] Does the fraud logger integrate with alerting?
- [ ] Are job queue retries idempotent?

## Dependencies
- Depends on: Day 15-16 (Admin UI foundation), Day 17 (Event logging)
- Blocks: Day 32 (Custom views build on action framework)

## Risk Factors
- **Audit log growth** — Mitigation: Partitioning, archival policy
- **Job queue failures** — Mitigation: Dead letter queue, retry limits
- **Admin action abuse** — Mitigation: Rate limiting, fraud detection
- **Performance on bulk actions** — Mitigation: Batch processing, progress indicators
