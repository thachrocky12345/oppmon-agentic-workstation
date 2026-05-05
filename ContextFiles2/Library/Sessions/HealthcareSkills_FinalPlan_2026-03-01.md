# Final Corrected Plan -- Healthcare Skills
Date: 2026-03-01
Synthesized from: Fix Plan A (Data Model) + Fix Plan B (UX/Scenario)
Agent: PRINCIPAL MERGE

## Executive Summary

This plan merges **16 data model fixes** (Fix Plan A) and **25 UX/scenario fixes** (Fix Plan B) into a single, file-grouped, executable plan. After deduplication and conflict resolution, the plan contains:

- **6 existing skill files requiring edits** (varying number of edits per file)
- **8 recently-written skills requiring corrections** (prevention notes from both auditors applied)
- **3 new skills to create** (crisis-response-protocol, incident-response-breach-notification, risk-register-synthesis)
- **1 README.md update** (add 3 new skills to index)

**Total distinct edit operations**: ~65 across 17 files

### Conflict Resolution Decisions

| Conflict | Fix Plan A | Fix Plan B | Resolution |
|---|---|---|---|
| `CompletedSessionScenario` docstring FK chain | Fix A-5: correct docstring only | Fix B-7: replace entire scenario class | **Merge**: Use Fix B-7's full replacement which incorporates Fix A-5's corrected docstring |
| `CompletedSessionScenario.payment_status=2` | Fix A-3: change to `PaymentStatus.COMPLETED` enum | Fix B-7: keeps `payment_status=2` | **Fix A wins**: Use `PaymentStatus.COMPLETED` enum (the whole point of Fix A-3 is that `2` is FAILED, not COMPLETED). Apply enum fix to Fix B-7's replacement code. |
| `CareProviderFactory` import | Fix A-4: change import source | Fix B-7: uses `CareProviderFactory` without specifying import | **Fix A wins**: Import from `apps.care_provider.tests.conftest` per Fix A-4. |
| `NotesFactory.room_name` LazyAttribute vs LazyFunction | Fix A-13: fix to LazyFunction | Fix B-7: does not address this | **Apply Fix A-13 independently** |
| Twilio mock path | Fix A-2: 4 location edits to existing code | Fix B-9: full replacement of MockTwilioClient class | **Merge**: Use Fix B-9's full replacement (which already patches at correct path). Also apply Fix A-2's fixture function fix and gotcha text update separately. |
| `PaymentMethodFactory` table entry | Fix A-8: add WARNING note | Fix B does not address | **Apply Fix A-8** |
| Tier 2 / Tier 3 tables in phi-pii-leak-scan | Fix A-9, A-10: expand tables | Fix B does not change these tables | **Apply Fix A-9 and A-10** |

---

## Fix Execution Order

Grouped by file. Within each file, fixes are ordered: CRITICAL first, then HIGH, then MEDIUM, then LOW.

---

### Group 1: `test-data-factory/SKILL.md` (18 fixes -- highest priority file)

**File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`

**Sources**: Fix Plan A (Fixes 1, 3, 4, 5, 7, 8, 11, 12, 13, 14), Fix Plan B (Fixes 1, 2, 3, 7, 13, 14, 15, 16, 17, 22)

#### 1.1 [CRITICAL] CareProviderFactory import from wrong conftest (A-4)

**Old text**:
```
from apps.calendar_functionality.tests.conftest import (
    CareProviderFactory, AppointmentFactory, SlotFactory,
    ModalityTypeFactory, FormatTypeFactory,
)
```

**New text**:
```
from apps.care_provider.tests.conftest import CareProviderFactory
from apps.calendar_functionality.tests.conftest import (
    AppointmentFactory, SlotFactory,
    ModalityTypeFactory, FormatTypeFactory,
)
```

Also update the Existing Factories table entry (A-14):

**Old text**:
```
| `CareProviderFactory` | `apps.calendar_functionality.tests.conftest` | `CareProvider` |
```

**New text**:
```
| `CareProviderFactory` | `apps.care_provider.tests.conftest` (preferred -- includes step_counter, is_active, CareProviderScore post_generation) | `CareProvider` |
```

#### 1.2 [CRITICAL] InPersonLocationFactory uses string instead of FK SubFactory (A-1)

Add `CountryCode` to imports:

**Old text**:
```
from apps.care_provider.models import (
    ProfessionalLicense, ProfessionalCertificate, AcademicDegree,
    CareProviderCredential, InPersonLocation, PreLicensed,
)
```

**New text**:
```
from apps.care_provider.models import (
    ProfessionalLicense, ProfessionalCertificate, AcademicDegree,
    CareProviderCredential, InPersonLocation, PreLicensed, CountryCode,
)
```

Replace factory:

**Old text**:
```
class InPersonLocationFactory(DjangoModelFactory):
    class Meta:
        model = InPersonLocation
    full_name_or_practice_name = factory.Faker("company")
    address_line_1 = factory.LazyFunction(lambda: "123 Test Street")
    city = "Testville"
    state = "TS"
    zip_code = "00000"
    latitude = 0.0
    longitude = 0.0
```

**New text**:
```
class CountryCodeFactory(DjangoModelFactory):
    """Minimal CountryCode factory for FK satisfaction."""
    class Meta:
        model = CountryCode
        django_get_or_create = ("country_name", "name_label")
    country_name = "Test Country"
    label = "+0"
    name_label = "TC"


class InPersonLocationFactory(DjangoModelFactory):
    class Meta:
        model = InPersonLocation
    full_name_or_practice_name = factory.Faker("company")
    address_line_1 = factory.LazyFunction(lambda: "123 Test Street")
    city = "Testville"
    state = "TS"
    zip_code = "00000"
    country = factory.SubFactory(CountryCodeFactory)
    latitude = 0.0
    longitude = 0.0
```

#### 1.3 [CRITICAL] payment_status uses wrong hardcoded integer (A-3)

Add import:

**Old text**:
```
from apps.stripe_integration.tests.conftest import StripeUserFactory
from apps.video_conferencing.models import Notes, VideoCallRoom
```

**New text**:
```
from apps.stripe_integration.tests.conftest import StripeUserFactory
from apps.video_conferencing.models import Notes, VideoCallRoom
from apps.calendar_functionality.enum import PaymentStatus
```

Fix CompletedSessionScenario:

**Old text**:
```
            payment_status=2,  # PaymentStatus.COMPLETED
