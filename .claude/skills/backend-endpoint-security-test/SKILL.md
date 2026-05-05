---
name: backend-endpoint-security-test
description: Generate and run security-focused tests for every backend endpoint covering auth, authorization, IDOR, injection, and rate limiting. Use when asked to "security test endpoints", "generate auth tests", "IDOR testing", "test authorization", "endpoint security", or "penetration test prep".
argument-hint: [--app authentication|calendar_functionality|video_conferencing|risk_screening|care_provider|stripe_integration|all] [--category auth|authz|idor|injection|rate-limit|graphql|all] [--generate]
frequency: every-pr
---

# Backend Endpoint Security Test Generator

## When to Use
- When adding new API endpoints
- Before security review or penetration testing
- When verifying IDOR protections on PHI endpoints
- When testing GraphQL query depth/complexity limits
- When auditing rate limiting coverage
- During compliance review (HIPAA access controls)

## Prerequisites
- `Lumy-Backend/` with pytest and factory_boy configured
- Existing factories available (see test-data-factory skill)
- Database with migrations applied

## Existing Test Infrastructure

| Factory | Import Path |
|---|---|
| `UserFactory` | `apps.authentication.tests.conftest.UserFactory` |
| `ClientFactory` | `apps.authentication.tests.conftest.ClientFactory` |
| `CareProviderFactory` | `apps.calendar_functionality.tests.conftest.CareProviderFactory` |
| `AppointmentFactory` | `apps.calendar_functionality.tests.conftest.AppointmentFactory` |
| `SlotFactory` | `apps.calendar_functionality.tests.conftest.SlotFactory` |
| `StripeUserFactory` | `apps.stripe_integration.tests.conftest.StripeUserFactory` |
| `UserResponseFactory` | `apps.risk_screening.tests.conftest.UserResponseFactory` |
| `ResponseDetailFactory` | `apps.risk_screening.tests.conftest.ResponseDetailFactory` |

## Workflow

### Step 1: Map all endpoints

```bash
# Extract URL patterns from all apps
grep -rn --include="*.py" -E 'path\(|url\(' \
  Lumy-Backend/apps/*/urls.py \
  Lumy-Backend/lumy_global/urls.py \
  --exclude-dir=__pycache__

# Extract GraphQL queries and mutations
grep -rn --include="*.py" -E 'class\s+\w+(Mutation|Query).*graphene' \
  Lumy-Backend/apps/ --exclude-dir=__pycache__ --exclude-dir=tests

# List all ViewSets and their actions
grep -rn --include="*.py" -E 'class\s+\w+(ViewSet|View|APIView)' \
  Lumy-Backend/apps/*/views.py --exclude-dir=__pycache__
```

### Step 2: Authentication Tests Template

For each endpoint, generate:

```python
"""Security tests for [APP] endpoints."""
import pytest
from rest_framework.test import APIClient
from rest_framework import status

from apps.authentication.tests.conftest import UserFactory, ClientFactory
from apps.calendar_functionality.tests.conftest import CareProviderFactory


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def authenticated_client(api_client):
    """Client with valid JWT token."""
    user = UserFactory(user_type="CLIENT")
    api_client.force_authenticate(user=user)
    return api_client, user


@pytest.fixture
def provider_client(api_client):
    """Provider with valid JWT token."""
    cp = CareProviderFactory()
    api_client.force_authenticate(user=cp.user)
    return api_client, cp


class TestAuthenticationRequired:
    """Every endpoint should reject unauthenticated requests."""

    ENDPOINTS = [
        ("GET", "/api/v1/calendar/appointments/"),
        ("GET", "/api/v1/calendar/slots/"),
        ("POST", "/api/v1/calendar/appointments/"),
        ("GET", "/api/v1/video/notes/"),
        ("POST", "/api/v1/video/notes/"),
        # Add all endpoints here
    ]

    @pytest.mark.parametrize("method,url", ENDPOINTS)
    def test_unauthenticated_returns_401(self, api_client, method, url):
        """Request without token should return 401."""
        response = getattr(api_client, method.lower())(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED, \
            f"{method} {url} returned {response.status_code} instead of 401"

    @pytest.mark.parametrize("method,url", ENDPOINTS)
    def test_expired_token_returns_401(self, api_client, method, url):
        """Request with expired token should return 401."""
        api_client.credentials(HTTP_AUTHORIZATION="Bearer expired.token.here")
        response = getattr(api_client, method.lower())(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.parametrize("method,url", ENDPOINTS)
    def test_malformed_token_returns_401(self, api_client, method, url):
        """Request with malformed token should return 401."""
        api_client.credentials(HTTP_AUTHORIZATION="Bearer not-a-valid-jwt")
        response = getattr(api_client, method.lower())(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
```

