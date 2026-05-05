# Payments & Billing — Technical Reference

**Module:** Payments & Billing
**Status:** PayPal end-to-end working; Stripe partially implemented
**Last updated:** 2026-03-16
**Audit source:** Session audit 2026-03-16

---

## Architecture Overview

Two payment processors coexist. PayPal uses a **marketplace authorize-then-capture** model with automatic fee splitting. Stripe has the customer/card management infrastructure but is missing the capture, Connect payout, and webhook layers.

```
Client checkout
   │
   ├── PayPal path (WORKING)
   │    ├── POST /payments/paypal/create-payment/  → create AUTHORIZE order
   │    ├── Client approves at PayPal → auth_id returned
   │    ├── Cron job (every minute) → 6h before session
   │    │     └── capture_authorization(auth_id, platform_fee) → splits to RG + provider
   │    └── On cancel → void_authorization() [COMMENTED OUT — gap]
   │
   └── Stripe path (INCOMPLETE)
        ├── POST /payments/create_or_fetch/  → create/fetch Customer
        ├── POST /payments/create/           → create PaymentIntent
        ├── POST /payments/confirm/          → confirm intent (auto-captures — no split)
        ├── MISSING: manual capture + transfer_data
        ├── MISSING: webhook handler
        └── MISSING: Connect account exchange endpoint
```

---

## File Inventory

### Backend

| File | Purpose |
|---|---|
| `apps/stripe_integration/models.py` | `StripeUser` — links user to Stripe customer + PayPal merchant |
| `apps/stripe_integration/views.py` | 11 REST endpoints (see table below) |
| `apps/stripe_integration/urls.py` | URL routing for all payment endpoints |
| `apps/stripe_integration/utils.py` | PayPal API helpers (access token, create order, capture, void, refund) |
| `apps/stripe_integration/object_type.py` | GraphQL `StripeUserType` |
| `apps/calendar_functionality/models.py` | `Appointment` payment fields (intent ID, method ID, PayPal IDs, status, amount) |
| `apps/calendar_functionality/enum.py` | `PaymentStatus` enum: PENDING=0, COMPLETED=1, FAILED=2, REFUNDED=3, CANCELLED=4 |
| `apps/calendar_functionality/views.py:1421` | `CancelAppointmentAPIView` — pre-capture cancel logic |
| `lumy_global/cron.py` | `capture_authorized_payments_job()` — APScheduler every minute |
| `lumy_global/settings.py` | All payment env var definitions |

### Frontend

| File | Purpose |
|---|---|
| `src/store/slices/paymentSlice.ts` | Redux state: thunks for all payment API calls, card list, customer ID |
| `src/pages/payment-method/index.tsx` | Payment method setup hub (Stripe + PayPal tabs) |
| `src/pages/payment-method/stripe/index.tsx` | Stripe Connect OAuth page |
| `src/pages/payment-method/paypal/index.tsx` | PayPal merchant onboarding page |
| `src/pages/billing-invoices/index.tsx` | Invoice listing (reads appointments) |
| `src/stripeConnect/stripeConnect.tsx` | Stripe Connect OAuth button component |
| `src/lib/api.ts` | REST helper functions for all payment endpoints |
| `src/mixPanelEvents/payments.ts` | Mixpanel: `paymentMethodViewed`, `continueWithStripeClicked`, `paymentDoneSuccessfully` |

---

## REST Endpoints

All under `/api/v1/payments/` — defined in `apps/stripe_integration/urls.py`.

| Method | Path | View | Auth | Status |
|--------|------|------|------|--------|
| POST | `create/` | `PaymentIntentAPIView` | JWT | Working |
| GET | `cards/` | `GetPaymentMethodsAPIView` | JWT | Working |
| POST | `attach/` | `AttachPaymentMethodAPIView` | JWT | Working |
| POST | `detach/` | `DetachPaymentMethodAPIView` | JWT | Working |
| POST | `create_or_fetch/` | `CreateOrFetchStripeAPIView` | JWT | Working |
| POST | `confirm/` | `ConfirmPaymentAPIView` | JWT | Working (no fee split) |
| POST | `attach-card/` | `AttachCardAPIView` | JWT | Working |
| POST | `update-stripe-customer/` | `UpdateStripeUserAPIView` | JWT | Working |
| POST | `remove-stripe-customer/` | `RemoveStripeCustomerAPIView` | JWT | Working |
| POST | `paypal/create-payment/` | `PayPalCreatePaymentAPIView` | JWT | Working |
| POST | `paypal/test-cron/` | `PayPalCapturePaymentAPIView` | JWT | Working |
| POST | `paypal/partner-referral/` | `PayPalPartnerReferralAPIView` | JWT | Working |
| GET | `paypal/onboarding-status/<id>/` | `PayPalOnboardingStatusAPIView` | JWT | Working |
| POST | `webhook/` | — | Stripe-sig | **MISSING** |