```

**New text**:
```
            payment_status=PaymentStatus.COMPLETED,  # IntegerChoices: 1
```

Fix BookingFunnelScenario:

**Old text**:
```
            payment_status=0,  # PaymentStatus.PENDING
```

**New text**:
```
            payment_status=PaymentStatus.PENDING,  # IntegerChoices: 0
```

**IMPORTANT**: Also apply to ALL other scenario classes added by Fix Plan B (see 1.8, 1.10 below). Every `payment_status` in the file must use the enum, not magic integers.

#### 1.4 [CRITICAL] PHQ-9 Crisis Screening produces invalid per-question scores (B-1)

Replace the entire `CrisisScreeningScenario` class with Fix Plan B's corrected version. The replacement creates 9 `ResponseDetail` records each with `score=3` to correctly sum to 27, references PHQ-9 item 9 (suicidality question) explicitly, and includes `PHQ9_ITEMS` list. See Fix Plan B, Fix 1 for the full class.

#### 1.5 [CRITICAL] NPI Number Generator should default to Type 1 (B-2)

Replace the `npi_number` method in `HealthcareProvider` class:

**Old text**:
```python
    def npi_number(self):
        """Generate a valid-format NPI number (10 digits, Luhn-valid)."""
        prefix = random.choice(['1', '2'])
```

**New text**:
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
```

#### 1.6 [CRITICAL] Add Minor Client Scenario (B-3)

Add the `MinorClientScenario` class from Fix Plan B, Fix 3 after `BookingFunnelScenario` in Step 3. Full class provided in Fix Plan B.

#### 1.7 [HIGH] CompletedSessionScenario missing VideoCallRoom and payment linkage (B-7, merged with A-3 and A-5)

Replace the entire `CompletedSessionScenario` class with Fix Plan B, Fix 7's version, BUT apply the following corrections to that replacement:

1. Change the docstring FK chain from `"FK chain: User -> CareProvider -> Appointment -> VideoCallRoom -> Notes"` to `"Relationship chain: User -> CareProvider -> Appointment --(room_name string match)--> Notes\n    Note: No FK between Appointment, VideoCallRoom, or Notes -- linked only by room_name CharField."` (from Fix A-5)
2. Change `payment_status=2,  # PaymentStatus.COMPLETED` to `payment_status=PaymentStatus.COMPLETED,  # IntegerChoices: 1` (from Fix A-3)

#### 1.8 [HIGH] PaymentMethodFactory description is misleading (A-8)

**Old text**:
```
| `PaymentMethodFactory` | `apps.stripe_integration.tests.conftest` | `PaymentMethod` (TextChoices -- note: this is actually a factory for the PaymentMethod DB record, not the enum) |
```

**New text**:
```
| `PaymentMethodFactory` | `apps.stripe_integration.tests.conftest` | **WARNING: BROKEN** -- targets `PaymentMethod(TextChoices)` enum, not a DB model. References fields (`stripe_user`, `stripe_payment_method_id`) that do not exist on TextChoices. Will raise `TypeError` at runtime. Do not use. |
```

#### 1.9 [HIGH] Notes.date auto_now_add not documented (A-7)

**Old text**:
```
1. **`auto_now_add=True` on BaseModel**: Both `authentication.BaseModel` and `risk_screening.BaseModel` use `auto_now_add=True` for `created_at`. Factory_boy handles this correctly (unlike `loaddata`), but if you try to set `created_at` explicitly, it will be ignored. Use `Model.objects.filter(pk=obj.pk).update(created_at=...)` to override.
```

**New text**:
```
1. **`auto_now_add=True` on BaseModel and Notes.date**: Both `authentication.BaseModel` and `risk_screening.BaseModel` use `auto_now_add=True` for `created_at`. Additionally, `Notes.date` at `apps/video_conferencing/models.py:35` is a SEPARATE `auto_now_add=True` DateTimeField (not inherited from BaseModel). Factory_boy handles these correctly (unlike `loaddata`), but setting them explicitly will be ignored. Use `Model.objects.filter(pk=obj.pk).update(created_at=..., date=...)` to override. Date-ordered assertions on Notes should use `.order_by('date')` and accept auto-assigned values.
```

#### 1.10 [HIGH] Add Cancellation, No-Show, Rescheduling Scenarios (B-13)

Add the 4 scenario classes from Fix Plan B, Fix 13 after the `MinorClientScenario` (or after `BookingFunnelScenario` if MinorClient goes elsewhere). Classes: `CancellationBeforeCutoffScenario`, `CancellationAfterCutoffScenario`, `NoShowScenario`, `RescheduleScenario`.

**IMPORTANT**: Fix the `payment_status` values in these classes to use enums:
- `payment_status=3,  # REFUNDED` -- verify this exists in the enum. If `PaymentStatus` only has PENDING=0, COMPLETED=1, FAILED=2, CANCELED=3, then `3` = CANCELED, not REFUNDED. Use `PaymentStatus.CANCELED` for cancellation scenarios.
- `payment_status=4,  # PARTIALLY_REFUNDED` -- this value likely does NOT exist in the enum (only 0-3). Flag this in a comment: `# NOTE: PaymentStatus enum may not have PARTIALLY_REFUNDED. Check enum and add if needed.`
- `payment_status=2` in NoShowScenario (labeled "COMPLETED") -- actually FAILED per the enum. Use `PaymentStatus.COMPLETED` (which is 1).

#### 1.11 [MEDIUM] AcademicDegreeFactory missing care_provider FK (A-11)

**Old text**:
```
class AcademicDegreeFactory(DjangoModelFactory):
    class Meta:
        model = AcademicDegree
    degree_type = "Master of Science"
    degree_name = "Clinical Psychology"
    degree_granting_institution = "Test University"
    academic_degree_year_granted = 2015
```

**New text**:
```
class AcademicDegreeFactory(DjangoModelFactory):
    class Meta:
        model = AcademicDegree
    care_provider = factory.SubFactory(CareProviderFactory)
    degree_type = "Master of Science"
    degree_name = "Clinical Psychology"
    degree_granting_institution = "Test University"
    academic_degree_year_granted = 2015
```

#### 1.12 [MEDIUM] ProfessionalLicenseFactory orphaned records (A-12)

**Old text**:
```
class ProfessionalLicenseFactory(DjangoModelFactory):
    class Meta:
        model = ProfessionalLicense
    license_name = "Licensed Marriage and Family Therapist"
```

