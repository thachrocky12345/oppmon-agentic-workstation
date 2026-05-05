# UX / Scenario / Commercial Audit Results
## RGDEV-183: 60-Day Attribution Window Logic
**Date**: 2026-03-14
**Auditor**: Claude (automated code inspection)
**Source files inspected**:
- `Lumy-Backend/apps/attribution/models.py`
- `Lumy-Backend/apps/attribution/views.py`
- `Lumy-Backend/apps/attribution/utils.py`
- `Lumy-Backend/apps/attribution/urls.py`
- `Lumy-Backend/apps/attribution/admin.py`
- `Lumy-Backend/apps/attribution/management/commands/expire_attribution_tokens.py`
- `Lumy-Backend/apps/attribution/tests/test_models.py`
- `Lumy-Backend/apps/attribution/tests/test_fee_calculation.py`
- `Lumy-Backend/apps/attribution/tests/test_fraud_guardrails.py`
- `Lumy-Backend/apps/attribution/tests/test_provider_discount.py`
- `Lumy-Backend/apps/stripe_integration/views.py` (lines 300-512)
- `Lumy-Backend/apps/booking_link/views.py` (lines 105-680)
- `Lumy-Backend/apps/care_provider/models.py` (line 1061)
- `Lumy-Backend/lumy_global/urls.py`
- `RG-Frontend/src/` (full search for attribution references)

---

## Executive Summary

The backend attribution data model and utility functions are well-designed, with proper constraints (partial unique index on active tokens), fee override mechanics, double-discount prevention, and fraud guardrails. However, the feature has **critical gaps in end-to-end wiring** that prevent it from functioning in production. The most severe issues are:

1. **No frontend integration exists** -- zero API calls to attribution endpoints from the frontend
2. **PENDING-to-CONFIRMED transition is never triggered** in the main codebase -- the `confirm_attribution_if_eligible` function exists only in an unmerged worktree
3. **Anonymous visitor attribution is completely unhandled** -- `TrackAttributionView` requires `IsAuthenticated`
4. **No provider dashboard** for attribution visibility
5. **Duplicate `has_prior_booking` implementations** with conflicting logic between `attribution` and `booking_link` apps

**Overall status**: Backend models and utilities are ~70% complete. Frontend is 0% complete. End-to-end flow is non-functional.

---

## Scenario 1 -- Happy Path

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| URL mechanism for attribution signal | External link carries provider ID (e.g., `?ref=<id>` or slug-based) | No URL parameter handling in frontend. No frontend code calls `/api/v1/attribution/track/`. | **No frontend wiring exists.** The `TrackAttributionView` endpoint is registered at `/api/v1/attribution/track/` (confirmed in `lumy_global/urls.py` line 64) but nothing calls it. | **CRITICAL** |
| Token creation timing | Token created on external visit page load | `TrackAttributionView.post()` creates tokens, but requires authenticated user (`permission_classes = [IsAuthenticated]`) and a POST body with `provider_id`. No frontend sends this POST. | Token is never created in practice. | **CRITICAL** |
| Token survives registration | Attribution preserved through signup/login flow | No cookie, localStorage, session, or query-param bridge exists in the frontend. Zero references to `attribution` in `RG-Frontend/src/restapis/` or `RG-Frontend/src/pages/`. | Attribution signal is completely lost if user is not already logged in. | **CRITICAL** |
| 12% fee on booking within 60 days | `get_telehealth_fee()` returns 12% for attributed clients | `get_telehealth_fee()` checks `ProviderClientFeeOverride` (line 46-52, utils.py). But **no code creates `ProviderClientFeeOverride` records**. The fee override model exists but is never populated by any view, mutation, or signal. | Fee override is a dead model -- never written to. | **CRITICAL** |
| Fee stored on appointment/payment | 12% fee recorded on Stripe capture | `stripe_integration/views.py` line 459 calls `get_telehealth_fee()` which would return attributed rate IF a `ProviderClientFeeOverride` existed. The capture logic is wired. But the upstream data is never created. | Wiring exists for capture-time fee lookup but the input data is never produced. | **HIGH** |
| PENDING to CONFIRMED transition | Token transitions to CONFIRMED when booking is completed | `confirm_attribution_if_eligible()` exists in the worktree copy (`agent-ad3fbd38/apps/attribution/utils.py` line 175) but is **not present in the main codebase** `utils.py`. No code in the main branch transitions tokens from PENDING to CONFIRMED. | Tokens remain PENDING forever (until expiry management command runs). | **CRITICAL** |
| `checkout-status` endpoint | Returns discount info for frontend checkout UI | `AttributionCheckoutStatusView.get()` (views.py line 157-162) filters for `status=AttributionStatus.CONFIRMED`. Since no tokens ever reach CONFIRMED status, this always returns `is_first_attributed_session: False`. | Dead endpoint -- will never return positive results until CONFIRMED transition is wired. | **CRITICAL** |

