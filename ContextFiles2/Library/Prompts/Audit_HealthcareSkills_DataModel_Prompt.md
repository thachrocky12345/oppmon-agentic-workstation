# Data Model and Technical Audit Prompt: Healthcare Skill Files

> **Auditor role**: You are a principal engineer conducting a ground-truth accuracy audit of 14 healthcare Claude Code skills generated for the ReallyGlobal / Lumy codebase. Your job is to verify that every concrete claim in the skill files matches the actual source code. Do not assume anything is correct. Grep and read every file cited before accepting a claim as valid.
>
> **Skills location**: `C:\Projects\ReallyGlobal\.claude\skills\` — each skill in its own subdirectory as `SKILL.md`
>
> **Source of truth**: `C:\Projects\ReallyGlobal\Lumy-Backend\` and `C:\Projects\ReallyGlobal\RG-Frontend\`

---

## Ground-Truth Reference (Do Not Re-Derive — Verified Against Source)

Use this section as your reference baseline. Any skill claim that contradicts the following tables is a confirmed finding.

### User Model (`apps/authentication/models.py`)

**Actual fields on `User(AbstractUser, BaseModel)`**:

| Field | Type | Notes |
|---|---|---|
| `id` | UUIDField (PK) | `uuid.uuid4`, `editable=False` |
| `email` | EmailField(255) | `unique=True`, `USERNAME_FIELD` |
| `user_type` | CharField(15) | choices: `SUPERADMIN`, `CAREPROVIDER`, `CLIENT` |
| `profile_pic` | TextField | blank default |
| `country_code` | FK → `care_provider.CountryCode` | `CASCADE` |
| `phone_number` | CharField(50) | nullable |
| `middle_name` | CharField(225) | nullable |
| `first_name` | CharField(225) | nullable |
| `last_name` | CharField(225) | nullable |
| `gender` | CharField(100) | choices from `authentication.constants.GENDER` |
| `primary_language` | FK → `Languages` | nullable |
| `secondary_language` | M2M → `Languages` | |
| `date_of_birth` | DateField | nullable |
| `street_address` | TextField | nullable |
| `flat_building_no` | CharField(200) | nullable |
| `city` | CharField(225) | nullable |
| `state` | CharField(50) | nullable |
| `country` | CharField(50) | nullable (plain string, not FK) |
| `zip` | CharField(50) | nullable |
| `age` | CharField(225) | nullable (string, not integer) |
| `latitude` | FloatField | nullable |
| `longitude` | FloatField | nullable |
| `is_verified` | BooleanField | default False |
| `is_phone_verified` | BooleanField | default False |
| `is_agree` | BooleanField | default False |
| `age_vulnerability_check` | BooleanField | nullable |
| `keep_me_signed_in` | BooleanField | default False |
| `is_profile` | BooleanField | default False |
| `is_primary_account` | BooleanField | default True |
| `parent_user` | FK → self | `CASCADE`, related_name `profile` |
| `profile_type` | CharField(50) | nullable |
| `relationship` | CharField(50) | nullable |
| `affiliate_id` | CharField(225) | nullable |
| `google_token` | TextField | nullable — OAuth token, plaintext |
| `google_refresh_token` | TextField | nullable — OAuth refresh, plaintext |
| `google_email` | TextField | nullable |
| `google_name` | TextField | nullable |
| `google_expiration` | TextField | nullable |
| `microsoft_token` | TextField | nullable — OAuth token, plaintext |
| `microsoft_refresh_token` | TextField | nullable — OAuth refresh, plaintext |
| `microsoft_expiration` | TextField | nullable |
| `microsoft_email` | TextField | nullable |
| `microsoft_name` | TextField | nullable |
| `vulnerability1` | CharField(3) | nullable, default "" |
| `vulnerability2` | CharField(3) | nullable, default "" |
| `relationship_file_document` | CharField(255) | nullable |
| `type_document_authority` | CharField(100) | nullable |
| `visitor_id` | CharField(100) | nullable |
| `affiliate_link` | TextField | nullable |
| `affiliate_link_modified_at` | DateTimeField | nullable |
| `is_email_verified` | BooleanField | default False |
| `profile_handle` | SlugField(255) | unique, nullable, auto-generated from name+email+DOB |
| `is_client_location_verified` | BooleanField | default False |
| `username` | None | explicitly removed (`username = None`) |

**Fields that DO NOT exist on User** (flag any skill that references these):
- `date_joined` — exists via AbstractUser, but not explicitly declared
- `stripe_customer_id` — this is on `CareProvider`, not `User`
- `payment_method_id` — this is on `Appointment`, not `User`
- `is_active` — inherited from `BaseModel` (not declared on User directly; comes through AbstractUser AND BaseModel — both define it)
- Any field named `address` (the field is `street_address`)

---

### video_conferencing Models (`apps/video_conferencing/models.py`)

**`VideoCallRoom(BaseModel)`**:
- `room_name`: CharField(100), nullable
- `sid`: CharField(100), nullable
- `identity`: CharField(100), nullable

**`VideoCallParticipants(BaseModel)`**:
- `user_id`: FK → `authentication.User`, `CASCADE`, nullable
- `participant_sid`: CharField(100), nullable

**`Notes(BaseModel)`**:
- `care_provider`: FK → `care_provider.CareProvider`, `CASCADE`, nullable
- `notes`: TextField (NOT nullable — no `null=True`)
- `room_name`: CharField(100) (NOT nullable)
- `date`: DateTimeField(`auto_now_add=True`)

**Critical fact**: `Notes` links to `CareProvider`, NOT to `Client` or `User` directly. The link to an appointment is only via `room_name` string match — there is no direct FK from `Notes` to `Appointment`. Any skill claiming `Notes.appointment` or `Notes.client` as direct FK fields is wrong.

**Critical fact**: `Notes.date` uses `auto_now_add=True` — this field will break under `loaddata` (raw=True bypasses auto_now_add, inserts NULL into a non-nullable column).

---

### risk_screening Models (`apps/risk_screening/models.py`)

**`UserResponse(BaseModel)`**:
- `user`: FK → `authentication.User`, `CASCADE`
- `final_score`: IntegerField, nullable
- `final_keywords`: JSONField, nullable
- `is_severe`: BooleanField, default False
- `is_screening_ignored`: BooleanField, default False
- `response_id`: UUIDField (PK), `uuid.uuid4`, `editable=False`, `unique=True`

**`ResponseDetail(models.Model)` — NOT a BaseModel subclass**:
- `user_response`: FK → `UserResponse`, `CASCADE`
- `created_at`: DateTimeField(`auto_now_add=True`, db_index=True)
- `flow_question_sequence`: FK → `FlowQuestionSequence`, `CASCADE`
- `score`: IntegerField, nullable
- `keywords`: JSONField, nullable
- `is_severe`: BooleanField, default False

**Note**: `ResponseDetail` does NOT inherit `BaseModel` — it inherits `models.Model` directly. It has no `modified_at` and no `is_active` field. Skill claims that reference `ResponseDetail.is_active` or `ResponseDetail.modified_at` are wrong.

**Supporting models**:
- `QuestionType(BaseModel)`: `is_active`, `name`(CharField(100), unique)
- `OptionType(BaseModel)`: `is_active`, `name`(CharField(100), unique)
- `Question(BaseModel)`: `question_id`(IntegerField, PK), `question_text`(TextField), `question_type`(FK → QuestionType), `question_type_text`(TextField)
- `QuestionOption(BaseModel)`: `question`(FK), `option_id`(IntegerField), `option_text`(TextField), `option_type`(FK), `score`(IntegerField, nullable), `is_severity`(BooleanField), `keywords`(JSONField, nullable)
- `Flow(BaseModel)`: `name`(TextField), `description`(TextField), `starting_question`(FK → Question, SET_NULL)
- `FlowQuestionSequence(models.Model)`: `flow`(FK → Flow, SET_NULL), `question`(FK → Question), `option_id`(IntegerField), `next_question`(FK → Question, SET_NULL), `is_auto_continue`(BooleanField)

---

### calendar_functionality Models (`apps/calendar_functionality/models.py`)

**`Appointment(BaseModel)`**:
- `care_provider`: FK → `CareProvider`, `CASCADE`, nullable
- `client`: FK → `Client`, `CASCADE`, related_name `client_appointments`
- `modality`: FK → `ModalityType`, `CASCADE`, nullable
- `format`: FK → `FormatType`, `CASCADE`, nullable
- `join_status`: BooleanField, default False, nullable
- `room_name`: CharField(100), nullable (auto-generated via `save()` if blank)
- `is_status`: CharField(100), choices `APPOINTMENT_STATUS`, default `SCHEDULED`
- `start_date_time`: DateTimeField, nullable
- `end_date_time`: DateTimeField, nullable
- `duration`: DurationField, nullable
- `reason`: TextField, default ""
- `modified_by`: CharField(100), nullable
- `timezone`: CharField(100), nullable
- `payment_intent_id`: CharField(255), nullable
- `payment_method_id`: CharField(255), nullable
- `invoice_id`: CharField(255), nullable
- `amount_in_cents`: IntegerField, nullable
- `currency`: CharField(3), nullable
- `payment_status`: IntegerField, choices `PaymentStatus`, default `PaymentStatus.PENDING`
- `google_event_id`: CharField(255), nullable
- `microsoft_event_id`: CharField(255), nullable
- `paypal_order_id`: CharField(64), nullable
- `paypal_auth_id`: CharField(64), nullable
- `paypal_status`: CharField(32), choices (`authorized`, `captured`, `failed`), default `authorized`
- `six_hr_reminder_sent`: BooleanField, default False
- `six_hr_reminder_sent_at`: DateTimeField, nullable

**Payment fields on Appointment**: `payment_intent_id`, `payment_method_id`, `invoice_id`, `amount_in_cents`, `currency`, `payment_status`. There is NO `stripe_customer_id` on `Appointment` — that lives on `CareProvider`.

**`Session(BaseModel)`**:
- `client`: FK → `Client`, `CASCADE`
- `care_provider`: FK → `CareProvider`, `CASCADE`
- `session_start_time`: TimeField
- `session_time_time`: TimeField (note: typo in field name — this is the actual field name)
- `session_date`: DateField
- `initial_session`: CharField(100)
- `therapy_type`: CharField(100)
- `session_type`: FK → `SessionType`, `CASCADE`
- `modality`: CharField(100), choices `MODALITY`
- `issues`: CharField(500) — NOT TextField; max_length=500
- `summary_of_issue`: TextField
- `session_status`: CharField(100), choices `SESSION_STATUS`

**`Slot(BaseModel)`**:
- `care_provider`: FK → `CareProvider`, `CASCADE`, related_name `care_provider_slot`
- `start_date_time`: DateTimeField
- `end_date_time`: DateTimeField
- `duration`: DurationField
- `timezone`: CharField(100), nullable
- `appointment_id`: IntegerField, nullable (plain integer reference, NOT a FK)
- `bulk_upload_id`: CharField(255), nullable

**`Rate(BaseModel)`**: `care_provider`(FK), `session_type`(FK → SessionType), `rate`(IntegerField)

**`SessionType(BaseModel)`**: `session_name`(CharField(225)), `sub_session_type`(CharField(225), choices SESSION_TYPE)

---

### CareProvider Model (`apps/care_provider/models.py` lines 885–1063)

**`CareProvider(BaseModel)`** — key fields for credential and PHI audit:
- `user`: OneToOneField → `User`, `CASCADE`, related_name `care_provider`
- `npi_number`: CharField(50), nullable
- `npi_year_granted`: IntegerField, nullable
- `npi_valid_until`: IntegerField, nullable (year as integer, NOT a DateField)
- `liability_insurance_carrier`: CharField(255), nullable
- `insurance_policy_number`: CharField(100), nullable
- `expiration_date`: DateField, nullable
- `is_licensed`: BooleanField, default False, nullable
- `agree_Credential_Status`: BooleanField, default False, nullable (note: mixed case — actual DB column name includes capital C)
- `stripe_customer_id`: CharField(225), nullable
- `my_identity_sexuality`: FK → `Sexuality`, nullable
- `my_identity_ethnicity_and_race`: M2M → `Ethinicity` (note: intentional typo in model class name)
- `my_identity_faith_and_background_orientation`: M2M → `Faith`
- `my_identity_gender`: FK → `Genders`, nullable
- `my_identity_pronouns`: FK → `Pronouns`, nullable
- `in_person_location`: FK → `InPersonLocation`, nullable
- `step_counter`: CharField(20), nullable

**`ProfessionalLicense(BaseModel)`**:
- `license_name`: CharField(500)
- `credential_abbreviation`: CharField(500), nullable
- `issuing_organization`: CharField(500), nullable
- `license_number`: CharField(500), nullable
- `professional_license_year_granted`: IntegerField, nullable
- `professional_license_valid_until`: IntegerField, nullable (year integer, NOT DateField)
- `state`: CharField(50), nullable
- `country`: CharField(50), nullable
- No FK to `CareProvider` on this model directly — it is linked via `CareProviderCredential.professional_license` (M2M)

**`ProfessionalCertificate(BaseModel)`**:
- `issuing_organization`: FK → `IssuingOrganization`, nullable
- `certificate_level`: FK → `CertificateLevel`, nullable
- `certificate_number`: CharField(500), nullable
- `certificate_name`: CharField(500), nullable
- `professional_certificate_year_granted`: IntegerField, nullable
- `professional_certificate_valid_until`: IntegerField, nullable
- `certificate_level_text`: CharField(500), nullable
- `issuing_organization_text`: CharField(500), nullable
- `other_certification_level`: CharField(500), nullable

**`PreLicensed(BaseModel)`**:
- `supervisor_name`: CharField(500), nullable
- `supervisor_license_number`: CharField(500), nullable
- `role`: CharField(500), nullable
- `year_granted`: IntegerField, nullable
- `anticipated_completion_date`: DateField, nullable
- `country`: CharField(50), nullable
- `state`: CharField(50), nullable
- `credential_abbreviation`: CharField(500), nullable

**`InPersonLocation(BaseModel)`**:
- `full_name_or_practice_name`: CharField(225), nullable
- `address_line_1`: CharField(225), nullable (NOT TextField)
- `address_line_2`: CharField(225), nullable
- `city`: CharField(225), nullable
- `state`: CharField(225), nullable
- `country`: FK → `CountryCode`, nullable (NOT CharField)
- `in_person_region`: CharField(225), nullable
- `zip_code`: CharField(20), nullable
- `latitude`: FloatField, nullable
- `longitude`: FloatField, nullable
- `is_location_verified`: BooleanField, default False, nullable

**`CareProviderCredential(BaseModel)`** — holds M2M credential collections:
- `credential_type`: M2M → `CredentialType`
- `professional_certificate`: M2M → `ProfessionalCertificate`
- `academic_degree`: M2M → `AcademicDegree`
- `professional_license`: M2M → `ProfessionalLicense`
- `professional_membership`: M2M → `ProfessionalMembership`
- `pre_licensed`: M2M → `PreLicensed`

**`CareProvider.credential_type`**: FK → `CareProviderCredential` (confusingly named — this is the FK to the credential collection, not to `CredentialType` directly)

---

### Factory Classes — Canonical Locations

| Factory Class | Defined In | Model |
|---|---|---|
| `LanguagesFactory` | `apps/authentication/tests/conftest.py` | `Languages` |
| `CountryCodeFactory` | `apps/authentication/tests/conftest.py` | `CountryCode` |
| `UserFactory` | `apps/authentication/tests/conftest.py` | `User` |
| `ClientFactory` | `apps/authentication/tests/conftest.py` | `Client` |
| `CareProviderFactory` | `apps/care_provider/tests/conftest.py` | `CareProvider` |
| `CareProviderScoreFactory` | `apps/care_provider/tests/conftest.py` | `CareProviderScore` |
| `EthnicityFactory` | `apps/care_provider/tests/conftest.py` | `Ethinicity` |
| `SexualityFactory` | `apps/care_provider/tests/conftest.py` | `Sexuality` |
| `CommunitiesFactory` | `apps/care_provider/tests/conftest.py` | `Communities` |
| `FaithFactory` | `apps/care_provider/tests/conftest.py` | `Faith` |
| `AgeGroupsFactory` | `apps/care_provider/tests/conftest.py` | `AgeGroups` |
| `GendersFactory` | `apps/care_provider/tests/conftest.py` | `Genders` |
| `ModalityTypeFactory` | `apps/care_provider/tests/conftest.py` | `ModalityType` |
| `FormatTypeFactory` | `apps/care_provider/tests/conftest.py` | `FormatType` |
| `CountryFactory` | `apps/care_provider/tests/conftest.py` | `Country` |
| `ContinentalFactory` | `apps/care_provider/tests/conftest.py` | `Continental` |
| `NavigationCategoryFactory` | `apps/care_provider/tests/conftest.py` | `NavigationCategory` |
| `PronounsFactory` | `apps/care_provider/tests/conftest.py` | `Pronouns` |
| `InPersonLocationFactory` | `apps/care_provider/tests/conftest.py` | `InPersonLocation` |
| `ModalitiesFactory` | `apps/care_provider/tests/conftest.py` | `Modalities` |
| `ModalityFormatFactory` | `apps/care_provider/tests/conftest.py` | `ModalityFormat` |
| `SessionTypeFactory` | `apps/calendar_functionality/tests/conftest.py` | `SessionType` |
| `SlotFactory` | `apps/calendar_functionality/tests/conftest.py` | `Slot` |
| `AppointmentFactory` | `apps/calendar_functionality/tests/conftest.py` | `Appointment` |
| `StripeUserFactory` | `apps/stripe_integration/tests/conftest.py` | `StripeUser` |
| `PaymentMethodFactory` | `apps/stripe_integration/tests/conftest.py` | `PaymentMethod` |
| `UserResponseFactory` | `apps/risk_screening/tests/conftest.py` | `UserResponse` |
| `ResponseDetailFactory` | `apps/risk_screening/tests/conftest.py` | `ResponseDetail` |
| `QuestionTypeFactory` | `apps/risk_screening/tests/conftest.py` | `QuestionType` |
| `QuestionOptionFactory` | `apps/risk_screening/tests/conftest.py` | `QuestionOption` |
| `FlowFactory` | `apps/risk_screening/tests/conftest.py` | `Flow` |
| `FlowQuestionSequenceFactory` | `apps/risk_screening/tests/conftest.py` | `FlowQuestionSequence` |
| `PackageFactory` | `apps/verification/tests/conftest.py` | `Package` |
| `ApplicantCertnOrderFactory` | `apps/verification/tests/conftest.py` | `ApplicantCertnOrder` |

**No `NotesFactory` exists.** Any skill that references a `NotesFactory` must create it from scratch.

---

## Audit Dimensions

Audit each of the 14 skill files against every applicable dimension below. For each finding, record:
- **Skill file**: relative path from `.claude/skills/`
- **Line number** (or section heading) where the error appears
- **Claim in skill**: exact quoted text
- **Ground truth**: what the code actually shows
- **Severity**: BLOCKING (skill will fail to execute), ERROR (factually wrong), WARNING (misleading but won't break execution)

---

### Dimension 1: Model Field Accuracy

**What to check**: Every model field name, field type, nullability, and FK target referenced in any skill.

**How to verify**: For each field claim, grep the relevant `models.py`:
```bash
grep -n "field_name" /c/Projects/ReallyGlobal/Lumy-Backend/apps/<app>/models.py
```

**Specific checks required**:

1. Verify that any skill referencing `Notes.appointment` fails — this FK does not exist. `Notes` links to sessions only via `room_name` string.

2. Verify that `Session.issues` is CharField(500), NOT TextField. Skills that treat it as TextField are wrong.

3. Verify that `Session.session_time_time` is the actual field name (typo is real — verify in source).

4. Verify that `CareProvider.npi_valid_until` is IntegerField (year), NOT DateField. Skills that do `npi_valid_until < today` with a date comparison will fail at runtime.

5. Verify that `ProfessionalLicense.professional_license_valid_until` is IntegerField (year), NOT DateField. Same issue.

6. Verify that `User.age` is CharField(225), NOT IntegerField. Age-based checks comparing integers will fail.

7. Verify that `User.country` is CharField(50), NOT a FK to `Country`. Any skill that does `user.country.name` will fail with AttributeError.

8. Verify that `InPersonLocation.country` is FK → `CountryCode`, NOT CharField. Skills doing string comparison on this field will fail.

9. Verify that `Appointment.Slot` FK is commented out in source. `Appointment` does NOT have a direct FK to `Slot`. `Slot.appointment_id` is a plain IntegerField reference. Skills claiming direct FK traversal `appointment.slot` will fail.

10. Verify that `User.username` is explicitly `None`. Skills that set or reference `User.username` as a field will fail.

11. Check whether any skill claims `CareProvider.my_identity_ethnicity_and_race` is FK — it is M2M → `Ethinicity`. Skills doing `.my_identity_ethnicity_and_race.name` (single value access) will fail.

12. Verify `ResponseDetail` does NOT inherit `BaseModel` — it has no `is_active`, no `modified_at`. Skills that filter `ResponseDetail.objects.filter(is_active=True)` will fail.

13. Verify that `Notes.date` uses `auto_now_add=True`. Any factory or fixture that sets `Notes.date` explicitly will be rejected by Django's `editable=False` constraint.

14. Check `CareProvider.agree_Credential_Status` — the field name has a capital `C`. Skills referencing `agree_credential_status` (all lowercase) will fail to match the Django field (though Django's ORM lookup is case-sensitive on the Python attribute name).

---

### Dimension 2: PHI/PII Tier Classification Accuracy

**What to check**: Does the skill's tier classification of sensitive fields match the ground-truth data model? Are any sensitive fields missed?

**Required checks**:

1. **Verify Tier 1 completeness**: The following fields must appear in any PHI scan skill:
   - `video_conferencing.Notes.notes` (TextField, plaintext)
   - `risk_screening.UserResponse.final_score` (IntegerField)
   - `risk_screening.UserResponse.final_keywords` (JSONField)
   - `risk_screening.UserResponse.is_severe` (BooleanField)
   - `risk_screening.ResponseDetail.score`, `keywords`, `is_severe`
   - `calendar_functionality.Appointment.reason` (TextField)
   - `calendar_functionality.Session.issues` (CharField)
   - `calendar_functionality.Session.summary_of_issue` (TextField)

2. **Verify Tier 2 completeness**: Check for these fields explicitly:
   - `authentication.User.google_token`, `google_refresh_token` (plaintext OAuth)
   - `authentication.User.microsoft_token`, `microsoft_refresh_token` (plaintext OAuth)
   - `authentication.User.google_expiration`, `microsoft_expiration` (plaintext expiry)
   - `care_provider.CareProvider.npi_number`
   - `care_provider.CareProvider.insurance_policy_number`
   - `care_provider.CareProvider.liability_insurance_carrier`
   - `care_provider.ProfessionalLicense.license_number`
   - `care_provider.ProfessionalLicense.credential_abbreviation`
   - `calendar_functionality.Appointment.payment_intent_id`
   - `calendar_functionality.Appointment.payment_method_id`
   - `care_provider.CareProvider.stripe_customer_id`

3. **Check for missed Tier 2 fields**: These are in the actual model but may be absent from skill PHI maps:
   - `authentication.User.visitor_id` (CharField(100)) — fingerprinting ID, privacy risk
   - `authentication.User.affiliate_id`, `affiliate_link` — tracking linkage
   - `authentication.User.relationship_file_document` — custody/guardianship document reference
   - `authentication.User.profile_handle` — PII leakage in URL (name+email+DOB derived slug)
   - `care_provider.InPersonLocation.latitude`, `longitude` — precise geolocation of practice
   - `care_provider.ProfessionalCertificate.certificate_number`
   - `care_provider.PreLicensed.supervisor_license_number`
   - `calendar_functionality.Appointment.paypal_order_id`, `paypal_auth_id` — payment linkage

4. **Verify Tier 3 completeness**: Must include:
   - `authentication.User.gender`, `vulnerability1`, `vulnerability2`
   - `care_provider.CareProvider.my_identity_sexuality` (FK → Sexuality)
   - `care_provider.CareProvider.my_identity_ethnicity_and_race` (M2M → Ethinicity)
   - `care_provider.CareProvider.my_identity_faith_and_background_orientation` (M2M → Faith)
   - `care_provider.CareProvider.my_identity_gender` (FK → Genders)
   - `care_provider.CareProvider.my_identity_pronouns` (FK → Pronouns)

5. **Check for misclassification**: `User.age` (CharField) may be misclassified — it is not a computed value, just a string. `User.date_of_birth` (DateField) is the authoritative age field and is Tier 2.

---

### Dimension 3: Regex Pattern Validity

**What to check**: Every regex pattern in every skill. Test each in Python before accepting.

**Patterns to validate** (run in Python: `import re; re.compile(pattern)` — then test against sample data):

1. **NPI number regex**: Must match exactly 10 digits. Common correct pattern: `r'\b[12]\d{9}\b'`. Check that:
   - The pattern anchors correctly (does not match 11+ digit strings)
   - The `[12]` prefix constraint is present (NPI must start with 1 or 2)
   - The pattern does not use `\d{10}` without anchors (would match NPI inside larger numbers)

2. **SSN regex**: Common correct pattern: `r'\b\d{3}-\d{2}-\d{4}\b'` or `r'\b\d{3}\s?\d{2}\s?\d{4}\b'`. Check:
   - Does the pattern match both hyphenated and non-hyphenated forms?
   - Does it exclude invalid SSNs (000-xx-xxxx, 666-xx-xxxx)?

3. **Phone number regex**: Must handle international formats. Check:
   - Does it handle `+1 (555) 123-4567`, `+44 7911 123456`, `555-123-4567`?
   - Does it avoid matching 10-digit numbers that are not phone numbers?
   - A safe pattern: `r'\+?[\d\s\-\(\)]{10,15}'` — verify this is what is used

4. **Email regex**: Check that the pattern is not too narrow (misses valid emails) or too broad (matches non-emails):
   - Must match: `user@example.com`, `user.name+tag@sub.domain.co.uk`
   - Safe: `r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'`

