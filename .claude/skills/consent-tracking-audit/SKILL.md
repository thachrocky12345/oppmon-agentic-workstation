---
name: consent-tracking-audit
description: Audit consent collection, storage, and enforcement across the platform for HIPAA and privacy law compliance. Use when asked to "audit consent", "check consent tracking", "GDPR compliance", "consent enforcement", "privacy audit", or "data subject rights".
argument-hint: [--scope inventory|enforcement|minors|data-rights|all] [--fix]
frequency: quarterly
---

# Consent Tracking Audit

## When to Use
- When verifying HIPAA consent requirements are met
- When implementing GDPR/CCPA data subject rights
- When auditing consent for minors/dependents
- When adding new features that require user consent
- When responding to data privacy audit findings
- Before production deployment of user-facing features

## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Database access for consent flag verification

## Known Consent Fields in Database

| Model | Field | Type | Location |
|---|---|---|---|
| `User` | `is_agree` | BooleanField(default=False) | `apps/authentication/models.py:121` |
| `Client` | `tandc_consent` | BooleanField(default=False) | `apps/client/models.py:9` |
| `CareProvider` | `agree_Credential_Status` | BooleanField(default=False) | `apps/care_provider/models.py:1059` |
| `User` | `parent_user` | FK to self | `apps/authentication/models.py:126` |
| `User` | `relationship` | CharField | `apps/authentication/models.py:134` |
| `User` | `is_primary_account` | BooleanField(default=True) | `apps/authentication/models.py:125` |
| `User` | `age_vulnerability_check` | BooleanField | `apps/authentication/models.py:122` |
| `AgeOfConsent` | `minimum_age`, `country`, `state` | Model | `apps/authentication/models.py:217` |

## Workflow

### Step 1: Consent Points Inventory

**Backend consent flags:**

```bash
# Find all consent-related fields in models
grep -rn --include="*.py" -i -E 'consent|agree|accept|terms|privacy|gdpr|opt_in|opt_out' \
  Lumy-Backend/apps/*/models.py --exclude-dir=__pycache__

# Find consent checks in views/mutations
grep -rn --include="*.py" -i -E 'is_agree|tandc_consent|agree_Credential_Status|consent' \
  Lumy-Backend/apps/*/views.py \
  Lumy-Backend/apps/*/mutations.py \
  Lumy-Backend/apps/*/serializers.py \
  --exclude-dir=__pycache__ 2>/dev/null

# Find AgeOfConsent model usage
grep -rn --include="*.py" 'AgeOfConsent\|age_of_consent\|minimum_age\|age_vulnerability' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations
```

**Frontend consent UI elements:**

```bash
# Find consent checkboxes, T&C links, consent modals
grep -rn --include="*.tsx" --include="*.ts" -i \
  -E 'consent|terms.*conditions|privacy.*policy|agree|accept.*terms|cookie.*banner|gdpr|opt.in|opt.out' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next

# Find form fields tied to consent
grep -rn --include="*.tsx" --include="*.ts" -i \
  -E 'is_agree|tandc_consent|agree_Credential|checkbox.*consent|checkbox.*agree' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next

# Find cookie consent implementation
grep -rn --include="*.tsx" --include="*.ts" -i 'cookie' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next \
  | grep -iv 'cookie.*parser\|set-cookie' | head -20
```

**Map consent points:**

```markdown
## Consent Points Map

| Consent Point | DB Field | Frontend UI | Backend Enforcement | Status |
|---|---|---|---|---|
| Terms & Conditions (Client) | `Client.tandc_consent` | [path/to/signup/component] | [view/mutation] | CHECK |
| User Agreement | `User.is_agree` | [path/to/agreement/form] | [view/mutation] | CHECK |
| Credential Status (Provider) | `CareProvider.agree_Credential_Status` | [path/to/onboarding/step] | [view] | CHECK |
| Video Recording Consent | MISSING | MISSING | MISSING | GAP |
| Clinical Notes Sharing | MISSING | MISSING | MISSING | GAP |
| Risk Screening Data Usage | MISSING | MISSING | MISSING | GAP |
| Cookie Consent | CHECK | CHECK | N/A | CHECK |
| Data Export Consent | MISSING | MISSING | MISSING | GAP |
| Marketing Communications | CHECK | CHECK | CHECK | CHECK |
```

