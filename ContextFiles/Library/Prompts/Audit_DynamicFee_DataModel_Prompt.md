# Audit Prompt: RGDEV-184 — Dynamic Platform Fee Calculation at Checkout

**Scope:** All fee calculation logic across the `Lumy-Backend` codebase.
**Ticket:** RGDEV-184 — Dynamic Platform Fee Calculation at Checkout
**Audit type:** Data model + code correctness + gap analysis

---

## Context for the Auditor

Before running this audit, read the following files in full:

| File | Why |
|---|---|
| `apps/attribution/utils.py` | Canonical `get_telehealth_fee()` implementation |
| `apps/attribution/models.py` | `ProviderClientFeeOverride` and `ProfileAttributionToken` |
| `apps/stripe_integration/views.py` | `PayPalCapturePaymentAPIView` — manual PayPal capture path |
| `lumy_global/cron.py` | `capture_authorized_payments_job` — scheduled PayPal + Stripe capture |
| `apps/talk_now/views.py` | TalkNow (on-demand) Stripe payment path |
| `lumy_global/settings.py` | `IN_PERSON_PLATFORM_FEE_PERCENT`, `OTHER_PLATFORM_FEE_PERCENT`, `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` |
| `apps/attribution/tests/test_fee_calculation.py` | Existing fee unit tests |
| `apps/stripe_integration/tests/test_paypal_views.py` | PayPal integration tests |

---

## Known Architecture Facts (verified from code)

These are established facts from reading the current code. The audit must use these as baseline:

1. `get_telehealth_fee(provider, client)` lives in `apps/attribution/utils.py` and returns `(fee_percent: Decimal, fee_tier_label: str)`.
2. It filters `ProviderClientFeeOverride` with `is_active=True` and returns the override's `fee_percent` labelled `"attributed"`, or falls back to `settings.OTHER_PLATFORM_FEE_PERCENT` labelled `"standard"`.
3. On any exception it returns `(STANDARD_FEE, "standard")` where `STANDARD_FEE = Decimal("0.1500")`.
4. Two callers currently implement the modality gate and call `get_telehealth_fee`:
   - `apps/stripe_integration/views.py` → `PayPalCapturePaymentAPIView.post()` (lines 427–431)
   - `lumy_global/cron.py` → `capture_authorized_payments_job()` PayPal loop (lines 439–443)
5. The Stripe capture path in `cron.py` (lines 497–526) calls `stripe.PaymentIntent.capture(intent_id)` with **no fee calculation at all** — it does not call `get_telehealth_fee()` and does not pass `transfer_data` or `application_fee_amount` to Stripe.
6. Talk Now payments (`apps/talk_now/views.py`) go through Stripe Checkout Sessions and `charge_talknow_payment()`. Neither function calls `get_telehealth_fee()` or reads `IN_PERSON_PLATFORM_FEE_PERCENT`. The platform fee is **not applied** in the Talk Now payment path.
7. `ProviderClientFeeOverride` has no `is_active` field in `models.py`. The model has `fee_percent`, `source`, `original_fee_percent`, and the standard `BaseModel` fields. The `get_telehealth_fee()` query filters `is_active=True` — this field **does not exist** on the model.
8. Settings defines `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` (`Decimal`) but `get_telehealth_fee()` does **not** read this setting — it reads `override.fee_percent` directly from the DB row.
9. `PayPalCreatePaymentAPIView` constructs amounts using `f"{float(amount):.2f}"` — float arithmetic, not Decimal.
10. The commented-out original `capture_authorized_payments_job` used a nonexistent setting `settings.PAYPAL_PLATFORM_FEE_PERCENT`. The live version correctly calls `get_telehealth_fee()`.
11. `fee_tier_label` is logged with `appointment_id` and `fee_pct` in both PayPal capture paths. The Stripe capture path logs nothing about fee tier.
12. The `unique_fee_override_per_pair` constraint on `ProviderClientFeeOverride` is a plain `UniqueConstraint` (no partial condition), enforcing one override per `(provider, client)` pair unconditionally.

