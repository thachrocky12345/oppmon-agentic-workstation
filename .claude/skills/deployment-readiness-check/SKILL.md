---
name: deployment-readiness-check
description: Pre-deployment checklist validating security, compliance, and configuration before environment promotion. Use when asked to "deployment check", "pre-deploy audit", "production readiness", "go-live checklist", "release validation", or "deploy check".
argument-hint: [--env staging|production] [--section settings|secrets|deps|database|services|frontend|all] [--fix]
frequency: pre-deployment
---

# Deployment Readiness Check

## When to Use
- Before deploying to staging or production
- After major feature branches are merged
- As part of release candidate validation
- When setting up a new environment
- During go-live readiness review

## Prerequisites
- Access to `Lumy-Backend/` and `RG-Frontend/` source trees
- For dependency audit: `pip` and `yarn` available
- For database checks: Django `manage.py` executable (Docker or local)

## Workflow

### Step 1: Django Settings Audit

```bash
# Read current settings
grep -n -E '^(DEBUG|ALLOWED_HOSTS|CORS_ORIGIN_ALLOW_ALL|CORS_ALLOW_ALL_ORIGINS|SECRET_KEY|SECURE_SSL_REDIRECT|SESSION_COOKIE_SECURE|CSRF_COOKIE_SECURE|SECURE_HSTS_SECONDS|SECURE_BROWSER_XSS_FILTER|X_FRAME_OPTIONS|SECURE_CONTENT_TYPE_NOSNIFF)' \
  Lumy-Backend/lumy_global/settings.py
```

**Required values for production:**

| Setting | Required Value | How to Check |
|---|---|---|
| `DEBUG` | `False` | `grep '^DEBUG' settings.py` |
| `SECRET_KEY` | NOT the dev default | `grep 'SECRET_KEY' settings.py` -- must use `env()` |
| `ALLOWED_HOSTS` | Explicit list, NOT `["*"]` | `grep 'ALLOWED_HOSTS' settings.py` |
| `CORS_ORIGIN_ALLOW_ALL` | `False` | `grep 'CORS_ORIGIN_ALLOW_ALL' settings.py` |
| `CORS_ALLOWED_ORIGINS` | Explicit URL list | `grep 'CORS_ALLOWED_ORIGINS' settings.py` |
| `SECURE_SSL_REDIRECT` | `True` | `grep 'SECURE_SSL_REDIRECT' settings.py` |
| `SESSION_COOKIE_SECURE` | `True` | `grep 'SESSION_COOKIE_SECURE' settings.py` |
| `CSRF_COOKIE_SECURE` | `True` | `grep 'CSRF_COOKIE_SECURE' settings.py` |
| `SECURE_HSTS_SECONDS` | `> 0` (recommend 31536000) | `grep 'SECURE_HSTS_SECONDS' settings.py` |
| `SECURE_BROWSER_XSS_FILTER` | `True` | `grep 'SECURE_BROWSER_XSS_FILTER' settings.py` |
| `X_FRAME_OPTIONS` | `"DENY"` | `grep 'X_FRAME_OPTIONS' settings.py` |
| `SECURE_CONTENT_TYPE_NOSNIFF` | `True` | `grep 'SECURE_CONTENT_TYPE_NOSNIFF' settings.py` |

```python
# Django shell check (run in container or venv)
from django.conf import settings

checks = {
    'DEBUG': (settings.DEBUG, False, 'DEBUG must be False'),
    'ALLOWED_HOSTS': (settings.ALLOWED_HOSTS, lambda v: '*' not in v, 'ALLOWED_HOSTS must not contain "*"'),
    'SECRET_KEY_LENGTH': (len(settings.SECRET_KEY), lambda v: v >= 50, 'SECRET_KEY too short'),
    'SECURE_SSL_REDIRECT': (getattr(settings, 'SECURE_SSL_REDIRECT', False), True, 'SECURE_SSL_REDIRECT must be True'),
    'SESSION_COOKIE_SECURE': (getattr(settings, 'SESSION_COOKIE_SECURE', False), True, 'SESSION_COOKIE_SECURE must be True'),
    'CSRF_COOKIE_SECURE': (getattr(settings, 'CSRF_COOKIE_SECURE', False), True, 'CSRF_COOKIE_SECURE must be True'),
}

for name, (actual, expected, msg) in checks.items():
    if callable(expected):
        passed = expected(actual)
    else:
        passed = actual == expected
    status = 'PASS' if passed else 'FAIL'
    print(f"[{status}] {name}: {actual} -- {msg if not passed else 'OK'}")
```