**Recommendation**: This is the highest-priority gap. The full chain needs:
1. Frontend: Capture `provider_id` from external link URL, store in cookie/localStorage
2. Frontend: On login/registration, POST to `/api/v1/attribution/track/` with stored provider_id
3. Backend: Merge `confirm_attribution_if_eligible` from worktree to main
4. Backend: Wire `confirm_attribution_if_eligible` into payment capture flow
5. Backend: Create `ProviderClientFeeOverride` record when attribution is confirmed (or change `get_telehealth_fee` to check `ProfileAttributionToken` directly)

---

## Scenario 2 -- Window Reset (Re-visit Resets Clock)

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| Re-visit extends window | Second external visit resets 60-day countdown | **Implemented.** `TrackAttributionView.post()` lines 120-127: if existing token is PENDING or EXPIRED, `expires_at` is updated to `now + 60 days` and status is reset to PENDING. | None -- this works correctly at the backend level. | -- |
| Confirmed token locked on re-visit | CONFIRMED token not modified by re-visit | **Implemented.** Guardrail 2 (views.py line 75-84) returns early for CONFIRMED tokens without modification. | None. | -- |
| EXPIRED token re-activation | Expired token's window is restarted | **Implemented.** The `else` branch at line 121-126 handles both PENDING and EXPIRED tokens, resetting `expires_at` and status to PENDING. | None. | -- |
| Day 45 re-visit, Day 70 booking | Booking on Day 70 after Day 45 re-visit should be within window (Day 25 relative to re-visit) | Correct at backend level -- `expires_at` would be Day 45 + 60 = Day 105, so Day 70 is within window. | None, assuming the endpoint is actually called (see Scenario 1 critical gaps). | -- |

**Finding**: Window reset logic is correctly implemented in the backend. No gap here, though it depends on Scenario 1 gaps being resolved first.

---

## Scenario 3 -- API Call Timing and Anonymous Visits

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| Anonymous visit attribution | Attribution signal captured even for unauthenticated visitors | `TrackAttributionView` has `permission_classes = [IsAuthenticated]` (views.py line 29). Anonymous requests return 401. | **Anonymous visits produce no server-side attribution.** This is the most common case: a client discovers a provider externally, clicks a link, and lands on the platform *before* having an account. | **CRITICAL** |
| Client-side bridge (cookie/param) | Browser stores attribution reference through registration flow | Zero references to attribution in the frontend codebase. No cookies, no localStorage, no URL params are captured or preserved. Searched: `RG-Frontend/src/restapis/`, `RG-Frontend/src/pages/`, all `.ts` and `.tsx` files. | **No client-side attribution bridge exists.** | **CRITICAL** |
| Backfill on login | After registration/login, pending attribution cookie is consumed | No backfill mechanism exists. | **Not implemented.** | **CRITICAL** |
| Provider ID preservation through OAuth | OAuth redirect preserves attribution params | No state parameter or callback handling for attribution in `social_auth` app or frontend OAuth flows. | **Not implemented.** OAuth redirects (Google/Apple/Microsoft) will lose any URL-based attribution signal. | **HIGH** |

