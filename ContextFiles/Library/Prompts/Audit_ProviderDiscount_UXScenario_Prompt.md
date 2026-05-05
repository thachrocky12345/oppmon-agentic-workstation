# Audit Prompt: RGDEV-186 — Provider-Funded Client Discount: Checkout Logic
## UX / Scenario / Commercial Audit

**Ticket**: RGDEV-186
**Feature**: Provider-Funded First-Session Client Discount
**Audit type**: UX correctness, scenario coverage, commercial accuracy
**Date generated**: 2026-03-14

---

## Context

A care provider can optionally enable a welcome discount (5%, 10%, or 15%) for new attributed clients. The provider funds the discount from their payout. The platform fee is calculated on the discounted session amount, not the full price. The discount applies automatically at checkout — no coupon code required. The discount is one-time: once the attributed client completes their first session, the discount flag must not apply again.

---

## Audit Areas

---

### 1. Checkout Display — Frontend Wiring

**Scenario**: An attributed client navigates to checkout for a $100 session. The provider has `attribution_discount_percent = 10`.

**Questions to answer**:

- Does the checkout page call `/attribution/checkout-status/` (or equivalent) to determine whether a discount applies before rendering the price summary?
- Does the checkout UI display all three price components: original price, discount amount (e.g. "Welcome discount: -$10"), and final charge ($90)?
- Is the discount label clearly attributed to the provider offer — not to a coupon or promo code input?
- If the API returns `discount_percent = null` or `is_first_attributed_session = false`, does the UI cleanly show the full price with no discount row visible?
- Is there a loading/error state if the checkout-status endpoint is slow or fails? Does the UI fall back to full price safely (no silent under-charge)?
- Locate the frontend component that renders the session price breakdown. Confirm it reads the discount fields from the API response and renders conditionally.
- Is there any frontend path where a client could bypass the discount check and be charged the wrong amount (e.g. cached state, deep-link to payment step)?

**Files to check**: checkout page component, session booking flow, payment summary component, API call to checkout-status endpoint.

---

### 2. Provider Revenue Impact and Earnings Breakdown

**Scenario**: $100 session, 10% provider discount. Math: discounted amount = $90. Platform fee = 12% of $90 = $10.80. Provider receives $90 - $10.80 = $79.20.

**Questions to answer**:

- Does the provider's earnings statement (session detail view or payout breakdown) show a line item for the welcome discount they offered? Expected: "Welcome discount offered: -$10.00" before platform fee is applied.
- Is the platform fee calculation applied to the discounted amount ($90) rather than the original session price ($100)? Confirm this in the payment/stripe integration layer.
- If the provider views their earnings history, can they see which specific sessions had a discount applied?
- Is there any risk of the provider being shown an incorrect net payout if the discount calculation happens client-side vs server-side?
- Does the earnings summary for a period correctly aggregate discount-funded amounts separately so the provider can see their total voluntary discount spend for the month?
- What happens if a provider disputes a payout — is there a server-side record that unambiguously shows the discount was provider-configured and provider-funded?

**Files to check**: earnings/payout view, stripe integration payout calculation, session financial record model.

---

### 3. Discount Enablement Flow — Provider Dashboard UX

**Scenario**: A provider wants to enable a 10% first-session discount for new attributed clients.

**Questions to answer**:

- Where in the provider dashboard is the discount setting located? Is it under "Referral settings", "Attribution settings", or a dedicated "Client welcome offer" section?
- What is the UI control for `attribution_discount_percent`? Is it a dropdown (None / 5% / 10% / 15%), radio buttons, or a free-entry field? If free-entry, is there validation to constrain to allowed values?
- Is there a confirmation step or warning shown when the provider enables the discount, explaining the revenue impact ("You will receive $X less per first session for attributed clients")?
- Can the provider set `attribution_discount_percent = None` (disable discount) after previously enabling it?
- If a provider changes the discount percentage while attributed clients exist who have not yet booked, is there any warning that the change will affect pending attributed clients?
- Is the field label and help text on the dashboard accurate? Does it explain "this discount is funded from your payout" clearly?
- Is the save/update action on this field protected against concurrent edits (e.g. two browser tabs saving at the same time)?

**Files to check**: provider settings page, attribution settings component, `attribution_discount_percent` field on provider profile model and serializer.

---

### 4. Post-Cancellation Discount Reset Logic

