---
name: test-data-factory
description: Generate realistic but fake healthcare test data using factory_boy, extending existing factories. Use when asked to "create test data", "generate fake data", "build test fixtures", "healthcare test scenarios", or "seed test database".
argument-hint: [--scenario CompletedSession|CrisisScreening|NewProviderOnboarding|BookingFunnel|MinorClient|CancellationBeforeCutoff|CancellationAfterCutoff|NoShow|Reschedule|CrossTimezone|all] [--count N]
frequency: on-demand
---

# Healthcare Test Data Factory

## When to Use
- When writing new tests that need realistic healthcare data
- When setting up dev environments with representative data
- When testing edge cases (crisis screening, incomplete onboarding, payment failures)
- When verifying data integrity across model relationships
- When demonstrating features to stakeholders with realistic-looking data

## Prerequisites
- `Lumy-Backend/` Python environment with `factory_boy` and `faker` installed
- Existing factories must be importable (tests must pass baseline)
- Database migrations applied

## Existing Factories (DO NOT duplicate -- import and extend)

| Factory | Location | Model |
|---|---|---|
| `UserFactory` | `apps.authentication.tests.conftest` | `User` |
| `ClientFactory` | `apps.authentication.tests.conftest` | `Client` |
| `LanguagesFactory` | `apps.authentication.tests.conftest` | `Languages` |
| `CountryCodeFactory` | `apps.authentication.tests.conftest` | `CountryCode` |
| `CareProviderFactory` | `apps.care_provider.tests.conftest` (preferred -- includes step_counter, is_active, CareProviderScore post_generation) | `CareProvider` |
| `AppointmentFactory` | `apps.calendar_functionality.tests.conftest` | `Appointment` |
| `SlotFactory` | `apps.calendar_functionality.tests.conftest` | `Slot` |
| `SessionTypeFactory` | `apps.calendar_functionality.tests.conftest` | `SessionType` |
| `ModalityTypeFactory` | `apps.calendar_functionality.tests.conftest` | `ModalityType` |
| `FormatTypeFactory` | `apps.calendar_functionality.tests.conftest` | `FormatType` |
| `StripeUserFactory` | `apps.stripe_integration.tests.conftest` | `StripeUser` |
| `PaymentMethodFactory` | `apps.stripe_integration.tests.conftest` | **WARNING: BROKEN** -- targets `PaymentMethod(TextChoices)` enum, not a DB model. References fields (`stripe_user`, `stripe_payment_method_id`) that do not exist on TextChoices. Will raise `TypeError` at runtime. Do not use. |
| `QuestionTypeFactory` | `apps.risk_screening.tests.conftest` | `QuestionType` |
| `OptionTypeFactory` | `apps.risk_screening.tests.conftest` | `OptionType` |
| `QuestionFactory` | `apps.risk_screening.tests.conftest` | `Question` |
| `QuestionOptionFactory` | `apps.risk_screening.tests.conftest` | `QuestionOption` |
| `FlowFactory` | `apps.risk_screening.tests.conftest` | `Flow` |
| `FlowQuestionSequenceFactory` | `apps.risk_screening.tests.conftest` | `FlowQuestionSequence` |
| `UserResponseFactory` | `apps.risk_screening.tests.conftest` | `UserResponse` |
| `ResponseDetailFactory` | `apps.risk_screening.tests.conftest` | `ResponseDetail` |

## Workflow

### Step 1: Create healthcare-specific Faker providers

Create `Lumy-Backend/apps/utils/test_providers.py`:

```python
"""Healthcare-specific fake data providers for factory_boy."""
import random
import string
from faker.providers import BaseProvider


class HealthcareProvider(BaseProvider):
    """Faker provider for healthcare-specific data."""

    # Valid NPI format: 10 digits, starts with 1 or 2, Luhn check digit
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
        # Calculate Luhn check digit
        digits = [int(d) for d in '80840' + base]  # NPI uses 80840 prefix for Luhn
        total = 0
        for i, d in enumerate(reversed(digits)):
            if i % 2 == 0:
                doubled = d * 2
                total += doubled - 9 if doubled > 9 else doubled
            else:
                total += d
        check = (10 - (total % 10)) % 10
        return base + str(check)

    def license_number(self, state='CA'):
        """Generate a realistic-format license number."""
        patterns = {
            'CA': lambda: f"LMFT{random.randint(10000, 99999)}",
            'NY': lambda: f"{random.randint(100000, 999999)}-1",
            'TX': lambda: f"{random.randint(10000, 99999)}",
            'FL': lambda: f"MT{random.randint(1000, 9999)}",
        }
        return patterns.get(state, patterns['CA'])()

    def insurance_policy_number(self):
        """Generate a realistic-format insurance policy number."""
        carriers = ['BH', 'AE', 'UH', 'CI', 'AN']
        return f"{random.choice(carriers)}-{random.randint(100000, 999999)}"

    def icd10_code(self, synthetic=True):
        """Generate a synthetic ICD-10-CM code for mental health test data.

        WARNING: These are REAL ICD-10-CM codes used for testing format validation only.
        Do NOT use test data ICD-10 codes in clinical contexts or billing systems.
        Default synthetic=True returns F99 (unspecified mental disorder) for safety.

        Args:
            synthetic: If True (default), return F99 as safe placeholder.
                       If False, return from list of real codes for format testing.
        """
        if synthetic:
            return 'F99'  # Unspecified mental disorder -- safe placeholder
        # Real ICD-10-CM codes for format validation testing ONLY:
        # F32.1 = Major depressive disorder, single episode, moderate
        # F33.0 = MDD, recurrent, mild
        # F41.1 = Generalized anxiety disorder
        # F43.10 = PTSD, unspecified
        # F43.12 = PTSD, chronic
        # F40.10 = Social anxiety disorder
        # F42.2 = Mixed obsessional thoughts and acts
        # F90.0 = ADHD, predominantly inattentive
        # F84.0 = Autistic disorder
        # F50.00 = Anorexia nervosa, unspecified
        codes = [
            'F32.1', 'F33.0', 'F41.1', 'F43.10', 'F43.12',
            'F40.10', 'F42.2', 'F90.0', 'F84.0', 'F50.00',
            'F31.30', 'F20.0', 'F60.3', 'F10.20', 'F17.200',
        ]
        return random.choice(codes)

    def clinical_note(self, severity='routine'):
        """Generate synthetic clinical session note (SOAP-style).

        Note: Under the 21st Century Cures Act (OpenNotes), patients have the
        right to access their clinical notes. Test data should reflect this
        by using patient-facing language where appropriate.
        """
        templates = {
            'routine': [
                "Client presented with stable mood. Discussed coping strategies for workplace stress. "
                "Practiced breathing exercises. Assigned homework: daily mood journal.",
                "Follow-up session. Client reports improvement in sleep patterns since last visit. "
                "Continued CBT work on automatic thoughts. Next session in 2 weeks.",
            ],
            'moderate': [
                "Client reports increased anxiety related to family conflict. PHQ-9 score: 12 (moderate). "
                "Adjusted treatment plan to include weekly sessions. Safety plan reviewed.",
                "Client experiencing grief reaction. Tearful during session. "
                "Explored loss narrative. No SI/HI. Plan: continue weekly sessions.",
            ],
            'crisis': [
                "CRISIS SESSION. Client endorsed passive suicidal ideation without plan or intent. "
                "Safety plan created and signed. Emergency contacts verified. "
                "Follow-up scheduled for 48 hours. Supervisor notified.",
            ],
        }
        return random.choice(templates.get(severity, templates['routine']))

    # PHQ-9 Severity Thresholds (Kroenke et al., 2001):
    #   0-4:   Minimal depression
    #   5-9:   Mild depression
    #   10-14: Moderate depression
    #   15-19: Moderately severe depression
    #   20-27: Severe depression
    # Item 9 (suicidality) score >= 1 triggers crisis protocol regardless of total.

    def risk_screening_keywords(self, severity='low'):
        """Generate risk screening keyword sets."""
        keyword_sets = {
            'low': [["stress", "work", "sleep"]],
            'moderate': [["anxiety", "depression", "hopeless"]],
            'high': [["suicidal", "self-harm", "crisis", "no reason to live"]],
        }
        return random.choice(keyword_sets.get(severity, keyword_sets['low']))

    def safe_email(self):
        """Generate email using .example TLD only."""
        return f"test.user.{random.randint(1000,9999)}@example.com"

    def safe_phone(self):
        """Generate phone using 555 prefix (reserved for fiction)."""
        return f"+1-555-{random.randint(100,999)}-{random.randint(1000,9999)}"

    def safe_coordinates(self):
        """Generate lat/lng in ocean or uninhabited areas."""
        locations = [
            (0.0, 0.0),        # Gulf of Guinea (ocean)
            (-45.0, -120.0),   # South Pacific Ocean
            (35.0, -170.0),    # North Pacific Ocean
            (-60.0, 10.0),     # Southern Ocean
        ]
        return random.choice(locations)

    def safe_address(self):
        """Generate clearly fake address."""
        return {
            'street': f"{random.randint(100,999)} Test Street",
            'city': 'Testville',
            'state': 'TS',
            'zip': '00000',
            'country': 'US',
        }
```

