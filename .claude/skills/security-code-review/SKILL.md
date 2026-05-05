---
name: security-code-review
description: Automated security review against OWASP Top 10 for Django + Next.js patterns. Use when asked to "security review", "OWASP audit", "vulnerability scan", "check for injection", "find security issues", or "pen test prep".
argument-hint: [--category A01-A10|all] [--scope backend|frontend|all] [--app APP_NAME] [--fix]
frequency: every-pr
---

# OWASP Top 10 Security Code Review

## When to Use
- Before any production deployment
- During pull request reviews for security-sensitive code
- When adding new endpoints, mutations, or views
- After dependency updates
- During penetration test preparation

## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- Working directory must be the repository root (`C:\Projects\ReallyGlobal\`) -- all grep commands use relative paths
- For dependency audit: `pip` and `yarn` available (or Docker running)

## Workflow

### A01: Broken Access Control

**Healthcare Impact**: Broken access control in a healthcare context means a client could read another client's therapy notes, risk screening results, or appointment reasons -- a direct HIPAA violation under 45 CFR 164.312(a)(1).

```bash
# Find views/viewsets missing permission_classes
grep -rn --include="*.py" -E 'class\s+\w+(View|ViewSet|APIView)' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=tests \
  | while read line; do
    file=$(echo "$line" | cut -d: -f1)
    lineno=$(echo "$line" | cut -d: -f2)
    # Check if permission_classes is set within 15 lines
    result=$(sed -n "${lineno},$((lineno+15))p" "$file" | grep 'permission_classes')
    if [ -z "$result" ]; then
      echo "MISSING permission_classes: $line"
    fi
  done

# IDOR checks: direct pk lookups without ownership filter
grep -rn --include="*.py" -E '\.objects\.(get|filter)\(.*pk=.*request\.(data|query_params|GET|POST)' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=tests

# Check for missing user ownership in queryset
grep -rn --include="*.py" -E '\.objects\.all\(\)|\.objects\.filter\(' \
  Lumy-Backend/apps/video_conferencing/views.py \
  Lumy-Backend/apps/risk_screening/views.py \
  Lumy-Backend/apps/calendar_functionality/views.py \
  | grep -v 'user\|care_provider\|client'

# GraphQL mutations without auth check
grep -rn --include="*.py" -B 5 -A 15 'def mutate' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=tests \
  | grep -E 'def mutate|info\.context\.user|login_required|permission'

# Check for @login_required vs DRF permission_classes consistency
grep -rn --include="*.py" '@login_required' Lumy-Backend/apps/ --exclude-dir=__pycache__
```

### A02: Cryptographic Failures

**Healthcare Impact**: Cryptographic failures expose clinical notes, OAuth tokens, and provider credentials. Under HIPAA, unencrypted PHI transmission or storage without compensating controls violates 45 CFR 164.312(a)(2)(iv) and 164.312(e)(1).

```bash
# Plaintext token storage
grep -rn --include="*.py" -E 'models\.(Text|Char)Field.*token|models\.(Text|Char)Field.*secret|models\.(Text|Char)Field.*key' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=migrations --exclude-dir=tests

# Weak hashing
grep -rn --include="*.py" -E 'md5|sha1[^0-9]|hashlib\.md5|hashlib\.sha1' \
  Lumy-Backend/ --exclude-dir=__pycache__ --exclude-dir=.venv --exclude-dir=venv

# Missing SECURE_* settings
grep -rn -E 'SECURE_SSL_REDIRECT|SECURE_HSTS|SESSION_COOKIE_SECURE|CSRF_COOKIE_SECURE' \
  Lumy-Backend/lumy_global/settings.py

# Hardcoded SECRET_KEY
grep -rn 'SECRET_KEY' Lumy-Backend/lumy_global/settings.py \
  | grep -v 'env\|os\.environ\|config\|getenv'
```

### A03: Injection

**Healthcare Impact**: SQL injection on PHI tables could exfiltrate clinical notes, risk screening scores, and provider credentials. GraphQL without depth limits could DoS the platform during a crisis screening flow.

