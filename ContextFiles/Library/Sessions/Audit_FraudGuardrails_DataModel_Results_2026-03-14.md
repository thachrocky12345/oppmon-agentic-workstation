# Data Model / Technical Audit Results — RGDEV-185: Fraud & Gaming Guardrails

**Date**: 2026-03-14
**Auditor**: Claude (automated)
**Branch HEAD**: `f748096` — `feat(attribution): fraud and gaming guardrails — prior booking check, INELIGIBLE status, fraud logger (RGDEV-185)`
**Scope**: `apps/attribution/` — `ProfileAttributionToken`, `TrackAttributionView`, `has_prior_booking()`, fraud guardrail tests

---

## Summary Scoreboard

| # | Area | Verdict | Severity | Status |
|---|------|---------|----------|--------|
| 1 | `has_prior_booking()` model coverage | **FAIL** | **CRITICAL** | TalkNow + Session models not queried |
| 2 | Cancelled appointment coverage | PASS | LOW | Correct by design |
| 3 | INELIGIBLE update atomicity (race condition) | **FAIL** | **HIGH** | No `transaction.atomic()` or `select_for_update()` |
| 4 | Bulk `.update()` correctness | PASS | LOW | Correct given partial constraint |
| 5 | Account switching (provider new account) | NEEDS DISCUSSION | MEDIUM | Not in scope for RGDEV-185 per current design |
| 6 | Internal navigation enforcement | NEEDS DISCUSSION | MEDIUM | Frontend-only, no server-side enforcement |
| 7 | INELIGIBLE response + re-activation paths | **FAIL** | **HIGH** | Main branch code re-activates INELIGIBLE tokens |
| 8 | CONFIRMED token expiry filter absent | **FAIL** | **HIGH** | Expired CONFIRMED token permanently blocks re-attribution |
| 9 | `fraud_logger` configuration | **FAIL** | MEDIUM | No dedicated handler; ephemeral in Docker |
| 10 | Test fixture quality | **FAIL** | MEDIUM | Missing TalkNow, race condition, and re-activation tests |

---

## Detailed Findings

### 1. Booking History Check Completeness

**Verdict: FAIL — CRITICAL**

**Files examined**:
- `apps/attribution/utils.py` lines 123-132 (`has_prior_booking()`)
- `apps/talk_now/models.py` lines 41-51 (`TalkNow` model)
- `apps/calendar_functionality/models.py` lines 136-153 (`Session` model)

**Finding**: `has_prior_booking()` queries only `Appointment.objects.filter(care_provider=provider, client=client)`. Two other session-like models exist and are not checked:

**1a. TalkNow model gap (CRITICAL)**:
- `TalkNow` model (line 41-51 of `apps/talk_now/models.py`) has both `care_provider` FK (to `CareProvider`) and `client` FK — but `client` points to `User` (the auth user model), NOT `Client`.
- FK mismatch confirmed: `TalkNow.client` -> `settings.AUTH_USER_MODEL` while `has_prior_booking()` receives a `Client` profile object.
- Join path: `TalkNow.objects.filter(care_provider=provider, client=client.user)` would be needed.
- A completed TalkNow call (`current_status` in `ACCEPTED`, `LEAVE`) represents a real provider-client interaction. A client who had a Talk Now session and then visits the provider profile externally would pass the `has_prior_booking()` check and get an attribution token — this is a fraud window.

**1b. Session model gap (LOW)**:
- `Session` model at line 136-153 of `apps/calendar_functionality/models.py` has both `care_provider` FK (to `CareProvider`) and `client` FK (to `Client`).
- Searched for `Session.objects.create` in `apps/calendar_functionality/views.py` — **zero matches**. The `Session` model appears to be a legacy model that is not actively written to.
- While not actively used, it may have historical data that should also be included in the prior-relationship check for correctness.

**Minimal fix**:
```python
def has_prior_booking(provider, client):
    from apps.calendar_functionality.models import Appointment, Session
    from apps.talk_now.models import TalkNow

    if Appointment.objects.filter(care_provider=provider, client=client).exists():
        return True
    if TalkNow.objects.filter(
        care_provider=provider,
        client=client.user,  # FK mismatch: TalkNow.client -> User
        current_status__in=['ACCEPTED', 'LEAVE'],
    ).exists():
        return True
    if Session.objects.filter(care_provider=provider, client=client).exists():
        return True
    return False
```

---

### 2. Cancelled Appointment Coverage

**Verdict: PASS — LOW**

