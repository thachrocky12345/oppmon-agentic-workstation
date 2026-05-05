# Attribution Data Model & Storage — UX / Scenario / Business-Logic Audit Prompt

**Purpose:** Instruct an opus-level agent to perform a thorough audit of the Attribution feature
by reading the implementation directly and producing a structured findings report.

**Scope ticket:** RGDEV-182

**Primary files to read (read all before answering any question):**
- `apps/attribution/models.py`
- `apps/attribution/utils.py`
- `apps/attribution/tests.py`
- `apps/attribution/urls.py`

**Secondary files (read only the relevant section if a question requires it):**
- `apps/stripe_integration/views.py` — confirm fee lookup call site and exception handling
- `apps/stripe_integration/tests.py` — confirm fee-related test coverage
- `apps/calendar_functionality/models.py` — confirm session_type / modality field name and values
  used to distinguish telehealth from in-person sessions
- `apps/authentication/models.py` — confirm `BaseModel` fields (`created_at`, `modified_at`,
  `is_active`) inherited by attribution models
- Any PayPal integration view that calls fee or discount utilities

---

## Instructions for the auditor

For every item below, state one of: **PASS**, **BUG**, **GAP**, **AMBIGUOUS**, or **OUT OF SCOPE**.
Cite the exact file, function, and line number(s) that support your finding. Do not speculate
without a code reference. Where a gap exists, propose the minimal code change or test needed to
close it.

---

## Section 1 — Attribution scoping: per-pair, not per-client

### 1.1 A client attributed to Provider A must have no effect on their fee with Provider B

The data model must be per-(provider, client) pair, not per-client global.

- Confirm `ProviderClientFeeOverride` has `unique_together = ('provider', 'client')` (or equivalent
  `UniqueConstraint`) in `models.py`. If the unique constraint is on `client` alone, any
  attribution to any provider would block attribution to a second provider. Flag as **BUG**.
- Confirm there is no global attribution table keyed only by `client_id`. If such a table exists,
  document its purpose and flag as **AMBIGUOUS**.
- Confirm `ProfileAttributionToken` is also keyed per-(provider, client). A token keyed only on
  `client` would prevent the same client from being attributed to a second provider simultaneously.
- Write or confirm a test scenario: client C visits Provider A's profile, then Provider B's booking
  link within the same 60-day window. Both `ProfileAttributionToken` rows should exist, and if both
  bookings occur, two separate `ProviderClientFeeOverride` rows should be created, one per pair.

### 1.2 Multiple simultaneous pending tokens for the same client (different providers)

- Search `models.py` for any unique constraint that would prevent two `ProfileAttributionToken`
  rows with `status=pending` for the same `client` but different `provider` values.
- If a unique constraint exists on `(client,)` alone, flag as **BUG**: a client browsing multiple
  providers before booking would lose all but the most recent attribution token.
- If a unique constraint exists on `(provider, client)` alone without a status filter, confirm
  whether a second visit by the same client to the same provider within the 60-day window creates
  a duplicate row or updates the existing one. Duplicates would mean two fee overrides could be
  created on booking confirmation.

---

## Section 2 — Race conditions

### 2.1 Concurrent bookings hitting `get_telehealth_fee()` for the same (provider, client) pair

File: `utils.py`, function `get_telehealth_fee`.

- Identify the ORM call used to create or confirm `ProviderClientFeeOverride`. If it uses
  `get_or_create`, note that in PostgreSQL this is not atomic without an explicit transaction or
  `select_for_update`. Two concurrent requests (e.g., client double-clicks "Book") can both find
  no existing row and both attempt `INSERT`.
- The `unique_together` constraint will cause the second `INSERT` to raise `IntegrityError`. Confirm
  whether `get_telehealth_fee` wraps the creation in a `try/except IntegrityError` followed by a
  retry `get`, or whether the unhandled `IntegrityError` surfaces as a 500.
- If `select_for_update` is used instead, confirm the call is inside a `transaction.atomic()` block.
  Using `select_for_update` outside a transaction is a no-op in Django.
- If neither pattern is present, flag as **BUG**: concurrent booking confirmation can create
  duplicate fee override records or crash with a 500.
