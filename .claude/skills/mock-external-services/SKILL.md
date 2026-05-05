---
name: mock-external-services
description: Create and manage mock layers for all external service integrations (Twilio, Stripe, SendGrid, Azure Search, Sterling/Certn). Use when asked to "mock services", "stub external APIs", "create test mocks", "fake Stripe/Twilio", or "offline testing".
argument-hint: [--service twilio|stripe|sendgrid|azure|sterling|certn|ipapi|all] [--mode success|failure|timeout] [--frontend]
frequency: on-demand
depends-on: []
optional-depends: [frontend-test-scaffold]
---

# External Service Mock Layer

## When to Use
- When setting up new test suites that call external services
- When developing offline or without API credentials
- When testing error handling and failure modes
- When creating CI/CD pipelines that must not call real APIs
- When load testing without hitting rate limits

## Prerequisites
- `Lumy-Backend/` Python environment
- For frontend mocks: `RG-Frontend/` with Node.js
- Understanding of existing monkeypatch mocks in test conftest files

## Existing Mock Patterns (DO NOT duplicate)

These already exist in conftest files and should be extended, not replaced:

| Mock | Location | What it patches |
|---|---|---|
| `mock_cache` | `apps/calendar_functionality/tests/conftest.py:36` | `django.core.cache.cache`, `django_rq.get_queue`, `django_rq.enqueue` |
| `mock_external_apis` | `apps/calendar_functionality/tests/conftest.py:53` | `ThirdPartyCalendarAPI`, `stripe`, `send_transactional_email`, `CalculateCareProviderSortingScores` |
| `mock_stripe` | `apps/stripe_integration/tests/conftest.py:53` | `apps.stripe_integration.views.stripe`, `_STRIPE_CONFIGURED` |
| `mock_paypal` | `apps/stripe_integration/tests/conftest.py:63` | PayPal utility functions: `get_paypal_access_token`, `create_order`, `get_authorization`, `capture_authorization`, `create_partner_referral`, `get_merchant_onboarding_status` |
| `mock_manage_pages_enqueue` | `apps/authentication/tests/conftest.py:92` | `apps.manage_pages.signals.enqueue_score_recalc_now`, `enqueue_refresh_cache_now` |
| `otp_common_patches` | `apps/authentication/tests/conftest.py:110` | `is_ratelimited`, `cache.get`, `ipware_key` |

## Workflow

### Step 1: Create backend mock classes

Create `Lumy-Backend/apps/utils/mocks/` package:

```bash
mkdir -p Lumy-Backend/apps/utils/mocks
touch Lumy-Backend/apps/utils/mocks/__init__.py
```

**`Lumy-Backend/apps/utils/mocks/twilio_mock.py`:**