### Step 3: Authorization Tests Template

```python
class TestAuthorizationRoles:
    """Verify role-based access control."""

    def test_client_cannot_access_provider_endpoints(self, authenticated_client):
        """Client user type should not access provider-only endpoints."""
        client, user = authenticated_client
        assert user.user_type == "CLIENT"

        provider_endpoints = [
            "/api/v1/calendar/slots/",  # Only providers create slots
            # Add provider-only endpoints
        ]
        for url in provider_endpoints:
            response = client.post(url, {})
            assert response.status_code in (
                status.HTTP_403_FORBIDDEN,
                status.HTTP_400_BAD_REQUEST,  # Some views return 400 if wrong user_type
            ), f"Client accessed provider endpoint: POST {url} = {response.status_code}"

    def test_provider_cannot_access_client_only_data(self, provider_client):
        """Provider should not access other clients' data."""
        client, cp = provider_client
        # Create another client's appointment
        other_client = ClientFactory()
        from apps.calendar_functionality.tests.conftest import AppointmentFactory
        other_appt = AppointmentFactory(client=other_client)

        response = client.get(f"/api/v1/calendar/appointments/{other_appt.pk}/")
        # Should return 403 or 404 (not 200)
        assert response.status_code != status.HTTP_200_OK, \
            f"Provider accessed another client's appointment"
```

### Step 4: IDOR (Insecure Direct Object Reference) Tests

```python
class TestIDOR:
    """Verify that users cannot access other users' data by ID."""

    def test_user_a_cannot_read_user_b_notes(self, db):
        """User A should not be able to read User B's clinical notes."""
        from apps.video_conferencing.models import Notes

        # Create two providers with notes
        cp_a = CareProviderFactory()
        cp_b = CareProviderFactory()

        note_b = Notes.objects.create(
            care_provider=cp_b,
            notes="Confidential clinical note for provider B",
            room_name="room-b-123",
        )

        client = APIClient()
        client.force_authenticate(user=cp_a.user)

        # Try to access provider B's note
        response = client.get(f"/api/v1/video/notes/{note_b.pk}/")
        # Should be 403 or 404
        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
        ), f"IDOR: Provider A accessed Provider B's notes (status={response.status_code})"

    def test_user_cannot_read_other_risk_screening(self, db):
        """User A should not be able to read User B's risk screening."""
        from apps.risk_screening.tests.conftest import UserResponseFactory

        user_a = UserFactory()
        user_b = UserFactory()
        response_b = UserResponseFactory(
            user=user_b,
            final_score=15,
            final_keywords=["anxiety"],
            is_severe=False,
        )

        client = APIClient()
        client.force_authenticate(user=user_a)

        response = client.get(f"/api/v1/risk-screening/responses/{response_b.response_id}/")
        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
        ), f"IDOR: User A accessed User B's risk screening"

    def test_client_cannot_modify_other_appointment(self, db):
        """Client A should not be able to cancel Client B's appointment."""
        from apps.calendar_functionality.tests.conftest import AppointmentFactory

        client_a = ClientFactory()
        client_b = ClientFactory()
        appt_b = AppointmentFactory(client=client_b, is_status="SCHEDULED")

        api = APIClient()
        api.force_authenticate(user=client_a.user)

        response = api.patch(
            f"/api/v1/calendar/appointments/{appt_b.pk}/",
            {"is_status": "CANCELLED"},
        )
        assert response.status_code in (
            status.HTTP_403_FORBIDDEN,
            status.HTTP_404_NOT_FOUND,
        ), f"IDOR: Client A modified Client B's appointment"
```

