# Feature: Calendar Improvements

## Overview
Improves provider scheduling with recurring availability, multi-calendar sync (including Apple), longer sync horizons, session duration options, and buffer times. Also requires UX/UI modernization.

## Why it exists
Providers fall out of visibility because they cannot set recurring availability easily. Limited calendar sync and fixed 60-minute sessions reduce usability and bookability.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Calendar Improvements.txt`
- Recurring availability (weekly minimum) with overrides.
- Apple Calendar sync.
- Multiple calendar connections with per-calendar blocking toggles.
- Extend sync horizon to at least 6 months.
- Confirm and enforce visibility gating (providers visible only if availability within X days).
- Provider-defined session durations and buffer times.
- Modern, intuitive calendar UI.

## Current state (repo)
- Calendar and scheduling exist in `RG-Frontend/src/pages/cp-calendar/` and related containers.
- Backend calendar functionality in `Lumy-Backend/apps/calendar_functionality/`.
- Current UX likely lacks recurrence, Apple sync, and variable durations (per BRD).

## Missing pieces
- Recurrence rules for availability.
- Apple calendar OAuth and sync pipeline.
- Multi-calendar support with toggles.
- Extended sync horizon configuration.
- Session duration and buffer settings, stored per service.
- Visibility gating rules with reliable propagation.

## Next steps
1. Document current availability model and visibility gating logic.
2. Add recurring availability schema + UI.
3. Implement Apple calendar integration and multi-calendar sync.
4. Extend sync horizon and document it.
5. Add duration and buffer settings with booking-time enforcement.
6. Update calendar UI per Figma and Loom references.
