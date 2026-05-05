---
name: credential-verification-workflow
description: Validate provider credentials (licenses, certifications, NPI, degrees) against business rules and external validation patterns. Use when asked to "validate credentials", "check NPI", "verify license", "audit provider credentials", or "credential completeness".
argument-hint: [--provider-id UUID] [--check npi|license|certificate|degree|pre-licensed|score|all] [--fix-scores] [--report-format markdown|json]
frequency: quarterly
---

# Credential Verification Workflow

## When to Use
- During provider onboarding to validate submitted credentials
- As a scheduled task to flag expired licenses/certificates
- When auditing provider data quality
- Before enabling a provider for appointments (is_licensed check)
- When investigating discrepancies in CareProviderScore values

## Prerequisites
- Database accessible with CareProvider data
- Understanding of credential models in `apps/care_provider/models.py`

## Credential Model Map

```
CareProvider (apps.care_provider.models)
  |-- npi_number (CharField, max_length=50)
  |-- npi_year_granted (IntegerField)
  |-- npi_valid_until (IntegerField)
  |-- liability_insurance_carrier (CharField)
  |-- insurance_policy_number (CharField)
  |-- is_licensed (BooleanField)
  |-- credential_type --> CareProviderCredential
  |       |-- M2M --> ProfessionalLicense
  |       |-- M2M --> ProfessionalCertificate
  |       |-- M2M --> AcademicDegree
  |       |-- M2M --> ProfessionalMembership
  |       |-- M2M --> PreLicensed
  |       |-- M2M --> CredentialType
  |-- OneToOne --> CareProviderScore
  |       |-- is_talknow_score (FloatField)
  |       |-- amount_of_availability_score (FloatField)
  |       |-- professional_experience_score (FloatField)
  |       |-- total_licensed_certified_score (FloatField)
  |       |-- overall_score (FloatField)
```

### ProfessionalLicense fields
- `license_name` (CharField, max_length=500)
- `credential_abbreviation` (CharField, max_length=500)
- `issuing_organization` (CharField, max_length=500)
- `license_number` (CharField, max_length=500)
- `professional_license_year_granted` (IntegerField)
- `professional_license_valid_until` (IntegerField)
- `state` (CharField, max_length=50)
- `country` (CharField, max_length=50)

### ProfessionalCertificate fields
- `issuing_organization` (FK to IssuingOrganization)
- `certificate_level` (FK to CertificateLevel)
- `certificate_number` (CharField)
- `certificate_name` (CharField)
- `professional_certificate_year_granted` (IntegerField)
- `professional_certificate_valid_until` (IntegerField)

### AcademicDegree fields
- `care_provider` (FK to CareProvider)
- `degree_type` (CharField)
- `degree_name` (CharField)
- `degree_granting_institution` (CharField)
- `academic_degree_year_granted` (IntegerField)
- `academic_degree_valid_until` (IntegerField)

### PreLicensed fields
- `supervisor_name` (CharField)
- `supervisor_license_number` (CharField)
- `role` (CharField)
- `year_granted` (IntegerField)
- `anticipated_completion_date` (DateField)
- `state`, `country` (CharField)
- `credential_abbreviation` (CharField)

## Workflow

### Step 1: NPI Validation