```bash
# Raw SQL usage
grep -rn --include="*.py" -E '\.raw\(|\.extra\(|RawSQL\(' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=tests

# f-string or format in SQL-like contexts
grep -rn --include="*.py" -E 'execute\(.*f"|execute\(.*\.format\(' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Template injection / mark_safe usage
grep -rn --include="*.py" 'mark_safe\(' Lumy-Backend/apps/ --exclude-dir=__pycache__

# Frontend: dangerouslySetInnerHTML
grep -rn --include="*.tsx" --include="*.ts" --include="*.jsx" \
  'dangerouslySetInnerHTML' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next

# GraphQL query depth/complexity limits
grep -rn -E 'GRAPHENE|graphene|depth_limit|query_depth|max_complexity' \
  Lumy-Backend/lumy_global/settings.py

# Check for missing GraphQL depth limiting middleware
grep -rn -E 'DepthAnalysisBackend|MaxQueryDepthMiddleware|graphql_depth_limit' \
  Lumy-Backend/lumy_global/settings.py \
  Lumy-Backend/apps/graphqlapp/
```

### A04: Insecure Design

**Healthcare Impact**: No rate limiting on the risk screening endpoint means an attacker could enumerate crisis-flagged users. No account lockout allows brute-force access to provider accounts containing clinical data.

```bash
# Rate limiting
grep -rn --include="*.py" -E 'ratelimit|throttle|Throttle|rate_limit' \
  Lumy-Backend/apps/ Lumy-Backend/lumy_global/settings.py --exclude-dir=__pycache__

# CAPTCHA on public forms
grep -rn --include="*.py" --include="*.ts" --include="*.tsx" \
  -i 'captcha\|recaptcha\|hcaptcha' \
  Lumy-Backend/ RG-Frontend/src/ \
  --exclude-dir=__pycache__ --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.venv

# Account lockout
grep -rn --include="*.py" -E 'lockout|failed_attempts|max_attempts|account_lock' \
  Lumy-Backend/apps/authentication/ --exclude-dir=__pycache__
```

### A05: Security Misconfiguration

**Healthcare Impact**: DEBUG=True in production exposes stack traces containing PHI field names, database queries with patient data, and internal API structure. CORS_ORIGIN_ALLOW_ALL allows any malicious site to make authenticated requests reading clinical data.

```bash
# Critical settings check
grep -rn -E '^DEBUG\s*=|^ALLOWED_HOSTS\s*=|^CORS_ORIGIN_ALLOW_ALL\s*=|^CORS_ALLOW_ALL_ORIGINS\s*=' \
  Lumy-Backend/lumy_global/settings.py

# Missing security headers
grep -rn -E 'X_FRAME_OPTIONS|CONTENT_SECURITY_POLICY|Referrer-Policy|Permissions-Policy' \
  Lumy-Backend/lumy_global/settings.py

# CSRF_TRUSTED_ORIGINS check
grep -rn 'CSRF_TRUSTED_ORIGINS' Lumy-Backend/lumy_global/settings.py

# Django admin exposure
grep -rn 'admin\.site\.urls\|admin/' Lumy-Backend/lumy_global/urls.py
```

### A06: Vulnerable and Outdated Components

**Healthcare Impact**: Known CVEs in Django, Next.js, or Twilio SDK could be exploited to access PHI. Healthcare platforms are high-value targets with mandatory breach reporting, making timely patching critical.

```bash
# Backend dependency audit (run in Docker or local venv)
cd Lumy-Backend && pip audit 2>/dev/null || echo "pip-audit not installed; run: pip install pip-audit"

# Check for known-vulnerable Django version
grep -E '^Django==' Lumy-Backend/requirements.txt

# Frontend dependency audit
cd RG-Frontend && yarn audit --level high 2>/dev/null || npm audit --audit-level=high 2>/dev/null

# Check Next.js version for known CVEs
grep '"next"' RG-Frontend/package.json
```

### A07: Identification and Authentication Failures

**Healthcare Impact**: JWT tokens in localStorage are XSS-accessible. If an attacker steals a provider's token, they gain access to all that provider's clients' clinical notes and session data.

```bash
# JWT configuration
grep -rn -E 'SIMPLE_JWT|ACCESS_TOKEN_LIFETIME|REFRESH_TOKEN_LIFETIME|ROTATE_REFRESH_TOKENS|BLACKLIST_AFTER_ROTATION' \
  Lumy-Backend/lumy_global/settings.py

# Token storage in frontend (localStorage is XSS-vulnerable)
grep -rn --include="*.ts" --include="*.tsx" --include="*.js" \
  -E 'localStorage\.(setItem|getItem).*token|sessionStorage\.(setItem|getItem).*token' \
  RG-Frontend/src/ --exclude-dir=node_modules --exclude-dir=.next

# Password validation settings
grep -rn 'AUTH_PASSWORD_VALIDATORS' Lumy-Backend/lumy_global/settings.py -A 20

# Refresh token rotation
grep -rn 'ROTATE_REFRESH_TOKENS\|BLACKLIST_AFTER_ROTATION' Lumy-Backend/lumy_global/settings.py
```

