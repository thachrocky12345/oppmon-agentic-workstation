# Fix Plan -- Data Model Audit
Date: 2026-03-01
Agent: FIX PLAN A (Data Model)

## Fix Priority Order
1. CRITICAL fixes first (will cause runtime failures)
2. HIGH fixes (incorrect data, security gaps, misleading documentation)
3. MEDIUM fixes (inaccurate references, incomplete coverage)
4. LOW fixes (style, naming, minor cosmetic)

---

## Fixes

---

### Fix 1: test-data-factory -- InPersonLocationFactory uses string instead of FK SubFactory (CRITICAL)

- **Audit Finding**: 1.1
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: `InPersonLocation.country` is `models.ForeignKey(CountryCode, ...)` at `apps/care_provider/models.py:619`. Assigning `"US"` raises `ValueError: Cannot assign "US": "InPersonLocation.country" must be a "CountryCode" instance`. The existing factory at `apps/care_provider/tests/conftest.py:329` correctly uses `country = SubFactory(CountryCodeFactory)`.
- **Old text**:
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
- **New text**:
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
- **Verification**: The `InPersonLocation.country` FK at line 619-625 of `apps/care_provider/models.py` points to `CountryCode`. The existing real factory at `apps/care_provider/tests/conftest.py:329` uses `country = SubFactory(CountryCodeFactory)`. This fix mirrors that pattern.
- **Additional import needed**: Add `CountryCode` to the imports from `apps.care_provider.models`:
  - **Old text**: `from apps.care_provider.models import (\n    ProfessionalLicense, ProfessionalCertificate, AcademicDegree,\n    CareProviderCredential, InPersonLocation, PreLicensed,\n)`
  - **New text**: `from apps.care_provider.models import (\n    ProfessionalLicense, ProfessionalCertificate, AcademicDegree,\n    CareProviderCredential, InPersonLocation, PreLicensed, CountryCode,\n)`

---

### Fix 2: mock-external-services -- Twilio monkeypatch path targets wrong module (CRITICAL)

- **Audit Finding**: 10.1
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Why**: The Twilio `Client` from `twilio.rest` is imported at `apps/video_conferencing/utils.py:3`, NOT in `apps/video_conferencing/api.py`. The `api.py` file imports from `apps.video_conferencing.utils` instead (confirmed: `api.py` line 1-4 shows NO `from twilio` import). Monkeypatching `api.Client` will silently do nothing -- tests appear to pass but the real Twilio Client is never mocked.
- **Location 1 -- `get_twilio_mock_fixture` function**:
- **Old text**:
```
def get_twilio_mock_fixture(failure_mode="success"):
    """Pytest fixture factory for Twilio mock."""
    def fixture(monkeypatch):
        mock = MockTwilioClient(failure_mode=failure_mode)
        monkeypatch.setattr("apps.video_conferencing.api.Client", lambda *a, **kw: mock)
        return mock
    return fixture
```
- **New text**:
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
- **Location 2 -- Step 4 inline test example `test_video_room_failure`**:
- **Old text**:
```
# Backend: test Twilio room creation failure
def test_video_room_failure(monkeypatch):
    from apps.utils.mocks.twilio_mock import MockTwilioClient
    mock = MockTwilioClient(failure_mode="room_full")
    monkeypatch.setattr("apps.video_conferencing.api.Client", lambda *a, **kw: mock)
    # ... make API call and assert graceful error handling
```
- **New text**:
```
# Backend: test Twilio room creation failure
def test_video_room_failure(monkeypatch):
    from apps.utils.mocks.twilio_mock import MockTwilioClient
    mock = MockTwilioClient(failure_mode="room_full")
    monkeypatch.setattr("apps.video_conferencing.utils.Client", lambda *a, **kw: mock)
    # ... make API call and assert graceful error handling
```
- **Location 3 -- Step 4 inline test example `test_all_services_offline`**:
- **Old text**:
```
    monkeypatch.setattr("apps.video_conferencing.api.Client",
        lambda *a, **kw: MockTwilioClient(failure_mode="timeout"))
```
- **New text**:
```
    monkeypatch.setattr("apps.video_conferencing.utils.Client",
        lambda *a, **kw: MockTwilioClient(failure_mode="timeout"))
```
- **Location 4 -- Known Patterns & Gotchas item #6**:
- **Old text**:
```
6. **Twilio import paths**: The Twilio client is used in `apps/video_conferencing/api.py`. Check exact import path before patching.
```
- **New text**:
```
6. **Twilio import paths**: The Twilio `Client` is imported at `apps/video_conferencing/utils.py:3` (`from twilio.rest import Client`) and also lazily in `apps/video_conferencing/twilio_config.py:18`. The `api.py` file does NOT import Client directly. Patch at `apps.video_conferencing.utils.Client` for direct usage and `apps.video_conferencing.twilio_config.get_twilio_client` for the singleton.
```
- **Verification**: `apps/video_conferencing/utils.py:3` confirms `from twilio.rest import Client`. `apps/video_conferencing/api.py:1-4` shows zero twilio imports. `apps/video_conferencing/twilio_config.py:18` has a lazy import inside `get_twilio_client()`.

