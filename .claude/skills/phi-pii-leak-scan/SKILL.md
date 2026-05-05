---
name: phi-pii-leak-scan
description: Scan codebase for accidental PHI/PII exposure in code, logs, API responses, fixtures, and test output. Use when asked to "scan for PII", "find data leaks", "check for PHI exposure", "audit sensitive data", or "data leak scan".
argument-hint: [--scope backend|frontend|all] [--severity critical|high|medium|low|all] [--app APP_NAME] [--fix]
frequency: every-pr
---

# PHI/PII Leak Scanner

## When to Use
- Before any PR that touches serializers, GraphQL types, views, or models containing sensitive data
- After adding new API endpoints that return user or clinical data
- During security review or compliance audit
- When onboarding new team members to verify no PII in test fixtures
- After any refactoring of authentication, care_provider, video_conferencing, risk_screening, or calendar_functionality apps

## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- No running services required (static analysis only)

## Data Sensitivity Reference

### Tier 1 -- Critical PHI (Protected Health Information)
| Model | Field | Location |
|---|---|---|
| `video_conferencing.Notes` | `notes` (TextField) | `Lumy-Backend/apps/video_conferencing/models.py` |
| `risk_screening.UserResponse` | `final_score`, `final_keywords` (JSONField), `is_severe` | `Lumy-Backend/apps/risk_screening/models.py` |
| `risk_screening.ResponseDetail` | `score`, `keywords`, `is_severe` | `Lumy-Backend/apps/risk_screening/models.py` |
| `calendar_functionality.Appointment` | `reason` (TextField) | `Lumy-Backend/apps/calendar_functionality/models.py` |
| `calendar_functionality.Session` | `issues`, `summary_of_issue` | `Lumy-Backend/apps/calendar_functionality/models.py` |

### Tier 2 -- Sensitive PII
| Model | Field | Location |
|---|---|---|
| `authentication.User` | `email`, `first_name`, `last_name`, `phone_number`, `date_of_birth`, `street_address`, `city`, `state`, `zip`, `latitude`, `longitude` | `Lumy-Backend/apps/authentication/models.py` |
| `authentication.User` | `google_token`, `microsoft_token`, `google_refresh_token`, `microsoft_refresh_token` | `Lumy-Backend/apps/authentication/models.py` |
| `authentication.User` | `google_email`, `google_name`, `microsoft_email`, `microsoft_name` | `Lumy-Backend/apps/authentication/models.py` |
| `authentication.User` | `google_expiration`, `microsoft_expiration` | `Lumy-Backend/apps/authentication/models.py` |
| `authentication.User` | `visitor_id`, `profile_handle` | `Lumy-Backend/apps/authentication/models.py` |
| `care_provider.CareProvider` | `npi_number`, `insurance_policy_number`, `liability_insurance_carrier`, `stripe_customer_id` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.CareProvider` | `affiliate_id`, `affiliate_link` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.ProfessionalLicense` | `license_number`, `credential_abbreviation` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.ProfessionalLicense` | `certificate_number`, `supervisor_license_number` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.InPersonLocation` | `address_line_1`, `latitude`, `longitude` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.CareProvider` | `relationship_file_document` (FileField) | `Lumy-Backend/apps/care_provider/models.py` |
| `calendar_functionality.Appointment` | `payment_intent_id`, `payment_method_id` | `Lumy-Backend/apps/calendar_functionality/models.py` |
| `stripe_integration.StripeUser` | `stripe_customer_id`, `customer_email`, `paypal_user_id` | `Lumy-Backend/apps/stripe_integration/models.py` |
| `stripe_integration.StripeUser` | `paypal_order_id`, `paypal_auth_id` | `Lumy-Backend/apps/stripe_integration/models.py` |

### Tier 3 -- Demographic/Identity
| Model | Field | Location |
|---|---|---|
| `care_provider.CareProvider` | `my_identity_sexuality`, `my_identity_ethnicity_and_race`, `my_identity_faith_and_background_orientation` | `Lumy-Backend/apps/care_provider/models.py` |
| `care_provider.CareProvider` | `my_identity_gender` (FK -> Genders), `my_identity_pronouns` (FK -> Pronouns) | `Lumy-Backend/apps/care_provider/models.py:966-978` |
| `authentication.User` | `gender`, `vulnerability1`, `vulnerability2` | `Lumy-Backend/apps/authentication/models.py` |

## Workflow

### Step 1: Scan for PII patterns in source code using regex

Scan backend Python files for hardcoded PII patterns:

```bash
# Email addresses (not in test factories or config)
grep -rn --include="*.py" -E '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' Lumy-Backend/ \
  --exclude-dir=__pycache__ --exclude-dir=.venv --exclude-dir=venv --exclude-dir=node_modules \
  | grep -v '@example\.com' | grep -v 'conftest.py' | grep -v 'test_' | grep -v '#' | grep -v 'EMAIL_FIELD'

