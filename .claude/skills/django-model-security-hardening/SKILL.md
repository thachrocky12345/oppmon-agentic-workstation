---
name: django-model-security-hardening
description: Apply security hardening patterns to Django models handling sensitive healthcare data. Use when asked to "harden models", "encrypt fields", "add audit logging", "soft delete", "data retention", or "model security".
argument-hint: [--action encrypt|audit-log|soft-delete|retention|query-restrict|signals|all] [--model Notes|UserResponse|User|CareProvider|Appointment|all]
frequency: on-demand
---

# Django Model Security Hardening

## When to Use
- When implementing HIPAA compliance for data at rest
- When adding audit trail requirements
- When implementing data retention policies
- When hardening models before production deployment
- When responding to security audit findings

## Prerequisites
- `Lumy-Backend/` Python environment
- Database migration capability (Docker or local)
- Understanding of which models contain Tier 1/2 data

## Target Models (Tier 1 PHI)

| Model | App | File | Critical Fields |
|---|---|---|---|
| `Notes` | `video_conferencing` | `apps/video_conferencing/models.py:29` | `notes` (TextField) |
| `UserResponse` | `risk_screening` | `apps/risk_screening/models.py:72` | `final_score`, `final_keywords` (JSONField), `is_severe` |
| `ResponseDetail` | `risk_screening` | `apps/risk_screening/models.py:83` | `score`, `keywords`, `is_severe` |
| `Appointment` | `calendar_functionality` | `apps/calendar_functionality/models.py:67` | `reason` (TextField) |
| `Session` | `calendar_functionality` | `apps/calendar_functionality/models.py:124` | `issues`, `summary_of_issue` |

## Target Models (Tier 2 PII)

| Model | App | Critical Fields |
|---|---|---|
| `User` | `authentication` | `google_token`, `microsoft_token`, `google_refresh_token`, `microsoft_refresh_token`, `email`, `phone_number`, `date_of_birth`, `street_address`, `latitude`, `longitude` |
| `CareProvider` | `care_provider` | `npi_number`, `insurance_policy_number`, `stripe_customer_id` |
| `ProfessionalLicense` | `care_provider` | `license_number` |
| `InPersonLocation` | `care_provider` | `address_line_1`, `latitude`, `longitude` |
| `StripeUser` | `stripe_integration` | `stripe_customer_id`, `customer_email`, `paypal_user_id` |

## Workflow

### Step 1: Field-Level Encryption

**Recommended library**: `django-encrypted-model-fields` or `django-fernet-fields`

```bash
pip install django-encrypted-model-fields
# Add to requirements.txt
```

**Add to settings.py:**
```python
INSTALLED_APPS = [
    ...
    'encrypted_model_fields',
]

# Encryption key (MUST be in environment, NOT hardcoded)
FIELD_ENCRYPTION_KEY = os.environ.get('FIELD_ENCRYPTION_KEY', '')
```

**Migration strategy** (per field, non-destructive):

1. Add encrypted field alongside plaintext field:
```python
# In models.py
from encrypted_model_fields.fields import EncryptedTextField, EncryptedCharField

class Notes(BaseModel):
    care_provider = models.ForeignKey(CareProvider, on_delete=models.CASCADE, null=True, blank=True)
    notes = models.TextField()                          # EXISTING - keep during migration
    notes_encrypted = EncryptedTextField(blank=True, default="")  # NEW
    room_name = models.CharField(max_length=100)
    date = models.DateTimeField(auto_now_add=True)
```

2. Create and run migration:
```bash
python manage.py makemigrations video_conferencing
python manage.py migrate
```

3. Backfill encrypted field:
```python
# Management command: backfill_encrypted_notes
from apps.video_conferencing.models import Notes

for note in Notes.objects.all():
    note.notes_encrypted = note.notes
    note.save(update_fields=['notes_encrypted'])
```

4. Update all reads to use encrypted field
5. Drop plaintext field and rename encrypted field

**Fields to encrypt (priority order):**

