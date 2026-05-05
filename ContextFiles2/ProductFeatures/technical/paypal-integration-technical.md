# Technical: PayPal Integration

## Screens / routes
- `/payment-method` (`RG-Frontend/src/pages/payment-method/index.tsx`)
- `/payment-method/paypal` (`RG-Frontend/src/pages/payment-method/paypal/index.tsx`)
- Callback: `RG-Frontend/src/pages/api/paypal/callback.js`

## Frontend components/modules
- RG-Frontend/src/components/PaymentModule/PaymentDialog.tsx
- RG-Frontend/src/pages/api/paypal/callback.js
- RG-Frontend/src/store/slices/paymentSlice.ts (paypal partner referral + onboarding status)

## Backend apps/modules
- Not found in repo. Search evidence: `rg -n "paypal" Lumy-Backend/apps` (0 matches)

## APIs / GraphQL operations
- REST endpoints referenced in `RG-Frontend/src/lib/constants.ts` and `RG-Frontend/src/components/PaymentModule/PaymentDialog.tsx`:
  - `/payments/paypal/partner-referral/`
  - `/payments/paypal/onboarding-status/:merchantId/`
  - `/payments/paypal/create-payment/`
  - `/payments/paypal/capture-auth-payment/`

## Key files and directories
- RG-Frontend/src/components/PaymentModule/PaymentDialog.tsx
- RG-Frontend/src/pages/api/paypal/callback.js
- RG-Frontend/src/pages/payment-method/paypal/index.tsx

## Tests
- Not found in repo. Search evidence: `rg -n "paypal" -g '*test*' Lumy-Backend RG-Frontend` (0 matches)

## Config / env
- Lumy-Backend/lumy_global/settings.py
- RG-Frontend/src/store/axiosInstance.ts

## Known risks / open questions
- Not found in repo. Search evidence: `rg -n "Open Questions|Risks" ContextFiles/HumanDocuments/Features/_extracted/PayPal Integration Questions.txt` (0 matches)

## Source docs
- ContextFiles/HumanDocuments/Features/_extracted/PayPal Integration Questions.txt
