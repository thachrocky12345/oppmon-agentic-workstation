# UX / Scenario / Commercial Audit Prompt
## RGDEV-183: 60-Day Attribution Window Logic

**Ticket**: RGDEV-183
**Feature**: External attribution window — when a client visits a provider profile from outside the platform, a 60-day countdown begins. If the client books within that window, the provider is charged a reduced 12% platform fee instead of the standard 15%.
**Audit type**: UX, scenario, and commercial correctness
**Purpose**: Identify gaps in wiring, edge case handling, UX communication, and revenue impact before this logic reaches production.

---

## How to Use This Prompt

For each scenario below, investigate:
1. Whether the behavior is **actually implemented** (point to the relevant model, view, mutation, or frontend component).
2. Whether the **expected outcome** matches the **actual outcome** based on code inspection.
3. Whether there are **gaps, silent failures, or missing UX signals** that need to be addressed.
4. Whether the **commercial outcome** (12% vs 15%) is correctly applied and auditable.

Produce a findings table for each scenario with columns: **Scenario | Expected | Actual | Gap | Severity | Recommendation**.

---

## Scenario 1 — Happy Path

**Description**: Client encounters a provider's external link (e.g., shared on LinkedIn, a personal website, or a referral email). Client clicks the link, lands on the Really Global platform, registers or logs in, and books a session within 60 days of the first visit.

**Questions to answer**:
- What URL parameter or mechanism carries the attribution signal when the client clicks the external link? (e.g., a UTM param, a token in the URL, a provider slug)
- Which view or endpoint receives that signal? Is it `TrackAttributionView` or another handler?
- When is the `ProfileAttributionToken` record created? Immediately on page load? On authenticated request only?
- If the client registers a new account after clicking the link, is the attribution token linked to their new account automatically? How? (session, cookie, query param preserved through OAuth/registration flow?)
- Where in the booking flow is the attribution token checked and the 12% rate applied?
- Is the 12% rate reflected in the payment intent created via Stripe? Is it stored on the `Appointment` or `PaymentIntent` model?
- Confirm end-to-end: after booking, which field on which model marks the session as "attributed" at 12%?

**Acceptance criteria to verify**:
- [ ] Token created on external visit
- [ ] Token survives registration/login flow
- [ ] Booking within 60 days triggers 12% fee
- [ ] Fee stored correctly on the appointment/payment record
- [ ] No 15% fallback applied when attribution is valid

---

## Scenario 2 — Window Reset (Re-visit Resets Clock)

**Description**: Client visits a provider's external profile on Day 1 but does not book. Client visits the same external profile again on Day 45. Client books on Day 70. Relative to the Day 1 token, Day 70 is outside the 60-day window. But relative to the Day 45 re-visit, Day 70 is Day 25 — well within the window.

**Questions to answer**:
- Is window-reset behavior explicitly implemented? Search for any update logic on `ProfileAttributionToken` that refreshes `created_at` or sets a separate `last_visit_at` field.
- If the model uses `created_at` as the window start, is there a mechanism to update it on re-visit, or is the token immutable once created?
- Does a second external visit create a second token, or update the existing one? If two tokens exist, which one does the booking check use? (earliest? latest? any active?)
- If re-visit does NOT reset the window, is that the intentional business decision? Is it documented?
- What happens to the token state after Day 45: is its expiry still Day 61 (from first visit), or Day 105 (from second visit)?
- If the window reset is NOT wired up: flag this as a gap. A client who actively engages with a provider's external presence over weeks could lose attribution because they didn't book fast enough after the first click.

**Acceptance criteria to verify**:
- [ ] Second external visit either creates a new token or resets the expiry of the existing one
- [ ] Booking on Day 70 (after Day 45 re-visit) correctly resolves to 12% rate
- [ ] If reset is not implemented, confirm it is a deliberate product decision with documentation

---

## Scenario 3 — API Call Timing and Anonymous Visits

**Description**: The attribution must be recorded when the client visits the provider's profile page via the external link. But the client may not be authenticated at the moment of the visit.

**Questions to answer**:
- When exactly is `TrackAttributionView` (or equivalent) called? On page load? On explicit button click? On redirect?
- Does `TrackAttributionView` require an authenticated user (i.e., does it require a JWT Bearer token)? If yes, anonymous visits produce no server-side token — confirm this is understood.
- For an anonymous visitor (not logged in, not registered), what happens to the attribution signal? Is it stored in a browser cookie, localStorage, or session? Is the provider ID or attribution reference preserved through the registration flow?
- If attribution is only recorded post-login, is there any mechanism to backfill when the user later authenticates? (e.g., "on login, check for a pending attribution cookie and create the token")
- What is the failure mode: if the attribution signal is lost during registration, the client registers, books, and pays 15% — the provider misses their attribution discount. Is this a known and accepted limitation?
- Check the frontend: after clicking an external link, does the URL contain any parameter (e.g., `?ref=<provider_id>` or `?attr=<token>`) that the frontend preserves through the auth redirect?