---

## Audit Questions

Work through each question below. For each, state: **Finding**, **Evidence** (file:line), **Risk** (High / Medium / Low / None), and **Recommended Action**.

---

### 1. Fee Calculation Coverage — Are There More Than Two Callers?

Search all Python files for any location that reads `IN_PERSON_PLATFORM_FEE_PERCENT`, `OTHER_PLATFORM_FEE_PERCENT`, or computes a multiplication against an appointment amount that is not already delegating to `get_telehealth_fee()`. Confirmed locations to audit:

- `apps/stripe_integration/views.py` — PayPalCapturePaymentAPIView
- `lumy_global/cron.py` — capture_authorized_payments_job (PayPal loop)
- `lumy_global/cron.py` — capture_authorized_payments_job (Stripe loop) **← known gap**
- `apps/talk_now/views.py` — charge_talknow_payment / TalkNowCheckout **← known gap**
- Any GraphQL mutations in `apps/graphqlapp/` or `apps/stripe_integration/` that touch payment capture

**Question:** Are there additional fee calculation call sites (e.g., GraphQL mutations, webhook handlers, management commands) that bypass `get_telehealth_fee()` and hard-code a percentage?

---

### 2. In-Person Hard Rule — Is It Enforced Everywhere?

The BRD requirement is: in-person sessions ALWAYS pay `IN_PERSON_PLATFORM_FEE_PERCENT` (currently 5%), and `ProviderClientFeeOverride` MUST NOT reduce this.

**Current implementation gate (used in both PayPal callers):**
```python
if appt.format and appt.format.name == "IN PERSON":
    pct = Decimal(str(settings.IN_PERSON_PLATFORM_FEE_PERCENT))
    fee_tier = "in_person_standard"
else:
    pct, fee_tier = get_telehealth_fee(appt.care_provider, appt.client)
```

**Questions to answer:**
- Is `appt.format` always populated? What happens if `format` is `None` (the `and` short-circuits to the `else` branch, potentially applying a telehealth fee to an in-person session that has no format set)?
- Is the format name check case-sensitive? What values does `appointment.format.name` actually take in the DB? (`"IN PERSON"` vs `"In Person"` vs `"in_person"`?)
- Does the Stripe capture path in `cron.py` apply this gate? (It currently does **not** — it calls `stripe.PaymentIntent.capture()` with no fee logic at all.)
- Does the Talk Now payment path apply this gate? Talk Now sessions are inherently on-demand video (telehealth); confirm they cannot be booked as in-person, or add the gate anyway.

---

### 3. Talk Now Session Fee Path

Talk Now (`apps/talk_now/`) uses its own Stripe Checkout Session (`TalkNowCheckout`) and a capture function (`charge_talknow_payment`). Neither reads `get_telehealth_fee()` or any platform fee constant.

**Questions to answer:**
- What is the `format` of an appointment created via `_book_appointment_atomic`? The `format_id` comes from `slots_details["format_id"]`. Can this be an in-person format?
- Is the platform fee intentionally omitted from Talk Now (i.e., is the full session amount passed to the provider with no platform split), or is this a gap?
- If the fee should be applied: at what point in the Talk Now flow should it be calculated — during `TalkNowCheckout` creation (before the session), or during `charge_talknow_payment` (at capture)?
- Does `charge_talknow_payment` need to accept `provider` and `client` arguments so it can call `get_telehealth_fee()`?
- How does Stripe apply the platform split for Talk Now payments? The current `stripe.PaymentIntent.create()` in `_handle_setup_intent` does not pass `transfer_data` or `application_fee_amount`.

---

### 4. `is_active` Field Missing on `ProviderClientFeeOverride`

