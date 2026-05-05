---
name: crisis-response-protocol
description: Verify and document the crisis response workflow from risk screening detection through escalation, notification, and follow-up. Use when asked to "crisis protocol", "duty to warn", "mandatory reporting", "crisis escalation", or "safety workflow".
argument-hint: [--check-only] [--generate-docs] [--verify-escalation]
frequency: quarterly
depends-on: [test-data-factory, mock-settings-manager]
---

# Crisis Response Protocol

## When to Use
- When verifying crisis escalation workflows are correctly implemented
- When auditing Tarasoff duty-to-warn compliance
- When reviewing mandatory reporting obligations
- When adding or modifying risk screening functionality
- When responding to regulatory audit of crisis response procedures
- When onboarding new care providers (crisis protocol training verification)

## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- Understanding of `risk_screening` app models (`UserResponse`, `ResponseDetail`, `ClientScreeningIgnore`)
- Database access for crisis response verification queries

## Crisis Detection Model

```
UserResponse (apps.risk_screening.models)
  |-- response_id (UUIDField, PK)
  |-- user (FK to User)
  |-- final_score (FloatField)
  |-- final_keywords (JSONField)
  |-- is_severe (BooleanField)  <-- CRISIS TRIGGER
  |-- is_screening_ignored (BooleanField)
  |-- FK --> ResponseDetail (9 items for PHQ-9)
  |       |-- score (IntegerField, 0-3 per item)
  |       |-- keywords (JSONField)
  |       |-- is_severe (BooleanField)
  |
  ClientScreeningIgnore (apps.risk_screening.models)
  |-- user (FK to User)
  |-- screening (FK to UserResponse)
  |-- reason (TextField)  -- clinical justification for ignoring
```

## Workflow

### Step 1: Crisis Detection Verification

**Verify `is_severe=True` triggers a defined workflow:**

```bash
# Find all references to is_severe in backend code
grep -rn --include="*.py" 'is_severe' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations

# Check for signal handlers on UserResponse
grep -rn --include="*.py" -A 10 'post_save.*UserResponse\|pre_save.*UserResponse' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Check for notification logic triggered by severe screening
grep -rn --include="*.py" -i 'severe\|crisis\|emergency\|escalat' \
  Lumy-Backend/apps/risk_screening/ --exclude-dir=__pycache__ --exclude-dir=migrations

# Check frontend for crisis resource display
grep -rn --include="*.tsx" --include="*.ts" -i 'severe\|crisis\|988\|lifeline\|emergency' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next
```

**Expected crisis detection workflow:**

| Step | Action | Implementation Status |
|---|---|---|
| 1 | `UserResponse.is_severe` set to `True` | CHECK existing model logic |
| 2 | Platform safety team notified (email/in-app) | CHECK for notification code |
| 3 | Client sees crisis resources (988 Lifeline, Crisis Text Line) | CHECK frontend display |
| 4 | Booking flow interrupted for crisis acknowledgment | CHECK booking mutation/view |
| 5 | Audit log entry created | CHECK signal handler |

**Django ORM verification:**

```python
from apps.risk_screening.models import UserResponse, ClientScreeningIgnore
from apps.calendar_functionality.models import Appointment
from django.utils import timezone
from datetime import timedelta

# Find all severe screenings
severe = UserResponse.objects.filter(is_severe=True)
print(f"Total severe screenings: {severe.count()}")

# Check for follow-up within 48 hours
for ur in severe:
    follow_up = Appointment.objects.filter(
        client__user=ur.user,
        created_at__gte=ur.created_at,
        created_at__lte=ur.created_at + timedelta(hours=48),
    ).exists()

    ignored = ClientScreeningIgnore.objects.filter(
        screening=ur
    ).exists()

    if not follow_up and not ignored:
        print(f"  ALERT: Severe screening {ur.response_id} (user={ur.user_id}) "
              f"has NO follow-up and NO clinical ignore record")
```

### Step 2: Duty to Warn (Tarasoff Obligations)

**Tarasoff v. Regents of the University of California (1976)** established that mental health professionals have a duty to warn identifiable potential victims of serious harm. This is NOT a uniform national standard -- it varies by state.

**State-by-State Duty to Warn:**

| Category | States |
|---|---|
| **Mandatory duty to warn** | CA, CO, CT, DE, FL, ID, IN, IA, KY, LA, MA, MD, MI, MN, MS, MT, NE, NH, NJ, NY, OH, PA, SC, TN, UT, VA, VT, WI, WY |
| **Permissive (may warn)** | AL, AK, HI, IL, ME, NV, NC, ND, OK, OR, RI, SD, WA, WV |
| **No Tarasoff statute** | TX, GA (but common law duty may apply) |

**Verification checks:**

```bash
# Check for Tarasoff/duty-to-warn references
grep -rn --include="*.py" --include="*.tsx" --include="*.ts" -i \
  'tarasoff\|duty.*warn\|threat.*assessment\|danger.*others' \
  Lumy-Backend/apps/ RG-Frontend/src/ \
  --exclude-dir=__pycache__ --exclude-dir=node_modules --exclude-dir=.next 2>/dev/null

# Check for threat assessment form or workflow
grep -rn --include="*.py" -i 'threat\|violence\|harm.*others\|homicid' \
  Lumy-Backend/apps/risk_screening/ --exclude-dir=__pycache__ --exclude-dir=migrations
```