```python
"""Mock Twilio client with configurable failure modes."""
from unittest.mock import MagicMock
import uuid


class MockTwilioClient:
    """
    Drop-in mock for twilio.rest.Client.

    Usage:
        client = MockTwilioClient(failure_mode="success")
        room = client.video.rooms.create(unique_name="test")
    """

    FAILURE_MODES = ["success", "timeout", "rate_limit", "server_error",
                     "auth_failure", "room_full", "participant_disconnected",
                     "recording_failed"]

    def __init__(self, failure_mode="success"):
        self.failure_mode = failure_mode
        self.video = MagicMock()
        self.messages = MagicMock()
        self.verify = MagicMock()
        self._configure()

    def _configure(self):
        if self.failure_mode == "success":
            room = MagicMock()
            room.sid = f"RM{uuid.uuid4().hex[:32]}"
            room.unique_name = "mock-room"
            room.status = "in-progress"
            self.video.rooms.create.return_value = room
            self.video.rooms.return_value = room

            token_mock = MagicMock()
            token_mock.to_jwt.return_value = b"mock.jwt.token"
            self.video.rooms.list.return_value = [room]

            # SMS
            message = MagicMock()
            message.sid = f"SM{uuid.uuid4().hex[:32]}"
            message.status = "delivered"
            self.messages.create.return_value = message

            # Verify
            verification = MagicMock()
            verification.status = "approved"
            self.verify.v2.services.return_value.verifications.create.return_value = verification
            self.verify.v2.services.return_value.verification_checks.create.return_value = verification

        elif self.failure_mode == "timeout":
            self.video.rooms.create.side_effect = Exception("Connection timed out")
        elif self.failure_mode == "rate_limit":
            self.video.rooms.create.side_effect = Exception("Rate limit exceeded (429)")
        elif self.failure_mode == "room_full":
            self.video.rooms.create.side_effect = Exception("Room is full (53105)")
        elif self.failure_mode == "auth_failure":
            self.video.rooms.create.side_effect = Exception("Authentication failed (20003)")


def get_twilio_mock_fixture(failure_mode="success"):
    """Pytest fixture factory for Twilio mock.

    Patches at utils.Client (where `from twilio.rest import Client` lives).
    Also patches twilio_config.get_twilio_client for code paths using the singleton.
    """
    def fixture(monkeypatch):
        mock = MockTwilioClient(failure_mode=failure_mode)
        monkeypatch.setattr("apps.video_conferencing.utils.Client", lambda *a, **kw: mock)
        monkeypatch.setattr("apps.video_conferencing.twilio_config.get_twilio_client", lambda **kw: mock)
        return mock
    return fixture
```

**`Lumy-Backend/apps/utils/mocks/stripe_mock.py`:**