### Step 5: Input Validation / Injection Tests

```python
class TestInjection:
    """Test for SQL injection, XSS, and other injection attacks."""

    SQL_INJECTION_PAYLOADS = [
        "'; DROP TABLE authentication_user; --",
        "1' OR '1'='1",
        "1; SELECT * FROM authentication_user--",
        "1 UNION SELECT email, password FROM authentication_user--",
    ]

    XSS_PAYLOADS = [
        '<script>alert("XSS")</script>',
        '"><img src=x onerror=alert(1)>',
        "javascript:alert('XSS')",
        '<svg onload=alert(1)>',
    ]

    def test_sql_injection_in_appointment_reason(self, authenticated_client):
        """SQL injection payloads in text fields should be safely handled."""
        client, user = authenticated_client
        for payload in self.SQL_INJECTION_PAYLOADS:
            response = client.post("/api/v1/calendar/appointments/", {
                "reason": payload,
                # ... other required fields
            })
            # Should not return 500 (unhandled SQL error)
            assert response.status_code != 500, \
                f"Possible SQL injection: {payload} caused 500"

    def test_xss_in_notes(self, provider_client):
        """XSS payloads in notes field should be sanitized or safely stored."""
        client, cp = provider_client
        for payload in self.XSS_PAYLOADS:
            response = client.post("/api/v1/video/notes/", {
                "notes": payload,
                "room_name": "test-room-xss",
            })
            if response.status_code == 201:
                # If stored, verify it's escaped in response
                data = response.json()
                assert '<script>' not in str(data.get('notes', '')), \
                    f"XSS payload stored unescaped: {payload}"

    def test_oversized_payload(self, authenticated_client):
        """Oversized payloads should be rejected."""
        client, user = authenticated_client
        huge_payload = "A" * 1_000_000  # 1MB string
        response = client.post("/api/v1/calendar/appointments/", {
            "reason": huge_payload,
        })
        assert response.status_code in (400, 413), \
            f"Oversized payload accepted: status={response.status_code}"

    def test_path_traversal_in_file_fields(self, authenticated_client):
        """Path traversal attempts should be rejected."""
        client, user = authenticated_client
        traversal_payloads = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
            "%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        ]
        for payload in traversal_payloads:
            response = client.patch(f"/api/v1/auth/user/{user.id}/", {
                "profile_pic": payload,
            })
            # Should not return 200 with traversal path stored
            if response.status_code == 200:
                assert payload not in str(response.json().get('profile_pic', ''))
```

### Step 6: GraphQL Security Tests