| Priority | Field | Model | Encryption Type |
|---|---|---|---|
| 1 | `google_token` | `User` | `EncryptedTextField` |
| 1 | `microsoft_token` | `User` | `EncryptedTextField` |
| 1 | `google_refresh_token` | `User` | `EncryptedTextField` |
| 1 | `microsoft_refresh_token` | `User` | `EncryptedTextField` |
| 2 | `notes` | `Notes` | `EncryptedTextField` |
| 2 | `final_keywords` | `UserResponse` | Encrypt JSONField (custom) |
| 3 | `npi_number` | `CareProvider` | `EncryptedCharField` |
| 3 | `insurance_policy_number` | `CareProvider` | `EncryptedCharField` |
| 3 | `license_number` | `ProfessionalLicense` | `EncryptedCharField` |

### Step 2: Audit Logging

**Recommended library**: `django-auditlog`

```bash
pip install django-auditlog
```

**Add to settings.py:**
```python
INSTALLED_APPS = [
    ...
    'auditlog',
]

MIDDLEWARE = [
    ...
    'auditlog.middleware.AuditlogMiddleware',
]
```

**Register models for auditing:**

Create `Lumy-Backend/apps/utils/audit_config.py`:

```python
"""Register PHI/PII models for audit logging."""
from auditlog.registry import auditlog

from apps.video_conferencing.models import Notes
from apps.risk_screening.models import UserResponse, ResponseDetail
from apps.calendar_functionality.models import Appointment, Session
from apps.authentication.models import User
from apps.care_provider.models import CareProvider

# Tier 1: Full audit (all fields, all operations)
auditlog.register(Notes)
auditlog.register(UserResponse)
auditlog.register(ResponseDetail)

# Tier 2: Track access and modifications
auditlog.register(Appointment, exclude_fields=['modified_at', 'six_hr_reminder_sent', 'six_hr_reminder_sent_at'])
auditlog.register(Session)
auditlog.register(User, exclude_fields=['last_login', 'modified_at', 'keep_me_signed_in'])
auditlog.register(CareProvider, exclude_fields=['modified_at', 'step_counter'])
```

Import in AppConfig ready():
```python
# In apps/utils/apps.py or a suitable app's apps.py
class UtilsConfig(AppConfig):
    name = 'apps.utils'

    def ready(self):
        import apps.utils.audit_config  # noqa
```

Run migration:
```bash
python manage.py migrate auditlog
```

### Step 3: Soft Delete

**Check current deletion patterns:**

```bash
# Find hard delete calls on PHI models
grep -rn --include="*.py" -E '\.(delete|objects\.filter.*\.delete)\(' \
  Lumy-Backend/apps/video_conferencing/ \
  Lumy-Backend/apps/risk_screening/ \
  Lumy-Backend/apps/calendar_functionality/ \
  Lumy-Backend/apps/authentication/ \
  Lumy-Backend/apps/care_provider/ \
  --exclude-dir=__pycache__ --exclude-dir=tests --exclude-dir=migrations
```

**Verify `is_active` flag usage:**

All models inheriting from `authentication.BaseModel` already have `is_active = BooleanField(default=True)`. Verify it is used for soft delete:

```bash
# Check if views/queries filter by is_active
grep -rn --include="*.py" 'is_active' \
  Lumy-Backend/apps/video_conferencing/views.py \
  Lumy-Backend/apps/risk_screening/views.py \
  Lumy-Backend/apps/calendar_functionality/views.py \
  Lumy-Backend/apps/authentication/views.py \
  Lumy-Backend/apps/care_provider/views.py \
  2>/dev/null
```

**Note**: `risk_screening.BaseModel` (at `Lumy-Backend/apps/risk_screening/models.py:6`) does NOT have `is_active` -- it only has `created_at` and `modified_at`. `UserResponse` inherits from this, not from `authentication.BaseModel`. The `UserResponse` has its own `is_screening_ignored` field but no `is_active`.

**Recommendation**: Add soft-delete mixin:

```python
class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)

class SoftDeleteMixin(models.Model):
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(
        'authentication.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+'
    )

    objects = SoftDeleteManager()
    all_objects = models.Manager()  # Includes deleted records

    def soft_delete(self, user=None):
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.save(update_fields=['is_deleted', 'deleted_at', 'deleted_by'])

    class Meta:
        abstract = True
```

### Step 4: Data Retention

HIPAA requires minimum 7-year retention for medical records.