```python
"""Mock Stripe client with configurable failure modes."""
from unittest.mock import MagicMock
import uuid


class MockStripeClient:
    """
    Drop-in mock for the stripe module.

    Stripe error anatomy:
    - error.type: "card_error", "api_error", "invalid_request_error"
    - error.code: "card_declined", "expired_card", "processing_error"
    - error.decline_code: "generic_decline", "insufficient_funds", "do_not_honor"
    See: https://docs.stripe.com/error-codes
    """

    FAILURE_MODES = [
        "success", "card_declined", "insufficient_funds", "do_not_honor",
        "card_velocity_exceeded", "3ds_required", "fraud_detected",
        "expired_card", "timeout", "rate_limit", "server_error",
        "auth_failure", "dispute_webhook", "refund_full", "refund_partial",
        "payment_timeout",
    ]

    def __init__(self, failure_mode="success"):
        self.failure_mode = failure_mode
        self.PaymentIntent = MagicMock()
        self.Customer = MagicMock()
        self.Refund = MagicMock()
        self.Webhook = MagicMock()
        self.PaymentMethod = MagicMock()
        self.error = MagicMock()
        self._configure()

    def _make_card_error(self, code, decline_code, message):
        """Create a Stripe CardError-like exception with proper structure."""
        error = MagicMock()
        error.type = "card_error"
        error.code = code
        error.decline_code = decline_code
        error.message = message
        error.http_status = 402
        exc = Exception(message)
        exc.code = code
        exc.decline_code = decline_code
        exc.http_status = 402
        exc.error = error
        return exc

    def _configure(self):
        if self.failure_mode == "success":
            pi = MagicMock()
            pi.id = f"pi_{uuid.uuid4().hex[:24]}"
            pi.status = "succeeded"
            pi.client_secret = f"pi_{uuid.uuid4().hex[:24]}_secret_{uuid.uuid4().hex[:24]}"
            self.PaymentIntent.create.return_value = pi
            self.PaymentIntent.retrieve.return_value = pi
            self.PaymentIntent.confirm.return_value = pi
            customer = MagicMock()
            customer.id = f"cus_{uuid.uuid4().hex[:14]}"
            self.Customer.create.return_value = customer
            self.Customer.retrieve.return_value = customer

        elif self.failure_mode == "card_declined":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "generic_decline", "Your card was declined.")
        elif self.failure_mode == "insufficient_funds":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "insufficient_funds", "Your card has insufficient funds.")
        elif self.failure_mode == "do_not_honor":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "do_not_honor", "Your card was declined.")
        elif self.failure_mode == "card_velocity_exceeded":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "card_velocity_exceeded",
                "Your card has been declined for making repeated attempts too frequently.")
        elif self.failure_mode == "expired_card":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "expired_card", None, "Your card has expired.")
        elif self.failure_mode == "3ds_required":
            pi = MagicMock()
            pi.status = "requires_action"
            pi.next_action = {"type": "use_stripe_sdk"}
            self.PaymentIntent.create.return_value = pi
        elif self.failure_mode == "fraud_detected":
            self.PaymentIntent.create.side_effect = self._make_card_error(
                "card_declined", "fraudulent", "This payment has been flagged as potentially fraudulent.")
        elif self.failure_mode == "refund_full":
            pi = MagicMock()
            pi.status = "succeeded"
            pi.amount = 15000  # $150.00 in cents
            self.PaymentIntent.retrieve.return_value = pi
            refund = MagicMock()
            refund.id = f"re_{uuid.uuid4().hex[:24]}"
            refund.status = "succeeded"
            refund.amount = 15000
            self.Refund.create.return_value = refund
        elif self.failure_mode == "refund_partial":
            pi = MagicMock()
            pi.status = "succeeded"
            pi.amount = 15000
            self.PaymentIntent.retrieve.return_value = pi
            refund = MagicMock()
            refund.id = f"re_{uuid.uuid4().hex[:24]}"
            refund.status = "succeeded"
            refund.amount = 7500  # 50% refund
            self.Refund.create.return_value = refund
        elif self.failure_mode == "dispute_webhook":
            event = {
                "type": "charge.dispute.created",
                "data": {"object": {"id": f"dp_{uuid.uuid4().hex[:24]}",
                                    "amount": 15000, "reason": "fraudulent"}},
            }
            self.Webhook.construct_event.return_value = event
        elif self.failure_mode == "payment_timeout":
            self.PaymentIntent.create.side_effect = ConnectionError("Connection timed out")


def get_stripe_mock_fixture(failure_mode="success"):
    """Pytest fixture factory for Stripe mock."""
    def fixture(monkeypatch):
        mock = MockStripeClient(failure_mode=failure_mode)
        monkeypatch.setattr("apps.stripe_integration.views.stripe", mock)
        monkeypatch.setattr("apps.stripe_integration.views._STRIPE_CONFIGURED", True)
        return mock
    return fixture
```

**`Lumy-Backend/apps/utils/mocks/sendgrid_mock.py`:**

