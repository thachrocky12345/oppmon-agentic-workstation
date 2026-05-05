# Audit Prompt: Attribution Feature (RGDEV-182) — Data Model, Migration, Utility, Settings, and Payment-Path Review

**Scope**: `apps/attribution/` in `Lumy-Backend/`; new fields on `apps/care_provider/`; new settings in `lumy_global/settings.py`
**Auditor level**: Principal engineer
**Execution mode**: Read all listed files, check every item, report findings as PASS / FAIL / WARN with exact evidence (file + line number). Do not infer — read the source.

---

## Files to Read Before Starting

Read all of these before answering any check:

1. `apps/attribution/models.py`
2. `apps/attribution/migrations/0001_initial.py`
3. `apps/attribution/utils.py`
4. `apps/attribution/apps.py`
5. `apps/attribution/admin.py`
6. `apps/attribution/urls.py` (if it exists)
7. `apps/attribution/tests.py`
8. `apps/authentication/models.py` (lines 1–57) — for `BaseModel` definition
9. `apps/care_provider/models.py` (lines 885–1000) — for `CareProvider` and new attribution fields
10. `apps/care_provider/migrations/0050_alter_countrycode_options_and_more.py` — to confirm last migration leaf before attribution
11. `apps/care_provider/migrations/` — list all files, identify the latest leaf migration (the one that adds `attribution_discount_percent` and `attribution_notifications_enabled`)
12. `apps/client/models.py` — for `Client` model definition
13. `apps/client/migrations/0004_client_favorite_pages.py` — latest client migration leaf
14. `lumy_global/settings.py` — for `INSTALLED_APPS`, `ATTRIBUTED_TELEHEALTH_FEE_PERCENT`, `ATTRIBUTION_WINDOW_DAYS`
15. `lumy_global/urls.py` — for attribution URL include (if any)
16. `requirements.txt` — no new deps expected; verify nothing was silently added

---

## Baseline Facts (Pre-Verified)

These were confirmed by reading source before writing this prompt. Use them as ground truth when comparing what the implementation actually produces.

**`BaseModel`** (`apps/authentication/models.py` lines 45–57):
- `created_at = DateTimeField(auto_now_add=True, db_index=True)`
- `modified_at = DateTimeField(auto_now=True, db_index=True)`
- `is_active = BooleanField(default=True)`
- `class Meta: abstract = True`

**`CareProvider`** (`apps/care_provider/models.py` line 885): inherits `BaseModel`; has `user = OneToOneField(User, ...)`.

**`Client`** (`apps/client/models.py` line 7): inherits `BaseModel`; has `user = OneToOneField(User, ...)`.

**Latest care_provider migration leaf** (as of audit baseline): `0050_alter_countrycode_options_and_more.py`
**Latest client migration leaf** (as of audit baseline): `0004_client_favorite_pages.py`

---

## Section 1: Data Model Correctness

### 1.1 BaseModel Inheritance

- VERIFY `ProfileAttributionToken` inherits `BaseModel` (not `models.Model` directly).
- VERIFY `ProviderClientFeeOverride` inherits `BaseModel` (not `models.Model` directly).
- CONFIRM both models therefore carry `created_at`, `modified_at`, `is_active` without re-declaring them.
- WARN if either model re-declares `created_at` or `is_active` (duplicate fields that shadow BaseModel).

### 1.2 ProfileAttributionToken — Field-by-Field Audit

Read `apps/attribution/models.py` fully. For each field below, confirm presence, type, nullability, and constraints match the specification.

| Field | Expected type | Expected constraints |
|---|---|---|
| `provider` | `ForeignKey(CareProvider, on_delete=CASCADE)` | `related_name` set; `db_index=True` implied by FK |
| `client` | `ForeignKey(Client, on_delete=CASCADE)` | `related_name` set; `db_index=True` implied by FK |
| `source` | `CharField` with choices | choices must be exactly `profile` and `booking_link`; `max_length` must accommodate both values |
| `status` | `CharField` with choices | choices must be exactly `pending`, `confirmed`, `expired`, `ineligible`; `max_length` sufficient |
| `expires_at` | `DateTimeField` | `null=False` — this field must always be set at creation; FAIL if `null=True` |
| `first_booking_at` | `DateTimeField` | `null=True, blank=True` — optional, set when first booking occurs |
| `first_session_discount_applied` | `BooleanField` | `default=False`; FAIL if `default=True` (would incorrectly suppress discounts on new tokens) |
| `referer` | `CharField` or `URLField` | `null=True, blank=True`; max_length ≥ 2000 if URLField (URL spec); or `TextField` — WARN if `max_length` is shorter than 500 |

