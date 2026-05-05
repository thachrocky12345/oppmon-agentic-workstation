# UX / Scenario / Commercial Audit Prompt
# Healthcare Skills — ReallyGlobal / Lumy Platform

> **Auditor Role**: You are a senior healthcare software auditor with expertise in HIPAA compliance, clinical workflow design, and healthcare marketplace operations. Your background spans: telemedicine platform design, clinical informatics, SOC 2 Type II audits, and crisis intervention protocol design.
>
> **What you are auditing**: 14 Claude Code skill files located in `.claude/skills/` that were generated to support security, compliance, and developer workflow on the ReallyGlobal healthcare marketplace. The platform pairs clients (care seekers) with care providers (therapists, counselors, coaches), handling PHI, clinical session notes, risk screening scores, payment data, and provider credentials.
>
> **Output required**: A structured findings document with severity ratings (CRITICAL / HIGH / MEDIUM / LOW / INFO) for every finding. Each finding must reference the specific skill file(s) and a concrete remediation action. Save your findings to:
> `C:\Projects\ReallyGlobal\ContextFiles2\Library\Sessions\Audit_HealthcareSkills_UXScenario_Results_[YYYY-MM-DD].md`

---

## Codebase Ground Truth (do not re-explore; use as reference)

### Platform Architecture
- **Backend**: `C:\Projects\ReallyGlobal\Lumy-Backend\` — Django 4.2, DRF, Graphene-Django, PostgreSQL 14
- **Frontend**: `C:\Projects\ReallyGlobal\RG-Frontend\` — Next.js 13 (pages router), React 18, TypeScript, MUI
- **Skills location**: `C:\Projects\ReallyGlobal\.claude\skills\`
- **Two user roles**: CLIENT (care seeker) and CARE PROVIDER (therapist/counselor/coach)

### The 14 Skills Being Audited
| # | Skill Directory | Primary Domain |
|---|---|---|
| 1 | `phi-pii-leak-scan` | PHI/PII detection |
| 2 | `hipaa-compliance-audit` | HIPAA regulatory compliance |
| 3 | `security-code-review` | OWASP / security posture |
| 4 | `test-data-factory` | Test data generation |
| 5 | `mock-external-services` | Service mocking (Stripe, Twilio, SendGrid, Azure, Certn) |
| 6 | `mock-settings-manager` | Mock profile switching |
| 7 | `patient-data-integrity-check` | Data integrity / referential consistency |
| 8 | `api-response-sanitizer` | Response field exposure |
| 9 | `frontend-test-scaffold` | Jest / MSW / Testing Library setup |
| 10 | `credential-verification-workflow` | NPI / license / credential validation |
| 11 | `django-model-security-hardening` | Model-level encryption and audit logging |
| 12 | `consent-tracking-audit` | Consent collection and enforcement |
| 13 | `backend-endpoint-security-test` | Endpoint-level auth/authz tests |
| 14 | `deployment-readiness-check` | Pre-deployment security checklist |

### Known Platform Characteristics Relevant to This Audit
- `risk_screening.UserResponse.is_severe` and `final_keywords` contain suicidality/self-harm data
- Clinical session notes (`video_conferencing.Notes.notes`) are stored in plaintext — no field encryption
- OAuth tokens stored as plaintext TextFields
- JWT tokens stored in localStorage (XSS-accessible)
- Stripe secret key has historically appeared in frontend `.env.local`
- `DEBUG=True`, `ALLOWED_HOSTS=["*"]`, `CORS_ORIGIN_ALLOW_ALL=True` in current settings.py
- No audit logging for PHI access
- No rate limiting on most endpoints
- `User.parent_user` FK exists for minor/dependent care relationships
- `User.date_of_birth` stored for age verification purposes
- `ClientScreeningIgnore` model allows clients to bypass risk screening

---

## Audit Dimension 1: User Journey Coverage

**Objective**: Determine whether the 14 skills collectively cover the full end-to-end user journeys for both user roles. A gap here means developers working on a journey segment have no skill guidance for that segment.

### Client (Care Seeker) Journey — Full Lifecycle
Evaluate whether skills address each stage:

| Stage | Expected Skill Coverage | Check |
|---|---|---|
| 1. Discovery / Landing | SEO pages, anonymous search, crisis hotline page access | Does any skill cover unauthenticated data exposure? |
| 2. Risk Screening (pre-signup) | Questionnaire flow, severity routing, crisis resource display | Does `phi-pii-leak-scan` cover pre-auth screening data? Does `patient-data-integrity-check` verify `ClientScreeningIgnore` records? |
| 3. Account Creation | Email verification, phone OTP, T&C consent, minor/guardian flow | Does `consent-tracking-audit` cover the signup consent moment specifically? Does `backend-endpoint-security-test` include OTP brute-force protection? |
| 4. Profile Completion | Demographics, preferences, vulnerability flags | Does `phi-pii-leak-scan` cover `vulnerability1`/`vulnerability2` fields in GraphQL responses? |
| 5. Provider Search | Semantic search (Azure), filter application, SERP result browsing | Does any skill address Azure Search result sanitization (preventing provider PHI leakage in search results)? |
| 6. Provider Profile View | Public profile page, credential display, rates, availability preview | Does `api-response-sanitizer` cover the provider public profile endpoint specifically? Are NPI numbers excluded from public responses? |
| 7. Slot Selection & Booking | Calendar view, timezone handling, session type selection, modality selection | Does `test-data-factory` include cross-timezone booking scenarios with DST edge cases? |
| 8. Payment | Card entry, Stripe payment intent, 3DS challenge, PayPal alternative | Does `mock-external-services` cover PayPal mocks (not just Stripe)? Does `backend-endpoint-security-test` test payment endpoint rate limiting? |
| 9. Pre-Session | Appointment confirmation email, reminder notifications, device check | Does any skill cover notification trigger verification (SendGrid delivery confirmation)? |
| 10. Video Session | Twilio room join, pre-join device check, in-room controls, recording | Does `mock-external-services` cover Twilio recording failure modes? Does `phi-pii-leak-scan` check for room names embedding client identity? |
| 11. Post-Session | Left-meeting screen, post-session survey, follow-up booking prompt | Does `test-data-factory` include `CompletedSessionScenario` with post-session survey completion? |
| 12. Follow-Up | Repeat booking via DM, provider-initiated follow-up, session notes access by client | Does `api-response-sanitizer` verify clients cannot read the provider's clinical session notes? |
| 13. Account Deletion / Data Export | GDPR right-to-access, right-to-deletion, data portability | Does `consent-tracking-audit` fully cover data subject rights (DSR) request workflows? |

**Finding criteria**: Rate CRITICAL if a stage containing PHI has NO skill coverage. Rate HIGH if a stage has partial coverage but leaves a material security or compliance gap.

### Care Provider Journey — Full Lifecycle
Evaluate whether skills address each stage:

| Stage | Expected Skill Coverage | Check |
|---|---|---|
| 1. Provider Registration | Account creation, user_type=CAREPROVIDER, T&C consent | Does `consent-tracking-audit` cover `CareProvider.agree_Credential_Status` enforcement? |
| 2. Profile Setup | Role, specialties, treatment approaches, languages, identity fields | Does `phi-pii-leak-scan` cover `my_identity_sexuality`, `my_identity_ethnicity_and_race`, `my_identity_faith_and_background_orientation` in API responses? |
| 3. Credential Submission | NPI entry, license upload, certificate upload, academic degree | Does `credential-verification-workflow` validate NPI format (10-digit, Luhn check, must start with 1 or 2)? |
| 4. Background Check | Certn/Sterling initiation, polling for status, adverse action notification | Does `mock-external-services` model the full Certn adverse action flow (not just "clear" and "review")? |
| 5. Credential Review (Admin) | Admin manual approval, verified badge issuance, override capability | Does any skill cover the admin-side credential review workflow? Is this a gap? |
| 6. Availability Configuration | Calendar setup, slot creation, session rates, modalities, location | Does `patient-data-integrity-check` verify no double-booked slots? |
| 7. Profile Publishing | Visibility toggle, search indexing trigger | Does any skill cover Azure Search index synchronization integrity? |
| 8. Session Delivery | Twilio room, clinical notes entry, risk observation during session | Does `django-model-security-hardening` specifically address `Notes.notes` at the point of creation (pre-save signal for HTML stripping)? |
| 9. Clinical Notes | Post-session note writing, retention period, access controls | Does `hipaa-compliance-audit` verify that clinical notes endpoints require BOTH authentication AND care_provider ownership? |
| 10. Payment Receipt | Stripe Connect payout, platform fee deduction, income reporting | Does any skill address Stripe Connect webhook validation (signature verification)? |
| 11. Credential Renewal | Expiration reminders, re-upload flow, suspension during lapse | Does `credential-verification-workflow` produce actionable expiration warnings with renewal lead time? |
| 12. Pre-Licensed Provider | Supervisor association, supervised practice limits, anticipated completion | Does `credential-verification-workflow` enforce that pre-licensed providers cannot have unsupervised appointments? |

**Finding criteria**: Rate HIGH if credential validation is incomplete (expired credentials accepted). Rate CRITICAL if pre-licensed provider restrictions are not enforced.

---

## Audit Dimension 2: Scenario Completeness

**Objective**: Verify that `test-data-factory` (Skill 4) and `mock-settings-manager` (Skill 6) cover all critical operational scenarios. Each scenario must be achievable without manual fixture editing.

### Scenario 2.1 — Happy Path (Full Booking Cycle)
Check: Does `test-data-factory` produce a `CompletedSessionScenario` that includes:
- [ ] Client with verified email + phone + T&C consent
- [ ] Provider with valid NPI + active license + published profile
- [ ] Appointment in COMPLETED status (not just SCHEDULED)
- [ ] VideoCallRoom with matching room_name
- [ ] Notes record written by the provider
- [ ] Payment record with payment_intent_id and SUCCEEDED status
- [ ] Post-session survey response (if survey model exists)

**Finding criteria**: Rate HIGH if any link in this chain is absent — a broken happy path means no baseline for regression testing.

### Scenario 2.2 — Crisis Pathway
Check: Does `test-data-factory` include a `CrisisScreeningScenario` that produces:
- [ ] A `UserResponse` with `is_severe=True`
- [ ] `final_keywords` containing realistic crisis indicator terms (not empty JSON)
- [ ] `ResponseDetail` records with per-question scores that sum to a crisis threshold
- [ ] The client's booking flow being interrupted or redirected (or documentation of the expected interruption behavior)
- [ ] Crisis resource links surfaced (suicide/crisis hotline page URLs in the response)
- [ ] A `ClientScreeningIgnore` record demonstrating the bypass path

Does `mock-settings-manager` include a `crisis-flow.json` profile that:
- [ ] Forces risk screening to return `is_severe=True` on every submission
- [ ] Verifies the backend `post_save` signal (from `django-model-security-hardening`) fires for `is_severe=True`
- [ ] Does NOT produce a completed booking (crisis path should interrupt normal booking)

**Finding criteria**: Rate CRITICAL if the crisis pathway scenario is absent or incomplete — this is a patient safety gap, not just a testing gap.

### Scenario 2.3 — Payment Failures
Check: Does `mock-settings-manager`'s `payment-failures.json` profile and `mock-external-services` cover:
- [ ] Stripe decline code `card_declined` (generic)
- [ ] Stripe decline code `insufficient_funds`
- [ ] Stripe decline code `card_velocity_exceeded` (fraud prevention)
- [ ] Stripe decline code `do_not_honor` (issuer decline, no reason given)
- [ ] Stripe 3DS challenge required (`authentication_required`) — client must complete 3DS
- [ ] Stripe dispute / chargeback webhook event
- [ ] Stripe refund (full and partial)
- [ ] PayPal order failure (if PayPal integration is in scope)
- [ ] Payment timeout (network failure mid-intent)

For each failure mode, is there a test verifying:
- [ ] The appointment is NOT created or moves to PAYMENT_FAILED status
- [ ] The slot is released back to available
- [ ] The client receives an error notification (not a 500)
- [ ] No partial payment record is left in an inconsistent state

**Finding criteria**: Rate HIGH for any real Stripe decline code that is omitted. Rate CRITICAL if a decline scenario can leave the slot permanently reserved without payment.

### Scenario 2.4 — Provider Credential Issues
Check: Does `test-data-factory` include scenarios for:
- [ ] Provider with expired NPI (`npi_valid_until < today`)
- [ ] Provider with expired professional license (`professional_license_valid_until < today`)
- [ ] Provider with pending background check (Sterling/Certn status = "in_progress")
- [ ] Provider with adverse action background check result
- [ ] Pre-licensed provider without a supervisor assignment
- [ ] Provider whose `is_licensed=False` but has SCHEDULED appointments (data integrity violation)
- [ ] Provider with mismatched credential level (e.g., degree type incompatible with claimed role)

Does `credential-verification-workflow` produce:
- [ ] A severity-rated report (not just a list)
- [ ] A distinction between "expired" (grace period possible) and "invalid format" (immediate block required)
- [ ] Actionable remediation steps for each finding type

**Finding criteria**: Rate HIGH if expired credential detection does not flag providers as non-bookable. Rate CRITICAL if a provider with `is_severe` background check can still receive appointment bookings.

### Scenario 2.5 — Minor / Dependent Care
Check: Does any skill address the minor client flow?
- [ ] `User.parent_user` FK: does `consent-tracking-audit` verify parental consent is captured before a minor's account is activated?
- [ ] Does `test-data-factory` include a minor client scenario (date_of_birth within 18 years)?
- [ ] Does `backend-endpoint-security-test` verify that minor accounts cannot be created without parent_user linkage?
- [ ] Is there a jurisdiction age-of-consent check (some states allow 12+ for mental health without parental consent)?
- [ ] Does any skill address the legal requirement that therapy notes for minors may be accessible to parents in some jurisdictions?

**Finding criteria**: Rate CRITICAL if there is no scenario covering minor client consent — this is a legally distinct protection class.

### Scenario 2.6 — Cross-Timezone Scheduling
Check: Does `test-data-factory` produce appointments where:
- [ ] Client and provider are in different timezones (e.g., client UTC-8, provider UTC+5:30)
- [ ] The appointment spans a DST transition date
- [ ] The slot display is validated from both client and provider perspective
- [ ] Cancellation cutoff time is calculated correctly in the provider's timezone

**Finding criteria**: Rate MEDIUM if timezone scenarios are absent (DST bugs are predictable production failures in international health platforms).

### Scenario 2.7 — Cancellation / Rescheduling / No-Show
Check: Does `test-data-factory` include:
- [ ] Appointment with status CANCELLED by client (before cutoff)
- [ ] Appointment with status CANCELLED by client (after cutoff — partial refund scenario)
- [ ] Appointment with status CANCELLED by provider (full refund required)
- [ ] Appointment with status NO_SHOW (client did not join within N minutes)
- [ ] Rescheduled appointment (original slot released, new slot created, payment transferred)

Does `mock-settings-manager` include a profile that triggers:
- [ ] Provider-side cancellation notification (SendGrid template)
- [ ] Client-side refund notification with refund amount confirmation

**Finding criteria**: Rate HIGH if cancellation-after-cutoff does not have a corresponding Stripe partial refund scenario (financial liability if logic is wrong).

---

## Audit Dimension 3: Healthcare Domain Accuracy

**Objective**: Verify that skills use clinically and regulatorily accurate terminology, formats, and constraints. Errors here will be caught by clinical staff reviewing the dev process.

### 3.1 — NPI Number Validation (`credential-verification-workflow`)
Check the Luhn algorithm implementation:
- NPI is a 10-digit number. The check digit (10th digit) is computed using a modified Luhn algorithm with a constant prefix of `80840` prepended before computing.
- The standard Luhn algorithm alone on the 10-digit NPI is INCORRECT — must prepend `80840` per NPPES specification.
- Verify the skill specifies: `80840` + 10-digit NPI → apply Luhn → check digit must equal NPI's 10th digit.
- Individual providers (Type 1) must start with `1`. Organizational providers (Type 2) must start with `2`. The skill should distinguish these.
- Valid NPI range: 1,000,000,000 to 1,999,999,999 (Type 1) or 2,000,000,000 to 2,999,999,999 (Type 2).

**Finding criteria**: Rate CRITICAL if the Luhn algorithm specification is wrong or missing the `80840` prefix — incorrect NPI validation will accept bogus NPIs and reject valid ones.

### 3.2 — Professional License Formats (`credential-verification-workflow`)
Check whether the skill specifies regex patterns or format rules for at least the following US state license formats:
- California LCSW: `LCS NNNNN` (alpha prefix + space + 5 digits)
- New York LCSW: `NNNNNNN` (7 digits, no prefix)
- Texas LPC: `LPCNNNNN` (3 alpha + 5 digits)
- Florida LMHC: `MHNNNNNNN` (2 alpha + 7 digits)

**Finding criteria**: Rate HIGH if the skill specifies license format validation without any state-specific patterns. Rate MEDIUM if patterns exist but are documented as examples only, not enforced.

### 3.3 — ICD-10 Code Usage (`test-data-factory`)
Check: When the factory populates `Appointment.reason` or `Session.issues` with ICD-10 codes:
- [ ] Are the codes from the F-chapter (Mental, Behavioral, Neurodevelopmental disorders)?
- [ ] Are they valid ICD-10-CM codes (not ICD-10 WHO codes, which differ for US billing)?
- [ ] Does the factory avoid using real diagnostic codes for common presentations (F32.1 Major depressive disorder, mild) in a way that could train clinicians to misuse them?
- [ ] Are the test codes clearly synthetic (e.g., using F99 — Unspecified mental disorder — for generic test data)?

**Finding criteria**: Rate MEDIUM if the factory uses realistic diagnostic codes without documentation that they are for testing only.

### 3.4 — Risk Screening Instrument Accuracy (`test-data-factory`, `mock-settings-manager`)
Check whether the skills reference specific validated clinical instruments:
- PHQ-9 (Patient Health Questionnaire-9): 9 questions, each scored 0-3, total 0-27. Severity thresholds: 0-4 none, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe.
- GAD-7 (Generalized Anxiety Disorder-7): 7 questions, each scored 0-3, total 0-21. Thresholds: 0-4 minimal, 5-9 mild, 10-14 moderate, 15+ severe.
- Columbia Suicide Severity Rating Scale (C-SSRS): Ideation intensity subscale items.

Verify:
- [ ] The `CrisisScreeningScenario` produces scores that match actual PHQ-9 crisis thresholds (PHQ-9 item 9 score of 2 or 3 = active suicidal ideation — must trigger `is_severe=True`).
- [ ] The `final_score` values in factory data are internally consistent (sum of `ResponseDetail.score` = `UserResponse.final_score`).
- [ ] The skill does NOT invent fictional scoring thresholds — all thresholds must reference the published instrument.

**Finding criteria**: Rate HIGH if risk scoring factory data is inconsistent with validated instrument thresholds. Rate CRITICAL if a PHQ-9 item 9 response of "nearly every day" (score=3) does not produce `is_severe=True` in the factory scenario.

### 3.5 — Clinical Note Standards (`django-model-security-hardening`, `test-data-factory`)
Check:
- [ ] Does `django-model-security-hardening` reference SOAP note format (Subjective, Objective, Assessment, Plan) or DAP format (Data, Assessment, Plan) as the standard for `Notes.notes` content?
- [ ] Does the `pre_save` signal specification for HTML stripping preserve structured clinical note formats (headers, lists) while removing script tags?
- [ ] Does the factory produce synthetic notes that follow a realistic clinical format (not lorem ipsum)? Notes should include: presenting problem, session content, provider observations, plan.
- [ ] Do the skills acknowledge that clinical notes are subject to 21st Century Cures Act information blocking provisions (providers cannot withhold notes from clients in most cases under OpenNotes)?

**Finding criteria**: Rate MEDIUM if clinical notes in factory data are lorem ipsum. Rate HIGH if the `pre_save` signal specification would strip legitimate note formatting.

---

## Audit Dimension 4: Compliance and Regulatory Fit

**Objective**: Verify that compliance-focused skills (`hipaa-compliance-audit`, `consent-tracking-audit`, `django-model-security-hardening`, `deployment-readiness-check`) address the actual regulatory requirements, not a simplified interpretation.

### 4.1 — HIPAA Technical Safeguards Coverage (`hipaa-compliance-audit`)
Map the skill's checklist against 45 CFR Part 164 Subpart C (Security Rule):

| Requirement | CFR Reference | Addressable vs Required | Check in Skill |
|---|---|---|---|
| Unique user identification | §164.312(a)(2)(i) | Required | Does skill check that all PHI access is tied to an identified user account? |
| Emergency access procedure | §164.312(a)(2)(ii) | Required | Does skill verify there is an emergency override procedure documented? |
| Automatic logoff | §164.312(a)(2)(iii) | Addressable | Does skill check session timeout configuration? |
| Encryption and decryption | §164.312(a)(2)(iv) | Addressable | Does skill verify field-level encryption exists OR document the addressable exception? |
| Audit controls | §164.312(b) | Required | Does skill verify audit logging of PHI access? |
| Integrity — authentication mechanism | §164.312(c)(2) | Addressable | Does skill check data signing or hash verification on PHI records? |
| Person/entity authentication | §164.312(d) | Required | Does skill verify multi-factor authentication capability? |
| Transmission security — encryption | §164.312(e)(2)(ii) | Addressable | Does skill check TLS enforcement on all PHI endpoints? |

**Finding criteria**: Rate CRITICAL for any "Required" safeguard that is absent from the skill. Rate HIGH for "Addressable" safeguards with no documentation of the exception rationale.

### 4.2 — HIPAA Privacy Rule Coverage (`hipaa-compliance-audit`, `consent-tracking-audit`)
Check whether skills address 45 CFR Part 164 Subpart E (Privacy Rule):

- [ ] Minimum Necessary standard (§164.502(b)): Does `api-response-sanitizer` explicitly reference this standard by name?
- [ ] Notice of Privacy Practices (NPP) (§164.520): Does `consent-tracking-audit` verify NPP delivery and acknowledgment at signup?
- [ ] Authorization for use/disclosure (§164.508): Does `consent-tracking-audit` verify that sharing clinical data with third parties requires explicit authorization beyond T&C?
- [ ] Right of access (§164.524): Does `consent-tracking-audit` verify there is a mechanism for clients to access their own PHI within 30 days of request?
- [ ] Amendment rights (§164.526): Does any skill address the right to amend incorrect PHI?
- [ ] Accounting of disclosures (§164.528): Does any skill address logging of who received PHI and why?

**Finding criteria**: Rate CRITICAL if NPP delivery at signup is not covered. Rate HIGH if no mechanism for the right of access (client data export) is addressed.

### 4.3 — Telehealth-Specific Regulations
Check whether any skill addresses telehealth-specific compliance requirements:

- [ ] State-by-state telehealth practice standards (providers must be licensed in the client's state in most US jurisdictions). Does `credential-verification-workflow` verify that the provider holds a license in the client's state at the time of booking?
- [ ] Informed consent for telehealth: Many states require separate informed consent disclosing telehealth-specific limitations. Does `consent-tracking-audit` identify this as a missing consent point if it is absent?
- [ ] Interstate Compact (PSYPACT, NLC): Does `credential-verification-workflow` acknowledge that some providers may practice across state lines under compacts without holding individual state licenses?
- [ ] Prescribing restrictions: Does any skill note that telehealth platforms facilitating prescribing (if applicable) have DEA and Ryan Haight Act requirements? (Even if not currently in scope, this should be flagged as a known boundary.)

**Finding criteria**: Rate HIGH if cross-state licensure verification is not addressed — this is a direct legal liability for the platform.

### 4.4 — Minor Consent Regulations (`consent-tracking-audit`)
Check whether the skill accurately reflects jurisdiction-specific minor consent rules:

- [ ] Federal HIPAA: minors generally cannot exercise their own HIPAA rights; the parent/guardian is the personal representative — EXCEPT when state law allows the minor to consent to treatment without parental consent (§164.502(g)(3)).
- [ ] Common minor consent carve-outs in US state law: mental health treatment (CA allows 12+), substance abuse treatment (many states allow 12+), reproductive health, STI treatment.
- [ ] Does the skill acknowledge that the platform must implement jurisdiction-aware consent logic rather than a single global age threshold?
- [ ] Does the skill specify that records created under minor self-consent (without parental consent) must be withheld from the parent/guardian's view?

**Finding criteria**: Rate CRITICAL if the skill specifies a single global age-of-majority (18) as the only threshold, ignoring state carve-outs.

### 4.5 — State Privacy Law Coverage (`consent-tracking-audit`)
Check whether the skill addresses:
- [ ] California Consumer Privacy Act (CCPA/CPRA): Does the skill distinguish between CCPA and HIPAA? (HIPAA-covered entities are partially exempt from CCPA, but may still need to address non-PHI personal data.)
- [ ] California Confidentiality of Medical Information Act (CMIA): Stricter than HIPAA for California residents.
- [ ] State mental health confidentiality laws: Some states have stronger protections for mental health records than HIPAA (e.g., New York Mental Hygiene Law §33.13).
- [ ] Does the skill provide a framework for managing multi-jurisdictional clients, or does it treat compliance as single-jurisdiction?

**Finding criteria**: Rate HIGH if the skill assumes HIPAA is the only applicable law. Rate MEDIUM if it acknowledges state laws exist but provides no mechanism to handle them.

---

## Audit Dimension 5: Mock Realism

**Objective**: Verify that mock service configurations in `mock-external-services` (Skill 5) and `mock-settings-manager` (Skill 6) reflect failure modes that actually occur in production, using correct vendor-specific error codes and event names.

### 5.1 — Stripe Mock Realism
Cross-reference the skill's mock scenarios against the official Stripe API documentation decline codes:

| Skill Mock Mode | Expected Stripe Decline Code | Stripe `decline_code` Value | Verify in Skill |
|---|---|---|---|
| `card_declined` (generic) | Generic issuer decline | `generic_decline` | Is the correct `decline_code` specified? |
| `insufficient_funds` | Insufficient funds | `insufficient_funds` | Is this a `decline_code` or a `code`? (They are different Stripe fields) |
| `3ds_required` | Authentication required | `authentication_required` | Does the mock return a `PaymentIntent` with `status=requires_action` and `next_action.type=use_stripe_sdk`? |
| `fraud_detected` | Fraud detection | `fraudulent` | Does the mock return this as a `StripeCardError` with `code=card_declined`? |
| `card_velocity_exceeded` | Velocity limit | `card_velocity_exceeded` | Present? |
| `do_not_honor` | Issuer soft decline | `do_not_honor` | Present? |

Additional Stripe checks:
- [ ] Does the mock return a correctly structured `PaymentIntent` object (not a simplified dict) so that the frontend Stripe.js SDK can process it?
- [ ] Does the webhook event mock include a valid `stripe-signature` header format (even if using a test secret)?
- [ ] Does the Stripe Connect mock (for provider payouts) include the `account` parameter in transfer creation?

**Finding criteria**: Rate HIGH for any mock that uses an invented error code not in the Stripe API (will never reproduce real production behavior). Rate MEDIUM for mocks missing the `decline_code` vs `code` distinction.

### 5.2 — Twilio Mock Realism
Verify the Twilio mock failure modes against Twilio Video and Conversations API error codes:

| Skill Mock Mode | Expected Twilio Error | Twilio Error Code | Verify |
|---|---|---|---|
| `room_full` | Participant limit reached | Error 53105 | Is the code specified? |
| `participant_disconnected` | Unexpected disconnect | Error 53001 | Is the reconnection flow mocked? |
| `recording_failed` | Recording composition failed | Error 56000 series | Present? |
| `auth_failure` | Invalid Access Token | Error 20101 | Is the JWT structure validated? |
| `rate_limit` | Too Many Requests | Error 20429 | Present? |

Additional Twilio checks:
- [ ] Does the Twilio room mock produce a `room_sid` in the correct format (`RM` prefix + 32 hex chars)?
- [ ] Does the participant token mock produce a valid JWT structure (header.payload.signature) that the Twilio Video JS SDK will accept in test mode?
- [ ] Does the Twilio Conversations mock cover the case where a conversation is deleted while a participant is active?

**Finding criteria**: Rate HIGH if mock failure codes are invented rather than real Twilio error codes (breaks error-handling test coverage).

### 5.3 — SendGrid Mock Realism
Verify the SendGrid mock against the SendGrid Event Webhook event types:

| Skill Mock Mode | Expected SendGrid Event | Verify |
|---|---|---|
| Bounce | `bounced` (hard bounce) vs `deferred` (soft bounce) | Does the mock distinguish hard vs soft bounce? |
| Spam report | `spamreport` | Present? |
| Invalid recipient | `invalid_email` event at address validation | Is this distinct from a bounce? |
| Delivery | `delivered` | Present? |
| Open | `open` | Present? (For email delivery confirmation in tests) |

Additional check:
- [ ] Does the SendGrid mock validate that the email templates being sent use the correct SendGrid Dynamic Template IDs (not hardcoded HTML)?
- [ ] Does the mock capture the `to`, `from`, `subject`, `dynamic_template_data` payload for assertion in tests?

**Finding criteria**: Rate MEDIUM if hard bounce and soft bounce are conflated (different business logic applies to each).

### 5.4 — Azure Cognitive Search Mock Realism
Verify:
- [ ] Does the mock return a response in the correct Azure Search SDK format (`SearchItemPaged` object structure, not a raw dict)?
- [ ] Does the `search-empty.json` profile return an empty result with the correct structure (`{"value": [], "@odata.count": 0}`) rather than a null or error response?
- [ ] Does the mock support the faceted search response format (for filter panels in the search UI)?
- [ ] Does the mock cover the `@search.score` field that the frontend may use for result ordering?

**Finding criteria**: Rate MEDIUM for structural mismatches between mock response format and real Azure Search SDK output.

### 5.5 — Certn/Sterling Background Check Mock Realism
Verify:
- [ ] Does the mock model the asynchronous polling pattern (status starts as `PENDING`, transitions to `COMPLETE` after configurable delay)?
- [ ] Are the status values correct? Certn statuses include: `pending`, `in_progress`, `complete`, `cancelled`.
- [ ] Does the mock include the `adverse_action` flow (negative result → 5-day waiting period → notification → final action)?
- [ ] Does the `background-check-pending.json` profile test the platform's behavior when a background check has been pending for longer than the expected SLA (provider stuck in limbo)?

**Finding criteria**: Rate HIGH if the adverse action flow is absent — regulatory requirement for background check vendors.

---

## Audit Dimension 6: Developer Experience

**Objective**: Verify that each skill is practically usable by a developer who is not the skill's author. A skill that requires expert knowledge to interpret is not a skill — it is documentation.

### 6.1 — Invocability
For each of the 14 skills, check:
- [ ] Does the frontmatter `description` field contain 3+ distinct trigger phrases that a developer would naturally type? (e.g., "check sonar", "sonar results", "PR quality gate" — not just the skill name)
- [ ] Can the skill be invoked with zero arguments (all arguments optional or have defaults)?
- [ ] Is the `argument-hint` field populated with a concrete example (not just a type description)?

**Finding criteria**: Rate MEDIUM if fewer than 3 trigger phrases are present. Rate HIGH if the skill requires mandatory arguments with no defaults (blocks casual use).

### 6.2 — Step Sequentiality and Unambiguity
For each skill's Workflow section:
- [ ] Are steps numbered and ordered such that each step's output is the input to the next?
- [ ] Does each step contain at least one concrete command (bash, Python, Django management command) — not just prose instructions?
- [ ] Are file paths absolute or clearly relative to a known root (e.g., `Lumy-Backend/` or `RG-Frontend/`)?
- [ ] Are decision branches explicit? ("If X is true, do Y; else do Z" — not "consider doing Y")
- [ ] Is the expected duration or scope communicated? (A step that says "audit all endpoints" without scoping is not actionable.)

**Finding criteria**: Rate HIGH for any step that contains only prose guidance with no executable command. Rate MEDIUM for any step where the expected output is undefined.

### 6.3 — Actionable Output Specification
For each skill, check whether the output section specifies:
- [ ] The format of the output (Markdown table, JSON file, terminal output, management command output)
- [ ] The location where output is saved (specific file path)
- [ ] The severity rating system used (CRITICAL/HIGH/MEDIUM/LOW is consistent across all skills that produce findings)
- [ ] Whether the output is meant for human reading, CI pipeline consumption, or both

**Finding criteria**: Rate MEDIUM if the output format is unspecified. Rate HIGH if the output location varies across related skills (makes aggregation impossible).

### 6.4 — Known Patterns and Gotchas Section
Specifically for this codebase, verify that skills referencing Django management commands include:
- [ ] The `auto_now_add` + `loaddata` incompatibility (use ORM-based commands, not `loaddata`, for models with timestamp auto-fields)
- [ ] The `djmoney` deserializer rejection of `editable=False` fields in fixtures
- [ ] The MSYS_NO_PATHCONV=1 prefix requirement for Docker exec commands on Windows
- [ ] The two-checkout problem (changes in `C:\Projects\ReallyGlobal\` vs `C:\Projects\ReallyGlobal-Infra\` are separate git trees)

**Finding criteria**: Rate MEDIUM for each known gotcha that is absent from the relevant skill's "Known Patterns & Gotchas" section.

### 6.5 — Example Invocations
For each skill:
- [ ] Are there 2-3 example invocations showing real argument variations?
- [ ] Do the examples cover at least one "scan all" case and one "targeted" case?
- [ ] Do any examples demonstrate the failure injection / mock profile arguments?

**Finding criteria**: Rate LOW if examples are absent. Rate MEDIUM if examples show only the happy path.

---

## Audit Dimension 7: Gap Analysis

**Objective**: Identify healthcare scenarios that are NOT covered by any of the 14 skills. This is a forward-looking analysis: what would the next iteration of skills need to address?

### 7.1 — Emergency Protocol Coverage
Evaluate: Is there ANY skill that addresses the platform's response when a client is in imminent danger during or after a session?

Required coverage (check if present in any skill):
- [ ] **Duty to warn / Tarasoff obligations**: Provider obligation to warn identifiable third parties of credible threats. Does any skill mention this as a documentation or workflow requirement?
- [ ] **Mandatory reporting**: Duty to report child abuse, elder abuse, and imminent self-harm to authorities. Does any skill address how the platform facilitates or documents these reports?
- [ ] **Crisis escalation workflow**: When `is_severe=True`, what happens next? Is there a documented escalation path (alert to platform safety team, display hotline numbers, lock account for review)?
- [ ] **Post-crisis follow-up**: After a crisis event, is there a required follow-up contact workflow? Does any skill address this?

**Finding criteria**: Rate CRITICAL if no skill addresses the post-crisis escalation workflow beyond displaying a hotline number. Rate HIGH if duty-to-warn/mandatory reporting is absent from the compliance skills.

### 7.2 — Multi-Provider Care Coordination
Evaluate: Does any skill address scenarios where a client sees multiple providers on the platform?

- [ ] Data isolation: Can Provider A access the session notes written by Provider B for the same client? (Should be NO — but is this enforced and tested?)
- [ ] Shared care plan: Is there any mechanism for providers to collaborate with client consent? (If not, is this flagged as a missing feature with compliance implications?)
- [ ] Referral workflow: If a provider refers a client to another provider on the platform, does any skill address the consent and data handoff requirements?

**Finding criteria**: Rate HIGH if cross-provider note isolation is not tested by any skill.

### 7.3 — Insurance and Benefits Billing
Evaluate: The platform appears to be direct-pay (Stripe/PayPal). However:
- [ ] Does any skill acknowledge that users may attempt to seek reimbursement from insurance and will need superbills (itemized receipts with CPT codes and diagnosis codes)?
- [ ] Does any skill address the generation of superbill-compatible payment receipts?
- [ ] Is the absence of insurance billing explicitly documented as an out-of-scope limitation, or is it silently omitted?
- [ ] If the platform expands to insurance billing, what compliance gaps would need to be addressed? (ANSI X12 837 transaction, ERA/EOB handling, NPI billing requirements)

**Finding criteria**: Rate MEDIUM if superbill generation is absent and undocumented. Rate LOW if it is explicitly noted as out of scope.

### 7.4 — Legal Discovery and Audit Trail
Evaluate: If the platform receives a legal subpoena or regulatory audit request:
- [ ] Is there a skill for generating a complete audit trail of PHI access (who accessed what, when, from what IP)?
- [ ] Can the platform produce a complete record of all clinical notes for a specific client between two dates?
- [ ] Can the platform demonstrate which admin users reviewed or approved specific provider credentials and when?
- [ ] Is there a data preservation / litigation hold mechanism?

**Finding criteria**: Rate HIGH if no skill addresses legal discovery data export. This is a practical legal operations gap, not just a theoretical risk.

### 7.5 — Incident Response and Breach Notification
Evaluate: In the event of a data breach:
- [ ] Is there a skill that walks through the HIPAA Breach Notification Rule (45 CFR Part 164 Subpart D)?
  - Individual notification within 60 days of discovery
  - HHS notification (immediate if 500+ individuals affected, annual log if fewer)
  - Media notification for breaches affecting 500+ in a state
- [ ] Is there a skill that identifies which records were potentially exposed in a breach scenario (given a time window and affected system)?
- [ ] Is there a breach risk assessment tool (the "4-factor test" for determining if an incident constitutes a breach)?

**Finding criteria**: Rate HIGH if HIPAA breach notification timelines and requirements are absent from all 14 skills.

### 7.6 — Group Therapy / Multi-Participant Sessions
Evaluate: The platform has a `therapy-groups-support-groups` feature:
- [ ] Does any skill address the unique HIPAA considerations for group therapy (each participant's presence in a group is itself PHI)?
- [ ] Does `mock-external-services` include Twilio room configurations for 3+ participants?
- [ ] Does `test-data-factory` include a group session scenario?
- [ ] Does `api-response-sanitizer` verify that a group participant's identity is not visible to other participants via the API?

**Finding criteria**: Rate MEDIUM if group session scenarios are absent given the feature exists in the product roadmap.

### 7.7 — Wiley Treatment Planner Integration
Evaluate: The platform includes a Wiley Treatment Planner feature:
- [ ] Does any skill address the licensing and IP compliance requirements for Wiley content (a third-party clinical decision support tool)?
- [ ] Does any skill address the PHI implications of treatment plan data created using Wiley content?
- [ ] Is there a mock for the Wiley API in `mock-external-services`?

**Finding criteria**: Rate MEDIUM if Wiley integration is in the product and has no mock or compliance note in any skill.

---

## Audit Dimension 8: Commercial Viability

**Objective**: Evaluate whether the 14 skills, as a set, would satisfy the documented-process requirements of a healthcare compliance officer, SOC 2 Type II auditor, or health system procurement review. This is not about whether the platform IS compliant, but whether the DEVELOPMENT PROCESS has evidence of compliance thinking.

### 8.1 — SOC 2 Type II Evidence Requirements
A SOC 2 Type II audit requires evidence that controls are operating continuously over the audit period. Evaluate:

| SOC 2 Control Area | Required Evidence | Skill That Could Produce Evidence | Gap? |
|---|---|---|---|
| CC6.1 — Logical access controls | Evidence of access control review | `hipaa-compliance-audit`, `backend-endpoint-security-test` | Do these skills produce datable, archivable reports? |
| CC6.6 — Security events monitored | Evidence of security monitoring | `security-code-review`, `phi-pii-leak-scan` | Are these designed for periodic scheduled runs? |
| CC7.2 — System monitoring | Evidence of anomaly detection | No skill currently covers runtime monitoring | MISSING |
| CC8.1 — Change management | Evidence of security review in SDLC | `deployment-readiness-check` | Is this integrated into CI/CD? |
| CC9.2 — Vendor risk management | Evidence of third-party service review | `mock-external-services` (indirectly) | No explicit vendor risk assessment skill |
| A1.2 — Availability monitoring | Evidence of service degradation handling | `mock-settings-manager` (offline profile) | Is this designed to test recovery, not just failure? |

**Finding criteria**: Rate HIGH if the skills do not produce archivable, timestamped outputs (SOC 2 requires evidence with dates). Rate HIGH if no skill covers runtime security monitoring (CC7.2).

### 8.2 — HIPAA Risk Analysis Requirement (§164.308(a)(1))
HIPAA requires a documented, periodic risk analysis of threats and vulnerabilities to PHI. Evaluate:

- [ ] Do the 14 skills collectively constitute a risk analysis, or do they constitute a development checklist?
- [ ] Is there a skill that synthesizes findings from `hipaa-compliance-audit`, `security-code-review`, `phi-pii-leak-scan`, and `api-response-sanitizer` into a single risk register?
- [ ] Does any skill instruct the developer to assign likelihood and impact ratings to findings (not just severity of the code issue)?
- [ ] Does any skill produce output that can serve as the "documentation of the risk analysis" required by §164.308(a)(1)(ii)(D)?

**Finding criteria**: Rate HIGH if no skill produces a consolidated risk register. The existence of 14 individual checklists does not constitute a HIPAA risk analysis without synthesis.

### 8.3 — Business Associate Agreement (BAA) Coverage
Verify that `hipaa-compliance-audit` identifies all vendors requiring a BAA:

| Vendor | PHI Exposure | BAA Required? | Covered in Skill? |
|---|---|---|---|
| Twilio | Video content, participant identities | YES (Twilio has BAA program) | Check |
| Stripe | Payment data only (not PHI under HIPAA) | NO (payment data not PHI) | Is this distinction made? |
| SendGrid | Email content may contain PHI (appointment confirmations) | YES (Twilio SendGrid has BAA) | Check |
| Azure | Search index may contain provider PHI | YES (Azure HIPAA BAA available) | Check |
| Certn/Sterling | Background check data (not PHI) | NO (not a covered function) | Is this distinction made? |
| MailModo | Email content may contain PHI | YES if PHI in email | Check |
| ipapi | IP geolocation (not PHI) | NO | Is this correctly classified? |

**Finding criteria**: Rate CRITICAL if Twilio or SendGrid are not identified as requiring BAAs. Rate HIGH if the skill does not distinguish between PHI-touching and non-PHI-touching vendors (treating all vendors the same way).

### 8.4 — Developer Training Evidence
A compliance officer will ask: "How do you ensure developers know how to handle PHI?"
Evaluate:
- [ ] Do the skill descriptions include enough healthcare context that a developer new to healthcare would understand WHY each step matters (not just WHAT to do)?
- [ ] Is there a skill or README that orients a new developer to the PHI sensitivity tiers before they begin using the other skills?
- [ ] Do the skills collectively form a training artifact, or are they purely operational?

**Finding criteria**: Rate MEDIUM if skills contain no "why" context — they are useful for experienced developers but provide no training value. This affects the platform's ability to demonstrate a culture of compliance.

### 8.5 — Audit Frequency and Scheduling
Evaluate: Are the skills designed for one-time use or periodic re-execution?
- [ ] Do the output files include timestamps in their filenames (allowing historical comparison)?
- [ ] Does `deployment-readiness-check` specify that it must be run before EVERY deployment, not just the first?
- [ ] Does `hipaa-compliance-audit` specify a recommended frequency (HIPAA requires annual risk analysis at minimum)?
- [ ] Do any skills support delta reporting (comparing current run against previous run to show regression)?

**Finding criteria**: Rate HIGH if no skill specifies execution frequency. A checklist run once and forgotten provides no ongoing compliance assurance.

---

## Audit Output Format Requirements

Your findings document MUST use this structure:

```markdown
# Healthcare Skills UX/Scenario/Commercial Audit — Findings
**Audit Date**: YYYY-MM-DD
**Skills Audited**: 14 (phi-pii-leak-scan through deployment-readiness-check)
**Auditor**: [role description]

