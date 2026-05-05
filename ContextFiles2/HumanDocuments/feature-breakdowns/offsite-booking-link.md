# Feature: Off-site Booking Link

## Overview
An off-site booking link provides a contained, single-provider booking flow that excludes marketplace navigation. It is optimized for provider-driven traffic and reduces friction on mobile.

## Why it exists
Providers want a lightweight, checkout-style booking experience for their external audiences without forcing users through the marketplace UI.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD – Off-site Booking Link.txt`
- Link launches a focused booking flow for a single provider.
- Client must authenticate and complete onboarding requirements.
- Payments required upfront; same calendar and availability logic.
- Bookings attributed to provider and qualify for reduced platform fee (same as direct link).
- Must work in mobile and in-app browsers.

## Current state (repo)
- Booking and checkout flows exist, but no off-site booking route identified.
- Attribution logic for reduced platform fees is not visible in repo.

## Missing pieces
- Off-site booking route and UI flow.
- Link generation and attribution metadata.
- Fee adjustment logic for off-site bookings.
- Analytics for conversion and usage.

## Next steps
1. Define link format and attribution flag.
2. Implement dedicated booking entry route with minimal navigation.
3. Ensure onboarding/auth requirements are enforced.
4. Apply reduced platform fee logic and track conversions.
