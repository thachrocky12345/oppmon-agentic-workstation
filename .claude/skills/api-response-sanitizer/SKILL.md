---
name: api-response-sanitizer
description: Audit and fix API responses to prevent PHI/PII leakage beyond authorized scope. Use when asked to "sanitize API responses", "audit serializers", "check GraphQL exposure", "field-level access control", or "minimize data exposure".
argument-hint: [--scope serializers|graphql|frontend|middleware|all] [--fix]
frequency: every-pr
---

# API Response Sanitizer

## When to Use
- When adding or modifying serializers that touch PHI/PII models
- When adding new GraphQL types or resolvers
- During security review before deployment
- When building new frontend pages that consume sensitive data
- When implementing least-privilege data access patterns

## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Understanding of Tier 1/2/3 data sensitivity (see phi-pii-leak-scan)

## Sensitive Fields Reference (MUST be controlled)

**NEVER expose in public or unauthenticated responses:**
- `Notes.notes` -- clinical session notes
- `UserResponse.final_score`, `final_keywords`, `is_severe` -- risk screening
- `ResponseDetail.score`, `keywords`, `is_severe` -- per-question risk detail
- `Session.issues`, `summary_of_issue` -- symptom descriptions
- `User.google_token`, `microsoft_token`, `google_refresh_token`, `microsoft_refresh_token` -- OAuth tokens
- `User.vulnerability1`, `vulnerability2` -- vulnerability flags

**Expose only to record owner or authorized provider:**
- `Appointment.reason` -- session reason
- `User.date_of_birth`, `street_address`, `latitude`, `longitude` -- PII
- `CareProvider.npi_number`, `insurance_policy_number` -- provider credentials
- `ProfessionalLicense.license_number` -- licensure
- `Appointment.payment_intent_id`, `payment_method_id` -- payment linkage
- `StripeUser.stripe_customer_id`, `paypal_user_id` -- payment identity

## Workflow

### Step 1: Audit DRF Serializers

```bash
# Find ALL serializers in PHI-containing apps
grep -rn --include="*.py" 'class.*Serializer.*:' \
  Lumy-Backend/apps/authentication/serializers.py \
  Lumy-Backend/apps/video_conferencing/serializers.py \
  Lumy-Backend/apps/risk_screening/serializers.py \
  Lumy-Backend/apps/calendar_functionality/serializers.py \
  Lumy-Backend/apps/care_provider/serializers.py \
  Lumy-Backend/apps/stripe_integration/serializers.py \
  2>/dev/null
```

For each serializer found, check:

```bash
# Check for fields = '__all__' (violation on PHI models)
grep -rn --include="*.py" -B 5 -A 5 "__all__" \
  Lumy-Backend/apps/authentication/serializers.py \
  Lumy-Backend/apps/video_conferencing/serializers.py \
  Lumy-Backend/apps/risk_screening/serializers.py \
  Lumy-Backend/apps/calendar_functionality/serializers.py \
  Lumy-Backend/apps/care_provider/serializers.py \
  Lumy-Backend/apps/stripe_integration/serializers.py \
  2>/dev/null

# Check for write_only on sensitive fields
grep -rn --include="*.py" 'write_only' \
  Lumy-Backend/apps/authentication/serializers.py \
  Lumy-Backend/apps/care_provider/serializers.py \
  2>/dev/null

# Check for SerializerMethodField that might leak related PHI
grep -rn --include="*.py" -A 10 'SerializerMethodField' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations --exclude-dir=tests \
  | grep -i 'notes\|score\|keyword\|token\|reason\|issue\|npi\|license\|insurance'
```

Generate a field-level exposure map for each serializer:

```
Serializer: UserSerializer
  Model: User
  Fields exposed: [list all]
  Sensitive fields exposed: [flag any from the reference above]
  write_only fields: [list]
  Verdict: PASS / FAIL (with reason)
```

### Step 2: Audit GraphQL Schema