**Required elements:**
1. Provider notification of Tarasoff obligation based on client's state
2. Mechanism to document threat assessment (form or structured note)
3. Workflow for provider to record: assessed threat, action taken, date/time, identifiable victim (if any)
4. State-specific guidance on mandatory vs permissive duty

### Step 3: Mandatory Reporting

**Universal obligations for healthcare professionals:**

| Reporting Type | Jurisdiction | Trigger |
|---|---|---|
| Child abuse/neglect | ALL 50 states | Suspicion of abuse or neglect of a minor |
| Elder abuse | Most states | Suspicion of abuse/neglect of elderly/dependent adult |
| Imminent self-harm | Most states (varies) | Expressed intent + plan + means |

**Verification checks:**

```bash
# Check for mandatory reporting workflow
grep -rn --include="*.py" -i 'mandatory.*report\|child.*abuse\|elder.*abuse\|report.*abuse' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations

# Check for reporting form or structured data capture
grep -rn --include="*.py" -i 'reporter\|report_date\|nature.*concern\|actions.*taken' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations

# Frontend reporting UI
grep -rn --include="*.tsx" --include="*.ts" -i 'report.*abuse\|mandatory.*report\|child.*protect' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next
```

**Required data capture for mandatory reports:**
- Reporter identity (provider name, license number)
- Date and time of report
- Nature of concern (structured categories: physical abuse, neglect, sexual abuse, emotional abuse)
- Actions taken (reported to: CPS, APS, law enforcement, other)
- Follow-up documentation

### Step 4: Post-Crisis Follow-Up

A crisis detection without follow-up is clinically negligent.

**Verification queries:**

```python
from apps.risk_screening.models import UserResponse
from apps.calendar_functionality.models import Appointment
from django.utils import timezone
from datetime import timedelta

# Severe screenings without 48-hour follow-up
cutoff = timezone.now() - timedelta(hours=48)
severe_old = UserResponse.objects.filter(
    is_severe=True,
    created_at__lt=cutoff,
)

for ur in severe_old:
    has_followup = Appointment.objects.filter(
        client__user=ur.user,
        start_date_time__gte=ur.created_at,
        start_date_time__lte=ur.created_at + timedelta(hours=48),
    ).exists()

    has_ignore = ClientScreeningIgnore.objects.filter(
        screening=ur,
    ).exists()

    if not has_followup and not has_ignore:
        print(f"VIOLATION: No follow-up for severe screening {ur.response_id}")
        print(f"  User: {ur.user_id}, Score: {ur.final_score}, Date: {ur.created_at}")
```

**Required follow-up workflow:**

| Step | Deadline | Action |
|---|---|---|
| 1 | Immediate | Display crisis resources to client (988, Crisis Text Line) |
| 2 | Within 1 hour | Notify assigned care provider (if exists) |
| 3 | Within 4 hours | Notify platform safety team |
| 4 | Within 48 hours | Follow-up appointment scheduled or clinical override documented |
| 5 | 48+ hours | If no follow-up: escalate to safety team lead |

### Step 5: Administrative Actions

```bash
# Check for admin dashboard crisis flags
grep -rn --include="*.py" -i 'crisis.*flag\|safety.*flag\|account.*review\|admin.*alert' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations

# Check for admin notification system
grep -rn --include="*.py" -i 'admin.*notif\|staff.*notif\|safety.*notif' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations
```

**Required administrative actions:**
1. Account review flag on client profile (visible to admin and assigned provider)
2. Admin dashboard notification (real-time or within 15 minutes)
3. Documentation retention: mental health crisis records must be retained per state requirements (typically 7+ years, some states longer for minors)
4. Audit trail: all crisis-related actions must be logged with timestamps, actor identity, and action taken

## Output
- **File**: `ContextFiles2/Library/Sessions/crisis-response-protocol_Results_{YYYY-MM-DD}.md`
- **Format**: Crisis response readiness matrix mapping each obligation to implementation status
- **Categories**: Detection, Duty to Warn, Mandatory Reporting, Follow-Up, Administrative

## Known Patterns & Gotchas

1. **`UserResponse.response_id` is the PK**: Unlike other models, `UserResponse` uses `response_id = UUIDField(primary_key=True)`, not `id`. Use `response_id` in all queries and references.

2. **`ClientScreeningIgnore` is the clinical override mechanism**: When a provider determines that a severe screening does not require follow-up (e.g., the score was elevated due to chronic conditions, not acute crisis), they create a `ClientScreeningIgnore` record with a clinical justification. This is a legitimate clinical decision and should not be flagged as a violation.

3. **PHQ-9 item 9 is the suicide risk question**: In the PHQ-9 screening instrument, question 9 asks about "thoughts that you would be better off dead or of hurting yourself." A score of 2 or 3 on this single item should trigger the crisis pathway regardless of total score.

4. **No dedicated crisis model exists**: The platform uses `UserResponse.is_severe` as a boolean flag but has no dedicated crisis event model that tracks the full escalation chain. This gap means crisis response actions may not be auditable.

5. **Tarasoff applies to the PROVIDER's state AND the CLIENT's state**: In telehealth, both the provider's licensing state and the client's physical location state may impose Tarasoff obligations. The stricter standard applies.

6. **988 Suicide & Crisis Lifeline**: The national crisis line (988) should be displayed to clients flagged as severe. Also include Crisis Text Line (text HOME to 741741) and local emergency services (911).

## Example Invocations

```
/crisis-response-protocol
/crisis-response-protocol --check-only
/crisis-response-protocol --generate-docs
/crisis-response-protocol --verify-escalation
```
