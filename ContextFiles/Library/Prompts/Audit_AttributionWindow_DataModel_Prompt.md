# Audit Prompt: RGDEV-183 — 60-Day Attribution Window Logic

## Purpose

You are an Opus-class engineering auditor. Execute this audit against the live codebase to verify
correctness, safety, and completeness of the 60-day attribution window implementation for
RGDEV-183. For each item below, read the relevant code, state what you found, and produce a
verdict: PASS / FAIL / NEEDS-INVESTIGATION. Produce a single structured report at the end.

---

## Files to Read Before Auditing

Read all of the following before answering any question:

| File | Why |
|---|---|
| `apps/attribution/models.py` | ProfileAttributionToken model, constraints, indexes |
| `apps/attribution/utils.py` | create_attribution_token, get_checkout_discount, has_prior_booking |
| `apps/attribution/views.py` | TrackAttributionView — the POST /attribution/track/ handler |
| `apps/attribution/management/commands/expire_attribution_tokens.py` | Expiry sweep command |
| `apps/attribution/tests/test_models.py` | Current test coverage |
| `lumy_global/cron.py` | APScheduler job registrations |
| `lumy_global/settings.py` | ATTRIBUTION_WINDOW_DAYS, ATTRIBUTED_TELEHEALTH_FEE_PERCENT settings |
| `apps/authentication/models.py` | BaseModel definition (created_at, modified_at, is_active) |
| `apps/care_provider/tasks.py` | Whether a scheduler is actually wired up |

---

## Audit Items

### 1. Window Reset Correctness — BRD Edge Case

**Scenario**: Client visits provider on Day 1 (token created, expires Day 61). Client revisits on
Day 45 (window should reset to Day 45+60 = Day 105). Client books on Day 70 (within the new
window, so attribution should confirm).

**What to verify in `views.py` (TrackAttributionView.post)**:

a. On the Day 45 revisit, `existing` is found via `.order_by('-created_at').first()` — but this
   query has NO status filter. It will pick up INELIGIBLE and CONFIRMED tokens too. Confirm
   whether this is intentional or a bug. Cross-check against the guardrails at the top of the
   view (GUARDRAIL 2 for CONFIRMED, GUARDRAIL 3 for INELIGIBLE) — are they truly exhaustive, or
   can a CONFIRMED token still reach the "re-start clock" branch?

b. On the Day 45 revisit, if `existing.status == AttributionStatus.EXPIRED` (the sweep ran
   between Day 60 and Day 45 — impossible in this scenario but possible in general), the view
   sets `existing.status = AttributionStatus.PENDING` and updates `expires_at`. Verify this is
   the correct EXPIRED→PENDING transition per BRD. Also check: does the partial unique constraint
   `unique_active_attribution_token` (covering only PENDING/CONFIRMED) allow the UPDATE to
   succeed when the row was previously EXPIRED? Since the update changes status to PENDING, could
   it trigger a constraint violation if another PENDING token for the same pair already exists?

c. In `utils.py`, `create_attribution_token()` has a separate but related code path. It only
   extends the window when `existing.is_expired` is False:
   ```python
   if existing:
       if not existing.is_expired:
           existing.expires_at = expires_at
           existing.save(update_fields=['expires_at', 'modified_at'])
       return (existing, False)
   ```
   If `existing.is_expired` is True, the function returns the already-expired token without
   creating a new one and without resetting the status to PENDING. This means a caller using
   `create_attribution_token()` (rather than the view directly) will silently get back an
   expired token. Is `create_attribution_token()` called anywhere other than in tests? If so,
   is the caller checking the returned token's status before proceeding?

**Verdict required**: Does the Day 1 → Day 45 → Day 70 scenario produce a CONFIRMED token under
all code paths (view + utils)? Or does one path silently fail?

---

### 2. Race Conditions — Concurrent POST /attribution/track/ Calls

**Scenario**: Two identical POST requests for the same (provider_id, client_id) arrive within
the same millisecond.

