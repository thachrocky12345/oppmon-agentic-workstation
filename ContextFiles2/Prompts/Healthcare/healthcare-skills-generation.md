# Healthcare Skills Generation Prompt

> **Purpose**: Run this prompt against the ReallyGlobal codebase to generate a comprehensive set of Claude Code skills (`.claude/skills/`) tailored to this healthcare marketplace platform.
>
> **How to run**: Paste this entire file as a prompt to Claude Code, or reference it via `/audit-pipeline`.

---

## Objective

You are a principal security engineer and healthcare software architect. Your task is to create **14 new Claude Code skills** in `.claude/skills/`, each as a `SKILL.md` file inside its own directory. These skills are purpose-built for a healthcare marketplace (Really Global / Lumy) that handles PHI, PII, clinical session notes, risk screening scores, payment data, and provider credentials.

The skills must be **actionable** — each one is a repeatable workflow that Claude Code can execute when invoked via `/skill-name`. They are NOT documentation; they are executable runbooks with concrete commands, file paths, regex patterns, and decision trees.

---

## Codebase Context (DO NOT re-explore; use this as ground truth)

### Architecture
- **Backend**: Django 4.2 + DRF + Graphene-Django, PostgreSQL 14, Redis + django-rq
- **Frontend**: Next.js 13 (pages router), React 18, TypeScript, MUI, Redux Toolkit, Apollo Client
- **Docker**: docker-compose.yml at repo root — postgres, redis, backend, rqworker, frontend
- **Repos**: `Lumy-Backend/` and `RG-Frontend/` are separate git repos inside `C:\Projects\ReallyGlobal\`

### Data Sensitivity Map

**Tier 1 — Critical PHI (Protected Health Information)**:
| Model | Field(s) | Risk |
|---|---|---|
| `video_conferencing.Notes` | `notes` (TextField) | Clinical session notes — plaintext, no encryption |
| `risk_screening.UserResponse` | `final_score`, `final_keywords` (JSONField), `is_severe` | Suicidality/self-harm risk scores and keyword flags |
| `risk_screening.ResponseDetail` | `score`, `keywords`, `is_severe` | Per-question risk assessment detail |
| `calendar_functionality.Appointment` | `reason` | Session reason/chief complaint |
| `calendar_functionality.Session` | `issues`, `summary_of_issue` | Symptom descriptions |

**Tier 2 — Sensitive PII**:
| Model | Field(s) | Risk |
|---|---|---|
| `authentication.User` | `email`, `first_name`, `last_name`, `phone_number`, `date_of_birth`, `street_address`, `city`, `state`, `zip`, `latitude`, `longitude` | Full identity + geolocation |
| `authentication.User` | `google_token`, `microsoft_token`, `google_refresh_token`, `microsoft_refresh_token` | OAuth tokens stored as plaintext TextField |
| `care_provider.CareProvider` | `npi_number`, `insurance_policy_number`, `liability_insurance_carrier` | Provider credentials |
| `care_provider.ProfessionalLicense` | `license_number`, `credential_abbreviation` | Licensure identifiers |
| `care_provider.InPersonLocation` | `address_line_1`, `latitude`, `longitude` | Physical practice location |
| `stripe_integration` / `Appointment` | `payment_intent_id`, `payment_method_id`, `stripe_customer_id` | Payment linkage to identity |

**Tier 3 — Demographic/Identity**:
| Model | Field(s) | Risk |
|---|---|---|
| `care_provider.CareProvider` | `my_identity_sexuality`, `my_identity_ethnicity_and_race`, `my_identity_faith_and_background_orientation` | Protected characteristics |
| `authentication.User` | `gender`, `vulnerability1`, `vulnerability2` | Gender identity, vulnerability flags |

### Existing Test Infrastructure
- **Backend**: pytest + factory_boy. Factories in `apps/*/tests/conftest.py` for: User, Client, CareProvider, Appointment, Slot, RiskScreening, Stripe, Verification, ManagePages
- **Frontend**: NO test infrastructure. No jest, no vitest, no MSW, no `__tests__/` directories. `yarn test-all` = format + lint + typecheck + build only.
- **Mocking**: Backend uses `monkeypatch` fixtures for Redis, Stripe, SendGrid, django-rq. No systematic external API mock layer.
- **Security scanning**: SonarCloud configured for both repos but no CI job in frontend. No eslint-plugin-security. Husky pre-commit hooks disabled.

### Known Security Gaps
1. Clinical notes (`Notes.notes`) stored plaintext — no field-level encryption
2. OAuth tokens stored as plaintext TextFields
3. JWT tokens stored in localStorage (XSS-accessible) + Cookies (no HttpOnly) + sessionStorage
4. Stripe secret key present in frontend `.env.local`
5. `DEBUG=True`, `ALLOWED_HOSTS=["*"]`, `CORS_ORIGIN_ALLOW_ALL=True` in settings.py
6. No rate limiting on most endpoints (only OTP has mock rate-limit in tests)
7. No audit logging for PHI access
8. No data retention/deletion policies implemented
9. `User.profile_handle` auto-generated from name + email + DOB (leaks PII in URL slugs)

---

## Skills to Generate

Create each skill as `.claude/skills/<skill-name>/SKILL.md` with this structure:

```markdown
---
name: <skill-name>
description: <1-2 sentence description with trigger phrases>
argument-hint: <optional arguments>
---

# <Skill Title>

## When to Use
<bullet list of trigger scenarios>

## Prerequisites
<what must be true before running>

## Workflow
### Step 1: ...
<concrete commands, file paths, regex patterns, decision logic>
### Step 2: ...
...

## Known Patterns & Gotchas
<project-specific traps, workarounds, edge cases>

## Example Invocations
<2-3 example /skill-name calls with arguments>
```

---

### Skill 1: `phi-pii-leak-scan`

**Purpose**: Scan code, logs, API responses, fixtures, and test output for accidental PHI/PII exposure.

**Must include**:
- Regex patterns for: email addresses, phone numbers (international), SSNs, NPI numbers, dates of birth, street addresses, lat/lng coordinates, credit card numbers, JWT tokens, OAuth tokens
- File types to scan: `*.py`, `*.ts`, `*.tsx`, `*.js`, `*.json`, `*.log`, `*.csv`, `*.env*`, `*.yml`, `*.yaml`
- Directories to SKIP: `node_modules/`, `.next/`, `__pycache__/`, `.git/`, `venv/`, `.venv/`
- Specific checks for this codebase:
  - `Notes.notes` field appearing in serializers/API responses without redaction
  - `final_keywords` (risk screening) in any non-authenticated response
  - `UserResponse.is_severe` flag exposed to non-clinical users
  - OAuth tokens (`google_token`, `microsoft_token`) in any serializer or GraphQL type
  - `profile_handle` generation logic that concatenates PII
  - Fixture files (`fixtures/*.json`, `dev_fake_*.json`) containing real-looking PII
  - Frontend localStorage/sessionStorage writes of anything beyond auth tokens
  - Console.log/print statements containing user data
  - Error messages that include user email, name, or ID in client-visible responses
- Severity classification: CRITICAL (PHI in public endpoint), HIGH (PII in logs/errors), MEDIUM (PII in test fixtures), LOW (overly verbose serializers)
- Output: Markdown report with file:line references, severity, and suggested fix

---

### Skill 2: `hipaa-compliance-audit`

**Purpose**: Audit the codebase against HIPAA Technical Safeguards (§164.312) and flag violations.

**Must include**:
- **Access Controls (§164.312(a))**: Check that PHI-containing views/endpoints require authentication AND role-based authorization (not just `IsAuthenticated`). Map every view that touches Tier 1 models and verify permission classes.
- **Audit Controls (§164.312(b))**: Check for audit logging on PHI access. Look for Django signals, middleware, or decorators that log who accessed what. Flag if missing.
- **Integrity Controls (§164.312(c))**: Check for data validation on PHI fields (notes, risk scores). Verify serializer validation exists.
- **Transmission Security (§164.312(e))**: Verify HTTPS enforcement (`SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`). Check for plaintext HTTP in any URL constant.
- **Encryption at Rest**: Flag Tier 1 fields that lack field-level encryption. Check for `django-encrypted-model-fields`, `django-fernet-fields`, or equivalent.
- **Minimum Necessary**: Flag serializers that expose ALL model fields (`fields = '__all__'`) on PHI-containing models. Each PHI endpoint should expose only the minimum fields needed.
- **BAA (Business Associate Agreements)**: Check that external service integrations (Twilio, Stripe, SendGrid, Azure, Sterling) are called through dedicated modules (not inline) so BAA boundaries are clear.
- Output: Compliance matrix (requirement → status → evidence → remediation)

---

### Skill 3: `security-code-review`

**Purpose**: Automated security review against OWASP Top 10, focused on Django + Next.js patterns.

**Must include**:
- **A01 Broken Access Control**: Find views/mutations missing permission classes. Check for IDOR (e.g., `Appointment.objects.get(pk=request.data['id'])` without ownership check). Scan for `@login_required` vs DRF `permission_classes`.
- **A02 Cryptographic Failures**: Plaintext storage of tokens, passwords, secrets. Weak hashing. Missing `SECURE_*` settings.
- **A03 Injection**: Raw SQL (`raw()`, `extra()`, `RawSQL()`). Template injection. GraphQL query depth/complexity limits missing. `mark_safe()` usage. Frontend `dangerouslySetInnerHTML`.
- **A04 Insecure Design**: Rate limiting gaps. Missing CAPTCHA on public forms. No account lockout.
- **A05 Security Misconfiguration**: `DEBUG=True`, `ALLOWED_HOSTS=["*"]`, `CORS_ORIGIN_ALLOW_ALL`, `SECRET_KEY` hardcoded, missing `X-Frame-Options`, `Content-Security-Policy`.
- **A06 Vulnerable Components**: Check `requirements.txt` and `package.json` for known CVEs. Run `pip audit` and `yarn audit` (or `npm audit`).
- **A07 Auth Failures**: JWT configuration (expiry too long, no rotation). Token in localStorage. Missing refresh token rotation.
- **A08 Data Integrity**: Deserialization of user input without validation. `pickle` usage. Unsigned cookies.
- **A09 Logging Failures**: Missing logging on auth events, PHI access, payment operations. Logging PII in plaintext.
- **A10 SSRF**: URL inputs passed to `requests.get()` or `urllib`. Webhook URL validation.
- Output: Severity-ranked findings with CWE references and fix suggestions

---

### Skill 4: `test-data-factory`

**Purpose**: Generate realistic but entirely fake healthcare test data that exercises all model relationships without using real PII.

**Must include**:
- **Extend existing factory_boy factories** in `apps/*/tests/conftest.py` — do NOT duplicate, import and subclass
- **Healthcare-specific fake data providers**:
  - NPI numbers (valid format: 10-digit, Luhn check digit)
  - License numbers by state jurisdiction pattern
  - Insurance policy numbers (format: carrier-specific patterns)
  - ICD-10 diagnostic codes (for `issues`/`reason` fields)
  - Clinical note templates (realistic but synthetic session notes using lorem-style clinical language)
  - Risk screening responses (varied severity profiles: low-risk, moderate, high-risk, crisis)
  - Appointment patterns (realistic scheduling: business hours, 50-min sessions, timezone-aware)
  - Provider credential sets (matching role → license type → specialty combinations)
- **Demographic diversity**: Factories should produce representative distributions of gender, ethnicity, age, sexuality, faith — not just defaults
- **Relationship integrity**: Factory traits/subfactories that produce valid FK chains:
  - `User → Client → Appointment → VideoCallRoom → Notes`
  - `User → CareProvider → Credentials → InPersonLocation`
  - `User → UserResponse → ResponseDetail`
- **Scenario factories** (composite):
  - `CompletedSessionScenario` — provider + client + appointment(COMPLETED) + notes + payment
  - `CrisisScreeningScenario` — user + high-severity risk response + flagged keywords
  - `NewProviderOnboardingScenario` — user + care_provider(incomplete) + partial credentials
  - `BookingFunnelScenario` — client + search + slot selection + appointment(SCHEDULED) + payment(PENDING)
- **Management command**: `python manage.py generate_test_scenarios [--count N] [--scenario SCENARIO]`
- **Seed data safety**: All generated data must use `.example` TLDs, `555-` phone prefixes, `00000` zip codes, and coordinates mapping to ocean/uninhabited areas

---

### Skill 5: `mock-external-services`

**Purpose**: Create and manage mock layers for all external service integrations (Twilio, Stripe, SendGrid, Azure Search, Sterling/Certn, MailModo, ipapi).

**Must include**:
- **Backend mocks** (pytest fixtures + mock classes):
  - `MockTwilioClient` — returns canned room SIDs, participant tokens, SMS delivery receipts. Configurable failure modes (room creation failure, token expiry, rate limit).
  - `MockStripeClient` — returns payment intents, customer creation, webhook event payloads. Configurable: successful charge, declined card, 3DS required, refund, dispute.
  - `MockSendGridClient` — captures sent emails in-memory for assertion. Returns delivery status. Configurable: bounce, spam report, invalid recipient.
  - `MockAzureSearchClient` — returns configurable search results from fixture data. Supports faceted search, pagination, scoring profiles.
  - `MockSterlingClient` — returns background check statuses: clear, review, adverse action. Configurable delay for async polling pattern.
  - `MockCertnClient` — same as Sterling but for Certn verification flow.
  - `MockIPAPI` — returns configurable geolocation + currency data.
- **Frontend mocks** (MSW — Mock Service Worker):
  - Install and configure MSW for the Next.js project
  - Handler files per service domain: `mocks/handlers/auth.ts`, `calendar.ts`, `payments.ts`, `video.ts`, `search.ts`
  - GraphQL handler for `/api/v1/graphql/` using `graphql.operation()` or `graphql.query()`/`graphql.mutation()`
  - REST handlers for all endpoints in `src/restapis/api.js` and `src/lib/constants.ts`
  - Browser + server (SSR) integration for Next.js
- **Configuration switching**:
  - Environment variable `MOCK_SERVICES=all|twilio,stripe,sendgrid|none`
  - Django setting `EXTERNAL_SERVICE_MOCKS` dict mapping service → mock class
  - Frontend `.env.test` with `NEXT_PUBLIC_MOCK_API=true`
- **Failure injection**: Every mock must support a `failure_mode` parameter:
  - `"success"` (default), `"timeout"`, `"rate_limit"`, `"server_error"`, `"invalid_response"`, `"auth_failure"`
  - For Stripe specifically: `"card_declined"`, `"insufficient_funds"`, `"3ds_required"`, `"fraud_detected"`
  - For Twilio: `"room_full"`, `"participant_disconnected"`, `"recording_failed"`
- **Recording mode**: Option to record real API calls and replay them (VCR-style using `vcrpy` for backend, MSW `passthrough()` + recording for frontend)

---

### Skill 6: `mock-settings-manager`

**Purpose**: Switch between mock configurations for different testing scenarios without code changes.

**Must include**:
- **Settings profiles** stored as JSON in `Lumy-Backend/test_profiles/`:
  - `default.json` — all mocks enabled, happy path
  - `payment-failures.json` — Stripe returns declined cards, PayPal returns errors
  - `video-degraded.json` — Twilio returns room creation failures, participant drops
  - `email-bounces.json` — SendGrid returns bounce/spam reports
  - `search-empty.json` — Azure Search returns zero results
  - `background-check-pending.json` — Sterling/Certn returns "in progress" indefinitely
  - `crisis-flow.json` — Risk screening returns high-severity, triggers crisis pathway
  - `rate-limited.json` — All external services return 429s
  - `offline.json` — All external services timeout (tests offline resilience)
- **Management command**: `python manage.py set_mock_profile <profile-name>`
  - Reads profile JSON → sets Django cache keys → mocks read cache on each call
  - Supports `--override service=failure_mode` for ad-hoc overrides
  - `python manage.py set_mock_profile default --override stripe=card_declined`
- **Frontend equivalent**: Script that writes `.env.test.local` with the right MSW handler overrides
- **Runtime toggle**: Django middleware that reads `X-Mock-Profile` header (dev/test only, disabled via `DEBUG` check) so QA can switch profiles per-request
- **Profile validation**: Warn if profile references services/modes that don't exist in the mock layer

---

### Skill 7: `patient-data-integrity-check`

**Purpose**: Verify referential integrity, consistency, and validity of patient/provider data across all models.

**Must include**:
- **Orphan detection**:
  - Clients without User records
  - CareProviders without User records
  - Appointments referencing deleted Users
  - Notes without matching Appointments (via room_name)
  - UserResponses without Users
  - Payment records without Appointments
- **Consistency checks**:
  - User.user_type matches actual profile (CLIENT has Client record, CAREPROVIDER has CareProvider record)
  - Appointment.care_provider actually has CareProvider profile
  - Appointment.client actually has Client profile
  - Appointment date ranges are valid (start < end, not in distant past/future)
  - Slot availability matches Appointment bookings (no double-bookings)
  - CareProvider credentials have valid date ranges (granted < valid_until)
  - NPI numbers pass Luhn check digit validation
  - Risk screening scores match sum of response details
- **Business rule validation**:
  - Providers with `is_licensed=False` should not have active appointments
  - Appointments with `is_status=COMPLETED` must have matching payment records
  - Crisis-flagged risk screenings (`is_severe=True`) must have follow-up records
  - Provider `modalities` must match their Appointment modalities
  - Consent flags (`tandc_consent`, `is_agree`) must be True for active users
- **Management command**: `python manage.py check_data_integrity [--fix] [--model MODEL] [--verbose]`
  - `--fix`: Attempt safe auto-fixes (set orphan records inactive, recalculate scores)
  - `--model`: Check only specific model (e.g., `Appointment`, `CareProvider`)
  - Output: Summary table + detailed JSON report

---

### Skill 8: `api-response-sanitizer`

**Purpose**: Ensure API responses never leak PHI/PII beyond what the requesting user is authorized to see.

**Must include**:
- **Serializer audit**: For every DRF serializer and GraphQL object type that touches Tier 1/2 models:
  - List all exposed fields
  - Check for `fields = '__all__'` (flag as violation)
  - Verify sensitive fields have `write_only=True` or are excluded
  - Check that `SerializerMethodField`s don't leak related PHI
- **GraphQL schema audit**:
  - Parse `apps/graphqlapp/schema.py` and all imported schemas
  - For each `DjangoObjectType`, check `Meta.fields` vs `Meta.exclude`
  - Flag any type that exposes: `notes`, `final_keywords`, `is_severe`, `reason`, `issues`, `summary_of_issue`, `google_token`, `microsoft_token`, `npi_number`, `license_number`, `insurance_policy_number`
  - Check resolver functions for ownership filtering (does the resolver filter by `request.user`?)
- **Response middleware**: Create/verify Django middleware that:
  - Strips `null` sensitive fields from responses (don't send `"notes": null` — omit the key)
  - Redacts email in error responses (show `j***@example.com` not full email)
  - Removes stack traces from non-DEBUG responses
  - Sets appropriate cache headers (`no-store` for PHI endpoints)
- **Frontend audit**:
  - Scan Redux store slices for PHI fields being cached in client state
  - Check `console.log` / `console.error` statements for user data
  - Verify sensitive data isn't persisted in localStorage/sessionStorage beyond auth tokens
  - Check Apollo cache configuration — PHI queries should use `fetchPolicy: 'no-cache'`
- Output: Field-level exposure map (endpoint → fields exposed → authorized viewers → violation?)

---

### Skill 9: `frontend-test-scaffold`

**Purpose**: Bootstrap the missing frontend testing infrastructure for `RG-Frontend/`.

**Must include**:
- **Install testing dependencies**:
  - `jest`, `@types/jest`, `ts-jest`, `jest-environment-jsdom`
  - `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
  - `msw` (Mock Service Worker)
  - `@testing-library/react-hooks` (for custom hook testing)
