# Fix Plan -- UX/Scenario Audit
Date: 2026-03-01
Source Audit: `Audit_HealthcareSkills_UXScenario_Results_2026-03-01.md`
Skills Covered: 6 implemented + 8 missing + 3 recommended new

---

## Fix Priority Order

1. **CRITICAL** -- Patient safety and legal liability (Fixes 1-11)
2. **HIGH** -- Regulatory compliance gaps (Fixes 12-25)
3. **MEDIUM** -- Scenario coverage and domain accuracy (Fixes 26-38)
4. **LOW** -- Developer experience and discoverability (Fixes 39-43)

---

## Fixes for Existing Skills

### Fix 1: PHQ-9 Crisis Screening Scenario Produces Invalid Per-Question Scores (CRITICAL)
- **Audit Finding**: FINDING-002
- **Skill**: `test-data-factory`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Section**: Step 2 / `CrisisScreeningScenario.create()` (lines 305-331)
- **Issue**: Creates a single `ResponseDetail` with `score=9`, but the PHQ-9 maximum per-question score is 3 (on a 0-3 Likert scale). A `final_score=27` requires 9 detail records each scoring 3. The scenario does not reference PHQ-9 item 9 (the suicidality question) specifically, does not create a `ClientScreeningIgnore` record, and does not verify the booking flow is interrupted.
- **Corrected Content**:
```python
class CrisisScreeningScenario:
    """
    Creates: user + high-severity risk response + 9 ResponseDetail records summing to 27
    FK chain: User -> UserResponse -> ResponseDetail (x9)

    Based on the PHQ-9 (Patient Health Questionnaire-9):
    - 9 items, each scored 0 (not at all) to 3 (nearly every day)
    - Total range: 0-27
    - Severity thresholds: 0-4 none, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe
    - Item 9 ("Thoughts that you would be better off dead or of hurting yourself in some way")
      score >= 2 triggers active suicidal ideation screening per clinical guidelines
    """
    # PHQ-9 item text (abbreviated) for reference in test assertions
    PHQ9_ITEMS = [
        "Little interest or pleasure in doing things",
        "Feeling down, depressed, or hopeless",
        "Trouble falling or staying asleep, or sleeping too much",
        "Feeling tired or having little energy",
        "Poor appetite or overeating",
        "Feeling bad about yourself",
        "Trouble concentrating on things",
        "Moving or speaking slowly / being fidgety or restless",
        "Thoughts that you would be better off dead or of hurting yourself",  # Item 9
    ]

    @classmethod
    def create(cls, **kwargs):
        user = UserFactory(user_type="CLIENT", email=f"crisis.user.{random.randint(1000,9999)}@example.com")
        flow = FlowFactory()

        # Create 9 FlowQuestionSequence records (one per PHQ-9 item)
        fqs_list = []
        for i in range(9):
            question = QuestionFactory(question_text=cls.PHQ9_ITEMS[i])
            option_3 = QuestionOptionFactory(question=question, score=3, option_text="Nearly every day")
            fqs = FlowQuestionSequenceFactory(flow=flow, question=question, sequence_number=i + 1)
            fqs_list.append((fqs, option_3))

        response = UserResponseFactory(
            user=user,
            flow=flow,
            final_score=27,  # 9 items x 3 = 27 (PHQ-9 severe)
            final_keywords=["suicidal ideation", "self-harm", "hopelessness", "worthlessness",
                            "anhedonia", "insomnia", "fatigue", "concentration"],
            is_severe=True,
        )

        # Create 9 ResponseDetail records, each with score=3
        details = []
        for i, (fqs, option) in enumerate(fqs_list):
            keywords = []
            if i == 8:  # Item 9: suicidality
                keywords = ["suicidal ideation", "self-harm"]
            elif i == 1:  # Item 2: hopelessness
                keywords = ["hopelessness", "depression"]
            elif i == 0:  # Item 1: anhedonia
                keywords = ["anhedonia"]

            detail = ResponseDetailFactory(
                user_response=response,
                flow_question_sequence=fqs,
                selected_option=option,
                score=3,  # Max score per PHQ-9 item
                keywords=keywords,
                is_severe=(i == 8),  # Item 9 score >= 2 flags as severe
            )
            details.append(detail)

        return {
            'user': user,
            'flow': flow,
            'response': response,
            'details': details,  # List of 9 ResponseDetail records
            'item_9_detail': details[8],  # The suicidality screening item
        }
```
- **Rationale**: PHQ-9 is a validated 9-item instrument scored 0-3 per item (max 27). Item 9 specifically screens for suicidal ideation; a score of 2 ("More than half the days") or 3 ("Nearly every day") triggers clinical intervention per APA guidelines. The original single-detail with `score=9` is clinically impossible and would produce test data that cannot validate real crisis detection logic.

---

### Fix 2: NPI Number Generator Should Default to Type 1 for Individual Providers (CRITICAL)
- **Audit Finding**: FINDING-006
- **Skill**: `test-data-factory`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Section**: Step 1 / `HealthcareProvider.npi_number()` (lines 63-77)
- **Issue**: Randomly chooses NPI prefix '1' or '2'. Type 1 NPIs (prefix 1) are for individual providers; Type 2 (prefix 2) are for organizations. A healthcare marketplace matching individual therapists should default to Type 1.
- **Corrected Content**:
```python
    def npi_number(self, npi_type=1):
        """Generate a valid-format NPI number (10 digits, Luhn-valid).

        Args:
            npi_type: 1 for individual provider (default), 2 for organizational.
                      Type 1 range: 1,000,000,000 - 1,999,999,999
                      Type 2 range: 2,000,000,000 - 2,999,999,999
                      Luhn validation uses 80840 prefix per CMS NPI standard.
        """
        if npi_type not in (1, 2):
            raise ValueError("npi_type must be 1 (individual) or 2 (organizational)")
        prefix = str(npi_type)
        base = prefix + ''.join(random.choices(string.digits, k=8))
        # Calculate Luhn check digit using 80840 prefix per CMS specification
        digits = [int(d) for d in '80840' + base]
        total = 0
        for i, d in enumerate(reversed(digits)):
            if i % 2 == 0:
                doubled = d * 2
                total += doubled - 9 if doubled > 9 else doubled
            else:
                total += d
        check = (10 - (total % 10)) % 10
        return base + str(check)
```
- **Rationale**: CMS NPI Standard (45 CFR 162.406) defines Type 1 (individual) and Type 2 (organizational). Using Type 2 NPIs for individual therapists would fail NPPES registry verification. Default to Type 1 since Really Global matches individual care providers.

---

### Fix 3: Add Minor Client Scenario to Test Data Factory (CRITICAL)
- **Audit Finding**: FINDING-003
- **Skill**: `test-data-factory`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Section**: Step 3 (Scenario factories) -- add new scenario after `BookingFunnelScenario`
- **Issue**: No minor client scenario exists. The `User.parent_user` FK and `User.date_of_birth` fields exist but no skill tests parental consent, guardian linkage, or jurisdiction-specific age-of-consent.
- **Corrected Content**:
```python
class MinorClientScenario:
    """
    Creates: parent user + minor user (linked via parent_user) + client profile
    Tests: parental consent requirement, age verification, parent_user linkage

    Jurisdiction rules for mental health self-consent by minors:
    - California: 12+ may consent to mental health treatment (CA Family Code 6924)
    - Most US states: 18 is default age of majority
    - HIPAA 164.502(g)(3): When state law allows minor to consent,
      the minor exercises their own rights (parent does NOT have access)
    """
    @classmethod
    def create(cls, minor_age=15, state='CA', **kwargs):
        parent = UserFactory(
            user_type="CLIENT",
            email=f"parent.{random.randint(1000,9999)}@example.com",
            date_of_birth=(timezone.now() - timedelta(days=365*42)).date(),
        )
        minor_dob = (timezone.now() - timedelta(days=365*minor_age)).date()
        minor_user = UserFactory(
            user_type="CLIENT",
            email=f"minor.{random.randint(1000,9999)}@example.com",
            date_of_birth=minor_dob,
            parent_user=parent,
            relationship="child",
        )
        minor_client = ClientFactory(user=minor_user)
        parent_client = ClientFactory(user=parent)

        # Determine if minor can self-consent in this jurisdiction
        self_consent_states = {
            'CA': 12,  # CA Family Code 6924 (mental health)
            'IL': 12,  # IL Mental Health Code 405 ILCS 5/3-501
            'OR': 14,  # ORS 109.675
        }
        can_self_consent = state in self_consent_states and minor_age >= self_consent_states[state]

        return {
            'parent': parent,
            'minor_user': minor_user,
            'minor_client': minor_client,
            'parent_client': parent_client,
            'minor_age': minor_age,
            'can_self_consent': can_self_consent,
            'state': state,
        }
```
- **Rationale**: HIPAA 164.502(g)(3) establishes that when state law permits a minor to consent to treatment, the minor exercises their own HIPAA rights -- the parent cannot override. California Family Code Section 6924 specifically allows minors 12+ to consent to mental health treatment. Without a minor scenario, the platform cannot validate this legally required flow.

---

### Fix 4: HIPAA Compliance Audit Missing Privacy Rule Coverage (CRITICAL)
- **Audit Finding**: FINDING-004
- **Skill**: `hipaa-compliance-audit`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\hipaa-compliance-audit\SKILL.md`
- **Section**: After Step 7 (BAA Boundary Check), add Step 8 for Privacy Rule. Renumber existing Step 8 to Step 9.
- **Issue**: The skill covers only Technical Safeguards (164.312). It omits the Privacy Rule (Subpart E): Notice of Privacy Practices (164.520), right of access (164.524), amendment rights (164.526), accounting of disclosures (164.528).
- **Corrected Content**: Add the following step after Step 7:

```markdown
### Step 8: Privacy Rule Compliance -- 164 Subpart E

**NOTE**: This step covers HIPAA Privacy Rule requirements that are separate from Technical Safeguards.
For comprehensive consent tracking, see the companion `consent-tracking-audit` skill.

**8a. Notice of Privacy Practices (164.520)**:

```bash
# Check for NPP delivery at signup -- look for terms/privacy acceptance in registration flow
grep -rn --include="*.py" -E 'privacy_policy|notice_of_privacy|npp_consent|hipaa_notice' \
  Lumy-Backend/apps/authentication/ \
  Lumy-Backend/apps/client/ --exclude-dir=__pycache__

# Check frontend signup for privacy notice link/checkbox
grep -rn --include="*.ts" --include="*.tsx" \
  -i 'privacy.*policy\|notice.*privacy\|hipaa.*notice\|npp' \
  RG-Frontend/src/pages/ RG-Frontend/src/components/ \
  --exclude-dir=node_modules --exclude-dir=.next

# Check for consent timestamp storage
grep -rn --include="*.py" -E 'privacy_consent_date|npp_acknowledged|privacy_notice' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations
```

**Expected finding**: Likely no dedicated NPP delivery mechanism beyond generic T&C consent. HIPAA requires NPP to be provided at FIRST service delivery and available on request.

**8b. Right of Access to PHI (164.524)**:

```bash
# Check for data export or access request endpoint
grep -rn --include="*.py" -E 'export.*data|data.*export|access.*request|download.*record|phi.*access' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Check for any management command that exports user data
grep -rn --include="*.py" 'class Command' \
  Lumy-Backend/apps/*/management/commands/ \
  | grep -i 'export\|download\|access'
```

**Required**: Covered entities must provide access to PHI within 30 days of request (one 30-day extension permitted). If no mechanism exists, flag as FAIL.

**8c. Amendment Rights (164.526)**:

```bash
# Check for profile edit restrictions or amendment workflow
grep -rn --include="*.py" -E 'amendment|correction|rectif' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Check if clinical notes can be edited by the subject
grep -rn --include="*.py" 'def (update|patch|put)' \
  Lumy-Backend/apps/video_conferencing/views.py
```

**Required**: Patients may request amendments to their PHI. The CE must act within 60 days. If denied, the denial reason must be documented.

**8d. Accounting of Disclosures (164.528)**:

```bash
# Check for disclosure logging
grep -rn --include="*.py" -E 'disclosure.*log|audit.*disclosure|phi.*share|data.*share' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__
```

**Required**: Covered entities must track disclosures of PHI (excluding treatment, payment, and healthcare operations). The accounting must cover 6 years prior to the request.
```

Add to the compliance matrix output template:

```markdown
| Notice of Privacy Practices | 164.520 | PASS/FAIL | [evidence] | Implement NPP delivery at registration |
| Right of Access | 164.524 | PASS/FAIL | [evidence] | Create PHI export endpoint |
| Amendment Rights | 164.526 | PASS/FAIL | [evidence] | [fix] |
| Accounting of Disclosures | 164.528 | PASS/FAIL | [evidence] | Implement disclosure log |
```
- **Rationale**: 45 CFR 164.520 (NPP), 164.524 (access), 164.526 (amendment), and 164.528 (accounting of disclosures) are Required elements under the Privacy Rule. A HIPAA audit that checks only Technical Safeguards and omits the Privacy Rule is fundamentally incomplete. OCR enforcement actions frequently cite Privacy Rule violations.

---

### Fix 5: BAA Determination Table Missing from HIPAA Compliance Audit (CRITICAL)
- **Audit Finding**: FINDING-009
- **Skill**: `hipaa-compliance-audit`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\hipaa-compliance-audit\SKILL.md`
- **Section**: Step 7 (BAA Boundary Check) -- add BAA determination table to output
- **Issue**: Step 7 checks import isolation but does not produce a vendor-by-vendor BAA determination. Does not distinguish PHI-touching vendors from non-PHI vendors. Missing MailModo.
- **Corrected Content**: Add the following after the existing Step 7 grep commands:

```markdown
**7b. Produce BAA Determination Table:**

After scanning import paths, produce the following determination for each vendor:

| Vendor | Service | PHI Exposure | Justification | BAA Required | BAA Status |
|---|---|---|---|---|---|
| Twilio | Video/Chat/SMS/Verify | **YES** | Video sessions contain clinical content; SMS may contain appointment details | **YES** (45 CFR 160.103 "business associate") | CHECK: Twilio signs BAAs for eligible accounts |
| SendGrid | Transactional email | **YES** | Appointment confirmation emails contain provider name, session time, and reason | **YES** | CHECK: SendGrid/Twilio offers BAA |
| Azure Cognitive Search | Search indexing | **YES** | `CareProvider.to_json()` feeds provider data including address, specialties; appointment reason may be indexed | **YES** | CHECK: Azure signs BAAs under Enterprise Agreement |
| Stripe | Payment processing | **NO** | Payment data (card numbers, amounts) is not PHI under HIPAA. Stripe is PCI-DSS compliant. Payment linkage to identity does not create PHI. | NO (but verify no clinical data in payment metadata) | N/A |
| PayPal | Payment processing | **NO** | Same as Stripe. | NO | N/A |
| Sterling/Certn | Background checks | **NO** | Background check data is employer-requested, not treatment-related. Not a covered function under HIPAA. Subject to FCRA, not HIPAA. | NO | N/A |
| MailModo | Email marketing/automation | **POSSIBLE** | If email content includes appointment details, provider names, or clinical information | **YES if PHI in content** | CHECK: Review email templates for PHI |
| ipapi | IP geolocation | **NO** | IP address alone is not PHI. Geolocation for timezone/currency only. | NO | N/A |

**IMPORTANT**: If Twilio, SendGrid, or Azure process PHI without an executed BAA, every video session, notification email, and search index operation constitutes a HIPAA violation under 45 CFR 164.502(e).

```bash
# Check if MailModo is used and what data it receives
grep -rn --include="*.py" -i 'mailmodo' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__
grep -rn --include="*.ts" --include="*.tsx" -i 'mailmodo' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next
```
```
- **Rationale**: 45 CFR 160.103 defines "business associate" as any entity that creates, receives, maintains, or transmits PHI on behalf of a covered entity. Twilio processing video sessions with clinical content is textbook PHI transmission. The most common compliance failure in telehealth startups is operating without BAAs for PHI-touching vendors.

---

### Fix 6: Emergency Access Procedure and MFA Checks Missing (CRITICAL)
- **Audit Finding**: FINDING-010
- **Skill**: `hipaa-compliance-audit`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\hipaa-compliance-audit\SKILL.md`
- **Section**: Step 1 (Access Controls) -- add sub-steps for emergency access (164.312(a)(2)(ii)) and MFA (164.312(d))
- **Issue**: Emergency access procedure is a Required (not Addressable) safeguard. MFA / person-entity authentication is Required. Neither is checked.
- **Corrected Content**: Add after existing Step 1c:

```markdown
**1d. Emergency Access Procedure -- 164.312(a)(2)(ii) [REQUIRED]:**

```bash
# Check for emergency/break-glass access mechanism
grep -rn --include="*.py" -E 'emergency|break.?glass|override|emergency_access|superuser.*override' \
  Lumy-Backend/apps/authentication/ \
  Lumy-Backend/lumy_global/ --exclude-dir=__pycache__

# Check for documented emergency access procedure
find Lumy-Backend/ -name "*.md" -o -name "*.txt" | xargs grep -l -i 'emergency access\|break glass' 2>/dev/null
```

**Required**: A documented procedure must exist for obtaining necessary PHI during an emergency.
This is Required under 164.312(a)(2)(ii) -- it cannot be deferred as "addressable."
Remediation: Create an emergency access SOP document and a Django admin action or management command
that grants temporary elevated access with full audit logging.

**1e. Person or Entity Authentication -- 164.312(d) [REQUIRED]:**

```bash
# Check for multi-factor authentication capability
grep -rn --include="*.py" -E 'mfa|multi.?factor|two.?factor|2fa|totp|otp.*login|verify.*login' \
  Lumy-Backend/apps/authentication/ --exclude-dir=__pycache__

# Check Twilio Verify usage -- is it used for login MFA or only phone verification?
grep -rn --include="*.py" -A 10 'verify.*v2\|verification.*create\|verification_checks' \
  Lumy-Backend/apps/authentication/ --exclude-dir=__pycache__

# Check for device authentication or session binding
grep -rn --include="*.py" -E 'device.*token|device.*id|session.*bind|fingerprint' \
  Lumy-Backend/apps/authentication/ --exclude-dir=__pycache__
```

**Required**: The platform must verify that a person or entity seeking access to PHI is the one claimed.
Twilio Verify exists for phone verification during signup, but if it is not used as a second factor
during login, the platform relies on single-factor (password-only) authentication for PHI access.
Remediation: Implement Twilio Verify OTP as login MFA for accounts accessing PHI (providers, admins).
```
- **Rationale**: 45 CFR 164.312(a)(2)(ii) (emergency access) and 164.312(d) (person/entity authentication) are both Required implementation specifications. An HHS auditor cannot accept "not applicable" for Required specs -- they must be addressed with either implementation or documented compensating controls.

---

### Fix 7: CompletedSessionScenario Missing VideoCallRoom and Payment Linkage (HIGH)
- **Audit Finding**: FINDING-012
- **Skill**: `test-data-factory`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Section**: Step 3 / `CompletedSessionScenario.create()` (lines 266-302)
- **Issue**: Missing `VideoCallRoom` record, missing client-side payment record, `StripeUser` linked to provider not client.
- **Corrected Content**:
```python
class CompletedSessionScenario:
    """
    Creates: provider + client + appointment(COMPLETED) + video room + notes + stripe payment
    FK chain: User -> CareProvider -> Appointment -> VideoCallRoom -> Notes
    Payment chain: Client.User -> StripeUser -> Appointment.payment_intent_id
    """
    @classmethod
    def create(cls, **kwargs):
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"provider.{random.randint(1000,9999)}@example.com"),
            npi_number=factory.Faker._get_faker().npi_number(),
            is_licensed=True,
        )
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"client.{random.randint(1000,9999)}@example.com")
        )
        payment_intent_id = f"pi_test_{random.randint(100000, 999999)}"
        appointment = AppointmentFactory(
            care_provider=provider,
            client=client,
            is_status="COMPLETED",
            start_date_time=timezone.now() - timedelta(hours=2),
            end_date_time=timezone.now() - timedelta(hours=1),
            reason="Routine follow-up session",
            payment_status=2,  # PaymentStatus.COMPLETED
            payment_intent_id=payment_intent_id,
        )
        video_room = VideoCallRoomFactory(
            room_name=appointment.room_name,
        )
        notes = NotesFactory(
            care_provider=provider,
            room_name=appointment.room_name,
            notes=factory.Faker._get_faker().clinical_note(severity="routine"),
        )
        # Client-side Stripe record (payer is the client)
        client_stripe_user = StripeUserFactory(user=client.user)
        # Provider-side Stripe record (payee)
        provider_stripe_user = StripeUserFactory(user=provider.user)
        return {
            'provider': provider,
            'client': client,
            'appointment': appointment,
            'video_room': video_room,
            'notes': notes,
            'client_stripe_user': client_stripe_user,
            'provider_stripe_user': provider_stripe_user,
            'payment_intent_id': payment_intent_id,
        }
