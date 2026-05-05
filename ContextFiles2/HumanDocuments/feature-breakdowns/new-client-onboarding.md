# Feature: New Client Onboarding (Primary + Sub-Accounts)

## Overview
Implements a primary account holder with sub-accounts for minors and dependent adults, ensuring HIPAA compliance and age-based booking restrictions. The BRD includes detailed user stories and acceptance criteria.

## Why it exists
Current onboarding only supports individual users, which blocks minors and dependent adults. Regulatory requirements require guardians to manage access and booking for licensed providers.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/RG_ New Client Onboarding.txt`
- Primary account holders can create and manage sub-accounts.
- PHI must remain segregated between profiles.
- Age validation and classification during onboarding.
- Underage users cannot book licensed providers without guardian info.
- Email verification via OTP for new accounts.
- Profile creation flows for self, child, family member, and client.

## Current state (repo)
- Profile switching and sub-profile concepts exist in frontend (`RG-Frontend/src/containers/top-header/index.tsx` shows profile switching logic).
- Client onboarding flows exist in `RG-Frontend/src/containers/Authentication`.
- Full compliance checks and guardian linkage are not clearly visible in backend models.

## Missing pieces
- Backend data model for primary/sub-account relationships with PHI segregation.
- Age-of-consent enforcement at booking time.
- Guardian details capture and validation pipeline.
- Audit/logging for compliance.

## Next steps
1. Validate existing profile/sub-profile schema and gaps.
2. Implement guardian linkage models and age-based restrictions in backend.
3. Update onboarding flows to enforce required guardian details.
4. Add booking-time enforcement for licensed providers.
5. QA with minors and dependent adult scenarios.