**New text**:
```
class ProfessionalLicenseFactory(DjangoModelFactory):
    """Note: ProfessionalLicense has NO FK to CareProvider. Linkage is via
    CareProviderCredential.professional_license (M2M). After creating a license,
    you must create a CareProviderCredential and call
    credential.professional_license.add(license_instance) to link it."""
    class Meta:
        model = ProfessionalLicense
    license_name = "Licensed Marriage and Family Therapist"
```

#### 1.13 [MEDIUM] NotesFactory LazyAttribute vs LazyFunction (A-13)

**Old text**:
```
    room_name = factory.LazyAttribute(lambda obj: str(factory.Faker._get_faker().uuid4()))
```

**New text**:
```
    room_name = factory.LazyFunction(lambda: str(factory.Faker._get_faker().uuid4()))
```

#### 1.14 [MEDIUM] ICD-10 Code Safety Documentation (B-15)

Replace the `icd10_code` method with Fix Plan B, Fix 15's version (adds `synthetic` parameter, WARNING docstring, F99 default, and ICD-10-CM code comments). See Fix Plan B, Fix 15 for full content.

#### 1.15 [MEDIUM] PHQ-9 Severity Threshold Documentation (B-16)

Add the PHQ-9 severity threshold comment block before `risk_screening_keywords()` and update the method with instrument-mapped keywords. See Fix Plan B, Fix 16 for full content.

#### 1.16 [MEDIUM] Clinical Note Format Labels and OpenNotes (B-17)

Update the `clinical_note()` method docstring to add SOAP label and 21st Century Cures Act note. Add item 8 to Known Patterns about OpenNotes. See Fix Plan B, Fix 17 for full content.

#### 1.17 [MEDIUM] Add Cross-Timezone Booking Scenario (B-14)

Add `CrossTimezoneBookingScenario` class from Fix Plan B, Fix 14 to Step 3 scenarios.

#### 1.18 [MEDIUM] Add Windows/Docker Gotchas (B-22)

Add items 8 and 9 to Known Patterns & Gotchas:

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

#### 1.19 [MEDIUM] Add frequency to frontmatter (B-21)

Add to YAML frontmatter: `frequency: on-demand`

#### 1.20 [MEDIUM] Update argument-hint for new scenarios

Update the `argument-hint` in frontmatter to include new scenarios:

**Old text**:
```
argument-hint: [--scenario CompletedSession|CrisisScreening|NewProviderOnboarding|BookingFunnel|all] [--count N]
```

**New text**:
```
argument-hint: [--scenario CompletedSession|CrisisScreening|NewProviderOnboarding|BookingFunnel|MinorClient|CancellationBeforeCutoff|CancellationAfterCutoff|NoShow|Reschedule|CrossTimezone|all] [--count N]
```

---

### Group 2: `mock-external-services/SKILL.md` (10 fixes)

**File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`

**Sources**: Fix Plan A (Fix 2), Fix Plan B (Fixes 8, 9, 10, 11, 18, 22, 24)

#### 2.1 [CRITICAL] Twilio monkeypatch path targets wrong module (A-2, merged with B-9)

**Strategy**: Use Fix Plan B, Fix 9's full replacement of the `MockTwilioClient` class (which uses correct error classes, error code 53105, implements `recording_failed` and `participant_disconnected`, adds Conversations mock, and generates structurally valid JWTs). Then separately fix the `get_twilio_mock_fixture` function and gotcha per Fix A-2.

Replace the entire `MockTwilioClient` class (lines ~47-106) with Fix Plan B, Fix 9's version. See Fix Plan B for full code.

Fix the fixture function (Fix A-2, Location 1):

**Old text**:
```
def get_twilio_mock_fixture(failure_mode="success"):
    """Pytest fixture factory for Twilio mock."""
    def fixture(monkeypatch):
        mock = MockTwilioClient(failure_mode=failure_mode)
        monkeypatch.setattr("apps.video_conferencing.api.Client", lambda *a, **kw: mock)
        return mock
    return fixture
```

**New text**:
```
def get_twilio_mock_fixture(failure_mode="success"):
    """Pytest fixture factory for Twilio mock.

    Patches at utils.Client (where `from twilio.rest import Client` lives).
    Also patches twilio_config.get_twilio_client for code paths using the singleton.
    """
    def fixture(monkeypatch):
        mock = MockTwilioClient(failure_mode=failure_mode)
        monkeypatch.setattr("apps.video_conferencing.utils.Client", lambda *a, **kw: mock)
        monkeypatch.setattr("apps.video_conferencing.twilio_config.get_twilio_client", lambda **kw: mock)
        return mock
    return fixture
