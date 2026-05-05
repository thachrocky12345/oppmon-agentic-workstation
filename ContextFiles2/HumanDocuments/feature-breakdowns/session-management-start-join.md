# Feature: Improve Session Management Inside Portal (Start/Join Button)

## Overview
Listed without a BRD. Likely refers to improving the in-portal controls for starting or joining sessions.

## Current state (repo)
- Video session components exist under `RG-Frontend/src/containers/screens/ActiveVideoRoom/`.
- Appointment and session management UI exists but specific start/join UX changes are not defined.

## Missing pieces
- UX requirements for start/join button placement, timing, and status handling.
- Backend session state transitions tied to join/start actions.

## Next steps
1. Define desired UX and rules (when button appears, countdowns, late join handling).
2. Map to session state machine in backend.
3. Implement UI changes and QA with scheduled sessions.
