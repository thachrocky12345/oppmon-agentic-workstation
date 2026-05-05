---
name: hipaa-compliance-audit
description: Audit codebase against HIPAA Technical Safeguards (164.312) and flag violations. Use when asked to "run HIPAA audit", "check HIPAA compliance", "compliance review", "healthcare security audit", or "regulatory check".
argument-hint: [--section access|audit|integrity|transmission|encryption|minimum-necessary|baa|privacy-rule|all] [--output markdown|json]
frequency: quarterly
---

# HIPAA Technical Safeguards Compliance Audit

## When to Use
- Before production deployment of any feature touching PHI
- During quarterly compliance reviews
- When adding new endpoints that access clinical data (Notes, risk screening, appointments)
- When modifying authentication or authorization logic
- Before security certification or SOC 2 readiness

## Prerequisites
- Access to `Lumy-Backend/` source tree
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- Knowledge of which models contain PHI (see Tier 1 in phi-pii-leak-scan skill)

## PHI-Containing Models (Audit Targets)
| Model | App | Key PHI Fields |
|---|---|---|
| `Notes` | `video_conferencing` | `notes` |
| `UserResponse` | `risk_screening` | `final_score`, `final_keywords`, `is_severe` |
| `ResponseDetail` | `risk_screening` | `score`, `keywords`, `is_severe` |
| `Appointment` | `calendar_functionality` | `reason` |
| `Session` | `calendar_functionality` | `issues`, `summary_of_issue` |

## Workflow

### Step 1: Access Controls -- 164.312(a)

**1a. Verify all PHI endpoints require authentication:**

```bash
# Find all views/viewsets in PHI-containing apps
grep -rn --include="*.py" -E 'class\s+\w+(View|ViewSet|APIView)' \
  Lumy-Backend/apps/video_conferencing/views.py \
  Lumy-Backend/apps/risk_screening/views.py \
  Lumy-Backend/apps/calendar_functionality/views.py

# Check each view for permission_classes
grep -rn --include="*.py" -B 2 -A 10 'class.*APIView\|class.*ViewSet\|class.*View' \
  Lumy-Backend/apps/video_conferencing/views.py \
  Lumy-Backend/apps/risk_screening/views.py \
  Lumy-Backend/apps/calendar_functionality/views.py \
  | grep -E 'permission_classes|IsAuthenticated|AllowAny|authentication_classes'

# Flag any PHI view using AllowAny or missing permission_classes
grep -rn --include="*.py" 'AllowAny' \
  Lumy-Backend/apps/video_conferencing/ \
  Lumy-Backend/apps/risk_screening/ \
  Lumy-Backend/apps/calendar_functionality/
```

**1b. Check for role-based authorization (not just IsAuthenticated):**

```bash
# PHI views should check user_type or ownership, not just IsAuthenticated
grep -rn --include="*.py" -A 20 'class.*View' \
  Lumy-Backend/apps/video_conferencing/views.py \
  | grep -E 'request\.user\.(user_type|care_provider|client)|IsOwner|IsCareProvider|IsClient'

# Check GraphQL resolvers for ownership filtering
grep -rn --include="*.py" -A 10 'def resolve_' \
  Lumy-Backend/apps/video_conferencing/ \
  Lumy-Backend/apps/risk_screening/ \
  Lumy-Backend/apps/calendar_functionality/ \
  | grep -E 'info\.context\.user|request\.user|filter.*user'
```

**1c. Check for IDOR vulnerabilities:**

```bash
# Look for direct object access without ownership check
grep -rn --include="*.py" -E '\.objects\.get\(.*pk=|\.objects\.get\(.*id=' \
  Lumy-Backend/apps/video_conferencing/ \
  Lumy-Backend/apps/risk_screening/ \
  Lumy-Backend/apps/calendar_functionality/ \
  | grep -v 'user='
```

**1d. Emergency Access Procedure -- 164.312(a)(2)(ii) (Required):**

```bash
# Check for emergency/break-glass access mechanism
grep -rn --include="*.py" -i 'emergency\|break.glass\|emergency_access\|override_access' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Check for admin override capability with audit trail
grep -rn --include="*.py" -E 'is_superuser|is_staff' \
  Lumy-Backend/apps/video_conferencing/views.py \
  Lumy-Backend/apps/risk_screening/views.py \
  Lumy-Backend/apps/calendar_functionality/views.py
```

