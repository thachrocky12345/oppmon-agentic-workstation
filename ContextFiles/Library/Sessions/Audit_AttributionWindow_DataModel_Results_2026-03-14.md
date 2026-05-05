# Audit Results: RGDEV-183 -- 60-Day Attribution Window Logic

**Date**: 2026-03-14
**Auditor**: Claude Opus 4.6
**Scope**: `apps/attribution/` in `Lumy-Backend` (main working tree)

---

## CRITICAL PRELIMINARY FINDING: Main Tree vs Worktree Divergence

The main working tree (`C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\`) and the Claude worktree (`.claude\worktrees\agent-ad3fbd38\apps\attribution\`) contain **different versions** of `utils.py` and `views.py`.

| Function | Main Tree | Worktree |
|---|---|---|
| `record_attribution_visit()` | **MISSING** | Present (lines 135-172) |
| `confirm_attribution_if_eligible()` | **MISSING** | Present (lines 175-197) |
| `TrackAttributionView.post()` | Inline logic (views.py:102-127) | Delegates to `record_attribution_visit()` |
| `test_window.py` | **MISSING** | Present (boundary tests for Day 59/61/70) |

**The main tree is the authoritative copy per MEMORY.md.** The worktree contains a more complete implementation that has NOT been merged. This audit covers the **main working tree** code, with notes on what the worktree would fix.

---

## Item 1: Window Reset Correctness -- BRD Edge Case

**VERDICT**: FAIL (partial)

**FINDING**:
In the main tree `views.py` (lines 102-127), the "create or refresh" block works as follows:

1. Guardrails 1-3 (lines 52-100) return early for prior-booking, CONFIRMED, and INELIGIBLE statuses respectively. These are **separate queries** that fire before the main block.
2. Line 106-109: `existing = ProfileAttributionToken.objects.filter(provider=provider, client=client).order_by('-created_at').first()` -- **NO status filter**. After guardrails have returned early for CONFIRMED and INELIGIBLE, the only remaining statuses are PENDING and EXPIRED. This is safe because the guardrails are exhaustive.
3. Lines 120-127: When `existing` is found, the code unconditionally sets `existing.status = AttributionStatus.PENDING` and updates `expires_at`. This correctly handles EXPIRED->PENDING transitions (BRD re-visit after expiry).
4. However, `create_attribution_token()` in `utils.py` (lines 160-170) has a **divergent code path**: it only queries for `status__in=[PENDING, CONFIRMED]` and returns an expired token as-is without resetting status when `is_expired` is True (line 167-170). This means a caller using `create_attribution_token()` instead of the view will silently get back an expired token with no reset.

The Day 1 -> Day 45 -> Day 70 scenario works correctly via `TrackAttributionView` (view path resets EXPIRED->PENDING). It does **NOT** work via `create_attribution_token()` because that function filters only PENDING/CONFIRMED and returns expired tokens without resetting status.

**Callers of `create_attribution_token()`**: Not called from `views.py` (which uses inline logic). Called only from tests. No production code path currently uses it, but it exists as a public API that could be called.

**RISK**: MEDIUM (P2). If any future code calls `create_attribution_token()` for an expired token pair, the client silently loses attribution. The two code paths (view vs utils) are inconsistent.

**RECOMMENDATION**: Merge the worktree's `record_attribution_visit()` which handles all status transitions correctly, and have `TrackAttributionView` delegate to it. Deprecate or remove `create_attribution_token()`.

---

## Item 2: Race Conditions -- Concurrent POST /attribution/track/ Calls

**VERDICT**: FAIL

**FINDING**:
In `views.py` lines 106-127, the read-then-write pattern is:
1. `existing = ProfileAttributionToken.objects.filter(...).first()` (line 106-109)
2. If `existing is None`: `ProfileAttributionToken.objects.create(...)` (line 112-119)

This is **NOT wrapped in `transaction.atomic()`** and does **NOT use `select_for_update()`**. Two concurrent requests for the same (provider, client) pair can both read `existing = None` and both attempt `create()`. The partial unique constraint `unique_active_attribution_token` will cause one to raise `IntegrityError`, which is **unhandled**. This produces a 500 error response.

The same race exists in `create_attribution_token()` in `utils.py` (lines 160-179) -- identical pattern, no atomicity.

By contrast, `get_checkout_discount()` in `utils.py` (lines 77-113) correctly uses `transaction.atomic()` + `select_for_update()`. The safe pattern exists in the codebase but is not applied to token creation.

**RISK**: CRITICAL (P0). Under concurrent profile visits (e.g., browser tab reload, double-click, crawlers), one request returns a 500. The database constraint prevents data corruption but the error is unhandled.

**RECOMMENDATION**: Wrap the read-then-write block in `transaction.atomic()` with `select_for_update()`, or catch `IntegrityError` and retry/return the existing token. The worktree's `record_attribution_visit()` also does NOT fix this -- it has the same issue.

---

## Item 3: Partial UniqueConstraint Coverage -- EXPIRED Tokens

**VERDICT**: PASS (with caveats)

**FINDING**:
The partial unique constraint (`models.py` lines 73-77) covers only `status IN ('pending', 'confirmed')`. This is correct per BRD: after expiry, a new 60-day window can start, and EXPIRED tokens must not block new PENDING ones. This is verified by the test `test_expired_token_allows_new_active_token` (`test_models.py` lines 171-185).

**Orphan accumulation risk**: If a token expires and a new one is created (rather than the expired one being reset to PENDING), the expired token remains as an orphan row. The view (`views.py` line 106) queries with `.order_by('-created_at').first()` which finds the most recent token. Multiple expired tokens for the same pair can accumulate over time. No cleanup mechanism exists.

The view's approach (resetting EXPIRED->PENDING on the same row rather than creating new) mitigates orphan accumulation for the view path. But `create_attribution_token()` in `utils.py` would create a new row if the expired token's status filter (`PENDING/CONFIRMED`) excludes it, leading to orphan accumulation.

INELIGIBLE tokens are handled by GUARDRAIL 3 (line 86-100), which returns before the create block.

**RISK**: LOW (P3). Orphan tokens cause no functional bugs but can inflate table size and confuse analytics queries. No double-counting risk for active billing because `get_checkout_discount()` filters on active statuses + `expires_at__gt=now`.

**RECOMMENDATION**: Add a periodic cleanup job for EXPIRED/INELIGIBLE tokens older than N days, or add a composite index on (provider, client, status) to keep orphan queries efficient. Consider adding a `source` filter to prevent the orphan scenario in `create_attribution_token()`.

---

## Item 4: APScheduler / Cron Wiring -- Is expire_attribution_tokens Scheduled?

**VERDICT**: FAIL

**FINDING**:
1. `lumy_global/cron.py` defines cron job functions but does **NOT** define or register an `expire_attribution_tokens` job. The file does not import from `apps.attribution.management.commands`.
2. `lumy_global/settings.py` lines 499-517 define `CRONJOBS` via `django-crontab`. The list includes 11 entries. **None of them reference `expire_attribution_tokens`**.
3. `apps/care_provider/tasks.py` line 130: the `BackgroundScheduler` is **commented out** (`# scheduler = BackgroundScheduler()`). No active scheduler is running.
4. No `CELERY_BEAT_SCHEDULE` setting exists in `settings.py`.

The management command `expire_attribution_tokens` exists and is correct, but it is a **dead letter** -- it will never run automatically.

**Consequence**: PENDING tokens that should have expired remain PENDING in the database indefinitely. The `get_checkout_discount()` function uses `expires_at__gt=timezone.now()` as a real-time check, so it correctly refuses discounts on logically-expired tokens. However, the `status` column remains `PENDING` for tokens that are logically expired, which corrupts any analytics query that filters on `status='pending'`.

Additionally, `AttributionCheckoutStatusView` (views.py line 157-162) filters on `status=CONFIRMED` -- so the expiry sweep's absence doesn't affect checkout display. But status-based reporting is unreliable.

**RISK**: HIGH (P1). No operational mechanism runs the expiry sweep. Status column becomes untrustworthy for analytics and admin panel inspection.

**RECOMMENDATION**: Add an entry to `CRONJOBS` in `settings.py`:
```python
('0 2 * * *', 'django.core.management.call_command', ['expire_attribution_tokens']),
```

---

## Item 5: confirm_attribution_if_eligible -- Atomicity of Token Confirmation

**VERDICT**: NOT-IMPLEMENTED (in main tree)

**FINDING**:
1. **Main tree**: No function named `confirm_attribution_if_eligible` exists in `utils.py`. The function is only present in the worktree (`.claude/worktrees/agent-ad3fbd38/apps/attribution/utils.py` lines 175-197).
2. **Stripe integration**: `apps/stripe_integration/views.py` lines 495-510 contains a "safety net" that marks `first_session_discount_applied=True` on tokens during PayPal capture. However, it does **NOT** transition the token from PENDING to CONFIRMED. It only sets the discount flag.
3. **No signals**: No Django signals on `Appointment.payment_status` exist that transition attribution tokens.
4. **cron.py `capture_authorized_payments_job()`** (lines 371-526): Uses `get_telehealth_fee()` for fee calculation but does NOT call any attribution confirmation function.

**Conclusion**: In the main tree, tokens are created as PENDING and can only become EXPIRED (via the management command) or INELIGIBLE (via guardrail 1). **Tokens are never confirmed.** The `AttributionCheckoutStatusView` filters on `status=CONFIRMED`, which means it will **never** find a qualifying token and will always return `is_first_attributed_session: False`.

The worktree version of `confirm_attribution_if_eligible()` (lines 175-197) does handle the transition but does NOT use `select_for_update()` or `transaction.atomic()` -- a minor race risk if two concurrent payment confirmations fire for the same pair.

**RISK**: CRITICAL (P0). The attribution system creates tokens but has no mechanism to confirm them. The entire attribution discount pipeline is broken: `AttributionCheckoutStatusView` always returns no discount. `ProviderClientFeeOverride` records are never written by the attribution flow.

**RECOMMENDATION**: Merge the worktree's `confirm_attribution_if_eligible()` into the main tree. Add it as a call in `capture_authorized_payments_job()` (after successful capture) and in the Stripe/PayPal capture views. Wrap in `transaction.atomic()` + `select_for_update()` for safety.

---

## Item 6: Status Transition Integrity

**VERDICT**: FAIL

**FINDING**:

### 6a. Re-start block status overwrite
In `views.py` line 123, `existing.status = AttributionStatus.PENDING` runs unconditionally in the `else` branch. After guardrails 1-3 return early for prior-booking, CONFIRMED, and INELIGIBLE, the only statuses that can reach this branch are PENDING and EXPIRED. This is correct. Guardrails are exhaustive for the current status set.

### 6b. CONFIRMED tokens bulk-expired (BUG)
In `expire_attribution_tokens.py` line 30:
```python
status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED]
```
The expiry sweep targets **both PENDING and CONFIRMED tokens** whose `expires_at` has passed. This means a CONFIRMED token (representing a committed attribution relationship) CAN be expired by the sweep. Per BRD, CONFIRMED is a terminal state -- no further transitions should occur.

If a CONFIRMED token's `expires_at` passes (which it will, 60 days after creation unless extended), the sweep will set its status to EXPIRED. This could affect:
- `get_telehealth_fee()` if it relied on token status (it doesn't -- it uses `ProviderClientFeeOverride`)
- `get_checkout_discount()` which filters on `status__in=[PENDING, CONFIRMED]` -- the discount would become unavailable
- Analytics/reporting on confirmed attributions

### 6c. No model-level validation
There is no `clean()` or `save()` override on `ProfileAttributionToken` that enforces valid status transitions. Admin panel edits or management commands can set any status. This is acceptable given the current codebase maturity but risky for future contributors.

**RISK**: HIGH (P1). The CONFIRMED->EXPIRED sweep transition is almost certainly a bug. CONFIRMED attributions should be excluded from the expiry sweep.

**RECOMMENDATION**: Change `expire_attribution_tokens.py` line 30 to filter only `status=AttributionStatus.PENDING`. CONFIRMED tokens should never be expired.

---

## Item 7: modified_at Field -- BaseModel Compatibility

**VERDICT**: NEEDS-INVESTIGATION

**FINDING**:

### 7a. BaseModel definition
`apps/authentication/models.py` line 52: `modified_at = models.DateTimeField(auto_now=True, db_index=True)`. This sets `modified_at` to `timezone.now()` on every `.save()` call.

### 7b. update_fields behavior
Multiple `.save(update_fields=[..., 'modified_at'])` calls exist in `utils.py` and `views.py`. Including `modified_at` in `update_fields` is **required** when `update_fields` is used with `auto_now` fields. Per Django documentation, when `update_fields` is specified, only the listed fields are saved. If `modified_at` is NOT in `update_fields`, `auto_now` still adds it automatically (Django 4.2+ behavior). However, explicitly including it is the safer pattern and matches what the code does.

### 7c. Bulk .update() bypasses auto_now
In `expire_attribution_tokens.py` line 39:
```python
updated = qs.update(status=AttributionStatus.EXPIRED)
```
Bulk `.update()` bypasses `.save()` entirely, so `auto_now` does NOT fire. The `modified_at` column will **NOT be updated** when the expiry sweep runs. There is no separate `expired_at` timestamp field on the model. This means:
- You cannot determine when a token was actually expired by looking at `modified_at`
- The `modified_at` value will reflect the last `.save()` call (e.g., when the window was last extended)

**RISK**: MEDIUM (P2). Monitoring and debugging gap. Cannot audit when tokens were expired.

**RECOMMENDATION**: Add `modified_at=timezone.now()` to the bulk `.update()` call:
```python
updated = qs.update(status=AttributionStatus.EXPIRED, modified_at=timezone.now())
```
Or add an `expired_at = models.DateTimeField(null=True, blank=True)` field for explicit tracking.

---

## Item 8: Index Coverage -- Query Performance

**VERDICT**: PASS (with optimization opportunity)

**FINDING**:

### 8a. View query (provider, client, no status filter)
`views.py` line 106-109: `.filter(provider=provider, client=client).order_by('-created_at').first()`
The composite index `(provider, client, status)` covers a prefix scan on `(provider, client)`. The individual FK indexes (`provider_id`, `client_id`) also exist. PostgreSQL's query planner will likely use the composite index as a prefix scan, which is correct.

### 8b. Expiry sweep query
`expire_attribution_tokens.py` line 29-31: `.filter(status__in=[PENDING, CONFIRMED], expires_at__lte=now)`
The existing `expires_at` index covers the range scan. The `(provider, client, status)` composite index is not useful here. A composite index on `(status, expires_at)` would be optimal for large tables (100k+ tokens) but is not critical at current scale.

### 8c. Checkout discount query
`utils.py` line 81-86: `.filter(provider=provider, client=client, status__in=[...], expires_at__gt=now)`
The `(provider, client, status)` composite index covers this query well.

**RISK**: LOW (P3). Indexes are adequate for current query patterns. The `(status, expires_at)` optimization is a nice-to-have for scale.

**RECOMMENDATION**: Add `models.Index(fields=['status', 'expires_at'])` when token volume exceeds ~50k rows.

---

## Item 9: Import Safety -- Circular Import Risk

**VERDICT**: PASS

**FINDING**:

### 9a. Lazy import in utils.py
`utils.py` line 128: `from apps.calendar_functionality.models import Appointment` inside `has_prior_booking()`. This is the only reference to `calendar_functionality` in `utils.py`. Correct lazy import pattern.

### 9b. cron.py imports
`cron.py` line 4: `from apps.attribution.utils import get_telehealth_fee` (top-level).
`cron.py` line 12: `from apps.calendar_functionality.models import Appointment` (top-level).
`calendar_functionality.models` does NOT import from `attribution` (confirmed via grep). No circular dependency exists.

### 9c. views.py lazy import
`views.py` line 33: `from apps.care_provider.models import CareProvider` inside `post()`. Lazy import is correct. `care_provider.models` does not import from `attribution` at the module level (confirmed).

**RISK**: None.

**RECOMMENDATION**: None.

---

## Item 10: Test Coverage -- Time-Based Scenarios

**VERDICT**: FAIL

**FINDING**:

### 10a. Mocked timezone.now() tests
The main tree tests (`test_models.py`, `test_fraud_guardrails.py`, `test_fee_calculation.py`, `test_provider_discount.py`) do **NOT** use `@patch('django.utils.timezone.now')` to simulate specific calendar days. All time-based tests use relative deltas (`timezone.now() + timedelta(days=30)`, `timezone.now() - timedelta(days=1)`). There are no Day 59/61/70 boundary tests.

The worktree has `test_window.py` with boundary tests for Day 59 (within window) and Day 61 (past window) using `confirm_attribution_if_eligible()`, plus the Day 1 -> Day 45 -> Day 70 window-reset scenario. However, these tests depend on `record_attribution_visit()` and `confirm_attribution_if_eligible()` which do NOT exist in the main tree. **These tests cannot run against the main tree.**

### 10b. Window reset + expiry sweep interaction test
**Missing.** No test simulates: token created Day 1, re-visit Day 45 (window reset to Day 105), expiry sweep runs Day 62 -- token should NOT be expired because `expires_at` was reset.

### 10c. Race condition test
**Missing.** No test simulates concurrent `create()` calls resulting in `IntegrityError`.

### 10d. Integration tests
`test_fraud_guardrails.py` uses DRF's `APIClient` with `force_authenticate()` to call `POST /api/v1/attribution/track/` and asserts HTTP responses. This is the only integration-level test file. Good coverage of guardrails 1-3 and the happy path.

### Missing test cases (prioritized):

| Priority | Test Case | Why |
|---|---|---|
| P0 | `confirm_attribution_if_eligible` within/past window | Cannot test because function doesn't exist in main tree |
| P0 | Day 1 -> Day 45 reset -> Day 70 booking end-to-end | Requires `confirm_attribution_if_eligible` |
| P1 | Concurrent `POST /track/` -> `IntegrityError` handling | Race condition is unhandled |
| P1 | Expiry sweep excludes CONFIRMED tokens | Currently sweeps CONFIRMED (bug) |
| P2 | Window reset + expiry sweep ordering (Day 62 after Day 45 reset) | Boundary interaction |
| P2 | `create_attribution_token()` with expired existing token | Returns expired token without reset |
| P3 | `modified_at` unchanged after bulk `update()` | Monitoring gap |

**RISK**: HIGH (P1). Critical flows are untested because the confirmation function is missing.

**RECOMMENDATION**: Merge the worktree's `test_window.py` and its dependencies (`record_attribution_visit`, `confirm_attribution_if_eligible`) into the main tree. Add tests for the race condition and the CONFIRMED-expiry bug.

---

## Summary Table

| # | Item | Verdict | Severity |
|---|---|---|---|
| 1 | Window Reset Correctness | FAIL (code path divergence) | MEDIUM (P2) |
| 2 | Race Conditions | FAIL | CRITICAL (P0) |
| 3 | Partial UniqueConstraint Coverage | PASS (with caveats) | LOW (P3) |
| 4 | Expiry Sweep Not Scheduled | FAIL | HIGH (P1) |
| 5 | confirm_attribution_if_eligible | NOT-IMPLEMENTED | CRITICAL (P0) |
| 6 | Status Transition Integrity | FAIL (CONFIRMED->EXPIRED bug) | HIGH (P1) |
| 7 | modified_at Stale After Bulk Update | NEEDS-INVESTIGATION | MEDIUM (P2) |
| 8 | Index Coverage | PASS | LOW (P3) |
| 9 | Import Safety | PASS | None |
| 10 | Test Coverage | FAIL | HIGH (P1) |

---

## Prioritized Action Items

### P0 -- CRITICAL (blocks attribution from working at all)

1. **Merge `confirm_attribution_if_eligible()` from worktree into main tree `utils.py`**. Without this, tokens are never confirmed, `AttributionCheckoutStatusView` always returns no discount, and the entire attribution pipeline is non-functional.
   - Source: `.claude/worktrees/agent-ad3fbd38/apps/attribution/utils.py` lines 175-197
   - Target: `apps/attribution/utils.py`
   - Additionally: wire the call into `capture_authorized_payments_job()` and Stripe/PayPal capture flows

2. **Fix race condition in `TrackAttributionView.post()` and `create_attribution_token()`**. Wrap the read-then-write block in `transaction.atomic()` with `select_for_update()`, or catch `IntegrityError` and fall through to return the existing token.
   - File: `apps/attribution/views.py` lines 106-127
   - File: `apps/attribution/utils.py` lines 160-179

### P1 -- HIGH (operational correctness)

3. **Schedule `expire_attribution_tokens` in CRONJOBS**. Add to `lumy_global/settings.py` CRONJOBS list:
   ```python
   ('0 2 * * *', 'django.core.management.call_command', ['expire_attribution_tokens']),
   ```

4. **Fix CONFIRMED->EXPIRED sweep bug in `expire_attribution_tokens.py`**. Change line 30 from:
   ```python
   status__in=[AttributionStatus.PENDING, AttributionStatus.CONFIRMED],
   ```
   to:
   ```python
   status=AttributionStatus.PENDING,
   ```

5. **Merge `test_window.py` and `record_attribution_visit()`** from worktree to main tree. Add tests for race condition and CONFIRMED-expiry scenarios.

### P2 -- MEDIUM (correctness/observability improvements)

6. **Fix `modified_at` not updating in bulk expiry sweep**. Add `modified_at=timezone.now()` to the bulk `.update()` call in `expire_attribution_tokens.py` line 39.

7. **Reconcile `create_attribution_token()` with view logic**. Either deprecate it (mark as test-only) or fix it to handle EXPIRED tokens the same way the view does (reset to PENDING).

### P3 -- LOW (optimization)

8. **Add `(status, expires_at)` composite index** for expiry sweep performance at scale.
9. **Add periodic cleanup** for orphan EXPIRED/INELIGIBLE tokens older than 180 days.

---

## Files Examined

| File | Path |
|---|---|
| models.py | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\models.py` |
| utils.py (main) | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\utils.py` |
| utils.py (worktree) | `C:\Projects\ReallyGlobal\Lumy-Backend\.claude\worktrees\agent-ad3fbd38\apps\attribution\utils.py` |
| views.py (main) | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\views.py` |
| views.py (worktree) | `C:\Projects\ReallyGlobal\Lumy-Backend\.claude\worktrees\agent-ad3fbd38\apps\attribution\views.py` |
| expire_attribution_tokens.py | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\management\commands\expire_attribution_tokens.py` |
| test_models.py | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\tests\test_models.py` |
| test_fraud_guardrails.py | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\tests\test_fraud_guardrails.py` |
| test_fee_calculation.py | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\tests\test_fee_calculation.py` |
| test_provider_discount.py | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\tests\test_provider_discount.py` |
| test_window.py (worktree only) | `C:\Projects\ReallyGlobal\Lumy-Backend\.claude\worktrees\agent-ad3fbd38\apps\attribution\tests\test_window.py` |
| cron.py | `C:\Projects\ReallyGlobal\Lumy-Backend\lumy_global\cron.py` |
| settings.py | `C:\Projects\ReallyGlobal\Lumy-Backend\lumy_global\settings.py` |
| BaseModel | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\authentication\models.py` (line 45) |
| stripe views | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\stripe_integration\views.py` (lines 495-510) |
| care_provider/tasks.py | `C:\Projects\ReallyGlobal\Lumy-Backend\apps\care_provider\tasks.py` (lines 130-134, scheduler commented out) |
