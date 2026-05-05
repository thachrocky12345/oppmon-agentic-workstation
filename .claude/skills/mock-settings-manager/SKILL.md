---
name: mock-settings-manager
description: Switch between mock configurations for different testing scenarios without code changes. Use when asked to "switch mock profile", "set test mode", "configure test scenario", "change mock settings", or "test failure modes".
argument-hint: [profile-name] [--override service=failure_mode] [--list] [--validate]
frequency: on-demand
depends-on: [mock-external-services]
---

# Mock Settings Manager

## When to Use
- When QA needs to test specific failure scenarios (payment declines, video failures)
- When developers need to switch between happy-path and error-path testing
- When demonstrating error handling to stakeholders
- When running integration tests that need consistent mock behavior
- When testing crisis flow or degraded service scenarios

## Prerequisites
- `mock-external-services` skill implemented (mock classes available)
- Redis running (for Django cache-based profile switching)
- `Lumy-Backend/` Python environment configured

## Workflow

### Step 1: Create profile directory and JSON files

```bash
mkdir -p Lumy-Backend/test_profiles
```

**`Lumy-Backend/test_profiles/default.json`:**
```json
{
  "name": "default",
  "description": "All mocks enabled, happy path",
  "services": {
    "twilio": "success",
    "stripe": "success",
    "sendgrid": "success",
    "azure_search": "success",
    "sterling": "clear",
    "certn": "clear",
    "ipapi": "success"
  }
}
```

**`Lumy-Backend/test_profiles/payment-failures.json`:**
```json
{
  "name": "payment-failures",
  "description": "Stripe returns declined cards, PayPal returns errors",
  "services": {
    "twilio": "success",
    "stripe": "card_declined",
    "sendgrid": "success",
    "azure_search": "success",
    "sterling": "clear",
    "certn": "clear",
    "ipapi": "success"
  }
}
```

**`Lumy-Backend/test_profiles/video-degraded.json`:**
```json
{
  "name": "video-degraded",
  "description": "Twilio returns room creation failures, participant drops",
  "services": {
    "twilio": "room_full",
    "stripe": "success",
    "sendgrid": "success",
    "azure_search": "success",
    "sterling": "clear",
    "certn": "clear",
    "ipapi": "success"
  }
}
```

**`Lumy-Backend/test_profiles/email-bounces.json`:**
```json
{
  "name": "email-bounces",
  "description": "SendGrid returns bounce/spam reports",
  "services": {
    "twilio": "success",
    "stripe": "success",
    "sendgrid": "bounce",
    "azure_search": "success",
    "sterling": "clear",
    "certn": "clear",
    "ipapi": "success"
  }
}
```

**`Lumy-Backend/test_profiles/search-empty.json`:**
```json
{
  "name": "search-empty",
  "description": "Azure Search returns zero results",
  "services": {
    "twilio": "success",
    "stripe": "success",
    "sendgrid": "success",
    "azure_search": "empty_results",
    "sterling": "clear",
    "certn": "clear",
    "ipapi": "success"
  }
}
```

**`Lumy-Backend/test_profiles/background-check-pending.json`:**
```json
{
  "name": "background-check-pending",
  "description": "Sterling/Certn returns in-progress indefinitely",
  "services": {
    "twilio": "success",
    "stripe": "success",
    "sendgrid": "success",
    "azure_search": "success",
    "sterling": "pending",
    "certn": "pending",
    "ipapi": "success"
  }
}
```

**`Lumy-Backend/test_profiles/crisis-flow.json`:**
```json
{
  "name": "crisis-flow",
  "description": "Risk screening returns high-severity, triggers crisis pathway",
  "services": {
    "twilio": "success",
    "stripe": "success",
    "sendgrid": "success",
    "azure_search": "success",
    "sterling": "clear",
    "certn": "clear",
    "ipapi": "success"
  },
  "overrides": {
    "risk_screening_severity": "crisis",
    "crisis_mode": true
  }
}
```

**`Lumy-Backend/test_profiles/rate-limited.json`:**
```json
{
  "name": "rate-limited",
  "description": "All external services return 429s",
  "services": {
    "twilio": "rate_limit",
    "stripe": "rate_limit",
    "sendgrid": "rate_limit",
    "azure_search": "rate_limit",
    "sterling": "timeout",
    "certn": "timeout",
    "ipapi": "rate_limit"
  }
}
```