**Unique constraint check**:
- VERIFY there is a unique constraint on `(provider, client)` — either `unique_together = [("provider", "client")]` in `Meta` OR a `UniqueConstraint` in `Meta.constraints`.
- WARN if `unique_together` is used instead of `UniqueConstraint`: Django 4.2 recommends `UniqueConstraint` for forward compatibility and because `unique_together` cannot carry `condition` or `deferrable` options.
- FAIL if no uniqueness constraint exists — two concurrent attribution tokens for the same (provider, client) would corrupt the attribution window logic.

**Index check**:
- VERIFY a composite index on `(provider, status)` or `(provider, client, status)` exists — the primary query pattern during checkout is "find confirmed, non-expired token for this provider-client pair".
- WARN if only individual FK indexes exist with no composite covering index for the checkout path.

**Properties check**:
- VERIFY the model defines `is_expired` property (returns `True` if `expires_at < now()`).
- VERIFY the model defines `is_active_window` or equivalent property (returns `True` if status is `pending` or `confirmed` AND not expired).
- FAIL if expiry logic is only in utility functions and not on the model — business rules that are trivially expressible as model properties should be there.

### 1.3 ProviderClientFeeOverride — Field-by-Field Audit

| Field | Expected type | Expected constraints |
|---|---|---|
| `provider` | `ForeignKey(CareProvider, on_delete=CASCADE)` | `related_name` set |
| `client` | `ForeignKey(Client, on_delete=CASCADE)` | `related_name` set |
| `fee_percent` | `DecimalField` | `max_digits` and `decimal_places` must be set — see 1.3a |
| `source` | `CharField` with choices | same source choices as `ProfileAttributionToken` (`profile`, `booking_link`) |
| `original_fee_percent` | `DecimalField` | same precision constraints as `fee_percent` — see 1.3a |

**1.3a — Decimal precision for fee_percent and original_fee_percent**:
- The platform fee is an integer percentage (5, 10, or 15 per `attribution_discount_percent` choices; baseline telehealth fee from `ATTRIBUTED_TELEHEALTH_FEE_PERCENT`).
- WARN if `DecimalField(max_digits=5, decimal_places=2)` is used — this is over-engineered for integer percentages and introduces floating-point surface area unnecessarily.
- WARN if `IntegerField` is used — this is consistent with the `attribution_discount_percent` field pattern but means fee_percent cannot represent fractional rates if the business model ever changes. Document the tradeoff.
- FAIL if `FloatField` is used — never use `FloatField` for money/fee calculations.
- VERIFY `fee_percent` has a validator or `choices` preventing values outside valid platform fee range (e.g., 0–100).

**Unique constraint check**:
- VERIFY `unique_together = [("provider", "client")]` OR `UniqueConstraint(fields=["provider", "client"])` exists on `ProviderClientFeeOverride`.
- FAIL if absent — multiple override rows per (provider, client) would make the checkout query ambiguous.
- WARN if `unique_together` is used instead of `UniqueConstraint` (same reasoning as 1.2).

**Permanent record semantics**:
- This model is intentionally permanent (no expiry, no `status` field). VERIFY there is no `status` or `expires_at` field — presence would suggest a model design confusion with `ProfileAttributionToken`.
- VERIFY that `is_active` from `BaseModel` is NOT used to soft-delete overrides without a corresponding audit event. Soft-deletion via `is_active=False` silently stops applying the discount — this is a financial correctness risk.

### 1.4 CareProvider New Fields

Read `apps/care_provider/models.py` in full for the new fields.

| Field | Expected type | Expected constraints |
|---|---|---|
| `attribution_discount_percent` | `IntegerField` | `choices=[(5, "5%"), (10, "10%"), (15, "15%")]`; `null=True, blank=True` (not all providers participate) |
| `attribution_notifications_enabled` | `BooleanField` | `default=True` (opt-out model) OR `default=False` (opt-in) — WARN if this is `default=False` without a documented decision; providers should receive notifications unless they opt out |

