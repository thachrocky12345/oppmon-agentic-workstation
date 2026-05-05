# Feature: Talk Now

## Overview
Listed as a public-facing feature. Likely enables immediate or near-immediate booking with available providers.

## Current state (repo)
- Menu entry exists in `RG-Frontend/src/utils/routes.ts` (`talk-now`).
- UI references in styles and mini-profile components (`RG-Frontend/src/styles/globals.css`, `RG-Frontend/src/containers/mini-profile/index.tsx`).
- No dedicated `talk-now` route or container identified.

## Missing pieces
- Clear product requirements (no BRD located).
- Route and UI behavior definition for talk-now flow.
- Backend logic to filter providers by immediate availability.

## Next steps
1. Define the Talk Now experience (criteria for availability, entry points).
2. Implement dedicated route or modal flow.
3. Integrate with availability and booking system.
