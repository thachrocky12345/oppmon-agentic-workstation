# Feature: Stripe Payments & Cards

## Purpose
- Enable clients/providers to add Stripe payment methods and complete card payments for appointments. (SystemOverview + code usage)

## User journey / key actions
- Provider connects Stripe in `/payment-method` and completes Stripe onboarding. (Frontend payment‑method pages)
- Client selects a payment method or adds a card during booking, then confirms payment intent. (PaymentModule dialog)

## Glossary / UI terms
- Stripe Payments & Cards
- “payment method”, “stripe customer id”, “payment intent”, “card”

## Entry points
- Screens/routes: `/payment-method`, `/payment-method/stripe`, Stripe connect flow (`RG-Frontend/src/stripeConnect/stripeConnect.tsx`).
- Booking flow: `RG-Frontend/src/components/PaymentModule/PaymentDialog.tsx`, `RG-Frontend/src/components/PaymentModule/SetupForm.tsx`.
- API/GraphQL: REST endpoints referenced in `RG-Frontend/src/lib/constants.ts` (`/payments/*`) and Next.js API routes `RG-Frontend/src/pages/api/stripe-checkout/*`. Backend GraphQL Stripe user mutations in `Lumy-Backend/apps/authentication/mutations.py`.

## Data entities
- `Lumy-Backend/apps/stripe_integration/models.py` (StripeUser).

## Related docs
- ContextFiles/SystemOverview.md

## Technical mapping
- [Technical doc](../technical/stripe-payments-cards-technical.md)
