# Feature: Therapy and Support Groups

## Overview
Introduces group sessions as bookable inventory surfaced as two navigation entry points: Therapy Groups and Support Groups. Providers can publish group events with capacity so multiple clients can book the same slot.

## Why it exists
Group sessions expand access and affordability for clients while increasing scalable revenue for providers.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Therapy Groups & Support Groups.txt`
- Two distinct navigation entry points: Therapy Groups (licensed providers only) and Support Groups (all providers).
- Providers can create group sessions with capacity and schedule.
- Clients can discover and book group sessions through navigation.

## Current state (repo)
- Navigation includes `therapy-groups` and `support-groups` in `RG-Frontend/src/utils/routes.ts`.
- No group-session models or booking flows are visible in inspected backend code.

## Missing pieces
- Data model for group sessions (capacity, schedule, pricing).
- Provider creation workflow for group sessions.
- Client discovery and booking flow for groups.
- Eligibility enforcement (licensed vs all providers).

## Next steps
1. Define group session data model and capacity rules.
2. Implement provider UI for group creation.
3. Add discovery and booking flow for group sessions.
4. Enforce eligibility constraints for Therapy Groups.