```python
"""Mock SendGrid client with in-memory email capture."""
from unittest.mock import MagicMock


class MockSendGridClient:
    """
    Mock SendGrid that captures sent emails for assertion.

    SendGrid API model:
    - send() always returns HTTP 202 (accepted) for valid messages
    - Delivery events (bounce, delivered, open, etc.) arrive via Event Webhook
    - Hard bounce: permanent delivery failure (invalid address) -- remove from list
    - Soft bounce (deferred): temporary failure (mailbox full) -- retry
    """

    FAILURE_MODES = ["success", "hard_bounce", "soft_bounce", "spam_report",
                     "invalid_recipient", "timeout", "rate_limit", "server_error",
                     "delivered", "opened"]

    def __init__(self, failure_mode="success"):
        self.failure_mode = failure_mode
        self.sent_emails = []
        self.webhook_events = []
        self._client = MagicMock()

    def send(self, message):
        """
        Simulate SendGrid API send.
        Always returns 202 (accepted) for valid messages.
        Bounce/delivery status comes via separate webhook events.
        """
        if self.failure_mode == "timeout":
            raise ConnectionError("Connection timed out")
        if self.failure_mode == "rate_limit":
            response = MagicMock()
            response.status_code = 429
            return response
        if self.failure_mode == "server_error":
            response = MagicMock()
            response.status_code = 500
            return response

        # All other modes: API accepts the message (202)
        email_record = {
            'to': getattr(message, 'to', None),
            'subject': getattr(message, 'subject', None),
            'content': getattr(message, 'content', None),
            'dynamic_template_data': getattr(message, 'dynamic_template_data', None),
            'template_id': getattr(message, 'template_id', None),
        }
        self.sent_emails.append(email_record)

        # Queue the appropriate webhook event
        if self.failure_mode == "hard_bounce":
            self.webhook_events.append({
                "event": "bounce", "type": "bounce",
                "email": str(getattr(message, 'to', '')),
                "reason": "550 5.1.1 The email account does not exist",
            })
        elif self.failure_mode == "soft_bounce":
            self.webhook_events.append({
                "event": "deferred", "type": "deferred",
                "email": str(getattr(message, 'to', '')),
                "reason": "450 4.2.1 Mailbox full",
            })
        elif self.failure_mode == "spam_report":
            self.webhook_events.append({
                "event": "spamreport", "type": "spamreport",
                "email": str(getattr(message, 'to', '')),
            })
        elif self.failure_mode == "delivered":
            self.webhook_events.append({
                "event": "delivered",
                "email": str(getattr(message, 'to', '')),
            })

        response = MagicMock()
        response.status_code = 202
        return response

    def simulate_webhook_delivery(self):
        """Return and clear queued webhook events for assertion."""
        events = list(self.webhook_events)
        self.webhook_events.clear()
        return events

    def assert_email_sent_to(self, email):
        """Assert an email was sent to the given address."""
        assert any(email in str(e.get('to', '')) for e in self.sent_emails), \
            f"No email sent to {email}. Sent to: {[e.get('to') for e in self.sent_emails]}"

    def assert_email_count(self, count):
        """Assert exact number of emails sent."""
        assert len(self.sent_emails) == count, \
            f"Expected {count} emails, got {len(self.sent_emails)}"

    def assert_template_used(self, template_id):
        """Assert a specific SendGrid template was used."""
        assert any(e.get('template_id') == template_id for e in self.sent_emails), \
            f"Template {template_id} not used. Used: {[e.get('template_id') for e in self.sent_emails]}"
```

**`Lumy-Backend/apps/utils/mocks/azure_search_mock.py`:**

```python
"""Mock Azure Cognitive Search client."""
from unittest.mock import MagicMock


class MockSearchResults:
    """Mock for azure.search.documents.SearchItemPaged."""

    def __init__(self, results, count=None, facets=None):
        self._results = results
        self._count = count if count is not None else len(results)
        self._facets = facets or {}

    def __iter__(self):
        return iter(self._results)

    def get_count(self):
        return self._count

    def get_facets(self):
        return self._facets


class MockAzureSearchClient:
    """Mock for azure.search.documents.SearchClient."""

    FAILURE_MODES = ["success", "empty_results", "timeout", "rate_limit", "server_error"]

    def __init__(self, failure_mode="success", fixture_results=None):
        self.failure_mode = failure_mode
        self.fixture_results = fixture_results or []
        self.indexed_documents = []
        # Add @search.score to fixture results if not present
        for result in self.fixture_results:
            if '@search.score' not in result:
                result['@search.score'] = round(random.uniform(0.5, 4.0), 4)

    def search(self, search_text, **kwargs):
        if self.failure_mode == "timeout":
            raise Exception("Request timed out")
        if self.failure_mode == "rate_limit":
            raise Exception("Too many requests (429)")
        if self.failure_mode == "empty_results":
            return MockSearchResults([], count=0)
        if self.failure_mode == "server_error":
            raise Exception("Service unavailable (503)")

        # Apply basic filtering if filter param provided
        results = list(self.fixture_results)
        facets = kwargs.get('facets', None)
        facet_results = {}
        if facets:
            for facet_field in facets:
                facet_results[facet_field] = [
                    {"value": "mock_facet_value", "count": len(results)}
                ]

        return MockSearchResults(results, count=len(results), facets=facet_results)

    def upload_documents(self, documents):
        if self.failure_mode == "server_error":
            raise Exception("Service unavailable (503)")
        self.indexed_documents.extend(documents)
        result = MagicMock()
        result.succeeded = True
        return [result]
```