- **Configuration files**:
  - `jest.config.ts` — module aliases matching `tsconfig.json` paths, transform config for Next.js
  - `jest.setup.ts` — import `@testing-library/jest-dom`, MSW server setup, mock `next/router`
  - `src/mocks/server.ts` — MSW server for tests
  - `src/mocks/browser.ts` — MSW browser for dev/storybook
  - `src/mocks/handlers/` — handler files per domain
- **Test templates** (generate one example per category):
  - **Component test**: `src/components/__tests__/example.test.tsx` — render, interaction, snapshot
  - **Page test**: `src/pages/__tests__/example.test.tsx` — SSR props, routing, auth guard
  - **Hook test**: `src/hooks/__tests__/example.test.ts` — custom hook with API mock
  - **Store test**: `src/store/__tests__/example.test.ts` — Redux slice + async thunk
  - **API integration test**: `src/restapis/__tests__/example.test.ts` — Axios call with MSW
  - **GraphQL test**: `src/graphql/__tests__/example.test.ts` — Apollo query with MSW GraphQL handler
- **Package.json scripts**:
  - `yarn test` — jest with coverage
  - `yarn test:watch` — jest --watch
  - `yarn test:coverage` — jest --coverage with lcov output for SonarCloud
  - Update `yarn test-all` to include `yarn test` before build