**Recommendation**: Implement a lightweight attribution bridge:
1. Frontend: On profile page load from external referral, store `{provider_id, timestamp, referer}` in a first-party cookie (e.g., `rg_attr`) with 60-day TTL
2. Frontend: After login/registration completes, read the cookie and POST to `/api/v1/attribution/track/`
3. Consider: Add an unauthenticated version of the track endpoint that creates a "pending_anonymous" record keyed by a session ID, converted to a user-linked token on login

---

## Scenario 4 -- Attribution Persistence: Cookie vs Server Token

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| Client-side mechanism | Cookie or localStorage stores provider ID at visit time | Not implemented. | **No client-side persistence.** | **CRITICAL** |
| Bridge consumed on auth | On login, bridge creates server-side token | Not implemented. | **No bridge logic.** | **CRITICAL** |
| Cross-device attribution | Attribution preserved when clicking on mobile, registering on desktop | Not implemented and not documented as out of scope. | **Gap -- not documented.** Cross-device is inherently hard and may be intentionally out of scope, but no product decision is recorded. | **MEDIUM** |
| Race condition: visit + immediate register | Attribution fires before user object exists | Since `TrackAttributionView` requires `IsAuthenticated`, the user object must exist first. But without a bridge mechanism, the attribution signal is lost during registration. If a bridge were implemented (cookie approach), the POST would happen after auth, so no race condition. | No race condition risk, but also no working flow. | **LOW** |
| Token tied to user_id or email | How tokens reference clients | Tokens are tied to `Client` FK (models.py line 49-54), which requires a created `Client` profile. Not email-based. Pre-registration attribution by email is not possible without model changes. | By design -- acceptable if cookie-bridge approach is used. | **LOW** |

**Recommendation**: Document cross-device attribution as explicitly out of scope for v1. Implement cookie-bridge approach per Scenario 3 recommendations.

---

## Scenario 5 -- Provider Dashboard Visibility

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| Provider sees active attribution windows | Dashboard shows "N clients in your attribution window" | No provider-facing endpoint or frontend component exists for attribution visibility. No GraphQL fields expose attribution data to providers. | **Not implemented.** | **HIGH** |
| Earnings breakdown (12% vs 15%) | Provider sees which bookings were attributed | No provider-facing reporting on fee tiers. The `ProviderClientFeeOverride` and `ProfileAttributionToken` models have admin views (`admin.py`) but no API exposure for provider self-service. | **Not implemented.** Only visible via Django admin. | **HIGH** |
| Warm lead visibility | Provider sees attributed visitors who haven't booked yet | Not implemented. PENDING tokens are not exposed to providers. | **Not implemented.** Privacy question: should providers see which clients visited their profile? May need product decision. | **MEDIUM** |
| Admin visibility | Admin can audit attribution tokens and fee overrides | **Implemented.** `ProfileAttributionTokenAdmin` and `ProviderClientFeeOverrideAdmin` in `admin.py` provide list views with filters, search by email, and read-only fields. `has_delete_permission` returns False for fee overrides (line 42-43). | Admin tooling is adequate. | -- |

**Recommendation**:
- Phase 1: Add a provider-facing REST endpoint to return their attribution summary (count of active tokens, count of confirmed/expired)
- Phase 2: Add earnings breakdown showing fee tier per booking
- Product decision needed: Should providers see warm leads (PENDING tokens)?

---

