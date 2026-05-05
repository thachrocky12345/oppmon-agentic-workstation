# Healthcare Skills UX/Scenario/Commercial Audit -- Findings
**Audit Date**: 2026-03-01
**Skills Audited**: 6 of 14 implemented; 8 skill directories created but empty (no SKILL.md)
**Auditor**: Senior Healthcare Software Auditor (HIPAA compliance, clinical workflow design, SOC 2 Type II, crisis intervention protocol)

---

## Executive Summary

Of the 14 planned healthcare skills, only 6 have been implemented with SKILL.md files: `phi-pii-leak-scan`, `hipaa-compliance-audit`, `security-code-review`, `test-data-factory`, `mock-external-services`, and `mock-settings-manager`. The remaining 8 skills -- `patient-data-integrity-check`, `api-response-sanitizer`, `frontend-test-scaffold`, `credential-verification-workflow`, `django-model-security-hardening`, `consent-tracking-audit`, `backend-endpoint-security-test`, and `deployment-readiness-check` -- have empty directories with no content. This means the skill set has no coverage for consent tracking, credential verification, deployment readiness, model-level security hardening, data integrity checking, API response sanitization, frontend testing scaffolding, or endpoint security testing. The missing skills represent critical gaps in patient safety (no consent tracking for minors, no credential verification enforcement), regulatory compliance (no HIPAA Privacy Rule consent mechanisms), and operational security (no deployment gate, no endpoint auth testing). Among the 6 implemented skills, the quality is generally strong for static analysis and mock infrastructure, but there are material gaps in clinical domain accuracy, crisis pathway completeness, and regulatory specificity.

## Severity Distribution
| Severity | Count |
|---|---|
| CRITICAL | 12 |
| HIGH | 18 |
| MEDIUM | 14 |
| LOW | 5 |
| INFO | 3 |

---

## Findings

### FINDING-001 [CRITICAL]
**Dimension**: 1 (User Journey Coverage) -- Skills 11-14 Missing Entirely
**Skills Affected**: `consent-tracking-audit`, `backend-endpoint-security-test`, `deployment-readiness-check`, `django-model-security-hardening`
**Finding**: 8 of 14 skill directories are empty -- they were created but contain no SKILL.md file. The following skills are completely absent: `patient-data-integrity-check`, `api-response-sanitizer`, `frontend-test-scaffold`, `credential-verification-workflow`, `django-model-security-hardening`, `consent-tracking-audit`, `backend-endpoint-security-test`, `deployment-readiness-check`.
**Evidence**: `ls -la` on each directory shows zero files. Directories were created on 2026-03-01 22:07 but no content was written.
**Remediation**: The IMPLEMENTER agent must complete all 8 remaining SKILL.md files before this skill set can be considered viable. Priority order: (1) `consent-tracking-audit` (HIPAA Privacy Rule), (2) `credential-verification-workflow` (patient safety), (3) `backend-endpoint-security-test` (access control), (4) `deployment-readiness-check` (production gate), (5) `django-model-security-hardening`, (6) `api-response-sanitizer`, (7) `patient-data-integrity-check`, (8) `frontend-test-scaffold`.
**Rationale**: Without consent tracking, credential verification, and endpoint security testing, the platform has no developer-facing guidance for the most legally sensitive operations in a healthcare marketplace. This is a non-negotiable gap for any compliance review.

---

### FINDING-002 [CRITICAL]
**Dimension**: 1.2 (Client Journey -- Risk Screening) and 2.2 (Crisis Pathway)
**Skills Affected**: `test-data-factory`, `mock-settings-manager`
**Finding**: The `CrisisScreeningScenario` in `test-data-factory` sets `final_score=27` but does not produce per-question `ResponseDetail` records that sum to 27. Only one `ResponseDetail` with `score=9` is created. The PHQ-9 instrument has 9 questions scored 0-3 (max 27); a `final_score` of 27 requires 9 detail records each scoring 3. The scenario also does not create a `ClientScreeningIgnore` record to demonstrate the bypass path, does not reference PHQ-9 item 9 (the suicidality question) specifically, and does not verify that the booking flow is interrupted.
**Evidence**: `CrisisScreeningScenario.create()` at lines 305-331 of `test-data-factory/SKILL.md` creates a single `ResponseDetailFactory` with `score=9`, which is not a valid PHQ-9 per-question score (max is 3). The `final_keywords` list is populated but there is no mapping to specific PHQ-9 items.
**Remediation**: (1) Create 9 `ResponseDetail` records each with `score=3` to correctly sum to 27. (2) Add a specific `ResponseDetail` for PHQ-9 item 9 with `score=3` (indicating active suicidal ideation). (3) Add a `ClientScreeningIgnore` record factory. (4) Document that the crisis scenario should NOT produce a completed booking (the flow interrupts). (5) Add crisis resource URL assertions.
**Rationale**: A PHQ-9 item 9 score of 2 or 3 is the standard clinical threshold for active suicidal ideation screening. If the test data factory produces internally inconsistent screening data, tests built on it will not validate the actual crisis intervention pathway. This is a patient safety gap.

---

### FINDING-003 [CRITICAL]
**Dimension**: 1.3 (Client Journey -- Account Creation) and 2.5 (Minor/Dependent Care)
**Skills Affected**: All 14 skills (none covers this)
**Finding**: No implemented skill addresses the minor client flow. The `User.parent_user` FK and `User.date_of_birth` fields exist in the data model, but no skill produces a minor client scenario, verifies parental consent, enforces `parent_user` linkage, or addresses jurisdiction-specific age-of-consent rules. `test-data-factory` does not include a minor client scenario.
**Evidence**: Searched all 6 implemented SKILL.md files for `parent_user`, `minor`, `date_of_birth`, `age`, `guardian`, `parental` -- no matches in any skill's workflow or scenario definitions.
**Remediation**: (1) Add a `MinorClientScenario` to `test-data-factory` that creates a User with `date_of_birth` within 18 years and a linked `parent_user`. (2) When `consent-tracking-audit` is implemented, include parental consent verification for minor accounts. (3) When `backend-endpoint-security-test` is implemented, include a test that minor accounts cannot be created without `parent_user` linkage. (4) Document jurisdiction-specific age-of-consent rules (e.g., CA allows 12+ for mental health without parental consent).
**Rationale**: Minor clients are a legally distinct protection class. HIPAA section 164.502(g)(3) requires specific handling when state law allows minors to consent to treatment. A mental health platform without minor consent enforcement exposes the organization to regulatory action.

---

### FINDING-004 [CRITICAL]
**Dimension**: 1.13 (Client Journey -- Account Deletion) and 4.2 (HIPAA Privacy Rule)
**Skills Affected**: `consent-tracking-audit` (missing), `hipaa-compliance-audit` (partial)
**Finding**: No skill addresses HIPAA Privacy Rule requirements: Notice of Privacy Practices (NPP) delivery at signup (164.520), right of access to PHI within 30 days (164.524), amendment rights (164.526), or accounting of disclosures (164.528). The `hipaa-compliance-audit` skill focuses exclusively on Technical Safeguards (164.312) and does not cover the Privacy Rule (164 Subpart E) at all. The missing `consent-tracking-audit` was supposed to cover these, but it has no implementation.
**Evidence**: `hipaa-compliance-audit/SKILL.md` workflow steps cover 164.312(a) through 164.312(e) plus BAA checks, but there is no mention of 164.520, 164.524, 164.526, or 164.528. No GDPR right-to-deletion or data export mechanism is addressed by any skill.
**Remediation**: (1) Implement `consent-tracking-audit` with explicit checks for NPP delivery at signup, right of access mechanism, amendment request workflow, and accounting of disclosures. (2) Expand `hipaa-compliance-audit` to add a Step 9 covering Privacy Rule requirements or reference the `consent-tracking-audit` as a companion skill. (3) Add GDPR DSR (Data Subject Rights) workflow verification if the platform serves non-US clients.
**Rationale**: NPP delivery at signup is a Required element under HIPAA. Failure to verify it exists means the platform cannot demonstrate compliance with fundamental Privacy Rule obligations. A compliance officer would flag this immediately.

---