**`Lumy-Backend/apps/utils/mocks/sterling_mock.py`:**

```python
"""Mock Sterling/Certn background check client."""
from unittest.mock import MagicMock


class MockSterlingClient:
    """
    Stateful mock for Sterling background check API.

    FCRA Adverse Action flow (15 USC 1681b(b)(3)):
    1. Initial result: "adverse_action_pending"
    2. Pre-adverse action notice sent to candidate
    3. 5 business day waiting period for candidate to dispute
    4. Final adverse action decision
    """

    FAILURE_MODES = ["clear", "review", "adverse_action", "pending",
                     "timeout", "server_error", "stale_pending"]

    def __init__(self, failure_mode="clear"):
        self.failure_mode = failure_mode
        self._call_count = {}  # screening_id -> call count (for state transitions)

    def get_screening_status(self, screening_id):
        if self.failure_mode == "timeout":
            raise ConnectionError("Connection timed out")
        if self.failure_mode == "server_error":
            raise Exception("Service Unavailable (503)")

        # Track calls for stateful transitions
        self._call_count.setdefault(screening_id, 0)
        self._call_count[screening_id] += 1
        call_num = self._call_count[screening_id]

        if self.failure_mode == "pending":
            # Transitions: pending (call 1-2) -> in_progress (call 3-4) -> complete/clear (call 5+)
            if call_num <= 2:
                return {"status": "pending", "result": None, "eta_hours": 48}
            elif call_num <= 4:
                return {"status": "in_progress", "result": None, "eta_hours": 24}
            else:
                return {"status": "complete", "result": "clear"}

        elif self.failure_mode == "stale_pending":
            # Never transitions -- for testing SLA violation alerts
            return {"status": "pending", "result": None, "eta_hours": 0,
                    "sla_exceeded": True, "created_at": "2026-01-01T00:00:00Z"}

        elif self.failure_mode == "adverse_action":
            # FCRA multi-step adverse action flow
            if call_num == 1:
                return {"status": "complete", "result": "adverse_action_pending",
                        "pre_adverse_notice_sent": True,
                        "dispute_deadline": "2026-03-08T00:00:00Z"}  # 5 business days
            elif call_num == 2:
                return {"status": "complete", "result": "adverse_action_pending",
                        "dispute_received": False,
                        "dispute_deadline": "2026-03-08T00:00:00Z"}
            else:
                return {"status": "complete", "result": "adverse_action",
                        "final_action_date": "2026-03-08T00:00:00Z"}

        elif self.failure_mode == "review":
            return {"status": "complete", "result": "review",
                    "review_items": ["name_mismatch"]}

        else:  # "clear"
            return {"status": "complete", "result": "clear",
                    "completed_at": "2026-03-01T12:00:00Z"}


class MockCertnClient:
    """Certn-specific mock with Certn status values."""

    FAILURE_MODES = ["clear", "review", "adverse_action", "pending",
                     "timeout", "server_error", "cancelled"]

    def __init__(self, failure_mode="clear"):
        self.failure_mode = failure_mode
        self._call_count = {}

    def get_screening_status(self, screening_id):
        if self.failure_mode == "timeout":
            raise ConnectionError("Connection timed out")
        if self.failure_mode == "cancelled":
            return {"status": "CANCELLED", "result": None}

        self._call_count.setdefault(screening_id, 0)
        self._call_count[screening_id] += 1
        call_num = self._call_count[screening_id]

        if self.failure_mode == "pending":
            if call_num <= 3:
                return {"status": "PENDING", "result": None}
            else:
                return {"status": "COMPLETE", "result": "CLEAR"}
        elif self.failure_mode == "clear":
            return {"status": "COMPLETE", "result": "CLEAR"}
        elif self.failure_mode == "review":
            return {"status": "COMPLETE", "result": "REVIEW_REQUIRED"}
        elif self.failure_mode == "adverse_action":
            return {"status": "COMPLETE", "result": "ACTION_REQUIRED",
                    "adverse_action_required": True}
        else:
            return {"status": "COMPLETE", "result": "CLEAR"}


class MockPayPalClient:
    """Mock for PayPal integration matching existing conftest patch points."""

    FAILURE_MODES = ["success", "order_declined", "capture_failed",
                     "authorization_expired", "timeout", "merchant_not_onboarded"]

    def __init__(self, failure_mode="success"):
        self.failure_mode = failure_mode

    def get_paypal_access_token(self):
        if self.failure_mode == "timeout":
            raise Exception("Connection timed out")
        return "mock-paypal-access-token"

    def create_order(self, amount, currency="USD"):
        if self.failure_mode == "order_declined":
            raise Exception("ORDER_NOT_APPROVED")
        return {"id": f"ORDER-{uuid.uuid4().hex[:12].upper()}", "status": "CREATED"}

    def get_authorization(self, order_id):
        if self.failure_mode == "authorization_expired":
            return {"status": "VOIDED"}
        return {"id": f"AUTH-{uuid.uuid4().hex[:12].upper()}", "status": "CREATED"}

    def capture_authorization(self, auth_id):
        if self.failure_mode == "capture_failed":
            raise Exception("UNPROCESSABLE_ENTITY")
        return {"id": f"CAP-{uuid.uuid4().hex[:12].upper()}", "status": "COMPLETED"}

    def create_partner_referral(self, **kwargs):
        return {"links": [{"rel": "action_url", "href": "https://www.sandbox.paypal.com/mock"}]}

    def get_merchant_onboarding_status(self, merchant_id):
        if self.failure_mode == "merchant_not_onboarded":
            return {"payments_receivable": False, "primary_email_confirmed": False}
        return {"payments_receivable": True, "primary_email_confirmed": True}
```