```

Fix inline test examples (Fix A-2, Locations 2 and 3) -- replace all occurrences of:
```
"apps.video_conferencing.api.Client"
```
with:
```
"apps.video_conferencing.utils.Client"
```

Fix Known Patterns item 6 (Fix A-2, Location 4):

**Old text**:
```
6. **Twilio import paths**: The Twilio client is used in `apps/video_conferencing/api.py`. Check exact import path before patching.
```

**New text**:
```
6. **Twilio import paths**: The Twilio `Client` is imported at `apps/video_conferencing/utils.py:3` (`from twilio.rest import Client`) and also lazily in `apps/video_conferencing/twilio_config.py:18`. The `api.py` file does NOT import Client directly. Patch at `apps.video_conferencing.utils.Client` for direct usage and `apps.video_conferencing.twilio_config.get_twilio_client` for the singleton.
```

#### 2.2 [HIGH] Stripe Mock missing decline_code and common decline codes (B-8)

Replace the entire `MockStripeClient` class with Fix Plan B, Fix 8's version. Adds `_make_card_error` helper, distinguishes `code` vs `decline_code`, adds `do_not_honor`, `card_velocity_exceeded`, `expired_card`, `refund_full`, `refund_partial`, `dispute_webhook`, `payment_timeout` modes. See Fix Plan B for full code.

Also add the `MockPayPalClient` class from Fix Plan B, Fix 8 (placed after MockCertnClient or at end of Step 1 backend mocks).

#### 2.3 [HIGH] SendGrid Mock conflates API response with SMTP code (B-10)

Replace the entire `MockSendGridClient` class with Fix Plan B, Fix 10's version. Changes `send()` to always return HTTP 202, adds webhook event queue, distinguishes hard bounce from soft bounce, implements `spam_report` and `invalid_recipient` modes, captures `dynamic_template_data`. See Fix Plan B for full code.

#### 2.4 [HIGH] Sterling/Certn Mock missing stateful transitions and FCRA flow (B-11)

Replace the entire `MockSterlingClient` class and `MockCertnClient` class with Fix Plan B, Fix 11's versions. Adds stateful `_call_count` tracking, `pending -> in_progress -> complete` transitions, FCRA adverse action multi-step flow, `stale_pending` mode. Makes MockCertnClient a separate class (not alias). See Fix Plan B for full code.

#### 2.5 [MEDIUM] Azure Search Mock return type mismatch (B-18)

Add `MockSearchResults` class and replace `MockAzureSearchClient` with Fix Plan B, Fix 18's version. Returns `MockSearchResults` (with `get_count()`, `get_facets()`) instead of plain iterator. Adds `@search.score`, facet support. See Fix Plan B for full code.

#### 2.6 [MEDIUM] Add Windows/Docker Gotchas (B-22)

Add items 8 and 9 to Known Patterns (same content as Group 1, item 1.18).

#### 2.7 [MEDIUM] Add frequency to frontmatter (B-21)

Add to YAML frontmatter: `frequency: on-demand`

#### 2.8 [LOW] Add dependency metadata to frontmatter (B-24)

Add to YAML frontmatter:
```yaml
depends-on: []
optional-depends: [frontend-test-scaffold]
```

---

### Group 3: `hipaa-compliance-audit/SKILL.md` (8 fixes)

**File**: `C:\Projects\ReallyGlobal\.claude\skills\hipaa-compliance-audit\SKILL.md`

**Sources**: Fix Plan A (Fix 15), Fix Plan B (Fixes 4, 5, 6, 12, 20, 21, 23)

#### 3.1 [CRITICAL] Privacy Rule Coverage missing (B-4)

Add Step 8 (Privacy Rule Compliance -- 164 Subpart E) after existing Step 7. Covers NPP delivery (164.520), right of access (164.524), amendment rights (164.526), accounting of disclosures (164.528). See Fix Plan B, Fix 4 for full content including grep commands and compliance matrix rows.

Renumber the existing Step 8 (compliance matrix output) to Step 9.

#### 3.2 [CRITICAL] BAA Determination Table missing (B-5)

Add Section 7b after existing Step 7 grep commands. Includes vendor-by-vendor BAA determination table (Twilio YES, SendGrid YES, Azure YES, Stripe NO, PayPal NO, Sterling/Certn NO, MailModo CONDITIONAL, ipapi NO). See Fix Plan B, Fix 5 for full table and MailModo grep commands.

#### 3.3 [CRITICAL] Emergency Access Procedure and MFA checks missing (B-6)

Add Steps 1d and 1e after existing Step 1c. Covers emergency access procedure (164.312(a)(2)(ii) -- Required), person/entity authentication (164.312(d) -- Required). See Fix Plan B, Fix 6 for full grep commands and remediation text.

#### 3.4 [HIGH] Audit Log Field Specification missing (B-12)

Add to Step 2, after the "Expected finding" note. Includes minimum audit log fields table (user_id, action, model, record_id, timestamp, ip_address, user_agent, fields_accessed, fields_changed, request_path, response_status). Includes `django-auditlog` registration commands and legal discovery export specification. See Fix Plan B, Fix 12 for full content.

#### 3.5 [HIGH] State Privacy Law note (B-23)

Add item 7 to Known Patterns & Gotchas covering state preemption (CMIA, NY Mental Hygiene Law, TX, CCPA/CPRA). See Fix Plan B, Fix 23 for full content.

#### 3.6 [MEDIUM] Missing working directory prerequisite (A-15)

**Old text**:
```
## Prerequisites
- Access to `Lumy-Backend/` source tree
- Knowledge of which models contain PHI (see Tier 1 in phi-pii-leak-scan skill)
```

**New text**:
```
## Prerequisites
- Access to `Lumy-Backend/` source tree
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- Knowledge of which models contain PHI (see Tier 1 in phi-pii-leak-scan skill)
```

#### 3.7 [MEDIUM] Standardize output path (B-20)

Add or update the `## Output` section:
```markdown
## Output
- **File**: `ContextFiles2/Library/Sessions/hipaa-compliance-audit_Results_{YYYY-MM-DD}.md`
- **Format**: Compliance matrix (requirement -> status -> evidence -> remediation)
- **Delta**: If a previous output file exists, highlight new findings and resolved items
```

#### 3.8 [MEDIUM] Add frequency to frontmatter (B-21)

Add to YAML frontmatter: `frequency: quarterly`

---

### Group 4: `phi-pii-leak-scan/SKILL.md` (6 fixes)

**File**: `C:\Projects\ReallyGlobal\.claude\skills\phi-pii-leak-scan\SKILL.md`

**Sources**: Fix Plan A (Fixes 9, 10, 15), Fix Plan B (Fixes 20, 21, 25)

#### 4.1 [MEDIUM] Tier 2 missing sensitive fields (A-9)

Replace the entire Tier 2 table with Fix Plan A, Fix 9's expanded version. Adds: `google_email`, `google_name`, `microsoft_email`, `microsoft_name`, `google_expiration`, `microsoft_expiration`, `visitor_id`, `affiliate_id`, `affiliate_link`, `relationship_file_document`, `profile_handle`, `certificate_number`, `supervisor_license_number`, `paypal_order_id`, `paypal_auth_id`. See Fix Plan A, Fix 9 for full table.

#### 4.2 [MEDIUM] Tier 3 missing identity fields (A-10)

**Old text**:
```
### Tier 3 -- Demographic/Identity
| Model | Field | Location |
|---|---|---|
| `care_provider.CareProvider` | `my_identity_sexuality`, `my_identity_ethnicity_and_race`, `my_identity_faith_and_background_orientation` | `Lumy-Backend/apps/care_provider/models.py` |
| `authentication.User` | `gender`, `vulnerability1`, `vulnerability2` | `Lumy-Backend/apps/authentication/models.py` |
```

