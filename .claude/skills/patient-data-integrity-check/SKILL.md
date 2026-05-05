---
name: patient-data-integrity-check
description: Verify referential integrity, consistency, and validity of patient/provider data across all models. Use when asked to "check data integrity", "find orphan records", "validate data consistency", "audit database", or "data quality check".
argument-hint: [--model User|CareProvider|Appointment|Notes|UserResponse|all] [--fix] [--verbose]
frequency: quarterly
---

# Patient Data Integrity Check

## When to Use
- After data migrations or bulk imports
- Before generating analytics or reports
- When debugging inconsistent UI behavior tied to data
- After fixture loading or seed data generation
- Periodically as part of data quality assurance
- When onboarding new care providers (credential validation)

## Prerequisites
- Database accessible (either via Docker container or local Django shell)
- Migrations applied and up to date

## Key Models and Relationships

```
User (authentication.User)
  |-- OneToOne --> Client (client.Client)
  |-- OneToOne --> CareProvider (care_provider.CareProvider)
  |-- FK --> UserResponse (risk_screening.UserResponse)
  |
  CareProvider
  |-- FK --> CareProviderCredential --> M2M ProfessionalLicense, ProfessionalCertificate, AcademicDegree, PreLicensed
  |-- FK --> InPersonLocation
  |-- OneToOne --> CareProviderScore
  |-- FK --> Notes (video_conferencing.Notes)
  |
  Client
  |-- FK --> Appointment (calendar_functionality.Appointment)
  |
  Appointment
  |-- FK --> CareProvider
  |-- FK --> Client
  |-- room_name --> Notes.room_name (string match, NOT FK)
```

## Workflow

### Step 1: Orphan Detection

Run these Django ORM queries (via `manage.py shell` or management command):

```python
from apps.authentication.models import User
from apps.client.models import Client
from apps.care_provider.models import CareProvider, CareProviderScore, InPersonLocation
from apps.calendar_functionality.models import Appointment, Session, Slot
from apps.video_conferencing.models import Notes, VideoCallRoom
from apps.risk_screening.models import UserResponse, ResponseDetail
from apps.stripe_integration.models import StripeUser

# 1. Clients without User records
orphan_clients = Client.objects.filter(user__isnull=True)
print(f"Orphan clients (no User): {orphan_clients.count()}")

# 2. CareProviders without User records
orphan_providers = CareProvider.objects.filter(user__isnull=True)
print(f"Orphan care providers (no User): {orphan_providers.count()}")

# 3. Users with user_type=CLIENT but no Client record
users_missing_client = User.objects.filter(user_type="CLIENT").exclude(
    id__in=Client.objects.values_list("user_id", flat=True)
)
print(f"CLIENT users without Client record: {users_missing_client.count()}")

# 4. Users with user_type=CAREPROVIDER but no CareProvider record
users_missing_provider = User.objects.filter(user_type="CAREPROVIDER").exclude(
    id__in=CareProvider.objects.values_list("user_id", flat=True)
)
print(f"CAREPROVIDER users without CareProvider record: {users_missing_provider.count()}")

# 5. Appointments referencing non-existent care providers
orphan_appts_cp = Appointment.objects.filter(care_provider__isnull=True)
print(f"Appointments with no care_provider: {orphan_appts_cp.count()}")

# 6. Notes without matching Appointments (via room_name)
appointment_rooms = set(Appointment.objects.values_list("room_name", flat=True))
orphan_notes = Notes.objects.exclude(room_name__in=appointment_rooms)
print(f"Notes with no matching Appointment room_name: {orphan_notes.count()}")

# 7. UserResponses without Users (FK cascade should prevent, but check)
orphan_responses = UserResponse.objects.filter(user__isnull=True)
print(f"Orphan UserResponses: {orphan_responses.count()}")

# 8. ResponseDetails without UserResponses
orphan_details = ResponseDetail.objects.filter(user_response__isnull=True)
print(f"Orphan ResponseDetails: {orphan_details.count()}")

# 9. CareProviderScores without CareProviders
orphan_scores = CareProviderScore.objects.exclude(
    care_provider_id__in=CareProvider.objects.values_list("id", flat=True)
)
print(f"Orphan CareProviderScores: {orphan_scores.count()}")

# 10. StripeUsers without Users
orphan_stripe = StripeUser.objects.filter(user__isnull=True)
print(f"Orphan StripeUsers: {orphan_stripe.count()}")
```