**Files examined**:
- `apps/attribution/utils.py` lines 123-132
- `apps/calendar_functionality/constants.py` lines 7-11
- `apps/attribution/tests/test_fraud_guardrails.py` lines 64-74

**Finding**:
- `has_prior_booking()` has no status filter — all statuses are included. The docstring explicitly states "any status, including cancelled" (line 125-126).
- `APPOINTMENT_STATUS` defines three values: `SCHEDULED`, `COMPLETED`, `CANCELLED` (constants.py lines 7-11). No undocumented statuses in the constant definition.
- Test `test_cancelled_booking_still_blocks` (lines 64-74) creates a CANCELLED appointment and verifies blocking works. The test is well-constructed with real DB objects.
- DB may contain undocumented status strings from historical data — recommend running `SELECT DISTINCT is_status FROM calendar_functionality_appointment;` in production to verify no drift.

---

### 3. INELIGIBLE Token Update Atomicity (Race Condition)

**Verdict: FAIL — HIGH**

**File examined**: `apps/attribution/views.py` lines 32-132

**Finding**: The entire `TrackAttributionView.post()` method has **no `transaction.atomic()` wrapper** and **no `select_for_update()` call**. The prior-booking check, INELIGIBLE update, and token creation/refresh are all separate, non-atomic database operations.

**Race condition scenario**:
1. Request A: `has_prior_booking()` returns `False` (lines 53) — thread continues to line 106
2. Request B (concurrent, slightly later): `has_prior_booking()` also returns `False` — same client, same provider
3. Request A: Creates a new PENDING token at line 112
4. Request B: Finds the token from Request A at line 106-109, refreshes its window — both requests succeed, but only one token exists (mitigated by partial constraint)

More dangerous race with booking creation:
1. Request A: `has_prior_booking()` returns `False`
2. **Meanwhile**: An appointment is created for this provider-client pair (via a separate booking flow)
3. Request A: Creates a PENDING token that should have been blocked

**Contrast with `get_checkout_discount()`** (utils.py lines 63-120): This function correctly uses `transaction.atomic()` + `select_for_update()` to prevent concurrent checkout double-discounts. The `TrackAttributionView` does not follow this pattern.

**Minimal fix**: Wrap the entire post() body from line 53 onward in `transaction.atomic()` and use `select_for_update()` on the token query:
```python
with transaction.atomic():
    if has_prior_booking(provider, client):
        ProfileAttributionToken.objects.select_for_update().filter(
            provider=provider, client=client, status=AttributionStatus.PENDING,
        ).update(status=AttributionStatus.INELIGIBLE)
        ...
```

---

### 4. Bulk `.update()` Correctness

**Verdict: PASS — LOW**

**Files examined**:
- `apps/attribution/views.py` lines 55-59
- `apps/attribution/models.py` lines 72-78 (partial unique constraint)

**Finding**:
- The `unique_active_attribution_token` partial constraint (model Meta, lines 72-78) enforces `UniqueConstraint(fields=['provider', 'client'], condition=Q(status__in=['pending', 'confirmed']))`. At most one PENDING and one CONFIRMED token can coexist per provider-client pair.
- The bulk `.update()` will therefore affect at most one row. This is the correct approach — safer than `.get().save()` which would raise `MultipleObjectsReturned` if the constraint is somehow violated.
- No source-level differentiation is currently needed (source conflict resolution is deferred to RGDEV-205).

---

### 5. Account Switching Attack — Client-Anchored Check

**Verdict: NEEDS DISCUSSION — MEDIUM**

**Files examined**:
- `apps/attribution/views.py` lines 46-48 (client extraction)
- `apps/attribution/utils.py` line 123 (`has_prior_booking()` signature)

**Finding**:
- Client is extracted from `request.user.client` (line 48). The check queries `Appointment.objects.filter(care_provider=provider, client=client)` — anchored to the specific `CareProvider` row, not the provider's identity/person.
- If a provider creates a new `CareProvider` account (new row), an existing client who had appointments with the old provider account would **not** be blocked for the new account. The `has_prior_booking()` check would return `False`, and a new attribution token would be created.
- This is a provider-side gaming vector: a provider could create multiple accounts to reset attribution eligibility with existing clients and claim reduced fees on sessions that don't represent genuinely new relationships.
- Whether this is in scope for RGDEV-185 needs product confirmation. It may be addressed by provider identity deduplication or admin-level controls.

---

### 6. Internal Navigation Exclusion — Server-Side Enforcement

**Verdict: NEEDS DISCUSSION — MEDIUM**

