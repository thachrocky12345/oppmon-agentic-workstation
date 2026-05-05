# Feature: PayPal Integration

## Purpose
- Allow providers to connect PayPal as a payment method for appointments. (Frontend payment‑method flows)

## User journey / key actions
- Provider connects PayPal from `/payment-method` and completes the partner‑referral flow. (Frontend flow)
- Client selects PayPal as payment method during booking. (`PaymentDialog`)

## Glossary / UI terms
- PayPal Integration
- “PayPal partner referral”, “paymentType: PAYPAL”

## Entry points
- Screens/routes: `/payment-method`, `/payment-method/paypal`, callback in `RG-Frontend/src/pages/api/paypal/callback.js`.
- API/GraphQL: REST endpoints referenced in `RG-Frontend/src/lib/constants.ts` and `RG-Frontend/src/components/PaymentModule/PaymentDialog.tsx` (e.g., `/payments/paypal/*`). Backend PayPal handlers not found in repo. Search evidence: `rg -n "paypal" Lumy-Backend/apps` (0 matches)

## Data entities
- `Lumy-Backend/apps/stripe_integration/models.py` (StripeUser includes `paypalUserId`, `paymentType`).

## Related docs
- ContextFiles/HumanDocuments/Features/_extracted/PayPal Integration Questions.txt

## Technical mapping
- [Technical doc](../technical/paypal-integration-technical.md)