## Scenario 6 -- Client Discount Display at Checkout

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| Fee model clarity | 12% vs 15% is provider-side fee, client price unchanged | The code reveals TWO separate discount mechanisms: (1) `ProviderClientFeeOverride` changes the platform fee % taken from provider earnings (12% vs 15% -- provider-side). (2) `get_checkout_discount()` provides a `provider.attribution_discount_percent` first-session PRICE discount (5/10/15% off session price -- client-facing). | **Two distinct discount layers exist.** The platform fee reduction (12% vs 15%) affects provider net payout. The `attribution_discount_percent` is a provider-funded client-facing price reduction. Both can coexist. This is more complex than the ticket description suggests. | **HIGH** |
| Client-facing discount at checkout | If provider sets `attribution_discount_percent`, client sees lower price | `PayPalCreatePaymentAPIView.post()` (stripe_integration/views.py lines 320-347) applies `get_checkout_discount()` to reduce the charged amount. The discount amount is subtracted from the PayPal order amount. | **Backend wiring exists for PayPal.** But `get_checkout_discount()` only returns a discount if the token is PENDING or CONFIRMED (utils.py line 84), and since tokens are never CONFIRMED (Scenario 1 gap), this rarely triggers. For PENDING tokens, it would work IF the endpoint were called. | **HIGH** |
| Checkout UI shows discount | Client sees "You're getting X% off because you discovered this provider externally" | `AttributionCheckoutStatusView` exists (views.py line 135-174) and would return `is_first_attributed_session: True, discount_percent: N`. But **no frontend calls this endpoint** (zero matches in frontend search). | **No frontend checkout integration.** | **CRITICAL** |
| Stripe payment intent reflects discount | Discounted amount flows to Stripe | The PayPal flow adjusts the amount (stripe_integration/views.py line 335). For Stripe, no equivalent discount application was found. | **Stripe discount application may be missing.** Need to verify the Stripe payment intent creation flow. | **HIGH** |

**Recommendation**:
- Clarify the product intent: is the client-facing discount (`attribution_discount_percent`) an independent feature from the platform fee reduction (12% vs 15%)? They appear to be layered but the ticket description only mentions 12% vs 15%.
- Frontend: Call `checkout-status` endpoint during checkout and display discount messaging if applicable
- Verify Stripe payment intent creation applies the same discount logic as PayPal

---

## Scenario 7 -- Day 61 Edge Case and Client Communication

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| Boundary condition: inclusive vs exclusive | Clear definition of whether Day 60 is the last valid day | `is_expired` property (models.py line 88-89): `timezone.now() >= self.expires_at`. This means the token expires AT the exact `expires_at` timestamp (exclusive of the boundary moment). `get_checkout_discount()` uses `expires_at__gt=timezone.now()` (utils.py line 85), which is consistent. The `expire_attribution_tokens` command uses `expires_at__lte=now` (management command line 31). All three are **consistent**: token is valid up to but not including `expires_at`. | Boundary logic is internally consistent. | -- |
| Expired tokens retained for audit | Tokens not deleted on expiry | **Implemented.** `expire_attribution_tokens` command (line 39) uses `.update(status=AttributionStatus.EXPIRED)` -- status change only, no deletion. Admin view shows expired tokens. `has_delete_permission` is not restricted on `ProfileAttributionTokenAdmin` (unlike `ProviderClientFeeOverrideAdmin`). | Tokens are retained. However, `ProfileAttributionTokenAdmin` allows deletion -- consider restricting this for audit purposes. | **LOW** |
| Near-expiry UX warning | Client or provider warned when window is about to expire | Not implemented. No `expiring_soon` status. No notification or email trigger for approaching expiry. | **Not implemented.** | **MEDIUM** |
| Boundary tested | Test coverage for Day 59, 60, 61 | Tests in `test_models.py` test `+30 days` (valid) and `-1 day` (expired). No test at the exact boundary (e.g., `expires_at=timezone.now()`). The worktree has `test_window.py` but it's not merged. | Boundary-exact test missing from main branch. | **MEDIUM** |

**Recommendation**:
- Add `has_delete_permission = False` to `ProfileAttributionTokenAdmin` to prevent accidental audit trail loss
- Consider adding an `expiring_soon` notification (e.g., email provider when a PENDING token has 7 days left)
- Add boundary test: create token with `expires_at=timezone.now()`, confirm `is_expired` returns True

---