### Step 2: Secret Management Audit

```bash
# Check for hardcoded secrets in Python files
grep -rn --include="*.py" \
  -E '(SECRET_KEY|STRIPE_SECRET|TWILIO_AUTH_TOKEN|SENDGRID_KEY|AZURE_SEARCH.*KEY)\s*=\s*["\x27][a-zA-Z0-9]' \
  Lumy-Backend/lumy_global/settings.py \
  Lumy-Backend/apps/ \
  --exclude-dir=__pycache__ --exclude-dir=tests

# Check .gitignore for env files
grep -E '\.env|\.env\.local|\.env\.production' Lumy-Backend/.gitignore RG-Frontend/.gitignore 2>/dev/null

# Verify .env files are NOT tracked in git
cd Lumy-Backend && git ls-files --error-unmatch .env 2>/dev/null && echo "WARNING: .env is tracked!" || echo "OK: .env not tracked"
cd ../RG-Frontend && git ls-files --error-unmatch .env.local 2>/dev/null && echo "WARNING: .env.local is tracked!" || echo "OK: .env.local not tracked"

# Check frontend NEXT_PUBLIC_* vars for server-side secrets
grep -rn 'NEXT_PUBLIC_' RG-Frontend/.env.local 2>/dev/null \
  | grep -i -E 'secret|private|key.*api|token' \
  | grep -v 'CLIENT_ID\|PUBLIC_KEY'

# CRITICAL: Check for Stripe secret key in frontend
grep -i 'STRIPE_SECRET' RG-Frontend/.env.local RG-Frontend/.env 2>/dev/null
```

### Step 3: Dependency Audit

```bash
# Backend: pip audit
cd Lumy-Backend
pip audit 2>/dev/null || echo "Install pip-audit: pip install pip-audit"

# Check for known-vulnerable versions
grep -E '^Django==' requirements.txt
grep -E '^djangorestframework==' requirements.txt
grep -E '^graphene-django==' requirements.txt
grep -E '^Pillow==' requirements.txt
grep -E '^requests==' requirements.txt

# Frontend: yarn audit
cd ../RG-Frontend
yarn audit --level high 2>/dev/null || npm audit --audit-level=high 2>/dev/null

# Check Next.js version
grep '"next"' package.json
grep '"react"' package.json
```

### Step 4: Database Readiness

```bash
# Check for unapplied migrations
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py showmigrations --list 2>/dev/null \
  | grep '\[ \]' || echo "All migrations applied"

# Check for pending makemigrations
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py makemigrations --check --dry-run 2>/dev/null

# Verify taxonomy fixtures loaded (spot check)
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python manage.py shell -c "
from apps.care_provider.models import NavigationCategory, MyRole, Country, CountryCode
print(f'NavigationCategories: {NavigationCategory.objects.count()}')
print(f'MyRoles: {MyRole.objects.count()}')
print(f'Countries: {Country.objects.count()}')
print(f'CountryCodes: {CountryCode.objects.count()}')
if NavigationCategory.objects.count() == 0:
    print('WARNING: Taxonomy fixtures not loaded!')
"
```

### Step 5: External Service Configuration

```bash
# Check all required environment variables are set (backend)
REQUIRED_BACKEND_VARS=(
    "DATABASE_NAME" "DATABASE_USER" "DATABASE_PASS" "POSTGRES_HOST" "POSTGRES_PORT"
    "TWILIO_ACCOUNT_SID" "TWILIO_AUTH_TOKEN" "TWILIO_API_KEY_SID" "TWILIO_API_KEY_SECRET"
    "STRIPE_SECRET_KEY" "STRIPE_PUBLISHABLE_KEY"
    "SENDGRID_KEY" "SENDGRID_EMAIL"
    "AZURE_SEARCH_ADMIN_API_KEY" "AZURE_SEARCH_ENDPOINT" "SERVICE_NAME"
    "SECRET_KEY"
)

echo "=== Backend Environment Variables ==="
for var in "${REQUIRED_BACKEND_VARS[@]}"; do
    MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python -c "
import os
val = os.environ.get('$var', '')
if val:
    print(f'[PASS] $var: set ({len(val)} chars)')
else:
    print(f'[FAIL] $var: NOT SET')
" 2>/dev/null || echo "[SKIP] $var: Cannot check (container not running)"
done

# Verify production vs test credentials
MSYS_NO_PATHCONV=1 docker exec reallyglobal-backend-1 python -c "
import os
stripe_key = os.environ.get('STRIPE_SECRET_KEY', '')
if stripe_key.startswith('sk_test_'):
    print('[WARN] Stripe using TEST key')
elif stripe_key.startswith('sk_live_'):
    print('[PASS] Stripe using LIVE key')
else:
    print('[FAIL] Stripe key format unrecognized')

twilio_sid = os.environ.get('TWILIO_ACCOUNT_SID', '')
if twilio_sid.startswith('AC'):
    print('[PASS] Twilio SID format correct')
else:
    print('[WARN] Twilio SID format unexpected')
" 2>/dev/null
```