**`Lumy-Backend/test_profiles/offline.json`:**
```json
{
  "name": "offline",
  "description": "All external services timeout (tests offline resilience)",
  "services": {
    "twilio": "timeout",
    "stripe": "timeout",
    "sendgrid": "timeout",
    "azure_search": "timeout",
    "sterling": "timeout",
    "certn": "timeout",
    "ipapi": "timeout"
  }
}
```

### Step 2: Create management command

Create `Lumy-Backend/apps/utils/management/commands/set_mock_profile.py`:

```python
"""Management command to set mock service profile."""
import json
import os
from pathlib import Path

from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError


PROFILES_DIR = Path(__file__).resolve().parents[4] / "test_profiles"
CACHE_KEY = "mock_service_profile"

# Valid failure modes per service
VALID_MODES = {
    "twilio": ["success", "timeout", "rate_limit", "server_error", "auth_failure",
               "room_full", "participant_disconnected", "recording_failed"],
    "stripe": ["success", "card_declined", "insufficient_funds", "3ds_required",
               "fraud_detected", "timeout", "rate_limit", "server_error", "auth_failure"],
    "sendgrid": ["success", "bounce", "spam_report", "invalid_recipient",
                 "timeout", "rate_limit", "server_error"],
    "azure_search": ["success", "empty_results", "timeout", "rate_limit", "server_error"],
    "sterling": ["clear", "review", "adverse_action", "pending", "timeout", "server_error"],
    "certn": ["clear", "review", "adverse_action", "pending", "timeout", "server_error"],
    "ipapi": ["success", "timeout", "rate_limit", "server_error"],
}


class Command(BaseCommand):
    help = "Set mock service profile for testing"

    def add_arguments(self, parser):
        parser.add_argument("profile", nargs="?", type=str, help="Profile name (without .json)")
        parser.add_argument("--override", nargs="*", type=str,
            help="Override specific service: --override stripe=card_declined twilio=timeout")
        parser.add_argument("--list", action="store_true", help="List available profiles")
        parser.add_argument("--current", action="store_true", help="Show current profile")
        parser.add_argument("--clear", action="store_true", help="Clear mock profile (use real services)")
        parser.add_argument("--validate", action="store_true", help="Validate all profiles")

    def handle(self, *args, **options):
        if options["list"]:
            return self._list_profiles()
        if options["current"]:
            return self._show_current()
        if options["clear"]:
            cache.delete(CACHE_KEY)
            self.stdout.write(self.style.SUCCESS("Mock profile cleared. Using real services."))
            return
        if options["validate"]:
            return self._validate_all()

        profile_name = options.get("profile")
        if not profile_name:
            raise CommandError("Provide a profile name or use --list/--current/--clear")

        profile_path = PROFILES_DIR / f"{profile_name}.json"
        if not profile_path.exists():
            raise CommandError(
                f"Profile '{profile_name}' not found at {profile_path}. "
                f"Use --list to see available profiles."
            )

        with open(profile_path) as f:
            profile = json.load(f)

        # Apply overrides
        overrides = options.get("override") or []
        for override in overrides:
            if "=" not in override:
                raise CommandError(f"Invalid override format: '{override}'. Use service=mode")
            service, mode = override.split("=", 1)
            if service not in VALID_MODES:
                raise CommandError(f"Unknown service: '{service}'. Valid: {list(VALID_MODES.keys())}")
            if mode not in VALID_MODES[service]:
                raise CommandError(
                    f"Invalid mode '{mode}' for {service}. Valid: {VALID_MODES[service]}"
                )
            profile["services"][service] = mode

        # Store in cache
        cache.set(CACHE_KEY, json.dumps(profile), timeout=None)
        self.stdout.write(self.style.SUCCESS(f"Mock profile set: {profile_name}"))
        for svc, mode in profile["services"].items():
            marker = " (overridden)" if any(svc in o for o in overrides) else ""
            self.stdout.write(f"  {svc}: {mode}{marker}")

    def _list_profiles(self):
        if not PROFILES_DIR.exists():
            self.stdout.write("No profiles directory found.")
            return
        for f in sorted(PROFILES_DIR.glob("*.json")):
            with open(f) as fp:
                data = json.load(fp)
            self.stdout.write(f"  {f.stem}: {data.get('description', 'No description')}")

    def _show_current(self):
        raw = cache.get(CACHE_KEY)
        if not raw:
            self.stdout.write("No mock profile set. Using real services.")
            return
        profile = json.loads(raw)
        self.stdout.write(f"Current profile: {profile.get('name', 'unknown')}")
        for svc, mode in profile.get("services", {}).items():
            self.stdout.write(f"  {svc}: {mode}")

    def _validate_all(self):
        errors = []
        for f in sorted(PROFILES_DIR.glob("*.json")):
            with open(f) as fp:
                data = json.load(fp)
            for svc, mode in data.get("services", {}).items():
                if svc not in VALID_MODES:
                    errors.append(f"{f.stem}: Unknown service '{svc}'")
                elif mode not in VALID_MODES[svc]:
                    errors.append(f"{f.stem}: Invalid mode '{mode}' for {svc}")
        if errors:
            for e in errors:
                self.stdout.write(self.style.ERROR(f"  {e}"))
        else:
            self.stdout.write(self.style.SUCCESS("All profiles valid."))
```