# Phone numbers (international formats)
grep -rn --include="*.py" --include="*.ts" --include="*.tsx" --include="*.json" \
  -E '(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}' \
  Lumy-Backend/ RG-Frontend/src/ \
  --exclude-dir=__pycache__ --exclude-dir=node_modules --exclude-dir=.next

# SSN patterns
grep -rn --include="*.py" --include="*.ts" --include="*.tsx" --include="*.json" \
  -E '\b\d{3}-\d{2}-\d{4}\b' \
  Lumy-Backend/ RG-Frontend/src/

# NPI numbers (10-digit patterns in non-model files)
grep -rn --include="*.py" --include="*.json" \
  -E '\b[12]\d{9}\b' \
  Lumy-Backend/ --exclude-dir=__pycache__ --exclude-dir=migrations \
  | grep -v 'models.py' | grep -v 'conftest.py'

# Credit card numbers
grep -rn --include="*.py" --include="*.ts" --include="*.tsx" --include="*.json" \
  -E '\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b' \
  Lumy-Backend/ RG-Frontend/src/

# JWT tokens hardcoded
grep -rn --include="*.py" --include="*.ts" --include="*.tsx" \
  -E 'eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}' \
  Lumy-Backend/ RG-Frontend/src/ \
  --exclude-dir=__pycache__ --exclude-dir=node_modules --exclude-dir=.next

# Latitude/longitude coordinates (non-model, non-test)
grep -rn --include="*.py" --include="*.json" \
  -E '[-]?\d{1,3}\.\d{4,}' \
  Lumy-Backend/fixtures/ | grep -i 'lat\|lng\|longitude\|latitude'
```

Scan frontend files:

```bash
# localStorage/sessionStorage writes beyond auth tokens
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  -E 'localStorage\.setItem|sessionStorage\.setItem' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next

# Console logging of user data
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  -E 'console\.(log|error|warn|info)\(' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next \
  | grep -i 'user\|email\|token\|password\|phone\|name\|patient\|client\|provider'
```

### Step 2: Audit serializers and GraphQL types for PHI field exposure

```bash
# Find serializers that use fields = '__all__' on sensitive models
grep -rn --include="*.py" -B 5 "fields = '__all__'" \
  Lumy-Backend/apps/authentication/ \
  Lumy-Backend/apps/video_conferencing/ \
  Lumy-Backend/apps/risk_screening/ \
  Lumy-Backend/apps/calendar_functionality/ \
  Lumy-Backend/apps/care_provider/ \
  Lumy-Backend/apps/stripe_integration/