**Expected finding**: No emergency access procedure exists. Remediation: Implement a break-glass access mechanism that (a) allows designated safety team members to access any client's crisis data, (b) logs the access with justification, (c) triggers a post-access review.

**1e. Person or Entity Authentication -- 164.312(d) (Required):**

```bash
# Check for MFA/2FA implementation
grep -rn --include="*.py" -i 'mfa\|two.factor\|2fa\|totp\|authenticator' \
  Lumy-Backend/apps/ Lumy-Backend/lumy_global/ --exclude-dir=__pycache__

# Check Twilio Verify usage (phone-based verification)
grep -rn --include="*.py" 'verify\|verification' \
  Lumy-Backend/apps/authentication/ --exclude-dir=__pycache__

# Check for password complexity requirements
grep -rn --include="*.py" -E 'AUTH_PASSWORD_VALIDATORS|MinimumLengthValidator|CommonPasswordValidator' \
  Lumy-Backend/lumy_global/settings.py
```

**Expected finding**: OTP verification exists via Twilio Verify but may only be used for phone verification during signup, not as ongoing MFA. HIPAA requires person/entity authentication for PHI access. Remediation: Extend Twilio Verify for login MFA on provider accounts accessing clinical data.

### Step 2: Audit Controls -- 164.312(b)

```bash
# Check for audit logging middleware or decorators
grep -rn --include="*.py" -E 'AuditLog|audit_log|AuditMiddleware|django-auditlog|django-simple-history' \
  Lumy-Backend/lumy_global/settings.py \
  Lumy-Backend/lumy_global/middleware.py \
  Lumy-Backend/apps/

# Check for Django signals logging PHI access
grep -rn --include="*.py" -E 'post_save|post_delete|pre_save|pre_delete' \
  Lumy-Backend/apps/video_conferencing/ \
  Lumy-Backend/apps/risk_screening/ \
  Lumy-Backend/apps/calendar_functionality/

# Check INSTALLED_APPS for audit packages
grep -rn 'INSTALLED_APPS' Lumy-Backend/lumy_global/settings.py -A 50 \
  | grep -i 'audit\|history\|log'

# Check for any logging configuration
grep -rn --include="*.py" 'LOGGING' Lumy-Backend/lumy_global/settings.py -A 30
```

**Expected finding**: Likely NO audit logging exists. Remediation: Install `django-auditlog` and register Tier 1 models.

**Minimum audit log fields per 164.312(b) and legal discovery requirements:**

| Field | Purpose | Source |
|---|---|---|
| `user_id` | Who accessed the record | `request.user.id` |
| `action` | What was done (CREATE, READ, UPDATE, DELETE) | View/mutation method |
| `model` | Which PHI model was accessed | Model class name |
| `record_id` | Specific record PK | Object PK |
| `timestamp` | When the access occurred (UTC) | Auto-generated |
| `ip_address` | Source IP | `request.META['REMOTE_ADDR']` or X-Forwarded-For |
| `user_agent` | Client identification | `request.META['HTTP_USER_AGENT']` |
| `fields_accessed` | Which specific fields were read | Serializer field list |
| `fields_changed` | Old value -> new value for writes | django-auditlog diff |
| `request_path` | API endpoint accessed | `request.path` |
| `response_status` | HTTP status code returned | Response status |

**Recommended implementation with django-auditlog:**

```bash
# Install
pip install django-auditlog

# Register Tier 1 PHI models in each app's apps.py:
# apps/video_conferencing/apps.py:
#   from auditlog.registry import auditlog
#   auditlog.register(Notes, include_fields=['notes', 'care_provider', 'room_name'])
#
# apps/risk_screening/apps.py:
#   auditlog.register(UserResponse, include_fields=['final_score', 'final_keywords', 'is_severe'])
#   auditlog.register(ResponseDetail, include_fields=['score', 'keywords', 'is_severe'])
#
# apps/calendar_functionality/apps.py:
#   auditlog.register(Appointment, include_fields=['reason', 'is_status', 'care_provider', 'client'])
#   auditlog.register(Session, include_fields=['issues', 'summary_of_issue'])
```

