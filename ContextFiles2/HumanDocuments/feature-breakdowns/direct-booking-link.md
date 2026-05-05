# Feature: Direct Booking Link

## Overview
Allows providers to generate a direct booking link that sends clients into a focused booking flow for that provider, preserving attribution and reducing friction.

## Why it exists
Providers drive traffic to their own profiles. A direct link improves conversion by bypassing search and matching steps.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD – Direct Booking Link.txt`
- Providers can generate a shareable direct booking link.
- Link takes clients directly into booking for that provider.
- Bookings remain attributed to the provider and qualify for reduced platform fees.

## Current state (repo)
- Booking flows exist in frontend and backend (appointments, scheduling), but no direct-link generator found.
- Routing for provider profiles exists (`RG-Frontend/src/pages/[...slug].tsx`).

## Missing pieces
- Link generation and storage for providers.
- Attribution logic to apply reduced platform fees.
- Dedicated booking entry route for direct links.

## Next steps
1. Define link structure and attribution metadata.
2. Add provider UI to create/manage links.
3. Implement direct-link routing into booking flow.
4. Apply fee reduction and tracking for direct-link bookings.