### Step 2: Create extended factories with healthcare traits

Create `Lumy-Backend/apps/utils/test_factories.py`:

```python
"""Extended factories for healthcare test scenarios."""
import random
from datetime import timedelta
from django.utils import timezone

import factory
from factory.django import DjangoModelFactory

from apps.authentication.tests.conftest import UserFactory, ClientFactory
from apps.care_provider.tests.conftest import CareProviderFactory
from apps.calendar_functionality.tests.conftest import (
    AppointmentFactory, SlotFactory,
    ModalityTypeFactory, FormatTypeFactory,
)
from apps.risk_screening.tests.conftest import (
    UserResponseFactory, ResponseDetailFactory,
    FlowQuestionSequenceFactory, QuestionOptionFactory,
)
from apps.stripe_integration.tests.conftest import StripeUserFactory
from apps.video_conferencing.models import Notes, VideoCallRoom
from apps.calendar_functionality.enum import PaymentStatus
from apps.care_provider.models import (
    ProfessionalLicense, ProfessionalCertificate, AcademicDegree,
    CareProviderCredential, InPersonLocation, PreLicensed, CountryCode,
)
from apps.utils.test_providers import HealthcareProvider

# Register custom provider
factory.Faker.add_provider(HealthcareProvider)


class VideoCallRoomFactory(DjangoModelFactory):
    class Meta:
        model = VideoCallRoom
    room_name = factory.LazyFunction(lambda: str(factory.Faker._get_faker().uuid4()))
    sid = factory.Faker("uuid4")


class NotesFactory(DjangoModelFactory):
    class Meta:
        model = Notes
    care_provider = factory.SubFactory(CareProviderFactory)
    notes = factory.Faker("clinical_note", severity="routine")
    room_name = factory.LazyFunction(lambda: str(factory.Faker._get_faker().uuid4()))


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
    class Meta:
        model = AcademicDegree
    care_provider = factory.SubFactory(CareProviderFactory)
    degree_type = "Master of Science"
    degree_name = "Clinical Psychology"
    degree_granting_institution = "Test University"
    academic_degree_year_granted = 2015


class PreLicensedFactory(DjangoModelFactory):
    class Meta:
        model = PreLicensed
    supervisor_name = factory.Faker("name")
    supervisor_license_number = factory.Faker("license_number", state="CA")
    role = "Associate Marriage and Family Therapist"
    year_granted = 2023
    anticipated_completion_date = factory.LazyFunction(
        lambda: (timezone.now() + timedelta(days=365)).date()
    )
    state = "CA"
    country = "US"
```

### Step 3: Create scenario factories (composite)

Add to `Lumy-Backend/apps/utils/test_factories.py`:

```python
class CompletedSessionScenario:
    """
    Creates: provider + client + appointment(COMPLETED) + VideoCallRoom + notes + stripe payments
    Relationship chain: User -> CareProvider -> Appointment --(room_name string match)--> Notes
    Note: No FK between Appointment, VideoCallRoom, or Notes -- linked only by room_name CharField.
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
        appointment = AppointmentFactory(
            care_provider=provider,
            client=client,
            is_status="COMPLETED",
            start_date_time=timezone.now() - timedelta(hours=2),
            end_date_time=timezone.now() - timedelta(hours=1),
            reason="Routine follow-up session",
            payment_status=PaymentStatus.COMPLETED,  # IntegerChoices: 1
        )
        video_room = VideoCallRoomFactory(
            room_name=appointment.room_name,
        )
        notes = NotesFactory(
            care_provider=provider,
            room_name=appointment.room_name,
            notes=factory.Faker._get_faker().clinical_note(severity="routine"),
        )
        provider_stripe = StripeUserFactory(user=provider.user)
        client_stripe = StripeUserFactory(user=client.user)
        return {
            'provider': provider,
            'client': client,
            'appointment': appointment,
            'video_room': video_room,
            'notes': notes,
            'provider_stripe': provider_stripe,
            'client_stripe': client_stripe,
        }


class CrisisScreeningScenario:
    """
    Creates: user + high-severity PHQ-9 risk response + 9 ResponseDetail records
    FK chain: User -> UserResponse -> ResponseDetail (x9)

    PHQ-9 scoring: 9 questions, each scored 0-3. Max total = 27.
    Item 9 (suicidality question): "Thoughts that you would be better off dead,
    or of hurting yourself in some way" -- score >= 1 triggers crisis protocol.
    """

    PHQ9_ITEMS = [
        "Little interest or pleasure in doing things",
        "Feeling down, depressed, or hopeless",
        "Trouble falling or staying asleep, or sleeping too much",
        "Feeling tired or having little energy",
        "Poor appetite or overeating",
        "Feeling bad about yourself",
        "Trouble concentrating on things",
        "Moving or speaking slowly / being fidgety or restless",
        "Thoughts that you would be better off dead, or of hurting yourself",
    ]

    @classmethod
    def create(cls, **kwargs):
        user = UserFactory(user_type="CLIENT", email=f"crisis.user.{random.randint(1000,9999)}@example.com")
        response = UserResponseFactory(
            user=user,
            final_score=27,
            final_keywords=["suicidal", "self-harm", "crisis", "no reason to live"],
            is_severe=True,
        )
        details = []
        for i, item_text in enumerate(cls.PHQ9_ITEMS):
            fqs = FlowQuestionSequenceFactory()
            is_item_9 = (i == 8)  # 0-indexed: item 9 is index 8
            detail = ResponseDetailFactory(
                user_response=response,
                flow_question_sequence=fqs,
                score=3,  # Max per-question score for PHQ-9 is 3, not 9
                keywords=["suicidal", "self-harm"] if is_item_9 else [],
                is_severe=is_item_9,
            )
            details.append(detail)
        return {
            'user': user,
            'response': response,
            'details': details,  # List of 9 ResponseDetail records
        }


class NewProviderOnboardingScenario:
    """
    Creates: user + care_provider(incomplete) + partial credentials
    """
    @classmethod
    def create(cls, **kwargs):
        user = UserFactory(
            user_type="CAREPROVIDER",
            email=f"new.provider.{random.randint(1000,9999)}@example.com",
            is_profile=False,
        )
        provider = CareProviderFactory(
            user=user,
            is_licensed=False,
            step_counter="3",  # Incomplete onboarding
            npi_number=None,
        )
        pre_licensed = PreLicensedFactory()
        return {
            'user': user,
            'provider': provider,
            'pre_licensed': pre_licensed,
        }


class BookingFunnelScenario:
    """
    Creates: client + slot + appointment(SCHEDULED) + pending payment
    """
    @classmethod
    def create(cls, **kwargs):
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"booking.{random.randint(1000,9999)}@example.com")
        )
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"booked.provider.{random.randint(1000,9999)}@example.com"),
            is_licensed=True,
        )
        slot = SlotFactory(
            care_provider=provider,
            start_date_time=timezone.now() + timedelta(days=3),
            end_date_time=timezone.now() + timedelta(days=3, minutes=50),
            duration=timedelta(minutes=50),
        )
        appointment = AppointmentFactory(
            care_provider=provider,
            client=client,
            is_status="SCHEDULED",
            start_date_time=slot.start_date_time,
            end_date_time=slot.end_date_time,
            payment_status=PaymentStatus.PENDING,  # IntegerChoices: 0
            payment_intent_id="pi_test_" + str(random.randint(100000, 999999)),
        )
        return {
            'client': client,
            'provider': provider,
            'slot': slot,
            'appointment': appointment,
        }


class MinorClientScenario:
    """
    Creates: minor user + parent user + client with jurisdiction-aware consent.
    Tests: parent_user FK, age_vulnerability_check, AgeOfConsent lookup.

    Jurisdiction carve-outs for mental health self-consent:
    - CA: 12+ can consent to outpatient mental health
    - IL: 12+ can consent to counseling
    - OR: 14+ can consent to mental health treatment
    Note: Records under minor self-consent must be withheld from parent.
    """
    @classmethod
    def create(cls, minor_age=15, state='CA', **kwargs):
        from apps.authentication.models import AgeOfConsent
        parent = UserFactory(
            user_type="CLIENT",
            email=f"parent.{random.randint(1000,9999)}@example.com",
            is_primary_account=True,
            is_agree=True,
        )
        minor_dob = (timezone.now() - timedelta(days=365 * minor_age)).date()
        minor = UserFactory(
            user_type="CLIENT",
            email=f"minor.{random.randint(1000,9999)}@example.com",
            parent_user=parent,
            is_primary_account=False,
            date_of_birth=minor_dob,
            age_vulnerability_check=True,
            relationship="child",
        )
        minor_client = ClientFactory(user=minor, tandc_consent=True)
        return {
            'parent': parent,
            'minor': minor,
            'minor_client': minor_client,
            'minor_age': minor_age,
            'state': state,
        }


class CancellationBeforeCutoffScenario:
    """
    Creates: appointment cancelled before the cancellation cutoff (full refund expected).
    """
    @classmethod
    def create(cls, **kwargs):
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"cancel.provider.{random.randint(1000,9999)}@example.com"),
        )
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"cancel.client.{random.randint(1000,9999)}@example.com")
        )
        appointment = AppointmentFactory(
            care_provider=provider,
            client=client,
            is_status="CANCELLED",
            start_date_time=timezone.now() + timedelta(days=5),
            end_date_time=timezone.now() + timedelta(days=5, minutes=50),
            payment_status=PaymentStatus.CANCELED,  # IntegerChoices: 3
            payment_intent_id="pi_test_" + str(random.randint(100000, 999999)),
        )
        return {
            'provider': provider,
            'client': client,
            'appointment': appointment,
        }


class CancellationAfterCutoffScenario:
    """
    Creates: appointment cancelled after the cancellation cutoff (partial/no refund).
    """
    @classmethod
    def create(cls, **kwargs):
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"latecancel.provider.{random.randint(1000,9999)}@example.com"),
        )
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"latecancel.client.{random.randint(1000,9999)}@example.com")
        )
        appointment = AppointmentFactory(
            care_provider=provider,
            client=client,
            is_status="CANCELLED",
            start_date_time=timezone.now() + timedelta(hours=2),
            end_date_time=timezone.now() + timedelta(hours=2, minutes=50),
            payment_status=PaymentStatus.COMPLETED,  # Provider still paid for late cancel
            # NOTE: PaymentStatus enum may not have PARTIALLY_REFUNDED. Check enum and add if needed.
            payment_intent_id="pi_test_" + str(random.randint(100000, 999999)),
        )
        return {
            'provider': provider,
            'client': client,
            'appointment': appointment,
        }


class NoShowScenario:
    """
    Creates: appointment where client did not attend (no-show).
    Provider is still paid. Client may be charged cancellation fee.
    """
    @classmethod
    def create(cls, **kwargs):
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"noshow.provider.{random.randint(1000,9999)}@example.com"),
        )
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"noshow.client.{random.randint(1000,9999)}@example.com")
        )
        appointment = AppointmentFactory(
            care_provider=provider,
            client=client,
            is_status="NO_SHOW",
            start_date_time=timezone.now() - timedelta(hours=2),
            end_date_time=timezone.now() - timedelta(hours=1),
            payment_status=PaymentStatus.COMPLETED,  # IntegerChoices: 1
            payment_intent_id="pi_test_" + str(random.randint(100000, 999999)),
        )
        return {
            'provider': provider,
            'client': client,
            'appointment': appointment,
        }


class RescheduleScenario:
    """
    Creates: original appointment (CANCELLED) + new appointment (SCHEDULED).
    Tests: rebooking flow, payment transfer, slot availability.
    """
    @classmethod
    def create(cls, **kwargs):
        provider = CareProviderFactory(
            user=UserFactory(user_type="CAREPROVIDER", email=f"resched.provider.{random.randint(1000,9999)}@example.com"),
        )
        client = ClientFactory(
            user=UserFactory(user_type="CLIENT", email=f"resched.client.{random.randint(1000,9999)}@example.com")
        )
        original_appt = AppointmentFactory(
            care_provider=provider,
            client=client,
            is_status="CANCELLED",
            start_date_time=timezone.now() + timedelta(days=1),
            end_date_time=timezone.now() + timedelta(days=1, minutes=50),
            payment_status=PaymentStatus.CANCELED,
        )
        new_slot = SlotFactory(
            care_provider=provider,
            start_date_time=timezone.now() + timedelta(days=3),
            end_date_time=timezone.now() + timedelta(days=3, minutes=50),
            duration=timedelta(minutes=50),
        )
        new_appt = AppointmentFactory(
            care_provider=provider,
            client=client,
            is_status="SCHEDULED",
            start_date_time=new_slot.start_date_time,
            end_date_time=new_slot.end_date_time,
            payment_status=PaymentStatus.PENDING,
        )
        return {
            'provider': provider,
            'client': client,
            'original_appointment': original_appt,
            'new_slot': new_slot,
            'new_appointment': new_appt,
        }


class CrossTimezoneBookingScenario:
    """
    Creates: provider in US/Pacific + client in US/Eastern + appointment.
    Tests: timezone display correctness, slot availability across zones,
    DST edge cases, and calendar rendering.
    """
    @classmethod
    def create(cls, **kwargs):
        import pytz
        provider = CareProviderFactory(
            user=UserFactory(
                user_type="CAREPROVIDER",
                email=f"tz.provider.{random.randint(1000,9999)}@example.com",
            ),
        )
        client = ClientFactory(
            user=UserFactory(
                user_type="CLIENT",
                email=f"tz.client.{random.randint(1000,9999)}@example.com",
            )
        )
        # Provider's slot in Pacific time, client sees in Eastern
        pacific = pytz.timezone('US/Pacific')
        slot_start = timezone.now().astimezone(pacific).replace(
            hour=14, minute=0, second=0, microsecond=0
        ) + timedelta(days=2)
        slot = SlotFactory(
            care_provider=provider,
            start_date_time=slot_start,
            end_date_time=slot_start + timedelta(minutes=50),
            duration=timedelta(minutes=50),
        )
        appointment = AppointmentFactory(
            care_provider=provider,
            client=client,
            is_status="SCHEDULED",
            start_date_time=slot.start_date_time,
            end_date_time=slot.end_date_time,
            payment_status=PaymentStatus.PENDING,
        )
        return {
            'provider': provider,
            'client': client,
            'slot': slot,
            'appointment': appointment,
            'provider_tz': 'US/Pacific',
            'client_tz': 'US/Eastern',
        }
```