- VERIFY neither field has `null=True` on `attribution_notifications_enabled` — `BooleanField` should never be `null=True` (use `NullBooleanField` only if tri-state is genuinely required, which it is not here).
- VERIFY `attribution_discount_percent` is `null=True` (not enrolled) vs `0` (enrolled but zero discount) — `null` should mean "not participating", not `0`.

---

## Section 2: Migration Correctness

### 2.1 Attribution App Initial Migration

Read `apps/attribution/migrations/0001_initial.py`.

**Dependency chain**:
- VERIFY the migration declares `dependencies = [("care_provider", "0050_..."), ("client", "0004_...")]` (or whichever are the actual latest leaves).
- FAIL if the care_provider dependency points to any migration before `0050` — the `CareProvider` FK would reference a model that may not exist in that migration state.
- FAIL if the client dependency points to any migration before `0004` — same risk.
- VERIFY no dependency on `apps.authentication` is listed — `BaseModel` is abstract and does not generate a migration dependency.

**Migration operations — ProfileAttributionToken**:
- VERIFY `CreateModel` for `ProfileAttributionToken` includes every field defined in the model.
- VERIFY the `unique_together` or `UniqueConstraint` on `(provider, client)` appears in the migration operations, not just in the model's `Meta`.
- VERIFY any explicit `db_index=True` composite indexes appear as `AddIndex` operations (or inline in `CreateModel` via `Meta.indexes`).
- FAIL if indexes defined in `Meta.indexes` on the model are absent from the migration.

**Migration operations — ProviderClientFeeOverride**:
- Same checks as above for this model.
- VERIFY the `unique_together` or `UniqueConstraint` on `(provider, client)` is emitted.

### 2.2 CareProvider Migration for New Fields

- Identify which care_provider migration adds `attribution_discount_percent` and `attribution_notifications_enabled` to `CareProvider`.
- VERIFY this migration depends on the previous care_provider leaf (the one before it in sequence) — not a branch-off from an old migration.
- VERIFY `AddField` for `attribution_discount_percent` uses `null=True` so existing rows are not broken.
- VERIFY `AddField` for `attribution_notifications_enabled` specifies `default=` — a non-nullable `BooleanField` addition without a default will fail on a live database with existing rows.
- FAIL if `attribution_notifications_enabled` is added without `default` and without `null=True`.

### 2.3 Migration Squash / Leaf Integrity

- Run: `ls apps/attribution/migrations/ | sort` to confirm only `0001_initial.py` (and `__init__.py`) exist — no accidental duplicate migrations.
- Run: `ls apps/care_provider/migrations/ | sort | tail -3` to confirm the new CareProvider field migration is the latest leaf, not a branch.
- WARN if two migrations both depend on the same parent (a fork), as this will require manual squashing before deployment.

---

## Section 3: Utility Function Safety

Read `apps/attribution/utils.py` fully before answering.

### 3.1 get_telehealth_fee() — Fail-Safe Guarantee

This function returns the telehealth fee percentage for a given (provider, client) pair. It must NEVER return a lower fee than the standard platform fee on an error condition.

**Check sequence**:
1. VERIFY the function wraps its logic in a `try/except` block.
2. VERIFY the `except` block returns `settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT` (the standard fee), not `0` or any other value.
3. FAIL if the `except` block returns `0` — this would make all sessions free on any database error.
4. FAIL if the `except` block raises the exception and allows it to propagate — an unhandled exception in the checkout fee calculation is a critical path failure.
5. VERIFY the function does NOT return a value lower than `settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT` even when a valid `ProviderClientFeeOverride` is found — the override should only reduce the fee to the _provider's attributed rate_, not below any floor.
6. WARN if there is no logging in the `except` block — silent fail-safe is hard to debug in production.

**Override lookup**:
- VERIFY the query uses `.filter(provider=provider, client=client, is_active=True).first()` or equivalent.
- WARN if `.get()` is used instead of `.filter().first()` — `.get()` raises `MultipleObjectsReturned` if the unique constraint was somehow violated at the DB level, which would propagate as an uncaught exception.