### Step 2: Consent Enforcement Verification

```bash
# Check if backend enforces consent before critical actions

# Can a client book an appointment without tandc_consent?
grep -rn --include="*.py" -A 20 'class.*Appointment.*View\|def.*create.*appointment\|def.*book' \
  Lumy-Backend/apps/calendar_functionality/views.py \
  Lumy-Backend/apps/calendar_functionality/mutations.py \
  2>/dev/null \
  | grep -E 'tandc_consent|is_agree|consent'

# Can a provider accept clients without agree_Credential_Status?
grep -rn --include="*.py" -A 20 'class.*CareProvider.*View\|def.*activate.*provider' \
  Lumy-Backend/apps/care_provider/views.py \
  Lumy-Backend/apps/care_provider/mutations.py \
  2>/dev/null \
  | grep -E 'agree_Credential_Status|consent'

# Check if consent flags are checked in serializer validation
grep -rn --include="*.py" -A 10 'def validate' \
  Lumy-Backend/apps/authentication/serializers.py \
  Lumy-Backend/apps/client/serializers.py \
  Lumy-Backend/apps/care_provider/serializers.py \
  2>/dev/null \
  | grep -E 'consent|is_agree|agree'
```

**Django ORM checks:**

```python
from apps.authentication.models import User
from apps.client.models import Client
from apps.care_provider.models import CareProvider
from apps.calendar_functionality.models import Appointment

# Active clients who haven't consented to T&C
unconsented_active_clients = Client.objects.filter(
    user__is_active=True,
    tandc_consent=False
)
print(f"Active clients without T&C consent: {unconsented_active_clients.count()}")

# Active users who haven't agreed
unconsented_users = User.objects.filter(
    is_active=True,
    is_agree=False
).exclude(user_type="SUPERADMIN")
print(f"Active users without is_agree: {unconsented_users.count()}")

# Providers without credential status agreement
unconsented_providers = CareProvider.objects.filter(
    user__is_active=True,
    agree_Credential_Status=False
)
print(f"Active providers without credential agreement: {unconsented_providers.count()}")

# Appointments booked by unconsented clients
appts_by_unconsented = Appointment.objects.filter(
    client__tandc_consent=False,
    is_status="SCHEDULED"
)
print(f"SCHEDULED appointments by unconsented clients: {appts_by_unconsented.count()}")
```

### Step 3: Minor/Dependent Consent

```python
from apps.authentication.models import User, AgeOfConsent
import datetime

# Find users with parent_user set (dependent accounts)
dependents = User.objects.filter(parent_user__isnull=False)
print(f"Dependent user accounts: {dependents.count()}")

for dep in dependents:
    issues = []

    # Check parent exists and is active
    if not dep.parent_user.is_active:
        issues.append("Parent user is inactive")

    # Check relationship field
    if not dep.relationship:
        issues.append("Missing relationship field")

    # Check age of consent
    if dep.date_of_birth:
        age = (datetime.date.today() - dep.date_of_birth).days // 365
        # Look up jurisdiction-specific age of consent
        consent_record = AgeOfConsent.objects.filter(
            country_code=dep.country or '',
            state=dep.state or ''
        ).first()

        if consent_record:
            if age >= consent_record.minimum_age:
                issues.append(f"User is {age}, at/above age of consent ({consent_record.minimum_age}) -- may not need parent account")
        else:
            issues.append(f"No AgeOfConsent record for country={dep.country}, state={dep.state}")
    else:
        issues.append("Missing date_of_birth -- cannot verify age")

    # Check parent consent flag
    if not dep.parent_user.is_agree:
        issues.append("Parent has not agreed to terms (is_agree=False)")

    if issues:
        print(f"Dependent user {dep.id} (parent={dep.parent_user.id}):")
        for issue in issues:
            print(f"  - {issue}")

# Check age_vulnerability_check usage
vulnerable_users = User.objects.filter(age_vulnerability_check=True)
print(f"Users flagged age_vulnerability_check: {vulnerable_users.count()}")
```

### Step 4: Data Subject Rights (GDPR/CCPA)

**Right to Access (data export):**