### FINDING-005 [CRITICAL]
**Dimension**: 7.1 (Emergency Protocol Coverage)
**Skills Affected**: All 14 skills
**Finding**: No skill addresses the post-crisis escalation workflow beyond the `mock-settings-manager` crisis-flow profile. Specifically: (1) Duty to warn / Tarasoff obligations are not mentioned in any skill. (2) Mandatory reporting requirements (child abuse, elder abuse, imminent self-harm) are not addressed. (3) When `is_severe=True` is set, no skill documents what the platform should do beyond displaying hotline numbers (e.g., alert to platform safety team, lock account for review, mandatory follow-up contact). (4) Post-crisis follow-up workflow is absent.
**Evidence**: Searched all 6 SKILL.md files for `Tarasoff`, `duty to warn`, `mandatory report`, `crisis escalation`, `follow-up`, `safety team` -- zero matches.
**Remediation**: (1) Create a new skill `crisis-response-protocol` documenting the full escalation chain: detection -> notification -> safety team alert -> crisis resource display -> mandatory follow-up within 48 hours. (2) Add Tarasoff obligation documentation to `hipaa-compliance-audit` or the new crisis skill. (3) Add mandatory reporting workflow guidance. (4) Include platform-side administrative actions (e.g., admin notification, account review) in the escalation chain.
**Rationale**: A mental health platform that detects suicidality but has no documented response beyond displaying a phone number is legally and ethically exposed. Duty to warn and mandatory reporting are not optional -- they are legal obligations that vary by jurisdiction.

---

### FINDING-006 [CRITICAL]
**Dimension**: 3.1 (NPI Number Validation)
**Skills Affected**: `credential-verification-workflow` (missing), `test-data-factory`
**Finding**: The `credential-verification-workflow` skill is unimplemented, so there is no NPI validation specification. However, `test-data-factory` includes an NPI generation method in `HealthcareProvider.npi_number()` that implements the Luhn algorithm with `80840` prefix. The implementation appears structurally correct (prepends 80840, applies modified Luhn), but has a subtle error: the Luhn algorithm implementation doubles digits at even positions from the right (0-indexed), which is the standard approach, but the `80840` prefix + 9-digit base = 14 digits, and the check digit should make the complete 15-digit number (80840 + 10 NPI digits) pass the Luhn test with remainder 0. The code calculates the check digit to append, but does not distinguish Type 1 (starts with 1, individual) vs Type 2 (starts with 2, organizational) in the `npi_number()` method -- it randomly chooses 1 or 2.
**Evidence**: `test-data-factory/SKILL.md` lines 63-77 show the NPI generation. The code randomly selects prefix '1' or '2'. For a healthcare marketplace matching individual providers, Type 2 NPIs (organizational) should not be generated as individual provider NPIs.
**Remediation**: (1) Implement `credential-verification-workflow` with full NPI validation including the `80840` prefix Luhn check. (2) In `test-data-factory`, default `npi_number()` to Type 1 (prefix '1') for individual providers and add a separate method or parameter for Type 2. (3) Add NPI format range validation (Type 1: 1,000,000,000-1,999,999,999; Type 2: 2,000,000,000-2,999,999,999). (4) Document the distinction in the `credential-verification-workflow` skill.
**Rationale**: Incorrect NPI validation will accept bogus NPIs and reject valid ones. Using organizational NPIs for individual providers would fail verification against the NPPES registry.

---

### FINDING-007 [CRITICAL]
**Dimension**: 4.3 (Telehealth-Specific Regulations)
**Skills Affected**: `credential-verification-workflow` (missing), `consent-tracking-audit` (missing)
**Finding**: No implemented skill addresses cross-state licensure verification. The platform is a telehealth marketplace where providers and clients may be in different US states. Most US jurisdictions require the provider to hold a license in the CLIENT's state (not just the provider's home state). No skill verifies this at booking time. Additionally, no skill addresses: (a) telehealth-specific informed consent requirements, (b) PSYPACT/NLC interstate compacts, or (c) prescribing restrictions under the Ryan Haight Act.
**Evidence**: Searched all 6 SKILL.md files for `cross-state`, `interstate`, `PSYPACT`, `NLC`, `client.*state`, `telehealth consent`, `Ryan Haight` -- zero matches. The `ProfessionalLicenseFactory` in `test-data-factory` creates a license for state "CA" only, with no scenario testing cross-state booking validation.
**Remediation**: (1) `credential-verification-workflow` must include a check that verifies the provider's license covers the client's state at booking time. (2) Include PSYPACT/NLC compact acknowledgment for psychology/nursing licenses. (3) `consent-tracking-audit` must identify telehealth-specific informed consent as a required consent point. (4) Document Ryan Haight Act boundaries as out-of-scope if prescribing is not supported.
**Rationale**: Cross-state licensure is the single largest legal liability for US telehealth platforms. A provider practicing in a state where they are not licensed constitutes unauthorized practice, exposing both the provider and the platform.

---

### FINDING-008 [CRITICAL]
**Dimension**: 4.4 (Minor Consent Regulations)
**Skills Affected**: `consent-tracking-audit` (missing)
**Finding**: No skill addresses jurisdiction-specific minor consent rules. This is distinct from FINDING-003 (which addresses the absence of minor scenarios in test data). Here, the issue is that no skill specifies the legal framework: HIPAA 164.502(g)(3) allows minors to exercise their own rights when state law permits them to consent to treatment. Common carve-outs include: CA mental health at 12+, substance abuse treatment in many states at 12+. No skill specifies that a single global age-of-majority (18) is insufficient.
**Evidence**: No SKILL.md file contains references to 164.502(g)(3), minor consent carve-outs, or state-specific age thresholds.
**Remediation**: When `consent-tracking-audit` is implemented, it must: (1) identify that a single global age threshold is insufficient, (2) specify that the platform needs jurisdiction-aware consent logic, (3) verify that records created under minor self-consent are withheld from parent/guardian view.
**Rationale**: A compliance officer reviewing a mental health platform serving minors will immediately ask about minor consent rules. The absence of any framework here would be flagged as a deficiency.

---

### FINDING-009 [CRITICAL]
**Dimension**: 8.3 (BAA Coverage)
**Skills Affected**: `hipaa-compliance-audit`
**Finding**: The `hipaa-compliance-audit` skill's BAA section (Step 7) checks for external service import paths but does not explicitly identify which vendors require a Business Associate Agreement. It checks whether Twilio, Stripe, SendGrid, and Azure calls are isolated in dedicated modules, but it does not produce a vendor-by-vendor BAA determination. Critically, it does not distinguish between PHI-touching vendors (Twilio, SendGrid, Azure -- require BAA) and non-PHI vendors (Stripe for payment-only data -- no BAA required for payment data alone; Certn/Sterling -- not a covered function; ipapi -- not PHI). The skill also does not mention MailModo, which appears in the platform's email integration and may touch PHI.
**Evidence**: `hipaa-compliance-audit/SKILL.md` Step 7 (lines 194-215) contains `grep` commands checking import isolation but no table mapping vendors to BAA requirements. No mention of MailModo, which is referenced in `mailmodo-signup-triggers` feature doc.
**Remediation**: Add a BAA determination table to Step 7 output with columns: Vendor, PHI Exposure (Yes/No with justification), BAA Required (Yes/No), BAA Obtained (Yes/No/Unknown). Include: Twilio (YES -- video content contains PHI), SendGrid (YES -- email content may contain appointment details), Azure (YES -- search index contains provider data that may include PHI), Stripe (NO -- payment data is not PHI under HIPAA), Certn/Sterling (NO -- background check data is not PHI), MailModo (YES if email content contains PHI), ipapi (NO -- IP geolocation is not PHI).
**Rationale**: If Twilio or SendGrid process PHI without a BAA, every session and every notification email constitutes a HIPAA violation. This is not theoretical -- it is the most common compliance failure in telehealth startups.

---