```python
class TestGraphQLSecurity:
    """Security tests for GraphQL endpoint."""

    GRAPHQL_URL = "/api/v1/graphql/"

    def test_unauthenticated_graphql_query(self, api_client):
        """GraphQL should reject unauthenticated queries for protected data."""
        query = '{ allUsers { edges { node { email firstName } } } }'
        response = api_client.post(
            self.GRAPHQL_URL,
            {"query": query},
            content_type="application/json",
        )
        data = response.json()
        # Should have errors or empty data
        assert 'errors' in data or not data.get('data', {}).get('allUsers'), \
            "GraphQL returned user data without authentication"

    def test_deep_nested_query_rejected(self, authenticated_client):
        """Deeply nested queries should be rejected (DoS prevention)."""
        client, user = authenticated_client
        # Create a deeply nested query (10+ levels)
        deep_query = """
        { allCareProviders { edges { node {
            user { profile { user { profile { user { profile { user {
                email
            } } } } } } }
        } } } }
        """
        response = client.post(
            self.GRAPHQL_URL,
            {"query": deep_query},
            content_type="application/json",
        )
        # Should be rejected or return error
        data = response.json()
        # If no depth limiting, this is a finding
        if response.status_code == 200 and not data.get('errors'):
            print("WARNING: No GraphQL query depth limiting detected")

    def test_introspection_disabled_production(self, api_client):
        """Introspection should be disabled in production."""
        query = '{ __schema { types { name } } }'
        response = api_client.post(
            self.GRAPHQL_URL,
            {"query": query},
            content_type="application/json",
        )
        # In production, should return error
        # In dev, this will succeed (acceptable)
        data = response.json()
        if data.get('data', {}).get('__schema'):
            print("NOTE: GraphQL introspection is enabled (disable in production)")

    def test_batch_query_limit(self, authenticated_client):
        """Batch queries should be limited."""
        client, user = authenticated_client
        # Send 100 queries in one request
        batch = [{"query": "{ __typename }"} for _ in range(100)]
        response = client.post(
            self.GRAPHQL_URL,
            batch,
            content_type="application/json",
        )
        # Should be rejected or limited
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, list) and len(data) == 100:
                print("WARNING: No batch query limit detected")
```

### Step 7: Rate Limiting Tests

```python
class TestRateLimiting:
    """Verify rate limits on sensitive endpoints."""

    def test_login_rate_limit(self, api_client):
        """Login endpoint should be rate-limited."""
        for i in range(20):
            response = api_client.post("/api/v1/auth/login/", {
                "email": f"attempt{i}@example.com",
                "password": "wrongpassword",
            })
            if response.status_code == 429:
                print(f"Rate limit hit after {i+1} attempts")
                return
        print("WARNING: No rate limiting detected on login endpoint after 20 attempts")

    def test_otp_rate_limit(self, api_client):
        """OTP endpoint should be rate-limited."""
        for i in range(10):
            response = api_client.post("/api/v1/auth/send-otp/", {
                "phone_number": "+15551234567",
            })
            if response.status_code == 429:
                print(f"OTP rate limit hit after {i+1} attempts")
                return
        print("WARNING: No rate limiting detected on OTP endpoint after 10 attempts")

    def test_password_reset_rate_limit(self, api_client):
        """Password reset should be rate-limited."""
        for i in range(10):
            response = api_client.post("/api/v1/auth/forgot-password/", {
                "email": f"test{i}@example.com",
            })
            if response.status_code == 429:
                return
        print("WARNING: No rate limiting on password reset")
```

### Step 8: Test Generation Management Command

Create `Lumy-Backend/apps/utils/management/commands/generate_security_tests.py`:

```python
"""Generate security test files for each app."""
from django.core.management.base import BaseCommand
from django.urls import URLResolver, URLPattern
from django.urls import get_resolver


class Command(BaseCommand):
    help = "Generate security test files for backend endpoints"

    def add_arguments(self, parser):
        parser.add_argument("--app", type=str, default="all")
        parser.add_argument("--endpoint", type=str, default=None)
        parser.add_argument("--output-dir", type=str, default="apps/utils/tests/security/")

    def handle(self, *args, **options):
        resolver = get_resolver()
        endpoints = self._extract_endpoints(resolver)
        self.stdout.write(f"Found {len(endpoints)} endpoints")
        # Generate test files...

    def _extract_endpoints(self, resolver, prefix=""):
        endpoints = []
        for pattern in resolver.url_patterns:
            if isinstance(pattern, URLResolver):
                endpoints.extend(self._extract_endpoints(pattern, prefix + str(pattern.pattern)))
            elif isinstance(pattern, URLPattern):
                endpoints.append({
                    'path': prefix + str(pattern.pattern),
                    'name': pattern.name,
                    'callback': pattern.callback,
                })
        return endpoints
```

