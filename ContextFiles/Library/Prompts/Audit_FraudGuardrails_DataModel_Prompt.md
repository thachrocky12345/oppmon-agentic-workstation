# Data Model / Technical Audit Prompt — RGDEV-185: Fraud & Gaming Guardrails

**Scope**: `apps/attribution/` — `ProfileAttributionToken`, `TrackAttributionView`, `has_prior_booking()`, fraud guardrail tests.

**Purpose**: Identify correctness gaps, race conditions, model coverage holes, logging misconfiguration, and test quality issues before this feature ships to production.

---

## How to Use This Prompt

For each numbered question below:
1. Read the referenced code at the exact file and line cited.
2. Answer with a **Verdict** (PASS / FAIL / NEEDS DISCUSSION) and a brief **Finding**.
3. If FAIL, propose the minimal fix.

---

## 1. Booking History Check Completeness

**Files to read**:
- `apps/attribution/utils.py` — `has_prior_booking()` (lines 123–132)
- `apps/talk_now/models.py` — `TalkNow` model (lines 41–51)
- `apps/calendar_functionality/models.py` — `Session` model (lines 136–153)

**Question**:

`has_prior_booking()` currently contains:

```python
return Appointment.objects.filter(
    care_provider=provider,
    client=client,
).exists()
```

The platform has at least two other session-like models:

- `TalkNow` (apps/talk_now/models.py): an on-demand call. Uses `care_provider` FK to `CareProvider` but the `client` FK points to `User` (the auth user), not to a `Client` profile object. A completed `TalkNow` session (status `ACCEPTED` or beyond) represents a real prior relationship.
- `Session` (apps/calendar_functionality/models.py): has `care_provider` FK and `client` FK — appears to be a legacy or parallel session model alongside `Appointment`.

**Audit tasks**:
a. Does a completed TalkNow session constitute an "existing relationship" under the BRD definition for Fraud & Gaming? If yes, `has_prior_booking()` is currently blind to it.
b. Is the `Session` model actively written to? Check `apps/calendar_functionality/views.py` for any `Session.objects.create(...)` calls. If it is used, `has_prior_booking()` misses it.
c. Note the FK mismatch: `TalkNow.client` → `User`, while `has_prior_booking()` receives a `Client` profile. Determine how to join: `TalkNow.client = client.user` (i.e., `client__user=client.user` or via `client.user_id`).

**Expected finding to confirm or refute**: `has_prior_booking()` covers `Appointment` only; `TalkNow` sessions and legacy `Session` records are silently excluded, creating a fraud window for existing TalkNow relationships.

---

## 2. Cancelled Appointment Coverage

**Files to read**:
- `apps/attribution/utils.py` — `has_prior_booking()` docstring (lines 123–127)
- `apps/calendar_functionality/constants.py` — `APPOINTMENT_STATUS` (lines 7–11)
- `apps/attribution/tests/test_fraud_guardrails.py` — `test_cancelled_booking_still_blocks` (lines 64–74)

**Question**:

The docstring states "any status, including cancelled". The current query has no `.filter(is_status__in=[...])` restriction, so ALL appointment statuses are included by default. Verify:

a. Is the no-filter approach correct and intentional? Confirm there is no status that should be excluded (e.g., a hypothetical `PENDING_PAYMENT` pre-booking status that should not count as an established relationship).
b. `APPOINTMENT_STATUS` has three values: `SCHEDULED`, `COMPLETED`, `CANCELLED`. Are there additional status values stored in the DB that do not appear in `constants.py`? Run: `SELECT DISTINCT is_status FROM calendar_functionality_appointment;` to check for data drift.
c. The test at line 64 creates a `CANCELLED` appointment and verifies blocking — confirm this test passes in the current test suite.

**Expected finding to confirm or refute**: Coverage is correct for the three documented statuses, but DB may contain undocumented status strings from historical data that should also be audited.

---

## 3. INELIGIBLE Token Update Atomicity (Race Condition)