### FINDING-010 [CRITICAL]
**Dimension**: 4.1 (HIPAA Technical Safeguards -- Required)
**Skills Affected**: `hipaa-compliance-audit`
**Finding**: The `hipaa-compliance-audit` skill does not check for emergency access procedures (164.312(a)(2)(ii)), which is a Required (not Addressable) safeguard. The skill's Step 1 covers access controls generally but does not verify the existence of a documented emergency override procedure. Additionally, the skill does not check for person/entity authentication via multi-factor authentication (164.312(d)), which is Required.
**Evidence**: `hipaa-compliance-audit/SKILL.md` Steps 1-8 do not contain checks for "emergency access", "emergency override", "break-glass", or "multi-factor". The compliance matrix template at line 229 lists "Emergency Access Procedure" as PASS/FAIL but the workflow has no step that checks for it.
**Remediation**: (1) Add a workflow step that checks for emergency access procedure documentation (break-glass account, emergency admin override). (2) Add a check for MFA capability -- verify whether the platform supports MFA (Twilio Verify OTP exists but is used for phone verification, not for login MFA). (3) Update the compliance matrix output to accurately reflect these gaps.
**Rationale**: Emergency access and entity authentication are Required safeguards under HIPAA. An auditor cannot mark these as "not applicable" -- they must be addressed or documented with a specific compensating control.

---

### FINDING-011 [CRITICAL]
**Dimension**: 2.4 (Provider Credential Issues)
**Skills Affected**: `credential-verification-workflow` (missing), `test-data-factory`
**Finding**: The `credential-verification-workflow` skill is unimplemented, meaning there is no mechanism to detect or flag providers with expired credentials, invalid NPI format, adverse background check results, or pre-licensed status without supervisor assignment. The `test-data-factory` includes a `NewProviderOnboardingScenario` with `is_licensed=False` and `npi_number=None`, and a `PreLicensedFactory`, but does not include scenarios for: (a) expired NPI, (b) expired professional license, (c) adverse background check, (d) pre-licensed provider without supervisor, (e) provider with `is_licensed=False` but SCHEDULED appointments.
**Evidence**: `test-data-factory/SKILL.md` `NewProviderOnboardingScenario` creates a bare-bones unlicensed provider but does not test the critical data integrity violation of an unlicensed provider having active bookings. `PreLicensedFactory` creates a pre-licensed record but does not link it to the care provider or verify supervisor association.
**Remediation**: (1) Implement `credential-verification-workflow` with severity-rated findings. (2) Add `ExpiredCredentialScenario` to `test-data-factory` with: expired NPI date, expired license date, adverse background check, pre-licensed without supervisor. (3) Add a `DataIntegrityViolationScenario` with `is_licensed=False` + SCHEDULED appointments. (4) `PreLicensedFactory` should link to the CareProvider and enforce that `supervisor_name` and `supervisor_license_number` are populated.
**Rationale**: A provider with expired credentials or adverse background check who can still receive bookings is a direct patient safety and legal liability issue.

---

### FINDING-012 [HIGH]
**Dimension**: 2.1 (Happy Path -- CompletedSessionScenario)
**Skills Affected**: `test-data-factory`
**Finding**: The `CompletedSessionScenario` is missing a `VideoCallRoom` record linked to the appointment's `room_name`. The scenario creates an `Appointment` and `Notes` but does not create a `VideoCallRoom` record. Additionally, there is no payment record with `payment_intent_id` and SUCCEEDED status -- the appointment has `payment_status=2` but no corresponding `StripeUser` with a successful payment intent. The `StripeUserFactory` is created but is linked to the provider user, not the client. There is also no post-session survey response.
**Evidence**: `CompletedSessionScenario.create()` at lines 266-302 creates: provider, client, appointment, notes, stripe_user. Missing: VideoCallRoom, client-side payment record, post-session survey.
**Remediation**: (1) Add `VideoCallRoomFactory(room_name=appointment.room_name)` to the scenario. (2) Create a client-side StripeUser/payment record or at minimum set `appointment.payment_intent_id` to a mock Stripe PI ID. (3) Add a post-session survey response if the model exists. (4) Return a `VideoCallRoom` key in the result dict.
**Rationale**: A broken happy path means no baseline for regression testing. If the completed session scenario is missing the video room link, tests verifying end-to-end session completion will fail or produce false positives.

---

### FINDING-013 [HIGH]
**Dimension**: 2.3 (Payment Failures)
**Skills Affected**: `mock-external-services`, `mock-settings-manager`
**Finding**: The Stripe mock in `mock-external-services` is missing several critical decline codes and failure modes. Present: `card_declined`, `insufficient_funds`, `3ds_required`, `fraud_detected`. Missing: `card_velocity_exceeded`, `do_not_honor`, dispute/chargeback webhook event, full and partial refund scenarios, payment timeout (network failure mid-intent). Additionally, the Stripe mock uses `error.code = "card_declined"` but the actual Stripe API has TWO distinct fields: `code` (the error type, e.g., `card_declined`) and `decline_code` (the specific reason, e.g., `generic_decline`, `insufficient_funds`). The mock conflates these. PayPal failure mocks are also absent from `mock-external-services` despite `mock_paypal` existing in the test conftest.
**Evidence**: `mock-external-services/SKILL.md` `MockStripeClient.FAILURE_MODES` at line 133: `["success", "card_declined", "insufficient_funds", "3ds_required", "fraud_detected", "timeout", "rate_limit", "server_error", "auth_failure"]`. Missing: `card_velocity_exceeded`, `do_not_honor`. Error construction at line 162-164 sets only `error.code`, not `error.decline_code`.
**Remediation**: (1) Add `card_velocity_exceeded` and `do_not_honor` to `FAILURE_MODES`. (2) Distinguish `code` vs `decline_code` in error objects: set `error.code = "card_declined"` and `error.decline_code = "insufficient_funds"` (etc.). (3) Add `dispute_webhook` mode that produces a `charge.dispute.created` webhook event. (4) Add `refund_full` and `refund_partial` modes. (5) Add PayPal mock class (`MockPayPalClient`) covering order failure scenarios. (6) Add `payment_timeout` mode simulating network failure mid-intent.
**Rationale**: Using invented error codes (or missing the `code` vs `decline_code` distinction) means tests will never reproduce real production Stripe behavior. Missing decline codes like `do_not_honor` are among the most common real-world declines.

---

### FINDING-014 [HIGH]
**Dimension**: 5.2 (Twilio Mock Realism)
**Skills Affected**: `mock-external-services`
**Finding**: The Twilio mock uses generic `Exception` with string messages containing error codes (e.g., `Exception("Room is full (53205)")`) instead of Twilio's actual exception classes (`TwilioRestException` with `code`, `status`, `method`, `uri` attributes). The error code 53205 is used for `room_full` but the correct Twilio error code for max participants reached is 53105. The mock does not produce JWT tokens in a valid structure (returns `b"mock.jwt.token"` instead of a three-part base64 JWT). The `recording_failed` and `participant_disconnected` modes are listed in `FAILURE_MODES` but not implemented in `_configure()`. The Twilio Conversations mock is absent.
**Evidence**: `mock-external-services/SKILL.md` `MockTwilioClient._configure()` at lines 74-106. Error code 53205 at line 103 does not match the audit prompt's expected 53105. `recording_failed` and `participant_disconnected` appear in `FAILURE_MODES` list (line 63) but have no corresponding `elif` branch. Token mock returns `b"mock.jwt.token"` (line 83) which is not a valid JWT structure.
**Remediation**: (1) Use `TwilioRestException` (or a mock that matches its interface) instead of generic `Exception`. (2) Fix error code to 53105 for room_full. (3) Implement `recording_failed` and `participant_disconnected` branches. (4) Return a three-part base64 JWT for token mock. (5) Add Twilio Conversations mock for DM/messaging features. (6) Generate `room_sid` in correct `RM` + 32 hex char format (already done correctly).
**Rationale**: Mocks using invented error codes will never reproduce real production Twilio behavior. Unimplemented failure modes listed in `FAILURE_MODES` will cause silent test failures.

---

### FINDING-015 [HIGH]
**Dimension**: 5.3 (SendGrid Mock Realism)
**Skills Affected**: `mock-external-services`
**Finding**: The SendGrid mock does not distinguish hard bounce (`bounced`) vs soft bounce (`deferred`). The `bounce` failure mode returns HTTP 550, which is an SMTP status code -- SendGrid's API returns HTTP 2xx for accepted messages and delivers bounce/deferred events via webhooks. The mock conflates the API response with the event webhook pattern. The mock also does not capture `dynamic_template_data` from messages, does not validate template IDs, and is missing `spam_report`, `open`, and `delivered` event types (listed in `FAILURE_MODES` but `spam_report` and `invalid_recipient` are not implemented in the `send()` method).
**Evidence**: `mock-external-services/SKILL.md` `MockSendGridClient` at lines 197-234. The `bounce` mode returns `status_code = 550` (line 222), which is an SMTP bounce code, not an HTTP status code. SendGrid API would return 202 (accepted) and then fire a webhook event of type `bounced`. Only `success`, `bounce`, and `timeout` are implemented in `send()`.
**Remediation**: (1) Change the mock pattern: `send()` should always return 202 (accepted) for valid messages, then provide separate webhook event methods (`simulate_bounce_webhook()`, `simulate_spam_report_webhook()`). (2) Distinguish hard bounce (`bounced`) from soft bounce (`deferred`). (3) Implement `spam_report` and `invalid_recipient` modes. (4) Capture `dynamic_template_data` for assertion.
**Rationale**: Hard bounces and soft bounces require different business logic (hard bounce = remove from list; soft bounce = retry). Conflating them means the mock cannot validate correct bounce handling.