- Propose the minimal fix: wrap in `transaction.atomic()` with `get_or_create` and catch
  `IntegrityError`, or use `update_or_create` with `create_defaults`.

### 2.2 Race between token confirmation and token expiry

- Identify the code path that transitions a `ProfileAttributionToken` from `pending` to `confirmed`.
  Confirm whether the expiry check (`expires_at > now`) and the status update happen inside a
  single `transaction.atomic()` block with `select_for_update`.
- If the token is read as `pending + not expired`, then a scheduler runs and marks it `expired`
  before the `save()` completes, the token could be confirmed after expiry. The resulting
  `ProviderClientFeeOverride` would grant a reduced fee based on an expired token.
- If no locking is present, flag as **AMBIGUOUS** with a recommendation to wrap the
  confirm-and-create path in a transaction with row-level lock.

### 2.3 Two `ProviderClientFeeOverride` rows for the same pair

- Even if `unique_together` exists, confirm it is enforced at the DB level (i.e., a migration
  creates an actual `UNIQUE` constraint in PostgreSQL, not only a Django-level validator).
- Run `grep -n "unique_together\|UniqueConstraint" apps/attribution/models.py` and confirm the
  migration history includes a corresponding `migrations.AddConstraint` or `unique_together`
  table-level option.
- If the constraint is Django-only (e.g., defined in `Meta` but the migration was not regenerated),
  flag as **BUG**: the DB will not enforce uniqueness and concurrent requests can create two rows.

---

## Section 3 — Booking link vs profile visit conflict

### 3.1 Same provider, same client, both token types within 60 days — which wins?

- Scenario: client visits Provider A's profile page (creates a `ProfileAttributionToken` with
  `source=profile`, `status=pending`). Three days later the same client clicks Provider A's booking
  link (would create a second token with `source=booking_link`).
- Identify the creation logic in `utils.py` or the view that creates tokens. Does it:
  (a) always create a new row regardless of existing tokens,
  (b) skip creation if a `pending` token already exists for the same pair,
  (c) upgrade/replace the existing token to `booking_link` source (which carries a lower fee), or
  (d) create a second row?
- Fee tier priority: `booking_link` → 10%, `profile` → 12%, `standard` → 15%. If two confirmed
  tokens exist for the same pair, `get_telehealth_fee` must apply the lower fee (10%). Confirm
  whether the utility selects the most favourable override or only looks up a single row.
- If the model allows two confirmed tokens per pair (no unique constraint on `(provider, client,
  source)`), confirm whether two `ProviderClientFeeOverride` rows with different `fee_percent`
  values can coexist and which one `get_telehealth_fee` retrieves.
- If no tiebreaker logic exists, flag as **AMBIGUOUS** pending product decision on upgrade vs
  ignore semantics.

### 3.2 Token source stored on `ProviderClientFeeOverride`

- Confirm whether `ProviderClientFeeOverride` stores the `source` (profile vs booking_link) or only
  the resolved `fee_percent`. Storing only `fee_percent` loses audit trail; storing `source` enables
  reporting queries (attribution penetration by source type).
- If `source` is absent, flag as **GAP** for reporting (see Section 9).

---

## Section 4 — Fail-safe verification

### 4.1 `get_telehealth_fee()` must default to 15% on any failure

File: `utils.py`, function `get_telehealth_fee`.

- Identify every exception type caught in this function. The requirement is that any unexpected
  exception — `ProviderClientFeeOverride.DoesNotExist`, `ProfileAttributionToken.DoesNotExist`,
  `DatabaseError`, `OperationalError`, or any other — must result in a return value of `0.15`
  (15% standard fee), never `0.10` or `0.12`.
- Confirm the catch is not a bare `except:` that silently swallows all exceptions without logging.
  A bare `except` with no logging is a **BUG**: failures will be invisible in production.
- Confirm that a caught exception is logged at `ERROR` level (not `WARNING` or `DEBUG`) so that
  attribution lookup failures surface in monitoring.
- If the function returns `None` on failure rather than `0.15`, and the caller treats `None` as
  free (0%), flag as **BUG**.
- Confirm there is a dedicated test: `test_get_telehealth_fee_returns_standard_on_db_error` (or
  equivalent) that patches the ORM call to raise `OperationalError` and asserts the return is
  `Decimal('0.15')` or `0.15`. If absent, flag as **GAP**.