**Files to read**:
- `apps/attribution/views.py` — `TrackAttributionView.post()` (lines 52–72)

**Question**:

When `has_prior_booking()` returns `True`, the view executes:

```python
ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
    status=AttributionStatus.PENDING,
).update(status=AttributionStatus.INELIGIBLE)
```

This `.update()` is **not wrapped in `transaction.atomic()`** and is **not protected by `select_for_update()`**.

Consider this race:
1. Request A: `has_prior_booking()` → True → begins `.update(PENDING → INELIGIBLE)`
2. Request B (concurrent): `has_prior_booking()` → False (appointment not yet visible, or B runs between A's check and A's update) → reaches the token create/refresh branch → creates a new PENDING token
3. Request A completes: marks the token that existed before B's as INELIGIBLE — but B's newly created PENDING token is never touched

**Audit tasks**:
a. Is the entire guardrail block (has_prior_booking check + INELIGIBLE update + early return) wrapped in a `transaction.atomic()` with `select_for_update()` on any token for this provider-client pair? If not, document this as a race condition.
b. Compare with `get_checkout_discount()` in `utils.py` (lines 77–111), which correctly uses `transaction.atomic()` + `select_for_update()`. The TrackAttributionView does not follow the same pattern.
c. Proposed fix direction: wrap the entire `post()` method body in `transaction.atomic()` and acquire a row-level lock before checking `has_prior_booking()`.

**Expected finding to confirm or refute**: Race condition exists. The prior-booking check and the INELIGIBLE update are not atomic, allowing a concurrent request to slip through and create an unblocked PENDING token.

---

## 4. INELIGIBLE Bulk vs. Targeted Update

**Files to read**:
- `apps/attribution/views.py` — lines 54–59 (the `.update()` call)

**Question**:

The update uses `.update(status=AttributionStatus.INELIGIBLE)` which bulk-updates ALL PENDING tokens for this pair. Verify:

a. Can there be multiple PENDING tokens for the same provider-client pair simultaneously? The `unique_active_attribution_token` partial constraint (model meta, lines 72–78 of `models.py`) enforces uniqueness for `status IN ('pending', 'confirmed')`, so at most one PENDING + one CONFIRMED can coexist. Confirm: the constraint prevents duplicate PENDING rows, so bulk `.update()` will always affect at most one row.
b. However, if the constraint is only a DB-level constraint and there is a bug that bypasses it (e.g., via direct ORM `create()` without the constraint path), bulk `.update()` is the safer choice. Confirm `.update()` is preferred over `.get().save()` here.
c. Is there a case where the pair has a PENDING token that should survive (e.g., a PENDING token created by a different source `BOOKING_LINK` that may have different business rules)? The current `.update()` does not filter by `source`. Confirm whether source-level differentiation is required.

**Expected finding to confirm or refute**: Bulk `.update()` is likely correct given the partial unique constraint, but the absence of a `select_for_update()` is still a gap (see Question 3).

---

## 5. Account Switching Attack — Client-Anchored Check

**Files to read**:
- `apps/attribution/views.py` — lines 46–50 (client extraction from request)
- `apps/attribution/utils.py` — `has_prior_booking()` signature (line 123)

**Question**:

The client is extracted from the authenticated user:

```python
client = request.user.client
```

This means the booking history check is anchored to the **client profile**, not the provider. Verify:

a. If a **provider** creates a new provider account (new `CareProvider` row) and an existing client had appointments with the old provider account, `has_prior_booking()` will correctly return `False` for the new `provider` object — attribution would be incorrectly allowed. Is there any cross-provider deduplication? This is a provider-side gaming vector, not a client-side one.
b. Confirm the check is correctly client-anchored: `Appointment.objects.filter(care_provider=provider, client=client)` — provider is the specific provider being tracked, so a new provider account would not be blocked. Document this as a known gap if confirmed.
c. Does the BRD define "existing relationship" as tied to the specific provider account, or to the provider identity (e.g., by email, practice, or person)? If tied to identity, a cross-account lookup is needed.