**Scenario timeline**:
- Day 1: Client books a discounted session. `first_session_discount_applied = False` (not yet used).
- Day 2: Session is cancelled before it occurs.
- BRD states: cancellation before session occurs → reset discount eligibility so the client can receive the discount on their next booking.
- Day 3: Client re-books.

**Questions to answer**:

- When a session is cancelled before it occurs, does the system reset `first_session_discount_applied` back to `False` on the attribution token?
- Is "cancelled before it occurs" evaluated by session date/time, or by some status field? What happens if a session is cancelled the same day it was scheduled?
- On Day 3 re-booking, does the checkout correctly detect the discount is still available (flag = False) and apply it?
- If the cancellation reset logic runs asynchronously (e.g. via a background task or signal), is there a race condition window where the client could reach checkout between cancellation and reset completing?
- What if the provider cancels the session vs. the client cancels — does the reset logic apply in both cases?
- Is the cancellation-reset logic covered by a test case that asserts: cancel → re-book → discount still applies?

**Files to check**: cancellation handler/view, attribution token model, signal or post-save hook for appointment cancellation, test cases for discount reset.

---

### 5. Partial Refund Scenario — Discount Flag Preservation

**Scenario**: Session occurs on Day 1. On Day 5, a partial refund is issued (e.g. 50% refunded due to a complaint). BRD rule: only "fully refunded or cancelled before it occurs" resets the discount flag. A partial post-session refund should NOT reset `first_session_discount_applied`.

**Questions to answer**:

- Does the refund handler distinguish between full refund and partial refund?
- For a full refund issued after the session occurred, what is the expected behaviour — does the BRD say the discount should reset or not? Clarify the BRD rule for "fully refunded post-session" vs "cancelled before it occurs".
- For a partial refund, confirm `first_session_discount_applied` remains `True` — the session counts as having occurred.
- Is there a test case specifically for partial refund that asserts the discount flag is not reset?
- If the Stripe webhook triggers a refund event, which code path handles it, and does that code path have access to the attribution token to correctly preserve the flag?

**Files to check**: stripe webhook handler, refund processing view, attribution token update logic, test cases for refund scenarios.

---

### 6. Provider Changes Discount Percentage Mid-Window

**Scenario**: Provider has `attribution_discount_percent = 10`. A client has been attributed and has a CONFIRMED token with `first_session_discount_applied = False`. Provider changes their setting to `attribution_discount_percent = 5`. Client now reaches checkout.

**Questions to answer**:

- Which discount value applies at checkout: the current provider setting (5%) or the value at the time the attribution token was created (10%)?
- Is the discount percentage stored on the attribution token itself at creation time (snapshotted), or is it always read dynamically from the provider profile at checkout?
- What does the BRD specify for this case? Confirm alignment between BRD intent and implementation.
- If the discount is read dynamically, a provider could reduce their discount obligation retroactively — is this the intended behaviour or a commercial risk?
- If the discount is snapshotted on the token, confirm the token creation logic writes the current `attribution_discount_percent` to the token at creation time.
- Is there a test case that asserts: token created at 10%, provider changes to 5%, checkout returns the expected discount value?

**Files to check**: attribution token model (fields), token creation logic, `get_checkout_discount()` function, BRD spec for discount locking.

---

### 7. No Discount Configured — Clean Neutral State

**Scenario**: Provider has `attribution_discount_percent = None`. Client is attributed to this provider. Client reaches checkout.

**Questions to answer**:

- Does the checkout API return `discount_percent = null` and `is_first_attributed_session = false` (or equivalent clean zero-discount signal)?
- Does the checkout UI render a completely clean price summary — no "You saved $0", no empty discount row, no mention of a discount?
- Is `None` vs `0` handled consistently? If the field can be either `None` or `0` to mean "no discount", does the frontend handle both without rendering a discount row?
- Is there a test case for the no-discount path that asserts: attributed client, no discount configured, checkout shows full price, no discount line item?

**Files to check**: checkout-status API view, frontend checkout price breakdown component, attribution token serializer.

---

### 8. Concurrent Checkouts — Locking and Scalability

**Scenario**: 50 attributed clients all reach checkout at the same time. Each must receive the discount exactly once. `select_for_update()` is used in `get_checkout_discount()`.

**Questions to answer**:

- Is the `select_for_update()` applied at the individual attribution token row level (row-level lock) or does it escalate to a broader table-level lock?
- PostgreSQL should handle row-level locking per token — confirm the query locks only the specific token row, not all tokens for a provider.
- What is the lock contention risk if 50 clients attributed to the same provider checkout simultaneously? Are they all locking different rows (their own tokens) or competing for the same lock?
- Is there a `select_for_update(nowait=True)` or timeout configured to prevent indefinite blocking if a lock is held?
- Under load, could the discount be applied twice to the same client? Is there a unique constraint or atomic check-and-set that prevents double-application?
- Is there a test or load simulation that validates the idempotency of `get_checkout_discount()` under concurrent calls for the same token?

**Files to check**: `get_checkout_discount()` implementation, attribution token queryset, database transaction boundaries, any existing load/concurrency tests.

---

### 9. Non-Attributed Client — Discount Isolation

**Scenario**: A client who is not attributed to any provider (or is attributed to a different provider) calls `/attribution/checkout-status/` for a provider who has `attribution_discount_percent = 10`.

**Questions to answer**:

- Does the endpoint return `discount_percent = null` and `is_first_attributed_session = false` for a non-attributed client?
- Is the attribution check scoped to the specific (client, provider) pair — not just "this client has any attribution" or "this provider has a discount"?
- Could a non-attributed client receive the discount if they somehow pass a valid provider ID in the request?
- Is the endpoint authenticated and does it validate that the requesting user matches the client in the query?
- What if a client is attributed to Provider A but is booking with Provider B who also has a discount — do they incorrectly receive Provider B's discount?
- Is there a test case for each of: (a) non-attributed client, (b) attributed to different provider, (c) correct (client, provider) pair?

**Files to check**: `/attribution/checkout-status/` view, permission classes, attribution lookup query, test cases for cross-provider isolation.

---

### 10. Finance Reporting — Audit Trail and Dispute Resolution

**Scenario**: End of month. Finance team runs provider payout statements. A provider disputes: "I never authorized a discount for client X."

**Questions to answer**:

- Is `discount_amount` (the dollar value of the discount applied) stored on a session, payment, or attribution record at the time of checkout? A percentage alone is insufficient for reporting.
- Is there a queryable record that shows: provider ID, client ID, session ID, discount_percent applied, discount_amount in dollars, date applied?
- Can the finance team run a monthly report grouped by provider showing total discount spend funded by each provider?
- Is the provider's consent to the discount recorded (e.g. timestamp of when they configured `attribution_discount_percent` plus the value they set)?
- In a dispute, could the provider claim the discount was applied without their knowledge? Is the audit trail strong enough to show: provider set X%, client was attributed, discount was applied at checkout?
- Are discount events logged anywhere beyond the database (e.g. Stripe metadata, internal audit log)?
- Is there a Django admin view or management command that lets finance export discount usage per provider per period?

**Files to check**: session/appointment financial model, Stripe payment intent metadata, attribution token model (stored discount fields), admin views, any reporting/export utilities.

---

## Execution Instructions

For each audit area:

1. **Locate the relevant code**: Start with the backend view/serializer/model named in "Files to check", then trace to the frontend component that consumes the response.
2. **Confirm or refute each question**: Use direct evidence from code — quote the relevant function, field, or conditional. Do not infer from intent alone.
3. **Flag gaps**: If a question cannot be answered because the code path does not exist, state it as a gap explicitly.
4. **Rate severity**: For each gap found, assign: Critical (breaks commerce or double-charges) / High (incorrect UX or revenue reporting error) / Medium (missing edge case test) / Low (cosmetic or minor).
5. **Recommend fix**: One concrete sentence per gap describing the minimum required change.

---

## Output Format

Produce a structured report with one section per audit area (1–10). Each section must include:

- **Verdict**: Pass / Fail / Partial / Not Implemented
- **Evidence**: File path(s) and quoted code or field names that support the verdict
- **Gaps found**: Numbered list (or "None")
- **Severity**: Per gap
- **Recommended fix**: Per gap

Append a **Summary Table** at the end:

| Area | Verdict | Gap Count | Highest Severity |
|------|---------|-----------|-----------------|
| 1. Checkout display | | | |
| 2. Provider revenue impact | | | |
| 3. Discount enablement flow | | | |
| 4. Post-cancellation reset | | | |
| 5. Partial refund | | | |
| 6. Mid-window % change | | | |
| 7. No discount configured | | | |
| 8. Concurrent checkouts | | | |
| 9. Non-attributed client | | | |
| 10. Finance reporting | | | |
