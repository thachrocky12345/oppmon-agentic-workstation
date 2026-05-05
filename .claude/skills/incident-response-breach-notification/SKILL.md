---
name: incident-response-breach-notification
description: Verify breach detection, notification, and documentation readiness per HIPAA Breach Notification Rule. Use when asked to "breach notification", "incident response", "security incident", "breach readiness", or "data breach plan".
argument-hint: [--simulate] [--audit-only] [--generate-plan]
frequency: semi-annual
depends-on: [hipaa-compliance-audit]
---

# Incident Response & Breach Notification

## When to Use
- When auditing HIPAA Breach Notification Rule compliance
- When preparing for a tabletop breach simulation exercise
- When responding to a suspected or confirmed data breach
- When reviewing incident response procedures before deployment
- When preparing for SOC 2 or HIPAA audit

## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- Understanding of PHI data locations (see phi-pii-leak-scan skill)
- Understanding of HIPAA Breach Notification Rule (45 CFR Part 164, Subpart D)

## Regulatory Framework

The HIPAA Breach Notification Rule (45 CFR 164.400-414) requires covered entities and business associates to notify affected individuals, HHS, and in some cases the media, following a breach of unsecured PHI.

**Key definitions:**
- **Breach**: Unauthorized acquisition, access, use, or disclosure of PHI that compromises its security or privacy (45 CFR 164.402)
- **Unsecured PHI**: PHI not rendered unusable, unreadable, or indecipherable to unauthorized persons (i.e., not encrypted per NIST standards)
- **Discovery**: The date the breach is known or should reasonably have been known

## Workflow

### Step 1: 4-Factor Breach Risk Assessment (45 CFR 164.402)

When a potential breach is identified, apply the 4-factor test to determine whether notification is required:

| Factor | Question | Assessment |
|---|---|---|
| **Factor 1** | What is the nature and extent of the PHI involved? | Clinical notes (Tier 1 PHI) vs demographics (Tier 2 PII) vs metadata (Tier 3) |
| **Factor 2** | Who was the unauthorized person? | Internal employee, external attacker, business associate, accidental recipient |
| **Factor 3** | Was the PHI actually acquired or viewed? | Evidence of access (logs, screenshots) vs theoretical exposure |
| **Factor 4** | To what extent has the risk been mitigated? | Data recovered, access revoked, encryption verified, recipient confirmed destruction |

**Unless all 4 factors demonstrate low probability of compromise, it IS a reportable breach.**

**Platform-specific PHI exposure scenarios:**

| Scenario | PHI at Risk | Factor 1 Severity |
|---|---|---|
| Clinical notes leaked (`Notes.notes`) | Tier 1 -- mental health treatment content | CRITICAL |
| Risk screening results (`UserResponse.final_score`, `is_severe`) | Tier 1 -- crisis/suicidality indicators | CRITICAL |
| Session summary leaked (`Session.issues`, `summary_of_issue`) | Tier 1 -- symptom descriptions | CRITICAL |
| OAuth tokens exposed (`User.google_token`, etc.) | Tier 2 -- enables account takeover | HIGH |
| Provider credentials leaked (`npi_number`, `license_number`) | Tier 2 -- professional identity | MEDIUM |
| Demographics leaked (`date_of_birth`, `street_address`) | Tier 2 -- PII | MEDIUM |
| Appointment metadata leaked (`Appointment.reason`) | Tier 1 -- treatment reason | HIGH |

### Step 2: Notification Timelines (45 CFR 164.404-408)

| Notification Type | Trigger | Deadline | Method |
|---|---|---|---|
| **Individual notification** | Any confirmed breach of unsecured PHI | 60 calendar days from discovery | Written notice (first-class mail) or email (if individual has agreed to electronic notice) |
| **HHS notification (>= 500)** | Breach affects 500+ individuals | Concurrent with individual notification (within 60 days) | HHS breach reporting portal |
| **HHS notification (< 500)** | Breach affects fewer than 500 | Annual submission within 60 days of calendar year end | HHS breach reporting portal |
| **Media notification** | Breach affects 500+ individuals in a single state/jurisdiction | Within 60 days of discovery | Prominent media outlets in the state |
| **BA to CE notification** | Business associate discovers breach | Within 60 days of discovery | Per BAA terms |

### Step 3: Notification Content Requirements (45 CFR 164.404(c))

Each individual notification must include:

1. **Description of the breach**: What happened, when it was discovered, dates of the breach
2. **Types of PHI involved**: E.g., "clinical session notes, appointment dates, provider names"
3. **Steps individuals should take**: E.g., "monitor your accounts, change your password, contact the platform"
4. **Investigation and mitigation**: What the entity is doing to investigate, mitigate harm, and prevent recurrence
5. **Contact information**: Toll-free phone number, email address, and postal address for questions

**Check for notification templates:**

```bash
# Check for breach notification email templates
grep -rn --include="*.py" --include="*.html" --include="*.txt" -i \
  'breach.*notif\|incident.*notif\|security.*notif\|data.*breach' \
  Lumy-Backend/ --exclude-dir=__pycache__ --exclude-dir=.venv --exclude-dir=node_modules

# Check for notification content in SendGrid templates
grep -rn --include="*.py" -i 'template.*breach\|breach.*template\|incident.*template' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Check frontend for breach notification UI
grep -rn --include="*.tsx" --include="*.ts" -i 'breach\|incident\|security.*alert' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next
```

### Step 4: Breach Log (45 CFR 164.408(c))

All breaches affecting fewer than 500 individuals must be logged and submitted annually to HHS.

**Required breach log fields:**