**Acceptance criteria to verify**:
- [ ] Attribution signal is not silently lost during anonymous-to-authenticated transition
- [ ] Either: (a) token is created post-login using a preserved parameter, or (b) anonymous attribution via cookie/session is explicitly handled
- [ ] Failure mode (lost attribution) is documented if it is accepted

---

## Scenario 4 — Attribution Persistence: Cookie vs Server Token

**Description**: The server-side `ProfileAttributionToken` model provides the authoritative record of attribution. But the client may arrive anonymously. There needs to be a bridge between the anonymous visit and the eventual authenticated account.

**Questions to answer**:
- Is there a client-side mechanism (cookie, `localStorage`, query param) that stores the provider ID or an attribution reference at the moment of the external visit?
- If yes: what is its name, TTL, and where in the frontend codebase is it written and read?
- On registration or login, does any frontend or backend logic check for this client-side signal and create the server-side `ProfileAttributionToken`?
- If the client logs in on a different device (e.g., clicked on mobile, registered on desktop), is attribution lost? Is cross-device attribution in scope?
- Is the server-side token tied to `user_id` or `email`? If email, could pre-registration attribution be theoretically created on the backend when the email is known?
- Are there any race conditions: e.g., client visits externally, immediately registers in the same session — does the attribution fire before the user object exists?

**Acceptance criteria to verify**:
- [ ] Client-side attribution bridge (cookie or param) is implemented or explicitly out of scope
- [ ] On authentication, the bridge is consumed and a server-side token is created
- [ ] Cross-device gap is documented
- [ ] No race conditions in token creation during registration

---

## Scenario 5 — Provider Dashboard Visibility

**Description**: Providers are incentivized to market externally because they benefit from the 12% rate. They need visibility into which clients came through external attribution and the status of active windows.

**Questions to answer**:
- Is there any provider-facing UI showing active `ProfileAttributionToken` records? (e.g., "3 clients are in your 60-day attribution window")
- Does the provider see a breakdown on their earnings/sessions dashboard showing which bookings were attributed (12%) vs standard (15%)?
- If a client is in the attribution window but has not booked yet, can the provider see that as a warm lead?
- If attribution dashboard views do not exist: is this a planned future feature or a gap? What is the provider's product experience when their external marketing works?
- Check the GraphQL schema and REST endpoints: are there any `attribution` or `token` fields exposed on provider-facing queries?

**Acceptance criteria to verify**:
- [ ] Provider can see active attribution windows (or this is explicitly deferred)
- [ ] Provider can see which bookings were attributed at 12% vs 15%
- [ ] If neither exists, flag as gap with severity based on provider trust/transparency obligations

---

## Scenario 6 — Client Discount Display at Checkout

**Description**: When a client books a session with a provider they visited externally, they are subject to a different fee structure. The question is whether the client understands why their rate might differ.

**Questions to answer**:
- At the checkout/payment step, is there any UI message informing the client that they are receiving a special rate because of external attribution? (e.g., "You discovered Dr. Smith outside the platform — you're getting a special rate")
- If the reduced fee means the session is cheaper for the client: is the session price actually lower, or does the 12% vs 15% only affect the provider's net payout and the client always pays the same gross session price?
- Clarify the fee model: is the platform fee taken from the provider's earnings (client pays full rate, provider gets 88% vs 85%), or is there a client-facing discount?
- If the client always pays the same price regardless of attribution: no UX message is needed for the client. Confirm this is the case.
- If there IS a client-facing price difference: is it displayed clearly in the session card, booking summary, and Stripe payment intent?

**Acceptance criteria to verify**:
- [ ] Fee model is clarified: provider-side fee reduction vs client-facing price change
- [ ] If client-facing: checkout UI reflects the correct price and explains the attribution benefit
- [ ] If provider-side only: no misleading messaging is shown to the client

---

## Scenario 7 — Day 61 Edge Case and Client Communication

**Description**: A client visits a provider's external profile on Day 1. They intend to book but delay. They attempt to book on Day 61. The attribution window has expired. They are charged the standard 15% fee structure.

**Questions to answer**:
- Is Day 61 handled correctly? Is the window check `< 60 days` or `<= 60 days`? Is Day 60 the last valid day (inclusive)?
- At the moment of booking on Day 61, is there any UX signal to the client (or provider) that the attribution window has expired?
- If the client was expecting a special rate (because they were told the window was 60 days), and they book on Day 61, is there any recourse or grace period?
- Is the expiry of the token a hard cut-off or a soft warning? Does it transition through states (e.g., `active` → `expiring_soon` → `expired`)?
- Could a client feel misled if they delay their booking by one day past the window? What is the handling for near-expiry scenarios?
- Are expired tokens cleaned up or retained for audit purposes?