```bash
# Check for data export endpoint
grep -rn --include="*.py" -i -E 'export.*data|data.*export|download.*data|data.*download|data.*portability' \
  Lumy-Backend/apps/*/views.py \
  Lumy-Backend/apps/*/urls.py \
  --exclude-dir=__pycache__ 2>/dev/null

# Check for export functionality in frontend
grep -rn --include="*.tsx" --include="*.ts" -i 'export.*data\|download.*data\|data.*export' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next
```

**Right to Deletion:**

```bash
# Check for account deletion endpoint
grep -rn --include="*.py" -i -E 'delete.*account|account.*delete|deactivate.*user|remove.*user' \
  Lumy-Backend/apps/authentication/views.py \
  Lumy-Backend/apps/authentication/mutations.py \
  Lumy-Backend/apps/authentication/urls.py \
  --exclude-dir=__pycache__ 2>/dev/null

# Check if deletion cascades correctly
grep -rn --include="*.py" 'on_delete=models\.CASCADE' \
  Lumy-Backend/apps/client/models.py \
  Lumy-Backend/apps/care_provider/models.py \
  Lumy-Backend/apps/calendar_functionality/models.py \
  Lumy-Backend/apps/video_conferencing/models.py \
  Lumy-Backend/apps/risk_screening/models.py \
  Lumy-Backend/apps/stripe_integration/models.py
```

**Right to Rectification:**

```bash
# Check if users can edit their own data
grep -rn --include="*.py" -i -E 'update.*profile|edit.*profile|patch|put' \
  Lumy-Backend/apps/authentication/views.py \
  Lumy-Backend/apps/care_provider/views.py \
  --exclude-dir=__pycache__ 2>/dev/null
```

**Generate data rights compliance map:**

```markdown
## Data Subject Rights Compliance

| Right | Endpoint | UI | Status |
|---|---|---|---|
| Access (export all data) | CHECK | CHECK | LIKELY MISSING |
| Deletion (delete account + cascade) | CHECK | CHECK | CHECK |
| Rectification (edit own data) | CHECK | CHECK | CHECK |
| Portability (machine-readable export) | CHECK | CHECK | LIKELY MISSING |
| Restrict Processing | CHECK | CHECK | LIKELY MISSING |
| Object to Processing | CHECK | CHECK | LIKELY MISSING |
| Withdraw Consent | CHECK | CHECK | CHECK |
```

### Step 5: Consent Withdrawal Flow

```bash
# Check if consent can be withdrawn and what happens
grep -rn --include="*.py" -i -E 'withdraw.*consent|revoke.*consent|remove.*consent|consent.*false' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=tests --exclude-dir=migrations

# Check if setting consent to False cascades (anonymize associated data)
grep -rn --include="*.py" -A 10 'tandc_consent\|is_agree' \
  Lumy-Backend/apps/*/signals.py \
  Lumy-Backend/apps/*/views.py \
  --exclude-dir=__pycache__ 2>/dev/null
```

### Step 6: Generate Consent Map Report

```markdown
# Consent Tracking Audit Report -- [DATE]

## Consent Points Inventory

### Implemented
| Point | DB Field | UI Path | Backend Check | Notes |
|---|---|---|---|---|
| User Agreement | `User.is_agree` | /signup | ... | ... |
| Client T&C | `Client.tandc_consent` | /signup | ... | ... |
| Provider Credentials | `CareProvider.agree_Credential_Status` | /onboarding | ... | ... |

### Missing (Gaps)
| Consent Point | Regulatory Basis | Impact | Priority |
|---|---|---|---|
| Video recording consent | HIPAA 164.508 | Patients not consenting to session recording | HIGH |
| Clinical notes sharing | HIPAA 164.508 | Notes shared without explicit consent | HIGH |
| Risk screening data usage | HIPAA 164.508 | Crisis data used without consent | HIGH |
| Data retention consent | GDPR Art.6 | Data kept without legal basis | MEDIUM |
| Analytics/Mixpanel consent | GDPR Art.6 / ePrivacy | Behavioral tracking without consent | MEDIUM |
| Cookie consent | ePrivacy Directive | Cookies set without consent | LOW |

## Enforcement Status
| Check | Result | Evidence |
|---|---|---|
| Booking requires T&C consent | CHECK | [view/mutation path] |
| Provider activation requires credential agreement | CHECK | [view/mutation path] |
| Minor accounts require parent consent | CHECK | `parent_user` FK check |
| Consent withdrawal deletes/anonymizes data | CHECK | [signal/view path] |
```