```python
import datetime

def validate_npi_luhn(npi_str):
    """
    Validate NPI using the Luhn algorithm.
    NPI is 10 digits. For individual providers, starts with 1 or 2.
    Luhn check uses prefix "80840" before the NPI.
    """
    if not npi_str or not isinstance(npi_str, str):
        return False, "NPI is empty or not a string"

    npi_str = npi_str.strip()
    if len(npi_str) != 10:
        return False, f"NPI must be 10 digits, got {len(npi_str)}"
    if not npi_str.isdigit():
        return False, "NPI must be all digits"
    if npi_str[0] not in ('1', '2'):
        return False, f"Individual NPI must start with 1 or 2, got {npi_str[0]}"

    # Luhn check with 80840 prefix
    full = "80840" + npi_str
    digits = [int(d) for d in full]
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2 == 1:
            doubled = d * 2
            total += doubled - 9 if doubled > 9 else doubled
        else:
            total += d

    if total % 10 != 0:
        return False, "NPI fails Luhn check digit validation"
    return True, "Valid"


def validate_npi_dates(care_provider):
    """Check NPI date range validity."""
    issues = []
    if care_provider.npi_year_granted and care_provider.npi_valid_until:
        if care_provider.npi_year_granted > care_provider.npi_valid_until:
            issues.append(f"npi_year_granted ({care_provider.npi_year_granted}) > npi_valid_until ({care_provider.npi_valid_until})")
    if care_provider.npi_valid_until:
        if care_provider.npi_valid_until < datetime.date.today().year:
            issues.append(f"NPI expired (valid_until={care_provider.npi_valid_until})")
    return issues


# Run validation
from apps.care_provider.models import CareProvider

for cp in CareProvider.objects.exclude(npi_number__isnull=True).exclude(npi_number=""):
    valid, msg = validate_npi_luhn(cp.npi_number)
    date_issues = validate_npi_dates(cp)
    if not valid or date_issues:
        print(f"Provider {cp.pk} ({cp.user.email}): NPI={cp.npi_number}")
        if not valid:
            print(f"  Format: {msg}")
        for issue in date_issues:
            print(f"  Date: {issue}")
```

### Step 2: License Validation

```python
from apps.care_provider.models import ProfessionalLicense, CareProviderCredential
import datetime

current_year = datetime.date.today().year

# State-specific license number format patterns
LICENSE_PATTERNS = {
    'CA': r'^(LMFT|MFT|LCSW|LPCC|PSY)\d{4,6}$',
    'NY': r'^\d{6}-\d$',
    'TX': r'^\d{4,6}$',
    'FL': r'^(MT|MH|SW|MM)\d{4,6}$',
}

for lic in ProfessionalLicense.objects.all():
    issues = []

    # Date validation
    if lic.professional_license_year_granted and lic.professional_license_valid_until:
        if lic.professional_license_year_granted > lic.professional_license_valid_until:
            issues.append(f"year_granted ({lic.professional_license_year_granted}) > valid_until ({lic.professional_license_valid_until})")

    # Expiration check
    if lic.professional_license_valid_until and lic.professional_license_valid_until < current_year:
        issues.append(f"EXPIRED (valid_until={lic.professional_license_valid_until})")

    # Format validation (if state pattern known)
    if lic.state and lic.state in LICENSE_PATTERNS and lic.license_number:
        import re
        if not re.match(LICENSE_PATTERNS[lic.state], lic.license_number):
            issues.append(f"License number '{lic.license_number}' doesn't match {lic.state} pattern")

    if issues:
        print(f"License {lic.pk} '{lic.license_name}' ({lic.state}):")
        for issue in issues:
            print(f"  {issue}")
```

### Step 3: Certificate Validation

```python
from apps.care_provider.models import ProfessionalCertificate

for cert in ProfessionalCertificate.objects.select_related('issuing_organization', 'certificate_level'):
    issues = []

    if cert.professional_certificate_year_granted and cert.professional_certificate_valid_until:
        if cert.professional_certificate_year_granted > cert.professional_certificate_valid_until:
            issues.append(f"year_granted > valid_until")

    if cert.professional_certificate_valid_until and cert.professional_certificate_valid_until < current_year:
        issues.append(f"EXPIRED (valid_until={cert.professional_certificate_valid_until})")

    # CertificateLevel FK consistency
    if cert.certificate_level and cert.issuing_organization:
        if cert.certificate_level.issuing_organization_id != cert.issuing_organization_id:
            issues.append(f"CertificateLevel issuing_org mismatch: level points to {cert.certificate_level.issuing_organization_id}, cert points to {cert.issuing_organization_id}")

    if issues:
        print(f"Certificate {cert.pk} '{cert.certificate_name}':")
        for issue in issues:
            print(f"  {issue}")
```