### Step 2: Consistency Checks

```python
from django.utils import timezone

# 1. User.user_type matches actual profile
mismatched_clients = User.objects.filter(user_type="CLIENT").filter(
    id__in=CareProvider.objects.values_list("user_id", flat=True)
)
print(f"Users typed CLIENT but have CareProvider: {mismatched_clients.count()}")

mismatched_providers = User.objects.filter(user_type="CAREPROVIDER").filter(
    id__in=Client.objects.values_list("user_id", flat=True)
)
print(f"Users typed CAREPROVIDER but have Client: {mismatched_providers.count()}")

# 2. Appointment.care_provider actually has CareProvider profile
for appt in Appointment.objects.select_related("care_provider__user").all()[:1000]:
    if appt.care_provider and appt.care_provider.user.user_type != "CAREPROVIDER":
        print(f"Appointment {appt.pk}: care_provider user_type={appt.care_provider.user.user_type}")

# 3. Appointment date ranges valid (start < end)
bad_dates = Appointment.objects.filter(
    start_date_time__isnull=False, end_date_time__isnull=False
).exclude(start_date_time__lt=models.F("end_date_time"))
print(f"Appointments with start >= end: {bad_dates.count()}")

# 4. Appointments in distant past (>5 years) or future (>1 year)
from datetime import timedelta
distant_past = Appointment.objects.filter(
    start_date_time__lt=timezone.now() - timedelta(days=365*5)
)
distant_future = Appointment.objects.filter(
    start_date_time__gt=timezone.now() + timedelta(days=365)
)
print(f"Appointments >5 years old: {distant_past.count()}")
print(f"Appointments >1 year in future: {distant_future.count()}")

# 5. Double-booked slots (overlapping slots for same provider)
from django.db.models import Q
for provider in CareProvider.objects.all()[:100]:
    slots = Slot.objects.filter(care_provider=provider).order_by("start_date_time")
    for i, slot in enumerate(slots):
        overlapping = Slot.objects.filter(
            care_provider=provider,
            start_date_time__lt=slot.end_date_time,
            end_date_time__gt=slot.start_date_time,
        ).exclude(pk=slot.pk)
        if overlapping.exists():
            print(f"Double-booked slot for provider {provider.pk}: {slot.pk} overlaps {overlapping.values_list('pk', flat=True)}")
```

### Step 3: NPI Validation (Luhn Check)

```python
def validate_npi(npi_str):
    """Validate NPI using Luhn algorithm with 80840 prefix."""
    if not npi_str or len(npi_str) != 10 or not npi_str.isdigit():
        return False
    if npi_str[0] not in ('1', '2'):
        return False
    # NPI Luhn check uses prefix "80840"
    full = "80840" + npi_str
    digits = [int(d) for d in full]
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            doubled = d * 2
            total += doubled - 9 if doubled > 9 else doubled
        else:
            total += d
    return total % 10 == 0

# Check all providers with NPI numbers
for cp in CareProvider.objects.exclude(npi_number__isnull=True).exclude(npi_number=""):
    if not validate_npi(cp.npi_number):
        print(f"Invalid NPI for provider {cp.pk}: {cp.npi_number}")
```

### Step 4: Credential Date Validation