5. **JWT token regex**: A JWT is three base64url segments separated by dots. Check:
   - Pattern should be: `r'eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+'`
   - Pattern must start with `eyJ` (all JWTs start with base64-encoded `{"`)

6. **Latitude/longitude regex**: Check:
   - Latitude: `r'-?\d{1,2}\.\d+'` (valid range -90 to 90)
   - Longitude: `r'-?\d{1,3}\.\d+'` (valid range -180 to 180)
   - Does the pattern produce false positives on regular decimal numbers in unrelated contexts?

7. **Street address regex**: Highly variable — check that the pattern does not produce massive false positives. A conservative pattern: `r'\d+\s+[A-Za-z0-9\s,\.]+(?:Ave|St|Rd|Blvd|Dr|Ln|Way|Ct|Pl)\b'`

8. **Date of birth regex**: Must handle `YYYY-MM-DD`, `MM/DD/YYYY`, and `DD-MMM-YYYY`. Check that the pattern does not match arbitrary dates like appointment dates.

9. **OAuth token patterns**: `google_token`, `microsoft_token` are plain TextFields with no canonical format — any regex claiming to match these by format alone is unreliable. Skills should scan by field name proximity, not value pattern.

10. **For each regex in the skill**: Execute `re.compile(pattern)` in Python to confirm it is syntactically valid (no unclosed groups, invalid escape sequences, etc.).