**New text**:
```
### Tier 3 -- Demographic/Identity
| Model | Field | Location |
|---|---|---|
| `care_provider.CareProvider` | `my_identity_sexuality`, `my_identity_ethnicity_and_race`, `my_identity_faith_and_background_orientation` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.CareProvider` | `my_identity_gender` (FK -> Genders), `my_identity_pronouns` (FK -> Pronouns) | `Lumy-Backend/apps/care_provider/models.py:966-978` |
| `authentication.User` | `gender`, `vulnerability1`, `vulnerability2` | `Lumy-Backend/apps/authentication/models.py` |
```

#### 4.3 [MEDIUM] Missing working directory prerequisite (A-15)

**Old text**:
```
## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- No running services required (static analysis only)
```

**New text**:
```
## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- No running services required (static analysis only)
```

#### 4.4 [MEDIUM] Standardize output path (B-20)

Add or update the `## Output` section:
```markdown
## Output
- **File**: `ContextFiles2/Library/Sessions/phi-pii-leak-scan_Results_{YYYY-MM-DD}.md`
- **Format**: Markdown with severity-classified findings table
- **Delta**: If a previous output file exists, append a "Changes Since Last Run" section
```

#### 4.5 [MEDIUM] Add frequency to frontmatter (B-21)

Add to YAML frontmatter: `frequency: every-pr`

#### 4.6 [LOW] Add targeted example invocations (B-25)

Add to Example Invocations:
```
/phi-pii-leak-scan --scope backend --app video_conferencing   # Just modified the Notes serializer
/phi-pii-leak-scan --scope frontend --app store                # Check Redux for PHI caching
```

---

### Group 5: `security-code-review/SKILL.md` (5 fixes)

**File**: `C:\Projects\ReallyGlobal\.claude\skills\security-code-review\SKILL.md`

**Sources**: Fix Plan A (Fix 15), Fix Plan B (Fixes 19, 20, 21, 25)

#### 5.1 [MEDIUM] Add Healthcare Impact context to OWASP categories (B-19)

Add a `**Healthcare Impact**:` line after each A01-A10 section header. 10 context lines total. See Fix Plan B, Fix 19 for all 10 lines.

#### 5.2 [MEDIUM] Missing working directory prerequisite (A-15)

**Old text**:
```
## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- For dependency audit: `pip` and `yarn` available (or Docker running)
```

**New text**:
```
## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- For dependency audit: `pip` and `yarn` available (or Docker running)
```

#### 5.3 [MEDIUM] Add Output section (B-20)

Add new section:
```markdown
## Output
- **File**: `ContextFiles2/Library/Sessions/security-code-review_Results_{YYYY-MM-DD}.md`
- **Format**: Severity-ranked findings with CWE references, OWASP category, and fix suggestions
- **Delta**: If a previous output file exists, highlight new findings and resolved items
```

#### 5.4 [MEDIUM] Add frequency to frontmatter (B-21)

Add to YAML frontmatter: `frequency: every-pr`

#### 5.5 [LOW] Add targeted example invocations (B-25)

Add to Example Invocations:
```
/security-code-review --category A01 --app risk_screening      # Check IDOR on risk screening
/security-code-review --category A03 --scope frontend          # XSS in rich text editor
```

---

### Group 6: `mock-settings-manager/SKILL.md` (3 fixes)