**Expected finding to confirm or refute**: The check is correctly client-anchored for the typical fraud case (client gaming), but is not provider-account-aware. A provider who creates a new account can reset attribution eligibility with existing clients. Whether this is in scope for RGDEV-185 needs product confirmation.

---

## 6. Internal Navigation Exclusion — Server-Side Enforcement

**Files to read**:
- `apps/attribution/views.py` — docstring for `TrackAttributionView` (lines 21–27)
- `apps/attribution/urls.py` — confirm the endpoint is exposed

**Question**:

The docstring states: "Internal navigation must NOT call this endpoint (enforced by caller)". This means:
- Browsing the search results page (internal)
- Clicking a provider from the search results page (internal)
- Visiting a provider's profile from internal navigation (internal)

...should NOT POST to `/api/v1/attribution/track/`.

There is no server-side mechanism to distinguish "internal" from "external" navigation. A malicious client (or a frontend bug) can POST to this endpoint for any internal visit.

**Audit tasks**:
a. Is there any server-side referer validation? The `referer` field is stored but is it validated against a whitelist/blacklist of internal URLs (e.g., `really.global` domain = internal)?
b. Is there any rate limiting beyond `UserRateThrottle`? `UserRateThrottle` uses Django's default rate which is typically `100/day` unless configured. Check `settings.py` for `DEFAULT_THROTTLE_RATES`.
c. Can the `referer` header be used as a server-side signal? HTTP `Referer` header for internal page transitions would show `https://really.global/...` as origin. If the frontend sends a spoofed or absent referer, this check has no teeth.
d. Confirm whether RGDEV-185 accepts "frontend concern only" as sufficient, or whether a server-side referer check is required.

**Expected finding to confirm or refute**: No server-side internal navigation exclusion exists. The endpoint trusts the frontend to never call it for internal visits. This is a documented design choice, but the audit should confirm it is a conscious product decision and not an implementation gap.

---

## 7. INELIGIBLE Token — Response on Re-Visit

**Files to read**:
- `apps/attribution/views.py` — lines 86–100 (Guardrail 3 block)

**Question**:

When an INELIGIBLE token exists and a new visit arrives, the current response is:

```python
return Response(
    {'attributed': False, 'reason': 'ineligible'},
    status=200,
)
```

**Audit tasks**:
a. The response is HTTP 200 with `attributed: False`. Confirm the frontend handles this correctly — does the client app check `attributed` boolean, or does it only check the HTTP status code?
b. Is `fraud_logger.warning(...)` (line 93) the correct severity? An INELIGIBLE token being probed by repeat visits is a higher-signal fraud indicator than a first-time block. Consider whether this should be `ERROR` or trigger an alert.
c. No new token is created when an INELIGIBLE token exists. However, the view does not check whether a PENDING or CONFIRMED token also exists alongside the INELIGIBLE one (which should be impossible given the partial constraint, but confirm). If somehow both exist, the INELIGIBLE branch returns before ever reaching the CONFIRMED check at lines 74–84, which is correct ordering.
d. Confirm: is there any path where an INELIGIBLE token can be transitioned back to PENDING or CONFIRMED? Search for all `.update(status=AttributionStatus.PENDING)` and `.save()` calls across the codebase that do not first check for INELIGIBLE status.

**Expected finding to confirm or refute**: The 200 + `attributed: False` response is functional but may mask fraud signal. No re-activation path for INELIGIBLE tokens appears to exist, but a codebase-wide check is needed to confirm.

---

## 8. CONFIRMED Token — Source Immutability and Fee Protection

**Files to read**:
- `apps/attribution/views.py` — lines 74–84 (Guardrail 2)
- `apps/attribution/models.py` — `ATTRIBUTION_SOURCE_CONFLICT_RESOLUTION` comment block (lines 23–40)

**Question**:

When a CONFIRMED token exists, the view returns `{'attributed': True, 'already_confirmed': True}` and exits. No modification is made to the token. This means the fee tier locked in at confirmation time is preserved.