### Step 4: Academic Degree Validation

```python
from apps.care_provider.models import AcademicDegree

for deg in AcademicDegree.objects.all():
    issues = []

    if deg.academic_degree_year_granted:
        if deg.academic_degree_year_granted > current_year:
            issues.append(f"Future year_granted ({deg.academic_degree_year_granted})")
        if deg.academic_degree_year_granted < current_year - 80:
            issues.append(f"Unreasonably old ({deg.academic_degree_year_granted})")

    if deg.academic_degree_valid_until and deg.academic_degree_year_granted:
        if deg.academic_degree_year_granted > deg.academic_degree_valid_until:
            issues.append(f"year_granted > valid_until")

    if issues:
        print(f"Degree {deg.pk} '{deg.degree_type}' from '{deg.degree_granting_institution}':")
        for issue in issues:
            print(f"  {issue}")
```

### Step 5: Pre-Licensed Provider Rules

```python
from apps.care_provider.models import PreLicensed
import datetime

for pre in PreLicensed.objects.all():
    issues = []

    if not pre.supervisor_name:
        issues.append("Missing supervisor_name")
    if not pre.supervisor_license_number:
        issues.append("Missing supervisor_license_number")
    if pre.anticipated_completion_date and pre.anticipated_completion_date < datetime.date.today():
        issues.append(f"anticipated_completion_date is in the past ({pre.anticipated_completion_date})")

    if issues:
        print(f"PreLicensed {pre.pk} (role={pre.role}):")
        for issue in issues:
            print(f"  {issue}")

# Cross-check: providers marked as pre-licensed should have is_licensed=False
# This requires checking the CareProviderCredential M2M
```

### Step 6: CareProviderScore Consistency

```python
from apps.care_provider.models import CareProvider, CareProviderScore

# Find providers without scores
providers_without_scores = CareProvider.objects.exclude(
    pk__in=CareProviderScore.objects.values_list('care_provider_id', flat=True)
)
print(f"Providers without CareProviderScore: {providers_without_scores.count()}")

# Check score ranges
for score in CareProviderScore.objects.all():
    issues = []
    for field in ['is_talknow_score', 'amount_of_availability_score',
                  'professional_experience_score', 'total_licensed_certified_score', 'overall_score']:
        val = getattr(score, field)
        if val < 0:
            issues.append(f"{field} is negative ({val})")
        if val > 100:
            issues.append(f"{field} exceeds 100 ({val})")

    if issues:
        print(f"CareProviderScore for provider {score.care_provider_id}:")
        for issue in issues:
            print(f"  {issue}")
```

### Step 7: Generate management command

Create `Lumy-Backend/apps/care_provider/management/commands/validate_credentials.py`:

```python
"""Management command to validate all provider credentials."""
import datetime
import json
from django.core.management.base import BaseCommand
from apps.care_provider.models import (
    CareProvider, ProfessionalLicense, ProfessionalCertificate,
    AcademicDegree, PreLicensed, CareProviderScore,
)


class Command(BaseCommand):
    help = "Validate provider credentials against business rules"

    def add_arguments(self, parser):
        parser.add_argument('--provider-id', type=str, help="Validate single provider by UUID")
        parser.add_argument('--fix-scores', action='store_true', help="Recalculate CareProviderScore values")
        parser.add_argument('--report-format', choices=['json', 'markdown'], default='markdown')

    def handle(self, *args, **options):
        findings = []
        # ... run all validations from Steps 1-6
        # ... format output per --report-format
        self.stdout.write(self.style.SUCCESS("Credential validation complete."))
```

## Known Patterns & Gotchas

1. **Year fields are IntegerField, not DateField**: `npi_year_granted`, `npi_valid_until`, `professional_license_year_granted`, `professional_license_valid_until`, `academic_degree_year_granted`, `academic_degree_valid_until` are all `IntegerField` storing just the year (e.g., 2024), not full dates. Compare against `datetime.date.today().year`.