- **CI integration**: Add test + coverage step to `.github/workflows/deploy.yml`
- **PHI-specific test patterns**: Template showing how to verify PHI fields are NOT rendered in DOM / NOT in localStorage after API call

---

### Skill 10: `credential-verification-workflow`

**Purpose**: Validate provider credentials (licenses, certifications, NPI) against business rules and external validation patterns.

**Must include**:
- **NPI validation**:
  - Luhn algorithm check on 10-digit NPI
  - Format validation (must start with 1 or 2 for individual providers)
  - Check `npi_year_granted < npi_valid_until`
  - Flag expired NPIs (`npi_valid_until < today`)
- **License validation**:
  - `ProfessionalLicense`: state + license_number format validation per jurisdiction
  - Expiration check (`professional_license_valid_until < today`)
  - Cross-reference: licensed state must be in provider's `Country` or service area
- **Certificate validation**:
  - `ProfessionalCertificate`: issuing org + level consistency
  - Expiration check
  - `CertificateLevel` FK must be valid for the certificate type
- **Academic degree validation**:
  - `AcademicDegree`: degree_type must be valid for provider's `my_role`
  - Year granted must be reasonable (not future, not > 80 years ago)
- **Pre-licensed provider rules**:
  - `PreLicensed.supervisor_name` and `supervisor_license_number` must be populated
  - `anticipated_completion_date` must be future
  - Provider `is_licensed` must be False