**Files examined**:
- `apps/attribution/views.py` lines 19-27 (docstring)
- `apps/attribution/urls.py` (endpoint exposed at `track/`)
- `lumy_global/settings.py` — REST_FRAMEWORK config (lines 248-253)

**Finding**:
- The docstring at line 27 states: "Internal navigation must NOT call this endpoint (enforced by caller)".
- There is **no server-side mechanism** to distinguish internal from external navigation. No referer validation, no header check, no origin whitelist/blacklist.
- The `referer` field is stored on the token (line 118/126) but is never validated against known internal domains (e.g., `really.global`).
- **Throttle configuration**: `UserRateThrottle` is the only throttle class (line 30). `DEFAULT_THROTTLE_RATES` is **not configured** in `settings.py` — DRF defaults to no rate limit when `DEFAULT_THROTTLE_RATES` is absent, which means `UserRateThrottle` will raise an `ImproperlyConfigured` error at runtime unless a `'user'` key exists. **This is a potential runtime error.**

**Action items**:
1. Add `DEFAULT_THROTTLE_RATES = {'user': '100/hour', 'anon': '20/hour'}` to settings.py.
2. Decide whether a server-side referer check is needed (e.g., reject POSTs where referer matches `*.really.global`).

---

### 7. INELIGIBLE Token — Response on Re-Visit + Re-Activation Paths

**Verdict: FAIL — HIGH**

**Files examined**:
- `apps/attribution/views.py` lines 86-132

**Finding — CRITICAL RE-ACTIVATION BUG**:

The `TrackAttributionView.post()` on the current branch (HEAD `f748096`) has a **re-activation path from INELIGIBLE back to PENDING**. At lines 106-127:

```python
existing = ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
).order_by('-created_at').first()

if existing is None:
    # ... create new
else:
    # PENDING or EXPIRED — re-start clock
    existing.expires_at = new_expires_at
    existing.status = AttributionStatus.PENDING   # <--- LINE 123
    ...
```

The comment says "PENDING or EXPIRED" but the code reaches this `else` branch for **any** status that is not `None`, including INELIGIBLE. The Guardrail 3 check (lines 86-100) correctly returns early for INELIGIBLE tokens — **BUT** the Guardrail 3 check queries `.filter(status=AttributionStatus.INELIGIBLE)` which only finds tokens with exactly that status. If an INELIGIBLE token somehow falls through (e.g., timing, or the Guardrail 1 check at line 53 runs first and updates the token to INELIGIBLE, but then a concurrent request reaches line 106 before the update is committed), the token could be re-activated.

Wait — re-reading the flow more carefully: Guardrail 1 (line 53) is checked first. If `has_prior_booking()` returns True, the function returns at line 72. If it returns False, execution continues to Guardrails 2 and 3. If an INELIGIBLE token exists AND `has_prior_booking()` returns False (impossible under normal conditions, but possible if the appointment was hard-deleted), then Guardrail 3 at line 87-100 would catch it and return.

**However**, there is a subtle ordering problem: lines 106-127 query `ProfileAttributionToken.objects.filter(provider=provider, client=client)` with **no status filter**. If Guardrail 1 fires (booking exists), lines 55-59 update PENDING->INELIGIBLE, and the function returns. But if Guardrail 1 does NOT fire AND an INELIGIBLE token exists AND Guardrail 3 checks at line 87 catches it, we return at line 100. So the re-activation at line 123 is only reached if all three guardrails pass. This means the `else` branch at line 120-127 should only encounter PENDING or EXPIRED tokens.

**Revised verdict**: The ordering is correct under the assumption that Guardrails 1/2/3 all run before the create/refresh block. The INELIGIBLE re-activation path does NOT exist in practice because Guardrail 3 returns early. However, the **lack of an explicit status filter** at line 106-109 is fragile — if future code re-orders the guardrails or adds a new status, the `else` branch could silently re-activate tokens it shouldn't.

**Additional finding — worktree version (refactored)**:
The worktree at `.claude/worktrees/agent-ad3fbd38/apps/attribution/views.py` uses `record_attribution_visit()` from utils.py. That function (worktree utils.py lines 135-172) correctly checks `existing.status in (CONFIRMED, INELIGIBLE)` and returns locked tokens unchanged. This is safer. The main branch version should be updated to match.

**Recommended fix**: Add an explicit status filter at line 106-109 or add an assertion:
```python
existing = ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
    status__in=[AttributionStatus.PENDING, AttributionStatus.EXPIRED],
).order_by('-created_at').first()
```