```bash
# Find all DjangoObjectType definitions
grep -rn --include="*.py" -B 3 -A 20 'DjangoObjectType' \
  Lumy-Backend/apps/graphqlapp/ \
  Lumy-Backend/apps/*/schema.py \
  Lumy-Backend/apps/*/object_types.py \
  Lumy-Backend/apps/*/queries.py \
  2>/dev/null

# Check for sensitive fields in GraphQL types
grep -rn --include="*.py" -E 'notes|final_keywords|final_score|is_severe|reason|issues|summary_of_issue|google_token|microsoft_token|npi_number|license_number|insurance_policy_number|vulnerability1|vulnerability2' \
  Lumy-Backend/apps/graphqlapp/ \
  Lumy-Backend/apps/*/object_types.py \
  2>/dev/null

# Check resolver ownership filtering
grep -rn --include="*.py" -A 15 'def resolve_' \
  Lumy-Backend/apps/graphqlapp/ \
  Lumy-Backend/apps/*/queries.py \
  2>/dev/null \
  | grep -E 'info\.context\.user|request\.user|\.filter.*user|\.filter.*care_provider|\.filter.*client'

# Check for graphql-jwt decorators on sensitive resolvers
grep -rn --include="*.py" -B 3 'def resolve_' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=tests \
  | grep -E 'login_required|staff_member_required|permission_required'
```

### Step 3: Create/verify response sanitization middleware

Check if response middleware exists:

```bash
grep -rn --include="*.py" 'Middleware\|middleware' \
  Lumy-Backend/lumy_global/settings.py | head -20

grep -rn --include="*.py" -E 'class.*Middleware' \
  Lumy-Backend/apps/ Lumy-Backend/lumy_global/ --exclude-dir=__pycache__ --exclude-dir=tests
```

If missing, create `Lumy-Backend/apps/utils/sanitization_middleware.py`:

```python
"""Middleware to sanitize API responses and set security headers."""
import json
import re
from django.conf import settings


class ResponseSanitizationMiddleware:
    """
    1. Strips stack traces from non-DEBUG responses
    2. Redacts email addresses in error responses
    3. Sets no-store cache headers on PHI endpoints
    4. Removes null sensitive fields from JSON responses
    """

    PHI_ENDPOINT_PATTERNS = [
        r'/api/v1/video/',
        r'/api/v1/risk[-_]screening/',
        r'/api/v1/calendar/appointments/',
        r'/api/v1/calendar/sessions/',
        r'/api/v1/graphql/',
    ]

    SENSITIVE_KEYS = {
        'google_token', 'microsoft_token', 'google_refresh_token',
        'microsoft_refresh_token', 'vulnerability1', 'vulnerability2',
        'final_keywords', 'npi_number', 'insurance_policy_number',
        'license_number', 'payment_intent_id', 'payment_method_id',
    }

    EMAIL_PATTERN = re.compile(r'([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})')

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Set no-store for PHI endpoints
        path = request.path
        if any(re.match(pat, path) for pat in self.PHI_ENDPOINT_PATTERNS):
            response['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
            response['Pragma'] = 'no-cache'

        # Redact emails in error responses (4xx, 5xx)
        if response.status_code >= 400 and hasattr(response, 'content'):
            content = response.content.decode('utf-8', errors='replace')
            content = self.EMAIL_PATTERN.sub(r'\1***\2', content)
            if not settings.DEBUG and response.status_code >= 500:
                # Strip stack traces
                try:
                    data = json.loads(content)
                    data.pop('traceback', None)
                    data.pop('stack', None)
                    data.pop('exception', None)
                    content = json.dumps(data)
                except (json.JSONDecodeError, AttributeError):
                    pass
            response.content = content.encode('utf-8')

        return response
```

### Step 4: Audit frontend state for PHI caching

```bash
# Redux slices caching PHI
grep -rn --include="*.ts" --include="*.tsx" \
  -E 'createSlice|createAsyncThunk' \
  RG-Frontend/src/store/slices/ --exclude-dir=node_modules \
  | head -20

# Then for each slice that handles PHI data, check for no-cache policy:
grep -rn --include="*.ts" --include="*.tsx" \
  'fetchPolicy.*no-cache\|fetchPolicy.*network-only' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next

# Check console.log with user data
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  -E 'console\.(log|error|warn|info)\(' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next \
  | grep -iv 'test\|debug\|todo' | head -30

# Check localStorage/sessionStorage for sensitive data
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  -E 'localStorage\.(setItem|getItem)|sessionStorage\.(setItem|getItem)' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next

# Check for dangerouslySetInnerHTML (XSS risk with PHI)
grep -rn --include="*.tsx" 'dangerouslySetInnerHTML' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next
```

### Step 5: Generate field-level exposure map

Output format:

```markdown
# API Response Exposure Map -- [DATE]

## REST Endpoints

### /api/v1/video-conferencing/notes/
| Field | Exposed | Should Be | Violation |
|---|---|---|---|
| notes | YES | Owner-only | CHECK |
| care_provider | YES | OK | -- |
| room_name | YES | OK | -- |
| date | YES | OK | -- |

### /api/v1/auth/user/
| Field | Exposed | Should Be | Violation |
|---|---|---|---|
| email | YES | Owner-only | -- |
| google_token | CHECK | NEVER | CRITICAL |
| vulnerability1 | CHECK | NEVER | CRITICAL |

## GraphQL Types

### UserType
| Field | Exposed | Should Be | Violation |
|---|---|---|---|
| ...

## Frontend State Stores
| Store/Slice | PHI Fields Cached | Cache Policy | Violation |
|---|---|---|---|
```

## Known Patterns & Gotchas

1. **`CareProvider.to_json()` exposes PII**: At `Lumy-Backend/apps/care_provider/models.py:1064`, the `to_json()` method serializes `phone_number`, `street_address`, `city`, `state`, `zip` into a dict that feeds Azure Search. This method has no access control -- it is called by the search indexing pipeline.

2. **`Notes.room_name` is a string match to `Appointment.room_name`**: There is no FK relationship, so ownership checks must be done manually by querying the Appointment to find the care_provider/client, then verifying the requesting user matches.

3. **GraphQL introspection exposes schema**: If introspection is enabled (default in Graphene), anyone can see all types and fields including sensitive ones. Check `GRAPHENE` settings in `settings.py`.

4. **Axios interceptor on 401**: The frontend Axios interceptor at `RG-Frontend/src/store/axiosInstance.ts` auto-refreshes tokens via GraphQL mutation. During this flow, ensure the refresh response does not contain additional user data.

5. **`react-quill` renders HTML**: If clinical notes or appointment reasons contain HTML (via react-quill), rendering them with `dangerouslySetInnerHTML` is an XSS vector. Notes should be sanitized server-side before storage.

6. **Apollo cache**: By default, Apollo caches all query results. PHI queries (notes, risk screening results, appointment details) should use `fetchPolicy: 'no-cache'` or `fetchPolicy: 'network-only'` to prevent sensitive data from persisting in the client cache.

## Data Model & Accuracy Notes

1. **`PaymentMethod` is TextChoices, NOT a model**: In `stripe_integration/models.py`, `PaymentMethod` is a `TextChoices` enum (e.g., `CARD = "card"`, `PAYPAL = "paypal"`), not a Django model with its own table. Do NOT reference "PaymentMethod records" or "PaymentMethod serializer".

2. **`Notes.notes` has NO model-level access control**: There is no `get_queryset()` override or custom manager on `Notes` that filters by ownership. Access control for clinical notes must be enforced entirely at the view/serializer layer. The model exposes all records by default.

3. **OAuth fields in User model**: The following fields must be excluded from public API responses: `google_email`, `google_name`, `microsoft_email`, `microsoft_name`, `google_expiration`, `microsoft_expiration`. These are PII sourced from OAuth providers.

4. **`User.profile_handle` is auto-generated from PII**: The `profile_handle` is derived from the user's name during `CareProvider.save()`. While it appears innocuous, it can reveal identity and requires special treatment in anonymization workflows.

5. **Cross-provider note isolation**: Provider A must NOT be able to see Provider B's notes, even for a shared client. Test: create two providers and one client with notes from each provider, then verify Provider A's API response contains only their own notes.

6. **Group therapy participant identity**: Group session API responses must NOT leak participant identities to other group members. Verify that group session endpoints return anonymized or role-based participant lists.

7. **Provider public profile exclusions**: Client-facing provider profile responses (e.g., search results, public profile pages) must exclude `npi_number`, `license_number`, `insurance_policy_number`, `stripe_customer_id`, and all OAuth tokens.

8. **Include `apps/wiley/` in PHI scan**: Treatment plans stored in `apps/wiley/` models are Tier 1 PHI. Include these models in serializer audits and response sanitization checks.

## Example Invocations

```
/api-response-sanitizer
/api-response-sanitizer --scope serializers
/api-response-sanitizer --scope graphql --fix
/api-response-sanitizer --scope frontend
/api-response-sanitizer --scope all --fix
```