```
- **Rationale**: A completed session scenario without a VideoCallRoom produces orphaned notes (notes reference room_name but no room record exists). Payment linkage to the client (not just the provider) is needed to test refund and receipt workflows.

---

### Fix 8: Stripe Mock Missing decline_code Field and Common Decline Codes (HIGH)
- **Audit Finding**: FINDING-013
- **Skill**: `mock-external-services`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Section**: Step 1 / `MockStripeClient` (lines 120-188)
- **Issue**: Uses `error.code` only; Stripe API has both `code` (error type) and `decline_code` (specific reason). Missing `card_velocity_exceeded`, `do_not_honor`, dispute/chargeback webhook, refund, and PayPal mock.
- **Corrected Content**: Replace the `MockStripeClient` with:
```python
class MockStripeClient:
    """
    Drop-in mock for the stripe module.

    Stripe error anatomy:
    - error.type: "card_error", "api_error", "invalid_request_error"
    - error.code: "card_declined", "expired_card", "processing_error"
    - error.decline_code: "generic_decline", "insufficient_funds", "do_not_honor"
    See: https://docs.stripe.com/error-codes
    """

    FAILURE_MODES = [
        "success", "card_declined", "insufficient_funds", "do_not_honor",
        "card_velocity_exceeded", "3ds_required", "fraud_detected",
        "expired_card", "timeout", "rate_limit", "server_error",
        "auth_failure", "dispute_webhook", "refund_full", "refund_partial",
        "payment_timeout",
    ]

    def __init__(self, failure_mode="success"):
        self.failure_mode = failure_mode
        self.PaymentIntent = MagicMock()
        self.Customer = MagicMock()
        self.Refund = MagicMock()
        self.Webhook = MagicMock()
        self.PaymentMethod = MagicMock()
        self.error = MagicMock()
        self._configure()

    def _make_card_error(self, code, decline_code, message):
        """Create a Stripe CardError-like exception with proper structure."""
        error = MagicMock()
        error.type = "card_error"
        error.code = code
        error.decline_code = decline_code
        error.message = message
        error.http_status = 402
        exc = Exception(message)
        exc.code = code
        exc.decline_code = decline_code
        exc.http_status = 402
        exc.error = error
        return exc

    def _configure(self):
        if self.failure_mode == "success":
            pi = MagicMock()
            pi.id = f"pi_{uuid.uuid4().hex[:24]}"
            pi.status = "succeeded"
            pi.client_secret = f"pi_{uuid.uuid4().hex[:24]}_secret_{uuid.uuid4().hex[:24]}"
            self.PaymentIntent.create.return_value = pi
            self.PaymentIntent.retrieve.return_value = pi
            self.PaymentIntent.confirm.return_value = pi
            customer = MagicMock()
            customer.id = f"cus_{uuid.uuid4().hex[:14]}"
            self.Customer.create.return_value = customer
            self.Customer.retrieve.return_value = customer

        elif self.failure_mode == "card_declined":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "generic_decline", "Your card was declined.")
        elif self.failure_mode == "insufficient_funds":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "insufficient_funds", "Your card has insufficient funds.")
        elif self.failure_mode == "do_not_honor":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "do_not_honor", "Your card was declined.")
        elif self.failure_mode == "card_velocity_exceeded":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "card_velocity_exceeded",
                "Your card has been declined for making repeated attempts too frequently.")
        elif self.failure_mode == "expired_card":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "expired_card", None, "Your card has expired.")
        elif self.failure_mode == "3ds_required":
            pi = MagicMock()
            pi.status = "requires_action"
            pi.next_action = {"type": "use_stripe_sdk"}
            self.PaymentIntent.create.return_value = pi
        elif self.failure_mode == "fraud_detected":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "fraudulent", "This payment has been flagged as potentially fraudulent.")
        elif self.failure_mode == "refund_full":
            pi = MagicMock()
            pi.status = "succeeded"
            pi.amount = 15000  # $150.00 in cents
            self.PaymentIntent.retrieve.return_value = pi
            refund = MagicMock()
            refund.id = f"re_{uuid.uuid4().hex[:24]}"
            refund.status = "succeeded"
            refund.amount = 15000
            self.Refund.create.return_value = refund
        elif self.failure_mode == "refund_partial":
            pi = MagicMock()
            pi.status = "succeeded"
            pi.amount = 15000
            self.PaymentIntent.retrieve.return_value = pi
            refund = MagicMock()
            refund.id = f"re_{uuid.uuid4().hex[:24]}"
            refund.status = "succeeded"
            refund.amount = 7500  # 50% refund
            self.Refund.create.return_value = refund
        elif self.failure_mode == "dispute_webhook":
            event = {
                "type": "charge.dispute.created",
                "data": {"object": {"id": f"dp_{uuid.uuid4().hex[:24]}",
                                    "amount": 15000, "reason": "fraudulent"}},
            }
            self.Webhook.construct_event.return_value = event
        elif self.failure_mode == "payment_timeout":
            self.PaymentIntent.create.side_effect = ConnectionError("Connection timed out")
```

Also add a `MockPayPalClient` class:
```python
class MockPayPalClient:
    """Mock for PayPal integration matching existing conftest patch points."""

    FAILURE_MODES = ["success", "order_declined", "capture_failed",
                     "authorization_expired", "timeout", "merchant_not_onboarded"]

    def __init__(self, failure_mode="success"):
        self.failure_mode = failure_mode

    def get_paypal_access_token(self):
        if self.failure_mode == "timeout":
            raise Exception("Connection timed out")
        return "mock-paypal-access-token"

    def create_order(self, amount, currency="USD"):
        if self.failure_mode == "order_declined":
            raise Exception("ORDER_NOT_APPROVED")
        return {"id": f"ORDER-{uuid.uuid4().hex[:12].upper()}", "status": "CREATED"}

    def get_authorization(self, order_id):
        if self.failure_mode == "authorization_expired":
            return {"status": "VOIDED"}
        return {"id": f"AUTH-{uuid.uuid4().hex[:12].upper()}", "status": "CREATED"}

    def capture_authorization(self, auth_id):
        if self.failure_mode == "capture_failed":
            raise Exception("UNPROCESSABLE_ENTITY")
        return {"id": f"CAP-{uuid.uuid4().hex[:12].upper()}", "status": "COMPLETED"}

    def create_partner_referral(self, **kwargs):
        return {"links": [{"rel": "action_url", "href": "https://www.sandbox.paypal.com/mock"}]}

    def get_merchant_onboarding_status(self, merchant_id):
        if self.failure_mode == "merchant_not_onboarded":
            return {"payments_receivable": False, "primary_email_confirmed": False}
        return {"payments_receivable": True, "primary_email_confirmed": True}
```
- **Rationale**: Stripe's error structure distinguishes `code` from `decline_code` (see https://docs.stripe.com/api/errors). `do_not_honor` is one of the most common real-world decline codes (issuing bank refuses without specific reason). PayPal is an active payment method per `apps/stripe_integration/tests/conftest.py:63` and cannot be omitted from mock coverage.

---

### Fix 9: Twilio Mock Uses Wrong Error Class and Error Code (HIGH)
- **Audit Finding**: FINDING-014
- **Skill**: `mock-external-services`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Section**: Step 1 / `MockTwilioClient` (lines 47-115)
- **Issue**: Uses generic `Exception` instead of `TwilioRestException`. Error code 53205 for room_full should be 53105. `recording_failed` and `participant_disconnected` listed but not implemented. JWT token mock is not valid structure.
- **Corrected Content**: Replace `MockTwilioClient._configure()` error handling:
```python
class MockTwilioClient:
    """
    Drop-in mock for twilio.rest.Client.
    Uses TwilioRestException interface for error responses.

    Twilio error codes reference: https://www.twilio.com/docs/api/errors
    - 53105: Room contains too many Participants
    - 53118: Recording is disabled for this Room
    - 20003: Authentication error
    - 20429: Too many requests
    """

    FAILURE_MODES = ["success", "timeout", "rate_limit", "server_error",
                     "auth_failure", "room_full", "participant_disconnected",
                     "recording_failed"]

    def __init__(self, failure_mode="success"):
        self.failure_mode = failure_mode
        self.video = MagicMock()
        self.messages = MagicMock()
        self.verify = MagicMock()
        self.conversations = MagicMock()  # Twilio Conversations (DM/messaging)
        self._configure()

    def _make_twilio_error(self, status, code, message):
        """Create a TwilioRestException-like error."""
        exc = Exception(message)
        exc.status = status
        exc.code = code
        exc.method = "POST"
        exc.uri = "/v1/Rooms"
        exc.msg = message
        return exc

    def _make_jwt_token(self):
        """Return a structurally valid (but not cryptographically valid) 3-part JWT."""
        import base64
        header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b'=')
        payload = base64.urlsafe_b64encode(b'{"sub":"mock","iss":"mock","exp":9999999999}').rstrip(b'=')
        signature = base64.urlsafe_b64encode(b'mocksignature000000000000').rstrip(b'=')
        return header + b'.' + payload + b'.' + signature

    def _configure(self):
        if self.failure_mode == "success":
            room = MagicMock()
            room.sid = f"RM{uuid.uuid4().hex[:32]}"
            room.unique_name = "mock-room"
            room.status = "in-progress"
            self.video.rooms.create.return_value = room
            self.video.rooms.return_value = room
            self.video.rooms.list.return_value = [room]

            # Token
            token_mock = MagicMock()
            token_mock.to_jwt.return_value = self._make_jwt_token()

            # SMS
            message = MagicMock()
            message.sid = f"SM{uuid.uuid4().hex[:32]}"
            message.status = "delivered"
            self.messages.create.return_value = message

            # Verify
            verification = MagicMock()
            verification.status = "approved"
            self.verify.v2.services.return_value.verifications.create.return_value = verification
            self.verify.v2.services.return_value.verification_checks.create.return_value = verification

            # Conversations
            conversation = MagicMock()
            conversation.sid = f"CH{uuid.uuid4().hex[:32]}"
            self.conversations.v1.conversations.create.return_value = conversation

        elif self.failure_mode == "timeout":
            self.video.rooms.create.side_effect = ConnectionError("Connection timed out")
        elif self.failure_mode == "rate_limit":
            self.video.rooms.create.side_effect = self._make_twilio_error(429, 20429, "Too Many Requests")
        elif self.failure_mode == "room_full":
            self.video.rooms.create.side_effect = self._make_twilio_error(400, 53105, "Room contains too many Participants")
        elif self.failure_mode == "auth_failure":
            self.video.rooms.create.side_effect = self._make_twilio_error(401, 20003, "Authenticate")
        elif self.failure_mode == "recording_failed":
            room = MagicMock()
            room.sid = f"RM{uuid.uuid4().hex[:32]}"
            room.status = "in-progress"
            self.video.rooms.create.return_value = room
            # Recording start fails
            room.recordings.create.side_effect = self._make_twilio_error(400, 53118, "Recording is disabled for the Room")
        elif self.failure_mode == "participant_disconnected":
            room = MagicMock()
            room.sid = f"RM{uuid.uuid4().hex[:32]}"
            room.status = "in-progress"
            self.video.rooms.create.return_value = room
            # Participant connect succeeds then disconnect event fires
            participant = MagicMock()
            participant.sid = f"PA{uuid.uuid4().hex[:32]}"
            participant.status = "disconnected"
            participant.duration = 5  # Only 5 seconds before disconnect
            room.participants.list.return_value = [participant]
        elif self.failure_mode == "server_error":
            self.video.rooms.create.side_effect = self._make_twilio_error(500, 20500, "Internal Server Error")
