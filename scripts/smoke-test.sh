#!/bin/bash

#######################################
# Arkon Smoke Test Runner
#
# Runs quick smoke tests for both frontend and backend.
# Use before deployment to verify critical functionality.
#
# Usage:
#   ./scripts/smoke-test.sh          # Run all smoke tests
#   ./scripts/smoke-test.sh backend  # Run backend only
#   ./scripts/smoke-test.sh frontend # Run frontend only
#
# Exit codes:
#   0 - All tests passed
#   1 - Tests failed
#   2 - Setup error
#######################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default to running both
TARGET=${1:-all}

echo "========================================"
echo "  Arkon Smoke Test Runner"
echo "========================================"
echo ""

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}Error: pnpm is not installed${NC}"
    exit 2
fi

# Track overall status
BACKEND_STATUS=0
FRONTEND_STATUS=0

#######################################
# Backend Smoke Tests
#######################################
run_backend_tests() {
    echo -e "${YELLOW}Running Backend Smoke Tests...${NC}"
    echo ""

    cd apps/api

    # Run smoke tests with vitest
    if pnpm vitest run src/smoke.test.ts --reporter=verbose; then
        echo -e "${GREEN}✓ Backend smoke tests passed${NC}"
        BACKEND_STATUS=0
    else
        echo -e "${RED}✗ Backend smoke tests failed${NC}"
        BACKEND_STATUS=1
    fi

    cd ../..
    echo ""
}

#######################################
# Frontend Smoke Tests
#######################################
run_frontend_tests() {
    echo -e "${YELLOW}Running Frontend Smoke Tests...${NC}"
    echo ""

    cd apps/web

    # Run smoke tests with playwright
    if pnpm playwright test e2e/smoke.spec.ts --reporter=list; then
        echo -e "${GREEN}✓ Frontend smoke tests passed${NC}"
        FRONTEND_STATUS=0
    else
        echo -e "${RED}✗ Frontend smoke tests failed${NC}"
        FRONTEND_STATUS=1
    fi

    cd ../..
    echo ""
}

#######################################
# Main
#######################################
case $TARGET in
    backend)
        run_backend_tests
        ;;
    frontend)
        run_frontend_tests
        ;;
    all)
        run_backend_tests
        run_frontend_tests
        ;;
    *)
        echo -e "${RED}Unknown target: $TARGET${NC}"
        echo "Usage: ./scripts/smoke-test.sh [all|backend|frontend]"
        exit 2
        ;;
esac

#######################################
# Summary
#######################################
echo "========================================"
echo "  Smoke Test Summary"
echo "========================================"

if [[ "$TARGET" == "all" || "$TARGET" == "backend" ]]; then
    if [ $BACKEND_STATUS -eq 0 ]; then
        echo -e "  Backend:  ${GREEN}PASSED${NC}"
    else
        echo -e "  Backend:  ${RED}FAILED${NC}"
    fi
fi

if [[ "$TARGET" == "all" || "$TARGET" == "frontend" ]]; then
    if [ $FRONTEND_STATUS -eq 0 ]; then
        echo -e "  Frontend: ${GREEN}PASSED${NC}"
    else
        echo -e "  Frontend: ${RED}FAILED${NC}"
    fi
fi

echo "========================================"

# Exit with failure if any test failed
if [ $BACKEND_STATUS -ne 0 ] || [ $FRONTEND_STATUS -ne 0 ]; then
    echo ""
    echo -e "${RED}Smoke tests failed! Do NOT deploy.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}All smoke tests passed! Safe to deploy.${NC}"
exit 0