---

### FINDING-016 [HIGH]
**Dimension**: 5.5 (Certn/Sterling Background Check Mock Realism)
**Skills Affected**: `mock-external-services`
**Finding**: The Sterling/Certn mock does not model the asynchronous polling pattern (status transitions from `pending` -> `in_progress` -> `complete`). It returns a static status per failure mode. It also does not model the adverse action flow: Certn/Sterling adverse action requires a 5-day waiting period, notification to the candidate, and opportunity to dispute before final action. The mock has an `adverse_action` mode that returns `{"status": "complete", "result": "adverse_action"}` but does not model the multi-step flow. The `MockCertnClient` is just a subclass alias of `MockSterlingClient` with no Certn-specific behavior.
**Evidence**: `mock-external-services/SKILL.md` `MockSterlingClient.get_screening_status()` at lines 286-296 returns a static dict. No state machine or transition logic.
**Remediation**: (1) Add a stateful mock that transitions through `pending` -> `in_progress` -> `complete` on successive calls. (2) Model the adverse action flow with: initial result -> pre-adverse notification -> 5-day wait -> final adverse action. (3) Differentiate Certn-specific status values (`pending`, `in_progress`, `complete`, `cancelled`) from Sterling values if they differ. (4) Add a `stale_pending` mode for testing SLA violations.
**Rationale**: The adverse action flow is a regulatory requirement under FCRA (Fair Credit Reporting Act). A background check vendor mock that skips this flow cannot validate the platform's legal obligations.

---

### FINDING-017 [HIGH]
**Dimension**: 7.2 (Multi-Provider Care Coordination)
**Skills Affected**: All 14 skills
**Finding**: No skill addresses cross-provider note isolation -- whether Provider A can access session notes written by Provider B for the same client. The `Notes` model has a `care_provider` FK, but no skill tests that the queryset is filtered by the requesting provider. No skill addresses shared care plans, referral workflows, or consent-based data sharing between providers.
**Evidence**: `phi-pii-leak-scan` mentions `Notes.notes` model in Tier 1 PHI and notes "no per-user query filtering" in Known Patterns (item 4), but this is flagged as a known gap, not a tested scenario. No skill produces a test verifying isolation.
**Remediation**: (1) When `backend-endpoint-security-test` is implemented, include a cross-provider isolation test: create two providers serving the same client, verify that Provider A's notes API call does not return Provider B's notes. (2) When `api-response-sanitizer` is implemented, verify that clinical notes endpoints enforce ownership filtering. (3) Document referral workflow as a future feature with PHI transfer consent requirements.
**Rationale**: If Provider A can read Provider B's notes for a shared client, this violates the HIPAA minimum necessary standard. In a mental health context, this could expose extremely sensitive information.

---

### FINDING-018 [HIGH]
**Dimension**: 7.4 (Legal Discovery and Audit Trail)
**Skills Affected**: `hipaa-compliance-audit`
**Finding**: No skill produces a complete audit trail suitable for legal discovery. The `hipaa-compliance-audit` skill's Step 2 (Audit Controls) correctly identifies that audit logging is likely absent, but does not provide a mechanism for generating a complete PHI access log between two dates. No skill addresses data preservation / litigation hold, credential review audit trail (which admin approved which provider), or complete clinical notes export for a specific client.
**Evidence**: `hipaa-compliance-audit/SKILL.md` Step 2 (lines 83-106) checks for audit logging presence but `Expected finding: Likely NO audit logging exists. Remediation: Install django-auditlog`. The skill does not go further to specify what the audit log should capture or how to produce a discovery-ready export.
**Remediation**: (1) Expand `hipaa-compliance-audit` Step 2 to specify the minimum audit log fields: user_id, action, model, record_id, timestamp, IP address, field-level changes. (2) Add a new skill `legal-discovery-export` or add steps to an existing skill for generating: client-specific PHI export, provider credential approval trail, appointment/session history with all associated notes. (3) Specify data preservation (litigation hold) procedures.
**Rationale**: When (not if) the platform receives a legal subpoena, the inability to produce a complete audit trail within the court-ordered timeframe constitutes a compliance failure and potential contempt.

---

### FINDING-019 [HIGH]
**Dimension**: 7.5 (Incident Response and Breach Notification)
**Skills Affected**: All 14 skills
**Finding**: No skill addresses the HIPAA Breach Notification Rule (45 CFR Part 164 Subpart D). Specifically: no skill walks through individual notification within 60 days of discovery, HHS notification (immediate if 500+ individuals), media notification for breaches affecting 500+ in a state, or the 4-factor breach risk assessment test.
**Evidence**: Searched all 6 SKILL.md files for `breach`, `notification`, `incident response`, `Subpart D`, `60 days`, `HHS` -- zero matches.
**Remediation**: Create a new skill `incident-response-breach-notification` covering: (1) breach detection criteria (the 4-factor test), (2) notification timelines (individual: 60 days, HHS: 60 days or annual log, media: if 500+ in a state), (3) documentation requirements, (4) breach log maintenance. Alternatively, add a Step 9 to `hipaa-compliance-audit` covering breach notification readiness.
**Rationale**: Breach notification compliance is not aspirational -- it is a legal obligation with specific timelines and penalties. The absence of any guidance here means a developer responding to a security incident has no skill-based framework for compliance.

---

### FINDING-020 [HIGH]
**Dimension**: 8.1 (SOC 2 Type II Evidence)
**Skills Affected**: All 14 skills
**Finding**: No skill is designed for periodic scheduled re-execution or produces timestamped, archivable output. The output format specifications in the implemented skills use `[DATE]` placeholders but do not specify file naming with dates or output directory conventions. No skill covers runtime security monitoring (SOC 2 CC7.2). No skill covers vendor risk assessment (SOC 2 CC9.2). The `deployment-readiness-check` skill (which should serve as CC8.1 evidence) is unimplemented.
**Evidence**: `phi-pii-leak-scan` output template uses `# PHI/PII Leak Scan Report -- [DATE]` (line 217). `hipaa-compliance-audit` uses `# HIPAA Technical Safeguards Compliance Matrix -- [DATE]`. Neither specifies the output file path with a date-stamped filename for archival.
**Remediation**: (1) Add to each skill's output specification: a standard output path like `ContextFiles2/Library/Sessions/{skill-name}_Results_{YYYY-MM-DD}.md`. (2) Add a "Recommended Frequency" field to each skill's frontmatter (e.g., `phi-pii-leak-scan`: every PR; `hipaa-compliance-audit`: quarterly). (3) Add delta reporting: compare current run against previous run file. (4) Create `runtime-security-monitoring` and `vendor-risk-assessment` skills to cover CC7.2 and CC9.2.
**Rationale**: SOC 2 Type II requires evidence that controls operate continuously over the audit period. A checklist run once and never re-executed provides no ongoing compliance assurance.

---

### FINDING-021 [HIGH]
**Dimension**: 8.2 (HIPAA Risk Analysis)
**Skills Affected**: All 14 skills
**Finding**: The 14 skills (6 implemented + 8 planned) collectively constitute a development checklist, not a HIPAA risk analysis. No skill synthesizes findings into a consolidated risk register. No skill assigns likelihood and impact ratings (only severity of code issues). No skill produces output meeting the documentation requirements of 164.308(a)(1)(ii)(D).
**Evidence**: Each implemented skill produces its own findings report. There is no aggregation skill, no risk register template, and no likelihood/impact scoring methodology.
**Remediation**: Create a `risk-register-synthesis` skill that: (1) reads output from all other skills, (2) consolidates findings into a risk register with: risk description, likelihood (1-5), impact (1-5), risk score, current controls, planned controls, owner, target date. (3) Maps each risk to the relevant HIPAA requirement. (4) Produces output that can serve as the documented risk analysis per 164.308(a)(1).
**Rationale**: Having 14 individual checklists does not satisfy the HIPAA risk analysis requirement. An HHS auditor expects a single consolidated view of risks with quantified likelihood and impact.