### 3.2 get_checkout_discount() — First-Session Guard

This function determines whether a discount should be applied at checkout. It must not apply a discount twice for the same attribution token.

**Check sequence**:
1. VERIFY the function checks `token.first_session_discount_applied` before applying a discount.
2. VERIFY the function returns `0` (no discount) if `first_session_discount_applied is True`.
3. FAIL if the function applies a discount regardless of `first_session_discount_applied`.
4. VERIFY the function atomically sets `first_session_discount_applied = True` and `first_booking_at = now()` when applying a discount — these two field updates must happen in the same `save()` or `update()` call.
5. WARN if `token.save()` is called without `update_fields=["first_session_discount_applied", "first_booking_at"]` — a full `save()` on a BaseModel descendant will update `modified_at` (acceptable) but risks race conditions if other fields are dirty in memory.
6. VERIFY the function handles the case where `token` is `None` (no active attribution token for the pair) — must return `0` gracefully, not raise `AttributeError`.
7. VERIFY the function checks `token.status == "confirmed"` before applying the discount — a `pending` token should not trigger a discount.
8. WARN if there is no `select_for_update()` wrapping the token fetch in `get_checkout_discount()` — without a row lock, two concurrent checkout requests for the same client could both apply the discount (TOCTOU race).

### 3.3 Attribution Window Expiry Logic

- VERIFY there is a mechanism (management command, celery task, APScheduler job, or signal) that transitions `ProfileAttributionToken.status` from `pending`/`confirmed` to `expired` when `expires_at` has passed.
- WARN if no such mechanism exists and expiry is only checked inline during checkout — stale `pending` tokens will accumulate and the status field will be misleading in the admin.
- VERIFY `ATTRIBUTION_WINDOW_DAYS` is used when computing `expires_at` at token creation (`expires_at = now() + timedelta(days=settings.ATTRIBUTION_WINDOW_DAYS)`).

---

## Section 4: Settings Correctness

Read `lumy_global/settings.py` for the new attribution settings.

### 4.1 ATTRIBUTED_TELEHEALTH_FEE_PERCENT

- VERIFY the setting exists.
- VERIFY its Python type: it should be `int` (e.g., `20`) or `Decimal` — NEVER a plain string (e.g., `"20"`) because it will be used in arithmetic comparisons.
- FAIL if it is a string — `"20" > 15` evaluates to `True` in Python 3 but `"20" - 5` raises `TypeError`, which is an inconsistent and dangerous failure mode.
- VERIFY the value is consistent with the existing business model: the standard telehealth platform fee is a known percentage (cross-reference `ContextFiles2/CompanyContext/company-identity.md` or `ContextFiles2/CompanyContext/business-model-and-strategy.md`). WARN if the value does not match documented platform fee.

### 4.2 ATTRIBUTION_WINDOW_DAYS

- VERIFY the setting exists.
- VERIFY its Python type is `int` (e.g., `60`) — not a string.
- FAIL if it is a string — `timedelta(days="60")` raises `TypeError`.
- VERIFY the value is `60` (per spec). WARN if it is any other value without a comment explaining the deviation.

### 4.3 Settings Type Safety Pattern

- VERIFY both settings use `env.int(...)` or `int(env(...))` if read from environment variables via `django-environ` — not raw `env(...)` which returns strings by default.
- Example correct pattern: `ATTRIBUTION_WINDOW_DAYS = env.int("ATTRIBUTION_WINDOW_DAYS", default=60)`
- FAIL if the pattern is `ATTRIBUTION_WINDOW_DAYS = env("ATTRIBUTION_WINDOW_DAYS", default="60")` — the default would be a string.

---

## Section 5: INSTALLED_APPS and URL Wiring

### 5.1 INSTALLED_APPS

- Read `lumy_global/settings.py`, `INSTALLED_APPS` list.
- VERIFY `"apps.attribution"` is present.
- FAIL if absent — the app's models will not be created by `migrate`.
- VERIFY the entry follows the existing naming pattern (other apps use `"apps.<appname>"`).

### 5.2 AppConfig

