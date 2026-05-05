# UX / Scenario / Commercial Audit Prompt
## RGDEV-185: Fraud & Gaming Guardrails — Attribution System

**Ticket context**: RGDEV-185 prevents care providers from retroactively reclassifying existing client relationships to obtain the lower 12% external attribution fee instead of the standard 15% platform fee. The core mechanism is a `has_prior_booking()` check that fires when an attribution token is claimed. If the client already has any appointment history with the provider, the token is marked INELIGIBLE and the 15% fee applies.

Use this prompt to audit the implementation across UX, scenario coverage, commercial logic, and operational gaps before shipping.

---

## Scenario 1 — Primary Gaming Vector: Mass Email to Existing Clients

**Setup**: A provider has 50 existing clients. They send a bulk email containing their external profile link (which carries their attribution token). Each of the 50 clients clicks the link.

**Questions to answer**:

1. Does `has_prior_booking()` fire for each client at the moment the attribution token is claimed, or only at checkout?
2. Which appointment statuses are included in the booking history check? Confirm the query covers ALL of:
   - `COMPLETED` — session that finished normally
   - `UPCOMING` / `SCHEDULED` — future booked session
   - `CANCELLED` — client or provider cancelled
   - `NO_SHOW` — client did not attend
   - Any platform-specific status variants (e.g., `PENDING`, `IN_PROGRESS`, `REFUNDED`)
3. Is there a status that could be exploited — e.g., if a provider cancels all appointments for a client before sending the link, does the client then appear as "new"?
4. If 50 clients all claim the same provider's attribution link, is there any rate-limiting or bulk-claim detection?
5. What is the exact database query powering `has_prior_booking()`? Does it join on `client_id + provider_id`, or is there a looser match that could produce false negatives?
6. If a provider has multiple staff accounts under one practice, does a booking with staff member A count as a prior booking for staff member B's attribution link?

**Expected outcome**: All 50 tokens are marked INELIGIBLE. The provider earns 15% on any future sessions with those clients.

**Pass criteria**: Manually verify with a fixture containing one provider, one existing client with each appointment status variant, and assert INELIGIBLE for all.

---

## Scenario 2 — Talk Now / On-Demand Session History Gap

**Setup**: A provider and client had a Talk Now (on-demand, unscheduled) session two years ago. They have had no scheduled appointments since. The client clicks the provider's external profile link today.

**Questions to answer**:

1. Are Talk Now sessions stored as `Appointment` records in the `calendar_functionality` app, or in a separate model (e.g., in `video_conferencing` or a dedicated `TalkNow` model)?
2. Does `has_prior_booking()` query only the `Appointment` table, or does it also query Talk Now session records?
3. If Talk Now sessions live in a separate table, is there a second check — or does the guardrail have a blind spot for all on-demand sessions?
4. What is the data retention policy for Talk Now records? Could a two-year-old session have been purged, making the client appear new?
5. If Talk Now is out of scope for MVP, document the residual risk: a provider could direct existing Talk Now clients to their external link and obtain the 12% rate. What is the estimated commercial exposure?

**Expected outcome**: Any prior Talk Now session should trigger INELIGIBLE, not just scheduled appointments. If Talk Now is excluded from the check, this must be a documented, accepted risk with a remediation milestone.

---

## Scenario 3 — Genuine New Client False Positive

**Setup**: A client has never used the platform before. They discover a provider via an external blog post, click the provider's attribution link, register, and book.

**Questions to answer**:

1. Under what conditions could `has_prior_booking()` return `True` for a brand-new user who has never booked anything?
2. Could a data migration, import, or admin backfill have created appointment records for a user before they self-registered?
3. If a client previously used the platform under a different email address, then re-registers with a new email, do they appear as a new client? Is identity deduplication performed before the booking history check?
4. Could a deleted or anonymised historical appointment leave a residual FK reference that still satisfies the booking history query?
5. Is there a test covering the base case: new user, zero appointments, external link click → ELIGIBLE?

**Expected outcome**: Zero false positives. A genuine new client always receives attribution and is charged 12% at checkout.

---

## Scenario 4 — Concurrent Registration + Attribution Race Condition

**Setup**: A new client clicks an external profile link. They are redirected to the signup page. In the same HTTP request cycle or within milliseconds of account creation, the frontend calls the attribution track endpoint (`/attribution/track/`) with the token.

**Questions to answer**:

1. At the moment `/attribution/track/` is called for a brand-new user, is it guaranteed that their `User` record exists in the database with a committed transaction?
2. Could the attribution endpoint be called before the user row is committed (optimistic pre-call from the frontend), causing a lookup failure or a default-to-ELIGIBLE result?
3. Is `has_prior_booking()` evaluated at token claim time (when `/attribution/track/` is called) or deferred to checkout? If deferred, is there a TOCTOU window?
4. If the attribution endpoint receives a user ID that does not yet exist in the database, what is the failure mode — exception, silent drop, or default ELIGIBLE?
5. Is the attribution token claim idempotent? If the frontend calls `/attribution/track/` twice (e.g., due to a retry), does the second call overwrite the first result?

**Expected outcome**: For a brand-new user, `has_prior_booking()` always returns False. The token is marked ELIGIBLE. No race condition can produce a spurious INELIGIBLE result for a new user, nor can it allow an existing client to slip through as ELIGIBLE.

---

## Scenario 5 — Provider Re-Registration Attack

**Setup**: A provider deactivates (or is banned from) their account and creates a new provider account. Their historical clients click the new account's external attribution link.

**Questions to answer**:

1. The booking history check is `has_prior_booking(client, new_provider_account)`. The new account has zero appointment history. Does the check return False for all existing clients of the old account, marking their tokens as ELIGIBLE?
2. Is there any cross-account identity linking that would detect "this is the same practitioner under a different account"?
3. If re-registration exploits the guardrail, what is the commercial impact per incident? (A provider with 50 clients would save ~3% on all future sessions = potentially thousands of dollars per year.)
4. Is account deactivation/re-registration rate-limited or flagged for manual review?
5. For MVP: is this attack vector an accepted residual risk? If so, document it with a severity rating and a proposed detection mechanism (e.g., same licence number, same phone number, same bank account on Stripe).

**Expected outcome (MVP acceptance criteria)**: Either (a) the check is cross-account-aware and blocks re-registration attacks, or (b) the risk is formally documented as accepted with a named owner and a remediation milestone.

---

## Scenario 6 — Internal Navigation Attribution Bypass

**Setup**: The BRD states that internal navigation (a client browsing the platform within the app) must never create attribution — only clicks from external links should qualify. A technically sophisticated user discovers the `/attribution/track/` endpoint and POSTs to it directly with a provider token, having never clicked an external link.

**Questions to answer**:

1. Is the "internal vs external" distinction enforced server-side (e.g., checking the `Referer` or `Origin` header), or is it enforced only by the frontend not calling the endpoint when the user is already logged in and browsing internally?
2. If enforcement is frontend-only, a direct POST to `/attribution/track/` from Postman, curl, or a browser console bypasses the control entirely. Is this an accepted risk?
3. Does the endpoint require authentication? If not, can an unauthenticated actor pre-seed attribution tokens before a client registers?
4. If `Referer` checking is used: what is the behaviour when `Referer` is absent (e.g., privacy-preserving browsers, link shorteners, email clients)? Does an absent Referer default to ELIGIBLE or INELIGIBLE?
5. Is there a test that POSTs directly to `/attribution/track/` from an "internal" context and asserts rejection?

**Expected outcome**: Attribution creation is either server-side enforced (preferred) or the bypass risk is documented. If frontend-only, a follow-up ticket must exist to add server-side validation.

---

## Scenario 7 — INELIGIBLE Status UX at Checkout

**Setup**: A client who has been blocked (token marked INELIGIBLE) proceeds through the booking flow for the same provider. They reach the checkout screen.

**Questions to answer**:

1. What does the client see at checkout? Is the fee displayed as 15% without any explanation, or is there a message?
2. Is the provider informed that their attribution attempt was blocked? Do they receive any notification?
3. Does the booking flow behave differently in any way for an INELIGIBLE token vs no token at all? If the UX is identical, this is correct — but confirm it is intentional.
4. If the client abandons the booking after seeing the standard fee (having expected a discounted rate due to provider communication), is there any support pathway documented?
5. On the provider portal, is there any dashboard visibility into how many attribution attempts were blocked as INELIGIBLE? Providers should not be able to see which clients were blocked (privacy), but aggregate counts may be reasonable.
6. Is there any scenario where the INELIGIBLE status leaks information to the provider — e.g., a webhook or email that reveals the client attempted to use the link?

**Expected outcome**: The checkout UX is fee-transparent, does not reveal the INELIGIBLE block to either party beyond standard pricing, and does not create a confusing or broken-looking flow.

---

## Scenario 8 — Fraud Logger Alerting and Operational Visibility

**Setup**: The implementation logs INELIGIBLE blocks to the `attribution.fraud` Python logger.

**Questions to answer**:

1. Where does the `attribution.fraud` logger output go in production? Is it a file, stdout, a log aggregator (e.g., Datadog, CloudWatch, Sentry)?
2. Is anyone actively monitoring this log stream? Is there a named team or rotation responsible?
3. Is there an alert configured for:
   - A single provider generating more than N INELIGIBLE blocks in a 24-hour window (potential mass email campaign)?
   - A spike in INELIGIBLE blocks platform-wide (potential coordinated gaming)?
4. What is the current baseline INELIGIBLE rate expected at launch? Without a baseline, spike detection is not possible.
5. Are INELIGIBLE events persisted to the database (not just logged), so they can be queried for retrospective auditing and potential fee recovery?
6. What is the incident response process if a coordinated gaming campaign is detected? Is there a documented runbook?

**Expected outcome**: The fraud logger feeds a monitored channel. Alerts exist for per-provider and platform-wide spikes. Events are persisted. A runbook exists or is planned.

---

## Scenario 9 — Commission Gaming by Client (Multi-Account Attack)

**Setup**: A sophisticated client deliberately creates a separate platform account for each provider they want to book, ensuring they always appear as a "new client" for attribution purposes. This gives every provider the incentive to share their external link with this client, and the client potentially receives some benefit (e.g., if providers offer discounts for external-link bookings, or if fee savings are passed on).

**Questions to answer**:

1. Is this attack in scope for RGDEV-185 MVP? If not, document it explicitly as out of scope.
2. What is the client-side benefit of appearing as a new client? Does the client receive any financial incentive, or is the benefit solely to the provider (lower fee)?
3. If the benefit is provider-only, the client has no direct incentive to multi-account. Is this assessment correct per the current fee structure?
4. Are there any platform controls that would incidentally catch multi-accounting (e.g., Stripe customer deduplication by card fingerprint, phone number verification via Twilio Verify, Certn identity checks)?
5. If multi-accounting is caught at the identity verification layer, does that check run before or after attribution is resolved?

**Expected outcome**: Multi-account gaming is either in scope (with a detection mechanism) or explicitly out of scope for MVP with a documented rationale. The fee structure analysis should confirm whether clients have a direct financial incentive.

---

## Scenario 10 — INELIGIBLE Token Re-evaluation After Appointment Deletion

**Setup**: A client's attribution token was correctly marked INELIGIBLE because they had an existing appointment with the provider. An admin later deletes that appointment from the system (e.g., due to a data correction or dispute resolution). The underlying condition that triggered INELIGIBLE no longer exists.

**Questions to answer**:

1. Is the INELIGIBLE status stored on the token record as a static field, or is it re-evaluated dynamically on each booking attempt?
2. If static: is there any cleanup job or post-delete signal that re-evaluates affected attribution tokens?
3. If the appointment is soft-deleted rather than hard-deleted, does `has_prior_booking()` filter on `deleted=False`? Could a soft-delete cause a previously INELIGIBLE token to become ELIGIBLE?
4. What is the admin workflow for handling a dispute where a client claims they should be eligible for the lower fee? Is there a manual override capability on the token?
5. Should the INELIGIBLE status ever be reversed? If yes, who can authorise it and what is the audit trail?
6. Is there any cascade behaviour — e.g., if an appointment is deleted, does the system automatically reverse any fee adjustments already applied to completed sessions?

**Expected outcome**: The re-evaluation behaviour is explicitly designed (not accidental). Either INELIGIBLE is immutable after first evaluation (simpler, more robust), or a re-evaluation pathway exists with proper access controls and audit logging.

---

## Audit Deliverables

For each scenario above, the audit should produce:

| Field | Content |
|---|---|
| **Status** | PASS / FAIL / PARTIAL / OUT OF SCOPE |
| **Evidence** | Code path, test name, or migration reference that confirms behaviour |
| **Residual risk** | Any gap not addressed in MVP, with severity (LOW / MEDIUM / HIGH / CRITICAL) |
| **Remediation** | Ticket reference or acceptance statement if risk is accepted |

---

## Reference: Key Implementation Files to Inspect

When running this audit, locate and review the following (paths are indicative — confirm actuals in the codebase):

- `has_prior_booking()` implementation — check which models and statuses it queries
- `/attribution/track/` view — check authentication, idempotency, internal/external enforcement
- Attribution token model — check status field, immutability, timestamps
- `attribution.fraud` logger configuration — check `LOGGING` dict in `settings.py`
- Any post-save/post-delete signals on `Appointment` that touch attribution records
- Talk Now session model — confirm whether it is queried by `has_prior_booking()`
- Fee calculation logic at checkout — confirm INELIGIBLE tokens default to 15%