### Step 4: Create management command

Create `Lumy-Backend/apps/utils/management/commands/generate_test_scenarios.py`:

```python
"""Management command to generate test scenario data."""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate realistic test healthcare scenarios"

    def add_arguments(self, parser):
        parser.add_argument('--scenario', type=str, default='all',
            choices=['CompletedSession', 'CrisisScreening', 'NewProviderOnboarding', 'BookingFunnel', 'all'])
        parser.add_argument('--count', type=int, default=5)

    def handle(self, *args, **options):
        from apps.utils.test_factories import (
            CompletedSessionScenario, CrisisScreeningScenario,
            NewProviderOnboardingScenario, BookingFunnelScenario,
        )
        scenarios = {
            'CompletedSession': CompletedSessionScenario,
            'CrisisScreening': CrisisScreeningScenario,
            'NewProviderOnboarding': NewProviderOnboardingScenario,
            'BookingFunnel': BookingFunnelScenario,
        }

        scenario_name = options['scenario']
        count = options['count']

        if scenario_name == 'all':
            to_run = scenarios
        else:
            to_run = {scenario_name: scenarios[scenario_name]}

        for name, scenario_cls in to_run.items():
            self.stdout.write(f"Generating {count}x {name}...")
            for i in range(count):
                result = scenario_cls.create()
                self.stdout.write(f"  [{i+1}/{count}] Created: {list(result.keys())}")
            self.stdout.write(self.style.SUCCESS(f"  Done: {name}"))
```