- Read `apps/attribution/apps.py`.
- VERIFY `default_auto_field` is set — the project standard is `BigAutoField` or `UUIDField`; check what other apps use. WARN if attribution uses a different default without justification.
- VERIFY `name = "apps.attribution"` matches the `INSTALLED_APPS` entry exactly.

### 5.3 URL Wiring

- Attribution tokens are created server-side (not via a user-facing API endpoint) in the initial implementation. VERIFY whether any URLs are exposed.
- If `apps/attribution/urls.py` exists and registers routes:
  - VERIFY it is included in `lumy_global/urls.py`.
  - VERIFY all endpoints require authentication (`IsAuthenticated` or equivalent).
  - WARN if any attribution endpoint is unauthenticated — attribution tokens contain provider-client relationship data.
- If no URLs exist, PASS — this is acceptable for an internal-only model.

---

## Section 6: Admin Configuration

Read `apps/attribution/admin.py`.

### 6.1 ProviderClientFeeOverride Admin

This model represents a permanent financial record. Its fee fields must not be editable through the admin after creation.

- VERIFY `fee_percent` is in `readonly_fields` on the `ProviderClientFeeOverride` admin class.
- VERIFY `source` is in `readonly_fields`.
- VERIFY `original_fee_percent` is in `readonly_fields`.
- FAIL if any of these three fields are editable — a staff user changing `fee_percent` post-creation would alter a financial record without audit trail.
- VERIFY `provider` and `client` are also `readonly_fields` — reassigning an override to a different provider or client makes no semantic sense and should be blocked.
- WARN if `has_delete_permission` is not overridden to return `False` — fee overrides should be deactivated via `is_active`, not hard-deleted.

### 6.2 ProfileAttributionToken Admin

- VERIFY `ProfileAttributionToken` is registered in admin.
- VERIFY `first_session_discount_applied` is in `readonly_fields` — this flag must only be set by the application, never manually.
- VERIFY `expires_at` is in `readonly_fields` — modifying the expiry window manually is a financial risk.
- WARN if `status` is editable without a confirmation step — manually setting `status = confirmed` bypasses the attribution flow.

### 6.3 list_display Usability

- VERIFY `list_display` on `ProfileAttributionToken` includes at minimum: `provider`, `client`, `status`, `source`, `expires_at`, `first_session_discount_applied`.
- VERIFY `list_filter` includes `status` and `source` — these are the primary dimensions for operational queries.
- VERIFY `search_fields` includes `provider__user__email` and `client__user__email` — support lookups by user email.

---

## Section 7: Payment Critical Path — Query Performance

### 7.1 Checkout Query for ProviderClientFeeOverride

The checkout flow calls `get_telehealth_fee(provider, client)`, which queries `ProviderClientFeeOverride` for an active override.

- VERIFY a database index exists on `(provider, client)` — either implied by `unique_together`/`UniqueConstraint` (which creates a unique index) or an explicit `Meta.indexes` entry.
- A `UniqueConstraint(fields=["provider", "client"])` creates a unique B-tree index on `(provider_id, client_id)` in PostgreSQL, which fully covers the lookup `WHERE provider_id = X AND client_id = Y AND is_active = TRUE`. PASS if this constraint exists.
- WARN if only individual indexes on `provider` and `client` separately exist — PostgreSQL may use a bitmap index scan, but a composite index is strongly preferred for this join condition.
- VERIFY the checkout query filters on `is_active=True`. If it does not, inactive overrides will be returned, incorrectly applying a discount for deactivated relationships.

### 7.2 Checkout Query for ProfileAttributionToken

The checkout flow calls `get_checkout_discount(provider, client)`, which queries `ProfileAttributionToken`.

- VERIFY a composite index exists on `(provider, client)` — same reasoning as 7.1.
- VERIFY the query also filters on `status` (should be `confirmed`). If the query filters `WHERE provider=X AND client=Y`, the unique constraint index covers it. If the query is `WHERE provider=X AND status=confirmed`, a different composite index `(provider, status)` would be needed.
- WARN if neither `(provider, client)` NOR `(provider, status)` has a composite index — sequential scans on this table at checkout time are unacceptable.
- VERIFY the `expires_at` filter is applied in the query (`expires_at__gt=now()`) rather than relying on the `is_expired` property post-fetch — database-level filtering is required for correctness under load.