### 4.2 Fail-safe applies in both Stripe and PayPal flows

- In `apps/stripe_integration/views.py`, locate the call to `get_telehealth_fee`. Confirm it does
  not wrap the call in a try/except that overrides the utility's own safe default (e.g., catching
  the exception and using a hardcoded 0 or None instead of the utility's 0.15 return).
- Locate the PayPal equivalent view (search for `get_telehealth_fee` across the codebase). If it
  is absent, flag as **GAP**: one payment flow lacks the fee lookup entirely, meaning all PayPal
  sessions default to an undetermined rate.
- If the Stripe and PayPal flows use different fee-lookup code paths, flag as **BUG**: fee logic
  must be centralised in the utility so both flows stay in sync.

---

## Section 5 — In-person hard rule

### 5.1 In-person sessions must always use 5% — no attribution override applies

- Identify where session modality (telehealth vs in-person) is determined in the checkout flow.
  Check `apps/calendar_functionality/models.py` for the field name and values (e.g.,
  `session_type`, `modality`, `is_in_person`).
- In `utils.py`, confirm that `get_telehealth_fee` either:
  (a) accepts a modality parameter and returns `0.05` immediately when modality is in-person, or
  (b) is never called for in-person sessions (the checkout view gates the call).
- If `get_telehealth_fee` is called for in-person sessions and returns an attribution-based rate
  (10% or 12%), flag as **BUG**: attribution discount is being applied to in-person sessions,
  violating the hard business rule.
- If the gate is in the checkout view (not the utility), confirm there is a test that verifies
  the in-person path returns 5% even when a `ProviderClientFeeOverride` exists for that pair.
- If no test covers this path, flag as **GAP**.

### 5.2 `get_telehealth_fee` name implies telehealth-only — is in-person handled elsewhere?

- Confirm there is a separate utility or constant for in-person fee (5%) and that it is not
  derived from `get_telehealth_fee`. If the in-person fee is hardcoded inline in the checkout
  view rather than in a named constant or utility, flag as **GAP**: a future refactor could
  accidentally route in-person through the attribution lookup.

---

## Section 6 — First-session discount reset on cancellation

### 6.1 `first_session_discount_applied` is reset when a session is cancelled before it occurs

- Search `apps/attribution/` and `apps/calendar_functionality/` for any signal, receiver, or
  method that handles appointment/session cancellation and resets
  `ProfileAttributionToken.first_session_discount_applied` (or the equivalent field on
  `ProviderClientFeeOverride`) to `False`.
- If no such handler exists, flag as **BUG**: a client who books, receives the discount
  application flag, then cancels before the session occurs will be permanently marked as having
  used their first-session discount even though no session took place.

### 6.2 Discount applied flag — which model owns it?

- Confirm whether `first_session_discount_applied` lives on `ProfileAttributionToken`,
  `ProviderClientFeeOverride`, or a separate `FirstSessionDiscount` model.
- If it is on `ProfileAttributionToken`: when a token expires without a booking, the flag is lost
  along with the token. A new token created later (new visit) would have `first_session_discount_applied=False`,
  which is correct. Confirm this is the intended behaviour.
- If it is on `ProviderClientFeeOverride`: once the override is permanent, the flag persists
  correctly across sessions. Confirm the cancellation handler resets it on the override row,
  not on the (possibly expired or deleted) token.

### 6.3 Discount reset is per-provider-client pair, not global

- Confirm the cancellation handler resets the flag only for the specific (provider, client) pair
  of the cancelled session, not for all of the client's active discounts across providers.

### 6.4 Test coverage for cancellation reset

- Confirm a test exists: `test_first_session_discount_reset_on_cancellation` (or equivalent) that:
  1. Creates a booking, applies the discount flag.
  2. Cancels the session.
  3. Asserts `first_session_discount_applied` is `False` on the correct record.
- If absent, flag as **GAP**.

---

## Section 7 — Expiry enforcement

### 7.1 `is_expired` uses `timezone.now()`, not `datetime.now()`

File: `models.py`, `ProfileAttributionToken`.