---

## Data Models

### `StripeUser` (`apps/stripe_integration/models.py`)

```python
class StripeUser(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    stripe_customer_id = models.CharField(max_length=225)
    paypal_user_id = models.TextField()
    payment_type = models.CharField(choices=[('stripe','stripe'),('paypal','paypal')])
    customer_name = models.CharField(...)
    customer_email = models.CharField(...)
```

**Note:** `CareProvider` also stores `stripe_customer_id` directly on the model — used inconsistently for both Stripe customer IDs and Connect account IDs.

### Appointment payment fields (`apps/calendar_functionality/models.py`)

```python
payment_intent_id   = CharField(max_length=255)      # Stripe PI ID
payment_method_id   = CharField(max_length=255)      # Stripe PM ID
invoice_id          = CharField(max_length=255)      # placeholder — never populated
amount_in_cents     = IntegerField()
currency            = CharField(max_length=3)
payment_status      = IntegerField()                 # PaymentStatus enum
paypal_order_id     = CharField(max_length=64)
paypal_auth_id      = CharField(max_length=64)       # held authorization
paypal_status       = CharField(choices=['authorized','captured','failed'])
```

---

## Cron Job: `capture_authorized_payments_job`

**Location:** `lumy_global/cron.py`
**Schedule:** `* * * * *` (every minute)
**Trigger window:** Appointments with `start_date_time` between `now + 6h` and `now + 6h + 1min`

**PayPal path (working):**
```python
auth = get_authorization(token, appointment.paypal_auth_id)
held_amount = auth['amount']['value']
fee = float(held_amount) * fee_percent
capture_authorization(token, appointment.paypal_auth_id, platform_fee=fee, currency=currency)
```

**Stripe path (stubbed — not implemented):**
```python
# TODO: stripe.PaymentIntent.capture(intent_id, transfer_data={...})
# Requires capture_method='manual' on creation (not currently set)
```

---

## PayPal Utilities (`apps/stripe_integration/utils.py`)

| Function | HTTP call | Status |
|---|---|---|
| `get_paypal_access_token()` | POST `/v1/oauth2/token` | Working |
| `create_order(token, payload)` | POST `/v2/checkout/orders` | Working |
| `capture_authorization(token, auth_id, fee, currency)` | POST `/v2/payments/authorizations/{id}/capture` | Working |
| `get_authorization(token, auth_id)` | GET `/v2/payments/authorizations/{id}` | Working |
| `void_authorization(token, auth_id)` | POST `/v2/payments/authorizations/{id}/void` | **Implemented but never called** |
| `refund_capture(token, capture_id)` | POST `/v2/payments/captures/{id}/refund` | **Commented out** |
| `create_partner_referral(token, data)` | POST `/v2/customer/partner-referrals` | Working |
| `get_merchant_onboarding_status(token, merchant_id)` | GET `/v1/customer/partners/{id}/merchant-integrations/{id}` | Working |

---

## Settings / Environment Variables