## Scenario 8 -- Multi-Provider Attribution

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| N concurrent tokens per client | Data model supports multiple providers | **Implemented.** The `unique_active_attribution_token` constraint (models.py line 73-78) is a partial unique on `(provider, client)` WHERE `status IN ('pending', 'confirmed')`. This allows one active token per provider-client pair, and multiple pairs for the same client with different providers. | Correct. Test `test_different_providers_create_separate_tokens` (test_models.py line 392-405) explicitly verifies this. | -- |
| Booking resolves per-provider | Booking with provider B uses provider B's token only | `get_telehealth_fee()` filters by `provider=provider, client=client` (utils.py line 46-49). `get_checkout_discount()` also filters by `provider=provider, client=client` (utils.py line 81-88). Resolution is per-pair. | Correct. Per-provider resolution. | -- |
| Unbooked provider tokens expire naturally | Tokens for providers A and C expire at 60 days | `expire_attribution_tokens` command expires all tokens past `expires_at` regardless of whether a booking occurred. | Correct. Natural expiry applies. | -- |
| `has_prior_booking` is per-provider | Check is provider-specific, not global | **Attribution app**: `has_prior_booking()` (utils.py line 128-132) filters by `care_provider=provider, client=client` -- per-provider. Correct. | Correct. | -- |

**Finding**: Multi-provider attribution is correctly handled in the data model and utility functions. No gaps.

---

## Scenario 9 -- Revenue Impact and Business Caps

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| Cap on attributed bookings per provider | Rate limit on 12% fee usage | No cap implemented in code. `ProviderClientFeeOverride` has no count limit, time limit, or budget cap. | **No cap exists.** If a provider successfully attributes 100% of their clients externally, all sessions move to 12%. | **MEDIUM** |
| Cap on total platform revenue shift | Global limit on attributed booking percentage | No global cap or circuit breaker. | **No global safeguard.** | **MEDIUM** |
| Attribution volume per provider auditable | Admin can see per-provider attribution volume | Admin view allows filtering by provider (via email search) and status. But no aggregate reporting (no count per provider, no trend over time). | **Aggregate reporting missing.** Admin can manually search but not efficiently audit at scale. | **MEDIUM** |
| Revenue impact modeling | Product/finance has reviewed the 12% vs 15% impact | Not in code scope. Cannot verify from code inspection. | Product/finance review should be confirmed outside this audit. | **LOW** |
| Gaming detection | Alert on providers with unusually high attribution volume | `fraud_logger` (views.py line 14) logs blocked attempts, but no proactive alerting on high volume of successful attributions. | **No proactive gaming detection.** A provider running mass email campaigns with their external link could attribute large volumes without triggering any alert. | **HIGH** |

**Recommendation**:
- Add a management command or scheduled job that reports providers with > N attributed clients per period
- Consider a per-provider monthly cap (e.g., first 20 attributed clients per month get 12%)
- Add Mixpanel or logging events for attribution volume tracking

---

## Scenario 10 -- Abuse: Provider Sharing Links with Existing Clients

