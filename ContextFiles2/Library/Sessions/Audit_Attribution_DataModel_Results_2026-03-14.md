# Audit Results: Attribution Data Model (RGDEV-182)

**Date**: 2026-03-14
**Auditor**: Principal Engineer (automated)
**Branch**: `RGDEV-182/attribution-data-model`
**Workspace**: `C:\Projects\ReallyGlobal\Lumy-Backend\apps\attribution\`

---

## Section 1: Data Model Correctness

### 1.1 BaseModel Inheritance

- **PASS** — `ProfileAttributionToken` inherits `BaseModel` (models.py:23). Confirmed via `from apps.authentication.models import BaseModel` (line 6).
- **PASS** — `ProviderClientFeeOverride` inherits `BaseModel` (models.py:69).
- **PASS** — Neither model re-declares `created_at`, `modified_at`, or `is_active` as fields.
- **FAIL** — `ProfileAttributionToken` defines `is_active` as a `@property` (models.py:65-66) which **shadows** `BaseModel.is_active` (a `BooleanField`). This means:
  - The database column `is_active` still exists but is now inaccessible via `instance.is_active` on `ProfileAttributionToken`.
  - `token.is_active` returns the property result (status-based logic), NOT the database field value.
  - Django admin, serializers, and ORM filters referencing `is_active` will behave inconsistently: `ProfileAttributionToken.objects.filter(is_active=True)` queries the DB column, but `token.is_active` evaluates the property.
  - This is a **semantic collision** and a merge blocker. The property should be renamed to `is_active_window` or `is_within_window`.

### 1.2 ProfileAttributionToken -- Field-by-Field Audit

| Field | Verdict | Evidence |
|---|---|---|
| `provider` | **PASS** | FK to CareProvider, CASCADE, `related_name='attribution_tokens'`, `db_index=True` (models.py:24-29) |
| `client` | **PASS** | FK to Client, CASCADE, `related_name='attribution_tokens'`, `db_index=True` (models.py:30-35) |
| `source` | **PASS** | CharField, max_length=20, choices=`AttributionSource.choices` (`profile`, `booking_link`) (models.py:36-39) |
| `status` | **PASS** | CharField, max_length=20, choices=`AttributionStatus.choices` (`pending`, `confirmed`, `expired`, `ineligible`) (models.py:41-44) |
| `expires_at` | **PASS** | DateTimeField, no `null=True` (models.py:46) |
| `first_booking_at` | **PASS** | DateTimeField, `null=True, blank=True` (models.py:47) |
| `first_session_discount_applied` | **PASS** | BooleanField, `default=False` (models.py:48) |
| `referer` | **PASS** | URLField, `max_length=2000`, `null=True, blank=True` (models.py:49) |

**Unique constraint check**:
- **FAIL** — No `unique_together` or `UniqueConstraint` on `(provider, client)` for `ProfileAttributionToken`. The model's `Meta` class (models.py:51-55) only defines `indexes`, not uniqueness. Two tokens for the same (provider, client) pair can be created, which corrupts attribution window logic.

**Index check**:
- **PASS** — Composite index on `(provider, client, status)` exists (models.py:53). This covers the checkout query pattern.
- **PASS** — Additional index on `expires_at` (models.py:54) supports expiry batch queries.

**Properties check**:
- **PASS** — `is_expired` property exists (models.py:60-62): returns `True` when `timezone.now() >= self.expires_at`.
- **FAIL** — The `is_active` property (models.py:64-66) only considers `PENDING` status as active. A `CONFIRMED` token is treated as inactive by this property, but per the audit spec, both `pending` and `confirmed` should be considered "active window". Additionally, this property shadows `BaseModel.is_active` (see 1.1).

### 1.3 ProviderClientFeeOverride -- Field-by-Field Audit

| Field | Verdict | Evidence |
|---|---|---|
| `provider` | **PASS** | FK to CareProvider, CASCADE, `related_name='fee_overrides'` (models.py:70-75) |
| `client` | **PASS** | FK to Client, CASCADE, `related_name='fee_overrides'` (models.py:76-80) |
| `fee_percent` | **WARN** | DecimalField(max_digits=5, decimal_places=4) (models.py:82-84). This stores fees as decimal fractions (e.g., 0.1200 = 12%). The 4 decimal places are reasonable for fractional representation but note `decimal_places=4` with `max_digits=5` means max value is `9.9999` which is fine for a percentage-as-fraction. |
| `source` | **PASS** | CharField, max_length=20, choices=`AttributionSource.choices` (models.py:87-90) |
| `original_fee_percent` | **PASS** | DecimalField, same precision, `default=Decimal('0.1500')` (models.py:92-96) |

- **WARN** — No validator on `fee_percent` to prevent values outside valid range. A staff error or code bug could set `fee_percent=5.0000` (500%) or negative values.
- **FAIL** — `FloatField` is NOT used (good), but no `MinValueValidator`/`MaxValueValidator` exists on `fee_percent`. Not a FAIL per spec criteria (FloatField is what would be a FAIL), changing to **WARN**.

**Unique constraint check**:
- **PASS** — `unique_together = [('provider', 'client')]` exists (models.py:99).
- **WARN** — `unique_together` is used instead of `UniqueConstraint`. Django 4.2 recommends `UniqueConstraint` for forward compatibility.

**Permanent record semantics**:
- **PASS** — No `status` or `expires_at` field on `ProviderClientFeeOverride`. Model is correctly permanent.
- **WARN** — `is_active` from `BaseModel` is inherited and could be used for soft-deletion without audit trail. No guard against this exists.

### 1.4 CareProvider New Fields

- **PASS** — `attribution_discount_percent = IntegerField(null=True, blank=True, choices=[(5,'5%'),(10,'10%'),(15,'15%')])` (care_provider/models.py:1061-1064).
- **PASS** — `attribution_notifications_enabled = BooleanField(default=True)` (care_provider/models.py:1066-1068). Opt-out model is correct.
- **PASS** — `attribution_notifications_enabled` is not `null=True`.
- **PASS** — `attribution_discount_percent` uses `null=True` to mean "not participating".

---

## Section 2: Migration Correctness

### 2.1 Attribution App Initial Migration

- **PASS** — Dependencies: `('client', '0004_client_favorite_pages')` and `('care_provider', '0051_careprovider_attribution_discount_percent_and_more')` (0001_initial.py:12-15). Correctly depends on the migration that adds the new CareProvider fields.
- **PASS** — No dependency on `apps.authentication` (BaseModel is abstract).
- **PASS** — `CreateModel` for `ProfileAttributionToken` includes all fields (0001_initial.py:36-53).
- **PASS** — Indexes `(provider, client, status)` and `(expires_at)` present in migration (0001_initial.py:52).
- **PASS** — `CreateModel` for `ProviderClientFeeOverride` includes all fields (0001_initial.py:18-34).
- **PASS** — `unique_together` on `(provider, client)` for `ProviderClientFeeOverride` present (0001_initial.py:33).
- **FAIL** — No `unique_together` or `UniqueConstraint` for `ProfileAttributionToken` in migration (consistent with model deficiency from 1.2).

### 2.2 CareProvider Migration for New Fields

- **PASS** — Migration `0051_careprovider_attribution_discount_percent_and_more.py` depends on `('care_provider', '0050_alter_countrycode_options_and_more')` (0051 migration:8-9).
- **PASS** — `AddField` for `attribution_discount_percent` uses `null=True` (0051 migration:16).
- **PASS** — `AddField` for `attribution_notifications_enabled` specifies `default=True` (0051 migration:21).

### 2.3 Migration Squash / Leaf Integrity

- **PASS** — Only `0001_initial.py` and `__init__.py` in `apps/attribution/migrations/`.
- **PASS** — `0051` is the latest leaf for care_provider. No branch/fork detected.

---

## Section 3: Utility Function Safety

### 3.1 get_telehealth_fee() -- Fail-Safe Guarantee

1. **PASS** — Logic wrapped in try/except (utils.py:23-34).
2. **PASS** — Generic `except Exception` returns `(STANDARD_FEE, STANDARD_LABEL)` where `STANDARD_FEE = Decimal('0.1500')` (utils.py:32-34).
3. **PASS** — Does not return `0` on error.
4. **PASS** — Does not re-raise exceptions.
5. **WARN** — The function does NOT reference `settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT` at all. The fallback uses hardcoded `STANDARD_FEE = Decimal('0.1500')` (utils.py:11) and the DoesNotExist path uses `settings.OTHER_PLATFORM_FEE_PERCENT` (utils.py:30). This creates a **triple-source inconsistency**: the settings file defines `ATTRIBUTED_TELEHEALTH_FEE_PERCENT = '0.12'` (settings.py:625), utils.py hardcodes `0.1500`, and DoesNotExist fallback reads `OTHER_PLATFORM_FEE_PERCENT`. Which is the correct standard fee?
6. **PASS** — Logging present in except block (utils.py:33).

**Override lookup**:
- **FAIL** — Uses `.get()` (utils.py:24) instead of `.filter().first()`. If the unique constraint were ever violated at DB level, `.get()` would raise `MultipleObjectsReturned`, which propagates through the generic except as a fallback. While the except catches it, `.filter().first()` is more defensive.
- **FAIL** — Does NOT filter on `is_active=True` (utils.py:24-27). Deactivated overrides (`is_active=False`) will still be returned, incorrectly applying discounts for deactivated relationships.

### 3.2 get_checkout_discount() -- First-Session Guard

1. **WARN** — The function checks `token.first_session_discount_applied` (utils.py:59) but only uses it to set the `is_first` flag in the return tuple `(discount_decimal, is_first)`. It does NOT prevent a discount from being returned when `first_session_discount_applied=True`. The caller receives `is_first=False` but still gets a non-None `discount_decimal`. Whether this is correct depends on the caller's behavior -- but the function itself does not enforce the "no double discount" invariant.
2. **FAIL** — The function does NOT return `(None, False)` when `first_session_discount_applied=True`. It returns `(discount_decimal, False)`, leaving enforcement to the caller. This violates the spec requirement.
3. **FAIL** — The function does NOT atomically set `first_session_discount_applied = True` and `first_booking_at = now()`. It does not write to the token at all. The discount application is entirely deferred to the caller.
4. **FAIL** — No `select_for_update()` is used anywhere in utils.py. TOCTOU race condition exists.
5. **FAIL** — No `transaction.atomic()` wrapping exists in utils.py.
6. **PASS** — Handles `token is None` gracefully (utils.py:51).
7. **FAIL** — The function filters on `status=AttributionStatus.PENDING` (utils.py:48) but NOT on `status='confirmed'`. Per spec, a `confirmed` token should trigger the discount, but the code only looks at `pending` tokens. A confirmed token is invisible to this function.

### 3.3 Attribution Window Expiry Logic

- **FAIL** — No management command, celery task, APScheduler job, or signal exists to transition expired tokens. No reference to `ATTRIBUTION_WINDOW_DAYS` exists anywhere in the attribution app.
- **FAIL** — `ATTRIBUTION_WINDOW_DAYS` is not used when computing `expires_at`. The `expires_at` field has no default and no auto-computation. Token creators must manually compute and pass `expires_at`.

---

## Section 4: Settings Correctness

### 4.1 ATTRIBUTED_TELEHEALTH_FEE_PERCENT

- **PASS** — Setting exists (settings.py:625).
- **FAIL** — It is a **string**: `env('ATTRIBUTED_TELEHEALTH_FEE_PERCENT', default='0.12')` uses `env()` (not `env.int()` or `env.float()`), and the default is the string `'0.12'`. `django-environ`'s `env()` returns strings by default.
- **WARN** — The value `0.12` (12%) does not match the utils.py hardcoded `STANDARD_FEE = Decimal('0.1500')` (15%). Unclear which represents the actual standard telehealth fee vs. the attributed (discounted) rate.

### 4.2 ATTRIBUTION_WINDOW_DAYS

- **PASS** — Setting exists (settings.py:626).
- **PASS** — Uses `env.int('ATTRIBUTION_WINDOW_DAYS', default=60)` -- correct type.
- **PASS** — Default value is `60`.

### 4.3 Settings Type Safety Pattern

- **FAIL** — `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` uses bare `env()` which returns a string. Should use `env('ATTRIBUTED_TELEHEALTH_FEE_PERCENT', default='0.12', cast=Decimal)` or similar.
- **PASS** — `ATTRIBUTION_WINDOW_DAYS` uses `env.int()`.

---

## Section 5: INSTALLED_APPS and URL Wiring

### 5.1 INSTALLED_APPS

- **PASS** — `"apps.attribution"` present in INSTALLED_APPS (settings.py:97).

### 5.2 AppConfig

- **PASS** — `default_auto_field = 'django.db.models.BigAutoField'` set (apps.py:5).
- **PASS** — `name = 'apps.attribution'` matches INSTALLED_APPS entry (apps.py:6).

### 5.3 URL Wiring

- **PASS** — `urls.py` exists with empty `urlpatterns = []` (urls.py:3). No endpoints exposed.
- **PASS** — Included in `lumy_global/urls.py` at `api/v1/attribution/` (urls.py:64). Harmless since no routes are registered.

---

## Section 6: Admin Configuration

### 6.1 ProviderClientFeeOverride Admin

- **PASS** — `fee_percent` in `readonly_fields` (admin.py:32).
- **PASS** — `source` in `readonly_fields` (admin.py:32).
- **PASS** — `original_fee_percent` in `readonly_fields` (admin.py:32).
- **FAIL** — `provider` and `client` are NOT in `readonly_fields` (admin.py:32). A staff user could reassign a fee override to a different provider or client.
- **WARN** — `has_delete_permission` is not overridden to return `False`. Fee overrides can be hard-deleted through admin.

### 6.2 ProfileAttributionToken Admin

- **PASS** — Registered in admin (admin.py:6-7).
- **FAIL** — `first_session_discount_applied` is NOT in `readonly_fields` (admin.py:18). Only `created_at` and `modified_at` are readonly. Staff can manually toggle this flag.
- **FAIL** — `expires_at` is NOT in `readonly_fields` (admin.py:18). Staff can modify the expiry window.
- **WARN** — `status` is editable without confirmation. Staff can manually set `status=confirmed` bypassing attribution flow.

### 6.3 list_display Usability

- **PASS** — `list_display` includes: `id`, `provider`, `client`, `source`, `status`, `expires_at`, `first_booking_at`, `first_session_discount_applied`, `created_at` (admin.py:8-12).
- **PASS** — `list_filter` includes `status` and `source` (admin.py:13).
- **PASS** — `search_fields` includes `provider__user__email` and `client__user__email` (admin.py:14-17).

---

## Section 7: Payment Critical Path -- Query Performance

### 7.1 Checkout Query for ProviderClientFeeOverride

- **PASS** — `unique_together = [('provider', 'client')]` (models.py:99) creates a unique B-tree index on `(provider_id, client_id)`.
- **FAIL** — The checkout query in `get_telehealth_fee()` does NOT filter on `is_active=True` (utils.py:24-27). Inactive overrides will match.

### 7.2 Checkout Query for ProfileAttributionToken

- **PASS** — Composite index on `(provider, client, status)` exists (models.py:53). Covers the checkout query pattern.
- **WARN** — The query in `get_checkout_discount()` filters `provider, client, status=PENDING` and orders by `-created_at` (utils.py:45-49). The composite index `(provider, client, status)` covers the WHERE clause but not the ORDER BY on `created_at`. On small result sets this is fine.
- **FAIL** — The `expires_at` filter is NOT applied in the database query (utils.py:45-49). Expiry is checked post-fetch via `token.is_expired` (utils.py:51). Under load with many expired tokens, this fetches unnecessary rows. More critically, if the `.first()` returns an expired token, valid non-expired tokens for the same pair are silently ignored because `order_by('-created_at')` may return an expired recent token before a valid older one.

### 7.3 Transaction Isolation

- **FAIL** — No `transaction.atomic()` wrapping in `get_checkout_discount()` or anywhere in utils.py.
- **FAIL** — No `select_for_update()` used. Concurrent checkouts can apply the discount multiple times (TOCTOU race).

---

## Section 8: Test Coverage

### 8.1 Fail-Safe Fallback Test

- **PASS** — `test_returns_standard_rate_on_db_exception` (test_models.py:114-119) mocks a DB exception and asserts return value is `Decimal('0.1500')`.

### 8.2 Discount Flag Prevention Test

- **FAIL** — No test creates a token with `first_session_discount_applied=True` and verifies `get_checkout_discount()` returns 0/None. This matches the code deficiency in 3.2 -- the function doesn't enforce this guard.

### 8.3 Model Property Tests

- **PASS** — `test_is_expired_returns_true_when_past` (test_models.py:45-51).
- **PASS** — `test_is_expired_returns_false_when_future` (test_models.py:53-59).
- **PASS** — `test_is_active_returns_false_when_confirmed` (test_models.py:61-68).
- **PASS** — `test_is_active_returns_true_when_pending_and_not_expired` (test_models.py:70-77).
- **FAIL** — No test for `is_active` when status=`expired` or status=`ineligible`.
- **FAIL** — No test for `is_active` when pending but expired (expired datetime in past).

### 8.4 Unique Constraint Test

- **PASS** — `test_unique_together_raises_integrity_error` for `ProviderClientFeeOverride` (test_models.py:82-93).
- **FAIL** — No uniqueness test for `ProfileAttributionToken` (consistent with model lacking the constraint).

### 8.5 Attribution Window Expiry Test

- **PASS** — `test_returns_none_when_token_expired` (test_models.py:143-155) creates an expired token and asserts `get_checkout_discount()` returns `(None, False)`.

### 8.6 Settings Type Tests

- **WARN** — No test verifies `isinstance(settings.ATTRIBUTED_TELEHEALTH_FEE_PERCENT, ...)`.
- **WARN** — No test verifies `isinstance(settings.ATTRIBUTION_WINDOW_DAYS, int)`.

### 8.7 Race Condition / Concurrency Test

- **FAIL** — `get_checkout_discount()` does NOT use `select_for_update()` (verified by code inspection). No transaction isolation exists.

---

## Summary Table

| Section | PASS | FAIL | WARN | N/A |
|---|---|---|---|---|
| 1. Data Model | 16 | 3 | 3 | 0 |
| 2. Migrations | 8 | 1 | 0 | 0 |
| 3. Utility Functions | 3 | 9 | 1 | 0 |
| 4. Settings | 3 | 2 | 1 | 0 |
| 5. INSTALLED_APPS / URLs | 4 | 0 | 0 | 0 |
| 6. Admin | 4 | 3 | 2 | 0 |
| 7. Payment Critical Path | 2 | 4 | 1 | 0 |
| 8. Tests | 5 | 4 | 2 | 0 |
| **Total** | **45** | **26** | **10** | **0** |

---

## Merge Blockers (FAIL items requiring fix before merge)

### Critical (Revenue/Financial Impact -- Sections 3 & 7)

1. **`is_active` property shadows `BaseModel.is_active` field** (models.py:65) -- ORM filters and property access will return different things. Rename to `is_active_window`.
2. **`get_telehealth_fee()` does not filter `is_active=True`** (utils.py:24) -- deactivated fee overrides are still applied.
3. **`get_checkout_discount()` does not prevent double-discount** (utils.py:59-60) -- returns discount even when `first_session_discount_applied=True`. Only `is_first` flag differs.
4. **`get_checkout_discount()` does not atomically set `first_session_discount_applied`** (utils.py:37-64) -- the function is read-only; no write occurs.
5. **No `transaction.atomic()` or `select_for_update()`** (utils.py) -- concurrent checkout race condition.
6. **`get_checkout_discount()` only queries `PENDING` tokens** (utils.py:48) -- `CONFIRMED` tokens are invisible to checkout.
7. **`expires_at` not filtered in DB query** (utils.py:45-49) -- post-fetch check may skip valid tokens behind an expired one.
8. **`ATTRIBUTED_TELEHEALTH_FEE_PERCENT` is a string** (settings.py:625) -- will cause `TypeError` in arithmetic.
9. **No unique constraint on `ProfileAttributionToken(provider, client)`** (models.py:51-55) -- duplicate tokens possible.

### High (Data Integrity / Admin Safety)

10. **`first_session_discount_applied` and `expires_at` editable in admin** (admin.py:18).
11. **`provider` and `client` editable on `ProviderClientFeeOverride` admin** (admin.py:32).
12. **`ATTRIBUTION_WINDOW_DAYS` unused** -- no code computes `expires_at` from this setting.
13. **No expiry transition mechanism** -- stale tokens remain in `pending`/`confirmed` status permanently.

### Test Gaps

14. No test for double-discount prevention.
15. No test for `is_active` with expired/ineligible status.
16. No uniqueness test for `ProfileAttributionToken`.
17. No settings type safety tests.