```python
import datetime

# NPI date range validation
for cp in CareProvider.objects.exclude(npi_year_granted__isnull=True):
    if cp.npi_valid_until and cp.npi_year_granted > cp.npi_valid_until:
        print(f"Provider {cp.pk}: npi_year_granted ({cp.npi_year_granted}) > npi_valid_until ({cp.npi_valid_until})")
    if cp.npi_valid_until and cp.npi_valid_until < datetime.date.today().year:
        print(f"Provider {cp.pk}: Expired NPI (valid_until={cp.npi_valid_until})")

# Professional license validation
from apps.care_provider.models import ProfessionalLicense
for lic in ProfessionalLicense.objects.all():
    if lic.professional_license_year_granted and lic.professional_license_valid_until:
        if lic.professional_license_year_granted > lic.professional_license_valid_until:
            print(f"License {lic.pk}: year_granted ({lic.professional_license_year_granted}) > valid_until ({lic.professional_license_valid_until})")
    if lic.professional_license_valid_until and lic.professional_license_valid_until < datetime.date.today().year:
        print(f"License {lic.pk} '{lic.license_name}': EXPIRED (valid_until={lic.professional_license_valid_until})")

# Academic degree year validation
from apps.care_provider.models import AcademicDegree
current_year = datetime.date.today().year
for deg in AcademicDegree.objects.exclude(academic_degree_year_granted__isnull=True):
    if deg.academic_degree_year_granted > current_year:
        print(f"Degree {deg.pk}: Future year_granted ({deg.academic_degree_year_granted})")
    if deg.academic_degree_year_granted < current_year - 80:
        print(f"Degree {deg.pk}: Unreasonably old ({deg.academic_degree_year_granted})")
```

### Step 5: Business Rule Validation

```python
# 1. Unlicensed providers with active appointments
unlicensed_with_appts = CareProvider.objects.filter(is_licensed=False).filter(
    appointment__is_status="SCHEDULED"
).distinct()
print(f"Unlicensed providers with SCHEDULED appointments: {unlicensed_with_appts.count()}")

# 2. Completed appointments missing payment
from apps.calendar_functionality.enum import PaymentStatus
completed_no_payment = Appointment.objects.filter(
    is_status="COMPLETED",
    payment_status=PaymentStatus.PENDING,
    payment_intent_id__isnull=True,
)
print(f"COMPLETED appointments with no payment: {completed_no_payment.count()}")

# 3. Risk screening score consistency
for ur in UserResponse.objects.exclude(final_score__isnull=True):
    detail_sum = ResponseDetail.objects.filter(user_response=ur).aggregate(
        total=models.Sum("score")
    )["total"] or 0
    if ur.final_score != detail_sum:
        print(f"UserResponse {ur.response_id}: final_score={ur.final_score} != detail_sum={detail_sum}")

# 4. Crisis-flagged responses (is_severe=True)
severe_responses = UserResponse.objects.filter(is_severe=True)
print(f"Crisis-flagged risk screenings: {severe_responses.count()}")

# 5. Consent flags for active users
from apps.client.models import Client as ClientModel
clients_no_consent = ClientModel.objects.filter(
    user__is_active=True, tandc_consent=False
)
print(f"Active clients without T&C consent: {clients_no_consent.count()}")

users_no_agree = User.objects.filter(is_active=True, is_agree=False)
print(f"Active users without is_agree: {users_no_agree.count()}")
```

### Step 6: Generate Management Command

Create `Lumy-Backend/apps/utils/management/commands/check_data_integrity.py`:

```python
"""Management command to check data integrity across all models."""
import json
from django.core.management.base import BaseCommand
from django.db import models


class Command(BaseCommand):
    help = "Check data integrity across patient/provider models"

    def add_arguments(self, parser):
        parser.add_argument("--model", type=str, default="all",
            help="Check specific model: User, CareProvider, Appointment, Notes, UserResponse")
        parser.add_argument("--fix", action="store_true",
            help="Attempt safe auto-fixes (deactivate orphans, recalculate scores)")
        parser.add_argument("--verbose", action="store_true", help="Show individual record details")
        parser.add_argument("--output", type=str, choices=["text", "json"], default="text")

    def handle(self, *args, **options):
        findings = []
        # ... run all checks from Steps 1-5 above, collect findings
        # ... if --fix, apply safe remediation
        # ... output summary table + detailed report
        self.stdout.write(self.style.SUCCESS("Data integrity check complete."))
```