## Executive Summary
[3-5 sentence summary of overall quality and most critical gaps]

## Severity Distribution
| Severity | Count |
|---|---|
| CRITICAL | N |
| HIGH | N |
| MEDIUM | N |
| LOW | N |
| INFO | N |

## Findings

### FINDING-001 [SEVERITY]
**Dimension**: [e.g., "2.2 Crisis Pathway"]
**Skills Affected**: [skill names]
**Finding**: [1-2 sentences describing the gap or deficiency]
**Evidence**: [what was checked and what was found]
**Remediation**: [specific action to fix, with reference to the skill file and section]
**Rationale**: [why this matters in a healthcare marketplace context]

[repeat for each finding, ordered by severity descending]

## Gap Summary (Dimension 7)
[List of uncovered scenarios and recommended skill additions]

## SOC 2 / HIPAA Readiness Assessment
[Brief assessment of whether the skill set would satisfy a compliance auditor's process review]

## Recommended Next Skills (Priority Order)
1. [skill-name]: [one-sentence justification]
...
```

---

## Pre-Audit Checklist

Before beginning the audit, verify:
1. All 14 skill files exist at `C:\Projects\ReallyGlobal\.claude\skills\<skill-name>\SKILL.md`
2. Read each SKILL.md in full before rating any dimension
3. Cross-reference skill claims against actual codebase files (do not assume a skill is correct because it references a file path — verify the path exists)
4. For healthcare terminology checks, use the references cited in this prompt (CFR citations, Stripe decline codes, Twilio error codes) — do not rely on general knowledge alone
5. Rate each finding independently — a single CRITICAL finding does not inflate the severity of adjacent findings

If a skill file is missing entirely, rate it CRITICAL for the dimensions it was intended to cover.