---

### Dimension 4: Factory Completeness and Dependency Chain Validity

**What to check**: FK chains claimed by the `test-data-factory` skill match actual model relationships.

**Required FK chain verification**:

1. **Chain: `User → Client → Appointment → VideoCallRoom → Notes`**
   - Verify: `Client.user` is FK → `User` ✓ (check `apps/client/models.py`)
   - Verify: `Appointment.client` is FK → `Client` ✓
   - Verify: `Appointment` and `VideoCallRoom` are NOT directly linked by FK — they share `room_name` string only
   - Verify: `Notes.care_provider` is FK → `CareProvider`, NOT `Client` — the chain `Appointment → Notes` goes through `room_name` string match, NOT a FK traversal
   - **FINDING**: If skill claims `Appointment → Notes` is a FK relationship, that is WRONG

2. **Chain: `User → CareProvider → CareProviderCredential → ProfessionalLicense`**
   - Verify: `CareProvider.user` is OneToOneField ✓
   - Verify: `CareProvider.credential_type` is FK → `CareProviderCredential` ✓
   - Verify: `CareProviderCredential.professional_license` is M2M → `ProfessionalLicense` ✓
   - ProfessionalLicense does NOT have a direct FK back to CareProvider

3. **Chain: `User → UserResponse → ResponseDetail`**
   - Verify: `UserResponse.user` is FK → `User` ✓
   - Verify: `ResponseDetail.user_response` is FK → `UserResponse` ✓
   - Verify: `ResponseDetail.flow_question_sequence` is FK → `FlowQuestionSequence` (required, not nullable) — factory must provide this

