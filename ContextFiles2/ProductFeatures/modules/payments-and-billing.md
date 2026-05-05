# Module: payments-and-billing

## Scope
- Includes the features listed below.

## Features

- [Clients can purchase recurring sessions](../features/clients-can-purchase-recurring-sessions.md)
- [PayPal Integration](../features/paypal-integration.md)
- [Recurring Sessions Purchase](../features/recurring-sessions-purchase.md)
- [Stripe Payments & Cards](../features/stripe-payments-cards.md)

## Core files/services
- Found 1 matches in 1 files. Search evidence: `rg -n "recurring" RG-Frontend/src`. Sample files: RG-Frontend/src/containers/Authentication/SignUpModal/TosText.tsx
- RG-Frontend/src/components/PaymentModule/ListPaymentMethods.tsx
- RG-Frontend/src/components/PaymentModule/PaymentDialog.tsx
- RG-Frontend/src/components/PaymentModule/SetupForm.tsx
- RG-Frontend/src/pages/api/paypal/callback.js
- See [Recurring Sessions Purchase](../technical/recurring-sessions-purchase-technical.md).

## Key dependencies/integrations
- Lumy-Backend/apps/stripe_integration
- See [Recurring Sessions Purchase](../technical/recurring-sessions-purchase-technical.md).