| Aspect | Expected | Actual | Gap | Severity |
|---|---|---|---|---|
| `has_prior_booking` enforcement at creation time | Existing relationship blocks token creation | **Implemented.** `TrackAttributionView.post()` lines 52-72: `has_prior_booking(provider, client)` is called BEFORE token creation. If True, returns `attributed: False, reason: existing_relationship`. Existing PENDING tokens are marked INELIGIBLE. | Correct. Guardrail is enforced at token creation. | -- |
| Definition of "prior booking" | All relationship types covered | **Attribution app**: `has_prior_booking()` (utils.py line 128-132): `Appointment.objects.filter(care_provider=provider, client=client).exists()` -- **any status, all-time.** This includes SCHEDULED, COMPLETED, CANCELLED, etc. | Correct -- comprehensive coverage. | -- |
| **INCONSISTENCY with booking_link app** | Same `has_prior_booking` logic everywhere | **Booking link app**: `_has_prior_booking()` (booking_link/views.py line 117-130): filters `is_status__in=["SCHEDULED", "COMPLETED"]` -- **excludes CANCELLED.** This means a provider could have a cancelled appointment with a client, and the booking_link `_has_prior_booking` would return False (allowing attribution), while the attribution app's version would return True (blocking it). | **Inconsistent fraud guardrail definitions.** Two `has_prior_booking` functions with different semantics. The attribution app is stricter (includes cancelled). | **HIGH** |
| Blocked attempts logged | Audit trail for guardrail activations | **Implemented.** `fraud_logger.info()` (views.py line 61-68) logs provider_id, client_id, and referer when attribution is blocked due to existing relationship. `fraud_logger.warning()` (line 93-95) logs INELIGIBLE re-visit attempts. | Good. Logging is present. | -- |
| Admin report on high block rates | Identifies providers with suspicious patterns | Not implemented. Logs exist but no aggregation or alerting. | **No automated detection.** Requires manual log analysis. | **MEDIUM** |
| No time constraint on "prior" | Relationship from 3 years ago still blocks | `has_prior_booking` in the attribution app has no time filter -- all-time check. This is intentional and documented in the docstring ("any appointment...any status, including cancelled"). | Correct for the attribution app. By design. | -- |

**Recommendation**:
- **Resolve the `has_prior_booking` inconsistency.** Either: (a) the booking_link version should include cancelled appointments (align with attribution app), or (b) document why they differ. The current inconsistency means a provider with only cancelled appointments with a client could game the booking_link fee but not the attribution fee, which is confusing.
- Add a periodic report (management command or admin view) showing providers with the highest ratio of blocked-to-attempted attributions.

---

## Summary Table

| # | Scenario | Gap | Severity | File Reference | Recommendation |
|---|---|---|---|---|---|
| 1a | Happy Path: Frontend wiring | No frontend code calls attribution endpoints | **CRITICAL** | `RG-Frontend/src/` (zero matches) | Build frontend integration: capture provider_id from URL, POST to `/api/v1/attribution/track/` after login |
| 1b | Happy Path: CONFIRMED transition | `confirm_attribution_if_eligible` not in main codebase | **CRITICAL** | Exists only in `.claude/worktrees/agent-ad3fbd38/apps/attribution/utils.py:175` | Merge worktree function to main; wire into payment capture flow |
| 1c | Happy Path: ProviderClientFeeOverride never created | Dead model -- no code writes to it | **CRITICAL** | `apps/attribution/models.py:97-138`, `apps/attribution/utils.py:46-52` | Either create fee overrides on attribution confirmation, or change `get_telehealth_fee` to check `ProfileAttributionToken` directly |
| 2 | Window Reset | Correctly implemented | -- | `apps/attribution/views.py:120-127` | None |
| 3a | Anonymous Visits | `TrackAttributionView` requires auth; anonymous visits lost | **CRITICAL** | `apps/attribution/views.py:29` | Implement cookie-bridge: store `{provider_id, timestamp}` in first-party cookie, consume after login |
| 3b | OAuth attribution loss | OAuth redirects lose attribution params | **HIGH** | `apps/social_auth/` (no attribution handling) | Preserve attribution param in OAuth state parameter or pre-store in cookie before redirect |
| 4 | Persistence bridge | No client-side attribution mechanism (cookie/localStorage/param) | **CRITICAL** | `RG-Frontend/src/` (zero matches) | Implement `rg_attr` cookie with 60-day TTL, read on auth completion |
| 5a | Provider Dashboard | No provider-facing attribution UI or API | **HIGH** | No endpoint exists | Add REST endpoint for provider attribution summary |
| 5b | Provider Earnings Breakdown | No per-booking fee tier visibility for providers | **HIGH** | No endpoint exists | Add fee tier field to provider earnings/sessions API |
| 6a | Fee Model Complexity | Two distinct discount layers (platform fee reduction + client-facing price discount) -- potentially confusing | **HIGH** | `apps/attribution/utils.py:27-60` (platform fee), `apps/attribution/utils.py:63-120` (checkout discount) | Clarify product intent; document the two-layer model |
| 6b | Checkout UI | No frontend calls `checkout-status` endpoint | **CRITICAL** | `apps/attribution/views.py:135-174` (endpoint exists, no caller) | Frontend: call during checkout, display discount messaging |
| 6c | Stripe discount | PayPal discount applied (stripe_integration L320-347) but Stripe equivalent not verified | **HIGH** | `apps/stripe_integration/views.py:320-347` | Audit Stripe PaymentIntent creation for equivalent discount logic |
| 7a | Day 61 Edge | Boundary logic is internally consistent (`>=` for expiry) | -- | `apps/attribution/models.py:88-89`, `utils.py:85` | Add boundary test at exact `expires_at` timestamp |
| 7b | Near-Expiry Warning | No UX signal for approaching window expiry | **MEDIUM** | Not implemented | Consider email notification at 7 days before expiry |
| 7c | Admin deletion protection | `ProfileAttributionTokenAdmin` allows deletion (audit trail risk) | **LOW** | `apps/attribution/admin.py:6-22` | Add `has_delete_permission = False` |
| 8 | Multi-Provider | Correctly handled -- per-provider tokens and resolution | -- | `apps/attribution/models.py:72-78`, `utils.py:46-49` | None |
| 9a | Revenue Caps | No per-provider or global cap on attributed bookings | **MEDIUM** | Not implemented | Consider per-provider monthly cap |
| 9b | Gaming Detection | No proactive alerting on high attribution volume | **HIGH** | `apps/attribution/views.py:14` (fraud_logger exists but no aggregation) | Add periodic report/alert for providers with high attribution counts |
| 10a | Prior Booking Guardrail | Correctly implemented in attribution app (all statuses, all-time) | -- | `apps/attribution/utils.py:123-132`, `views.py:52-72` | None |
| 10b | `has_prior_booking` Inconsistency | Attribution app includes cancelled; booking_link app excludes cancelled | **HIGH** | `apps/attribution/utils.py:128-132` vs `apps/booking_link/views.py:117-130` | Align definitions -- cancelled should count as prior relationship in both |