```python
"""Management command to identify records past retention period."""
import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone


# Retention periods (in years)
RETENTION_PERIODS = {
    'video_conferencing.Notes': 7,
    'risk_screening.UserResponse': 7,
    'risk_screening.ResponseDetail': 7,
    'calendar_functionality.Appointment': 7,
    'calendar_functionality.Session': 7,
    'stripe_integration.StripeUser': 7,
    'authentication.User': 7,  # After account deletion request
}


class Command(BaseCommand):
    help = "Identify records past data retention period"

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', default=True)
        parser.add_argument('--anonymize', action='store_true',
            help="Anonymize PII in records past retention (DO NOT delete)")

    def handle(self, *args, **options):
        from apps.video_conferencing.models import Notes
        from apps.risk_screening.models import UserResponse
        from apps.calendar_functionality.models import Appointment

        cutoff_7yr = timezone.now() - datetime.timedelta(days=365 * 7)

        # Notes past retention
        old_notes = Notes.objects.filter(date__lt=cutoff_7yr)
        self.stdout.write(f"Notes past 7-year retention: {old_notes.count()}")

        # UserResponses past retention
        old_responses = UserResponse.objects.filter(created_at__lt=cutoff_7yr)
        self.stdout.write(f"UserResponses past 7-year retention: {old_responses.count()}")

        # Appointments past retention
        old_appts = Appointment.objects.filter(created_at__lt=cutoff_7yr)
        self.stdout.write(f"Appointments past 7-year retention: {old_appts.count()}")

        if options['anonymize'] and not options['dry_run']:
            # Anonymization: replace PII with hashed values
            for note in old_notes:
                note.notes = "[REDACTED - retention period exceeded]"
                note.save(update_fields=['notes'])
            self.stdout.write(self.style.SUCCESS("Anonymization complete"))
```

### Step 5: Query Restrictions

Create ownership-filtered managers:

```python
# Lumy-Backend/apps/video_conferencing/managers.py

from django.db import models


class NotesManager(models.Manager):
    """Manager that requires ownership filter for PHI queries."""

    def for_provider(self, care_provider):
        """Get notes for a specific care provider."""
        return self.get_queryset().filter(care_provider=care_provider)

    def for_room(self, room_name):
        """Get notes for a specific room/appointment."""
        return self.get_queryset().filter(room_name=room_name)

    def all(self):
        """Override all() to warn about unfiltered PHI access."""
        import warnings
        warnings.warn(
            "Notes.objects.all() retrieves ALL clinical notes without ownership filter. "
            "Use Notes.objects.for_provider(cp) or Notes.objects.for_room(room) instead.",
            UserWarning, stacklevel=2
        )
        return super().all()
```

### Step 6: Signal-Based Protections

```python
# Lumy-Backend/apps/utils/security_signals.py

from django.db.models.signals import pre_save, post_save, pre_delete
from django.dispatch import receiver
import logging

logger = logging.getLogger('security.phi')


@receiver(pre_save, sender='video_conferencing.Notes')
def sanitize_clinical_notes(sender, instance, **kwargs):
    """Strip HTML/scripts from clinical notes before saving."""
    if instance.notes:
        import re
        # Remove script tags
        instance.notes = re.sub(r'<script[^>]*>.*?</script>', '', instance.notes, flags=re.DOTALL | re.IGNORECASE)
        # Remove HTML tags (preserve text content)
        instance.notes = re.sub(r'<[^>]+>', '', instance.notes)


@receiver(post_save, sender='risk_screening.UserResponse')
def alert_on_severe_screening(sender, instance, created, **kwargs):
    """Log alert when a severe risk screening is recorded."""
    if instance.is_severe:
        logger.critical(
            f"CRISIS ALERT: Severe risk screening recorded. "
            f"response_id={instance.response_id}, "
            f"user_id={instance.user_id}, "
            f"final_score={instance.final_score}"
        )
        # TODO: Trigger crisis notification workflow
        # This should notify: clinical supervisor, on-call provider


@receiver(pre_delete, sender='video_conferencing.Notes')
def log_phi_deletion(sender, instance, **kwargs):
    """Log when PHI records are about to be deleted."""
    logger.warning(
        f"PHI DELETION: Notes record being deleted. "
        f"pk={instance.pk}, room_name={instance.room_name}, "
        f"care_provider_id={instance.care_provider_id}"
    )


@receiver(pre_delete, sender='risk_screening.UserResponse')
def log_risk_screening_deletion(sender, instance, **kwargs):
    """Log when risk screening records are about to be deleted."""
    logger.warning(
        f"PHI DELETION: UserResponse being deleted. "
        f"response_id={instance.response_id}, "
        f"user_id={instance.user_id}, "
        f"is_severe={instance.is_severe}"
    )


@receiver(pre_delete, sender='authentication.User')
def log_user_deletion(sender, instance, **kwargs):
    """Log when user records are about to be deleted."""
    logger.warning(
        f"USER DELETION: User being deleted. "
        f"id={instance.id}, user_type={instance.user_type}"
        # NOTE: Do NOT log email/name in the deletion log (that would be PII in logs)
    )
```