---

### FINDING-022 [HIGH]
**Dimension**: 4.5 (State Privacy Law Coverage)
**Skills Affected**: `consent-tracking-audit` (missing), `hipaa-compliance-audit`
**Finding**: No skill addresses CCPA/CPRA, CMIA (California Confidentiality of Medical Information Act), or state-specific mental health confidentiality laws (e.g., New York Mental Hygiene Law 33.13). The `hipaa-compliance-audit` skill treats HIPAA as the only applicable law. The platform serves clients across jurisdictions, and several state laws impose stricter requirements than HIPAA for mental health records.
**Evidence**: Searched all 6 SKILL.md files for `CCPA`, `CPRA`, `CMIA`, `Mental Hygiene`, `state privacy`, `California`, `New York` in a regulatory context -- zero matches. The `hipaa-compliance-audit` skill name and content focus exclusively on HIPAA.
**Remediation**: (1) When `consent-tracking-audit` is implemented, include a section on multi-jurisdictional compliance. (2) Add a note to `hipaa-compliance-audit` that HIPAA compliance alone is insufficient -- state laws may impose additional requirements. (3) At minimum, document the known stricter states: CA (CMIA), NY (Mental Hygiene Law), TX (medical records act), and provide a framework for future state additions.
**Rationale**: A platform that is HIPAA-compliant but violates CMIA for California residents is still non-compliant. State mental health privacy laws are often stricter than HIPAA and preempt it where they provide greater protection.

---

### FINDING-023 [HIGH]
**Dimension**: 8.5 (Audit Frequency and Scheduling)
**Skills Affected**: `hipaa-compliance-audit`, `phi-pii-leak-scan`, `security-code-review`
**Finding**: No skill specifies a recommended execution frequency. The `hipaa-compliance-audit` "When to Use" section mentions "quarterly compliance reviews" but this is in prose guidance, not in a structured field or the output specification. No skill supports delta reporting (comparing current run against previous run). No skill specifies that it must be run as a pre-deployment gate.
**Evidence**: `hipaa-compliance-audit/SKILL.md` line 12: "During quarterly compliance reviews" (prose only). `phi-pii-leak-scan` line 10: "Before any PR that touches serializers..." (prose only). No structured `frequency:` field in any frontmatter. No diff/delta mechanism in any output specification.
**Remediation**: (1) Add a `frequency:` field to each skill's YAML frontmatter (e.g., `frequency: every-pr`, `frequency: quarterly`, `frequency: pre-deployment`). (2) Add delta reporting to each skill: at the end of each run, compare against the previous output file and highlight new findings, resolved findings, and regressions. (3) For `deployment-readiness-check` (when implemented), specify it must be a blocking CI gate.
**Rationale**: HIPAA requires annual risk analysis at minimum. Without scheduled execution and delta tracking, there is no evidence of ongoing compliance monitoring.

---

### FINDING-024 [HIGH]
**Dimension**: 2.7 (Cancellation / Rescheduling / No-Show)
**Skills Affected**: `test-data-factory`, `mock-settings-manager`
**Finding**: `test-data-factory` does not include any cancellation, rescheduling, or no-show scenarios. There are no factories for: CANCELLED by client (before cutoff), CANCELLED by client (after cutoff -- partial refund), CANCELLED by provider (full refund), NO_SHOW, or rescheduled appointment (original slot released, new slot created). `mock-settings-manager` does not include a profile testing provider-side cancellation notifications or client-side refund notifications.
**Evidence**: `test-data-factory/SKILL.md` contains 4 scenarios: `CompletedSession`, `CrisisScreening`, `NewProviderOnboarding`, `BookingFunnel`. None uses `is_status="CANCELLED"` or `is_status="NO_SHOW"`.
**Remediation**: Add to `test-data-factory`: (1) `CancellationBeforeCutoffScenario` with full refund. (2) `CancellationAfterCutoffScenario` with partial refund and Stripe partial refund mock. (3) `ProviderCancellationScenario` with full refund. (4) `NoShowScenario` with client no-join verification. (5) `RescheduleScenario` with old slot released + new slot created + payment transferred. Add corresponding `mock-settings-manager` profiles for notification testing.
**Rationale**: Cancellation-after-cutoff without a corresponding Stripe partial refund scenario creates financial liability. No-show handling affects session revenue and client experience.

---

### FINDING-025 [HIGH]
**Dimension**: 1.8 (Client Journey -- Payment) and 2.3 (Payment Failures)
**Skills Affected**: `mock-external-services`
**Finding**: The `mock-external-services` skill does not cover PayPal mocks despite PayPal being an active payment method in the platform. The existing `mock_paypal` fixture in `apps/stripe_integration/tests/conftest.py:63` patches 6 PayPal functions, but `mock-external-services` does not create a structured `MockPayPalClient` class. PayPal order failures, capture failures, and authorization timeouts are not covered.
**Evidence**: `mock-external-services/SKILL.md` contains `MockTwilioClient`, `MockStripeClient`, `MockSendGridClient`, `MockAzureSearchClient`, `MockSterlingClient`, and `MockCertnClient`. No `MockPayPalClient`. The skill does not mention PayPal at all.
**Remediation**: Add a `MockPayPalClient` class covering: (1) `create_order` success and failure, (2) `get_authorization` with various decline reasons, (3) `capture_authorization` success and failure, (4) `get_merchant_onboarding_status` pending and failed, (5) timeout scenarios.
**Rationale**: PayPal is an active payment alternative on the platform. If it has no mock coverage, PayPal-specific payment failure handling cannot be tested.

---

