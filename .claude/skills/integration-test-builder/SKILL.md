---
name: integration-test-builder
description: Build integration test documentation and Python test scripts for backend API endpoints. Use when asked to "create integration tests", "build test script", "test API endpoints", "integration test for ticket", or "verify endpoint works".
---

# Integration Test Builder

## Quick Start

1. Identify the ticket/feature being tested (e.g., RGDEV-33)
2. Read the implementation files (views.py, urls.py, services.py, models.py)
3. Create test documentation at `Docs/<TICKET>_admin_test_<feature>.md`
4. Create test script at `scripts/integration_<TICKET>.py`
5. Run tests and update documentation with results

## Prerequisites Check

Before creating tests, verify:

- [ ] Backend server can run (`python manage.py runserver`)
- [ ] Database has test data (admin user, test provider/client)
- [ ] Endpoints are registered in urls.py
- [ ] Authentication endpoint is `/api/v1/authentication/login/`

## Workflow

### Step 1: Gather Endpoint Information

Read these files to understand the API:
```
apps/<app>/urls.py       # URL patterns
apps/<app>/views.py      # Request/response handling
apps/<app>/services.py   # Business logic
apps/<app>/models.py     # Data models
```

Extract:
- Endpoint paths (e.g., `/api/v1/verification/admin/grant/`)
- HTTP methods (GET, POST, etc.)
- Required parameters and validation rules
- Expected response codes (200, 400, 401, 403, 404, 409)
- Authorization requirements (JWT, is_staff)

### Step 2: Create Test Documentation

Create `Docs/<TICKET>_admin_test_<feature>.md` using template in [TEMPLATES.md](TEMPLATES.md).

Include:
- Feature overview with key files table
- API endpoints table
- Valid enum values (if applicable)
- Prerequisites (migrations, seed data, JWT token)
- Test cases with curl examples
- Expected results with checkboxes
- Security checklist
- Database verification queries

### Step 3: Create Test Script

Create `scripts/integration_<TICKET>.py` using template in [TEMPLATES.md](TEMPLATES.md).

Critical configuration:
```python
# Correct login endpoint for this codebase
LOGIN_URL = "/api/v1/authentication/login/"

# Token is in data.tokens, not data.access
if "data" in resp and "tokens" in resp["data"]:
    self.access_token = resp["data"]["tokens"]
```

### Step 4: Run Tests and Document Results

```bash
python scripts/integration_<TICKET>.py -v
```

Update documentation with actual results:
- Change `- [ ]` to `- [x]` for passing criteria
- Add `**Actual Result:** {"status": "PASS", "code": 200}` after expected results
- Add integration test summary section

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| Login returns 404 | Use `/api/v1/authentication/login/` not `/api/v1/auth/login/` |
| Token not extracted | Token is in `data.tokens`, not `data.access` |
| Unicode errors on Windows | Use ASCII characters `[PASS]` not emoji |
| Tests fail with empty DB | Create test users via Django ORM script |
| 500 on client login | Client user may lack required profile fields |

## Test Account Setup

If seed data fails, create test users manually:

```python
from apps.authentication.models import User
from apps.care_provider.models import CareProvider
from apps.client.models import Client

# Admin
admin, _ = User.objects.get_or_create(
    email='admin@test.com',
    defaults={'is_staff': True, 'user_type': 'CLIENT', 'first_name': 'Test', 'last_name': 'Admin'}
)
admin.set_password('DevPassword123!')
admin.save()

# Provider
provider_user, _ = User.objects.get_or_create(
    email='provider@test.com',
    defaults={'user_type': 'CAREPROVIDER', 'first_name': 'Test', 'last_name': 'Provider'}
)
provider_user.set_password('DevPassword123!')
provider_user.save()
CareProvider.objects.get_or_create(user=provider_user, defaults={'is_verified': False})

# Client
client_user, _ = User.objects.get_or_create(
    email='client@test.com',
    defaults={'user_type': 'CLIENT', 'first_name': 'Test', 'last_name': 'Client'}
)
client_user.set_password('DevPassword123!')
client_user.save()
Client.objects.get_or_create(user=client_user)
```

## See Also

- [TEMPLATES.md](TEMPLATES.md) - Full templates for docs and scripts
- [scripts/template_integration_test.py](scripts/template_integration_test.py) - Starter script