Register signals in an AppConfig:

```python
# In apps/utils/apps.py
class UtilsConfig(AppConfig):
    name = 'apps.utils'

    def ready(self):
        import apps.utils.security_signals  # noqa
        import apps.utils.audit_config  # noqa
```

## Known Patterns & Gotchas

1. **Two different BaseModel classes**: `authentication.BaseModel` (has `is_active`) and `risk_screening.BaseModel` (does NOT have `is_active`). When adding soft delete, check which base class each model uses.

2. **`auto_now_add` + loaddata incompatibility**: If adding new DateTimeFields for audit purposes (e.g., `deleted_at`), do NOT use `auto_now_add=True`. Use `default=None, null=True` for nullable audit timestamps. See the fixture-seed-debug skill.

3. **`djmoney` serializer edge case**: The `Appointment` model uses `MoneyField` from `djmoney` (imported in models.py). Adding encrypted fields alongside money fields requires careful migration testing. The `djmoney` deserializer rejects fields with `editable=False`.

4. **`CareProvider.save()` side effects**: The overridden `save()` at line 1253 creates ManagePages and profile_handle. Security signals on CareProvider must not interfere with this logic.

5. **Encrypted fields break `__icontains` and `__startswith` lookups**: Once a field is encrypted, ORM filter operations that rely on database-level string matching will not work. Plan for this when encrypting `npi_number` (which may be used in search queries).

6. **Audit log storage**: `django-auditlog` stores logs in the database. For high-traffic PHI tables, this can create significant DB growth. Consider periodic archival or external log shipping.

7. **Signal registration timing**: Signals must be registered in AppConfig.ready(). If the `utils` app is not in INSTALLED_APPS, signals will not fire. Verify the app is registered.

## Data Model & Accuracy Notes

1. **`InPersonLocation.country` is FK to `CountryCode`, NOT CharField**: Do NOT suggest string validators or regex patterns for the country field. It is a ForeignKey to the `CountryCode` model, which stores ISO country codes.

2. **`User.id` is already `UUIDField(primary_key=True)`**: The User model already uses UUID as its primary key. Do NOT suggest adding UUID PKs to User -- it already has them.

3. **`BaseModel.is_active` already exists**: The `authentication.BaseModel` already includes `is_active = BooleanField(default=True)`. For soft delete, leverage this existing field rather than adding a new `is_deleted` field. However, note that `risk_screening.BaseModel` does NOT have `is_active`.

4. **`Notes` has NO `client` FK**: The `Notes` model only has a `care_provider` FK (and `room_name` CharField for indirect appointment linkage). Security filtering by client must be done at the view level by joining through `Appointment.room_name == Notes.room_name` and checking `Appointment.client`.

5. **Data retention periods**: 7 years minimum for clinical notes, risk screening results, appointments, and payment records (per state medical records retention laws). Some states require longer retention for minors (until age 21 + retention period).

6. **Include `apps/wiley/` models**: Treatment plan models in `apps/wiley/` contain Tier 1 PHI. Include them in encryption scope, audit logging registration, and soft-delete migration.

7. **`pre_save` signal on Notes should sanitize HTML**: Since `react-quill` on the frontend produces HTML content, the `pre_save` signal must strip `<script>` tags, event handler attributes (`onclick`, `onerror`, etc.), and other XSS vectors while preserving formatting tags.

8. **`post_save` on UserResponse with `is_severe=True`**: When a severe risk screening is recorded, the signal should trigger: (a) safety team notification, (b) mandatory follow-up appointment creation or flag, (c) audit log entry with timestamp and responsible party.

## Example Invocations

```
/django-model-security-hardening --action encrypt --model Notes
/django-model-security-hardening --action audit-log --model all
/django-model-security-hardening --action soft-delete
/django-model-security-hardening --action retention
/django-model-security-hardening --action signals
/django-model-security-hardening --action all
```