```python
# Stripe
STRIPE_PUBLISHABLE_KEY       = env("STRIPE_PUBLISHABLE_KEY")
STRIPE_SECRET_KEY            = env("STRIPE_SECRET_KEY")
STRIPE_PUBLIC_KEY            = env("STRIPE_PUBLIC_KEY")
STRIPE_WEBHOOK_SECRET        = env("STRIPE_WEBHOOK_SECRET")   # defined but unused

# PayPal
PAYPAL_ENVIRONMENT           = env("PAYPAL_ENVIRONMENT", default="sandbox")
PAYPAL_CLIENT_ID             = env("PAYPAL_CLIENT_ID")
PAYPAL_SECRET                = env("PAYPAL_SECRET")
PAYPAL_ONBOARD_RETURN_URL    = env("PAYPAL_ONBOARD_RETURN_URL")
PAYPAL_PARTNER_ATTRIBUTION_ID = env("PAYPAL_PARTNER_ATTRIBUTION_ID")
PAYPAL_PARTNER_MERCHANT_ID   = env("PAYPAL_PARTNER_MERCHANT_ID")

# Platform fees
OTHER_PLATFORM_FEE_PERCENT   = env("OTHER_PLATFORM_FEE_PERCENT")    # e.g. 0.20
IN_PERSON_PLATFORM_FEE_PERCENT = env("IN_PERSON_PLATFORM_FEE_PERCENT")  # e.g. 0.05
```

---

## GraphQL Surface

**Schema:** `apps/graphqlapp/schema.py` — minimal payment exposure

| Operation | Type | Returns |
|---|---|---|
| `GET_STRIPE_USER` | Query | `stripeUser { stripeCustomerId, paymentType, paypalUserId }` |
| `getStripeDetail` | Mutation | Exchange Stripe OAuth code for connected account (FE only — no BE endpoint backing it) |
| Appointment queries | Query | Include `paymentIntentId`, `paypalOrderId`, `paymentStatus` fields |

**Gap:** No GraphQL mutations for payment confirmation, refunds, or invoice retrieval.

---

## Mixpanel Events (`src/mixPanelEvents/payments.ts`)

| Event | When fired |
|---|---|
| `paymentMethodViewed` | User lands on `/payment-method/` |
| `continueWithStripeClicked` | User clicks Stripe Connect button |
| `paymentDoneSuccessfully` | Payment confirmation received |

**Gap:** No events for PayPal flow, capture, failed payments, or refund requests.

---

## Implementation Gaps — Detailed

### 1. Stripe Webhook Handler (Critical)

**What's needed:** Django view at `/api/v1/payments/webhook/` using `stripe.Webhook.construct_event()` with `STRIPE_WEBHOOK_SECRET`. Handle at minimum:
- `payment_intent.succeeded` → update `appointment.payment_status = COMPLETED`
- `payment_intent.payment_failed` → update status, notify client
- `charge.refunded` → update status to REFUNDED
- `charge.dispute.created` → flag appointment, notify ops

### 2. Stripe Manual Capture with Fee Split (Critical)

**What's needed:**
1. Change `PaymentIntentAPIView` to create PI with `capture_method='manual'`
2. In `capture_authorized_payments_job`, add:
```python
stripe.PaymentIntent.capture(
    payment_intent_id,
    transfer_data={'destination': provider_stripe_connect_id},
    application_fee_amount=int(amount_cents * fee_percent),
)
```

### 3. Stripe Connect Backend Exchange (High)

**What's needed:** Endpoint to receive OAuth callback code and exchange for connected account ID:
```python
response = stripe.OAuth.token(grant_type='authorization_code', code=code)
provider.stripe_connect_account_id = response['stripe_user_id']
```
Also: separate `stripe_connect_account_id` from `stripe_customer_id` on `CareProvider` model (currently conflated).

### 4. Post-Capture Refunds (High)

**What's needed:**
- New endpoint: `POST /payments/refund/` accepting `{ appointment_id, reason }`
- Stripe: `stripe.Refund.create(payment_intent=pi_id)`
- PayPal: uncomment and call `refund_capture(token, capture_id)`
- Update `appointment.payment_status = REFUNDED`
- Send refund confirmation email

### 5. PayPal Void on Cancellation (High)

**Location:** `apps/calendar_functionality/views.py:1442`
**Fix:** Uncomment the `void_authorization()` call block.

### 6. Idempotency Keys (Medium)

Add `idempotency_key=str(appointment.id)` to `stripe.PaymentIntent.create()` to prevent duplicate charges on retry.

---

## Testing Notes

- PayPal sandbox: set `PAYPAL_ENVIRONMENT=sandbox` in `.env`
- Stripe test mode: use `sk_test_...` key; test cards at `4242 4242 4242 4242`
- Capture cron: can be manually triggered via `POST /payments/paypal/test-cron/` with `{ appointment_id }`
- No automated payment tests exist in `apps/stripe_integration/tests.py` (file is empty or minimal)