**What to verify in `views.py`**:

a. The "create or re-use" block (lines 106–127) is NOT wrapped in `transaction.atomic()` and
   does NOT use `select_for_update()`. Between the `.filter().first()` read and the `.create()`
   write, a second concurrent request can also see `existing = None` and both will attempt
   `ProfileAttributionToken.objects.create(...)`. The partial unique constraint
   `unique_active_attribution_token` will cause one to raise `IntegrityError`. Is this
   `IntegrityError` caught and handled gracefully? If not, the second request returns a 500.

b. Compare against `utils.create_attribution_token()` — same pattern, same race, same lack of
   `select_for_update()`. Is there a `get_or_create` with `unique_together` that would make this
   safe, or is the only protection the database constraint (which surfaces as an unhandled
   exception)?

c. Contrast with `get_checkout_discount()` in `utils.py`, which correctly uses
   `select_for_update()` inside `transaction.atomic()`. The pattern exists in the codebase but
   is not applied to token creation.

**Verdict required**: Is there a 500-inducing race condition on concurrent track calls? Does the
partial unique constraint save correctness at the cost of an unhandled exception?

---

### 3. Partial UniqueConstraint Coverage — EXPIRED Tokens

**The constraint**:
```python
models.UniqueConstraint(
    fields=['provider', 'client'],
    condition=models.Q(status__in=['pending', 'confirmed']),
    name='unique_active_attribution_token',
)
```

**What to verify**:

a. When a token transitions to EXPIRED (via the management command's bulk `.update()`), the
   partial constraint no longer applies to that row. A new PENDING token can be created for the
   same provider-client pair. This is tested in `test_expired_token_allows_new_active_token`.
   Confirm this is intentional per BRD (re-visit after expiry starts a fresh 60-day window).

b. What happens if the database has TWO expired tokens for the same pair (e.g., from a bug in
   an earlier release, or before the constraint was added)? When `views.py` does
   `.order_by('-created_at').first()`, it picks the most recent one. The older expired token
   becomes an orphan. Is there any cleanup mechanism? Could this cause reporting/analytics to
   double-count attribution events?

c. INELIGIBLE tokens are also excluded from the partial constraint. Verify that
   GUARDRAIL 3 in `views.py` catches all cases where a new PENDING token must not be created
   over an existing INELIGIBLE one, and that the guard fires before the create block is reached.

**Verdict required**: Is the partial constraint scope correct per BRD? Are there any orphan-token
accumulation risks?

---

### 4. APScheduler / Cron Wiring — Is expire_attribution_tokens Actually Scheduled?

**What to verify**:

a. Read `lumy_global/cron.py`. The file defines cron job functions (ten_minute_before_appointment_job,
   inactive_sixweekcp_check_job, etc.) but does NOT define or register an
   `expire_attribution_tokens` job. Confirm this is accurate.

b. Read `apps/care_provider/tasks.py`. The APScheduler `BackgroundScheduler` is commented out
   (lines 130–134). Confirm no active scheduler is running.

c. The management command `expire_attribution_tokens` exists and is correct, but it is not
   wired into any scheduler, celery beat, or django-crontab entry. Check `lumy_global/settings.py`
   for `CRONJOBS` (django-crontab) and `CELERY_BEAT_SCHEDULE` entries. If neither exists,
   the expiry sweep is a dead letter — it must be run manually or via an external cron.

d. Consequence: PENDING tokens that should have expired days ago remain PENDING until the
   command is manually run. The `get_checkout_discount()` function correctly uses
   `expires_at__gt=timezone.now()` as a real-time check (so it won't grant discounts on
   expired tokens), but the status column in the DB will show PENDING for tokens that are
   logically expired. This can corrupt analytics queries that filter on `status=PENDING`.

**Verdict required**: Is the expiry sweep scheduled? If not, what is the operational risk?

---

### 5. confirm_attribution_if_eligible — Atomicity of Token Confirmation

**What to verify**:

a. Search the codebase for any function named `confirm_attribution_if_eligible` or equivalent
   logic that transitions a PENDING token to CONFIRMED after a successful payment capture.
   Check `apps/attribution/utils.py`, `apps/attribution/views.py`,
   `apps/stripe_integration/`, `lumy_global/cron.py`, and the Stripe/PayPal capture logic
   in `capture_authorized_payments_job()`.

b. If no such function exists, determine where and how a token is confirmed. Is it:
   - In the payment capture webhook?
   - In `capture_authorized_payments_job()`?
   - Via a signal on `Appointment.payment_status` changing to COMPLETED?
   - Not yet implemented (i.e., tokens are created but never confirmed)?

c. If confirmation logic exists, verify it uses `select_for_update()` inside
   `transaction.atomic()` to prevent two concurrent payment confirmations for the same
   provider-client pair from both confirming the token. Without this, both threads could
   read status=PENDING, both set status=CONFIRMED, and save — resulting in a race-prone
   double-confirmation (idempotent in outcome but incorrect audit trail).

d. If confirmation does NOT exist yet, flag this as a critical gap: the attribution system
   creates and expires tokens but has no mechanism to confirm them, meaning
   `ProviderClientFeeOverride` records are never written by this system.

**Verdict required**: Does confirm-on-payment exist? Is it atomic?

---

### 6. Status Transition Integrity

**Expected valid transitions per BRD**:
- `PENDING → CONFIRMED` (on successful first payment within window)
- `PENDING → EXPIRED` (via expiry sweep when expires_at is past)
- `PENDING → INELIGIBLE` (on discovery of prior booking)
- `EXPIRED → PENDING` (on client revisit after window expired — re-start)
- `CONFIRMED → (terminal)` — no further transitions should be allowed

**What to verify**:

a. In `views.py`, the re-start logic sets `existing.status = AttributionStatus.PENDING`
   unconditionally when `existing` is found (line 123). This runs even if `existing.status`
   is something unexpected. There is NO explicit check that `existing.status` is PENDING or
   EXPIRED before overwriting. Could a CONFIRMED token's status be reset to PENDING if
   GUARDRAIL 2 somehow fails (e.g., a bug in an upstream call that bypasses the view)?
   Verify that GUARDRAIL 2 (`confirmed = ProfileAttributionToken.objects.filter(...status=CONFIRMED).first()`)
   always fires before the re-start block when a CONFIRMED token exists.

b. In `expire_attribution_tokens.py`, the bulk `.update()` targets `status__in=[PENDING, CONFIRMED]`.
   This means a CONFIRMED token CAN be bulk-expired if its `expires_at` is in the past. Verify
   whether this is correct per BRD: once a token is CONFIRMED, should it ever be expired by the
   sweep? A CONFIRMED token represents a committed attribution relationship; expiring it could
   affect fee calculations in `get_telehealth_fee()` / `get_checkout_discount()`.

c. There is no Django model-level validation (no `clean()`, no `save()` override) that enforces
   valid transitions. All transition logic is in view/utils code. Is this acceptable given the
   test coverage, or is there a risk of incorrect transitions from admin panel edits or
   management commands?

**Verdict required**: Are all invalid transitions blocked? Is the CONFIRMED→EXPIRED sweep
transition intentional?

---

### 7. modified_at Field — BaseModel Compatibility

**What to verify**:

a. `BaseModel` (in `apps/authentication/models.py`) defines:
   ```python
   modified_at = models.DateTimeField(auto_now=True, db_index=True)
   ```
   `auto_now=True` means Django sets this field to `timezone.now()` on every `.save()` call,
   **regardless of whether it appears in `update_fields`**.

b. Multiple `save(update_fields=[..., 'modified_at'])` calls appear in `utils.py` and `views.py`.
   Because `auto_now=True` already handles the update, explicitly including `modified_at` in
   `update_fields` is redundant but harmless. However, if `modified_at` is NOT included in
   `update_fields`, `auto_now` still fires — confirm this by reading the Django docs behavior
   for `auto_now` with `update_fields`. The concern is: does Django respect `auto_now` when
   `update_fields` is provided but does NOT include `modified_at`? If not, `modified_at` will
   be stale for partial saves.

c. Verify: when `expire_attribution_tokens.py` uses bulk `.update(status=AttributionStatus.EXPIRED)`,
   does `auto_now` fire? Bulk `.update()` bypasses `.save()` entirely, so `auto_now` does NOT
   fire. The `modified_at` column will NOT be updated when the expiry sweep runs. This means you
   cannot use `modified_at` to determine when a token was expired. Is there a separate
   `expired_at` timestamp field? If not, flag as a monitoring gap.

**Verdict required**: Is `modified_at` reliably updated across all code paths? Does the bulk
expiry sweep silently leave `modified_at` stale?

---

### 8. Index Coverage — Query Performance

**Existing indexes on ProfileAttributionToken**:
```python
models.Index(fields=['provider', 'client', 'status']),
models.Index(fields=['expires_at']),
```

**What to verify**:

a. `views.py` queries `.filter(provider=provider, client=client).order_by('-created_at').first()`
   (line 106–109) — this hits the composite index on `(provider, client, status)` only if status
   is in the filter. This specific query has NO status filter, so it uses the `(provider, client)`
   prefix. Confirm the composite index `(provider, client, status)` covers this as a prefix scan,
   or whether a separate `(provider, client)` index (or the FK `db_index=True`) is more
   appropriate. Note: the FK fields have `db_index=True` which creates individual indexes on
   `provider_id` and `client_id`. A query on both together will use one of them with a filter,
   not a combined index.

b. `expire_attribution_tokens.py` queries `.filter(status__in=[PENDING, CONFIRMED], expires_at__lte=now)`.
   This filter uses both `status` and `expires_at`. The index on `expires_at` alone will be used
   for range scans; the composite `(provider, client, status)` index is not useful here. Verify
   whether a composite index on `(status, expires_at)` would improve sweep performance at scale
   (e.g., 100k+ tokens).

c. `get_checkout_discount()` in `utils.py` queries:
   `.filter(provider=provider, client=client, status__in=[PENDING, CONFIRMED], expires_at__gt=now)`
   — this benefits from the `(provider, client, status)` composite index. Confirm.

**Verdict required**: Are the indexes sufficient for all production query patterns? Is a
`(status, expires_at)` index missing for the expiry sweep?

---

### 9. Import Safety — Circular Import Risk

**What to verify**:

a. `apps/attribution/utils.py` imports from `.models` at the top level. The `has_prior_booking()`
   function imports `Appointment` lazily:
   ```python
   def has_prior_booking(provider, client):
       from apps.calendar_functionality.models import Appointment
       ...
   ```
   Confirm this lazy import is present and is the only reference to `calendar_functionality`
   in `utils.py`. A top-level import would create a circular dependency:
   `attribution` → `calendar_functionality` → (possibly back to `attribution` via cron.py, which
   imports from both).

b. `lumy_global/cron.py` imports from `apps.attribution.utils` at the top level (line 4):
   `from apps.attribution.utils import get_telehealth_fee`. Also imports from
   `apps.calendar_functionality.models import Appointment` at line 13. Trace whether
   `calendar_functionality.models` imports anything from `attribution`. If it does, there is a
   circular import at the module level.

c. `apps/attribution/views.py` imports `CareProvider` lazily inside the `post()` method
   (line 33: `from apps.care_provider.models import CareProvider`). Verify whether this lazy
   import is necessary (i.e., whether `care_provider` imports from `attribution` at the module
   level).

**Verdict required**: Are all cross-app imports safe? Does removing any lazy import break
the import chain?

---

### 10. Test Coverage — Time-Based Scenarios

**What to verify**:

a. Open `apps/attribution/tests/test_models.py`. Check whether any test mocks `timezone.now()`
   to simulate:
   - Day 59 scenario: token still within window (should NOT expire)
   - Day 61 scenario: token just past window (should expire)
   - Day 70 scenario: booking after a Day 45 window reset (should confirm)

   The current tests use `timezone.now() + timedelta(days=30)` and `timezone.now() - timedelta(days=1)`
   for simple past/future checks. There are NO tests using `@patch('django.utils.timezone.now')`
   to simulate a specific calendar day. Confirm this is accurate.

b. Verify whether there is a test for the BRD scenario: token created on Day 1, re-visit on
   Day 45 (window reset), then expiry sweep runs on Day 62 (original expiry) — token should NOT
   be expired because `expires_at` was reset to Day 105. Confirm whether `expire_attribution_tokens`
   tests cover this case.

c. Verify whether there is a test simulating the race condition described in Audit Item 2
   (two concurrent `create()` calls resulting in `IntegrityError`).

d. Verify whether there is an integration test that calls `TrackAttributionView` via the test
   client and asserts the HTTP response, or whether all tests are pure unit tests on models/utils.

**Verdict required**: Which of these scenarios are untested? Produce a list of missing test cases.

---

## Output Format

For each of the 10 audit items, produce:

```
### Item N: <Title>
VERDICT: PASS | FAIL | NEEDS-INVESTIGATION | NOT-IMPLEMENTED

FINDING:
<2–5 sentences describing what the code actually does, with file:line references>

RISK:
<If FAIL or NEEDS-INVESTIGATION: describe the failure mode, severity (P0/P1/P2/P3), and affected user flows>

RECOMMENDATION:
<Concrete code change or investigation step required. If PASS, write "None.">
```

After all 10 items, produce a summary table:

| # | Item | Verdict | Severity |
|---|---|---|---|
| 1 | Window Reset Correctness | ... | ... |
| 2 | Race Conditions | ... | ... |
| ... | ... | ... | ... |

Then produce a prioritized list of action items, ordered by severity.

---

## Codebase Context for the Auditor

Key facts discovered during prompt authorship (do NOT take these as ground truth — verify each):

- `BaseModel.modified_at` uses `auto_now=True`. Bulk `.update()` does NOT trigger `auto_now`.
- The partial unique constraint covers only `status IN ('pending', 'confirmed')`.
- `create_attribution_token()` in `utils.py` does NOT reset an expired token's status to PENDING
  (it returns the expired token as-is when `is_expired=True`). The view DOES reset status.
  These two code paths are inconsistent.
- The "re-start clock" block in `views.py` uses `.order_by('-created_at').first()` with NO
  status filter, meaning it could match an INELIGIBLE or CONFIRMED token after the guardrail
  checks. The guardrails return early for CONFIRMED and INELIGIBLE, so this is likely safe —
  but the ordering of checks must be verified to be exhaustive.
- `expire_attribution_tokens` management command targets BOTH PENDING and CONFIRMED tokens for
  expiry. A CONFIRMED token can be bulk-expired if `expires_at` is past.
- No APScheduler, Celery Beat, or django-crontab entry for `expire_attribution_tokens` has been
  found in `cron.py`, `settings.py`, or `tasks.py`. The sweep is not automatically scheduled.
- No `confirm_attribution_if_eligible` function exists in the attribution app. How/whether
  PENDING tokens are ever confirmed is unknown from the files listed above.
- `get_checkout_discount()` uses `select_for_update()` inside `transaction.atomic()` — correct.
  `TrackAttributionView.post()` and `create_attribution_token()` do NOT — potential race.
- `has_prior_booking()` uses a lazy import of `Appointment` — correct for circular import safety.
- Missing test cases include: mocked `timezone.now()` for Day 59/61/70, window-reset + expiry
  sweep ordering, and concurrent-create race condition.