```
- **Rationale**: Twilio error code 53105 is "Room contains too many Participants" (the original used 53205 which does not exist). Using `TwilioRestException`-compatible error objects ensures test code that catches Twilio-specific exceptions will work correctly. The JWT token must be a three-part base64 structure to pass basic format validation.

---

### Fix 10: SendGrid Mock Conflates API Response with SMTP Bounce Code (HIGH)
- **Audit Finding**: FINDING-015
- **Skill**: `mock-external-services`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Section**: Step 1 / `MockSendGridClient` (lines 197-234)
- **Issue**: The `bounce` mode returns HTTP 550 (an SMTP code, not HTTP). SendGrid's API accepts emails with HTTP 202 and delivers bounce/deferred events via webhooks asynchronously. The mock conflates synchronous API response with asynchronous event notification.
- **Corrected Content**:
```python
class MockSendGridClient:
    """
    Mock SendGrid that captures sent emails for assertion.

    SendGrid API model:
    - send() always returns HTTP 202 (accepted) for valid messages
    - Delivery events (bounce, delivered, open, etc.) arrive via Event Webhook
    - Hard bounce: permanent delivery failure (invalid address) -- remove from list
    - Soft bounce (deferred): temporary failure (mailbox full) -- retry
    """

    FAILURE_MODES = ["success", "hard_bounce", "soft_bounce", "spam_report",
                     "invalid_recipient", "timeout", "rate_limit", "server_error",
                     "delivered", "opened"]

    def __init__(self, failure_mode="success"):
        self.failure_mode = failure_mode
        self.sent_emails = []
        self.webhook_events = []
        self._client = MagicMock()

    def send(self, message):
        """
        Simulate SendGrid API send.
        Always returns 202 (accepted) for valid messages.
        Bounce/delivery status comes via separate webhook events.
        """
        if self.failure_mode == "timeout":
            raise ConnectionError("Connection timed out")
        if self.failure_mode == "rate_limit":
            response = MagicMock()
            response.status_code = 429
            return response
        if self.failure_mode == "server_error":
            response = MagicMock()
            response.status_code = 500
            return response

        # All other modes: API accepts the message (202)
        email_record = {
            'to': getattr(message, 'to', None),
            'subject': getattr(message, 'subject', None),
            'content': getattr(message, 'content', None),
            'dynamic_template_data': getattr(message, 'dynamic_template_data', None),
            'template_id': getattr(message, 'template_id', None),
        }
        self.sent_emails.append(email_record)

        # Queue the appropriate webhook event
        if self.failure_mode == "hard_bounce":
            self.webhook_events.append({
                "event": "bounce", "type": "bounce",
                "email": str(getattr(message, 'to', '')),
                "reason": "550 5.1.1 The email account does not exist",
            })
        elif self.failure_mode == "soft_bounce":
            self.webhook_events.append({
                "event": "deferred", "type": "deferred",
                "email": str(getattr(message, 'to', '')),
                "reason": "450 4.2.1 Mailbox full",
            })
        elif self.failure_mode == "spam_report":
            self.webhook_events.append({
                "event": "spamreport", "type": "spamreport",
                "email": str(getattr(message, 'to', '')),
            })
        elif self.failure_mode == "delivered":
            self.webhook_events.append({
                "event": "delivered",
                "email": str(getattr(message, 'to', '')),
            })

        response = MagicMock()
        response.status_code = 202
        return response

    def simulate_webhook_delivery(self):
        """Return and clear queued webhook events for assertion."""
        events = list(self.webhook_events)
        self.webhook_events.clear()
        return events

    def assert_email_sent_to(self, email):
        assert any(email in str(e.get('to', '')) for e in self.sent_emails), \
            f"No email sent to {email}. Sent to: {[e.get('to') for e in self.sent_emails]}"

    def assert_email_count(self, count):
        assert len(self.sent_emails) == count, \
            f"Expected {count} emails, got {len(self.sent_emails)}"

    def assert_template_used(self, template_id):
        assert any(e.get('template_id') == template_id for e in self.sent_emails), \
            f"Template {template_id} not used. Used: {[e.get('template_id') for e in self.sent_emails]}"
```
- **Rationale**: SendGrid's v3 Mail Send API returns HTTP 202 (accepted) -- it never returns SMTP codes like 550 directly. Bounces are asynchronous events delivered via the Event Webhook. Hard bounces (550) require removing the address; soft bounces (450 deferred) allow retries. The original mock returning 550 from `send()` would cause test code to treat all bounces as synchronous API failures.

---

### Fix 11: Sterling/Certn Mock Missing Stateful Transition and FCRA Adverse Action Flow (HIGH)
- **Audit Finding**: FINDING-016
- **Skill**: `mock-external-services`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Section**: Step 1 / `MockSterlingClient` (lines 271-302)
- **Issue**: Returns static status; no state machine for `pending -> in_progress -> complete`. No FCRA adverse action multi-step flow.
- **Corrected Content**:
```python
class MockSterlingClient:
    """
    Stateful mock for Sterling background check API.

    FCRA Adverse Action flow (15 USC 1681b(b)(3)):
    1. Initial result: "adverse_action_pending"
    2. Pre-adverse action notice sent to candidate
    3. 5 business day waiting period for candidate to dispute
    4. Final adverse action decision
    """

    FAILURE_MODES = ["clear", "review", "adverse_action", "pending",
                     "timeout", "server_error", "stale_pending"]

    def __init__(self, failure_mode="clear"):
        self.failure_mode = failure_mode
        self._call_count = {}  # screening_id -> call count (for state transitions)

    def get_screening_status(self, screening_id):
        if self.failure_mode == "timeout":
            raise ConnectionError("Connection timed out")
        if self.failure_mode == "server_error":
            raise Exception("Service Unavailable (503)")

        # Track calls for stateful transitions
        self._call_count.setdefault(screening_id, 0)
        self._call_count[screening_id] += 1
        call_num = self._call_count[screening_id]

        if self.failure_mode == "pending":
            # Transitions: pending (call 1-2) -> in_progress (call 3-4) -> complete/clear (call 5+)
            if call_num <= 2:
                return {"status": "pending", "result": None, "eta_hours": 48}
            elif call_num <= 4:
                return {"status": "in_progress", "result": None, "eta_hours": 24}
            else:
                return {"status": "complete", "result": "clear"}

        elif self.failure_mode == "stale_pending":
            # Never transitions -- for testing SLA violation alerts
            return {"status": "pending", "result": None, "eta_hours": 0,
                    "sla_exceeded": True, "created_at": "2026-01-01T00:00:00Z"}

        elif self.failure_mode == "adverse_action":
            # FCRA multi-step adverse action flow
            if call_num == 1:
                return {"status": "complete", "result": "adverse_action_pending",
                        "pre_adverse_notice_sent": True,
                        "dispute_deadline": "2026-03-08T00:00:00Z"}  # 5 business days
            elif call_num == 2:
                return {"status": "complete", "result": "adverse_action_pending",
                        "dispute_received": False,
                        "dispute_deadline": "2026-03-08T00:00:00Z"}
            else:
                return {"status": "complete", "result": "adverse_action",
                        "final_action_date": "2026-03-08T00:00:00Z"}

        elif self.failure_mode == "review":
            return {"status": "complete", "result": "review",
                    "review_items": ["name_mismatch"]}

        else:  # "clear"
            return {"status": "complete", "result": "clear",
                    "completed_at": "2026-03-01T12:00:00Z"}


class MockCertnClient:
    """Certn-specific mock with Certn status values."""

    FAILURE_MODES = ["clear", "review", "adverse_action", "pending",
                     "timeout", "server_error", "cancelled"]

    def __init__(self, failure_mode="clear"):
        self.failure_mode = failure_mode
        self._call_count = {}

    def get_screening_status(self, screening_id):
        if self.failure_mode == "timeout":
            raise ConnectionError("Connection timed out")
        if self.failure_mode == "cancelled":
            return {"status": "CANCELLED", "result": None}

        self._call_count.setdefault(screening_id, 0)
        self._call_count[screening_id] += 1
        call_num = self._call_count[screening_id]

        if self.failure_mode == "pending":
            if call_num <= 3:
                return {"status": "PENDING", "result": None}
            else:
                return {"status": "COMPLETE", "result": "CLEAR"}
        elif self.failure_mode == "clear":
            return {"status": "COMPLETE", "result": "CLEAR"}
        elif self.failure_mode == "review":
            return {"status": "COMPLETE", "result": "REVIEW_REQUIRED"}
        elif self.failure_mode == "adverse_action":
            return {"status": "COMPLETE", "result": "ACTION_REQUIRED",
                    "adverse_action_required": True}
        else:
            return {"status": "COMPLETE", "result": "CLEAR"}
```
- **Rationale**: FCRA 15 USC 1681b(b)(3) requires a pre-adverse action notice and a reasonable period (typically 5 business days) for the candidate to dispute before final adverse action. A mock that skips this flow cannot validate the platform's FCRA compliance obligations. Certn uses different status values than Sterling and must be mocked separately.

---

### Fix 12: Audit Log Field Specification Missing from HIPAA Compliance Audit (HIGH)
- **Audit Finding**: FINDING-018
- **Skill**: `hipaa-compliance-audit`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\hipaa-compliance-audit\SKILL.md`
- **Section**: Step 2 (Audit Controls -- 164.312(b)), after the existing Expected Finding note
- **Issue**: Step 2 identifies audit logging is likely absent but does not specify what the audit log should capture or how to produce a discovery-ready export.
- **Corrected Content**: Add after the "Expected finding" note in Step 2:

```markdown
**Minimum audit log fields per 164.312(b) and legal discovery requirements:**

| Field | Purpose | Source |
|---|---|---|
| `user_id` | Who accessed the record | `request.user.id` |
| `action` | What was done (CREATE, READ, UPDATE, DELETE) | View/mutation method |
| `model` | Which PHI model was accessed | Model class name |
| `record_id` | Specific record PK | Object PK |
| `timestamp` | When the access occurred (UTC) | Auto-generated |
| `ip_address` | Source IP | `request.META['REMOTE_ADDR']` or X-Forwarded-For |
| `user_agent` | Client identification | `request.META['HTTP_USER_AGENT']` |
| `fields_accessed` | Which specific fields were read | Serializer field list |
| `fields_changed` | Old value -> new value for writes | django-auditlog diff |
| `request_path` | API endpoint accessed | `request.path` |
| `response_status` | HTTP status code returned | Response status |

**Recommended implementation with django-auditlog:**

```bash
# Install
pip install django-auditlog

# Register Tier 1 PHI models in each app's apps.py:
# apps/video_conferencing/apps.py:
#   from auditlog.registry import auditlog
#   auditlog.register(Notes, include_fields=['notes', 'care_provider', 'room_name'])
#
# apps/risk_screening/apps.py:
#   auditlog.register(UserResponse, include_fields=['final_score', 'final_keywords', 'is_severe'])
#   auditlog.register(ResponseDetail, include_fields=['score', 'keywords', 'is_severe'])
#
# apps/calendar_functionality/apps.py:
#   auditlog.register(Appointment, include_fields=['reason', 'is_status', 'care_provider', 'client'])
#   auditlog.register(Session, include_fields=['issues', 'summary_of_issue'])
```

**Legal discovery export (add to Step 2 output specification):**

Generate a command or management command that produces:
1. Client-specific PHI export (all records for a given user_id across all models)
2. Provider credential approval trail (audit log filtered to CareProvider + ProfessionalLicense)
3. Appointment/session history with all associated Notes for a specific client
4. Date-range filtered audit log in CSV or JSON format for counsel review
```
- **Rationale**: 45 CFR 164.312(b) requires mechanisms to record and examine access to PHI. Without specifying what the audit log captures, the skill cannot verify compliance. Legal discovery requires producing complete records within court-ordered timeframes.

---