4. **Factory import accuracy**: Verify each scenario factory imports from the correct conftest file:
   - Any factory importing `CareProviderFactory` from `apps/authentication/tests/conftest.py` is WRONG (it's in `apps/care_provider/tests/conftest.py`)
   - `AppointmentFactory` is in `apps/calendar_functionality/tests/conftest.py` (NOT authentication)
   - `ClientFactory` exists in BOTH `apps/authentication/tests/conftest.py` AND `apps/care_provider/tests/conftest.py` — they are different factory classes. Skills must reference the correct one.

5. **Missing fields in AppointmentFactory**: The existing `AppointmentFactory` does not set `modality`, `format`, `reason`, or payment fields. Skills that extend it for "CompletedSessionScenario" must add these fields rather than assuming they have defaults that satisfy business rules.

6. **`ResponseDetailFactory` missing required field**: `ResponseDetail.flow_question_sequence` is a non-nullable FK. The existing `ResponseDetailFactory` provides it via `FlowQuestionSequenceFactory`. Any new factory building on `ResponseDetailFactory` must ensure `FlowQuestionSequenceFactory` → `FlowFactory` → `QuestionFactory` → `QuestionTypeFactory` chain is satisfied.

---

### Dimension 5: Django Management Command Validity

**What to check**: Management commands proposed in skills use correct Django patterns, correct imports, and correct argument parsing.

**For each management command in any skill, verify**:

1. **Import path correctness**: The command must import models from their actual app:
   ```python
   # Correct:
   from apps.video_conferencing.models import Notes
   from apps.risk_screening.models import UserResponse
   from apps.calendar_functionality.models import Appointment
   from apps.care_provider.models import CareProvider
   # Wrong: from apps.authentication.models import CareProvider
   ```

2. **BaseCommand structure**: Must use:
   ```python
   from django.core.management.base import BaseCommand
   class Command(BaseCommand):
       help = "..."
       def add_arguments(self, parser): ...
       def handle(self, *args, **options): ...
   ```

3. **Argument parsing**: Check that `add_arguments` uses `parser.add_argument()`, not `argparse.ArgumentParser()` (Django provides the parser automatically).

4. **`--fix` flag pattern**: Verify any `--fix` argument uses:
   ```python
   parser.add_argument('--fix', action='store_true', default=False)
   # Accessed via: options['fix']
   ```

5. **`--model` argument**: If a command filters by model name, verify it uses a string argument and maps it to actual model classes within the command, not via `django.apps.get_model()` with hardcoded app_labels.

6. **`generate_test_scenarios` command** (Skill 4): Verify `--scenario` argument choices match the scenario names defined in the skill (e.g., `CompletedSessionScenario`, `CrisisScreeningScenario`).

7. **`check_data_integrity` command** (Skill 7): Verify NPI Luhn validation is mathematically correct. The NPI Luhn algorithm for US NPIs:
   - Prepend `80840` to the 10-digit NPI
   - Apply standard Luhn algorithm to the 15-digit result
   - The last digit is the check digit
   - Flag any skill that implements a simplified or incorrect Luhn check

8. **`validate_credentials` command** (Skill 10): Verify that the command uses correct field names:
   - `CareProvider.npi_valid_until` is IntegerField (year), so comparison must be `npi_valid_until < current_year` (integer), NOT `npi_valid_until < date.today()`
   - `ProfessionalLicense.professional_license_valid_until` is also IntegerField
   - `ProfessionalCertificate.professional_certificate_valid_until` is also IntegerField

9. **`set_mock_profile` command** (Skill 6): Verify Django cache import:
   ```python
   from django.core.cache import cache
   # NOT: import redis
   ```

---

### Dimension 6: Serializer and GraphQL Schema Accuracy

**What to check**: Do skills that audit serializers reference real serializer classes?

**Grep to find actual serializers**:
```bash
grep -rn "class.*Serializer" /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py" | grep -v "test"
grep -rn "class.*ObjectType\|DjangoObjectType" /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py"
```

**Required verification**:

1. Run the above greps and extract the actual serializer class names. Compare against any serializer names cited in the `api-response-sanitizer` skill (Skill 8) or `hipaa-compliance-audit` skill (Skill 2).

2. Verify that the GraphQL schema file exists at:
   ```
   /c/Projects/ReallyGlobal/Lumy-Backend/apps/graphqlapp/schema.py
   ```
   If skills reference `apps/graphqlapp/schema.py`, check that this path is correct.

3. For any GraphQL `DjangoObjectType` cited in a skill, verify:
   ```bash
   grep -n "class.*ObjectType\|DjangoObjectType\|Meta.fields\|Meta.exclude" \
     /c/Projects/ReallyGlobal/Lumy-Backend/apps/graphqlapp/schema.py
   ```

4. Verify that the `Notes` model is exposed in any GraphQL schema and check whether `notes` (the TextField) is in the exposed fields. A finding of `notes` being exposed without ownership filtering is a legitimate HIPAA violation, but the skill must correctly identify the actual GraphQL type class name.

5. Check that `fields = '__all__'` checks use the correct Django REST Framework pattern — DRF serializers use `fields = '__all__'` under `class Meta`, not at the class level.

---

### Dimension 7: DRF Permission Class Accuracy

**What to check**: Do security skills reference permission classes that actually exist in this codebase?

**Grep for actual permission classes**:
```bash
grep -rn "permission_classes\|IsAuthenticated\|IsAdminUser\|custom.*Permission\|BasePermission" \
  /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py" | grep -v "test" | grep -v "#"
```

**Required checks**:

1. Identify all custom DRF permission classes (subclasses of `rest_framework.permissions.BasePermission`). Any skill that references a permission class by name must reference an actual class from this output.

2. Verify that the `hipaa-compliance-audit` skill (Skill 2) and `backend-endpoint-security-test` skill (Skill 13) do not fabricate permission class names (e.g., `IsCareProvider`, `IsClient`, `IsPhiAuthorized`) that do not exist in the codebase.

3. For GraphQL, check decorators:
   ```bash
   grep -rn "@login_required\|@staff_member_required\|graphql_jwt" \
     /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py"
   ```
   Skills claiming specific GraphQL auth decorators must match what this grep returns.

---

### Dimension 8: Django Settings Reference Accuracy

**What to check**: Do deployment/hardening skills reference actual settings from `lumy_global/settings.py`?

**Read the actual settings file**:
```bash
cat /c/Projects/ReallyGlobal/Lumy-Backend/lumy_global/settings.py
```

**Required checks for `deployment-readiness-check` skill (Skill 14) and `django-model-security-hardening` skill (Skill 11)**:

1. Verify `DEBUG` setting: Does it exist in settings.py? Is it currently `True`? (Known from CLAUDE.md: yes, `DEBUG = True`.)

2. Verify `ALLOWED_HOSTS`: Is it currently `["*"]`? (Known from CLAUDE.md: yes.)

3. Verify `CORS_ORIGIN_ALLOW_ALL`: Is it currently `True`? (Known from CLAUDE.md: yes.)

4. Verify `SECRET_KEY` is hardcoded. (Known from CLAUDE.md: yes — "rotate for production".)

5. Check whether these settings currently EXIST (they may need to be added, not just changed):
   - `SECURE_SSL_REDIRECT`
   - `SESSION_COOKIE_SECURE`
   - `CSRF_COOKIE_SECURE`
   - `SECURE_HSTS_SECONDS`
   - `SECURE_BROWSER_XSS_FILTER`
   - `X_FRAME_OPTIONS`
   ```bash
   grep -n "SECURE_SSL_REDIRECT\|SESSION_COOKIE_SECURE\|CSRF_COOKIE_SECURE\|SECURE_HSTS\|X_FRAME_OPTIONS" \
     /c/Projects/ReallyGlobal/Lumy-Backend/lumy_global/settings.py
   ```
   Skills that say "change X to Y" when X does not yet exist in settings are describing a different operation (addition, not modification). Flag this distinction.

6. Verify `CSRF_TRUSTED_ORIGINS` is set to `devapi.really.global`. Skills should not claim this is unset.

7. Verify the `Graphene` settings block exists and check what `MIDDLEWARE` is configured. Skills claiming specific middleware for PHI logging or request sanitization must check whether Django middleware classes cited actually exist in the backend.

---

### Dimension 9: URL Pattern Accuracy

**What to check**: Do endpoint security skills reference actual URL patterns?

**Grep actual URL patterns**:
```bash
grep -rn "path\|url\|re_path" /c/Projects/ReallyGlobal/Lumy-Backend/apps/*/urls.py | head -80
grep -n "urlpatterns" /c/Projects/ReallyGlobal/Lumy-Backend/lumy_global/urls.py
```

**Required checks for `backend-endpoint-security-test` skill (Skill 13)**:

1. The REST base is `/api/v1/`. Verify any endpoint path cited in the skill starts with this prefix.

2. The GraphQL endpoint is `/api/v1/graphql/`. Verify skills use this exact path (not `/graphql/` or `/api/graphql/`).

3. For any specific endpoint path cited (e.g., `/api/v1/calendar/appointments/`), run:
   ```bash
   grep -rn "appointments\|calendar" /c/Projects/ReallyGlobal/Lumy-Backend/apps/calendar_functionality/urls.py
   ```
   Confirm the path matches.

4. Verify auth endpoints. Expected paths from Django-based JWT setup:
   ```bash
   grep -rn "login\|token\|refresh\|otp\|password" /c/Projects/ReallyGlobal/Lumy-Backend/apps/authentication/urls.py
   ```

---

### Dimension 10: External Service Integration Point Coverage

**What to check**: Does the `mock-external-services` skill (Skill 5) cover all actual external service integration points?

**Grep for external service calls**:
```bash
# Twilio
grep -rn "from twilio\|import twilio\|Client(account_sid\|TwilioClient" \
  /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py" | grep -v test

# Stripe
grep -rn "import stripe\|stripe\." \
  /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py" | grep -v test | head -20

# SendGrid
grep -rn "sendgrid\|send_mail\|SendGrid\|send_transactional_email" \
  /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py" | grep -v test | head -20

# Azure Search
grep -rn "azure\|SearchClient\|AzureSearch" \
  /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py" | grep -v test | head -20

# Certn
grep -rn "certn\|call_certn\|CertnAPI" \
  /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py" | grep -v test | head -20

# ipapi / geolocation
grep -rn "ipapi\|ip_api\|ipware\|geolocation" \
  /c/Projects/ReallyGlobal/Lumy-Backend/apps/ --include="*.py" | grep -v test | head -20

# MailModo
grep -rn "mailmodo\|MailModo" \
  /c/Projects/ReallyGlobal/Lumy-Backend/ --include="*.py" | grep -v test | head -10
```

**Required checks**:

1. For each external service found by the greps above, confirm the skill includes a corresponding mock class.

2. Verify that `MockTwilioClient` covers the actual Twilio client initialization pattern. Check the actual import:
   ```bash
   grep -rn "from twilio\|twilio.rest\|Client(" \
     /c/Projects/ReallyGlobal/Lumy-Backend/apps/video_conferencing/ --include="*.py"
   ```

3. Verify `MockStripeClient` covers the actual Stripe usage pattern. Check:
   ```bash
   grep -rn "stripe\.\|stripe\.PaymentIntent\|stripe\.Customer" \
     /c/Projects/ReallyGlobal/Lumy-Backend/apps/stripe_integration/ --include="*.py" | head -20
   ```

4. Check whether `django-rq` / Redis queue is cited as a service requiring mocking. The existing conftest files already mock `django_rq.get_queue` and `django_rq.enqueue` — skills should reference this pattern rather than inventing a new mock layer.

5. For the `mock_settings_manager` skill (Skill 6): Check that `python manage.py set_mock_profile` does NOT attempt to call `redis.set()` directly. It should use `from django.core.cache import cache`. The existing conftest mocks `django.core.cache.cache` — the management command must use the same interface.

---

### Dimension 11: Cross-Skill Naming Consistency

**What to check**: When multiple skills reference the same model, field, or class, do they use the same name?

**Specific inconsistencies to catch**:

1. **`Ethinicity` vs `Ethnicity`**: The model class is `Ethinicity` (intentional typo in source at `apps/care_provider/models.py`). The verbose_name is `"Ethnicity"` (correct spelling). Skills that use `Ethnicity` as a Python class import will fail with `ImportError`. Verify all skills use `Ethinicity` when importing the model class.

2. **`EthnicityFactory` naming**: The factory is named `EthnicityFactory` but its `Meta.model = Ethinicity` (typo). This is a known naming disconnect. Skills must import `EthnicityFactory` but understand it maps to the `Ethinicity` model.

3. **`agree_Credential_Status` vs `agree_credential_status`**: The field has mixed case. Verify all skills use the exact field name `agree_Credential_Status` when doing ORM queries (Django field lookups are case-sensitive on the Python attribute).

4. **`session_time_time`**: The typo field name in `Session`. Verify skills do not "correct" this to `session_end_time` or similar — the actual field is `session_time_time`.

5. **`CareProvider.years_in_practices`**: Note the plural `practices` (not `practice`). Verify skills reference this field correctly and do not use `years_in_practice` (singular).

6. **`my_identity_sexuality` as FK vs M2M**: This is a FK (single value), not M2M. Skills that call `.all()` or `.filter()` on this field will fail.

7. **`stripe_customer_id` location**: On `CareProvider`, not on `User` or `Appointment`. Any skill that checks `User.stripe_customer_id` or `Appointment.stripe_customer_id` as direct fields is referencing wrong models.

---

### Dimension 12: Consent Field Accuracy

**What to check**: Does the `consent-tracking-audit` skill (Skill 12) reference the correct consent fields and their correct model locations?

**Actual consent fields verified**:

| Field | Model | Location |
|---|---|---|
| `is_agree` | `User` | `apps/authentication/models.py` |
| `age_vulnerability_check` | `User` | `apps/authentication/models.py` |
| `is_email_verified` | `User` | `apps/authentication/models.py` |
| `agree_Credential_Status` | `CareProvider` | `apps/care_provider/models.py` |

**Check for**:

1. Does the skill claim `Client.tandc_consent`? Verify this field exists:
   ```bash
   grep -n "tandc_consent" /c/Projects/ReallyGlobal/Lumy-Backend/apps/client/models.py
   ```
   If not found, this is a BLOCKING error — the skill cites a non-existent field.

2. Does the skill reference `User.is_agree`? Verify: yes, it exists (BooleanField, default False).

3. Does the skill reference `User.is_agree` as "T&C consent"? Verify its actual purpose — the field is named `is_agree` but the skill may incorrectly label it as something else.

4. Check whether `parent_user` self-referential FK is addressed for minor consent flows. `User.parent_user` FK → self exists with `CASCADE`. `User.relationship` CharField(50) also exists.

---

### Dimension 13: Frontend Test Infrastructure Claims

**What to check**: Does the `frontend-test-scaffold` skill (Skill 9) accurately describe the current state?

**Verify current state**:
```bash
# Check for any existing test infrastructure
ls /c/Projects/ReallyGlobal/RG-Frontend/jest.config* 2>/dev/null || echo "NO JEST CONFIG"
ls /c/Projects/ReallyGlobal/RG-Frontend/src/mocks/ 2>/dev/null || echo "NO MOCKS DIR"
grep -n '"test"\|"jest"\|"vitest"' /c/Projects/ReallyGlobal/RG-Frontend/package.json | head -10
ls /c/Projects/ReallyGlobal/RG-Frontend/src/**/__tests__/ 2>/dev/null || echo "NO TEST DIRS"
```

**Required checks**:

1. Confirm the skill correctly states there is NO existing `jest.config.ts`, no `__tests__/` directories, and no jest in `package.json`. (Known from CLAUDE.md: "Frontend: NO test infrastructure.")

2. If the skill claims to "add to existing test setup", verify that is not contradicted by the actual state.

3. Verify the skill's `tsconfig.json` path alias claims. Check:
   ```bash
   cat /c/Projects/ReallyGlobal/RG-Frontend/tsconfig.json
   ```
   Any `moduleNameMapper` entries in `jest.config.ts` must match the actual `paths` in `tsconfig.json`.

4. Verify the `next/router` mock pattern is correct for Next.js 13 (pages router, not app router). The correct mock is:
   ```javascript
   jest.mock('next/router', () => require('next-router-mock'))
   ```
   or manual mock of `next/router`. Skills that mock `next/navigation` (App Router) are wrong for this codebase.

5. Verify MSW version compatibility. MSW v2 has a different API from MSW v1. Check whether the skill specifies a version and whether that version is compatible with the Node/Next.js version in use.

---

### Dimension 14: `loaddata` / `auto_now_add` Gotcha Coverage

**What to check**: Do any skills that write fixtures or factories for models with `auto_now_add` fields acknowledge the known `loaddata` incompatibility?

**Models with `auto_now_add` fields** (verified from source):
- `authentication.BaseModel.created_at` — all models inheriting BaseModel
- `authentication.BaseModel.modified_at` (auto_now)
- `video_conferencing.Notes.date` (auto_now_add — separate from created_at)
- `risk_screening.ResponseDetail.created_at` (auto_now_add — separate BaseModel in that app)

**Required checks**:

1. Any skill proposing JSON fixtures for `Notes`, `UserResponse`, `ResponseDetail`, `Appointment`, `CareProvider`, etc. MUST acknowledge the `auto_now_add` + `loaddata` incompatibility documented in the existing `fixture-seed-debug` skill.

2. Skills should reference the pattern established in `apps/risk_screening/management/commands/seed_risk_screening.py` (ORM-based seeding instead of JSON fixture loading).

3. The `test-data-factory` skill (Skill 4) must note that `Notes.date` is `auto_now_add=True` and therefore factory_boy cannot explicitly set it — it will be auto-assigned. This means date-ordered test assertions on Notes must use `Notes.objects.order_by('date')` not hardcoded timestamps.

---

## Audit Output Format

For each finding, produce a record in this format:

```
FINDING #<N>
Skill: <skill-name>/SKILL.md
Section: <heading or line reference>
Severity: BLOCKING | ERROR | WARNING
Claim: "<exact quoted text from skill>"
Ground Truth: <what the actual code shows, with file:line reference>
Fix: <minimum change needed to make the claim accurate>
```

After all per-skill findings, produce:

```
CROSS-SKILL SUMMARY
Total findings: <N>
BLOCKING: <count>
ERROR: <count>
WARNING: <count>

Skills with zero findings: <list>
Skills requiring rework: <list with finding counts>

Top 3 systemic issues:
1. <pattern that appears across multiple skills>
2. <pattern that appears across multiple skills>
3. <pattern that appears across multiple skills>
```

---

## Priority Execution Order

Run the audit dimensions in this order to catch blocking errors first:

1. **Dimension 1** (Model Field Accuracy) — FIRST. Errors here invalidate entire skills.
2. **Dimension 12** (Consent Fields) — verify `Client.tandc_consent` exists before continuing.
3. **Dimension 4** (Factory Chains) — verify FK relationships before testing factory code.
4. **Dimension 5** (Management Commands) — year vs date type errors cause runtime crashes.
5. **Dimension 3** (Regex) — syntax errors prevent the skill from running at all.
6. **Dimension 2** (PHI Tier Classification) — completeness audit.
7. **Dimension 11** (Cross-Skill Consistency) — catch naming drift.
8. **Dimensions 6–10** (Serializers, Permissions, Settings, URLs, External Services) — deeper structural audit.
9. **Dimensions 13–14** (Frontend, loaddata gotcha) — final layer.