---

### 8. CONFIRMED Token — Source Immutability and Fee Protection

**Verdict: FAIL — HIGH**

**Files examined**:
- `apps/attribution/views.py` lines 74-84 (Guardrail 2)
- `apps/attribution/models.py` lines 23-40 (source conflict resolution comment)

**Finding — Missing expiry filter on CONFIRMED check**:

At line 75-79:
```python
confirmed = ProfileAttributionToken.objects.filter(
    provider=provider,
    client=client,
    status=AttributionStatus.CONFIRMED,
).first()
```

There is **no `expires_at__gt=timezone.now()` filter**. This means:
- A CONFIRMED token from 18 months ago whose `expires_at` has long passed will still be returned by this query.
- The view returns `{'attributed': True, 'already_confirmed': True}` — blocking any new attribution.
- The client can never be re-attributed to this provider, even if the attribution window has expired and the fee override has been revoked/deactivated.

**Contrast with `get_checkout_discount()`** (utils.py lines 77-89): This function correctly filters on `expires_at__gt=timezone.now()`.

**Impact**: An expired CONFIRMED token permanently blocks re-attribution. If the business intent is that attribution expires after the window closes, this is a bug. If "once confirmed, always confirmed" is the intended behavior, it should be documented as a conscious design decision.

**Additional finding — "First touch wins" source immutability**:
- The comment block at models.py lines 23-40 documents that source conflict resolution is deferred to RGDEV-205.
- Current behavior: "first touch wins" — source is never overwritten on re-visit.
- PROFILE source -> 12% fee; BOOKING_LINK source -> 10% fee. A CONFIRMED PROFILE token (12%) will block re-attribution to a BOOKING_LINK (10%) even if the client later clicks the booking link. This may not be the desired behavior if "lowest fee wins" is the business rule.

---

### 9. `fraud_logger` Configuration

**Verdict: FAIL — MEDIUM**

**Files examined**:
- `apps/attribution/views.py` line 14 (`fraud_logger = logging.getLogger('attribution.fraud')`)
- `lumy_global/settings.py` lines 522-560 (`LOGGING` config)

**Finding**:

1. **No dedicated logger or handler**: The `LOGGING` config (lines 523-560) defines:
   - `root` logger with handlers `['console', 'file']`
   - No `loggers` dict — no named loggers are configured
   - `fraud_logger` messages propagate to root and are written to both console and `logger.logs` file

2. **Fraud events mixed with all other logs**: The `file` handler writes to `os.path.join(BASE_DIR, "logger.logs")` — a single RotatingFileHandler for all application output. Fraud signals (`attribution.fraud`) are indistinguishable from general debug/info output without text-level filtering.

3. **Ephemeral in Docker**: The project runs via `docker-compose.yml`. `logger.logs` is a file inside the container filesystem. On container restart, rebuild, or scaling event, **all fraud logs are lost** unless the path is mounted to a persistent volume.

4. **No alerting integration**: There is no Sentry, CloudWatch, Datadog, or other external log aggregator configured. Fraud events generate only local log entries.

5. **Log format includes context**: The `fraud_logger.info()` and `.warning()` calls at lines 59-66 and 83-85 do include `provider_id`, `client_id`, and `referer` in the `extra` dict. However, the `verbose` formatter at line 540 uses `%(module)s - %(message)s` which does **not render `extra` fields**. The structured `extra` data is silently discarded in the log output.

**Recommendations**:
- Add a dedicated `attribution.fraud` logger with its own handler writing to a persistent path or external service.
- Use a JSON formatter or `%(provider_id)s`/`%(client_id)s` placeholders so `extra` fields appear in output.
- Mount `logger.logs` to a Docker volume, or forward to stdout for container log aggregation.

---

### 10. Test Fixture Quality

**Verdict: FAIL — MEDIUM**

**Files examined**:
- `apps/attribution/tests/test_fraud_guardrails.py` (full file, 162 lines)
- `apps/attribution/utils.py` lines 123-132

**Findings**:

**10a. Real DB objects — PASS**: Tests use `django.test.TestCase` with `Appointment.objects.create()`, `ProfileAttributionToken.objects.create()`, etc. No mocking of `has_prior_booking()` or ORM queries. This is correct — mock-based tests would not catch query construction errors.

**10b. Minimal fixtures — PASS**: `Appointment.objects.create()` at lines 54-58 omits nullable fields (`start_date_time`, `modality`, `format`). The `Appointment.save()` override (models.py line 130-133) only assigns `room_name` via `uuid.uuid4()` which does not raise. No IntegrityError expected.