### A08: Software and Data Integrity Failures

**Healthcare Impact**: Deserializing untrusted input (pickle, eval) could allow remote code execution with database access to all PHI tables.

```bash
# Deserialization of untrusted input
grep -rn --include="*.py" -E 'pickle\.loads|yaml\.load\(|eval\(' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=tests

# Unsigned cookies
grep -rn 'SESSION_ENGINE\|SESSION_COOKIE' Lumy-Backend/lumy_global/settings.py

# CSP headers check
grep -rn 'Content-Security-Policy\|CSP_' Lumy-Backend/lumy_global/settings.py
```

### A09: Security Logging and Monitoring Failures

**Healthcare Impact**: Without logging on PHI access, the platform cannot detect unauthorized access, satisfy HIPAA audit requirements (164.312(b)), or respond to breach investigations. Missing payment logging creates financial audit gaps.

```bash
# Check for LOGGING configuration
grep -rn 'LOGGING\s*=' Lumy-Backend/lumy_global/settings.py -A 40

# Check for auth event logging
grep -rn --include="*.py" -E 'logger|logging' \
  Lumy-Backend/apps/authentication/views.py \
  Lumy-Backend/apps/authentication/mutations.py

# Check for payment operation logging
grep -rn --include="*.py" -E 'logger|logging' \
  Lumy-Backend/apps/stripe_integration/views.py

# Check for PHI access logging
grep -rn --include="*.py" -E 'logger|logging' \
  Lumy-Backend/apps/video_conferencing/views.py \
  Lumy-Backend/apps/risk_screening/views.py
```

### A10: Server-Side Request Forgery (SSRF)

**Healthcare Impact**: SSRF could be used to access internal services, database connections, or cloud metadata endpoints, potentially exfiltrating PHI or credentials.

```bash
# URL inputs passed to requests library
grep -rn --include="*.py" -E 'requests\.(get|post|put|delete|patch)\(' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=tests

# urllib usage
grep -rn --include="*.py" -E 'urllib\.(request|parse)\.urlopen|urlopen\(' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__

# Webhook URL validation
grep -rn --include="*.py" -i 'webhook.*url\|callback.*url' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__
```

## Known Patterns & Gotchas

1. **JWT in localStorage**: The frontend stores JWT tokens in localStorage (XSS-accessible). See `RG-Frontend/src/store/axiosInstance.ts` and related token helpers. This is a known A07 violation.

2. **No GraphQL depth limiting**: The Graphene-Django setup in `lumy_global/settings.py` does not configure query depth limits, enabling potential DoS via deeply nested queries.

3. **`CORS_ORIGIN_ALLOW_ALL = True`**: Found in `Lumy-Backend/lumy_global/settings.py`. This allows any origin to make credentialed requests.

4. **`DEBUG = True` with `ALLOWED_HOSTS = ["*"]`**: Both are hardcoded in settings.py without environment variable overrides for production.

5. **OAuth tokens as plaintext TextFields**: `User.google_token`, `User.microsoft_token` and their refresh counterparts are stored without encryption.

6. **No CSRF on GraphQL**: GraphQL endpoint at `/api/v1/graphql/` may have CSRF exemption. Check `urls.py` for `csrf_exempt` decorator on the GraphQL view.

7. **`react-quill` in frontend**: Rich text editor that can produce HTML output. Check for XSS sanitization before storing/rendering.

## Output
- **File**: `ContextFiles2/Library/Sessions/security-code-review_Results_{YYYY-MM-DD}.md`
- **Format**: Severity-ranked findings with CWE references, OWASP category, and fix suggestions
- **Delta**: If a previous output file exists, highlight new findings and resolved items

## Example Invocations

```
/security-code-review
/security-code-review --category A01
/security-code-review --scope backend --category A03
/security-code-review --category all --fix
/security-code-review --category A01 --app risk_screening      # Check IDOR on risk screening
/security-code-review --category A03 --scope frontend          # XSS in rich text editor
```
