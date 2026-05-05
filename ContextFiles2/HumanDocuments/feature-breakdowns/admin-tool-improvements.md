# Feature: RG Admin Tool Improvements

## Overview
Adds two improvements to the isolated RG Admin Tool: copy/paste for login verification codes, and a manual action to grant verified badges when Certn fails.

## Why it exists
The Admin Tool is intentionally narrow and used only for rare operational fixes. Current UX makes login difficult, and there is no controlled path to resolve Certn verification failures.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - RG Admin Tool Improvements.txt`
- Allow pasting a full verification code into the login input.
- Add a manual "grant verified badge" action.
- Changes must be explicit, auditable, and limited to admin-only scope.

## Current state (repo)
- No RG Admin Tool code exists in this repo (tool runs on separate RGAdmin server).

## Missing pieces
- Admin tool codebase access (separate repo or server).
- UI changes for verification code input.
- Backend action to set provider verified status with audit logging.

## Next steps
1. Locate RGAdmin codebase or server and confirm tech stack.
2. Implement OTP paste handling in login UI.
3. Add verified badge override action with audit log.
4. QA with Certn failure scenarios.