### Step 2: Configuration switching

Add to `Lumy-Backend/lumy_global/settings.py` (dev/test only):

```python
# External service mock configuration (dev/test ONLY)
import os
MOCK_SERVICES = os.environ.get("MOCK_SERVICES", "none")  # "all", "twilio,stripe", or "none"

EXTERNAL_SERVICE_MOCKS = {}
if MOCK_SERVICES != "none":
    mock_list = MOCK_SERVICES.split(",") if MOCK_SERVICES != "all" else [
        "twilio", "stripe", "sendgrid", "azure", "sterling", "certn", "ipapi"
    ]
    for svc in mock_list:
        svc = svc.strip()
        EXTERNAL_SERVICE_MOCKS[svc] = f"apps.utils.mocks.{svc}_mock"
```

### Step 3: Frontend MSW setup (when frontend testing is bootstrapped)

This depends on the `frontend-test-scaffold` skill. Once MSW is installed:

Create handler files under `RG-Frontend/src/mocks/handlers/`:

```typescript
// RG-Frontend/src/mocks/handlers/auth.ts
import { rest } from 'msw';

const BASE_URL = process.env.NEXT_APP_BACKEND_BASE_URL || 'http://127.0.0.1:8000';

export const authHandlers = [
  rest.post(`${BASE_URL}/api/v1/auth/login/`, (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        access: 'mock.access.token',
        refresh: 'mock.refresh.token',
        user_type: 'CLIENT',
      })
    );
  }),
];

// RG-Frontend/src/mocks/handlers/calendar.ts
export const calendarHandlers = [
  rest.get(`${BASE_URL}/api/v1/calendar/appointments/`, (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({ results: [] }));
  }),
];

// RG-Frontend/src/mocks/handlers/payments.ts
export const paymentHandlers = [
  rest.post(`${BASE_URL}/api/v1/stripe/create-payment-intent/`, (req, res, ctx) => {
    return res(ctx.status(200), ctx.json({
      client_secret: 'pi_mock_secret_mock',
      payment_intent_id: 'pi_mock_123',
    }));
  }),
];
```