**Legal discovery export specification:**

Generate a command or management command that produces:
1. Client-specific PHI export (all records for a given user_id across all models)
2. Provider credential approval trail (audit log filtered to CareProvider + ProfessionalLicense)
3. Appointment/session history with all associated Notes for a specific client
4. Date-range filtered audit log in CSV or JSON format for counsel review

### Step 3: Integrity Controls -- 164.312(c)

```bash
# Check serializer validation on PHI fields
grep -rn --include="*.py" -A 20 'class.*Serializer' \
  Lumy-Backend/apps/video_conferencing/serializers.py \
  Lumy-Backend/apps/risk_screening/serializers.py \
  Lumy-Backend/apps/calendar_functionality/serializers.py \
  | grep -E 'validate_|validators|clean_|MinLength|MaxLength|RegexValidator'

# Check for input sanitization on notes field (strip HTML/XSS)
grep -rn --include="*.py" -E 'bleach|sanitize|strip_tags|escape|mark_safe' \
  Lumy-Backend/apps/video_conferencing/ \
  Lumy-Backend/apps/risk_screening/

# Check for data validation on risk screening scores
grep -rn --include="*.py" -E 'MinValueValidator|MaxValueValidator|validate' \
  Lumy-Backend/apps/risk_screening/
```

### Step 4: Transmission Security -- 164.312(e)

```bash
# Check Django security settings
grep -rn -E 'SECURE_SSL_REDIRECT|SESSION_COOKIE_SECURE|CSRF_COOKIE_SECURE|SECURE_HSTS|SECURE_BROWSER_XSS_FILTER|X_FRAME_OPTIONS|SECURE_CONTENT_TYPE_NOSNIFF' \
  Lumy-Backend/lumy_global/settings.py

# Check for plaintext HTTP URLs in constants
grep -rn --include="*.py" --include="*.ts" --include="*.tsx" \
  -E 'http://' \
  Lumy-Backend/apps/ RG-Frontend/src/lib/ RG-Frontend/src/store/ \
  --exclude-dir=__pycache__ --exclude-dir=node_modules \
  | grep -v 'localhost\|127\.0\.0\.1\|http://schemas\|# '

# Check CORS configuration
grep -rn -E 'CORS_ORIGIN_ALLOW_ALL|CORS_ALLOWED_ORIGINS|CORS_ALLOW_ALL_ORIGINS' \
  Lumy-Backend/lumy_global/settings.py
```

### Step 5: Encryption at Rest

```bash
# Check for field-level encryption libraries
grep -rn -E 'encrypted|fernet|EncryptedField|EncryptedTextField|EncryptedCharField' \
  Lumy-Backend/requirements.txt \
  Lumy-Backend/lumy_global/settings.py \
  Lumy-Backend/apps/video_conferencing/models.py \
  Lumy-Backend/apps/risk_screening/models.py \
  Lumy-Backend/apps/authentication/models.py

# Check pip installed packages for encryption
grep -i 'encrypt\|fernet\|crypto' Lumy-Backend/requirements.txt
```

**Expected finding**: No field-level encryption. The following fields store sensitive data as plaintext:
- `Notes.notes` -- clinical session notes
- `User.google_token`, `User.microsoft_token` -- OAuth tokens
- `User.google_refresh_token`, `User.microsoft_refresh_token` -- OAuth refresh tokens
- `CareProvider.npi_number` -- National Provider Identifier
- `CareProvider.insurance_policy_number` -- insurance data
- `ProfessionalLicense.license_number` -- licensure identifiers

### Step 6: Minimum Necessary Standard

```bash
# Find serializers using fields = '__all__'
grep -rn --include="*.py" -B 10 "fields = '__all__'" \
  Lumy-Backend/apps/authentication/ \
  Lumy-Backend/apps/video_conferencing/ \
  Lumy-Backend/apps/risk_screening/ \
  Lumy-Backend/apps/calendar_functionality/ \
  Lumy-Backend/apps/care_provider/ \
  Lumy-Backend/apps/stripe_integration/

# Find GraphQL types with broad field exposure
grep -rn --include="*.py" -B 5 -A 15 'class Meta:' \
  Lumy-Backend/apps/graphqlapp/ \
  Lumy-Backend/apps/*/object_types.py \
  | grep -E 'fields =|exclude ='

# Check that DjangoObjectType types don't expose OAuth tokens
grep -rn --include="*.py" -A 20 'DjangoObjectType' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ \
  | grep -E 'google_token|microsoft_token|npi_number|insurance_policy|license_number'
```