---

## Critical Path (Prioritized)

To make the attribution feature functional end-to-end, these must be addressed in order:

### Phase 1: Backend Completeness (blocks everything)
1. Merge `confirm_attribution_if_eligible` from worktree to main branch
2. Wire `confirm_attribution_if_eligible` into payment capture flow (both Stripe and PayPal)
3. Decide: either populate `ProviderClientFeeOverride` on confirmation, or refactor `get_telehealth_fee` to check `ProfileAttributionToken` directly
4. Resolve `has_prior_booking` inconsistency between `attribution` and `booking_link` apps

### Phase 2: Frontend Integration (enables the feature)
5. Implement attribution cookie bridge:
   - On provider profile page load from external referral, store `{provider_id, referer, timestamp}` in `rg_attr` cookie (60-day TTL, `SameSite=Lax`, `HttpOnly=false` so JS can read it)
   - After login/registration/OAuth completion, read cookie and POST to `/api/v1/attribution/track/`
   - Clear cookie after successful POST
6. During checkout, call `GET /api/v1/attribution/checkout-status/?provider_id=X`
7. Display discount messaging in checkout UI if `is_first_attributed_session` is true

### Phase 3: Provider Experience
8. Add provider-facing API endpoint for attribution summary
9. Add fee tier breakdown to provider earnings view

### Phase 4: Safety and Observability
10. Add gaming detection report (management command)
11. Add per-provider attribution cap (product decision needed)
12. Add near-expiry notification system
13. Restrict `ProfileAttributionTokenAdmin` deletion

---

*Generated for RGDEV-183 -- 60-Day Attribution Window Logic*
*Audit type: UX / Scenario / Commercial*
*Audit date: 2026-03-14*