2. **`PreLicensed.anticipated_completion_date` IS a DateField**: Unlike the year-only IntegerFields on other credentials, `PreLicensed.anticipated_completion_date` is an actual `DateField`. Compare against `datetime.date.today()`.

3. **CareProviderCredential is a M2M hub**: `CareProviderCredential` has M2M to `ProfessionalLicense`, `ProfessionalCertificate`, `AcademicDegree`, `ProfessionalMembership`, `PreLicensed`, and `CredentialType`. A single CareProvider's `credential_type` FK points to one CareProviderCredential which fans out to all credential records.

4. **`CareProvider.save()` auto-creates ManagePages**: Creating or saving a CareProvider triggers `make_profile_handle()` and `ManagePages.objects.create()` via the overridden `save()` method at `Lumy-Backend/apps/care_provider/models.py:1253`. The `validate_credentials` command should be read-only by default and only write when `--fix-scores` is used.

5. **SterlingScreening model**: Background check results are stored in `care_provider.SterlingScreening` with fields: `screening_id`, `package_id`, `candidate_id`, `verification_status`, `verification_link`. The `isSterlingVerified` boolean on CareProvider should match the screening status.

6. **NPI format varies**: While the standard NPI is 10 digits, the `npi_number` field is `CharField(max_length=50)`, meaning it could contain spaces, dashes, or other formatting. Strip and normalize before Luhn validation.

## Data Model & Accuracy Notes

1. **Year fields are IntegerField, NOT DateField**: `professional_license_year_granted`, `professional_license_valid_until`, `academic_degree_year_granted`, `academic_degree_valid_until`, `npi_year_granted`, `npi_valid_until` are all `IntegerField` storing just the year (e.g., 2024). Compare against `datetime.date.today().year` (integer), not against `datetime.date` objects.

2. **`PreLicensed.anticipated_completion_date` IS a DateField**: Unlike the year-only IntegerFields on other credential models, `PreLicensed.anticipated_completion_date` is an actual `DateField`. Compare against `datetime.date.today()`.

3. **`certificate_number` and `license_number` are nullable CharFields**: Both fields allow `null=True, blank=True`. Do NOT flag NULL values as validation failures -- they indicate incomplete data entry, not invalid data.

4. **Credential linkage is through M2M hub**: `CareProvider.credential_type` (FK to `CareProviderCredential`) -> `.professional_license` (M2M), `.professional_certificate` (M2M), `.academic_degree` (M2M), `.pre_licensed` (M2M). There is NO direct FK from any credential model back to CareProvider (except `AcademicDegree.care_provider`).

5. **Cross-state licensure verification**: For telehealth, the provider must hold a valid license in the CLIENT's state, not just their own state. At booking time, verify `ProfessionalLicense.state` includes the client's state of residence.

6. **PSYPACT / NLC compacts**: Some license types participate in interstate compacts (e.g., PSYPACT for psychologists, Nurse Licensure Compact). Providers with compact-eligible licenses can practice across member states without individual state licenses. Check if the provider's license type and state are compact members.

7. **NPI Type 1 vs Type 2**: Individual providers should use Type 1 NPI (prefix digit `1`). Type 2 NPIs (prefix digit `2`) are for organizational providers. Validate that individual CareProvider records use Type 1.

8. **Expired credential scenarios to flag**: (a) Expired NPI (valid_until < current year), (b) Expired license with SCHEDULED appointments, (c) Pre-licensed provider without both `supervisor_name` and `supervisor_license_number`, (d) Unlicensed provider (`is_licensed=False`) with active SCHEDULED appointments.

## Example Invocations

```
/credential-verification-workflow
/credential-verification-workflow --provider-id abc123-def456
/credential-verification-workflow --check npi --report-format json
/credential-verification-workflow --check all --fix-scores
/credential-verification-workflow --check license
```