| Field | Description | Required By |
|---|---|---|
| Breach ID | Unique identifier | Internal tracking |
| Date of breach | When the breach occurred | 164.408(c) |
| Date of discovery | When the breach was discovered | 164.408(c) |
| Number of individuals affected | Count of affected persons | 164.408(c) |
| Types of PHI involved | Categories of data breached | 164.408(c) |
| Description | What happened | 164.408(c) |
| Source | Internal, external, BA, accidental | Internal tracking |
| 4-Factor assessment | Risk assessment per 164.402 | Documentation |
| Notifications sent | Individual, HHS, media | 164.404-406 |
| Mitigation actions | Steps taken to address | Documentation |
| Root cause | Why it happened | Prevention |
| Corrective action | What changed to prevent recurrence | Prevention |

**Check for breach log model:**

```bash
# Check for breach/incident models in the database
grep -rn --include="*.py" 'class.*Breach\|class.*Incident\|class.*SecurityEvent\|class.*AuditLog' \
  Lumy-Backend/apps/*/models.py --exclude-dir=__pycache__

# Check for security event logging
grep -rn --include="*.py" -i 'security.*log\|incident.*log\|breach.*log\|audit.*log' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations

# Check for django-auditlog or similar
grep -rn --include="*.py" 'auditlog\|audit_log\|LogEntry' \
  Lumy-Backend/lumy_global/settings.py \
  Lumy-Backend/apps/*/apps.py \
  --exclude-dir=__pycache__ 2>/dev/null
```

### Step 5: Platform-Specific Breach Scenarios

**Scenario 1: Database exposure**
```
PHI at risk: All clinical notes, risk screenings, appointment data
Affected individuals: All users in database
Factor 1: CRITICAL (Tier 1 PHI)
Timeline: 60-day notification to all users + HHS + media (if 500+ in a state)
```

**Scenario 2: Provider account compromise**
```
PHI at risk: Notes and appointments for that provider's clients
Affected individuals: All clients of the compromised provider
Factor 1: HIGH (clinical notes visible)
Factor 3: Check access logs for actual viewing
```

**Scenario 3: OAuth token exposure**
```
PHI at risk: Linked Google/Microsoft account data
Affected individuals: Users with OAuth tokens stored
Factor 1: HIGH (enables account takeover)
Mitigation: Revoke all affected tokens immediately
```

**Scenario 4: Third-party BA breach (Twilio, SendGrid, Azure)**
```
PHI at risk: Depends on data shared with BA
Affected individuals: Users whose data transited the breached service
Timeline: BA must notify CE within 60 days; CE then has 60 days for individual notification
Check: BAA terms for notification requirements
```

### Step 6: Incident Response Plan Verification

```bash
# Check for incident response documentation
find Lumy-Backend/ RG-Frontend/ -name "*incident*" -o -name "*breach*" -o -name "*response_plan*" 2>/dev/null

# Check for security contact information
grep -rn --include="*.py" -i 'security.*contact\|abuse.*contact\|security.*email' \
  Lumy-Backend/ --exclude-dir=__pycache__ --exclude-dir=.venv

# Check for role-based access to breach reporting
grep -rn --include="*.py" -i 'SecurityOfficer\|PrivacyOfficer\|IncidentResponder\|ADMIN' \
  Lumy-Backend/apps/authentication/ --exclude-dir=__pycache__ --exclude-dir=migrations
```

**Required incident response roles:**

| Role | Responsibility |
|---|---|
| Privacy Officer | Leads breach assessment, determines notification requirements |
| Security Officer | Technical investigation, evidence preservation, containment |
| Legal Counsel | Regulatory notification compliance, liability assessment |
| Communications Lead | Individual/media notifications, PR coordination |
| Clinical Lead | Patient safety assessment, provider notification |

## Output
- **File**: `ContextFiles2/Library/Sessions/breach-notification-readiness_Results_{YYYY-MM-DD}.md`
- **Format**: Compliance checklist mapping each 45 CFR 164.404-408 requirement to implementation status
- **Categories**: Detection, Assessment, Notification, Documentation, Prevention

## Known Patterns & Gotchas

1. **Encryption is the safe harbor**: Under the Breach Notification Rule, if PHI is encrypted per NIST standards (AES-128 or stronger), it is "secured PHI" and a breach of encrypted data does NOT require notification (45 CFR 164.402(2)). This is a strong incentive for field-level encryption (see django-model-security-hardening skill).

2. **Discovery date starts the clock**: The 60-day notification deadline starts when the breach is DISCOVERED, not when it occurred. "Discovery" means the date when the covered entity first knew or should reasonably have known. Willful neglect of breach detection does not extend the timeline.

3. **State breach notification laws may be stricter**: Many states have their own breach notification laws with shorter timelines (e.g., California requires "expedient" notification, often interpreted as 15-30 days). The platform must comply with both HIPAA and the state law for each affected individual's state of residence.

4. **No breach model currently exists**: The platform does not have a `Breach`, `Incident`, or `SecurityEvent` model. All breach documentation would need to be maintained externally until such a model is created.

5. **SendGrid as notification channel**: Breach notifications may need to be sent via SendGrid. Ironic if SendGrid itself is the breached BA. Have a backup notification channel (postal mail service, alternative email provider).

6. **Annual HHS submission deadline**: Breaches affecting fewer than 500 individuals must be reported to HHS within 60 days of the end of the calendar year in which they were discovered. E.g., a breach discovered in March 2026 must be reported to HHS by March 1, 2027.

7. **Mental health records carry heightened sensitivity**: Under 42 CFR Part 2 (substance use disorder records) and various state mental health privacy laws, breaches of mental health records may trigger additional notification requirements beyond standard HIPAA.

## Example Invocations

```
/incident-response-breach-notification
/incident-response-breach-notification --audit-only
/incident-response-breach-notification --simulate
/incident-response-breach-notification --generate-plan
```