**10c. TalkNow coverage — FAIL**: Zero tests for TalkNow-based prior relationship blocking. If Finding #1 is fixed (adding TalkNow to `has_prior_booking()`), the following tests are needed:
- `test_talknow_accepted_blocks_attribution()` — TalkNow with `current_status='ACCEPTED'` should block
- `test_talknow_incoming_does_not_block()` — TalkNow with `current_status='INCOMING'` (never connected) should not block (if that's the business rule)

**10d. Race condition tests — FAIL**: No concurrency tests exist. A test using `threading.Thread` or Django's `TransactionTestCase` to simulate concurrent POST requests would be needed to verify atomicity.

**10e. INELIGIBLE re-activation — FAIL**: No test verifies that an INELIGIBLE token cannot be re-activated to PENDING via the else branch at views.py line 120-127. While Guardrail 3 should prevent reaching that code, an explicit regression test would catch future ordering changes.

**10f. Expired CONFIRMED token test — FAIL**: No test verifies behavior when a CONFIRMED token has `expires_at` in the past. This is the Finding #8 scenario — an expired CONFIRMED token should either block or allow re-attribution, and a test should document the intended behavior.

**10g. Test runner inclusion — PASS**: `apps/attribution/tests/__init__.py` exists. The tests are discoverable by `python manage.py test apps.attribution`.

---

## Critical Fix Priority

### P0 — Must fix before merge

| Finding | Fix |
|---------|-----|
| **#1 TalkNow gap** | Add TalkNow query to `has_prior_booking()` with FK mismatch handling (`client=client.user`) |
| **#3 Race condition** | Wrap `TrackAttributionView.post()` guardrail+create block in `transaction.atomic()` + `select_for_update()` |
| **#7 Fragile else branch** | Add explicit status filter to token query at views.py line 106-109 |
| **#8 CONFIRMED expiry filter** | Add `expires_at__gt=timezone.now()` to CONFIRMED check at views.py line 75, OR document "forever lock" as intentional |

### P1 — Should fix before production

| Finding | Fix |
|---------|-----|
| **#9 fraud_logger** | Add dedicated handler, fix formatter to include `extra` fields, ensure persistence in Docker |
| **#10 Test gaps** | Add TalkNow, race condition, expired-CONFIRMED, and INELIGIBLE re-activation tests |
| **#6 Throttle config** | Add `DEFAULT_THROTTLE_RATES` to settings.py to prevent `ImproperlyConfigured` at runtime |

### P2 — Product decision needed

| Finding | Decision needed |
|---------|----------------|
| **#5 Provider account switching** | Is provider-identity deduplication in scope? |
| **#6 Server-side referer check** | Is frontend-only enforcement acceptable? |
| **#8 Source conflict resolution** | "First touch wins" vs "lowest fee wins" — deferred to RGDEV-205 |

---

## Reference: Key Code Locations

| Symbol | File | Lines |
|--------|------|-------|
| `has_prior_booking()` | `apps/attribution/utils.py` | 123–132 |
| `TrackAttributionView.post()` | `apps/attribution/views.py` | 32–132 |
| `record_attribution_visit()` (worktree) | `.claude/worktrees/agent-ad3fbd38/apps/attribution/utils.py` | 135–172 |
| `ProfileAttributionToken` model | `apps/attribution/models.py` | 43–94 |
| `AttributionStatus` choices | `apps/attribution/models.py` | 16–20 |
| `unique_active_attribution_token` constraint | `apps/attribution/models.py` | 72–78 |
| `Appointment` model | `apps/calendar_functionality/models.py` | 79–133 |
| `Session` model (legacy) | `apps/calendar_functionality/models.py` | 136–153 |
| `APPOINTMENT_STATUS` | `apps/calendar_functionality/constants.py` | 7–11 |
| `TalkNow` model | `apps/talk_now/models.py` | 41–51 |
| `TalkNow.client` FK → `User` | `apps/talk_now/models.py` | 42 |
| `get_checkout_discount()` (atomic reference) | `apps/attribution/utils.py` | 63–120 |
| `LOGGING` config | `lumy_global/settings.py` | 522–560 |
| Fraud guardrail tests | `apps/attribution/tests/test_fraud_guardrails.py` | 1–162 |
| `ProviderClientFeeOverride` | `apps/attribution/models.py` | 97–138 |
| `confirm_attribution_if_eligible()` | worktree `apps/attribution/utils.py` | 175–197 |