### Step 7: Business Associate Agreement (BAA) Boundary Check

```bash
# Verify external service calls go through dedicated modules (not inline)
# Twilio
grep -rn --include="*.py" 'from twilio\|import twilio' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ \
  | grep -v 'video_conferencing'

# Stripe
grep -rn --include="*.py" 'import stripe\|from stripe' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ \
  | grep -v 'stripe_integration'

# SendGrid
grep -rn --include="*.py" 'sendgrid\|SendGridAPIClient' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Azure Search
grep -rn --include="*.py" 'azure.search\|SearchClient\|SearchIndexClient' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__
```

**BAA Determination by Vendor:**

| Vendor | Touches PHI? | BAA Required? | Notes |
|---|---|---|---|
| Twilio | YES (video sessions with clinical content, SMS) | **YES** | Video rooms may contain identifiable health discussions |
| SendGrid | YES (appointment confirmations reference provider/client) | **YES** | Email content may contain PHI in subject/body |
| Azure Cognitive Search | YES (provider profiles indexed with clinical specialties) | **YES** | Search index may contain provider NPI, credentials |
| Stripe | NO (payment amounts only, no clinical data) | **NO** | But PCI DSS compliance required |
| PayPal | NO (payment amounts only) | **NO** | But PCI DSS compliance required |
| Sterling/Certn | NO (background checks on providers, not patient data) | **NO** | Employment screening, not PHI |
| MailModo | CONDITIONAL | **CONDITIONAL** | Check if marketing emails reference health topics |
| ipapi | NO (IP geolocation only) | **NO** | No PHI transmitted |

```bash
# Check for MailModo usage and whether health content is sent
grep -rn --include="*.py" --include="*.ts" -i 'mailmodo\|mailing.*list\|newsletter' \
  Lumy-Backend/apps/ RG-Frontend/src/ --exclude-dir=__pycache__ --exclude-dir=node_modules
```

### Step 8: Privacy Rule Compliance -- 164 Subpart E

**8a. Notice of Privacy Practices (164.520):**

```bash
# Check for NPP delivery mechanism at signup
grep -rn --include="*.py" --include="*.ts" --include="*.tsx" \
  -i 'privacy.notice\|privacy.policy\|NPP\|notice_of_privacy' \
  Lumy-Backend/apps/ RG-Frontend/src/ --exclude-dir=__pycache__ --exclude-dir=node_modules

# Check for consent timestamp tied to privacy notice
grep -rn --include="*.py" 'tandc_consent\|is_agree\|privacy_consent\|npp_accepted' \
  Lumy-Backend/apps/authentication/models.py \
  Lumy-Backend/apps/client/models.py
```

**8b. Right of Access (164.524):**

```bash
# Check for data export/download mechanism (30-day deadline)
grep -rn --include="*.py" -i 'export\|download.*data\|data.*request\|access.*request' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Check for management command or API endpoint for PHI export
grep -rn --include="*.py" 'class Command' \
  Lumy-Backend/apps/*/management/commands/ \
  | grep -i 'export\|extract\|dump'
```

**Expected finding**: No automated PHI export mechanism. Remediation: Create management command to export all PHI for a given user_id within 30 days.

**8c. Amendment Rights (164.526):**

```bash
# Check for amendment/correction workflow (60-day deadline)
grep -rn --include="*.py" -i 'amendment\|correction\|update.*request\|modify.*record' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__
```

**8d. Accounting of Disclosures (164.528):**

```bash
# Check for disclosure tracking (6-year coverage for non-TPO disclosures)
grep -rn --include="*.py" -i 'disclosure\|accounting.*disclosure\|share.*data\|third.*party.*access' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__
```

**Privacy Rule compliance matrix rows:**