- **Credential completeness scoring**:
  - Calculate `CareProviderScore` fields based on credential data
  - Flag providers with `overall_score` that doesn't match calculated score
- **Management command**: `python manage.py validate_credentials [--provider-id ID] [--fix-scores] [--report-format json|markdown]`
- **Automated checks**: Can be wired into provider onboarding flow or run as scheduled task

---

### Skill 11: `django-model-security-hardening`

**Purpose**: Apply security hardening patterns to Django models that handle sensitive data.

**Must include**:
- **Field-level encryption** recommendations:
  - Which fields to encrypt (OAuth tokens, clinical notes, NPI, license numbers, insurance policy numbers)
  - Library options: `django-encrypted-model-fields`, `django-fernet-fields`, `django-cryptographic-fields`
  - Migration strategy: add encrypted field → backfill → drop plaintext → rename
- **Audit logging**:
  - Install/configure `django-auditlog` or `django-simple-history` for Tier 1 models
  - Track: who accessed, what changed, when, from what IP
  - Models to audit: `Notes`, `UserResponse`, `Appointment`, `User`, `CareProvider`
- **Soft delete**:
  - Verify all PHI models use soft delete (not hard `DELETE`)
  - Check for `is_active` flag usage vs actual deletion
  - Flag any `Model.objects.filter().delete()` calls on PHI models