**File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-settings-manager\SKILL.md`

**Sources**: Fix Plan B (Fixes 21, 24), Fix Plan A (Prevention Note 1)

#### 6.1 [MEDIUM] Add frequency to frontmatter (B-21)

Add to YAML frontmatter: `frequency: on-demand`

#### 6.2 [LOW] Add dependency metadata (B-24)

Add to YAML frontmatter:
```yaml
depends-on: [mock-external-services]
```

#### 6.3 [MEDIUM] Apply prevention notes (A-Prevention-1)

Verify and correct in existing SKILL.md:
- `SECRET_KEY` is hardcoded (not from env var) -- do not reference `env("SECRET_KEY")`
- `DEBUG = True` and `ALLOWED_HOSTS = ["*"]` are hardcoded, not from env vars
- `MOCK_SERVICES` env var pattern is proposed code from `mock-external-services`, not existing code -- do not reference as "existing"

---

### Group 7: Corrections for 8 Recently-Written Skills

These skills were written AFTER the auditors ran. Apply prevention notes from BOTH Fix Plan A and Fix Plan B.

#### 7.1 `patient-data-integrity-check/SKILL.md`

**File**: `C:\Projects\ReallyGlobal\.claude\skills\patient-data-integrity-check\SKILL.md`

Verify/correct the following (from Fix Plan A Prevention Note 2 + Fix Plan B Skill 7 corrections):

1. NPI numbers are `CharField(max_length=225)`, NOT IntegerField. Luhn validation must handle string input.
2. `CareProvider.npi_number` is `null=True, blank=True`. Do NOT flag NULL NPIs as invalid.
3. `ProfessionalLicense` has NO FK to CareProvider. Linkage: `CareProvider -> CareProviderCredential (FK) -> professional_license (M2M) -> ProfessionalLicense`.
4. `academic_degree_year_granted` and `professional_license_year_granted` are IntegerField (year only), not DateField.
5. Risk screening score validation: `UserResponse.final_score` must equal `SUM(ResponseDetail.score)`.
6. PHQ-9 item count: `UserResponse` linked to PHQ-9 flow should have exactly 9 `ResponseDetail` records.
7. Crisis follow-up: `UserResponse` with `is_severe=True` should have follow-up appointment within 48 hours or `ClientScreeningIgnore` record.
8. `PreLicensed` supervisor: both `supervisor_name` and `supervisor_license_number` must be populated.
9. Add `frequency: quarterly` to frontmatter.

#### 7.2 `api-response-sanitizer/SKILL.md`

**File**: `C:\Projects\ReallyGlobal\.claude\skills\api-response-sanitizer\SKILL.md`

Verify/correct (from Fix Plan A Prevention Note 3 + Fix Plan B Skill 8 corrections):

1. `PaymentMethod` in `stripe_integration/models.py` is `TextChoices` enum, NOT a model. Do NOT reference "PaymentMethod records/serializer".
2. `Notes.notes` has NO model-level access control; sanitization at view/serializer layer only.
3. OAuth fields (`google_email`, `google_name`, `microsoft_email`, `microsoft_name`, etc.) must be excluded from public API responses.
4. `User.profile_handle` auto-generated from PII -- requires special treatment in sanitization.
5. Cross-provider note isolation test: verify Provider A cannot see Provider B's notes for shared client.
6. Group therapy participant identity: verify group session responses do not leak identities.
7. Provider public profile: verify GET excludes `npi_number`, `license_number`, `insurance_policy_number` from client-facing responses.
8. Include `apps/wiley/` models in Tier 1 PHI scan (treatment plans are PHI).
9. Add `frequency: every-pr` to frontmatter.

#### 7.3 `frontend-test-scaffold/SKILL.md`

**File**: `C:\Projects\ReallyGlobal\.claude\skills\frontend-test-scaffold\SKILL.md`

Verify/correct (from Fix Plan A Prevention Note 4 + Fix Plan B Skill 9 corrections):

1. Next.js 13 with PAGES router (NOT app router). Target `src/pages/`, not `app/`.
2. Frontend has BOTH Redux (RTK) and some Zustand state. Test scaffolds need both store providers.
3. Apollo Client at `src/store/apollo_client.ts` AND `src/store/apolloClient.ts` (two files). Mock both.
4. Axios interceptor at `src/store/axiosInstance.ts` auto-refreshes tokens on 401. Test mocks must handle this.
5. PHI-specific test patterns: verify PHI not rendered in DOM, not in localStorage, not in console output.
6. MSW handler for GraphQL at `/api/v1/graphql/` (Graphene-Django).
7. Coordinate with `mock-external-services` for consistency.
8. Add `frequency: on-demand` to frontmatter.

#### 7.4 `credential-verification-workflow/SKILL.md`

**File**: `C:\Projects\ReallyGlobal\.claude\skills\credential-verification-workflow\SKILL.md`

Verify/correct (from Fix Plan A Prevention Note 5 + Fix Plan B Skill 10 corrections):

1. `professional_license_year_granted` and `professional_license_valid_until` are IntegerField (year only), NOT DateField. Compare integer years, not dates.
2. `certificate_number` and `license_number` are nullable CharFields.
3. `PreLicensed.anticipated_completion_date` IS a DateField (unlike the year fields).
4. Linkage: `CareProvider.credential` (FK to `CareProviderCredential`) -> `.professional_license` (M2M), `.professional_certificate` (M2M), `.academic_degree` (M2M), `.pre_licensed` (M2M).
5. **Cross-state licensure verification**: Provider must hold license in CLIENT's state (telehealth requirement). Check at booking time.
6. **PSYPACT / NLC compacts**: Check if provider's license type participates in interstate compact.
7. **NPI Type 1 vs Type 2**: Validate individual providers use Type 1 (prefix 1).
8. **Expired credential scenarios**: expired NPI, expired license, pre-licensed without supervisor, unlicensed provider with SCHEDULED appointments.
9. Add `frequency: quarterly` to frontmatter.

#### 7.5 `django-model-security-hardening/SKILL.md`

**File**: `C:\Projects\ReallyGlobal\.claude\skills\django-model-security-hardening\SKILL.md`

Verify/correct (from Fix Plan A Prevention Note 6 + Fix Plan B Skill 11 corrections):

1. `InPersonLocation.country` is FK to `CountryCode`, NOT CharField. Do NOT suggest string validators.
2. `User.id` is already `UUIDField(primary_key=True)`. Do NOT suggest adding UUID PKs to User.
3. `BaseModel.is_active` already exists. Use it for soft delete, do not add a new field.
4. `Notes` has NO `client` FK -- only `care_provider` FK. Security filtering by client must be at view level.
5. Data retention: 7 years for clinical notes, risk screening, appointments, payments (per state medical records law).
6. Include `apps/wiley/` models in encryption and audit logging scope.
7. `pre_save` signal on `Notes` should strip `<script>` and event handlers (react-quill produces HTML).
8. `post_save` on `UserResponse` with `is_severe=True` should trigger: safety team notification, mandatory follow-up, audit log entry.
9. Add `frequency: on-demand` to frontmatter.

#### 7.6 `consent-tracking-audit/SKILL.md`

**File**: `C:\Projects\ReallyGlobal\.claude\skills\consent-tracking-audit\SKILL.md`

Verify/correct (from Fix Plan A Prevention Note 7 + Fix Plan B Skill 12 corrections):

1. `Client.tandc_consent` and `User.is_agree` are SEPARATE consent fields. Both must be checked.
2. `User.age_vulnerability_check` at line 122 is consent-related. Include in tracking.
3. No dedicated consent audit trail model exists -- only `created_at` from BaseModel. Note this gap.
4. **NPP delivery at signup**: HIPAA 164.520 -- check for consent timestamp tied to privacy notice.
5. **Minor consent with jurisdiction-specific logic**: HIPAA 164.502(g)(3). Carve-outs: CA 12+, IL 12+, OR 14+. Single global age-of-majority (18) is insufficient. Records under minor self-consent must be withheld from parent.
6. **Telehealth-specific informed consent**: State-specific. Must acknowledge video recording, tech limitations, emergency protocols, licensure jurisdiction.
7. **Risk screening data consent**: How suicidality data is used, stored, who can access.
8. **Right of access (164.524)**: 30-day deadline. Verify export mechanism.
9. **Amendment rights (164.526)**: 60-day deadline.
10. **Accounting of disclosures (164.528)**: 6-year coverage for non-TPO disclosures.
11. **GDPR DSR**: If serving non-US clients -- right to erasure (Art. 17), data portability (Art. 20), restriction (Art. 18).
12. Add `frequency: quarterly` to frontmatter.

#### 7.7 `backend-endpoint-security-test/SKILL.md`

**File**: `C:\Projects\ReallyGlobal\.claude\skills\backend-endpoint-security-test\SKILL.md`

Verify/correct (from Fix Plan A Prevention Note 8 + Fix Plan B Skill 13 corrections):

1. GraphQL endpoint at `/api/v1/graphql/` may be wrapped with `csrf_exempt`. Check `lumy_global/urls.py`.
2. Permission class names vary across apps. Grep for actual definitions, do not assume `IsOwner` etc. exist.
3. `video_conferencing/api.py` is NOT a DRF view -- it's a plain Python class. Check `views.py` for security.
4. `_STRIPE_CONFIGURED` and `_PAYPAL_CONFIGURED` are module-level guards in `stripe_integration/views.py`.
5. Cross-provider isolation test: Provider A must not access Provider B's notes for shared client.
6. Minor account creation: verify minor accounts cannot be created without `parent_user` linkage.
7. Group therapy API: verify participant identity is not leaked to other group members.
8. Rate limiting on risk screening endpoint: prevent enumeration of crisis-flagged users.
9. Add `frequency: every-pr` to frontmatter.

#### 7.8 `deployment-readiness-check/SKILL.md`

**File**: `C:\Projects\ReallyGlobal\.claude\skills\deployment-readiness-check\SKILL.md`

Verify/correct (from Fix Plan A Prevention Note 9 + Fix Plan B Skill 14 corrections):

1. `SECRET_KEY` is hardcoded as a literal string, NOT loaded from env var. Flag explicitly.
2. `CORS_ORIGIN_ALLOW_ALL = True` is the setting name used (not `CORS_ALLOW_ALL_ORIGINS`). Check both variants.
3. `CSRF_TRUSTED_ORIGINS` = `["https://devapi.really.global"]` only. One origin, no wildcard.
4. `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` do NOT exist in settings. Flag their ABSENCE, not search for them set to False.
5. Check `GRAPHENE` settings for introspection disabled in production.
6. Must be designed as CI/CD blocking gate (SOC 2 CC8.1).
7. Verify BAAs documented for all PHI-touching vendors.
8. Verify GraphQL introspection disabled in production.
9. Verify mock middleware (`MockProfileMiddleware`) is NOT active when `DEBUG=False`.
10. Verify Stripe secret key NOT in frontend env vars.
11. Output must produce timestamped evidence for SOC 2 Type II review.
12. Add `frequency: pre-deployment` to frontmatter.

---

### Group 8: New Skill -- `crisis-response-protocol` (P0 CRITICAL)

**Directory**: `C:\Projects\ReallyGlobal\.claude\skills\crisis-response-protocol\`
**File**: `C:\Projects\ReallyGlobal\.claude\skills\crisis-response-protocol\SKILL.md`

Create directory and write SKILL.md per Fix Plan B, New Skill 1 specification.

**Frontmatter**:
```yaml
---
name: crisis-response-protocol
description: Verify and document the crisis response workflow from risk screening detection through escalation, notification, and follow-up. Use when asked to "crisis protocol", "duty to warn", "mandatory reporting", "crisis escalation", or "safety workflow".
argument-hint: [--check-only] [--generate-docs] [--verify-escalation]
frequency: quarterly
depends-on: [test-data-factory, mock-settings-manager]
---
```

**Must Cover** (5 sections):
1. **Detection**: `UserResponse.is_severe=True` triggers workflow -- safety team notification, crisis resources (988 Lifeline), booking flow interruption, audit log entry
2. **Duty to Warn (Tarasoff)**: State-by-state mandatory vs permissive vs no-statute. Mechanism for provider to document threat assessment and action taken.
3. **Mandatory Reporting**: Child abuse (all 50 states), elder abuse, imminent self-harm. Capture: reporter identity, date/time, nature of concern, actions taken.
4. **Post-Crisis Follow-Up**: Mandatory follow-up within 48 hours. Escalation if client does not attend. Provider notification of crisis flag.
5. **Administrative Actions**: Account review flag, admin dashboard notification, retention per state requirements.

**Output**: Crisis response readiness matrix.

See Fix Plan B, New Skill 1 for complete specification including Tarasoff state-by-state lists and workflow steps.

---

### Group 9: New Skill -- `incident-response-breach-notification` (P1 HIGH)

**Directory**: `C:\Projects\ReallyGlobal\.claude\skills\incident-response-breach-notification\`
**File**: `C:\Projects\ReallyGlobal\.claude\skills\incident-response-breach-notification\SKILL.md`

Create directory and write SKILL.md per Fix Plan B, New Skill 2 specification.

**Frontmatter**:
```yaml
---
name: incident-response-breach-notification
description: Verify breach detection, notification, and documentation readiness per HIPAA Breach Notification Rule. Use when asked to "breach notification", "incident response", "security incident", "breach readiness", or "data breach plan".
argument-hint: [--simulate] [--audit-only] [--generate-plan]
frequency: semi-annual
depends-on: [hipaa-compliance-audit]
---
```

**Must Cover** (5 sections):
1. **4-Factor Breach Test (164.402)**: Nature of PHI, unauthorized person, acquired/viewed, mitigation
2. **Notification Timelines (164.404-408)**: Individual 60 days, HHS concurrent if 500+, media if 500+ in state, BA 60 days
3. **Notification Content (164.404(c))**: Description, PHI types, self-protection steps, investigation/mitigation, contact info
4. **Breach Log (164.408(c))**: All <500 breaches logged, annual submission to HHS
5. **Platform-Specific Checks**: grep for breach/incident models, notification templates, security event logging

See Fix Plan B, New Skill 2 for complete specification.

---

### Group 10: New Skill -- `risk-register-synthesis` (P1 HIGH)

**Directory**: `C:\Projects\ReallyGlobal\.claude\skills\risk-register-synthesis\`
**File**: `C:\Projects\ReallyGlobal\.claude\skills\risk-register-synthesis\SKILL.md`

Create directory and write SKILL.md per Fix Plan B, New Skill 3 specification.

**Frontmatter**:
```yaml
---
name: risk-register-synthesis
description: Synthesize findings from all healthcare skills into a consolidated HIPAA risk register. Use when asked to "risk register", "risk analysis", "consolidate findings", "HIPAA risk assessment", or "compliance summary".
argument-hint: [--input-dir path] [--output-format markdown|csv|json] [--include-likelihood]
frequency: quarterly
depends-on: [phi-pii-leak-scan, hipaa-compliance-audit, security-code-review]
---
```

**Must Cover** (5 sections):
1. **Input Aggregation**: Read all `*_Results_*.md` files from `ContextFiles2/Library/Sessions/`
2. **Risk Register Fields**: Risk ID, Description, Source Skill, HIPAA Requirement, Likelihood (1-5), Impact (1-5), Risk Score, Current Controls, Planned Controls, Owner, Target Date, Status
3. **Likelihood/Impact Scoring Guide**: 1-5 scale with healthcare-specific criteria
4. **HIPAA Requirement Mapping**: Map every risk to 164.308/310/312/314/316/520-528/404-408
5. **Output**: `ContextFiles2/Library/Sessions/risk-register_{YYYY-MM-DD}.md` + JSON + summary statistics

See Fix Plan B, New Skill 3 for complete specification including scoring guide and field definitions.

---

### Group 11: README.md Update

**File**: `C:\Projects\ReallyGlobal\.claude\skills\README.md`

Add the 3 new skills to the Healthcare Security & Compliance Skills table:

**Add rows after `deployment-readiness-check`**:
```
| `crisis-response-protocol` | "crisis protocol", "duty to warn", "mandatory reporting", "crisis escalation" | Crisis escalation: detection, Tarasoff, mandatory reporting, follow-up |
| `incident-response-breach-notification` | "breach notification", "incident response", "security incident", "breach readiness" | HIPAA Breach Notification Rule compliance (45 CFR 164 Subpart D) |
| `risk-register-synthesis` | "risk register", "risk analysis", "consolidate findings", "HIPAA risk assessment" | Consolidated HIPAA risk register from all skill outputs |
```

Update the header count from `(14 skills)` to `(17 skills)`.

---

## Post-Fix Verification Checklist

After the EXECUTE FINAL agent applies all fixes, verify:

### Data Model Accuracy (from Audit A)
- [ ] `InPersonLocationFactory.country` uses `SubFactory(CountryCodeFactory)`, not string `"US"`
- [ ] `CareProviderFactory` imported from `apps.care_provider.tests.conftest` (not calendar)
- [ ] All `payment_status` values use `PaymentStatus` enum, not magic integers
- [ ] `CompletedSessionScenario` docstring says "room_name string match", not "FK chain"
- [ ] `ProfessionalLicenseFactory` has M2M linkage docstring warning
- [ ] `AcademicDegreeFactory` has `care_provider` SubFactory
- [ ] `NotesFactory.room_name` uses `LazyFunction`, not `LazyAttribute`
- [ ] `PaymentMethodFactory` table entry has WARNING about TextChoices
- [ ] Twilio monkeypatch targets `utils.Client`, not `api.Client` (all 4 locations)
- [ ] `phi-pii-leak-scan` Tier 2 table has 16+ rows (up from 7)
- [ ] `phi-pii-leak-scan` Tier 3 table has 3 rows (added gender/pronouns)
- [ ] All 3 grep-based skills have working directory prerequisite

### UX/Scenario Accuracy (from Audit B)
- [ ] `CrisisScreeningScenario` creates 9 `ResponseDetail` records with `score=3` each
- [ ] NPI generator defaults to `npi_type=1` (individual providers)
- [ ] `MinorClientScenario` exists with jurisdiction-aware consent logic
- [ ] `CompletedSessionScenario` includes `VideoCallRoom` and client-side `StripeUser`
- [ ] `hipaa-compliance-audit` has Privacy Rule step (164.520, 164.524, 164.526, 164.528)
- [ ] `hipaa-compliance-audit` has BAA determination table
- [ ] `hipaa-compliance-audit` has emergency access (164.312(a)(2)(ii)) and MFA (164.312(d)) checks
- [ ] `hipaa-compliance-audit` has audit log field specification
- [ ] `MockStripeClient` distinguishes `code` vs `decline_code` and has refund/dispute modes
- [ ] `MockTwilioClient` uses error code 53105 (not 53205) and implements all listed failure modes
- [ ] `MockSendGridClient.send()` returns 202 (not 550) with async webhook events
- [ ] `MockSterlingClient` has stateful transitions and FCRA adverse action flow
- [ ] `MockCertnClient` is a separate class (not alias) with Certn-specific statuses
- [ ] `MockAzureSearchClient.search()` returns `MockSearchResults` with `get_count()`/`get_facets()`
- [ ] `MockPayPalClient` class exists with 6 failure modes
- [ ] `security-code-review` has Healthcare Impact context on all A01-A10 sections
- [ ] All 6 original skills have `frequency:` in frontmatter
- [ ] All 3 audit skills have standardized output paths
- [ ] Cancellation/NoShow/Reschedule scenarios exist in `test-data-factory`
- [ ] `CrossTimezoneBookingScenario` exists
- [ ] State privacy law note exists in `hipaa-compliance-audit` Known Patterns

### New Skills
- [ ] `crisis-response-protocol/SKILL.md` exists with Tarasoff + mandatory reporting sections
- [ ] `incident-response-breach-notification/SKILL.md` exists with 4-factor test + notification timelines
- [ ] `risk-register-synthesis/SKILL.md` exists with risk register fields + scoring guide
- [ ] `README.md` lists 17 healthcare skills (up from 14)

### Prevention Notes Applied to Recently-Written Skills
- [ ] `patient-data-integrity-check`: NPI as CharField, NULL allowed, no ProfessionalLicense FK
- [ ] `api-response-sanitizer`: PaymentMethod is TextChoices not model, cross-provider isolation
- [ ] `frontend-test-scaffold`: Pages router not app router, dual Apollo clients
- [ ] `credential-verification-workflow`: Year fields are IntegerField, cross-state licensure
- [ ] `django-model-security-hardening`: InPersonLocation.country is FK, User.id already UUID
- [ ] `consent-tracking-audit`: Separate tandc_consent and is_agree, minor consent carve-outs
- [ ] `backend-endpoint-security-test`: api.py is not DRF view, csrf_exempt on GraphQL
- [ ] `deployment-readiness-check`: SECRET_KEY hardcoded, SECURE_* settings absent not False

---

## Execution Order for EXECUTE FINAL Agent

1. **Read each target file** before editing (required by the Edit tool)
2. **Apply Group 1** (test-data-factory) -- highest fix count, most CRITICAL fixes
3. **Apply Group 2** (mock-external-services) -- second highest, CRITICAL Twilio path fix
4. **Apply Group 3** (hipaa-compliance-audit) -- CRITICAL Privacy Rule and BAA gaps
5. **Apply Group 4** (phi-pii-leak-scan) -- MEDIUM fixes
6. **Apply Group 5** (security-code-review) -- MEDIUM fixes
7. **Apply Group 6** (mock-settings-manager) -- MEDIUM/LOW fixes
8. **Apply Group 7** (8 recently-written skills) -- verify and correct each
9. **Create Group 8** (crisis-response-protocol) -- new skill
10. **Create Group 9** (incident-response-breach-notification) -- new skill
11. **Create Group 10** (risk-register-synthesis) -- new skill
12. **Apply Group 11** (README.md update)
13. **Run verification checklist** -- spot-check 5+ items from each section

---

*End of Final Plan*