`get_telehealth_fee()` queries:
```python
ProviderClientFeeOverride.objects.filter(
    provider=provider,
    client=client,
    is_active=True,
)
```

But `ProviderClientFeeOverride` in `apps/attribution/models.py` has no `is_active` field. `BaseModel` may or may not add it.

**Questions to answer:**
- Does `BaseModel` (from `apps/authentication/models.py`) define `is_active`? Read `apps/authentication/models.py` and confirm.
- If `is_active` does not exist on the model, this query will raise a `FieldError` at runtime, which the `except Exception` block in `get_telehealth_fee()` will silently catch, always returning the standard 15% rate. This means overrides are silently ignored.
- Is there a migration for `is_active` on `ProviderClientFeeOverride`? Check `apps/attribution/migrations/`.
- The existing test `test_attributed_client_returns_12pct` mocks `ProviderClientFeeOverride.objects` entirely, so it would not catch this field error.

---

### 5. Fee Tier Label Set — Is It Complete and Consistent?

The BRD specifies four labels:
- `"in_person_standard"` — in-person sessions
- `"attributed_profile"` — telehealth, override sourced from a profile visit
- `"attributed_booking_link"` — telehealth, override sourced from a booking link click
- `"standard"` — telehealth, no override

**Current implementation:**
- `get_telehealth_fee()` returns either `"attributed"` or `"standard"` — it does not distinguish between `"attributed_profile"` and `"attributed_booking_link"`.
- `ProviderClientFeeOverride.source` field exists (choices: `profile`, `booking_link`) and could provide this distinction.

**Questions to answer:**
- Should `get_telehealth_fee()` read `override.source` and return `"attributed_profile"` or `"attributed_booking_link"` instead of the generic `"attributed"` label?
- Is the generic `"attributed"` label a known interim simplification (tracked under a separate ticket), or is it a gap against the RGDEV-184 acceptance criteria?
- Are all four labels consistently used in logging, DB storage, and any downstream analytics queries?

---

### 6. Decimal Precision and Arithmetic Safety

**Questions to answer:**
- Fee multiplication in the two PayPal capture paths uses `ROUND_HALF_UP`:
  ```python
  platform_fee = (total_amount * pct).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
  ```
  Confirm this is correct and consistent.
- `PayPalCreatePaymentAPIView.post()` builds the order amount using `f"{float(amount):.2f}"`. This converts a client-supplied string to `float` before formatting. Is `amount` from the request body always a string or could it be a Decimal? Does this introduce float rounding before the amount reaches PayPal?
- `to_minor_units()` in `apps/talk_now/views.py` uses `int((amount_decimal * 100).to_integral_value())` — confirm this is correct for 2-decimal currencies. Does it handle JPY (0 decimals) or TND (3 decimals)?
- Does `get_telehealth_fee()` return a `Decimal` in all code paths? Confirm `override.fee_percent` is a `DecimalField` (it is, per `models.py`) and that `Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')` coerces correctly when the env var is a string like `"0.15"`.

---

### 7. Fail-Safe Default — Exception Handling Coverage

`get_telehealth_fee()` wraps the entire body in `try/except Exception` and returns `(STANDARD_FEE, STANDARD_LABEL)` on any error. This is the correct pattern.

**Questions to answer:**
- Is the fallback tested for the case where `ProviderClientFeeOverride.objects.filter()` raises (DB error)? Yes — `test_db_error_returns_standard` covers this.
- Is the fallback tested for the case where `settings.OTHER_PLATFORM_FEE_PERCENT` is missing or invalid (e.g., empty string)? The expression `Decimal(getattr(settings, 'OTHER_PLATFORM_FEE_PERCENT', '0.15') or '0.15')` guards against `None` and empty string. Does it guard against a non-numeric value like `"not_a_number"`? A `decimal.InvalidOperation` would propagate to the outer `except Exception` and fall back to `STANDARD_FEE`. Confirm this is the intended behavior.
- Are there tests that verify the fallback fires when `settings.OTHER_PLATFORM_FEE_PERCENT` is corrupted?