### Step 6: Frontend Build Verification

```bash
cd RG-Frontend

# TypeScript check
echo "=== TypeScript Check ==="
yarn check-types 2>&1 | tail -5

# Lint check
echo "=== Lint Check ==="
yarn lint 2>&1 | tail -5

# Production build
echo "=== Production Build ==="
yarn build 2>&1 | tail -10

# Check build output size
if [ -d ".next" ]; then
    echo "=== Bundle Size ==="
    du -sh .next/ 2>/dev/null
    # Check for oversized pages
    find .next/server/pages -name "*.js" -size +500k 2>/dev/null \
      | while read f; do echo "WARN: Large page bundle: $f ($(du -sh "$f" | cut -f1))"; done
fi

# Verify no source maps in production build
find .next -name "*.map" 2>/dev/null | head -5
if [ $? -eq 0 ]; then
    echo "WARN: Source maps present in build (disable for production)"
fi
```

### Step 7: Security Headers Check

```bash
# If the app is running, check response headers
curl -sI http://localhost:8000/api/v1/ 2>/dev/null | grep -iE 'x-frame|content-security|strict-transport|x-content-type|referrer-policy|permissions-policy'

curl -sI http://localhost:3000/ 2>/dev/null | grep -iE 'x-frame|content-security|strict-transport|x-content-type|referrer-policy|permissions-policy'
```

### Step 8: Generate Pass/Fail Checklist

```markdown
# Deployment Readiness Report -- [DATE] -- [ENV]

## Settings
| Check | Status | Value | Required |
|---|---|---|---|
| DEBUG | PASS/FAIL | [actual] | False |
| SECRET_KEY | PASS/FAIL | [length] chars | env-loaded, >= 50 chars |
| ALLOWED_HOSTS | PASS/FAIL | [actual] | No "*" |
| CORS_ORIGIN_ALLOW_ALL | PASS/FAIL | [actual] | False |
| SECURE_SSL_REDIRECT | PASS/FAIL | [actual] | True |
| SESSION_COOKIE_SECURE | PASS/FAIL | [actual] | True |
| CSRF_COOKIE_SECURE | PASS/FAIL | [actual] | True |
| SECURE_HSTS_SECONDS | PASS/FAIL | [actual] | > 0 |
| X_FRAME_OPTIONS | PASS/FAIL | [actual] | "DENY" |

## Secrets
| Check | Status | Notes |
|---|---|---|
| No hardcoded secrets in .py | PASS/FAIL | [details] |
| .env not in git | PASS/FAIL | [details] |
| No server secrets in NEXT_PUBLIC_* | PASS/FAIL | [details] |
| Stripe secret not in frontend | PASS/FAIL | [details] |

## Dependencies
| Check | Status | Notes |
|---|---|---|
| pip audit (critical/high) | PASS/FAIL | [count] vulnerabilities |
| yarn audit (critical/high) | PASS/FAIL | [count] vulnerabilities |
| Django version | [version] | [CVE status] |
| Next.js version | [version] | [CVE status] |

## Database
| Check | Status | Notes |
|---|---|---|
| All migrations applied | PASS/FAIL | [unapplied count] |
| No pending makemigrations | PASS/FAIL | [details] |
| Taxonomy fixtures loaded | PASS/FAIL | [counts] |

## External Services
| Service | Status | Key Type |
|---|---|---|
| Stripe | PASS/FAIL | test/live |
| Twilio | PASS/FAIL | [SID format] |
| SendGrid | PASS/FAIL | [set/missing] |
| Azure Search | PASS/FAIL | [set/missing] |
| PostgreSQL | PASS/FAIL | [connection status] |
| Redis | PASS/FAIL | [connection status] |

## Frontend
| Check | Status | Notes |
|---|---|---|
| TypeScript (no errors) | PASS/FAIL | [error count] |
| Lint (no errors) | PASS/FAIL | [error count] |
| Build succeeds | PASS/FAIL | [build time] |
| Bundle size | [size] | [threshold check] |
| No source maps | PASS/FAIL | [details] |

## Overall: PASS / FAIL
Blocking issues: [count]
Warnings: [count]
```