**Audit tasks**:
a. The BRD fee structure: `PROFILE` source → 12% reduced fee; `BOOKING_LINK` source → 10% reduced fee. A CONFIRMED `PROFILE` token yields a 12% fee. If the client later clicks the provider's booking link, the CONFIRMED check fires first and prevents re-attribution to 10%. Is "first touch wins on CONFIRMED" the correct business rule? Cross-reference RGDEV-205.
b. Can a CONFIRMED token expire? Check `is_active_window` property (models.py line 93): it checks `not is_expired`. Does the CONFIRMED check in `TrackAttributionView` filter on `expires_at`? At line 75: `ProfileAttributionToken.objects.filter(..., status=AttributionStatus.CONFIRMED)` — there is **no `expires_at__gt=timezone.now()` filter**. This means an expired CONFIRMED token still blocks re-attribution. Is this intentional? A client who was attributed 18 months ago under an expired CONFIRMED token will still hit this guardrail.
c. Confirm whether the `ProviderClientFeeOverride` row (which sets the actual billing fee) is created when the token is CONFIRMED, or when the first session is completed. If the fee override is created at confirmation, an expired token with a surviving fee override row will continue to apply the reduced fee indefinitely. If it is created at session completion, a new attribution path might be needed if the override is ever revoked.

**Expected finding to confirm or refute**: The CONFIRMED guardrail has no expiry filter — an expired CONFIRMED token permanently blocks re-attribution. This is likely a bug or at minimum an undocumented design choice that requires product sign-off.

---

## 9. `fraud_logger` — Logging Configuration

**Files to read**:
- `apps/attribution/views.py` — lines 14 (`fraud_logger = logging.getLogger('attribution.fraud')`)
- `lumy_global/settings.py` — `LOGGING` block (lines 523–560)

**Question**:

`fraud_logger` uses the logger name `'attribution.fraud'`. The `LOGGING` config in `settings.py` defines:
- A `root` logger that catches all loggers via `handlers: ['console', 'file']`
- No named loggers section (`loggers: {}` is absent)

**Audit tasks**:
a. Because there is no explicit `loggers` entry for `attribution.fraud` or `attribution`, the messages will propagate to the root logger and be written to `logger.logs` via the `file` handler. Confirm this is sufficient for production observability, or whether a dedicated handler (e.g., separate file `fraud.log`, or a Sentry/alerting integration) is needed for fraud signals.
b. The `file` handler writes to `os.path.join(BASE_DIR, "logger.logs")` — a single rotating file for all log output. Fraud events will be mixed with all other application logs. Confirm whether a separate `fraud.log` stream is required for monitoring/alerting purposes.
c. In a Docker/containerized environment (the project runs via `docker-compose.yml`), `logger.logs` is a file inside the container. If the container is ephemeral, fraud logs are lost on container restart. Confirm whether fraud logs need to be persisted to a volume or forwarded to an external log aggregator.
d. Check whether `fraud_logger.info(...)` calls include enough identifying context for forensic investigation: `provider_id`, `client_id`, `referer`. Confirm the `extra={}` dict is structured for searchability in whatever log aggregation tool is in use.

**Expected finding to confirm or refute**: `fraud_logger` will emit to the root logger and appear in `logger.logs`, but fraud events are not isolated or forwarded to an alerting system. In containerized deployments without log persistence, fraud events may be silently lost on restart.

---

## 10. Test Fixture Quality — Real DB Objects vs. Mocks

**Files to read**:
- `apps/attribution/tests/test_fraud_guardrails.py` — full file
- `apps/attribution/utils.py` — `has_prior_booking()` (lines 123–132)

**Question**:

`has_prior_booking()` executes a real database query: `Appointment.objects.filter(...).exists()`. The test file at `test_fraud_guardrails.py` uses `django.test.TestCase` with `Appointment.objects.create(...)` (lines 54–58, 66–70, 88–93) — these are real ORM operations against the test database.