- **Data retention**:
  - Define retention periods per data type (clinical notes: 7 years, risk screening: 7 years, appointment records: 7 years, payment: 7 years per HIPAA)
  - Management command to identify records past retention period
  - Anonymization strategy: replace PII with hashed/dummy values rather than deleting
- **Query restrictions**:
  - Custom model managers that filter by ownership (e.g., `NotesManager` that auto-filters by `care_provider=request.user.care_provider`)
  - Prevent `.all()` queries on PHI models without explicit ownership filter
- **Signal-based protections**:
  - `pre_save` signal on `Notes` to strip HTML/scripts from clinical notes
  - `post_save` signal on `UserResponse` with `is_severe=True` to trigger alert workflow
  - `pre_delete` signal on all PHI models to log deletion attempt

---

### Skill 12: `consent-tracking-audit`

**Purpose**: Verify that consent collection, storage, and enforcement is complete and correct across the platform.

**Must include**:
- **Consent points inventory**:
  - Map every consent flag in the database: `User.is_agree`, `Client.tandc_consent`, `CareProvider.agree_Credential_Status`
  - Map every consent UI in the frontend: signup forms, T&C checkboxes, cookie banners
  - Identify missing consent points: video recording consent, clinical notes sharing, risk screening data usage, data export consent
- **Consent enforcement**:
  - Verify backend enforces consent before allowing actions (e.g., can't book appointment without T&C consent)
  - Check that consent withdrawal is possible and cascades (deletes/anonymizes associated data)
  - Verify consent is re-collected when terms change (timestamp comparison)
- **Consent for minors/dependents**:
  - `User.parent_user` relationship: verify parent consent is required for minor profiles
  - `User.relationship` field: check guardian consent flows
  - Age verification: `User.date_of_birth` check against jurisdiction age-of-consent
- **Data subject rights (GDPR/state privacy laws)**:
  - Right to access: Is there an endpoint to export all user data?
  - Right to deletion: Is there a deletion workflow that cascades through all models?
  - Right to portability: Can data be exported in machine-readable format?
  - Right to rectification: Can users correct their own data?
- Output: Consent map (consent point → model field → UI location → enforcement check → status)

---

### Skill 13: `backend-endpoint-security-test`

**Purpose**: Generate and run security-focused tests for every backend endpoint.

**Must include**:
- **Authentication tests** (per endpoint):
  - Request without token → 401
  - Request with expired token → 401
  - Request with malformed token → 401
  - Request with valid token → 200/appropriate status
- **Authorization tests** (per endpoint):
  - Client accessing provider-only endpoint → 403
  - Provider accessing client-only endpoint → 403
  - User A accessing User B's data → 403 (IDOR check)
  - Non-owner accessing PHI (notes, risk screening) → 403
- **Input validation tests**:
  - SQL injection payloads in string fields
  - XSS payloads in text fields (especially `notes`, `reason`, `issues`)
  - Oversized payloads (field length limits)
  - Invalid data types (string where int expected, etc.)
  - Path traversal in file upload fields
- **Rate limiting tests**:
  - Verify rate limits exist on auth endpoints (login, OTP, password reset)
  - Verify rate limits on search endpoints
  - Verify rate limits on payment endpoints
- **GraphQL-specific tests**:
  - Query depth limit enforcement
  - Query complexity limit enforcement
  - Introspection disabled in production
  - Batch query limits
  - Alias-based DoS prevention
- **Test generation**: Management command `python manage.py generate_security_tests [--app APP] [--endpoint ENDPOINT]`
  - Reads URL patterns from `urls.py`
  - Generates test file per app with all above patterns
  - Uses existing factories for test data

---

### Skill 14: `deployment-readiness-check`

**Purpose**: Pre-deployment checklist that validates security, compliance, and configuration before any environment promotion.

**Must include**:
- **Settings audit**:
  - `DEBUG` must be `False`
  - `SECRET_KEY` must not be the dev default
  - `ALLOWED_HOSTS` must not contain `"*"`
  - `CORS_ORIGIN_ALLOW_ALL` must be `False`
  - `CORS_ALLOWED_ORIGINS` must be explicitly listed
  - `SECURE_SSL_REDIRECT = True`
  - `SESSION_COOKIE_SECURE = True`
  - `CSRF_COOKIE_SECURE = True`
  - `SECURE_HSTS_SECONDS > 0`
  - `SECURE_BROWSER_XSS_FILTER = True`
  - `X_FRAME_OPTIONS = "DENY"`
- **Secret management**:
  - No secrets hardcoded in `settings.py`, `urls.py`, or any `.py` file
  - `.env` files not in version control (check `.gitignore`)
  - Frontend `NEXT_PUBLIC_*` vars don't contain server-side secrets
  - Stripe secret key NOT in frontend env
- **Dependency audit**:
  - `pip audit` (or `safety check`) on `requirements.txt`
  - `yarn audit` on `package.json`
  - Flag any dependency with critical/high CVE
- **Database readiness**:
  - All migrations applied (`showmigrations` shows no unapplied)
  - No pending `makemigrations` needed
  - Fixtures loaded successfully (taxonomy data present)
- **External service configuration**:
  - All required env vars present (Twilio, Stripe, SendGrid, Azure Search)
  - Service credentials are production credentials (not test keys)
  - Webhook URLs configured for production domain
- **Frontend build**:
  - `yarn build` succeeds without errors
  - No TypeScript errors (`yarn check-types`)
  - No lint errors (`yarn lint`)
  - Bundle size within acceptable limits
- **Output**: Pass/fail checklist with remediation steps for each failure

---

## Execution Instructions

For each of the 14 skills above:

1. **Create the directory**: `.claude/skills/<skill-name>/`
2. **Write `SKILL.md`** following the template format with frontmatter
3. **Include concrete file paths** from this codebase (not generic placeholders)
4. **Include actual regex patterns** (tested against Python/grep syntax)
5. **Include actual Django management commands** (with proper app imports and argument parsing)
6. **Reference existing factories** by their actual class names and import paths from `apps/*/tests/conftest.py`
7. **Reference actual model fields** from the Data Sensitivity Map above
8. **Make each skill independently runnable** — no skill should depend on another skill having been run first

After creating all 14 skills, update `.claude/settings.json` to register each skill, and create an index file at `.claude/skills/README.md` listing all skills with their trigger phrases.

## Quality Checklist

Before finalizing, verify each skill:
- [ ] Has frontmatter with `name`, `description`, and `argument-hint`
- [ ] Description includes 3+ trigger phrases for discoverability
- [ ] References real file paths from this codebase
- [ ] Uses actual model/field names (not placeholders)
- [ ] Includes at least one concrete command or code snippet
- [ ] Handles both "check/audit" mode and "fix/remediate" mode where applicable
- [ ] Notes project-specific gotchas (e.g., `auto_now_add` + `loaddata` incompatibility, `djmoney` serializer edge cases)
- [ ] Each workflow step is actionable (not just "review the code")
