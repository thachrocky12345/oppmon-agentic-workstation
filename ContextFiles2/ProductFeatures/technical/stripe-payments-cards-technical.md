# Technical: Stripe Payments & Cards

## Screens / routes
- `/payment-method` (`RG-Frontend/src/pages/payment-method/index.tsx`)
- `/payment-method/stripe` (`RG-Frontend/src/pages/payment-method/stripe/index.tsx`)
- Stripe connect callback handled in `RG-Frontend/src/stripeConnect/stripeConnect.tsx`
- Stripe checkout proxy: `RG-Frontend/src/pages/api/stripe-checkout/create-session.ts` and `RG-Frontend/src/pages/api/stripe-checkout/verify.ts`

## Frontend components/modules
- RG-Frontend/src/components/PaymentModule/SetupForm.tsx
- RG-Frontend/src/components/PaymentModule/ListPaymentMethods.tsx
- RG-Frontend/src/components/PaymentModule/PaymentDialog.tsx
- RG-Frontend/src/store/slices/paymentSlice.ts

## Backend apps/modules
- Lumy-Backend/apps/stripe_integration
- Lumy-Backend/apps/authentication (StripeUser mutations)

## APIs / GraphQL operations
- REST endpoints referenced in `RG-Frontend/src/lib/constants.ts`:
  - `/payments/create_or_fetch/`, `/payments/create/`, `/payments/cards/`, `/payments/attach-card/`, `/payments/detach/`, `/payments/confirm/`
- Next.js API: `RG-Frontend/src/pages/api/stripe-checkout/create-session.ts`, `RG-Frontend/src/pages/api/stripe-checkout/verify.ts`
- GraphQL: `Lumy-Backend/apps/authentication/mutations.py` (StripeUser updates), `Lumy-Backend/apps/graphqlapp/mutations.py` (stripe integration mutations list)

## Key files and directories
- RG-Frontend/src/components/PaymentModule/SetupForm.tsx
- RG-Frontend/src/components/PaymentModule/ListPaymentMethods.tsx
- RG-Frontend/src/pages/payment-method/index.tsx
- RG-Frontend/src/pages/payment-method/stripe/index.tsx
- Lumy-Backend/apps/stripe_integration

## Tests
- Lumy-Backend/apps/stripe_integration/tests.py

## Config / env
- Lumy-Backend/lumy_global/settings.py
- RG-Frontend/src/store/axiosInstance.ts

## Known risks / open questions
- - Security: Secret key and DEBUG=true in settings; tighten for production, restrict CORS/CSRF, remove wildcard hosts.
- - Observability: No structured logging/metrics; add Sentry or similar plus request/DB logging.
- - Testing: Backend has app-level tests but coverage unknown; frontend lacks tests—add Jest/RTL for critical flows.

## Source docs
- ContextFiles/SystemOverview.md