## Known Patterns & Gotchas

1. **`User.is_agree` vs `Client.tandc_consent`**: These are SEPARATE consent flags on different models. A user can have `is_agree=True` but their Client record can have `tandc_consent=False`. Both need to be checked for full consent coverage.

2. **`parent_user` is CASCADE delete**: At `apps/authentication/models.py:128`, deleting a parent User cascades to delete child Users. This means deleting a guardian account deletes the minor's account. This may or may not be desired behavior.

3. **`AgeOfConsent` model**: At `apps/authentication/models.py:217`, this model stores jurisdiction-specific minimum ages. It uses `default=timezone.now` for timestamps (not `auto_now_add`), so fixture loading works normally.

4. **Mixpanel tracking**: The frontend has extensive Mixpanel event tracking in `RG-Frontend/src/mixPanelEvents/`. This behavioral tracking likely requires cookie/analytics consent under GDPR. Categories tracked: auth, navigation, pages, careProvider, appointments, payments, certn, client, bookings, signupJourney, navigationAnalytics, searchAnalytics.

5. **`relationship_file_document` field**: `User.relationship_file_document` (CharField, max_length=255) stores a file path/reference for relationship documentation (e.g., guardianship papers). This is sensitive identity verification data that requires consent to collect and store.

6. **No consent versioning**: There is no mechanism to track WHICH version of T&C/privacy policy was consented to. If terms change, there is no way to identify which users consented to the old vs new version. This requires a consent timestamp and terms version field.

## Data Model & Accuracy Notes

1. **`Client.tandc_consent` and `User.is_agree` are SEPARATE consent fields**: These exist on DIFFERENT models. A user can have `is_agree=True` but their linked Client record can have `tandc_consent=False`. Both must be independently checked and enforced. Do not assume one implies the other.

2. **`User.age_vulnerability_check`**: At `apps/authentication/models.py:122`, this boolean field is consent-related and must be included in consent tracking. It flags users who have been identified as potentially vulnerable due to age.

3. **No dedicated consent audit trail model**: The platform has no model that records WHEN consent was given, WHICH version of terms was consented to, or WHO witnessed the consent. The only timestamp available is `created_at` from `BaseModel`, which records record creation, not consent acceptance. This is a significant compliance gap.

4. **NPP delivery at signup (HIPAA 164.520)**: HIPAA requires delivery of a Notice of Privacy Practices at first service. Verify that a consent timestamp is tied to the privacy notice version, and that the notice is presented before any PHI is collected.

5. **Minor consent with jurisdiction-specific carve-outs (HIPAA 164.502(g)(3))**: A single global age-of-majority (18) is insufficient. State-specific carve-outs apply: CA 12+, IL 12+, OR 14+ for mental health services. Records created under minor self-consent must be withheld from the parent account, even though the `parent_user` FK exists.

6. **Telehealth-specific informed consent**: State-specific telehealth consent requirements include acknowledgment of: video recording capability, technology limitations, emergency protocols, provider licensure jurisdiction, and backup communication methods.

7. **Risk screening data consent**: Specific consent is needed for how suicidality/crisis data is used, stored, and who can access it. This is separate from general T&C consent.

8. **Right of access (164.524)**: 30-day deadline to fulfill. Verify an export mechanism exists and can produce a complete record within the deadline.

9. **Amendment rights (164.526)**: 60-day deadline to process amendment requests. Verify the platform has a mechanism for users to request corrections to their records.

10. **Accounting of disclosures (164.528)**: Must cover 6 years of non-TPO (Treatment, Payment, Operations) disclosures. Requires a disclosure log model that does not currently exist.

11. **GDPR DSR (if serving non-US clients)**: Right to erasure (Art. 17), data portability (Art. 20), restriction of processing (Art. 18). These require dedicated API endpoints and administrative workflows that are currently absent.

## Example Invocations

```
/consent-tracking-audit
/consent-tracking-audit --scope inventory
/consent-tracking-audit --scope enforcement
/consent-tracking-audit --scope minors
/consent-tracking-audit --scope data-rights
/consent-tracking-audit --scope all --fix
```