### Step 4: Failure injection patterns

Use in tests:

```python
# Backend: test Stripe card decline
def test_payment_declined(monkeypatch):
    from apps.utils.mocks.stripe_mock import MockStripeClient
    mock = MockStripeClient(failure_mode="card_declined")
    monkeypatch.setattr("apps.stripe_integration.views.stripe", mock)
    monkeypatch.setattr("apps.stripe_integration.views._STRIPE_CONFIGURED", True)
    # ... make API call and assert 400 response with decline message

# Backend: test Twilio room creation failure
def test_video_room_failure(monkeypatch):
    from apps.utils.mocks.twilio_mock import MockTwilioClient
    mock = MockTwilioClient(failure_mode="room_full")
    monkeypatch.setattr("apps.video_conferencing.utils.Client", lambda *a, **kw: mock)
    # ... make API call and assert graceful error handling

# Backend: test offline mode (all services timeout)
def test_all_services_offline(monkeypatch):
    from apps.utils.mocks.twilio_mock import MockTwilioClient
    from apps.utils.mocks.stripe_mock import MockStripeClient
    from apps.utils.mocks.sendgrid_mock import MockSendGridClient
    monkeypatch.setattr("apps.video_conferencing.utils.Client",
        lambda *a, **kw: MockTwilioClient(failure_mode="timeout"))
    monkeypatch.setattr("apps.stripe_integration.views.stripe",
        MockStripeClient(failure_mode="timeout"))
```

## Known Patterns & Gotchas

1. **Existing `mock_stripe` fixture**: `apps/stripe_integration/tests/conftest.py:53` already mocks `stripe` module AND sets `_STRIPE_CONFIGURED = True`. The new mock classes should be compatible with this pattern.

2. **Existing `mock_paypal` fixture**: At `apps/stripe_integration/tests/conftest.py:63`, individual PayPal functions are patched by name. Any new PayPal mock must patch the same function paths.

3. **`mock_cache` is autouse**: Both `apps/calendar_functionality/tests/conftest.py:36` and `apps/stripe_integration/tests/conftest.py:40` have autouse `mock_cache` fixtures that mock Redis. If you need real Redis in a test, you must explicitly override the fixture.

4. **`mock_external_apis` patches view-level imports**: At `apps/calendar_functionality/tests/conftest.py:53`, the fixture patches `ThirdPartyCalendarAPI`, `stripe`, `send_transactional_email`, and `CalculateCareProviderSortingScores` at the views module level. New mocks must patch at the same import path.

5. **`_STRIPE_CONFIGURED` and `_PAYPAL_CONFIGURED` guards**: The `stripe_integration/views.py` has module-level boolean flags that gate real API calls. Tests must set these to `True` when using mocks.

6. **Twilio import paths**: The Twilio `Client` is imported at `apps/video_conferencing/utils.py:3` (`from twilio.rest import Client`) and also lazily in `apps/video_conferencing/twilio_config.py:18`. The `api.py` file does NOT import Client directly. Patch at `apps.video_conferencing.utils.Client` for direct usage and `apps.video_conferencing.twilio_config.get_twilio_client` for the singleton.

7. **Windows Docker exec path mangling**: When running management commands via `docker exec` on Windows (Git Bash / MSYS2), prefix with `MSYS_NO_PATHCONV=1` to prevent path conversion.

8. **Two-checkout warning**: This repo has two checkout locations: `C:\Projects\ReallyGlobal\Lumy-Backend` (Docker primary) and `C:\Projects\ReallyGlobal-Infra\Lumy-Backend` (Infra submodule). New mock files must be created in the Docker primary checkout.

## Example Invocations

```
/mock-external-services --service stripe --mode card_declined
/mock-external-services --service all --mode success
/mock-external-services --service twilio --mode timeout
/mock-external-services --frontend
```
