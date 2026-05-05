#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
<TICKET> Integration Tests: <Feature Name>

This script tests the <feature> against a running backend.
It validates the API endpoints, authorization, validation, and state changes.

Prerequisites:
    1. Backend running at http://localhost:8000
    2. Database seeded with test data
    3. Admin user exists (is_staff=True)

Usage:
    # From workspace root
    python scripts/integration_<TICKET>.py

    # With custom backend URL
    python scripts/integration_<TICKET>.py --backend-url http://localhost:8000

    # Verbose output
    python scripts/integration_<TICKET>.py -v

Test accounts:
    Admin: admin@test.com / DevPassword123!
    Provider: provider@test.com
    Client: client@test.com
"""

import argparse
import json
import sys
import requests
from dataclasses import dataclass
from typing import Optional, Dict, Any, List, Tuple
from enum import Enum


# =============================================================================
# Configuration
# =============================================================================

DEFAULT_BACKEND_URL = "http://localhost:8000"
DEFAULT_ADMIN_EMAIL = "admin@test.com"
DEFAULT_ADMIN_PASSWORD = "DevPassword123!"
DEFAULT_PROVIDER_EMAIL = "provider@test.com"
DEFAULT_CLIENT_EMAIL = "client@test.com"

# Add valid enum values here if applicable
# VALID_REASON_CODES = ["value_1", "value_2"]


class TestResult(Enum):
    PASS = "[PASS]"
    FAIL = "[FAIL]"
    SKIP = "[SKIP]"


@dataclass
class TestCase:
    name: str
    description: str
    result: TestResult = TestResult.SKIP
    message: str = ""
    response_code: Optional[int] = None
    response_data: Optional[Dict] = None


# =============================================================================
# HTTP Client
# =============================================================================

class APIClient:
    """Simple API client for testing."""

    def __init__(self, base_url: str, verbose: bool = False):
        self.base_url = base_url.rstrip("/")
        self.verbose = verbose
        self.access_token: Optional[str] = None
        self.session = requests.Session()

    def log(self, msg: str):
        if self.verbose:
            print(f"  [DEBUG] {msg}")

    def login(self, email: str, password: str) -> bool:
        """Login and store JWT token."""
        # IMPORTANT: Correct endpoint for this codebase
        url = f"{self.base_url}/api/v1/authentication/login/"
        self.log(f"POST {url}")

        try:
            resp = self.session.post(url, json={
                "email": email,
                "password": password,
            })
            self.log(f"Response: {resp.status_code}")

            if resp.status_code == 200:
                data = resp.json()
                # IMPORTANT: Token is in data.tokens for this codebase
                if "data" in data and "tokens" in data["data"]:
                    self.access_token = data["data"]["tokens"]
                elif "data" in data and "access" in data["data"]:
                    self.access_token = data["data"]["access"]
                elif "access" in data:
                    self.access_token = data["access"]
                else:
                    self.log(f"Unexpected login response: {data}")
                    return False
                return True
            return False
        except Exception as e:
            self.log(f"Login error: {e}")
            return False

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        return headers

    def get(self, path: str, params: Optional[Dict] = None) -> Tuple[int, Dict]:
        """Make GET request."""
        url = f"{self.base_url}{path}"
        self.log(f"GET {url} params={params}")

        try:
            resp = self.session.get(url, headers=self._headers(), params=params)
            self.log(f"Response: {resp.status_code}")
            try:
                data = resp.json()
            except:
                data = {"raw": resp.text}
            return resp.status_code, data
        except Exception as e:
            return 0, {"error": str(e)}

    def post(self, path: str, body: Optional[Dict] = None) -> Tuple[int, Dict]:
        """Make POST request."""
        url = f"{self.base_url}{path}"
        self.log(f"POST {url} body={body}")

        try:
            resp = self.session.post(url, headers=self._headers(), json=body)
            self.log(f"Response: {resp.status_code}")
            try:
                data = resp.json()
            except:
                data = {"raw": resp.text}
            return resp.status_code, data
        except Exception as e:
            return 0, {"error": str(e)}

    def put(self, path: str, body: Optional[Dict] = None) -> Tuple[int, Dict]:
        """Make PUT request."""
        url = f"{self.base_url}{path}"
        self.log(f"PUT {url} body={body}")

        try:
            resp = self.session.put(url, headers=self._headers(), json=body)
            self.log(f"Response: {resp.status_code}")
            try:
                data = resp.json()
            except:
                data = {"raw": resp.text}
            return resp.status_code, data
        except Exception as e:
            return 0, {"error": str(e)}

    def delete(self, path: str) -> Tuple[int, Dict]:
        """Make DELETE request."""
        url = f"{self.base_url}{path}"
        self.log(f"DELETE {url}")

        try:
            resp = self.session.delete(url, headers=self._headers())
            self.log(f"Response: {resp.status_code}")
            try:
                data = resp.json()
            except:
                data = {"raw": resp.text}
            return resp.status_code, data
        except Exception as e:
            return 0, {"error": str(e)}

    def clear_token(self):
        """Clear the access token."""
        self.access_token = None


# =============================================================================
# Test Runner
# =============================================================================

class TestRunner:
    """Test runner for <TICKET> integration tests."""

    def __init__(self, backend_url: str, verbose: bool = False):
        self.client = APIClient(backend_url, verbose)
        self.verbose = verbose
        self.results: List[TestCase] = []

    def log(self, msg: str):
        if self.verbose:
            print(f"  {msg}")

    def run_all(self) -> bool:
        """Run all tests and return True if all passed."""
        print("\n" + "=" * 60)
        print("<TICKET> Integration Tests: <Feature Name>")
        print("=" * 60)
        print(f"Backend URL: {self.client.base_url}")
        print()

        # Setup
        if not self._setup():
            print("\n[FAIL] Setup failed. Cannot continue tests.")
            return False

        # Run tests - Add your test methods here
        self._test_example_success()
        self._test_example_not_found()
        self._test_requires_auth()
        # self._test_requires_admin()

        # Cleanup
        self._cleanup()

        # Print summary
        return self._print_summary()

    def _setup(self) -> bool:
        """Setup: login as admin and find test data."""
        print("Setup:")

        # Login as admin
        print(f"  Logging in as admin ({DEFAULT_ADMIN_EMAIL})...", end=" ")
        if self.client.login(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD):
            print("OK")
        else:
            print("FAILED")
            print(f"  Failed to login. Check that {DEFAULT_ADMIN_EMAIL} exists.")
            return False

        # Add additional setup here (e.g., find test entities)

        print()
        return True

    def _cleanup(self):
        """Cleanup after tests."""
        print("\nCleanup:")
        # Add cleanup logic here
        print("  Done")
        print()

    def _add_result(self, test: TestCase):
        """Add a test result."""
        self.results.append(test)
        status = test.result.value
        print(f"  {status} {test.name}")
        if test.message and (test.result == TestResult.FAIL or self.verbose):
            print(f"       {test.message}")

    def _print_summary(self) -> bool:
        """Print test summary and return True if all passed."""
        print("\n" + "=" * 60)
        print("Test Summary")
        print("=" * 60)

        passed = sum(1 for t in self.results if t.result == TestResult.PASS)
        failed = sum(1 for t in self.results if t.result == TestResult.FAIL)
        skipped = sum(1 for t in self.results if t.result == TestResult.SKIP)
        total = len(self.results)

        print(f"  Total:   {total}")
        print(f"  Passed:  {passed}")
        print(f"  Failed:  {failed}")
        print(f"  Skipped: {skipped}")

        if failed > 0:
            print("\n[FAIL] Failed Tests:")
            for t in self.results:
                if t.result == TestResult.FAIL:
                    print(f"  - {t.name}: {t.message}")

        print()
        return failed == 0

    # =========================================================================
    # Test Cases - Add your tests here
    # =========================================================================

    def _test_example_success(self):
        """TC-01: Example success test."""
        test = TestCase(
            name="TC-01: Example success",
            description="Verify endpoint returns expected data"
        )

        # Make the API call
        code, data = self.client.get("/api/v1/example/")
        test.response_code = code
        test.response_data = data

        # Check result
        if code == 200:
            test.result = TestResult.PASS
        else:
            test.result = TestResult.FAIL
            test.message = f"Expected 200, got {code}: {data}"

        self._add_result(test)

    def _test_example_not_found(self):
        """TC-02: Example not found test."""
        test = TestCase(
            name="TC-02: Example not found",
            description="Returns 404 for non-existent resource"
        )

        code, data = self.client.get("/api/v1/example/99999/")
        test.response_code = code

        if code == 404:
            test.result = TestResult.PASS
        else:
            test.result = TestResult.FAIL
            test.message = f"Expected 404, got {code}: {data}"

        self._add_result(test)

    def _test_requires_auth(self):
        """TC-03: Requires authentication."""
        test = TestCase(
            name="TC-03: Requires auth",
            description="Returns 401 without JWT token"
        )

        # Clear token temporarily
        saved_token = self.client.access_token
        self.client.clear_token()

        code, data = self.client.get("/api/v1/example/")
        test.response_code = code

        # Restore token
        self.client.access_token = saved_token

        if code == 401:
            test.result = TestResult.PASS
        else:
            test.result = TestResult.FAIL
            test.message = f"Expected 401, got {code}: {data}"

        self._add_result(test)

    def _test_requires_admin(self):
        """TC-04: Requires admin user."""
        test = TestCase(
            name="TC-04: Requires admin",
            description="Returns 403 for non-admin user"
        )

        # Login as non-admin
        saved_token = self.client.access_token

        if self.client.login(DEFAULT_CLIENT_EMAIL, DEFAULT_ADMIN_PASSWORD):
            code, data = self.client.get("/api/v1/admin-only/")
            test.response_code = code

            if code == 403:
                test.result = TestResult.PASS
            else:
                test.result = TestResult.FAIL
                test.message = f"Expected 403, got {code}: {data}"
        else:
            test.result = TestResult.SKIP
            test.message = f"Could not login as {DEFAULT_CLIENT_EMAIL}"

        # Restore admin token
        self.client.access_token = saved_token

        self._add_result(test)


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="<TICKET> Integration Tests: <Feature Name>"
    )
    parser.add_argument(
        "--backend-url",
        default=DEFAULT_BACKEND_URL,
        help=f"Backend URL (default: {DEFAULT_BACKEND_URL})"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )

    args = parser.parse_args()

    # Check backend is reachable
    print(f"Checking backend at {args.backend_url}...", end=" ")
    try:
        resp = requests.get(f"{args.backend_url}/api/v1/", timeout=5)
        print("OK")
    except Exception as e:
        print("FAILED")
        print(f"\nError: Cannot reach backend at {args.backend_url}")
        print("Make sure the backend is running:")
        print("  cd Lumy-Backend && .venv/Scripts/python manage.py runserver 0.0.0.0:8000")
        sys.exit(1)

    # Run tests
    runner = TestRunner(args.backend_url, verbose=args.verbose)
    success = runner.run_all()

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
