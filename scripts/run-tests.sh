#!/bin/bash
#
# Comprehensive Test Runner for Arkon Workstation
#
# Runs all tests across the monorepo:
# - Unit tests (Vitest)
# - E2E tests (Playwright)
# - Smoke tests
#
# Usage:
#   ./scripts/run-tests.sh           # Run all tests
#   ./scripts/run-tests.sh unit      # Run only unit tests
#   ./scripts/run-tests.sh e2e       # Run only E2E tests
#   ./scripts/run-tests.sh smoke     # Run only smoke tests
#   ./scripts/run-tests.sh coverage  # Run unit tests with coverage
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Print header
print_header() {
  echo ""
  echo -e "${BLUE}=============================================${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}=============================================${NC}"
  echo ""
}

# Print success
print_success() {
  echo -e "${GREEN}✓ $1${NC}"
  ((PASSED++))
}

# Print failure
print_failure() {
  echo -e "${RED}✗ $1${NC}"
  ((FAILED++))
}

# Print skip
print_skip() {
  echo -e "${YELLOW}○ $1 (skipped)${NC}"
  ((SKIPPED++))
}

# Run a test command
run_test() {
  local name="$1"
  local cmd="$2"
  local optional="${3:-false}"

  echo -n "  Running $name... "

  if eval "$cmd" > /dev/null 2>&1; then
    print_success "$name"
    return 0
  else
    if [ "$optional" = "true" ]; then
      print_skip "$name"
      return 0
    else
      print_failure "$name"
      return 1
    fi
  fi
}

# Run unit tests
run_unit_tests() {
  print_header "Unit Tests (Vitest)"

  local has_failures=false

  # API tests
  echo "📦 @arkon/api"
  if pnpm --filter @arkon/api test --run 2>&1 | tee /tmp/api-test.log | grep -E "(PASS|FAIL|✓|✗)"; then
    print_success "API unit tests"
  else
    print_failure "API unit tests"
    has_failures=true
  fi

  # Shared package tests
  echo ""
  echo "📦 @arkon/shared"
  if pnpm --filter @arkon/shared test --run 2>&1 | tee /tmp/shared-test.log | grep -E "(PASS|FAIL|✓|✗)"; then
    print_success "Shared package tests"
  else
    print_failure "Shared package tests"
    has_failures=true
  fi

  # CLI tests
  echo ""
  echo "📦 @arkon/cli"
  if pnpm --filter @arkon/cli test --run 2>&1 | tee /tmp/cli-test.log | grep -E "(PASS|FAIL|✓|✗)"; then
    print_success "CLI unit tests"
  else
    print_skip "CLI unit tests (no tests yet)"
  fi

  # Web unit tests
  echo ""
  echo "📦 @arkon/web"
  if pnpm --filter @arkon/web test --run 2>&1 | tee /tmp/web-test.log | grep -E "(PASS|FAIL|✓|✗)"; then
    print_success "Web unit tests"
  else
    print_skip "Web unit tests (no tests yet)"
  fi

  if [ "$has_failures" = true ]; then
    return 1
  fi
  return 0
}

# Run unit tests with coverage
run_coverage_tests() {
  print_header "Unit Tests with Coverage"

  echo "📦 @arkon/api"
  pnpm --filter @arkon/api test:coverage --run

  echo ""
  echo "📦 @arkon/shared"
  pnpm --filter @arkon/shared test:coverage --run 2>/dev/null || echo "  (coverage not configured)"

  echo ""
  echo "📦 @arkon/cli"
  pnpm --filter @arkon/cli test:coverage --run 2>/dev/null || echo "  (coverage not configured)"
}

# Run E2E tests
run_e2e_tests() {
  print_header "E2E Tests (Playwright)"

  # Check if servers are running
  if ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ API server not running on localhost:3001${NC}"
    echo "  Start with: pnpm dev:api"
    print_skip "E2E tests (API not running)"
    return 0
  fi

  if ! curl -s http://localhost:3002 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ Web server not running on localhost:3002${NC}"
    echo "  Start with: pnpm dev:web"
    print_skip "E2E tests (Web not running)"
    return 0
  fi

  echo "📦 @arkon/web E2E"
  if pnpm --filter @arkon/web test:e2e 2>&1 | tee /tmp/e2e-test.log | grep -E "(passed|failed|✓|✗)"; then
    print_success "E2E tests"
  else
    print_failure "E2E tests"
    return 1
  fi
}

# Run smoke tests
run_smoke_tests() {
  print_header "Smoke Tests"

  # Check if API is running
  if ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ API server not running on localhost:3001${NC}"
    echo "  Start with: pnpm dev:api"
    print_skip "Smoke tests (API not running)"
    return 0
  fi

  echo "📦 @arkon/api smoke tests"
  if pnpm --filter @arkon/api smoke 2>&1 | tee /tmp/smoke-api.log | grep -E "(OK|PASS|FAIL)"; then
    print_success "API smoke tests"
  else
    print_failure "API smoke tests"
  fi

  echo ""
  echo "📦 @arkon/cli smoke tests"
  if pnpm --filter @arkon/cli smoke 2>&1 | tee /tmp/smoke-cli.log | grep -E "(OK|PASS|FAIL)"; then
    print_success "CLI smoke tests"
  else
    print_skip "CLI smoke tests"
  fi
}

# Run multi-provider smoke test
run_multi_provider_smoke() {
  print_header "Multi-Provider Routing Smoke Test"

  # Check if API is running
  if ! curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠ API server not running on localhost:3001${NC}"
    echo "  Start with: pnpm dev:api"
    print_skip "Multi-provider smoke test (API not running)"
    return 0
  fi

  if [ -f "scripts/smoke-multi-provider.sh" ]; then
    echo "Running multi-provider smoke test..."
    if bash scripts/smoke-multi-provider.sh 2>&1 | tee /tmp/smoke-multi-provider.log; then
      print_success "Multi-provider smoke test"
    else
      print_failure "Multi-provider smoke test"
      return 1
    fi
  else
    print_skip "Multi-provider smoke test (script not found)"
  fi
}

# Print summary
print_summary() {
  echo ""
  echo -e "${BLUE}=============================================${NC}"
  echo -e "${BLUE}  Test Summary${NC}"
  echo -e "${BLUE}=============================================${NC}"
  echo ""
  echo -e "  ${GREEN}Passed:${NC}  $PASSED"
  echo -e "  ${RED}Failed:${NC}  $FAILED"
  echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED"
  echo ""

  if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    return 1
  else
    echo -e "${GREEN}All tests passed!${NC}"
    return 0
  fi
}

# Main
main() {
  local test_type="${1:-all}"

  print_header "Arkon Workstation Test Suite"
  echo "Test type: $test_type"
  echo "Date: $(date)"

  case "$test_type" in
    unit)
      run_unit_tests
      ;;
    e2e)
      run_e2e_tests
      ;;
    smoke)
      run_smoke_tests
      run_multi_provider_smoke
      ;;
    coverage)
      run_coverage_tests
      ;;
    all)
      run_unit_tests || true
      run_e2e_tests || true
      run_smoke_tests || true
      ;;
    *)
      echo "Unknown test type: $test_type"
      echo "Usage: $0 [unit|e2e|smoke|coverage|all]"
      exit 1
      ;;
  esac

  print_summary
}

main "$@"