### FINDING-026 [HIGH]
**Dimension**: 7.6 (Group Therapy / Multi-Participant Sessions)
**Skills Affected**: All 14 skills
**Finding**: No skill addresses group therapy HIPAA considerations (each participant's presence in a group is itself PHI), Twilio room configurations for 3+ participants, group session test data, or API response sanitization preventing group participant identity leakage. The platform has a `therapy-groups-support-groups` feature with dedicated routes and navigation entries.
**Evidence**: Feature doc at `ContextFiles2/ProductFeatures/features/therapy-groups-support-groups.md` confirms the feature exists. Searched all 6 SKILL.md files for `group`, `multi-participant`, `3+ participants` -- zero matches.
**Remediation**: (1) Add a `GroupSessionScenario` to `test-data-factory`. (2) Add a Twilio room mock with 3+ participant configurations. (3) When `api-response-sanitizer` is implemented, verify group participant identity is not leaked. (4) Document in `hipaa-compliance-audit` that group therapy participant presence is PHI.
**Rationale**: Group therapy presents unique HIPAA challenges. If a group participant's identity is visible to other participants via the API, this constitutes an unauthorized PHI disclosure.

---

### FINDING-027 [MEDIUM]
**Dimension**: 3.3 (ICD-10 Code Usage)
**Skills Affected**: `test-data-factory`
**Finding**: The `HealthcareProvider.icd10_code()` method generates realistic ICD-10-CM F-chapter codes (F32.1, F33.0, F41.1, etc.) without documentation that these are for testing only. The codes are clinically valid and could train developers to misuse specific diagnosis codes. The method does not include F99 (Unspecified mental disorder) as a recommended default for generic test data.
**Evidence**: `test-data-factory/SKILL.md` lines 96-101 list 15 real ICD-10-CM codes. No comment indicating these are test-only. No F99 included.
**Remediation**: (1) Add a docstring comment to `icd10_code()`: "WARNING: These are real ICD-10-CM codes used for test data ONLY. Do not use in clinical contexts without clinical supervision." (2) Add F99 as the default/generic option. (3) Add a `synthetic=True` parameter that returns only F99 for non-clinical test contexts.
**Rationale**: Using realistic diagnostic codes in test data without clear documentation could lead to developers or QA staff mistakenly treating them as authoritative clinical references.

---

### FINDING-028 [MEDIUM]
**Dimension**: 3.4 (Risk Screening Instrument Accuracy)
**Skills Affected**: `test-data-factory`, `mock-settings-manager`
**Finding**: The `test-data-factory` mentions PHQ-9 in clinical note templates (line 113: "PHQ-9 score: 12 (moderate)") but the `CrisisScreeningScenario` does not reference PHQ-9 thresholds by name. The `final_score=27` matches the PHQ-9 maximum, but the skill does not document that 27 = 9 questions x 3 (maximum per question). The `risk_screening_keywords` method uses generic keywords rather than PHQ-9 item-specific content. No reference to GAD-7 or C-SSRS instruments.
**Evidence**: `test-data-factory/SKILL.md` `CrisisScreeningScenario` at line 317: `final_score=27` matches PHQ-9 max. But `risk_screening_keywords` at lines 127-133 uses generic terms ("suicidal", "self-harm", "crisis") rather than PHQ-9 item mapping.
**Remediation**: (1) Add inline documentation linking `final_score=27` to PHQ-9 (9 items x max 3 = 27). (2) Reference PHQ-9 item 9 explicitly ("Thoughts that you would be better off dead or of hurting yourself in some way") as the suicidality screening item. (3) Add severity threshold documentation: 0-4 none, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe. (4) Consider adding GAD-7 scenario if the platform uses it.
**Rationale**: Risk scoring factory data that is not explicitly mapped to validated instrument thresholds cannot verify that the platform's crisis detection logic matches clinical standards.

---

### FINDING-029 [MEDIUM]
**Dimension**: 3.5 (Clinical Note Standards)
**Skills Affected**: `test-data-factory`
**Finding**: The `HealthcareProvider.clinical_note()` method produces synthetic notes that follow a reasonable clinical format (presenting problem, session content, observations, plan), but does not reference SOAP or DAP note format by name. The crisis note template at line 119 includes safety plan, emergency contacts, and supervisor notification -- which is realistic. However, the notes do not acknowledge the 21st Century Cures Act / OpenNotes provisions (providers cannot withhold notes from clients in most cases).
**Evidence**: `test-data-factory/SKILL.md` `clinical_note()` method at lines 103-124 produces three severity levels of notes. Format is realistic but unlabeled (not SOAP/DAP). No 21st Century Cures Act mention.
**Remediation**: (1) Label the note templates with the format they follow (e.g., "# SOAP Format" comment). (2) Add a note in the Known Patterns section that clinical notes are subject to OpenNotes provisions under the 21st Century Cures Act. (3) Add a template variation showing DAP format for comparison.
**Rationale**: Clinical staff reviewing the dev process will expect standard note format labeling. OpenNotes compliance affects how notes are displayed to clients.

---

### FINDING-030 [MEDIUM]
**Dimension**: 5.4 (Azure Cognitive Search Mock Realism)
**Skills Affected**: `mock-external-services`
**Finding**: The Azure Search mock returns `iter(self.fixture_results)` which is a plain Python iterator, not the Azure SDK's `SearchItemPaged` object. The mock does not include `@search.score`, faceted search response format, or the `@odata.count` field. The `empty_results` mode returns `iter([])` instead of the correct structure with `{"value": [], "@odata.count": 0}`.
**Evidence**: `mock-external-services/SKILL.md` `MockAzureSearchClient.search()` at lines 253-259. Returns `iter(self.fixture_results)` for success and `iter([])` for empty.
**Remediation**: (1) Return a mock `SearchItemPaged`-like object that supports iteration AND has `.get_count()` and `.get_facets()` methods. (2) Include `@search.score` in result items. (3) For empty results, return an object with count=0 and empty value list. (4) Add faceted search support for filter panel testing.
**Rationale**: Structural mismatches between mock and real SDK output will cause test failures when code uses Azure SDK features beyond simple iteration.

---

### FINDING-031 [MEDIUM]
**Dimension**: 2.6 (Cross-Timezone Scheduling)
**Skills Affected**: `test-data-factory`
**Finding**: `test-data-factory` does not include any cross-timezone scenarios. All appointments use `timezone.now()` which resolves to the server's timezone. There are no scenarios where client and provider are in different timezones, no DST transition date testing, and no cancellation cutoff timezone validation.
**Evidence**: `BookingFunnelScenario` at lines 359-392 uses `timezone.now() + timedelta(days=3)` for slot times. No timezone parameter is passed to any factory.
**Remediation**: Add a `CrossTimezoneBookingScenario` that: (1) creates a client with timezone UTC-8 and provider with timezone UTC+5:30, (2) creates a slot and appointment crossing a DST transition date, (3) validates that cancellation cutoff is calculated in the provider's timezone.
**Rationale**: DST bugs are predictable production failures in international health platforms. A platform matching clients across timezones without timezone-aware test scenarios will have scheduling bugs.

---

### FINDING-032 [MEDIUM]
**Dimension**: 6.1 (Invocability)
**Skills Affected**: All 6 implemented skills
**Finding**: All 6 implemented skills have adequate trigger phrases in their `description` field (3+ phrases each). All skills can be invoked with zero arguments (all have defaults). The `argument-hint` fields are populated with concrete examples. However, several skills use syntax in `argument-hint` that is not standard slash-command syntax (e.g., `[--scope backend|frontend|all]` uses shell-style flags rather than natural language prompts).
**Evidence**: `phi-pii-leak-scan` has 5 trigger phrases. `hipaa-compliance-audit` has 5. `security-code-review` has 6. `test-data-factory` has 5. `mock-external-services` has 5. `mock-settings-manager` has 5. All pass the minimum threshold.
**Remediation**: Consider adding natural language examples to `argument-hint` alongside the flag syntax (e.g., `"scan backend only for critical PII issues"` in addition to `[--scope backend --severity critical]`).
**Rationale**: Shell-style flags may not be intuitive for developers who invoke skills via natural language prompts.

---

### FINDING-033 [MEDIUM]
**Dimension**: 6.2 (Step Sequentiality -- Prose-only steps)
**Skills Affected**: `hipaa-compliance-audit`, `test-data-factory`
**Finding**: In `hipaa-compliance-audit`, Step 8 (Generate Compliance Matrix) contains only an output format template with no executable command to produce it -- the developer must manually synthesize results from Steps 1-7 into the table. In `test-data-factory`, Step 5 (Seed data safety validation) uses Django shell code but does not specify whether to run it interactively or as a script.
**Evidence**: `hipaa-compliance-audit/SKILL.md` Step 8 (lines 218-234): output template only, no command. `test-data-factory/SKILL.md` Step 5 (lines 440-459): Python code with comment "In Django shell or test:" but no runnable command.
**Remediation**: (1) In `hipaa-compliance-audit`, add a command that generates the compliance matrix from structured intermediate output (e.g., a Python script that reads grep outputs and produces the table). (2) In `test-data-factory`, wrap the safety validation in a management command or a pytest test file.
**Rationale**: Steps that contain only prose guidance or only output templates without executable commands reduce the skill from automation to documentation.

---

### FINDING-034 [MEDIUM]
**Dimension**: 6.4 (Known Patterns and Gotchas)
**Skills Affected**: `test-data-factory`, `mock-external-services`
**Finding**: `test-data-factory` correctly documents the `auto_now_add + loaddata` incompatibility (Gotcha #1) and the `CareProvider.save()` side effects (Gotchas #2-3). However, it does not mention the `MSYS_NO_PATHCONV=1` requirement for Docker exec commands on Windows, or the two-checkout problem. `mock-external-services` documents existing conftest mock patterns but does not mention the Windows/Docker gotcha.
**Evidence**: `test-data-factory/SKILL.md` Known Patterns section has 7 items but missing `MSYS_NO_PATHCONV` and two-checkout mentions. `mock-external-services/SKILL.md` Known Patterns section has 6 items but missing the same.
**Remediation**: Add to both skills' Known Patterns sections: (1) `MSYS_NO_PATHCONV=1` prefix requirement for Docker exec commands on Windows. (2) Note that changes in `C:\Projects\ReallyGlobal\Lumy-Backend` vs `C:\Projects\ReallyGlobal-Infra\Lumy-Backend` are separate git trees -- new factory/mock files must be created in the correct checkout.
**Rationale**: These are documented known gotchas in the MEMORY.md. Omitting them from skills that create new files means developers will encounter them without guidance.

---

### FINDING-035 [MEDIUM]
**Dimension**: 7.3 (Insurance and Benefits Billing)
**Skills Affected**: All 14 skills
**Finding**: No skill acknowledges that clients may seek insurance reimbursement via superbills. The platform is direct-pay (Stripe/PayPal), but no skill documents this as an explicit scope boundary or addresses superbill generation (itemized receipts with CPT codes and ICD-10 diagnosis codes).
**Evidence**: Searched all 6 SKILL.md files for `superbill`, `CPT`, `insurance billing`, `reimbursement`, `837` -- zero matches.
**Remediation**: Add to `hipaa-compliance-audit` or a new skill: (1) Document that the platform is currently direct-pay only. (2) Note that superbill generation is a common user request and flag it as a known scope boundary. (3) If superbill generation is planned, note the compliance requirements: CPT codes, ICD-10 codes, NPI on receipt, proper formatting.
**Rationale**: Users will ask for superbills. The absence of documentation means developers may build a superbill feature without understanding CPT code licensing and billing compliance requirements.

---

### FINDING-036 [MEDIUM]
**Dimension**: 7.7 (Wiley Treatment Planner Integration)
**Skills Affected**: All 14 skills
**Finding**: No skill addresses the Wiley Treatment Planner feature, which exists in the platform (`Lumy-Backend/apps/wiley/`, `RG-Frontend/src/pages/wiley/`). Wiley content is third-party licensed clinical decision support material with IP compliance requirements. No mock for the Wiley API exists in `mock-external-services`. No PHI implications of treatment plan data are addressed.
**Evidence**: Feature doc at `ContextFiles2/ProductFeatures/features/wiley-treatment-planner.md` confirms the feature exists with 14 data models. Searched all 6 SKILL.md files for `wiley`, `treatment plan` -- zero matches.
**Remediation**: (1) Add Wiley-specific PHI fields to `phi-pii-leak-scan` Tier 1 (treatment plans are PHI). (2) Add a Wiley API mock to `mock-external-services`. (3) Note IP/licensing requirements for Wiley content in `hipaa-compliance-audit` or a dedicated skill. (4) Add a `TreatmentPlanScenario` to `test-data-factory`.
**Rationale**: Treatment plan data is PHI. A feature that creates and stores clinical treatment plans without any security, compliance, or mock coverage is a blind spot.

---

### FINDING-037 [MEDIUM]
**Dimension**: 6.3 (Actionable Output Specification)
**Skills Affected**: `phi-pii-leak-scan`, `hipaa-compliance-audit`, `security-code-review`
**Finding**: The three audit-producing skills specify markdown output format but do not specify a consistent output file path. `phi-pii-leak-scan` and `hipaa-compliance-audit` use `[DATE]` placeholders. `security-code-review` does not specify any output file path at all (it produces findings inline but has no output section). The severity rating system is consistent across skills (CRITICAL/HIGH/MEDIUM/LOW), which is good.
**Evidence**: `phi-pii-leak-scan` output template at line 216; `hipaa-compliance-audit` output template at line 222; `security-code-review` has no output specification section.
**Remediation**: (1) Add a standard `## Output` section to `security-code-review` with a named output file. (2) Standardize output paths across all three skills to `ContextFiles2/Library/Sessions/{skill-name}_Results_{YYYY-MM-DD}.md`. (3) Specify whether output is for human reading, CI pipeline consumption, or both.
**Rationale**: Inconsistent output locations make it impossible to aggregate findings across skills or demonstrate a continuous compliance monitoring program.

---

### FINDING-038 [MEDIUM]
**Dimension**: 8.4 (Developer Training Evidence)
**Skills Affected**: All 6 implemented skills
**Finding**: The implemented skills contain operational instructions (WHAT to do) but limited WHY context. `phi-pii-leak-scan` includes PHI tier classification (which provides some context), but `security-code-review` jumps directly to grep commands without explaining why each OWASP category matters in a healthcare context. `hipaa-compliance-audit` references CFR section numbers but does not explain what each section means in plain language. No skill or README orients a new developer to PHI sensitivity tiers before they use other skills.
**Evidence**: `security-code-review/SKILL.md` A01-A10 sections contain bash commands but no healthcare-specific context (e.g., A01 does not mention that broken access control in a healthcare context means unauthorized PHI access, not just generic IDOR). `hipaa-compliance-audit/SKILL.md` references 164.312(a) without explaining what "Technical Safeguards" means.
**Remediation**: (1) Add a 1-2 sentence healthcare context note to each section of `security-code-review` (e.g., "In a healthcare context, broken access control means a client could read another client's therapy notes or risk screening results"). (2) Add plain-language explanations of CFR sections in `hipaa-compliance-audit`. (3) Create a brief onboarding note at the top of `phi-pii-leak-scan` that can serve as a "PHI 101" reference for new developers.
**Rationale**: A compliance officer will ask "How do you ensure developers know how to handle PHI?" Skills that contain no "why" context cannot serve as training artifacts.

---

### FINDING-039 [LOW]
**Dimension**: 6.5 (Example Invocations)
**Skills Affected**: All 6 implemented skills
**Finding**: All 6 skills have example invocations, but most show only happy-path usage. `mock-external-services` shows failure mode invocation (`--mode card_declined`) which is good. `test-data-factory` shows scenario variations. However, `phi-pii-leak-scan`, `hipaa-compliance-audit`, and `security-code-review` do not show targeted invocations for specific areas of concern (e.g., "scan only the video_conferencing app for PHI leaks").
**Evidence**: `phi-pii-leak-scan` examples at line 256: shows `--scope backend --severity critical` but not app-specific targeting. `hipaa-compliance-audit` examples at line 253: shows `--section access` which is good.
**Remediation**: Add 1-2 more targeted examples to each skill showing narrow-scope usage relevant to common developer tasks (e.g., "I just modified the Notes serializer, scan only video_conferencing").
**Rationale**: Examples showing only broad scans discourage developers from running quick targeted checks during development.

---

### FINDING-040 [LOW]
**Dimension**: 3.2 (Professional License Formats)
**Skills Affected**: `test-data-factory`
**Finding**: The `HealthcareProvider.license_number()` method provides state-specific license format patterns for CA, NY, TX, and FL, but the patterns do not fully match the audit prompt's expected formats. Specifically: CA generates `LMFT{5digits}` but the prompt expects `LCS NNNNN` for LCSW format; TX generates `{5digits}` (no alpha prefix) but the prompt expects `LPCNNNNN`; FL generates `MT{4digits}` but the prompt expects `MHNNNNNNN` for LMHC. The patterns are documented as examples only, not enforced as validation rules.
**Evidence**: `test-data-factory/SKILL.md` lines 79-87: CA -> `LMFT{5digits}`, NY -> `{6digits}-1`, TX -> `{5digits}`, FL -> `MT{4digits}`.
**Remediation**: (1) Expand license patterns to cover multiple credential types per state (LMFT, LCSW, LPC, LMHC). (2) Document these as representative test data formats, not validation rules. (3) When `credential-verification-workflow` is implemented, include actual validation regex for common state formats.
**Rationale**: License format patterns in test data should be representative of real formats to catch validation bugs. Mismatched patterns reduce test realism but do not create a safety issue.

---

### FINDING-041 [LOW]
**Dimension**: 1.10 (Client Journey -- Video Session)
**Skills Affected**: `mock-external-services`, `phi-pii-leak-scan`
**Finding**: `phi-pii-leak-scan` does not check whether Twilio room names embed client identity (e.g., using client name or email in room_name). The `Appointment.save()` auto-generates a UUID for room_name (per `test-data-factory` Gotcha #4), which is safe, but if any code path overrides this with identifiable data, it would not be caught. `mock-external-services` does not include Twilio recording failure mode implementation (listed but not coded).
**Evidence**: `phi-pii-leak-scan/SKILL.md` Step 1 scans for hardcoded PII but does not specifically check room name generation. `test-data-factory` Gotcha #4 confirms UUID generation, which is safe.
**Remediation**: Add to `phi-pii-leak-scan` Step 2: a check that `room_name` values in the database do not contain PII patterns (email, name substrings).
**Rationale**: Low risk because auto-generated UUIDs are the default, but a code change could introduce identifiable room names.

---

### FINDING-042 [LOW]
**Dimension**: 1.6 (Client Journey -- Provider Profile View)
**Skills Affected**: `api-response-sanitizer` (missing), `phi-pii-leak-scan`
**Finding**: `phi-pii-leak-scan` correctly flags that `CareProvider.to_json()` serializes PII for Azure Search indexing (Gotcha #2, #5). However, the missing `api-response-sanitizer` skill means there is no check that the provider public profile endpoint excludes NPI numbers, license numbers, and other non-public fields from client-facing responses.
**Evidence**: `phi-pii-leak-scan/SKILL.md` Gotcha #2 (line 241): documents `to_json()` including `phone_number`, `street_address` etc. Gotcha #5 (line 247): Stripe secret key in frontend. But no systematic check of what the public profile API endpoint returns.
**Remediation**: When `api-response-sanitizer` is implemented, include a specific check for the provider public profile endpoint (likely a GET on `/api/v1/care-provider/{id}/` or a GraphQL query) verifying that NPI, license numbers, insurance policy numbers, and home address are excluded.
**Rationale**: NPI numbers are not secret (they are in the NPPES public registry), but provider home addresses, insurance policy numbers, and payment identifiers should not be in public responses.

---

### FINDING-043 [LOW]
**Dimension**: 1.9 (Client Journey -- Pre-Session)
**Skills Affected**: `mock-external-services`
**Finding**: No skill covers notification trigger verification (SendGrid delivery confirmation). The `MockSendGridClient` captures sent emails for assertion but does not simulate delivery confirmation, open events, or click events. While this is primarily a testing infrastructure gap rather than a safety issue, it means developers cannot verify that appointment reminders are actually sent.
**Evidence**: `mock-external-services/SKILL.md` `MockSendGridClient` at lines 197-234: `sent_emails` list captures basic send data but no delivery event simulation.
**Remediation**: Add `simulate_delivery_event()` and `simulate_open_event()` methods to `MockSendGridClient` for testing notification delivery workflows.
**Rationale**: Low severity because notification delivery is a UX concern, not a safety or compliance issue. But appointment reminders reduce no-show rates, which affects session revenue.

---

### FINDING-044 [INFO]
**Dimension**: General -- Skill Interdependencies
**Skills Affected**: All 14 skills
**Finding**: Several skills reference other skills as dependencies (e.g., `mock-settings-manager` references `mock-external-services`; `mock-external-services` Step 3 references `frontend-test-scaffold`). However, there is no dependency graph or execution order specification. A developer encountering a skill that depends on an unimplemented skill has no guidance.
**Evidence**: `mock-settings-manager/SKILL.md` line 17: "Prerequisites: mock-external-services skill implemented". `mock-external-services/SKILL.md` line 323: "This depends on the frontend-test-scaffold skill".
**Remediation**: Add a dependency section to each skill's frontmatter (e.g., `depends-on: [mock-external-services]`). Create a skill dependency graph in the skills README or index.
**Rationale**: Informational -- does not affect correctness but improves developer experience.

---

### FINDING-045 [INFO]
**Dimension**: General -- Skill File Consistency
**Skills Affected**: All 6 implemented skills
**Finding**: All 6 implemented skills follow a consistent structure: YAML frontmatter, When to Use, Prerequisites, Workflow, Known Patterns & Gotchas, Example Invocations. This consistency is good and should be maintained when implementing the remaining 8 skills.
**Evidence**: All 6 SKILL.md files follow the same template.
**Remediation**: No action needed. Maintain this structure for the remaining 8 skills.
**Rationale**: Informational -- positive finding.

---

### FINDING-046 [INFO]
**Dimension**: General -- Test Data Safety
**Skills Affected**: `test-data-factory`
**Finding**: The `test-data-factory` skill includes strong data safety practices: `safe_email()` using @example.com only, `safe_phone()` using 555 prefix, `safe_coordinates()` using ocean locations, `safe_address()` using clearly fake data. Step 5 includes validation assertions. This is well-designed for a healthcare context.
**Evidence**: `test-data-factory/SKILL.md` lines 135-161 (`safe_*` methods) and lines 440-459 (safety validation).
**Remediation**: No action needed. This is a positive finding that should be maintained.
**Rationale**: Informational -- positive finding. Healthcare test data must never contain real PII.

---

## Gap Summary (Dimension 7)

### Uncovered Scenarios Requiring New Skills

| Gap | Priority | Recommended Skill |
|---|---|---|
| Post-crisis escalation workflow (duty to warn, mandatory reporting, follow-up) | P0 | `crisis-response-protocol` |
| Cross-state licensure verification at booking time | P0 | Part of `credential-verification-workflow` |
| Minor consent with jurisdiction-aware logic | P0 | Part of `consent-tracking-audit` |
| HIPAA breach notification and incident response | P1 | `incident-response-breach-notification` |
| Legal discovery data export and audit trail | P1 | `legal-discovery-export` |
| Consolidated risk register synthesis | P1 | `risk-register-synthesis` |
| Runtime security monitoring (SOC 2 CC7.2) | P2 | `runtime-security-monitoring` |
| Vendor risk assessment (SOC 2 CC9.2) | P2 | `vendor-risk-assessment` |
| Group therapy HIPAA considerations | P2 | Updates to existing skills |
| Wiley Treatment Planner PHI and IP compliance | P2 | Updates to existing skills |
| Superbill / insurance reimbursement boundary | P3 | Documentation update |
| Multi-provider care coordination and note isolation | P1 | Part of `backend-endpoint-security-test` |

---

## SOC 2 / HIPAA Readiness Assessment

**Overall Assessment**: NOT READY for compliance review.

The skill set, as implemented (6 of 14 skills), would not satisfy a healthcare compliance officer's process review or a SOC 2 Type II auditor's evidence requirements. Key deficiencies:

1. **SOC 2 CC6.1 (Logical access controls)**: `hipaa-compliance-audit` and `backend-endpoint-security-test` (missing) would cover this, but only the former exists and it produces one-time analysis, not continuous evidence.

2. **SOC 2 CC7.2 (System monitoring)**: No skill covers runtime monitoring at all. This is a gap that cannot be filled by static analysis skills.

3. **SOC 2 CC8.1 (Change management)**: `deployment-readiness-check` is missing. There is no CI/CD gate.

4. **HIPAA Risk Analysis (164.308(a)(1))**: The skills are individual checklists, not a risk analysis. No consolidated risk register exists.

5. **HIPAA Privacy Rule**: Entirely uncovered. No consent tracking, no NPP verification, no right of access mechanism.

6. **HIPAA Breach Notification Rule**: Entirely uncovered.

7. **BAA Inventory**: Not systematically produced by any skill.

**What would make this viable**: Completing all 14 skills, implementing the recommended new skills (crisis-response-protocol, incident-response-breach-notification, risk-register-synthesis), adding execution frequency scheduling, and introducing timestamped archival output.

---

## Recommended Next Skills (Priority Order)

1. **`consent-tracking-audit`**: Covers HIPAA Privacy Rule, NPP, minor consent, telehealth consent, GDPR DSR -- the single largest regulatory gap.
2. **`credential-verification-workflow`**: Covers NPI validation, cross-state licensure, pre-licensed restrictions -- direct patient safety.
3. **`backend-endpoint-security-test`**: Covers endpoint auth/authz testing, IDOR verification, cross-provider isolation -- foundational security.
4. **`deployment-readiness-check`**: Covers pre-deployment security gate, SOC 2 CC8.1 evidence -- operational necessity.
5. **`crisis-response-protocol`** (NEW): Covers duty to warn, mandatory reporting, crisis escalation -- legal obligation.
6. **`django-model-security-hardening`**: Covers field-level encryption, audit logging, pre_save signals -- addresses HIPAA encryption gap.
7. **`api-response-sanitizer`**: Covers minimum necessary standard, provider profile sanitization -- HIPAA Privacy Rule.
8. **`patient-data-integrity-check`**: Covers referential integrity, orphaned records, data consistency -- operational reliability.
9. **`frontend-test-scaffold`**: Covers Jest/MSW/Testing Library setup -- developer productivity.
10. **`incident-response-breach-notification`** (NEW): Covers HIPAA Breach Notification Rule -- legal obligation.
11. **`risk-register-synthesis`** (NEW): Covers consolidated risk register -- HIPAA 164.308(a)(1) documentation requirement.