# Find GraphQL types exposing sensitive fields
grep -rn --include="*.py" -A 20 'class.*DjangoObjectType' \
  Lumy-Backend/apps/graphqlapp/ \
  Lumy-Backend/apps/*/schema.py \
  Lumy-Backend/apps/*/object_types.py \
  Lumy-Backend/apps/*/queries.py

# Check for Notes.notes in serializers/responses
grep -rn --include="*.py" "'notes'" Lumy-Backend/apps/ \
  | grep -i 'serial\|field\|type\|schema\|response'

# Check for risk screening fields in non-auth responses
grep -rn --include="*.py" -E 'final_keywords|final_score|is_severe' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ \
  | grep -v 'models.py' | grep -v 'migrations' | grep -v 'conftest.py' | grep -v 'test_'

# Check for OAuth token fields in serializers/GraphQL
grep -rn --include="*.py" -E 'google_token|microsoft_token|google_refresh_token|microsoft_refresh_token' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ \
  | grep -v 'models.py' | grep -v 'migrations'

# Check profile_handle generation for PII leakage
grep -rn --include="*.py" 'make_profile_handle\|profile_handle' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations
```

### Step 3: Audit fixture files for realistic PII

```bash
# Scan fixture files for real-looking emails (not @example.com)
grep -rn -E '"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"' \
  Lumy-Backend/fixtures/ | grep -v '@example\.com' | grep -v '@test\.'

# Scan for real-looking phone numbers in fixtures
grep -rn -E '"(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"' \
  Lumy-Backend/fixtures/

# Scan for real-looking addresses
grep -rn -i '"street\|"address\|"city.*:.*[A-Z]' \
  Lumy-Backend/fixtures/dev_fake_*.json

# Scan for non-ocean coordinates (real locations)
grep -rn -E '"(latitude|longitude)"\s*:\s*[-]?\d{1,3}\.\d+' \
  Lumy-Backend/fixtures/ | grep -v '0\.0'
```

### Step 4: Audit frontend state for PHI caching

```bash
# Check Redux slices for PHI fields cached in state
grep -rn --include="*.ts" --include="*.tsx" \
  -E 'notes|final_keywords|is_severe|reason|issues|summary_of_issue|npi_number|license_number' \
  RG-Frontend/src/store/ --exclude-dir=node_modules

# Check Apollo cache for PHI queries without no-cache
grep -rn --include="*.ts" --include="*.tsx" \
  -B 3 -A 3 'useQuery\|useLazyQuery' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next \
  | grep -A 5 -i 'note\|risk\|screening\|appointment.*reason'

# Check for dangerouslySetInnerHTML with user data
grep -rn --include="*.tsx" --include="*.ts" \
  'dangerouslySetInnerHTML' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next
```

### Step 5: Check for PII in error messages and logging

```bash
# Backend: print statements with user data
grep -rn --include="*.py" \
  -E 'print\(.*\b(email|user|phone|name|token)\b' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Backend: logger calls with user data
grep -rn --include="*.py" \
  -E 'logger?\.(info|debug|warning|error|critical)\(.*\b(email|user\.email|phone|first_name|last_name)\b' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Backend: exception handlers that might expose user data in response
grep -rn --include="*.py" -A 5 'except.*Exception' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ \
  | grep -E 'Response|JsonResponse|return.*str\(e\)'
```

### Step 6: Generate severity-classified report

Classify findings into:
- **CRITICAL**: PHI fields (notes, risk scores, clinical data) exposed in unauthenticated or public endpoints
- **HIGH**: PII (email, phone, address, tokens) in logs, error responses, or overly-broad serializers
- **MEDIUM**: PII in test fixtures, hardcoded test data that looks real
- **LOW**: Overly verbose serializers (`fields = '__all__'`), console.log with user objects

Generate markdown report:

```markdown
# PHI/PII Leak Scan Report -- [DATE]

## Summary
| Severity | Count |
|----------|-------|
| CRITICAL | X |
| HIGH     | X |
| MEDIUM   | X |
| LOW      | X |

## CRITICAL Findings
### [C-001] Description
- **File**: `path/to/file.py:LINE`
- **Issue**: [description]
- **Fix**: [suggested remediation]

## HIGH Findings
...
```

## Known Patterns & Gotchas

1. **`profile_handle` leaks PII**: `apps/utils/profile_handle.py` generates slugs from `first_name`, `last_name`, `email`, and `date_of_birth`. These profile handles appear in URLs and are indexable. See `Lumy-Backend/apps/care_provider/models.py:1261` where `make_profile_handle()` is called.

2. **`to_json()` method on CareProvider**: The `CareProvider.to_json()` method at `Lumy-Backend/apps/care_provider/models.py:1064` serializes `user_info` including `phone_number`, `street_address`, `city`, `state`, `zip` -- this data feeds into Azure Search indexing.

3. **OAuth tokens stored as plaintext TextField**: `User.google_token`, `User.microsoft_token`, `User.google_refresh_token`, `User.microsoft_refresh_token` at `Lumy-Backend/apps/authentication/models.py:136-143`.

4. **Notes model has no access control at model level**: `video_conferencing.Notes` at `Lumy-Backend/apps/video_conferencing/models.py:29` has `care_provider` FK but no per-user query filtering.

5. **Stripe secret key in frontend**: Check `RG-Frontend/.env.local` for `STRIPE_SECRET_KEY` -- this is a known gap.

6. **dev_fake_*.json fixtures**: These may contain data that looks realistic. Always verify coordinates map to ocean or uninhabited areas, emails use `@example.com`, and phone numbers use `555-` prefix.

7. **`auto_now_add` fields**: When scanning fixtures, ignore `created_at`/`modified_at` timestamp fields -- they cannot contain PII but may cause false positives if searching for date patterns.

## Output
- **File**: `ContextFiles2/Library/Sessions/phi-pii-leak-scan_Results_{YYYY-MM-DD}.md`
- **Format**: Markdown with severity-classified findings table
- **Delta**: If a previous output file exists, append a "Changes Since Last Run" section

## Example Invocations

```
/phi-pii-leak-scan
/phi-pii-leak-scan --scope backend --severity critical
/phi-pii-leak-scan --scope frontend
/phi-pii-leak-scan --fix
/phi-pii-leak-scan --scope backend --app video_conferencing   # Just modified the Notes serializer
/phi-pii-leak-scan --scope frontend --app store                # Check Redux for PHI caching
```
