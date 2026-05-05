# Feature: Certn Additional Access Fees Automation

## Overview
Automates the monthly workflow for charging providers additional access fees reported by Certn. The system must ingest reports, notify providers with a 24-hour notice, and charge saved payment methods automatically.

## Why it exists
Manual processing is slow and error-prone. The platform must recover costs reliably while honoring provider pre-authorization and maintaining trust.

## Required behavior (BRD)
Source: `ContextFiles2/HumanDocuments/Features/_extracted/BRD - Certn Additional Access Fees Automation.txt`
- Import Certn access-fee reports (CSV or equivalent).
- Match rows to providers by email.
- Send 24-hour notice email via Mailmodo template.
- Charge each access fee as a separate Stripe off-session transaction.
- Calculate charge amount: fee + 10% surcharge.
- Do not charge if email fails.
- Log lifecycle: imported, notified, charged/failed; prevent duplicates.

## Current state (repo)
- No Certn access-fee ingestion code found in repo.
- Stripe flows exist for other payments, but no dedicated access-fee automation.
- Mailmodo integration references exist in other BRDs but not in code.

## Missing pieces
- Report ingestion pipeline and data model for access fee records.
- Mailmodo email trigger integration.
- Scheduler for 24-hour delayed charges.
- Stripe off-session charge workflow and logging.

## Next steps
1. Define schema for access-fee records and lifecycle status.
2. Implement report ingestion and matching by provider email.
3. Integrate Mailmodo template for notices.
4. Add delayed job for charging and Stripe off-session logic.
5. Build audit logging and failure handling.