### 7.3 Transaction Isolation

- VERIFY that the code path that reads a `ProfileAttributionToken` and then sets `first_session_discount_applied = True` is wrapped in `transaction.atomic()`.
- FAIL if no transaction wrapping exists — a concurrent checkout for the same client could read the token before the flag is set, apply the discount twice, and only one write would win (non-deterministic).
- VERIFY `select_for_update()` is used on the token fetch within the atomic block (see 3.2 item 8).

---

## Section 8: Test Coverage

Read `apps/attribution/tests.py` fully.

### 8.1 Fail-Safe Fallback Test

- VERIFY a test exists that mocks a database exception during `get_telehealth_fee()` and asserts the return value equals `settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT`.
- FAIL if no such test exists — the fail-safe path is untested and could silently return `0` on a regression.

### 8.2 Discount Flag Prevention Test

- VERIFY a test exists that:
  1. Creates a `ProfileAttributionToken` with `first_session_discount_applied=True`.
  2. Calls `get_checkout_discount(provider, client)`.
  3. Asserts the return value is `0` (no discount applied).
- FAIL if no such test exists.

### 8.3 Model Property Tests

- VERIFY tests for `is_expired` property:
  - Token with `expires_at` in the past → `is_expired` returns `True`.
  - Token with `expires_at` in the future → `is_expired` returns `False`.
- VERIFY tests for the `is_active_window` (or equivalent) property:
  - Status `pending`, not expired → active.
  - Status `confirmed`, not expired → active.
  - Status `expired` → not active (regardless of `expires_at`).
  - Status `ineligible` → not active.
- FAIL if these properties have no tests.

### 8.4 Unique Constraint Test

- VERIFY a test exists that attempts to create two `ProfileAttributionToken` rows with the same `(provider, client)` and asserts `IntegrityError` is raised.
- VERIFY a test exists that attempts to create two `ProviderClientFeeOverride` rows with the same `(provider, client)` and asserts `IntegrityError` is raised.
- FAIL if these tests are absent — the unique constraint could be missing from the migration while present in the model's Meta, and only a DB-level test will catch that.

### 8.5 Attribution Window Expiry Test

- VERIFY a test exists that creates a token with `expires_at = now() - timedelta(days=1)` and asserts:
  - The token's `is_expired` returns `True`.
  - `get_checkout_discount()` returns `0` for this expired token.
- FAIL if no such test exists.

### 8.6 Settings Type Tests

- WARN if no test verifies `isinstance(settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT, (int, Decimal))` — type errors from misconfigured settings only appear at runtime during checkout.
- WARN if no test verifies `isinstance(settings.ATTRIBUTION_WINDOW_DAYS, int)`.

### 8.7 Race Condition / Concurrency Test (Advisory)

- NOTE: A true concurrency test for the `select_for_update()` path requires a multi-threaded or multi-process test harness and is not expected in unit tests.
- VERIFY at minimum that the `get_checkout_discount()` implementation uses `select_for_update()` by reading the source (Section 3.2 item 8). Document as PASS/FAIL based on code inspection, not test execution.

---

## Reporting Format

For every check, output one of:

- **PASS** — evidence confirms the requirement is met. Include file + line number.
- **FAIL** — requirement is not met. State exact finding, file, line. This must be fixed before merge.
- **WARN** — requirement is met but a better pattern exists, or the check could not be completed. State the tradeoff.
- **N/A** — not applicable (e.g., no URLs registered, test file does not exist yet).

Group findings by section number. At the end, produce a summary table:

| Section | PASS | FAIL | WARN | N/A |
|---|---|---|---|---|
| 1. Data Model | | | | |
| 2. Migrations | | | | |
| 3. Utility Functions | | | | |
| 4. Settings | | | | |
| 5. INSTALLED_APPS / URLs | | | | |
| 6. Admin | | | | |
| 7. Payment Critical Path | | | | |
| 8. Tests | | | | |
| **Total** | | | | |

Any FAIL in Section 3 (Utility Functions) or Section 7 (Payment Critical Path) is a **merge blocker** — attribution fee logic is in the checkout hot path and a regression directly impacts revenue.