**Audit tasks**:
a. Confirm: no mocking of `has_prior_booking()` or `Appointment.objects.filter()` is used in `test_fraud_guardrails.py`. Real DB objects are created. This is correct — mock-based tests of `has_prior_booking()` would not catch query construction errors.
b. The `Appointment.objects.create(...)` in tests omits many nullable fields (e.g., `start_date_time`, `modality`, `format`). Confirm the `Appointment.save()` override (models.py line 130) assigns a `room_name` UUID — this fires on `create()` and must not raise for the minimal fixture. Run the test suite to confirm no `IntegrityError` on the minimal appointment create.
c. The tests do NOT create `TalkNow` session records. If Question 1 confirms TalkNow sessions should be included in `has_prior_booking()`, the test suite needs corresponding tests: `test_talknow_session_blocks_attribution()` and `test_talknow_accepted_status_blocks()`.
d. The tests do NOT test the race condition scenario from Question 3 (concurrent requests). A concurrent-request test using `threading.Thread` or Django's `TestCase` transaction isolation would be needed to verify atomicity.
e. Check whether `apps/attribution/tests/test_fraud_guardrails.py` is included in the test runner. Confirm `apps/attribution/tests/` has `__init__.py` (it does per the file listing). Run `python manage.py test apps.attribution` and report pass/fail counts.

**Expected finding to confirm or refute**: Tests use real DB objects (correct pattern), but test coverage has gaps for TalkNow session history, concurrent access, and the INELIGIBLE re-activation code path.

---

## Summary Checklist

| # | Area | Primary Risk | Severity |
|---|------|-------------|----------|
| 1 | `has_prior_booking()` model coverage | TalkNow + Session models not checked — fraud window for on-demand call history | HIGH |
| 2 | Cancelled appointment coverage | Appears correct; verify no undocumented statuses in prod DB | LOW |
| 3 | INELIGIBLE update atomicity | Race condition: concurrent requests can bypass the prior-booking guardrail | HIGH |
| 4 | Bulk `.update()` correctness | Correct given partial constraint; confirm no source-level differentiation needed | LOW |
| 5 | Account switching (provider new account) | New provider account resets eligibility with existing clients | MEDIUM |
| 6 | Internal navigation enforcement | Frontend-only concern; no server-side referer validation | MEDIUM |
| 7 | INELIGIBLE response + re-activation paths | HTTP 200 functional; need codebase scan for INELIGIBLE → PENDING re-activation paths | MEDIUM |
| 8 | CONFIRMED token expiry filter absent | Expired CONFIRMED token permanently blocks re-attribution — likely unintended | HIGH |
| 9 | `fraud_logger` configuration | Logs mixed into general log file; ephemeral in Docker; no alerting integration | MEDIUM |
| 10 | Test fixture quality | Real DB objects used (correct); TalkNow coverage, race condition, INELIGIBLE re-activation tests missing | MEDIUM |

---

## Reference: Key Code Locations

| Symbol | File | Lines |
|--------|------|-------|
| `has_prior_booking()` | `apps/attribution/utils.py` | 123–132 |
| `TrackAttributionView.post()` | `apps/attribution/views.py` | 32–132 |
| `ProfileAttributionToken` model | `apps/attribution/models.py` | 43–94 |
| `AttributionStatus` choices | `apps/attribution/models.py` | 16–20 |
| `unique_active_attribution_token` constraint | `apps/attribution/models.py` | 72–78 |
| `Appointment` model | `apps/calendar_functionality/models.py` | 79–133 |
| `APPOINTMENT_STATUS` | `apps/calendar_functionality/constants.py` | 7–11 |
| `TalkNow` model | `apps/talk_now/models.py` | 41–51 |
| `Session` model | `apps/calendar_functionality/models.py` | 136–153 |
| `get_checkout_discount()` (atomic reference) | `apps/attribution/utils.py` | 63–120 |
| `LOGGING` config | `lumy_global/settings.py` | 523–560 |
| Fraud guardrail tests | `apps/attribution/tests/test_fraud_guardrails.py` | 1–162 |