### Step 5: Seed data safety validation

After generating data, verify safety:

```python
# In Django shell or test:
from apps.authentication.models import User

# No real email domains
assert not User.objects.exclude(email__endswith='@example.com').exclude(email__endswith='@test.com').exists()

# No real phone numbers (should all be 555-*)
for u in User.objects.exclude(phone_number__isnull=True).exclude(phone_number=''):
    assert '555' in (u.phone_number or ''), f"Real-looking phone: {u.phone_number}"

# No real coordinates (should be ocean/zeros)
from apps.care_provider.models import InPersonLocation
for loc in InPersonLocation.objects.all():
    assert loc.latitude in [0.0, None, -45.0, 35.0, -60.0], f"Real-looking lat: {loc.latitude}"
```

## Known Patterns & Gotchas

1. **`auto_now_add=True` on BaseModel and Notes.date**: Both `authentication.BaseModel` and `risk_screening.BaseModel` use `auto_now_add=True` for `created_at`. Additionally, `Notes.date` at `apps/video_conferencing/models.py:35` is a SEPARATE `auto_now_add=True` DateTimeField (not inherited from BaseModel). Factory_boy handles these correctly (unlike `loaddata`), but setting them explicitly will be ignored. Use `Model.objects.filter(pk=obj.pk).update(created_at=..., date=...)` to override. Date-ordered assertions on Notes should use `.order_by('date')` and accept auto-assigned values.