## Known Patterns & Gotchas

1. **`settings.py` uses hardcoded defaults**: The current `Lumy-Backend/lumy_global/settings.py` has `DEBUG = True`, `ALLOWED_HOSTS = ["*"]`, `CORS_ORIGIN_ALLOW_ALL = True`, and a hardcoded `SECRET_KEY`. For production, these MUST be overridden via environment variables. The settings file uses `django-environ` (`env = environ.Env()`), but not all settings are wired through it.

2. **`CSRF_TRUSTED_ORIGINS`**: Currently set to `["https://devapi.really.global"]` only. For production, this must include the actual production domain.

3. **Docker vs bare-metal**: If deploying to Docker, checks should run inside the container. If bare-metal, use the local venv. The `MSYS_NO_PATHCONV=1` prefix is needed on Windows (Git Bash) to prevent path mangling in `docker exec`.

4. **Frontend `.env` hierarchy**: Next.js loads `.env.local` > `.env.production.local` > `.env.production` > `.env`. For production builds, `NEXT_APP_BACKEND_BASE_URL` must point to the production backend URL, not `http://127.0.0.1:8000`.

5. **`yarn build` requires env vars**: The Next.js production build may fail if `NEXT_APP_BACKEND_BASE_URL` or other required env vars are not set. These are compile-time constants in Next.js.

6. **Redis connection**: The backend uses Redis for caching and django-rq job queue. Verify Redis is accessible from the production environment. The Docker compose stack includes `redis:7`.

7. **SonarCloud integration**: After pushing to a PR branch, SonarCloud analysis runs automatically. Check the quality gate status as part of deployment readiness (see sonarcloud-pr-audit skill).

8. **Database connection pooling**: For production with multiple workers, consider PgBouncer or Django's `CONN_MAX_AGE` setting. The default `CONN_MAX_AGE = 0` creates a new connection per request.

## Data Model & Accuracy Notes

1. **`SECRET_KEY` is hardcoded as a literal string**: In `Lumy-Backend/lumy_global/settings.py`, `SECRET_KEY` is set directly as a string constant, NOT loaded from an environment variable. Flag this explicitly as a CRITICAL production blocker -- it must be moved to `env("SECRET_KEY")`.

2. **`CORS_ORIGIN_ALLOW_ALL` is the correct setting name**: The project uses `CORS_ORIGIN_ALLOW_ALL = True` (django-cors-headers < 4.0 syntax). Also check for `CORS_ALLOW_ALL_ORIGINS` (4.0+ syntax) in case the library is upgraded.

3. **`CSRF_TRUSTED_ORIGINS` has only one origin**: Currently set to `["https://devapi.really.global"]`. For production, this must include the production domain(s).

4. **`SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` do NOT exist in settings**: These settings are entirely ABSENT from `settings.py`, not set to `False`. Flag their ABSENCE as a finding -- Django's defaults are insecure (`False` for all three).

5. **Check `GRAPHENE` settings for introspection**: In production, GraphQL introspection must be disabled. Check the `GRAPHENE` dict in `settings.py` for `"MIDDLEWARE"` that disables introspection or check for a custom `DisableIntrospection` middleware.

6. **CI/CD blocking gate (SOC 2 CC8.1)**: This check should be designed as a CI/CD pipeline gate that produces a non-zero exit code on FAIL findings, blocking deployment. The output must be machine-parseable (JSON option).

7. **BAA documentation**: Verify that Business Associate Agreements are documented for all PHI-touching vendors: Twilio (YES required), SendGrid (YES required), Azure (YES required), Stripe (NO -- PCI only), PayPal (NO), Sterling/Certn (NO -- pre-hire screening).

8. **`MockProfileMiddleware` must not be active in production**: Verify that any mock/debug middleware (including `MockProfileMiddleware` if it exists) is conditionally loaded only when `DEBUG=True`.

9. **Stripe secret key must NOT appear in frontend**: Verify that `STRIPE_SECRET_KEY` is not present in any `RG-Frontend/.env*` file or in any `NEXT_PUBLIC_*` variable.

10. **Output must produce timestamped evidence**: For SOC 2 Type II audit readiness, each deployment check run must produce a timestamped report file at `ContextFiles2/Library/Sessions/deployment-readiness_{YYYY-MM-DD}_{ENV}.md` that can be retained as audit evidence.

## Example Invocations

```
/deployment-readiness-check
/deployment-readiness-check --env production
/deployment-readiness-check --section settings
/deployment-readiness-check --section deps --fix
/deployment-readiness-check --section all --env staging
```
