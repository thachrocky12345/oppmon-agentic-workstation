# Integration Test Templates

## Test Documentation Template

```markdown
# <TICKET>: <Feature Name> - Test Plan

## Feature Overview

<Brief description of the feature>

### Key Components

| File | Purpose |
|------|---------|
| `apps/<app>/models.py` | Data models |
| `apps/<app>/services.py` | Business logic |
| `apps/<app>/views.py` | API views |
| `apps/<app>/urls.py` | URL routing |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/<app>/<path>/` | POST | <description> |
| `/api/v1/<app>/<path>/` | GET | <description> |

### Valid Enum Values (if applicable)

| Code | Description |
|------|-------------|
| `value_1` | Description |
| `value_2` | Description |

---

## Prerequisites

### 1. Run Migrations

\`\`\`bash
cd Lumy-Backend
docker compose run --rm -e POSTGRES_HOST=db -e REDIS_HOST=redis --entrypoint="" backend python manage.py migrate <app>
\`\`\`

### 2. Seed Data Requirements

- **Admin user** with `is_staff=True`
- **Test provider/client** accounts

### 3. Get JWT Token

\`\`\`bash
curl -X POST http://localhost:8000/api/v1/authentication/login/ \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@test.com", "password": "DevPassword123!"}'
\`\`\`

---

## Test Cases

### TC-01: <Test Name>

**Objective:** <What this test verifies>

**Steps:**
1. <Step 1>
2. <Step 2>
\`\`\`bash
curl -X GET "http://localhost:8000/api/v1/<endpoint>/" \
  -H "Authorization: Bearer <JWT_TOKEN>"
\`\`\`

**Expected Results:**
- [ ] Returns <status code>
- [ ] Response includes <field>
- [ ] <Other criteria>

---

### TC-02: <Test Name - Error Case>

**Objective:** <What error case this tests>

**Steps:**
\`\`\`bash
curl -X POST "http://localhost:8000/api/v1/<endpoint>/" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
\`\`\`

**Expected Results:**
- [ ] Returns 400
- [ ] Error message indicates <issue>

---

## Integration Test Summary

**Run Date:** <date>
**Script:** `scripts/integration_<TICKET>.py`

| Result | Count |
|--------|-------|
| **Total** | X |
| **Passed** | X |
| **Failed** | X |
| **Skipped** | X |

---

## Security Checklist

- [ ] JWT authentication required
- [ ] Authorization checks (is_staff, ownership)
- [ ] Input validation
- [ ] Error responses don't leak sensitive info
- [ ] Audit logging in place

---

## Database Verification

\`\`\`python
# Django shell verification
from apps.<app>.models import <Model>

# Query to verify state
<Model>.objects.filter(...).values()
\`\`\`
```

---

## Test Script Template

See [scripts/template_integration_test.py](scripts/template_integration_test.py) for the full template.

Key sections:
1. **Configuration** - URLs, credentials, valid values
2. **APIClient class** - HTTP client with JWT handling
3. **TestRunner class** - Setup, test cases, cleanup, summary
4. **Test case methods** - One method per test case
5. **Main function** - CLI parsing, backend check, execution

### Critical Code Patterns

#### Login Handler (Correct for this codebase)

```python
def login(self, email: str, password: str) -> bool:
    url = f"{self.base_url}/api/v1/authentication/login/"
    resp = self.session.post(url, json={"email": email, "password": password})

    if resp.status_code == 200:
        data = resp.json()
        # Token is in data.tokens for this codebase
        if "data" in data and "tokens" in data["data"]:
            self.access_token = data["data"]["tokens"]
            return True
    return False
```

#### Test Result Enum (ASCII for Windows)

```python
class TestResult(Enum):
    PASS = "[PASS]"
    FAIL = "[FAIL]"
    SKIP = "[SKIP]"
```

#### Test Case Pattern

```python
def _test_example(self):
    test = TestCase(
        name="TC-XX: Test name",
        description="What this tests"
    )

    code, data = self.client.get("/api/v1/path/", params={"key": "value"})
    test.response_code = code

    if code == 200 and data.get("expected_field"):
        test.result = TestResult.PASS
    else:
        test.result = TestResult.FAIL
        test.message = f"Expected 200, got {code}: {data}"

    self._add_result(test)
```

#### Authorization Test Pattern

```python
def _test_requires_auth(self):
    test = TestCase(name="TC-XX: Requires auth", description="401 without token")

    saved_token = self.client.access_token
    self.client.clear_token()

    code, data = self.client.get("/api/v1/protected/")

    self.client.access_token = saved_token  # Restore

    if code == 401:
        test.result = TestResult.PASS
    else:
        test.result = TestResult.FAIL
        test.message = f"Expected 401, got {code}"

    self._add_result(test)
```

#### Admin-Only Test Pattern

```python
def _test_requires_admin(self):
    test = TestCase(name="TC-XX: Requires admin", description="403 for non-admin")

    saved_token = self.client.access_token

    if self.client.login(NON_ADMIN_EMAIL, PASSWORD):
        code, data = self.client.get("/api/v1/admin-only/")

        if code == 403:
            test.result = TestResult.PASS
        else:
            test.result = TestResult.FAIL
            test.message = f"Expected 403, got {code}"
    else:
        test.result = TestResult.SKIP
        test.message = "Could not login as non-admin user"

    self.client.access_token = saved_token
    self._add_result(test)
```