## Known Patterns & Gotchas

1. **Notes linked by room_name, NOT FK**: `video_conferencing.Notes` has a `room_name` CharField, not a ForeignKey to `Appointment`. The link is string-based: `Notes.room_name == Appointment.room_name`. This means orphan detection requires string matching, not FK joins.

2. **UUIDs as primary keys**: `User.id` is a `UUIDField(primary_key=True)`. When comparing PKs across models, always use UUID comparison, not string comparison.

3. **`UserResponse.response_id` is the PK**: Unlike other models, `UserResponse` uses `response_id = UUIDField(primary_key=True)`, not `id`.

4. **`CareProvider.save()` has side effects**: Creating a CareProvider auto-creates a ManagePages record and generates a profile_handle. The integrity check should account for these auto-created records.

5. **`Appointment.save()` auto-generates room_name**: If `room_name` is empty on save, it gets a new UUID. This means room_name is never null for saved records.

6. **M2M relationships are nullable**: Many CareProvider M2M fields (`modalities`, `my_role`, `client_needs`, etc.) allow blank/null. Empty M2M is not necessarily an integrity issue -- it may indicate incomplete onboarding (`step_counter` field).

7. **`PaymentStatus` is an IntegerField with choices**: Check `apps/calendar_functionality/enum.py` for the enum values (likely 0=PENDING, 1=AUTHORIZED, 2=COMPLETED, etc.).

8. **`BaseModel` has `is_active` flag**: The `authentication.BaseModel` includes `is_active = BooleanField(default=True)`. When checking for orphans, consider whether to include inactive records.

## Data Model & Accuracy Notes

1. **NPI is CharField, not IntegerField**: `CareProvider.npi_number` is `CharField(max_length=225)`, nullable (`null=True, blank=True`). Luhn validation must accept string input. Do NOT flag NULL or empty NPIs as invalid -- many providers have not yet submitted their NPI.

2. **ProfessionalLicense has NO FK to CareProvider**: The linkage is indirect: `CareProvider.credential_type` (FK to `CareProviderCredential`) -> `.professional_license` (M2M to `ProfessionalLicense`). Do NOT attempt `ProfessionalLicense.objects.filter(care_provider=...)`.

3. **Year fields are IntegerField, not DateField**: `academic_degree_year_granted`, `professional_license_year_granted`, `professional_license_valid_until`, `npi_year_granted`, `npi_valid_until` all store integer years (e.g., 2024). Compare with `datetime.date.today().year`, NOT with `datetime.date` objects.

4. **PHQ-9 item count**: A `UserResponse` linked to PHQ-9 flow should have exactly 9 `ResponseDetail` records. Validate: `ResponseDetail.objects.filter(user_response=ur).count() == 9`.

5. **Crisis follow-up obligation**: `UserResponse` records with `is_severe=True` should have a follow-up appointment within 48 hours OR a `ClientScreeningIgnore` record documenting the clinical decision not to follow up. Flag severe responses without either.

6. **PreLicensed supervisor completeness**: Both `supervisor_name` and `supervisor_license_number` must be populated for pre-licensed providers. A pre-licensed provider without supervisor information cannot practice.

7. **Risk screening score consistency**: `UserResponse.final_score` must equal the sum of all linked `ResponseDetail.score` values. The formula is: `final_score == SUM(ResponseDetail.score WHERE user_response=this)`.

## Example Invocations

```
/patient-data-integrity-check
/patient-data-integrity-check --model Appointment --verbose
/patient-data-integrity-check --model CareProvider --fix
/patient-data-integrity-check --output json
```
