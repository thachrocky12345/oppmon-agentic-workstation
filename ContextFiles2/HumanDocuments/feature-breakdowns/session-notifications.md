# Feature: Session Notifications

## Overview
Adds or improves notifications around session lifecycle events (booking, reminders, changes, cancellations). The BRD includes detailed requirements.

## Why it exists
Clients and providers need timely, reliable communication around sessions to reduce missed appointments and confusion.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Session Notifications.txt`
- BRD content defines notification timing, channels, and templates (see file for details).

## Current state (repo)
- No dedicated session-notification module is obvious in frontend.
- Backend has appointment and calendar features that likely generate notifications, but the exact notification pipeline is not visible in the files inspected.

## Missing pieces
- Notification templates, triggers, and delivery channels (email/SMS/in-app).
- Scheduling logic for reminders.
- Admin controls for notification settings.

## Next steps
1. Review BRD to extract exact triggers and templates.
2. Locate current notification system (if any) and assess gaps.
3. Implement missing triggers and templates.
4. QA notification timing across booking lifecycle events.