---

### Fix 3: test-data-factory -- payment_status uses wrong hardcoded integer (CRITICAL)

- **Audit Finding**: 14.2
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: `apps/calendar_functionality/enum.py` defines `PaymentStatus.COMPLETED = 1` (not 2). The value `2` is `PaymentStatus.FAILED`. Using `payment_status=2` creates appointments with FAILED status instead of COMPLETED, silently corrupting test scenarios.
- **Actual enum values** (from `apps/calendar_functionality/enum.py`):
  ```
  PENDING = 0, 'Pending'
  COMPLETED = 1, 'Completed'
  FAILED = 2, 'Failed'
  CANCELED = 3, 'Canceled'
  ```
- **Location 1 -- CompletedSessionScenario**:
- **Old text**:
```
            payment_status=2,  # PaymentStatus.COMPLETED
```
- **New text**:
```
            payment_status=PaymentStatus.COMPLETED,  # IntegerChoices: 1
```
- **Location 2 -- BookingFunnelScenario**:
- **Old text**:
```
            payment_status=0,  # PaymentStatus.PENDING
```
- **New text**:
```
            payment_status=PaymentStatus.PENDING,  # IntegerChoices: 0
```
- **Location 3 -- Add import at top of Step 3 code block**:
  The Step 3 code block must import the enum. Add to the Step 2 imports section:
- **Old text**:
```
from apps.stripe_integration.tests.conftest import StripeUserFactory
from apps.video_conferencing.models import Notes, VideoCallRoom
```
- **New text**:
```
from apps.stripe_integration.tests.conftest import StripeUserFactory
from apps.video_conferencing.models import Notes, VideoCallRoom
from apps.calendar_functionality.enum import PaymentStatus
```
- **Verification**: `apps/calendar_functionality/enum.py` confirms `PENDING = 0`, `COMPLETED = 1`, `FAILED = 2`, `CANCELED = 3`. The `Appointment.payment_status` field at `apps/calendar_functionality/models.py:100-103` uses `PaymentStatus.choices` and `default=PaymentStatus.PENDING`.

---

### Fix 4: test-data-factory -- CareProviderFactory imported from wrong conftest (HIGH)

- **Audit Finding**: 1.2
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: The calendar conftest `CareProviderFactory` (line 24) only sets `user = SubFactory(UserFactory, user_type="CAREPROVIDER")`. The care_provider conftest version (line 72) also sets `step_counter = "done"`, `is_active = True`, and has a `@post_generation` hook creating `CareProviderScore`. Healthcare test scenarios need complete providers with scores.
- **Old text**:
```
from apps.calendar_functionality.tests.conftest import (
    CareProviderFactory, AppointmentFactory, SlotFactory,
    ModalityTypeFactory, FormatTypeFactory,
)
```
- **New text**:
```
from apps.care_provider.tests.conftest import CareProviderFactory
from apps.calendar_functionality.tests.conftest import (
    AppointmentFactory, SlotFactory,
    ModalityTypeFactory, FormatTypeFactory,
)
```
- **Verification**: `apps/care_provider/tests/conftest.py:72-91` shows the richer factory with `step_counter = "done"`, `is_active = True`, and `@post_generation def create_score`. `apps/calendar_functionality/tests/conftest.py:24-32` shows the bare-bones version with only `user` set.

---

### Fix 5: test-data-factory -- FK chain docstring is incorrect (HIGH)