2. **`CareProvider.save()` triggers `make_profile_handle()`**: Creating a CareProvider via factory will auto-generate a `profile_handle` on the associated User (see `Lumy-Backend/apps/care_provider/models.py:1253`). The handle is built from `first_name`, `last_name`, `email`. Ensure factory data uses fake names.

3. **`CareProvider.save()` creates ManagePages**: The `save()` method at line 1271 auto-creates a `ManagePages` record via `apps.get_model("manage_pages", "ManagePages")`. This requires the `manage_pages` app to be in `INSTALLED_APPS` and migrated.

4. **`Appointment.save()` auto-generates `room_name`**: At `Lumy-Backend/apps/calendar_functionality/models.py:119`, if `room_name` is not set, it generates a UUID. Factory appointments will always have a room_name.

5. **M2M fields on CareProvider**: `CareProvider` has many M2M relationships (modalities, my_role, client_needs, etc.). Factories produce a bare CareProvider without M2M data. Use `factory.post_generation` or explicit `.add()` calls to populate.

6. **`mock_manage_pages_enqueue` autouse fixture**: The authentication conftest at `Lumy-Backend/apps/authentication/tests/conftest.py:92` has an autouse fixture that mocks signal handlers. Tests that need real signal behavior must override this.

7. **`mock_cache` and `mock_external_apis` autouse fixtures**: Calendar functionality conftest mocks Redis cache and external APIs (Stripe, SendGrid, ThirdPartyCalendarAPI). These are autouse and will affect all tests in that app.

8. **Windows Docker exec path mangling**: When running management commands via `docker exec` on Windows
   (Git Bash / MSYS2), prefix with `MSYS_NO_PATHCONV=1` to prevent path conversion:
   `MSYS_NO_PATHCONV=1 docker exec backend python manage.py generate_test_scenarios`

9. **Two-checkout warning**: This repo has two checkout locations:
   `C:\Projects\ReallyGlobal\Lumy-Backend` (Docker primary) and
   `C:\Projects\ReallyGlobal-Infra\Lumy-Backend` (Infra submodule).
   New factory/mock files must be created in the Docker primary checkout.
   After committing in Infra, sync: `cd /c/Projects/ReallyGlobal/Lumy-Backend && git fetch /c/Projects/ReallyGlobal-Infra/Lumy-Backend docker-dev-v2 && git merge FETCH_HEAD --ff-only`

10. **OpenNotes (21st Century Cures Act)**: Patients have the right to access their clinical notes. Test data clinical notes should reflect patient-facing language. The `clinical_note()` provider generates SOAP-style notes.

## Example Invocations

```
/test-data-factory --scenario CompletedSession --count 10
/test-data-factory --scenario CrisisScreening --count 3
/test-data-factory --scenario all --count 5
/test-data-factory
```