**Acceptance criteria to verify**:
- [ ] Window boundary is explicitly tested (Day 59, Day 60, Day 61)
- [ ] Expired tokens are retained for audit, not deleted
- [ ] Near-expiry UX warning is implemented or explicitly out of scope
- [ ] Boundary condition is documented (inclusive vs exclusive)

---

## Scenario 8 — Multi-Provider Attribution

**Description**: A client discovers three different providers externally over the course of two weeks. All three providers share their profile links. The client accumulates three active `ProfileAttributionToken` records. Eventually the client books only one of the three providers.

**Questions to answer**:
- Is multi-provider attribution explicitly supported in the data model? Can one client have N active tokens for N different providers simultaneously?
- When the client books provider B, does the booking logic correctly identify the token for provider B specifically (not provider A or C)?
- After the booking, what is the state of providers A and C's tokens? Do they remain active until expiry? Are they voided?
- Is the `has_prior_booking` check per provider (i.e., "has this client ever booked with this specific provider") or global (i.e., "has this client ever booked anyone on the platform")? If global, first-time clients on the platform who visit multiple providers externally and then book one would lose attribution for subsequent providers.
- What is the intended behavior when a client later books provider A (still within the window)? Should provider A also get the 12% rate?

**Acceptance criteria to verify**:
- [ ] Data model supports N concurrent attribution tokens per client
- [ ] Booking resolution is per-provider, not global
- [ ] Tokens for unbooked providers expire naturally at 60 days
- [ ] Subsequent bookings with other attributed providers within their windows are handled correctly

---

## Scenario 9 — Revenue Impact and Business Caps

**Description**: If adoption of external marketing is high, a significant share of bookings could shift from 15% to 12% platform fee. This is a 20% reduction in platform fee revenue per attributed booking.

**Questions to answer**:
- Is there any cap on the number of attributed bookings per provider per period? (e.g., "first 10 attributed clients per month get 12%")
- Is there any cap on the total % of platform revenue that can be shifted to the 12% tier?
- What is the current baseline: how many providers are actively sharing external links? What % of new client registrations come via external attribution today (if tracking exists)?
- Model the revenue scenario: if 30% of bookings become attributed at 12%, what is the gross revenue impact vs 100% at 15%?
- Is the 12% fee intended to be a permanent discount or an introductory/trial incentive?
- Is there a mechanism to audit attribution volume per provider to detect gaming (e.g., a provider who generates enormous attributed volume through mass email campaigns)?

**Acceptance criteria to verify**:
- [ ] Revenue impact has been modeled and accepted by product/finance
- [ ] No hard cap exists in code (or a cap is intentionally implemented)
- [ ] Attribution volume per provider is auditable via admin or reporting

---

## Scenario 10 — Abuse: Provider Sharing Links with Existing Clients

**Description**: A provider who already has a book of clients on the platform (acquired at 15%) shares their external profile link with all existing clients via email or social. Old clients click the link. If attribution tokens are created for them, the provider could retroactively shift their existing client relationships to the 12% tier on future bookings.

**Questions to answer**:
- Is `has_prior_booking` the mechanism that blocks this? Specifically: if a client has any prior booking with the provider, is the attribution token creation refused or the 12% rate blocked?
- Where exactly is the `has_prior_booking` check implemented? Is it in `TrackAttributionView` (token creation time), in the booking fee calculation, or both?
- What counts as a "prior booking"? Completed sessions only? Cancelled sessions? Pending sessions? Historical appointments from before the attribution feature was launched?
- Is there a time constraint — e.g., "has booked in the last 12 months"? Or is it all-time?
- What if the client had one session 3 years ago? Is that relationship still "prior"?
- Edge case: a client who originally found the provider via Really Global, had one session, then the provider shares their link externally. The client clicks it. Is this correctly blocked?
- Is there logging/alerting for cases where `has_prior_booking` blocks attribution creation? This would be useful for detecting abuse patterns.

**Acceptance criteria to verify**:
- [ ] `has_prior_booking` is enforced at token creation time (not just at booking time)
- [ ] Definition of "prior booking" covers all relationship types including cancelled/historical
- [ ] Block applies regardless of how old the prior relationship is (or time limit is explicitly documented)
- [ ] Blocked attempts are logged for audit
- [ ] Admin UI or report shows providers with high block rates (potential abuse signal)

---

## Deliverables

For each of the 10 scenarios above, produce:

1. **Code evidence**: File paths and line references for the relevant model, view, serializer, mutation, or frontend component.
2. **Gap finding**: Explicit statement of whether the expected behavior is implemented, partially implemented, or missing.
3. **Severity rating**: Critical (blocks correct commercial outcome) / High (silent failure, no UX signal) / Medium (edge case, low frequency) / Low (cosmetic, informational).
4. **Recommendation**: Specific code change, UX copy, or product decision needed to close the gap.

**Final summary table**: All 10 scenarios × 4 columns (Gap | Severity | File Reference | Recommendation).

---

*Generated for RGDEV-183 — 60-Day Attribution Window Logic*
*Audit type: UX / Scenario / Commercial*