- Locate the `is_expired` property or method (or wherever `expires_at` is compared to the current
  time). Confirm it uses `django.utils.timezone.now()`.
- If it uses `datetime.datetime.now()` (naive datetime), and `expires_at` is a timezone-aware
  `DateTimeField`, the comparison will raise `TypeError` at runtime in Python 3. Flag as **BUG**.
- If `USE_TZ = True` in settings (expected) and `datetime.now()` is used without `tz=utc`, flag
  as **BUG**: the comparison will use local server time, which drifts with DST changes and
  container timezone settings.
- Confirm there is a test that creates a token with `expires_at` one second in the past and
  asserts `is_expired` returns `True`. If absent, flag as **GAP**.

### 7.2 Scheduler or signal that marks tokens `expired`

- Identify whether there is an APScheduler job, Celery task, Django management command, or signal
  that transitions `pending` tokens to `expired` after 60 days.
- If expiry is checked lazily (only at lookup time via `is_expired`), confirm that expired tokens
  are not silently treated as confirmed by any code path that forgets to call `is_expired` first.
- If a background job exists, confirm it uses `filter(expires_at__lt=timezone.now())` (not `lte`
  with a naive datetime) and that it does not accidentally expire `confirmed` tokens.

---

## Section 8 — INELIGIBLE status

### 8.1 What triggers `status=ineligible`?

File: `models.py`, `ProfileAttributionToken`, `status` field choices.

- Confirm that `ineligible` is listed as a valid choice in the `status` field.
- Search the entire `apps/attribution/` directory for any code path that sets
  `status='ineligible'` (or `STATUS_INELIGIBLE` or equivalent constant). If no such path exists,
  flag as **GAP**: the status is defined but never set, making it dead code that could mislead
  future developers.
- Document the intended trigger: e.g., client was referred by a different channel that takes
  precedence, fraud detection, provider opted out of attribution programme. If the trigger is
  undefined, flag as **AMBIGUOUS** pending product decision.

### 8.2 Fraud guardrail — is there one?

- Identify any rate-limiting, IP-deduplication, or session-deduplication logic that prevents a
  malicious actor from generating thousands of attribution tokens to inflate click metrics or
  game the 60-day window.
- If no guardrail exists, flag as **GAP**: the attribution system can be gamed by repeatedly
  visiting a provider profile. Document as a security/integrity risk.
- If `ineligible` is intended as the fraud outcome, confirm the fraud detection logic that would
  set it.

---

## Section 9 — Data completeness for reporting

### 9.1 "Revenue by fee tier" query

The BRD requires a "revenue by fee tier" report (standard 15%, profile 12%, booking link 10%,
in-person 5%).

- Confirm `ProviderClientFeeOverride` stores `fee_percent` as a numeric field (not a tier label).
  If stored as a numeric, revenue-by-tier grouping requires a `CASE` expression or annotation.
  This is acceptable but should be documented.
- Confirm whether appointment/session records store the `fee_percent` that was applied at the time
  of payment, or whether they reference the current `ProviderClientFeeOverride` row (which is
  permanent and never changes, so the current value equals the historical value — this is safe).
- If fee_percent is not stored on the payment record and the `ProviderClientFeeOverride` row can
  be deleted (e.g., via cascade on provider deletion), historical revenue-by-tier queries will
  be inaccurate. Flag as **GAP** if this deletion path exists.

### 9.2 "Attribution penetration rate" query

The BRD requires an "attribution penetration rate" metric: percentage of sessions that benefited
from attribution (i.e., used a 10% or 12% fee).

- Confirm the data model supports: `SELECT COUNT(*) FROM provider_client_fee_override WHERE
  fee_percent < 0.15` divided by total sessions.
- If `ProviderClientFeeOverride` can be created without a linked session (e.g., attribution
  confirmed but client never books), confirm the query filters appropriately so confirmed-but-
  never-booked overrides are excluded from the denominator of "sessions with attribution".
- If the source (profile vs booking_link) is not stored on `ProviderClientFeeOverride` (see 3.2),
  the penetration rate cannot be broken down by attribution channel. Flag as **GAP**.

### 9.3 Attribution confirmation timestamp