| Requirement | Section | Status | Evidence | Remediation |
|---|---|---|---|---|
| NPP Delivery | 164.520 | PASS/FAIL | [consent fields] | [fix] |
| Right of Access | 164.524 | PASS/FAIL | [export mechanism] | [fix] |
| Amendment Rights | 164.526 | PASS/FAIL | [correction workflow] | [fix] |
| Accounting of Disclosures | 164.528 | PASS/FAIL | [disclosure log] | [fix] |

### Step 9: Generate Compliance Matrix

Output format:

```markdown
# HIPAA Technical Safeguards Compliance Matrix -- [DATE]

| Requirement | Section | Status | Evidence | Remediation |
|---|---|---|---|---|
| Unique User Identification | 164.312(a)(2)(i) | PASS/FAIL | [file:line] | [fix] |
| Emergency Access Procedure | 164.312(a)(2)(ii) | PASS/FAIL | [evidence] | [fix] |
| Automatic Logoff | 164.312(a)(2)(iii) | PASS/FAIL | [evidence] | [fix] |
| Encryption/Decryption | 164.312(a)(2)(iv) | FAIL | No field-level encryption | Install django-encrypted-model-fields |
| Audit Controls | 164.312(b) | FAIL | No audit logging | Install django-auditlog |
| Integrity | 164.312(c)(1) | PARTIAL | Limited validation | Add validators to PHI serializers |
| Authentication | 164.312(d) | PASS/FAIL | [evidence] | [fix] |
| Transmission Security | 164.312(e)(1) | FAIL | CORS_ORIGIN_ALLOW_ALL=True | Restrict CORS origins |
```

## Known Patterns & Gotchas

1. **`settings.py` defaults are dev-only**: `DEBUG=True`, `ALLOWED_HOSTS=["*"]`, `CORS_ORIGIN_ALLOW_ALL=True` are all in `Lumy-Backend/lumy_global/settings.py`. These MUST be overridden for production via environment variables, but there is no runtime enforcement.

2. **`SECRET_KEY` is hardcoded**: The Django `SECRET_KEY` is hardcoded in `settings.py`, not loaded from environment. This is a 164.312(a)(2)(iv) violation.

3. **No session timeout**: Check `SESSION_COOKIE_AGE` and JWT `ACCESS_TOKEN_LIFETIME` in settings.py. HIPAA requires automatic logoff after inactivity.

4. **GraphQL introspection**: If introspection is enabled in production, it exposes the full schema including PHI field names. Check for `GRAPHENE` settings in `settings.py`.

5. **`CareProvider.to_json()`**: This method at line ~1064 of `Lumy-Backend/apps/care_provider/models.py` serializes user PII for Azure Search indexing. While this feeds a search index (which may be BAA-covered), the method itself has no access control.

6. **Missing rate limiting**: Only OTP endpoints have rate limiting (mocked in tests at `apps/authentication/mutations.py`). No rate limiting on login, search, or PHI access endpoints.

7. **State privacy laws may preempt HIPAA**: HIPAA is a floor, not a ceiling. Several state laws
   impose stricter requirements for mental health records:
   - **California (CMIA)**: Confidentiality of Medical Information Act requires explicit written
     authorization for disclosure of mental health records (CA Civ. Code 56.10)
   - **New York**: Mental Hygiene Law 33.13 restricts disclosure of mental health records beyond
     HIPAA minimum necessary
   - **Texas**: Medical Records Privacy Act (HB 300) adds state-specific consent requirements
   - **CCPA/CPRA**: California residents have data deletion rights that may conflict with HIPAA
     retention requirements -- the HIPAA retention obligation takes precedence for PHI
   Under HIPAA preemption analysis (45 CFR 160.203), state law controls when it provides greater
   privacy protection. A multi-state telehealth platform must comply with the stricter law for
   each client's jurisdiction.

## Output
- **File**: `ContextFiles2/Library/Sessions/hipaa-compliance-audit_Results_{YYYY-MM-DD}.md`
- **Format**: Compliance matrix (requirement -> status -> evidence -> remediation)
- **Delta**: If a previous output file exists, highlight new findings and resolved items

## Example Invocations

```
/hipaa-compliance-audit
/hipaa-compliance-audit --section access
/hipaa-compliance-audit --section encryption --output json
/hipaa-compliance-audit --section all --output markdown
```
