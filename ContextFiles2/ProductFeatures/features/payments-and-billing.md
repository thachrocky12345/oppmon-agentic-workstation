# Payments & Billing

**Module:** Payments & Billing
**Status:** Partially implemented — PayPal flow production-viable; Stripe flow incomplete
**Last updated:** 2026-03-16

---

## Overview

ReallyGlobal operates as a two-sided marketplace: clients pay for sessions, and providers receive payouts minus the platform fee. The platform supports two payment processors — **PayPal** (primary, working end-to-end) and **Stripe** (secondary, partially implemented). Payments are tied to appointments; no subscription or recurring billing model is in place.

---

## User Journeys

### Client — Paying for a Session

1. Client selects a provider, picks a time slot, and proceeds to checkout
2. Client is prompted to connect a payment method (Stripe card or PayPal account)
3. At booking: payment is **authorized** (held) but not immediately captured
4. 6 hours before the session: the platform automatically **captures** the authorization and splits the amount between ReallyGlobal (platform fee) and the provider
5. On cancellation before capture: authorization is voided and no charge occurs
6. Confirmation email is sent on successful payment

### Provider — Receiving Payouts

1. Provider connects a payment account in the portal (Settings → Payment Method)
2. **PayPal:** Provider completes a PayPal marketplace onboarding flow; ReallyGlobal links their merchant account
3. **Stripe:** Provider completes Stripe Connect OAuth; account is linked (incomplete — see Gaps)
4. On capture: provider's share is automatically routed to their connected account
5. Invoices are viewable in the Billing Invoices page

---

## Glossary

| Term | Meaning |
|---|---|
| **Authorization** | A hold placed on a client's funds at booking time — no money moves yet |
| **Capture** | Converting an authorization into an actual charge — money moves to ReallyGlobal and is split to provider |
| **Platform fee** | ReallyGlobal's cut: 20% for online/telehealth, 5% for in-person (configurable via env vars) |
| **Attribution fee** | Reduced platform fee (10%) when a client books via a provider's Booking Link |
| **Stripe Connect** | Stripe's marketplace product — allows ReallyGlobal to route payments to provider bank accounts |
| **PayPal Marketplace** | PayPal's equivalent — routes payments via merchant ID split at capture |
| **PaymentIntent** | Stripe's object representing a payment lifecycle (created → confirmed → captured) |
| **StripeUser** | Internal model linking a ReallyGlobal user to their Stripe customer record |

---

## Key Screens & Entry Points

| Screen | Path | Purpose |
|---|---|---|
| Payment Method Setup | `/payment-method/` | Connect Stripe card or PayPal account |
| Stripe Connect | `/payment-method/stripe/` | OAuth flow to link Stripe account (providers) |
| PayPal Onboarding | `/payment-method/paypal/` | Marketplace onboarding for providers |
| Billing / Invoices | `/billing-invoices/` | View payment history |
| Checkout (Booking Link v3) | `/book/<slug>/checkout/` | Client-facing checkout for direct booking |

---

## Data Entities

| Entity | Where | Purpose |
|---|---|---|
| `StripeUser` | `apps/stripe_integration/models.py` | Links user to Stripe customer + PayPal merchant IDs |
| `Appointment.payment_intent_id` | `apps/calendar_functionality/models.py` | Stripe PaymentIntent reference |
| `Appointment.payment_method_id` | Same | Stripe PaymentMethod used |
| `Appointment.paypal_order_id` | Same | PayPal order reference |
| `Appointment.paypal_auth_id` | Same | PayPal authorization ID (held funds) |
| `Appointment.payment_status` | Same | Enum: PENDING / COMPLETED / FAILED / REFUNDED / CANCELLED |
| `Appointment.amount_in_cents` | Same | Amount charged in smallest currency unit |

---

## Platform Fee Structure

| Session type | Default fee | With Booking Link attribution |
|---|---|---|
| Online / telehealth | 20% | 10% |
| In-person | 5% | 5% (TBD) |

Fees are configured via environment variables (`OTHER_PLATFORM_FEE_PERCENT`, `IN_PERSON_PLATFORM_FEE_PERCENT`). Attribution fee (10%) is applied when a client books through a provider's personal Booking Link — see `apps/booking_link/` and `apps/attribution/`.

---

## Known Gaps

| Gap | Impact | Priority |
|---|---|---|
| No Stripe webhook handler | Platform can't react to Stripe async events (failures, disputes) | Critical |
| Stripe capture not implemented | Stripe PaymentIntents are auto-captured with no fee split | Critical |
| Stripe Connect incomplete | Providers can't receive Stripe payouts | High |
| Post-capture refunds absent | Cancellations after capture require manual Stripe/PayPal action | High |
| PayPal void on cancel commented out | Cancelled authorizations sit held for 30 days | High |
| No invoice generation | `invoice_id` field exists but nothing creates invoice records | Medium |
| No idempotency keys | Retry scenarios could result in duplicate charges | Medium |

---

## Dependencies

- **Stripe** — payment processing, Connect payouts (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`)
- **PayPal** — marketplace payments, provider onboarding (`PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_PARTNER_MERCHANT_ID`)
- **SendGrid** — payment confirmation and refund notification emails
- **APScheduler / cron** — scheduled capture job fires every minute, captures 6h before session
- **Attribution system** (`apps/attribution/`) — fee reduction when client arrives via Booking Link

---

## Related Docs

- `ContextFiles2/ProductFeatures/technical/payments-and-billing-technical.md` — implementation detail
- `ContextFiles2/ProductFeatures/features/direct-booking-link.md` — Booking Link v3 checkout flow
- `ContextFiles2/ProductFeatures/features/certn-additional-access-fees-automation.md` — Certn fees (separate from session payments)