- Confirm `ProviderClientFeeOverride` has a `created_at` timestamp (likely inherited from
  `BaseModel`). This is required for time-series attribution reports (e.g., weekly new attributions).
- If `created_at` uses `auto_now_add=True`, confirm the Django `loaddata` / ORM seed path does not
  break it (known issue: `raw=True` in `loaddata` bypasses `auto_now_add`). If seed data is needed
  for this model, confirm the seed uses an ORM management command, not a fixture JSON.

---

## Section 10 — Missing endpoints (RGDEV-182 scope boundary)

### 10.1 RGDEV-182 creates no public endpoints — urls.py should be wired but empty

File: `apps/attribution/urls.py`.

- Confirm that `urls.py` exists and defines `urlpatterns = []` (empty list) or a minimal
  placeholder. This is the correct pattern when a Django app's models and utilities are created in
  one ticket and its endpoints are added in subsequent tickets (RGDEV-183+).
- If `urls.py` does not exist at all, flag as **GAP**: the app will not be importable from the
  root URL config, and any future ticket adding endpoints will require a separate wiring step
  (risk of being forgotten).
- If `urls.py` contains non-empty `urlpatterns` with view references, confirm those views exist
  and are tested. Unimplemented URL stubs with missing views will cause an `ImportError` on
  server startup.
- Confirm that `apps/attribution` is listed in `INSTALLED_APPS` in `lumy_global/settings.py`.
  If absent, migrations will not run and the app's models will not be created in the database.

### 10.2 No endpoint should expose `ProviderClientFeeOverride` directly to clients

- Even if endpoints are added later, confirm there is no view in `apps/attribution/views.py`
  (if the file exists at this stage) that would allow a client to query their own fee override.
  A client knowing their attributed fee percentage before checkout creates a fee-gaming opportunity
  (e.g., deliberately triggering attribution to secure a lower rate on a high-value session).
- If `views.py` does not exist yet, note as **OUT OF SCOPE** for RGDEV-182 but flag as a risk
  for RGDEV-183+ design review.

---

## Section 11 — Attribution permanence invariant

### 11.1 `ProviderClientFeeOverride` must be immutable after creation

- Confirm there is no update path (view, signal, management command, or admin action) that changes
  `fee_percent` on an existing `ProviderClientFeeOverride` row after it has been created.
- If the Django admin is enabled for this model, confirm that `fee_percent` is read-only in the
  admin (`readonly_fields` or `has_change_permission = False`). A support agent accidentally
  changing a permanent override would silently alter the provider's effective fee for that client.
- If the model has no immutability guard, flag as **AMBIGUOUS**: document that permanence is a
  business rule enforced only by convention, and propose adding a `save()` override or a DB
  trigger that raises an error on update of `fee_percent` after creation.

### 11.2 Attribution permanence survives provider profile updates

- Confirm that if a provider changes their fee tier preference (e.g., opts out of the attribution
  programme), existing `ProviderClientFeeOverride` rows are NOT updated or deleted. New pairs
  after the opt-out date use the standard rate; existing attributed pairs retain the reduced rate.
- If a signal on `CareProvider.save()` touches `ProviderClientFeeOverride`, flag as **BUG**.

---

## Deliverables expected from the auditor

1. A findings table with one row per audit item: ID, status (PASS/BUG/GAP/AMBIGUOUS/OUT OF SCOPE),
   file + line citation, and one-line description.
2. A prioritised fix list: BUGs first (race conditions, fail-open, wrong datetime), then
   high-impact GAPs (cancellation reset, in-person hard rule test, fraud guardrail), then
   AMBIGUOUS items requiring a product decision (ineligible trigger, booking_link vs profile
   conflict resolution, admin immutability).
3. For each BUG or high-impact GAP, a proposed minimal fix (code snippet or migration) and the
   test case name and assertions that would verify it.
4. A "product decision required" section listing items that cannot be resolved by reading the code
   alone and require explicit scoping from product (ineligible status trigger, conflict resolution
   policy for dual-source attribution, admin write access policy on permanent overrides).
5. A one-paragraph summary of whether the RGDEV-182 data model is structurally correct for the
   described business rules, and the single highest-priority change (if any) before RGDEV-183
   endpoints are built on top of it.