---

### 8. PayPal vs Stripe — Are All Payment Paths Covered?

The platform uses **both** PayPal and Stripe. Fee calculation must be consistent across both.

| Path | Fee Applied? | Uses `get_telehealth_fee()`? |
|---|---|---|
| PayPal manual capture (views.py) | Yes | Yes |
| PayPal scheduled capture (cron.py) | Yes | Yes |
| Stripe scheduled capture (cron.py) | **No** | **No** |
| Talk Now Stripe checkout | **No** | **No** |
| Talk Now SetupIntent charge | **No** | **No** |
| Stripe PaymentIntent creation (PaymentIntentAPIView) | N/A — creation only | N/A |

**Questions to answer:**
- For the Stripe scheduled capture: how should the platform fee be applied? Stripe requires `application_fee_amount` (in cents) passed to `stripe.PaymentIntent.capture()` along with `transfer_data.destination` set to the provider's Stripe Connect account. Is the provider's Stripe Connect account ID stored on `CareProvider`? What field holds it?
- For Talk Now Stripe: same question — how is the provider paid out? Is there a Stripe Connect account involved?
- Is there a `transfer_data` or `application_fee_amount` anywhere in the Stripe payment creation flow (`PaymentIntentAPIView`)? If not, where does the platform actually receive its fee from Stripe today?

---

### 9. Idempotency — Webhook Replay and Double Capture

**Questions to answer:**
- `capture_authorized_payments_job` (cron.py) queries `paypal_status="authorized"` and then sets `paypal_status="captured"` after success. If the cron runs twice in the same minute window (which `CRONTAB_LOCK_JOBS = True` should prevent but not guarantee in multi-process deployments), could the same auth be captured twice?
- For the Stripe capture path: the cron queries `payment_status=PaymentStatus.PENDING`. After capture it sets `payment_status=PaymentStatus.COMPLETED`. If a Stripe webhook also fires `payment_intent.succeeded` and updates the record, is there a race condition between the cron and the webhook handler?
- Is there a Stripe webhook handler in this codebase? Search for `stripe.Webhook.construct_event` or a webhook URL pattern. If it exists, does it perform fee calculation separately from the cron?
- `PaymentIntentAPIView` passes `idempotency_key=f"pi_{appointment_id}_{user.id}"` to `stripe.PaymentIntent.create`. Is a similar idempotency key used for capture operations?

---

### 10. Circular Import Risk

`apps/stripe_integration/views.py` imports:
```python
from apps.attribution.utils import get_telehealth_fee
```

`apps/attribution/utils.py` imports from:
```python
from .models import ProviderClientFeeOverride, ProfileAttributionToken, AttributionSource, AttributionStatus
```

`apps/attribution/models.py` imports:
```python
from apps.care_provider.models import CareProvider
from apps.client.models import Client
```

`apps/stripe_integration/views.py` also imports:
```python
from apps.care_provider.models import CareProvider
from apps.client.models import Client
```

**Questions to answer:**
- Does `apps/attribution` import anything from `apps/stripe_integration`? If yes, there is a circular import. If no, the dependency is one-directional and safe.
- `lumy_global/cron.py` imports both `get_telehealth_fee` (from `attribution`) and Stripe/PayPal utilities (from `stripe_integration`). Does `cron.py` get imported by any module that `attribution` also imports? Check `lumy_global/urls.py` and `lumy_global/settings.py` for any import of `cron.py` at startup.
- Run `python manage.py check` and confirm no import errors are raised at startup.

---

### 11. `ProviderClientFeeOverride` Soft-Delete Design

The model has no `is_active` field visible in `apps/attribution/models.py`. The `unique_fee_override_per_pair` constraint is unconditional (not a partial index). This means:

- If an override is to be "deactivated" without deleting it, there is no `is_active` field to set (unless inherited from `BaseModel`).
- If the unique constraint is unconditional, a "new" override cannot be created for the same pair while an old one exists — soft-delete requires `is_active=False` before a new one can be inserted.

**Questions to answer:**
- Read `apps/authentication/models.py` and confirm whether `BaseModel` includes `is_active`. Document the answer.
- If `is_active` is not on the model, `get_telehealth_fee()` will always hit the `except Exception` fallback (silently). This is a critical runtime bug. Has it been observed in production? Are there logs of unexpected `"attributed"` vs `"standard"` fee discrepancies?
- Should the unique constraint be made partial (e.g., `condition=Q(is_active=True)`) to allow one active override per pair while retaining historical rows?

---

### 12. `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` Setting — Used Anywhere?

`settings.py` defines:
```python
ATTRIBUTED_TELEHEALTH_FEE_PERCENT = Decimal(env('ATTRIBUTED_TELEHEALTH_FEE_PERCENT', default='0.12'))
```

But `get_telehealth_fee()` does **not** read this setting — it reads `override.fee_percent` from the DB row directly. The `ProviderClientFeeOverride.original_fee_percent` defaults to `Decimal("0.1500")`.

**Questions to answer:**
- Is `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` used anywhere in the codebase? Search for `ATTRIBUTED_TELEHEALTH_FEE_PERCENT` across all Python files.
- Was it intended to be the default fee for new `ProviderClientFeeOverride` rows at creation time (i.e., set as the default for `fee_percent` when creating an override for an attributed client)?
- Is there a view or management command that creates `ProviderClientFeeOverride` rows? If so, does it use this setting to populate `fee_percent`?
- If unused, it should be removed from `settings.py` to avoid confusion, or documented with a comment explaining its intended use.

---

## Deliverables Expected from This Audit

1. **Gap matrix**: For each of the 5 payment paths in the table in question 8, confirm whether fee calculation is applied, and if not, whether it is intentionally deferred.
2. **`is_active` verdict**: Confirm whether `BaseModel` provides `is_active`, and whether the `get_telehealth_fee()` query is currently broken in production.
3. **Fee tier label gap**: Confirm whether `"attributed"` satisfies RGDEV-184 acceptance criteria or whether `"attributed_profile"` / `"attributed_booking_link"` distinction is required.
4. **Circular import verdict**: Confirm `apps/attribution` → `apps/stripe_integration` dependency does not exist.
5. **Stripe fee split gap**: Document how (or whether) the platform collects its fee from Stripe today (connect account, application fee, or manual reconciliation).
6. **Recommended fixes** (ranked by risk): List concrete code changes needed, with file and line references.

---

## Search Commands for Auditor

```bash
# Find all platform fee references
grep -rn "platform_fee\|fee_percent\|get_telehealth_fee\|IN_PERSON_PLATFORM\|OTHER_PLATFORM_FEE\|ATTRIBUTED_TELEHEALTH" apps/ lumy_global/ --include="*.py"

# Find all stripe.PaymentIntent.capture calls
grep -rn "PaymentIntent.capture\|application_fee_amount\|transfer_data" apps/ lumy_global/ --include="*.py"

# Find all Stripe webhook handler candidates
grep -rn "Webhook.construct_event\|webhook_secret\|stripe_webhook" apps/ lumy_global/ --include="*.py"

# Check BaseModel for is_active
grep -n "is_active" apps/authentication/models.py

# Check attribution app for any import of stripe_integration
grep -rn "stripe_integration\|stripe" apps/attribution/ --include="*.py"

# Find all ATTRIBUTED_TELEHEALTH_FEE_PERCENT usages
grep -rn "ATTRIBUTED_TELEHEALTH_FEE_PERCENT" . --include="*.py"

# Find Talk Now appointment format values
grep -rn "format_id\|format.name\|IN PERSON\|TALK NOW" apps/talk_now/ --include="*.py"
```