### Fix 13: Add Cancellation, No-Show, and Rescheduling Scenarios (HIGH)
- **Audit Finding**: FINDING-024
- **Skill**: `test-data-factory`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Section**: Step 3 (Scenario factories) -- add after `BookingFunnelScenario`
- **Issue**: No cancellation, rescheduling, or no-show scenarios exist.
- **Corrected Content**:
```python
class CancellationBeforeCutoffScenario:
    """
    Creates: client + provider + appointment(CANCELLED) + full refund
    Tests: cancellation within the free-cancellation window
    """
    @classmethod
    def create(cls, **kwargs):
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"cancel.{random.randint(1000,9999)}@example.com"))
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"prov.cancel.{random.randint(1000,9999)}@example.com"),
            is_licensed=True)
        appointment = AppointmentFactory(
            care_provider=provider, client=client,
            is_status="CANCELLED",
            start_date_time=timezone.now() + timedelta(days=5),
            end_date_time=timezone.now() + timedelta(days=5, minutes=50),
            payment_status=3,  # REFUNDED
            payment_intent_id=f"pi_test_{random.randint(100000,999999)}",
            reason="Scheduling conflict",
        )
        return {'client': client, 'provider': provider, 'appointment': appointment,
                'refund_type': 'full', 'within_cutoff': True}


class CancellationAfterCutoffScenario:
    """
    Creates: client + provider + appointment(CANCELLED) + partial refund
    Tests: late cancellation with partial refund (e.g., 50% fee)
    """
    @classmethod
    def create(cls, **kwargs):
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"late.cancel.{random.randint(1000,9999)}@example.com"))
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"prov.latecancel.{random.randint(1000,9999)}@example.com"),
            is_licensed=True)
        # Appointment is within 24 hours (past the typical cutoff)
        appointment = AppointmentFactory(
            care_provider=provider, client=client,
            is_status="CANCELLED",
            start_date_time=timezone.now() + timedelta(hours=6),
            end_date_time=timezone.now() + timedelta(hours=6, minutes=50),
            payment_status=4,  # PARTIALLY_REFUNDED
            payment_intent_id=f"pi_test_{random.randint(100000,999999)}",
            reason="Emergency cancellation",
        )
        return {'client': client, 'provider': provider, 'appointment': appointment,
                'refund_type': 'partial', 'within_cutoff': False}


class NoShowScenario:
    """
    Creates: client + provider + appointment with start_date_time in the past + NO_SHOW status
    Tests: no-show detection, no-show fee handling, provider notification
    """
    @classmethod
    def create(cls, **kwargs):
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"noshow.{random.randint(1000,9999)}@example.com"))
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"prov.noshow.{random.randint(1000,9999)}@example.com"),
            is_licensed=True)
        appointment = AppointmentFactory(
            care_provider=provider, client=client,
            is_status="NO_SHOW",
            start_date_time=timezone.now() - timedelta(hours=2),
            end_date_time=timezone.now() - timedelta(hours=1),
            payment_status=2,  # COMPLETED (no-show fee charged)
            payment_intent_id=f"pi_test_{random.randint(100000,999999)}",
        )
        return {'client': client, 'provider': provider, 'appointment': appointment}


class RescheduleScenario:
    """
    Creates: client + provider + original appointment(CANCELLED) + new appointment(SCHEDULED)
    Tests: old slot released, new slot created, payment transferred
    """
    @classmethod
    def create(cls, **kwargs):
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"resched.{random.randint(1000,9999)}@example.com"))
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"prov.resched.{random.randint(1000,9999)}@example.com"),
            is_licensed=True)
        original = AppointmentFactory(
            care_provider=provider, client=client,
            is_status="CANCELLED",
            start_date_time=timezone.now() + timedelta(days=2),
            end_date_time=timezone.now() + timedelta(days=2, minutes=50),
            payment_status=3,
            reason="Rescheduled by client",
        )
        new_slot = SlotFactory(
            care_provider=provider,
            start_date_time=timezone.now() + timedelta(days=5),
            end_date_time=timezone.now() + timedelta(days=5, minutes=50),
        )
        rescheduled = AppointmentFactory(
            care_provider=provider, client=client,
            is_status="SCHEDULED",
            start_date_time=new_slot.start_date_time,
            end_date_time=new_slot.end_date_time,
            payment_status=0,
            payment_intent_id=f"pi_test_{random.randint(100000,999999)}",
        )
        return {'client': client, 'provider': provider,
                'original': original, 'rescheduled': rescheduled, 'new_slot': new_slot}
```
- **Rationale**: Cancellation-after-cutoff without a Stripe partial refund scenario creates financial liability. No-show scenarios are critical for testing fee enforcement and notification workflows. Rescheduling must verify old slot release and payment transfer.

---

### Fix 14: Add Cross-Timezone Booking Scenario (MEDIUM)
- **Audit Finding**: FINDING-031
- **Skill**: `test-data-factory`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Section**: Step 3 (Scenario factories) -- add new scenario
- **Issue**: All appointments use `timezone.now()` without timezone variation. No DST transition testing.
- **Corrected Content**:
```python
class CrossTimezoneBookingScenario:
    """
    Creates: client (UTC-8 Pacific) + provider (UTC+5:30 India) + appointment crossing DST
    Tests: timezone conversion, DST boundary handling, cancellation cutoff timezone
    """
    @classmethod
    def create(cls, **kwargs):
        import pytz
        client_tz = pytz.timezone('America/Los_Angeles')
        provider_tz = pytz.timezone('Asia/Kolkata')

        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"tz.client.{random.randint(1000,9999)}@example.com"))
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"tz.provider.{random.randint(1000,9999)}@example.com"),
            is_licensed=True)

        # Create slot near DST transition (second Sunday of March)
        # 2026-03-08 is DST spring forward in US
        from datetime import datetime
        dst_date = datetime(2026, 3, 8, 1, 30, tzinfo=client_tz)  # 1:30 AM PT (doesn't exist after spring forward)
        slot_utc = dst_date.astimezone(pytz.UTC)

        slot = SlotFactory(
            care_provider=provider,
            start_date_time=slot_utc,
            end_date_time=slot_utc + timedelta(minutes=50),
        )
        appointment = AppointmentFactory(
            care_provider=provider, client=client,
            is_status="SCHEDULED",
            start_date_time=slot.start_date_time,
            end_date_time=slot.end_date_time,
        )
        return {
            'client': client, 'provider': provider,
            'slot': slot, 'appointment': appointment,
            'client_tz': 'America/Los_Angeles', 'provider_tz': 'Asia/Kolkata',
            'crosses_dst': True,
        }
```
- **Rationale**: DST bugs are a predictable production failure class for international telehealth platforms. A slot at 1:30 AM Pacific on March 8, 2026 (Spring Forward) tests the ambiguous-time case.

---

### Fix 15: Add ICD-10 Code Safety Documentation (MEDIUM)
- **Audit Finding**: FINDING-027
- **Skill**: `test-data-factory`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Section**: Step 1 / `HealthcareProvider.icd10_code()` (lines 96-101)
- **Issue**: Real ICD-10-CM codes without test-only warning. Missing F99 as generic default.
- **Corrected Content**:
```python
    def icd10_code(self, synthetic=False):
        """Generate an ICD-10-CM code for mental health test data.

        WARNING: These are real ICD-10-CM codes used for TEST DATA ONLY.
        Do not use in clinical contexts without clinical supervision.
        For non-clinical test contexts, use synthetic=True to get F99 only.

        Args:
            synthetic: If True, returns only F99 (Unspecified mental disorder).
                       Use synthetic=True for generic test scenarios.
        """
        if synthetic:
            return 'F99'
        codes = [
            'F32.1',   # Major depressive disorder, single episode, moderate
            'F33.0',   # Major depressive disorder, recurrent, mild
            'F41.1',   # Generalized anxiety disorder
            'F43.10',  # Post-traumatic stress disorder, unspecified
            'F43.12',  # Post-traumatic stress disorder, chronic
            'F40.10',  # Social phobia, unspecified
            'F42.2',   # Mixed obsessional thoughts and acts
            'F90.0',   # ADHD, predominantly inattentive type
            'F84.0',   # Autistic disorder
            'F50.00',  # Anorexia nervosa, unspecified
            'F31.30',  # Bipolar disorder, current episode depressed, mild
            'F60.3',   # Borderline personality disorder
            'F10.20',  # Alcohol dependence, uncomplicated
            'F99',     # Mental disorder, not otherwise specified (safe default)
        ]
        return random.choice(codes)
```
- **Rationale**: ICD-10-CM codes are copyrighted by WHO and licensed by CMS. Using real codes in test data without documentation creates a risk of developers treating them as authoritative clinical references. F99 provides a safe generic default.

---

### Fix 16: Add PHQ-9 Severity Threshold Documentation (MEDIUM)
- **Audit Finding**: FINDING-028
- **Skill**: `test-data-factory`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Section**: Step 1 / `HealthcareProvider.risk_screening_keywords()` (lines 127-133) and the `CrisisScreeningScenario` docstring
- **Issue**: No PHQ-9 threshold documentation; generic keywords instead of instrument-mapped items.
- **Corrected Content**: Add documentation block before the method:
```python
    # PHQ-9 Severity Thresholds (Kroenke, Spitzer & Williams, 2001):
    # 0-4:   None/minimal depression
    # 5-9:   Mild depression
    # 10-14: Moderate depression
    # 15-19: Moderately severe depression
    # 20-27: Severe depression
    #
    # Item 9 ("Thoughts of being better off dead / self-harm"):
    # Score >= 1 on item 9 requires clinical follow-up per APA guidelines
    # Score >= 2 on item 9 triggers active suicidal ideation screening

    def risk_screening_keywords(self, severity='low'):
        """Generate risk screening keyword sets mapped to PHQ-9 item content.

        Keywords align with PHQ-9 item domains:
        - Items 1-2: anhedonia, depressed mood (core symptoms)
        - Items 3-8: sleep, fatigue, appetite, self-worth, concentration, psychomotor
        - Item 9: suicidal ideation (critical safety item)
        """
        keyword_sets = {
            'low': [["stress", "sleep difficulty", "work pressure"]],
            'moderate': [["depressed mood", "hopelessness", "fatigue", "poor concentration"]],
            'high': [["suicidal ideation", "self-harm", "worthlessness", "no reason to live",
                      "hopelessness", "anhedonia"]],
        }
        return random.choice(keyword_sets.get(severity, keyword_sets['low']))
```
- **Rationale**: PHQ-9 is the most widely used depression screening instrument. The scoring thresholds published by Kroenke, Spitzer & Williams (2001) are the clinical standard. Item 9 is the specific suicidality screening question and requires different clinical handling than other items.

---

### Fix 17: Add Clinical Note Format Labels (MEDIUM)
- **Audit Finding**: FINDING-029
- **Skill**: `test-data-factory`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Section**: Step 1 / `HealthcareProvider.clinical_note()` (lines 103-124) and Known Patterns section
- **Issue**: Notes follow SOAP-like format but are not labeled. No 21st Century Cures Act / OpenNotes mention.
- **Corrected Content**: Update the method docstring and add to Known Patterns:
```python
    def clinical_note(self, severity='routine', format='soap'):
        """Generate synthetic clinical session note in SOAP format.

        SOAP = Subjective, Objective, Assessment, Plan
        These are synthetic notes for test data ONLY.

        NOTE: Under the 21st Century Cures Act (ONC Information Blocking Rule,
        effective April 5, 2021), clinical notes are subject to OpenNotes
        provisions -- providers generally cannot withhold session notes from
        clients. The platform should display notes to clients unless a specific
        exception applies (e.g., psychotherapy notes per 45 CFR 164.524(a)(1)(i)).
        """
```

