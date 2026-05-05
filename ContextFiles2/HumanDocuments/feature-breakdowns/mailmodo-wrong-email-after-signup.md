# Feature: Mailmodo Kicking Off Wrong Email After Signup

## Overview
Listed as a problem in the feature list. No BRD is provided, but likely refers to incorrect email journeys triggered after signup.

## Current state (repo)
- Signup flows exist in `RG-Frontend/src/containers/Authentication`.
- Mailmodo triggers are not explicitly visible in this repo.

## Missing pieces
- A clear mapping of current email triggers and incorrect journeys.
- Identification of event source and payload discrepancies.

## Next steps
1. Audit current signup events and Mailmodo triggers.
2. Identify incorrect mapping and correct the trigger logic.
3. Add monitoring for journey correctness post-fix.
