#######################################
# Arkon Smoke Test Runner (PowerShell)
#
# Runs quick smoke tests for both frontend and backend.
# Use before deployment to verify critical functionality.
#
# Usage:
#   .\scripts\smoke-test.ps1          # Run all smoke tests
#   .\scripts\smoke-test.ps1 backend  # Run backend only
#   .\scripts\smoke-test.ps1 frontend # Run frontend only
#
# Exit codes:
#   0 - All tests passed
#   1 - Tests failed
#   2 - Setup error
#######################################

param(
    [Parameter(Position=0)]
    [ValidateSet("all", "backend", "frontend")]
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "  Arkon Smoke Test Runner"
Write-Host "========================================"
Write-Host ""

# Check if pnpm is available
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: pnpm is not installed" -ForegroundColor Red
    exit 2
}

# Track overall status
$BackendStatus = 0
$FrontendStatus = 0
$OriginalLocation = Get-Location

#######################################
# Backend Smoke Tests
#######################################
function Run-BackendTests {
    Write-Host "Running Backend Smoke Tests..." -ForegroundColor Yellow
    Write-Host ""

    Set-Location "$OriginalLocation\apps\api"

    try {
        pnpm vitest run src/smoke.test.ts --reporter=verbose
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Backend smoke tests passed" -ForegroundColor Green
            $script:BackendStatus = 0
        } else {
            Write-Host "Backend smoke tests failed" -ForegroundColor Red
            $script:BackendStatus = 1
        }
    } catch {
        Write-Host "Backend smoke tests failed: $_" -ForegroundColor Red
        $script:BackendStatus = 1
    }

    Set-Location $OriginalLocation
    Write-Host ""
}

#######################################
# Frontend Smoke Tests
#######################################
function Run-FrontendTests {
    Write-Host "Running Frontend Smoke Tests..." -ForegroundColor Yellow
    Write-Host ""

    Set-Location "$OriginalLocation\apps\web"

    try {
        pnpm playwright test e2e/smoke.spec.ts --reporter=list
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Frontend smoke tests passed" -ForegroundColor Green
            $script:FrontendStatus = 0
        } else {
            Write-Host "Frontend smoke tests failed" -ForegroundColor Red
            $script:FrontendStatus = 1
        }
    } catch {
        Write-Host "Frontend smoke tests failed: $_" -ForegroundColor Red
        $script:FrontendStatus = 1
    }

    Set-Location $OriginalLocation
    Write-Host ""
}

#######################################
# Main
#######################################
switch ($Target) {
    "backend" {
        Run-BackendTests
    }
    "frontend" {
        Run-FrontendTests
    }
    "all" {
        Run-BackendTests
        Run-FrontendTests
    }
}

#######################################
# Summary
#######################################
Write-Host "========================================"
Write-Host "  Smoke Test Summary"
Write-Host "========================================"

if ($Target -eq "all" -or $Target -eq "backend") {
    if ($BackendStatus -eq 0) {
        Write-Host "  Backend:  PASSED" -ForegroundColor Green
    } else {
        Write-Host "  Backend:  FAILED" -ForegroundColor Red
    }
}

if ($Target -eq "all" -or $Target -eq "frontend") {
    if ($FrontendStatus -eq 0) {
        Write-Host "  Frontend: PASSED" -ForegroundColor Green
    } else {
        Write-Host "  Frontend: FAILED" -ForegroundColor Red
    }
}

Write-Host "========================================"

# Exit with failure if any test failed
if ($BackendStatus -ne 0 -or $FrontendStatus -ne 0) {
    Write-Host ""
    Write-Host "Smoke tests failed! Do NOT deploy." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "All smoke tests passed! Safe to deploy." -ForegroundColor Green
exit 0