Add to Known Patterns section:
```markdown
8. **21st Century Cures Act / OpenNotes**: Clinical notes in `Notes.notes` are subject to the
   ONC Information Blocking Rule (21st Century Cures Act, 45 CFR 171). Providers generally cannot
   withhold notes from patients. Exception: "psychotherapy notes" as defined by HIPAA
   (45 CFR 164.501) -- these are notes kept separate from the medical record, used only by the
   treating provider. If `Notes.notes` contains psychotherapy notes (as opposed to progress notes),
   they may be exempt from patient access. The platform must distinguish between note types.
```
- **Rationale**: The 21st Century Cures Act's Information Blocking Rule (effective April 5, 2021) significantly changed how clinical notes must be shared with patients. HIPAA's psychotherapy notes exception (45 CFR 164.501) applies only to notes meeting a specific definition -- they must be separate from the medical record and used solely by the therapist.

---

### Fix 18: Azure Search Mock Return Type Mismatch (MEDIUM)
- **Audit Finding**: FINDING-030
- **Skill**: `mock-external-services`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Section**: Step 1 / `MockAzureSearchClient` (lines 239-269)
- **Issue**: Returns plain iterator instead of `SearchItemPaged`-like object. Missing `@search.score`, `get_count()`, `get_facets()`.
- **Corrected Content**:
```python
class MockSearchResults:
    """Mock for azure.search.documents.SearchItemPaged."""

    def __init__(self, results, count=None, facets=None):
        self._results = results
        self._count = count if count is not None else len(results)
        self._facets = facets or {}

    def __iter__(self):
        return iter(self._results)

    def get_count(self):
        return self._count

    def get_facets(self):
        return self._facets


class MockAzureSearchClient:
    """Mock for azure.search.documents.SearchClient."""

    FAILURE_MODES = ["success", "empty_results", "timeout", "rate_limit", "server_error"]

    def __init__(self, failure_mode="success", fixture_results=None):
        self.failure_mode = failure_mode
        self.fixture_results = fixture_results or []
        self.indexed_documents = []
        # Add @search.score to fixture results if not present
        for result in self.fixture_results:
            if '@search.score' not in result:
                result['@search.score'] = round(random.uniform(0.5, 4.0), 4)

    def search(self, search_text, **kwargs):
        if self.failure_mode == "timeout":
            raise Exception("Request timed out")
        if self.failure_mode == "rate_limit":
            raise Exception("Too many requests (429)")
        if self.failure_mode == "empty_results":
            return MockSearchResults([], count=0)
        if self.failure_mode == "server_error":
            raise Exception("Service unavailable (503)")

        # Apply basic filtering if filter param provided
        results = list(self.fixture_results)
        facets = kwargs.get('facets', None)
        facet_results = {}
        if facets:
            for facet_field in facets:
                facet_results[facet_field] = [
                    {"value": "mock_facet_value", "count": len(results)}
                ]

        return MockSearchResults(results, count=len(results), facets=facet_results)

    def upload_documents(self, documents):
        if self.failure_mode == "server_error":
            raise Exception("Service unavailable (503)")
        self.indexed_documents.extend(documents)
        result = MagicMock()
        result.succeeded = True
        return [result]
```
- **Rationale**: Code using `result.get_count()` or `result.get_facets()` (standard Azure SDK patterns) will fail against a plain iterator. The `@search.score` field is used for relevance ranking in the provider search UI.

---

### Fix 19: Add Healthcare Context to OWASP Security Review Categories (MEDIUM)
- **Audit Finding**: FINDING-038
- **Skill**: `security-code-review`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\security-code-review\SKILL.md`
- **Section**: Each A01-A10 subsection -- add 1-2 sentence healthcare context
- **Issue**: OWASP categories have no healthcare-specific context. A developer may not understand why A01 is especially dangerous in a healthcare context.
- **Corrected Content**: Add a `**Healthcare Impact**:` line after each section header:

For A01: `**Healthcare Impact**: Broken access control in a healthcare context means a client could read another client's therapy notes, risk screening results, or appointment reasons -- a direct HIPAA violation under 45 CFR 164.312(a)(1).`

For A02: `**Healthcare Impact**: Cryptographic failures expose clinical notes, OAuth tokens, and provider credentials. Under HIPAA, unencrypted PHI transmission or storage without compensating controls violates 45 CFR 164.312(a)(2)(iv) and 164.312(e)(1).`

For A03: `**Healthcare Impact**: SQL injection on PHI tables could exfiltrate clinical notes, risk screening scores, and provider credentials. GraphQL without depth limits could DoS the platform during a crisis screening flow.`

For A04: `**Healthcare Impact**: No rate limiting on the risk screening endpoint means an attacker could enumerate crisis-flagged users. No account lockout allows brute-force access to provider accounts containing clinical data.`

For A05: `**Healthcare Impact**: DEBUG=True in production exposes stack traces containing PHI field names, database queries with patient data, and internal API structure. CORS_ORIGIN_ALLOW_ALL allows any malicious site to make authenticated requests reading clinical data.`

For A06: `**Healthcare Impact**: Known CVEs in Django, Next.js, or Twilio SDK could be exploited to access PHI. Healthcare platforms are high-value targets with mandatory breach reporting, making timely patching critical.`

For A07: `**Healthcare Impact**: JWT tokens in localStorage are XSS-accessible. If an attacker steals a provider's token, they gain access to all that provider's clients' clinical notes and session data.`

For A08: `**Healthcare Impact**: Deserializing untrusted input (pickle, eval) could allow remote code execution with database access to all PHI tables.`

For A09: `**Healthcare Impact**: Without logging on PHI access, the platform cannot detect unauthorized access, satisfy HIPAA audit requirements (164.312(b)), or respond to breach investigations. Missing payment logging creates financial audit gaps.`

For A10: `**Healthcare Impact**: SSRF could be used to access internal services, database connections, or cloud metadata endpoints, potentially exfiltrating PHI or credentials.`
- **Rationale**: A compliance officer reviewing skills will ask "How do you ensure developers understand the healthcare-specific implications of security vulnerabilities?" Generic OWASP guidance without healthcare context cannot serve as healthcare security training.

---

### Fix 20: Standardize Output File Paths Across Audit Skills (MEDIUM)
- **Audit Finding**: FINDING-037
- **Skill**: `phi-pii-leak-scan`, `hipaa-compliance-audit`, `security-code-review`
- **Files**:
  - `C:\Projects\ReallyGlobal\.claude\skills\phi-pii-leak-scan\SKILL.md`
  - `C:\Projects\ReallyGlobal\.claude\skills\hipaa-compliance-audit\SKILL.md`
  - `C:\Projects\ReallyGlobal\.claude\skills\security-code-review\SKILL.md`
- **Section**: Output specification in each skill
- **Issue**: Inconsistent output paths. `security-code-review` has no output section. `[DATE]` placeholders not standardized.
- **Corrected Content**: Add/update an `## Output` section in each skill:

For `phi-pii-leak-scan`:
```markdown
## Output
- **File**: `ContextFiles2/Library/Sessions/phi-pii-leak-scan_Results_{YYYY-MM-DD}.md`
- **Format**: Markdown with severity-classified findings table
- **Delta**: If a previous output file exists, append a "Changes Since Last Run" section
```

For `hipaa-compliance-audit`:
```markdown
## Output
- **File**: `ContextFiles2/Library/Sessions/hipaa-compliance-audit_Results_{YYYY-MM-DD}.md`
- **Format**: Compliance matrix (requirement -> status -> evidence -> remediation)
- **Delta**: If a previous output file exists, highlight new findings and resolved items
```

For `security-code-review`:
```markdown
## Output
- **File**: `ContextFiles2/Library/Sessions/security-code-review_Results_{YYYY-MM-DD}.md`
- **Format**: Severity-ranked findings with CWE references, OWASP category, and fix suggestions
- **Delta**: If a previous output file exists, highlight new findings and resolved items
```
- **Rationale**: SOC 2 Type II requires evidence of continuous control operation. Standardized output paths with date stamps enable archival and delta comparison.

---

### Fix 21: Add Frequency Field to Skill Frontmatter (MEDIUM)
- **Audit Finding**: FINDING-023
- **Skills**: All 6 implemented skills
- **Files**: All 6 SKILL.md files
- **Section**: YAML frontmatter in each skill
- **Issue**: No structured frequency field. Execution frequency is mentioned only in prose.
- **Corrected Content**: Add `frequency:` field to each skill's frontmatter:

`phi-pii-leak-scan`: `frequency: every-pr`
`hipaa-compliance-audit`: `frequency: quarterly`
`security-code-review`: `frequency: every-pr`
`test-data-factory`: `frequency: on-demand`
`mock-external-services`: `frequency: on-demand`
`mock-settings-manager`: `frequency: on-demand`
- **Rationale**: HIPAA requires annual risk analysis at minimum (45 CFR 164.308(a)(1)(ii)(D)). Structured frequency fields enable CI/CD scheduling and compliance evidence.

---

### Fix 22: Add Windows/Docker Gotchas to Test Data and Mock Skills (MEDIUM)
- **Audit Finding**: FINDING-034
- **Skills**: `test-data-factory`, `mock-external-services`
- **Files**:
  - `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
  - `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Section**: Known Patterns & Gotchas section in each
- **Issue**: Missing `MSYS_NO_PATHCONV=1` requirement and two-checkout warning.
- **Corrected Content**: Add to both skills' Known Patterns:

```markdown
8. **Windows Docker exec path mangling**: When running management commands via `docker exec` on Windows
   (Git Bash / MSYS2), prefix with `MSYS_NO_PATHCONV=1` to prevent path conversion:
   `MSYS_NO_PATHCONV=1 docker exec backend python manage.py generate_test_scenarios`

9. **Two-checkout warning**: This repo has two checkout locations:
   `C:\Projects\ReallyGlobal\Lumy-Backend` (Docker primary) and
   `C:\Projects\ReallyGlobal-Infra\Lumy-Backend` (Infra submodule).
   New factory/mock files must be created in the Docker primary checkout.
   After committing in Infra, sync: `cd /c/Projects/ReallyGlobal/Lumy-Backend && git fetch /c/Projects/ReallyGlobal-Infra/Lumy-Backend docker-dev-v2 && git merge FETCH_HEAD --ff-only`
```
- **Rationale**: These are documented known gotchas in MEMORY.md. Developers creating new files will encounter both issues without guidance.

---