- **Audit Finding**: 4.1
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: There is NO ForeignKey between `Appointment` and `VideoCallRoom` or `Notes`. The linkage is through `room_name` (CharField string match). `Appointment.room_name` at `models.py:85`, `Notes.room_name` at `models.py:34`, and `VideoCallRoom.room_name` at `models.py:11` are all CharField with no FK relationships.
- **Old text**:
```
    """
    Creates: provider + client + appointment(COMPLETED) + notes + stripe payment
    FK chain: User -> CareProvider -> Appointment -> VideoCallRoom -> Notes
    """
```
- **New text**:
```
    """
    Creates: provider + client + appointment(COMPLETED) + notes + stripe payment
    Relationship chain: User -> CareProvider -> Appointment --(room_name string match)--> Notes
    Note: No FK between Appointment, VideoCallRoom, or Notes -- linked only by room_name CharField.
    """
```
- **Verification**: `apps/calendar_functionality/models.py:85` (`room_name = CharField`), `apps/video_conferencing/models.py:11` (`room_name = CharField`), `apps/video_conferencing/models.py:34` (`room_name = CharField`). No FK relationships exist between these models.

---

### Fix 6: mock-external-services -- Missing documentation of twilio_config.py import path (HIGH)

- **Audit Finding**: 10.2
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Why**: Twilio `Client` is also imported inside `apps/video_conferencing/twilio_config.py:18` via a lazy singleton function `get_twilio_client()`. Patching only `utils.Client` may miss code paths that use the singleton.
- **Action**: This is already addressed in Fix 2 above (the `get_twilio_mock_fixture` fix adds `monkeypatch.setattr("apps.video_conferencing.twilio_config.get_twilio_client", ...)` and the gotcha #6 update documents both locations). No additional edit needed beyond Fix 2.

---

### Fix 7: test-data-factory -- Notes.date auto_now_add not documented (HIGH)

- **Audit Finding**: 14.1
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: `Notes.date` at `apps/video_conferencing/models.py:35` has `auto_now_add=True` separate from the `created_at` inherited from BaseModel. The gotcha section mentions `auto_now_add` on BaseModel but not on `Notes.date` specifically. This could cause confusion when writing date-ordered assertions.
- **Old text**:
```
1. **`auto_now_add=True` on BaseModel**: Both `authentication.BaseModel` and `risk_screening.BaseModel` use `auto_now_add=True` for `created_at`. Factory_boy handles this correctly (unlike `loaddata`), but if you try to set `created_at` explicitly, it will be ignored. Use `Model.objects.filter(pk=obj.pk).update(created_at=...)` to override.
```
- **New text**:
```
1. **`auto_now_add=True` on BaseModel and Notes.date**: Both `authentication.BaseModel` and `risk_screening.BaseModel` use `auto_now_add=True` for `created_at`. Additionally, `Notes.date` at `apps/video_conferencing/models.py:35` is a SEPARATE `auto_now_add=True` DateTimeField (not inherited from BaseModel). Factory_boy handles these correctly (unlike `loaddata`), but setting them explicitly will be ignored. Use `Model.objects.filter(pk=obj.pk).update(created_at=..., date=...)` to override. Date-ordered assertions on Notes should use `.order_by('date')` and accept auto-assigned values.
```
- **Verification**: `apps/video_conferencing/models.py:35` confirms `date = models.DateTimeField(auto_now_add=True)`.

---

### Fix 8: test-data-factory -- PaymentMethodFactory references broken factory (HIGH)

- **Audit Finding**: 4.3
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: `PaymentMethod` in `apps/stripe_integration/models.py:8` is `class PaymentMethod(models.TextChoices)` -- an enum, not a model. The `PaymentMethodFactory` at `apps/stripe_integration/tests/conftest.py:28-37` targets this TextChoices with fields (`stripe_user`, `stripe_payment_method_id`) that do not exist on the enum. This factory will fail at runtime.
- **Old text**:
```
| `PaymentMethodFactory` | `apps.stripe_integration.tests.conftest` | `PaymentMethod` (TextChoices -- note: this is actually a factory for the PaymentMethod DB record, not the enum) |
```
- **New text**:
```
| `PaymentMethodFactory` | `apps.stripe_integration.tests.conftest` | **WARNING: BROKEN** -- targets `PaymentMethod(TextChoices)` enum, not a DB model. References fields (`stripe_user`, `stripe_payment_method_id`) that do not exist on TextChoices. Will raise `TypeError` at runtime. Do not use. |
```
- **Verification**: `apps/stripe_integration/models.py:8-10` confirms `class PaymentMethod(models.TextChoices): STRIPE = "stripe", "Stripe"  PAYPAL = "paypal", "PayPal"`. The conftest factory at line 28-37 sets `model = PaymentMethod` and declares fields that are not on the enum.

---

### Fix 9: phi-pii-leak-scan -- Tier 2 missing sensitive fields (MEDIUM)

- **Audit Finding**: 2.1
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\phi-pii-leak-scan\SKILL.md`
- **Why**: Multiple sensitive fields from the actual models are not listed in the Tier 2 table. These include browser fingerprinting IDs, affiliate tracking fields, OAuth identity fields, credential identifiers, and payment linkage fields.
- **Old text**:
```
### Tier 2 -- Sensitive PII
| Model | Field | Location |
|---|---|---|
| `authentication.User` | `email`, `first_name`, `last_name`, `phone_number`, `date_of_birth`, `street_address`, `city`, `state`, `zip`, `latitude`, `longitude` | `Lumy-Backend/apps/authentication/models.py` |
| `authentication.User` | `google_token`, `microsoft_token`, `google_refresh_token`, `microsoft_refresh_token` | `Lumy-Backend/apps/authentication/models.py` |
| `care_provider.CareProvider` | `npi_number`, `insurance_policy_number`, `liability_insurance_carrier`, `stripe_customer_id` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.ProfessionalLicense` | `license_number`, `credential_abbreviation` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.InPersonLocation` | `address_line_1`, `latitude`, `longitude` | `Lumy-Backend/apps/care_provider/models.py` |
| `calendar_functionality.Appointment` | `payment_intent_id`, `payment_method_id` | `Lumy-Backend/apps/calendar_functionality/models.py` |
| `stripe_integration.StripeUser` | `stripe_customer_id`, `customer_email`, `paypal_user_id` | `Lumy-Backend/apps/stripe_integration/models.py` |
```
- **New text**:
```
### Tier 2 -- Sensitive PII
| Model | Field | Location |
|---|---|---|
| `authentication.User` | `email`, `first_name`, `last_name`, `phone_number`, `date_of_birth`, `street_address`, `city`, `state`, `zip`, `latitude`, `longitude` | `Lumy-Backend/apps/authentication/models.py` |
| `authentication.User` | `google_token`, `microsoft_token`, `google_refresh_token`, `microsoft_refresh_token` | `Lumy-Backend/apps/authentication/models.py` |
| `authentication.User` | `google_email`, `google_name`, `microsoft_email`, `microsoft_name` (OAuth identity -- plaintext) | `Lumy-Backend/apps/authentication/models.py:138-145` |
| `authentication.User` | `google_expiration`, `microsoft_expiration` (OAuth token expiry -- plaintext) | `Lumy-Backend/apps/authentication/models.py:140,143` |
| `authentication.User` | `visitor_id` (browser fingerprint), `affiliate_id`, `affiliate_link` (tracking/linkage) | `Lumy-Backend/apps/authentication/models.py:135,152-153` |
| `authentication.User` | `relationship_file_document` (custody/guardianship document reference) | `Lumy-Backend/apps/authentication/models.py:150` |
| `authentication.User` | `profile_handle` (SlugField derived from first_name, last_name, email, DOB -- PII leakage vector in URLs) | `Lumy-Backend/apps/authentication/models.py:160-166` |
| `care_provider.CareProvider` | `npi_number`, `insurance_policy_number`, `liability_insurance_carrier`, `stripe_customer_id` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.ProfessionalCertificate` | `certificate_number` (credential identifier) | `Lumy-Backend/apps/care_provider/models.py:374` |
| `care_provider.ProfessionalLicense` | `license_number`, `credential_abbreviation` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.PreLicensed` | `supervisor_license_number` (third-party PII) | `Lumy-Backend/apps/care_provider/models.py:402` |
| `care_provider.InPersonLocation` | `address_line_1`, `latitude`, `longitude` | `Lumy-Backend/apps/care_provider/models.py` |
| `calendar_functionality.Appointment` | `payment_intent_id`, `payment_method_id` | `Lumy-Backend/apps/calendar_functionality/models.py` |
| `calendar_functionality.Appointment` | `paypal_order_id`, `paypal_auth_id` (payment linkage) | `Lumy-Backend/apps/calendar_functionality/models.py:106-107` |
| `stripe_integration.StripeUser` | `stripe_customer_id`, `customer_email`, `paypal_user_id` | `Lumy-Backend/apps/stripe_integration/models.py` |
```
- **Verification**: All fields verified in source: `authentication/models.py:135` (`affiliate_id`), `:136-145` (OAuth fields), `:150` (`relationship_file_document`), `:152` (`visitor_id`), `:153` (`affiliate_link`), `:160-166` (`profile_handle`). `care_provider/models.py:374` (`certificate_number`), `:402` (`supervisor_license_number`). `calendar_functionality/models.py:106-107` (`paypal_order_id`, `paypal_auth_id`).

---

### Fix 10: phi-pii-leak-scan -- Tier 3 missing identity fields (MEDIUM)

- **Audit Finding**: 2.2
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\phi-pii-leak-scan\SKILL.md`
- **Why**: `CareProvider.my_identity_gender` (FK -> Genders) and `CareProvider.my_identity_pronouns` (FK -> Pronouns) are demographic/identity fields not in the Tier 3 table.
- **Old text**:
```
### Tier 3 -- Demographic/Identity
| Model | Field | Location |
|---|---|---|
| `care_provider.CareProvider` | `my_identity_sexuality`, `my_identity_ethnicity_and_race`, `my_identity_faith_and_background_orientation` | `Lumy-Backend/apps/care_provider/models.py` |
| `authentication.User` | `gender`, `vulnerability1`, `vulnerability2` | `Lumy-Backend/apps/authentication/models.py` |
```
- **New text**:
```
### Tier 3 -- Demographic/Identity
| Model | Field | Location |
|---|---|---|
| `care_provider.CareProvider` | `my_identity_sexuality`, `my_identity_ethnicity_and_race`, `my_identity_faith_and_background_orientation` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.CareProvider` | `my_identity_gender` (FK -> Genders), `my_identity_pronouns` (FK -> Pronouns) | `Lumy-Backend/apps/care_provider/models.py:966-978` |
| `authentication.User` | `gender`, `vulnerability1`, `vulnerability2` | `Lumy-Backend/apps/authentication/models.py` |
```
- **Verification**: `apps/care_provider/models.py:966-978` confirms `my_identity_gender = ForeignKey(Genders, ...)` and `my_identity_pronouns = ForeignKey(Pronouns, ...)`.

---

### Fix 11: test-data-factory -- AcademicDegreeFactory missing care_provider FK (MEDIUM)

- **Audit Finding**: 1.5
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: `AcademicDegree` has `care_provider = models.ForeignKey("CareProvider", on_delete=CASCADE, null=True, blank=True, ...)` at `models.py:412-418`. While nullable, the factory should set it for completeness so test data is properly linked.
- **Old text**:
```
class AcademicDegreeFactory(DjangoModelFactory):
    class Meta:
        model = AcademicDegree
    degree_type = "Master of Science"
    degree_name = "Clinical Psychology"
    degree_granting_institution = "Test University"
    academic_degree_year_granted = 2015
```
- **New text**:
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
- **Verification**: `apps/care_provider/models.py:412-418` confirms the FK field.

---

### Fix 12: test-data-factory -- ProfessionalLicenseFactory orphaned records (MEDIUM)

- **Audit Finding**: 1.4
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: `ProfessionalLicense` has NO FK to CareProvider (confirmed at `models.py:386-397`). The linkage is via `CareProviderCredential.professional_license` M2M at line 453. A standalone `ProfessionalLicenseFactory` creates orphaned records not linked to any provider. Add a gotcha note rather than changing the factory (since M2M linkage requires a separate step).
- **Old text (at the end of the `ProfessionalLicenseFactory` class, before `AcademicDegreeFactory`)**:
```
class ProfessionalLicenseFactory(DjangoModelFactory):
    class Meta:
        model = ProfessionalLicense
    license_name = "Licensed Marriage and Family Therapist"
    credential_abbreviation = "LMFT"
    issuing_organization = "State Board of Behavioral Sciences"
    license_number = factory.Faker("license_number", state="CA")
    professional_license_year_granted = 2018
    professional_license_valid_until = 2026
    state = "CA"
    country = "US"


class AcademicDegreeFactory(DjangoModelFactory):
```
- **New text**:
```
class ProfessionalLicenseFactory(DjangoModelFactory):
    """Note: ProfessionalLicense has NO FK to CareProvider. Linkage is via
    CareProviderCredential.professional_license (M2M). After creating a license,
    you must create a CareProviderCredential and call
    credential.professional_license.add(license_instance) to link it."""
    class Meta:
        model = ProfessionalLicense
    license_name = "Licensed Marriage and Family Therapist"
    credential_abbreviation = "LMFT"
    issuing_organization = "State Board of Behavioral Sciences"
    license_number = factory.Faker("license_number", state="CA")
    professional_license_year_granted = 2018
    professional_license_valid_until = 2026
    state = "CA"
    country = "US"


class AcademicDegreeFactory(DjangoModelFactory):
```
- **Verification**: `apps/care_provider/models.py:386-397` has no FK to CareProvider. `CareProviderCredential.professional_license` at line 453-455 is `ManyToManyField(ProfessionalLicense, ...)`.

---

### Fix 13: test-data-factory -- NotesFactory uses LazyAttribute instead of LazyFunction (MEDIUM)

- **Audit Finding**: 11.1
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: `NotesFactory.room_name` uses `LazyAttribute` (receives `obj` parameter) but doesn't use `obj`. `VideoCallRoomFactory` just above uses `LazyFunction`. They should be consistent.
- **Old text**:
```
    room_name = factory.LazyAttribute(lambda obj: str(factory.Faker._get_faker().uuid4()))
```
- **New text**:
```
    room_name = factory.LazyFunction(lambda: str(factory.Faker._get_faker().uuid4()))
```
- **Verification**: Style consistency with `VideoCallRoomFactory.room_name` which uses `factory.LazyFunction`.

---

### Fix 14: test-data-factory -- Existing Factories table CareProviderFactory should note both locations (MEDIUM)

- **Audit Finding**: 1.2 (supplementary)
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: The table lists only the calendar conftest as the CareProviderFactory location. Since the fix (Fix 4) changes the import to the care_provider conftest, the table should match.
- **Old text**:
```
| `CareProviderFactory` | `apps.calendar_functionality.tests.conftest` | `CareProvider` |
```
- **New text**:
```
| `CareProviderFactory` | `apps.care_provider.tests.conftest` (preferred -- includes step_counter, is_active, CareProviderScore post_generation) | `CareProvider` |
```
- **Verification**: Both locations confirmed via grep. The care_provider version at line 72-91 is the richer factory.

---

### Fix 15: All 3 grep-based skills -- Missing working directory prerequisite (MEDIUM)

- **Audit Finding**: 3.2
- **Files**: All three files:
  - `C:\Projects\ReallyGlobal\.claude\skills\phi-pii-leak-scan\SKILL.md`
  - `C:\Projects\ReallyGlobal\.claude\skills\hipaa-compliance-audit\SKILL.md`
  - `C:\Projects\ReallyGlobal\.claude\skills\security-code-review\SKILL.md`
- **Why**: All skills use relative paths (`Lumy-Backend/`, `RG-Frontend/`) in grep commands. If executed from a subdirectory, the commands will fail.
- **phi-pii-leak-scan -- Old text**:
```
## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- No running services required (static analysis only)
```
- **phi-pii-leak-scan -- New text**:
```
## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- No running services required (static analysis only)
```
- **hipaa-compliance-audit -- Old text**:
```
## Prerequisites
- Access to `Lumy-Backend/` source tree
- Knowledge of which models contain PHI (see Tier 1 in phi-pii-leak-scan skill)
```
- **hipaa-compliance-audit -- New text**:
```
## Prerequisites
- Access to `Lumy-Backend/` source tree
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- Knowledge of which models contain PHI (see Tier 1 in phi-pii-leak-scan skill)
```
- **security-code-review -- Old text**:
```
## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- For dependency audit: `pip` and `yarn` available (or Docker running)
```
- **security-code-review -- New text**:
```
## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- For dependency audit: `pip` and `yarn` available (or Docker running)
```

---

### Fix 16: phi-pii-leak-scan -- profile_handle not in formal tier table (MEDIUM)

- **Audit Finding**: 2.3
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\phi-pii-leak-scan\SKILL.md`
- **Why**: `User.profile_handle` is derived from PII (`first_name`, `last_name`, `email`, DOB via `make_profile_handle()`), appears in URLs, and is indexable. It is mentioned in "Known Patterns" gotcha #1 but not classified in any tier table.
- **Action**: Already addressed in Fix 9 above -- `profile_handle` is added to the Tier 2 table with a note about PII derivation. No additional edit needed.

---

### Fix 17: phi-pii-leak-scan -- Latitude/longitude regex style (LOW)

- **Audit Finding**: 3.1
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\phi-pii-leak-scan\SKILL.md`
- **Why**: Minor style issue. The pattern `[-]?` uses a character class unnecessarily when `-?` would suffice. Functional behavior is correct due to the piped grep filter.
- **Action**: No fix needed. Noted for completeness. The regex is functionally correct.

---

### Fix 18: mock-external-services -- Line reference cosmetic corrections (LOW)

- **Audit Finding**: 10.3, 10.4
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md`
- **Why**: Line references for `mock_cache` (line 36 vs actual 35-36) and `mock_external_apis` (line 53 vs actual 53-54) are off by 1. Close enough to be acceptable.
- **Action**: No fix needed. Line references are approximate and acceptable.

---

### Fix 19: test-data-factory -- StripeUserFactory import path (LOW)

- **Audit Finding**: 1.3
- **File**: `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md`
- **Why**: Both import paths work and the factories are identical. No change needed.
- **Action**: No fix needed.

---

## Prevention Notes for Remaining 9 Skills

The following 9 skills have empty directories (no SKILL.md yet). When the IMPLEMENTER writes these skills, they MUST avoid these verified pitfalls:

### 1. `mock-settings-manager`
- **Pitfall**: `settings.py` has `SECRET_KEY` hardcoded (not from env var). Do NOT assume `env("SECRET_KEY")` pattern exists.
- **Pitfall**: `DEBUG = True` and `ALLOWED_HOSTS = ["*"]` are hardcoded, not loaded from environment variables with fallback. Mock settings must account for this.
- **Pitfall**: `MOCK_SERVICES` environment variable pattern (from `mock-external-services` skill Step 2) must be validated -- this is proposed code, not existing production code. Do not reference it as "existing".

### 2. `patient-data-integrity-check`
- **Pitfall**: NPI numbers are stored as `CharField(max_length=225)`, NOT IntegerField. Luhn validation must handle string input.
- **Pitfall**: `CareProvider.npi_number` is `null=True, blank=True`. Many providers will have NULL NPI numbers -- the integrity check must not flag these as invalid.
- **Pitfall**: `ProfessionalLicense` has no FK to CareProvider. The linkage path is `CareProvider -> CareProviderCredential (FK) -> professional_license (M2M) -> ProfessionalLicense`. Do NOT assume a direct FK relationship.
- **Pitfall**: `AcademicDegree.academic_degree_year_granted` and `professional_license_year_granted` are `IntegerField`, not `DateField`. Validation should check for reasonable year ranges (e.g., 1950-2030), not date parsing.

### 3. `api-response-sanitizer`
- **Pitfall**: `PaymentMethod` in `stripe_integration/models.py` is a `TextChoices` enum, NOT a model. Do not reference "PaymentMethod records" or "PaymentMethod serializer".
- **Pitfall**: `Notes.notes` is a `TextField` with NO model-level access control. Any serializer-based sanitization must be applied at the view/serializer layer, not the model.
- **Pitfall**: OAuth fields (`google_email`, `google_name`, `microsoft_email`, `microsoft_name`, `google_expiration`, `microsoft_expiration`) are plaintext TextFields. They must be excluded from public API responses.
- **Pitfall**: `User.profile_handle` is auto-generated from PII and appears in URLs. If sanitizing responses, this field requires special treatment since it's used as a public-facing identifier.

### 4. `frontend-test-scaffold`
- **Pitfall**: Next.js 13 with pages router (NOT app router). Test setup must target `src/pages/`, not `app/`.
- **Pitfall**: The frontend has both Redux (RTK) and some Zustand state. Test scaffolds need to provide both store types as providers.
- **Pitfall**: Apollo Client is configured at `src/store/apollo_client.ts` AND `src/store/apolloClient.ts` (two files). Mock both.
- **Pitfall**: Axios interceptor at `src/store/axiosInstance.ts` auto-refreshes tokens via GraphQL on 401. Test mocks must handle this flow.

### 5. `credential-verification-workflow`
- **Pitfall**: `ProfessionalLicense.professional_license_year_granted` and `professional_license_valid_until` are `IntegerField` (year only), NOT `DateField`. Do not use date parsing or `date.year` comparisons -- compare integer years directly.
- **Pitfall**: `ProfessionalCertificate.certificate_number` at line 374 is a CharField, as is `ProfessionalLicense.license_number` at line 390. Both are nullable.
- **Pitfall**: `PreLicensed.anticipated_completion_date` at line 405 IS a `DateField` (unlike the year fields). Credential verification must handle both year integers and date fields.
- **Pitfall**: The linkage path to credentials is: `CareProvider.credential` (FK to `CareProviderCredential`) -> `.professional_license` (M2M), `.professional_certificate` (M2M), `.academic_degree` (M2M), `.pre_licensed` (M2M). Verify the actual FK field name on CareProvider before writing queries.

### 6. `django-model-security-hardening`
- **Pitfall**: `InPersonLocation.country` is FK to `CountryCode`, NOT a CharField. Do not suggest adding validators for country string format on this field.
- **Pitfall**: `User.id` is `UUIDField(primary_key=True)`. Do not suggest adding UUID primary keys -- they already exist on User but NOT on other models (BaseModel uses default auto-increment).
- **Pitfall**: `BaseModel.is_active` is a `BooleanField(default=True)` on the abstract base. Soft-delete patterns should use this existing field, not add a new one.
- **Pitfall**: `Notes` model has NO `client` FK -- only `care_provider` FK. Model-level security hardening cannot filter by client; this must be done at the view level.

### 7. `consent-tracking-audit`
- **Pitfall**: `Client.tandc_consent` exists at `apps/client/models.py` (verified). But `User.is_agree` at `apps/authentication/models.py:121` is a SEPARATE consent field at the User level. Both must be checked.
- **Pitfall**: `User.age_vulnerability_check` at line 122 is a BooleanField related to age consent. Include this in consent tracking.
- **Pitfall**: There is no dedicated consent audit trail model. The only timestamp is `created_at` from BaseModel. If the skill proposes audit logging, it must note this gap.

### 8. `backend-endpoint-security-test`
- **Pitfall**: The GraphQL endpoint at `/api/v1/graphql/` may be wrapped with `csrf_exempt`. Check `lumy_global/urls.py` for this decorator.
- **Pitfall**: Permission class names vary across apps. Do not assume standard names like `IsOwner` exist -- grep for actual permission class definitions in each app.
- **Pitfall**: `video_conferencing/api.py` is NOT a DRF view -- it's a plain Python class. Security checks on this file should look at `views.py`, not `api.py`.
- **Pitfall**: `_STRIPE_CONFIGURED` and `_PAYPAL_CONFIGURED` are module-level boolean guards in `stripe_integration/views.py`. Endpoint security tests must handle these guards.

### 9. `deployment-readiness-check`
- **Pitfall**: `SECRET_KEY` is hardcoded in `settings.py` with a literal string, NOT loaded from an env var. The readiness check must flag this explicitly.
- **Pitfall**: `CORS_ORIGIN_ALLOW_ALL = True` is the setting name used (not `CORS_ALLOW_ALL_ORIGINS`). Check for both variants.
- **Pitfall**: `CSRF_TRUSTED_ORIGINS` is set to `["https://devapi.really.global"]` only. No wildcard, but only one origin is trusted.
- **Pitfall**: No `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, or `CSRF_COOKIE_SECURE` settings exist. The readiness check should flag their absence, not search for them being set to `False`.
- **Pitfall**: `INSTALLED_APPS` includes `graphene_django`. Check for `GRAPHENE` settings to verify introspection is disabled for production.

---

## Execution Summary

| Priority | Count | Description |
|---|---|---|
| CRITICAL | 3 | Fixes 1, 2, 3 -- runtime failures (FK string, Twilio path, payment enum) |
| HIGH | 4 | Fixes 4, 5, 7, 8 -- incorrect data/documentation |
| MEDIUM | 6 | Fixes 9, 10, 11, 12, 13, 14, 15 -- incomplete coverage, missing fields |
| LOW | 3 | Fixes 17, 18, 19 -- no action needed (cosmetic) |
| Prevention | 9 | Notes for unwritten skills |

**Total edits required**: 13 distinct edit operations across 5 files (3 fixes need no action).

**Files touched**:
1. `C:\Projects\ReallyGlobal\.claude\skills\test-data-factory\SKILL.md` -- 9 edits (Fixes 1, 3, 4, 5, 7, 8, 11, 12, 13, 14)
2. `C:\Projects\ReallyGlobal\.claude\skills\mock-external-services\SKILL.md` -- 4 edits (Fix 2, 4 locations)
3. `C:\Projects\ReallyGlobal\.claude\skills\phi-pii-leak-scan\SKILL.md` -- 3 edits (Fixes 9, 10, 15)
4. `C:\Projects\ReallyGlobal\.claude\skills\hipaa-compliance-audit\SKILL.md` -- 1 edit (Fix 15)
5. `C:\Projects\ReallyGlobal\.claude\skills\security-code-review\SKILL.md` -- 1 edit (Fix 15)