### Step 3: Runtime middleware (dev/test only)

Create `Lumy-Backend/apps/utils/middleware.py`:

```python
"""Middleware for mock profile switching via HTTP header (dev/test only)."""
import json
from django.conf import settings
from django.core.cache import cache


class MockProfileMiddleware:
    """
    Reads X-Mock-Profile header and applies mock settings per-request.

    ONLY active when DEBUG=True. Disabled in production.

    Usage: Send header `X-Mock-Profile: payment-failures` or
           `X-Mock-Profile: default;stripe=card_declined`
    """
    CACHE_KEY = "mock_service_profile"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not settings.DEBUG:
            return self.get_response(request)

        profile_header = request.META.get("HTTP_X_MOCK_PROFILE")
        if profile_header:
            # Parse "profile_name" or "profile_name;service=mode,service=mode"
            parts = profile_header.split(";", 1)
            profile_name = parts[0].strip()

            # Load profile from file or cache
            from pathlib import Path
            profile_path = Path(settings.BASE_DIR) / "test_profiles" / f"{profile_name}.json"
            if profile_path.exists():
                with open(profile_path) as f:
                    profile = json.load(f)

                # Apply inline overrides
                if len(parts) > 1:
                    for override in parts[1].split(","):
                        if "=" in override:
                            svc, mode = override.strip().split("=", 1)
                            profile["services"][svc.strip()] = mode.strip()

                cache.set(self.CACHE_KEY, json.dumps(profile), timeout=300)

        return self.get_response(request)
```

Add to `MIDDLEWARE` in `lumy_global/settings.py` (only in dev):

```python
if DEBUG:
    MIDDLEWARE.append("apps.utils.middleware.MockProfileMiddleware")
```

### Step 4: Frontend profile switching

Create `RG-Frontend/scripts/set-mock-profile.js`:

```javascript
/**
 * Sets MSW handler overrides based on a mock profile.
 * Usage: node scripts/set-mock-profile.js payment-failures
 */
const fs = require('fs');
const path = require('path');

const profileName = process.argv[2] || 'default';
const profilePath = path.join(__dirname, '..', '..', 'Lumy-Backend', 'test_profiles', `${profileName}.json`);

if (!fs.existsSync(profilePath)) {
  console.error(`Profile not found: ${profilePath}`);
  process.exit(1);
}

const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
const envContent = `NEXT_PUBLIC_MOCK_API=true\nNEXT_PUBLIC_MOCK_PROFILE=${profileName}\n`;

fs.writeFileSync(path.join(__dirname, '..', '.env.test.local'), envContent);
console.log(`Mock profile set: ${profileName}`);
console.log(JSON.stringify(profile.services, null, 2));
```

## Known Patterns & Gotchas

1. **Redis required for cache-based profiles**: The management command uses `django.core.cache.cache` which is backed by Redis in Docker. If Redis is down, cache operations will fail. The `mock_cache` autouse fixtures in test conftest files will override this with MagicMock.

2. **Middleware only active in DEBUG mode**: The `MockProfileMiddleware` checks `settings.DEBUG` at runtime. It will silently skip in production, which is the intended safety behavior.

3. **Profile overrides are additive**: Using `--override stripe=card_declined` on top of the `default` profile only changes the Stripe mock. All other services remain at their profile defaults.

4. **Cache timeout**: Profiles set via management command use `timeout=None` (persistent until restart). Profiles set via HTTP header use `timeout=300` (5 minutes) to prevent stale configs.

5. **Frontend MSW profiles**: The frontend profile switching writes to `.env.test.local` which is gitignored. It requires MSW to be installed and configured (see `frontend-test-scaffold` skill).

## Example Invocations

```
/mock-settings-manager default
/mock-settings-manager payment-failures
/mock-settings-manager default --override stripe=card_declined
/mock-settings-manager offline
/mock-settings-manager --list
/mock-settings-manager --current
/mock-settings-manager --validate
/mock-settings-manager --clear
```