### Fix 23: Add State Privacy Law Note to HIPAA Compliance Audit (HIGH)
- **Audit Finding**: FINDING-022
- **Skill**: `hipaa-compliance-audit`
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\hipaa-compliance-audit\SKILL.md`
- **Section**: Known Patterns & Gotchas -- add item 7
- **Issue**: No acknowledgment that state privacy laws may impose stricter requirements than HIPAA.
- **Corrected Content**: Add to Known Patterns:
```markdown
7. **State privacy laws may preempt HIPAA**: HIPAA is a floor, not a ceiling. Several state laws
   impose stricter requirements for mental health records:
   - **California (CMIA)**: Confidentiality of Medical Information Act requires explicit written
     authorization for disclosure of mental health records (CA Civ. Code 56.10)
   - **New York**: Mental Hygiene Law 33.13 restricts disclosure of mental health records beyond
     HIPAA minimum necessary
   - **Texas**: Medical Records Privacy Act (HB 300) adds state-specific consent requirements
   - **CCPA/CPRA**: California residents have data deletion rights that may conflict with HIPAA
     retention requirements -- the HIPAA retention obligation takes precedence for PHI
   Under HIPAA preemption analysis (45 CFR 160.203), state law controls when it provides greater
   privacy protection. A multi-state telehealth platform must comply with the stricter law for
   each client's jurisdiction.
```
- **Rationale**: 45 CFR 160.203 establishes HIPAA preemption rules: state law controls when it is "more stringent" than HIPAA. A platform that is HIPAA-compliant but violates CMIA for California residents is non-compliant in California.

---

### Fix 24: Add Dependency Section to Skill Frontmatter (LOW)
- **Audit Finding**: FINDING-044
- **Skills**: `mock-settings-manager`, `mock-external-services`
- **Files**:
  - `C:\Projects\ReallyGlobal\.claude\skills\mock-settings-manager\SKILL.md`
  - `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Section**: YAML frontmatter
- **Issue**: Skills reference dependencies in prose but not structured metadata.
- **Corrected Content**:

For `mock-settings-manager` frontmatter:
```yaml
depends-on: [mock-external-services]
```

For `mock-external-services` frontmatter:
```yaml
depends-on: []
optional-depends: [frontend-test-scaffold]
```
- **Rationale**: Structured dependency metadata enables automated dependency resolution and prevents developers from running skills with unmet prerequisites.

---

### Fix 25: Add Targeted Example Invocations (LOW)
- **Audit Finding**: FINDING-039
- **Skills**: `phi-pii-leak-scan`, `hipaa-compliance-audit`, `security-code-review`
- **Section**: Example Invocations in each
- **Issue**: Examples show only broad scans, not targeted app-specific checks.
- **Corrected Content**: Add targeted examples:

For `phi-pii-leak-scan`:
```
/phi-pii-leak-scan --scope backend --app video_conferencing   # Just modified the Notes serializer
/phi-pii-leak-scan --scope frontend --app store                # Check Redux for PHI caching
```

For `security-code-review`:
```
/security-code-review --category A01 --app risk_screening      # Check IDOR on risk screening
/security-code-review --category A03 --scope frontend          # XSS in rich text editor
```
- **Rationale**: Targeted examples encourage developers to run quick checks during development instead of only running broad scans before deployment.

---

## Corrections for Missing Skills

### Skill 7: `patient-data-integrity-check`
When implementing, incorporate:
- NPI Luhn validation must use the `80840` prefix per CMS specification (same algorithm as `test-data-factory` Fix 2)
- Risk screening score validation: `UserResponse.final_score` must equal `SUM(ResponseDetail.score)` for all linked details
- PHQ-9 item count validation: a `UserResponse` linked to a PHQ-9 flow should have exactly 9 `ResponseDetail` records
- Crisis follow-up check: `UserResponse` with `is_severe=True` should have a follow-up appointment within 48 hours (or a `ClientScreeningIgnore` record documenting bypass)
- `PreLicensed` supervisor validation: `PreLicensed` records must be linked to a `CareProvider`, and both `supervisor_name` and `supervisor_license_number` must be populated

### Skill 8: `api-response-sanitizer`
When implementing, incorporate:
- Cross-provider note isolation test: create two providers serving the same client, verify Provider A's notes API call does not return Provider B's notes (per HIPAA minimum necessary standard)
- Group therapy participant identity: verify group session API responses do not leak participant identities to other participants
- Provider public profile check: verify GET on provider profile endpoint excludes `npi_number`, `license_number`, `insurance_policy_number`, `home_address` from client-facing responses (NPI is public via NPPES, but license numbers and insurance data are not)
- Wiley treatment plan data: include `apps/wiley/` models in Tier 1 PHI scan since treatment plans are PHI

### Skill 9: `frontend-test-scaffold`
When implementing, incorporate:
- PHI-specific test patterns: template showing how to verify PHI fields are NOT rendered in DOM, NOT persisted in localStorage, and NOT visible in console output after API call
- MSW handler for GraphQL at `/api/v1/graphql/` (Graphene-Django schema)
- Existing mock infrastructure references: coordinate with `mock-external-services` for consistency

### Skill 10: `credential-verification-workflow`
When implementing, incorporate:
- **Cross-state licensure verification**: The platform is a telehealth marketplace. Most US jurisdictions require the provider to hold a license in the CLIENT's state, not just the provider's home state. The booking flow must verify `ProfessionalLicense.state` covers the client's state.
- **PSYPACT / NLC compacts**: For psychology licenses, PSYPACT (Psychology Interjurisdictional Compact) allows practice across participating states. For nursing, the Nurse Licensure Compact (NLC) applies. The skill must check whether the provider's license type participates in a compact.
- **NPI Type 1 vs Type 2**: Individual providers use Type 1 NPIs (prefix 1). Validate that `npi_number` starts with 1 for individual providers.
- **Expired credential scenarios**: Include checks for: expired NPI (`npi_valid_until < today`), expired professional license (`professional_license_valid_until < today`), pre-licensed without supervisor (`PreLicensed.supervisor_name` is NULL), provider with `is_licensed=False` but SCHEDULED appointments.
- **License format validation by state**: At minimum CA (LMFT/LCSW/LPC patterns), NY, TX, FL. Reference `test-data-factory` license_number patterns.