## Known Patterns & Gotchas

1. **`force_authenticate` bypasses JWT entirely**: `APIClient.force_authenticate()` sets the user directly without JWT validation. Use it for authorization tests, but for authentication tests, use `client.credentials(HTTP_AUTHORIZATION=...)` with real or invalid tokens.

2. **Autouse fixtures mock external services**: The `mock_cache`, `mock_external_apis`, and `mock_manage_pages_enqueue` fixtures are autouse in several apps. Security tests that create appointments or providers will have Stripe, SendGrid, and Redis mocked automatically.

3. **GraphQL endpoint path**: The GraphQL endpoint is at `/api/v1/graphql/` with trailing slash. Missing the trailing slash may cause 301 redirects which bypass auth checks.

4. **CSRF exemption on GraphQL**: The GraphQL view may be decorated with `csrf_exempt` in `urls.py`. This is standard for API-only GraphQL but should be verified.

5. **`Appointment.room_name` auto-generated**: When creating test appointments, `room_name` is auto-generated as UUID in `save()`. Notes must use the same `room_name` to establish the relationship.

6. **OTP rate limiting is mocked**: The `otp_common_patches` fixture at `apps/authentication/tests/conftest.py:110` mocks `is_ratelimited` to return `False`. Rate limiting tests must NOT use this fixture.

7. **DRF throttling vs django-ratelimit**: Check whether the project uses DRF's built-in `throttle_classes` or the `django-ratelimit` package. The OTP mutation uses `is_ratelimited` from `django-ratelimit`.

## Data Model & Accuracy Notes

1. **GraphQL endpoint may be `csrf_exempt`**: The GraphQL view at `/api/v1/graphql/` may be decorated with `@csrf_exempt` in `lumy_global/urls.py`. Verify this and document whether CSRF protection is intentionally disabled for the API-only endpoint.

2. **Permission class names vary across apps**: Do NOT assume standard permission classes like `IsOwner` or `IsAuthenticated` exist on all views. Grep for actual permission class definitions in each app's `views.py` and `permissions.py` files before writing tests.

3. **`video_conferencing/api.py` is NOT a DRF view**: This file contains a plain Python class (`Client`) that wraps the Twilio SDK. It has no DRF permission classes or authentication. Security checks for video conferencing must target `views.py`, not `api.py`.

4. **Module-level guards in stripe_integration**: `_STRIPE_CONFIGURED` and `_PAYPAL_CONFIGURED` are module-level boolean guards in `stripe_integration/views.py` that gate payment operations. If these are `False`, payment endpoints silently do nothing. Test both configured and unconfigured states.

5. **Cross-provider isolation**: Provider A must NOT be able to access Provider B's clinical notes, even when both serve the same client. Create test scenarios with a shared client and verify note isolation.

6. **Minor account creation**: Verify that minor/dependent user accounts cannot be created without a `parent_user` linkage. Test: attempt to create a user with `date_of_birth` indicating age < 18 and `parent_user=None` -- this should be rejected.

7. **Group therapy API**: If group session endpoints exist, verify that participant identity is not leaked to other group members. Response payloads should use anonymized identifiers or role-based labels.

8. **Rate limiting on risk screening**: The risk screening endpoint should be rate-limited to prevent enumeration of crisis-flagged users. Test: send rapid sequential requests to the risk screening list/search endpoint and verify 429 responses.

## Example Invocations

```
/backend-endpoint-security-test
/backend-endpoint-security-test --app calendar_functionality
/backend-endpoint-security-test --category idor
/backend-endpoint-security-test --category graphql
/backend-endpoint-security-test --generate --app all
/backend-endpoint-security-test --category auth --app authentication
```
