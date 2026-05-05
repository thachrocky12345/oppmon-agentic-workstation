# Feature: U.S. Booking Location Confirmation

## Overview
Adds a checkout-only attestation step for clients booking U.S. licensed providers to confirm they are physically located in the correct state at the time of the session.

## Why it exists
Telehealth licensing is state-based in the U.S. The platform must ensure legal compliance by confirming the client's physical location aligns with the provider's license.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - U.S. Booking Location Confirmation.txt`
- Attestation appears at checkout only.
- Applies to U.S.-licensed providers.
- Client must confirm their current state matches the booking state.
- Does not change search results or navigation visibility.
- Must be clearly placed relative to existing banners and UI.

## Current state (repo)
- No explicit booking-location attestation UI or backend checks found in codebase.
- Booking flows exist in `RG-Frontend/src/components/Popup` and scheduling containers, but no dedicated attestation logic is visible.

## Missing pieces
- Attestation UI at checkout.
- Validation logic to block booking when state does not match.
- Audit trail or logging for compliance confirmation.

## Next steps
1. Locate booking checkout flow and insert attestation step.
2. Add backend validation to enforce confirmation for U.S. licensed providers.
3. Log attestation with booking record for compliance.
4. QA with U.S. provider scenarios and non-U.S. providers.