### Skill 11: `django-model-security-hardening`
When implementing, incorporate:
- Data retention per HIPAA: clinical notes 7 years, risk screening 7 years, appointment records 7 years, payment records 7 years (per state medical records retention laws, which may exceed HIPAA's 6-year documentation retention)
- Wiley treatment plan models (`apps/wiley/`) should be included in field-level encryption and audit logging scope
- `pre_save` signal on `Notes` should sanitize HTML (strip `<script>` and event handlers) since `react-quill` produces HTML content
- `post_save` signal on `UserResponse` with `is_severe=True` should trigger: (a) platform safety team notification, (b) mandatory follow-up scheduling within 48 hours, (c) audit log entry

### Skill 12: `consent-tracking-audit`
When implementing, incorporate:
- **NPP delivery at signup**: HIPAA 45 CFR 164.520 requires NPP to be provided at first service delivery. Check for a consent timestamp field tied to privacy notice acceptance.
- **Minor consent with jurisdiction-specific logic**: Per HIPAA 164.502(g)(3), when state law allows a minor to consent to treatment, the minor exercises their own rights. Specific carve-outs:
  - CA: 12+ for mental health (CA Family Code 6924)
  - IL: 12+ for mental health (405 ILCS 5/3-501)
  - OR: 14+ (ORS 109.675)
  - A single global age-of-majority (18) is insufficient
  - Records created under minor self-consent must be withheld from parent/guardian view
- **Telehealth-specific informed consent**: Many states require specific telehealth consent beyond general treatment consent. The consent must acknowledge: video recording possibility, technology limitations, emergency protocols, provider licensure jurisdiction.
- **Consent for risk screening data usage**: The `risk_screening` module collects suicidality data. Consent must specify how this data is used, stored, and who can access it.
- **Right of access (164.524)**: Must be fulfilled within 30 days (one 30-day extension). Verify an export mechanism exists.
- **Amendment rights (164.526)**: Patients may request corrections. Platform must act within 60 days.
- **Accounting of disclosures (164.528)**: Must cover 6 years. Track all non-TPO disclosures.
- **GDPR DSR**: If the platform serves non-US clients (it's "Really Global"), include right to erasure (Art. 17), data portability (Art. 20), and right to restriction (Art. 18).

### Skill 13: `backend-endpoint-security-test`
When implementing, incorporate:
- Cross-provider isolation test: Provider A must not be able to access Provider B's notes for a shared client (HIPAA minimum necessary)
- Minor account creation: verify minor accounts cannot be created without `parent_user` linkage
- Group therapy API: verify participant identity is not leaked to other group members
- Rate limiting on risk screening endpoint: an attacker must not be able to enumerate crisis-flagged users

### Skill 14: `deployment-readiness-check`
When implementing, incorporate:
- Must be designed as a CI/CD blocking gate (SOC 2 CC8.1)
- Verify BAAs are documented for all PHI-touching vendors (Twilio, SendGrid, Azure)
- Verify GraphQL introspection is disabled in production
- Verify mock middleware (`MockProfileMiddleware`) is NOT active (should be disabled when `DEBUG=False`, but verify explicitly)
- Verify Stripe secret key is NOT present in frontend environment variables
- Output must produce timestamped evidence suitable for SOC 2 Type II audit review

---

## New Skills to Add

### New Skill 1: `crisis-response-protocol` (CRITICAL -- P0)
- **Audit Finding**: FINDING-005
- **Directory**: `.claude/skills/crisis-response-protocol/SKILL.md`
- **Purpose**: Document and verify the full crisis escalation chain when `is_severe=True` is triggered.

**Specification**:

```yaml
name: crisis-response-protocol
description: Verify and document the crisis response workflow from risk screening detection through escalation, notification, and follow-up. Use when asked to "crisis protocol", "duty to warn", "mandatory reporting", "crisis escalation", or "safety workflow".
argument-hint: [--check-only] [--generate-docs] [--verify-escalation]
frequency: quarterly
depends-on: [test-data-factory, mock-settings-manager]
```

**Must Cover**:

1. **Detection**: Verify that `UserResponse.is_severe=True` triggers a defined workflow:
   - Platform safety team notification (email, in-app alert, or admin dashboard flag)
   - Client-facing crisis resources display (988 Suicide & Crisis Lifeline, Crisis Text Line)
   - Booking flow interruption (crisis-flagged user should not complete booking without acknowledgment)
   - Audit log entry of the crisis detection event

2. **Duty to Warn (Tarasoff obligations)**:
   - Tarasoff v. Regents of the University of California (1976) established that mental health professionals have a duty to warn identifiable potential victims of serious harm
   - This is NOT a uniform national standard -- it varies by state:
     - **Mandatory duty to warn**: CA, CO, CT, DE, FL, ID, IN, IA, KY, LA, MA, MD, MI, MN, MS, MT, NE, NH, NJ, NY, OH, PA, SC, TN, UT, VA, VT, WI, WY
     - **Permissive (may warn)**: AL, AK, HI, IL, ME, NV, NC, ND, OK, OR, RI, SD, WA, WV
     - **No Tarasoff statute**: TX, GA (but common law duty may apply)
   - The skill must verify: is the provider notified of their Tarasoff obligation? Is there a mechanism to document the duty-to-warn decision? Is there a form or workflow for the provider to record that they assessed the threat and took appropriate action?

3. **Mandatory Reporting**:
   - Child abuse/neglect: ALL 50 states require reporting by healthcare professionals
   - Elder abuse: Most states require reporting by healthcare professionals
   - Imminent self-harm: Most states require action (varies from duty to hospitalize to duty to notify)
   - The skill must verify: is there a mandatory reporting workflow? Does it capture: reporter identity, date/time, nature of concern, actions taken?

4. **Post-Crisis Follow-Up**:
   - A crisis detection without follow-up is clinically negligent
   - Verify: mandatory follow-up appointment scheduling within 48 hours
   - Verify: if the client does not attend follow-up, escalation to safety team
   - Verify: provider is notified of the crisis flag on their next interaction with the client

5. **Administrative Actions**:
   - Account review flag on the client profile
   - Admin notification via internal dashboard
   - Documentation retention per state requirements (typically 7+ years for mental health records)

**Output**: Crisis response readiness matrix mapping each obligation to implementation status.

---

### New Skill 2: `incident-response-breach-notification` (HIGH -- P1)
- **Audit Finding**: FINDING-019
- **Directory**: `.claude/skills/incident-response-breach-notification/SKILL.md`
- **Purpose**: Verify the platform's readiness for HIPAA Breach Notification Rule compliance (45 CFR Part 164, Subpart D).

**Specification**:

```yaml
name: incident-response-breach-notification
description: Verify breach detection, notification, and documentation readiness per HIPAA Breach Notification Rule. Use when asked to "breach notification", "incident response", "security incident", "breach readiness", or "data breach plan".
argument-hint: [--simulate] [--audit-only] [--generate-plan]
frequency: semi-annual
depends-on: [hipaa-compliance-audit]
```

**Must Cover**:

1. **Breach Detection Criteria -- The 4-Factor Test (45 CFR 164.402)**:
   - Factor 1: Nature and extent of the PHI involved (clinical notes vs demographics)
   - Factor 2: The unauthorized person who used the PHI or to whom the disclosure was made
   - Factor 3: Whether the PHI was actually acquired or viewed
   - Factor 4: The extent to which the risk to the PHI has been mitigated
   - Unless all 4 factors demonstrate low probability of compromise, it IS a breach

2. **Notification Timelines (45 CFR 164.404-164.408)**:
   - **Individual notification**: Without unreasonable delay, no later than **60 calendar days** after discovery
   - **HHS notification**:
     - If breach affects **500+ individuals**: Notify HHS **concurrently** with individual notification (within 60 days)
     - If breach affects **fewer than 500**: May log and submit annually (within 60 days of calendar year end)
   - **Media notification**: If breach affects **500+ individuals in a single state/jurisdiction**, notify prominent media outlets in that state within 60 days
   - **Business associate notification**: BAs must notify the covered entity within **60 days** of discovery

3. **Notification Content Requirements (45 CFR 164.404(c))**:
   - Description of the breach (what happened, dates)
   - Types of PHI involved (clinical notes, demographics, payment data)
   - Steps individuals should take to protect themselves
   - What the entity is doing to investigate, mitigate, and prevent recurrence
   - Contact procedures for questions (toll-free number, email, postal address)

4. **Breach Log (45 CFR 164.408(c))**:
   - All breaches affecting fewer than 500 individuals must be logged
   - Log submitted to HHS annually (within 60 days of end of calendar year in which breach was discovered)
   - Log must include: date of breach, date of discovery, number of individuals, type of PHI, description

5. **Platform-Specific Checks**:
   ```bash
   # Check for breach notification endpoint or admin page
   grep -rn --include="*.py" -i 'breach\|incident.*report\|security.*incident' \
     Lumy-Backend/apps/ --exclude-dir=__pycache__

   # Check for breach log model
   grep -rn --include="*.py" 'class.*Breach\|class.*Incident\|class.*SecurityEvent' \
     Lumy-Backend/apps/*/models.py

   # Check for notification template (breach notification email)
   grep -rn --include="*.py" --include="*.html" --include="*.txt" \
     -i 'breach.*notif\|incident.*notif' \
     Lumy-Backend/
   ```

**Output**: Breach notification readiness checklist with status per 45 CFR 164.404-408 requirement.

---

### New Skill 3: `risk-register-synthesis` (HIGH -- P1)
- **Audit Finding**: FINDING-021
- **Directory**: `.claude/skills/risk-register-synthesis/SKILL.md`
- **Purpose**: Aggregate findings from all skills into a consolidated risk register meeting HIPAA 164.308(a)(1)(ii)(D) documentation requirements.

**Specification**:

```yaml
name: risk-register-synthesis
description: Synthesize findings from all healthcare skills into a consolidated HIPAA risk register. Use when asked to "risk register", "risk analysis", "consolidate findings", "HIPAA risk assessment", or "compliance summary".
argument-hint: [--input-dir path] [--output-format markdown|csv|json] [--include-likelihood]
frequency: quarterly
depends-on: [phi-pii-leak-scan, hipaa-compliance-audit, security-code-review]
```

**Must Cover**:

1. **Input Aggregation**: Read all output files from `ContextFiles2/Library/Sessions/*_Results_*.md` and consolidate into a single register.

2. **Risk Register Fields (per 45 CFR 164.308(a)(1)(ii)(A))**:
   | Field | Description |
   |---|---|
   | Risk ID | Unique identifier (e.g., RISK-2026-001) |
   | Risk Description | Plain-language description of the risk |
   | Source Skill | Which skill identified this risk |
   | Source Finding | Finding ID reference |
   | HIPAA Requirement | CFR section (e.g., 164.312(a)(1)) |
   | Likelihood | 1 (Rare) to 5 (Almost Certain) |
   | Impact | 1 (Negligible) to 5 (Critical) |
   | Risk Score | Likelihood x Impact |
   | Current Controls | What controls are in place today |
   | Control Effectiveness | Effective / Partially Effective / Ineffective / None |
   | Planned Controls | What additional controls are planned |
   | Owner | Team or role responsible |
   | Target Date | When planned controls will be implemented |
   | Status | Open / In Progress / Mitigated / Accepted |

3. **Likelihood/Impact Scoring Guide**:
   - **Likelihood**: Based on attack surface, existing controls, and known exploitation patterns
     - 1: Requires physical access + specialized knowledge
     - 2: Requires authenticated access + specific conditions
     - 3: Requires authenticated access, conditions are common
     - 4: Exploitable by any authenticated user
     - 5: Exploitable without authentication
   - **Impact**: Based on PHI exposure, regulatory penalty, and patient harm potential
     - 1: No PHI exposure, no regulatory impact
     - 2: Limited PII exposure (demographic), minor regulatory finding
     - 3: PHI exposure affecting single user, reportable incident
     - 4: PHI exposure affecting multiple users, mandatory breach notification
     - 5: Clinical data breach, patient safety risk, potential harm

4. **HIPAA Requirement Mapping**: Every risk must map to at least one:
   - 164.308 (Administrative Safeguards)
   - 164.310 (Physical Safeguards)
   - 164.312 (Technical Safeguards)
   - 164.314 (Organizational Requirements)
   - 164.316 (Policies and Procedures)
   - 164.520-528 (Privacy Rule)
   - 164.404-408 (Breach Notification)

5. **Output**: Risk register in markdown (for human review) and JSON (for automated tracking).
   - **File**: `ContextFiles2/Library/Sessions/risk-register_{YYYY-MM-DD}.md`
   - Include summary statistics: total risks by severity, top 10 by risk score, risks without controls

**Rationale**: 45 CFR 164.308(a)(1)(ii)(A) requires an "accurate and thorough assessment of the potential risks and vulnerabilities to the confidentiality, integrity, and availability of electronic protected health information." Individual skill outputs are checklists, not a risk analysis. An HHS auditor expects a single consolidated register with quantified likelihood and impact.

---

## Summary Statistics

| Category | Count |
|---|---|
| Fixes for existing skills | 25 |
| Corrections for missing skills | 8 (per-skill implementation notes) |
| New skills specified | 3 |
| Total fix items | 36 |

### Priority Distribution
| Priority | Count | Description |
|---|---|---|
| CRITICAL | 6 | PHQ-9 scoring, NPI types, minor consent, Privacy Rule, BAA table, emergency access |
| HIGH | 11 | Session scenario, Stripe mock, Twilio mock, SendGrid mock, Sterling mock, audit log, cancellations, state privacy, PayPal mock, state law note, cross-provider isolation |
| MEDIUM | 10 | Timezone, ICD-10, PHQ-9 docs, clinical notes, Azure mock, OWASP context, output paths, frequency, gotchas, Wiley |
| LOW | 2 | Dependencies, examples |

### Audit Findings Coverage Map

| Finding | Fix(es) | Priority |
|---|---|---|
| FINDING-001 | Missing skills section (all 8) | CRITICAL |
| FINDING-002 | Fix 1 | CRITICAL |
| FINDING-003 | Fix 3 | CRITICAL |
| FINDING-004 | Fix 4 | CRITICAL |
| FINDING-005 | New Skill 1 (crisis-response-protocol) | CRITICAL |
| FINDING-006 | Fix 2 | CRITICAL |
| FINDING-007 | Skill 10 corrections | CRITICAL |
| FINDING-008 | Skill 12 corrections | CRITICAL |
| FINDING-009 | Fix 5 | CRITICAL |
| FINDING-010 | Fix 6 | CRITICAL |
| FINDING-011 | Skill 10 corrections + Fix 13 | CRITICAL |
| FINDING-012 | Fix 7 | HIGH |
| FINDING-013 | Fix 8 | HIGH |
| FINDING-014 | Fix 9 | HIGH |
| FINDING-015 | Fix 10 | HIGH |
| FINDING-016 | Fix 11 | HIGH |
| FINDING-017 | Skill 13 corrections | HIGH |
| FINDING-018 | Fix 12 | HIGH |
| FINDING-019 | New Skill 2 (incident-response-breach-notification) | HIGH |
| FINDING-020 | Fix 20, Fix 21 | HIGH |
| FINDING-021 | New Skill 3 (risk-register-synthesis) | HIGH |
| FINDING-022 | Fix 23 | HIGH |
| FINDING-023 | Fix 21 | HIGH |
| FINDING-024 | Fix 13 | HIGH |
| FINDING-025 | Fix 8 (PayPal mock) | HIGH |
| FINDING-026 | Skill 8 corrections + Skill 13 corrections | HIGH |
| FINDING-027 | Fix 15 | MEDIUM |
| FINDING-028 | Fix 16 | MEDIUM |
| FINDING-029 | Fix 17 | MEDIUM |
| FINDING-030 | Fix 18 | MEDIUM |
| FINDING-031 | Fix 14 | MEDIUM |
| FINDING-032 | No action (positive finding) | N/A |
| FINDING-033 | Fix 20 (partially) | MEDIUM |
| FINDING-034 | Fix 22 | MEDIUM |
| FINDING-035 | Skill 12 corrections | MEDIUM |
| FINDING-036 | Skill 8 corrections | MEDIUM |
| FINDING-037 | Fix 20 | MEDIUM |
| FINDING-038 | Fix 19 | MEDIUM |
| FINDING-039 | Fix 25 | LOW |
| FINDING-040 | Skill 10 corrections | LOW |
| FINDING-041 | Fix 25 (partially) | LOW |
| FINDING-042 | Skill 8 corrections | LOW |
| FINDING-043 | Fix 10 (SendGrid delivery events) | LOW |
| FINDING-044 | Fix 24 | LOW |
| FINDING-045 | No action (positive finding) | N/A |
| FINDING-046 | No action (positive finding) | N/A |
