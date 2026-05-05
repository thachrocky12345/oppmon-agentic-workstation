# Feature: Client Account Creation - Mailmodo Triggers and Journeys

## Overview
Defines email trigger and journey logic for client account creation. The BRD itself only references a Loom video.

## Why it exists
Client onboarding communications must be accurate and sequenced correctly to reduce drop-off and confusion.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Client Account Creation - Mailmodo Triggers and Journeys.txt`
- Requirements exist only in the Loom; no written requirements in the file.

## Current state (repo)
- Email verification and signup flows exist in frontend.
- No explicit Mailmodo trigger configuration is present in this repo.

## Missing pieces
- Detailed trigger definitions from Loom.
- Mailmodo integration and journey definitions.
- QA plan for email timing and correctness.

## Next steps
1. Review Loom to extract trigger and journey requirements.
2. Map required triggers to current signup and verification flows.
3. Implement Mailmodo API calls and template IDs.
4. Add logging and monitoring for trigger success/failure.
