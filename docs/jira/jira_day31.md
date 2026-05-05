# TAG-31: CI/CD Pipeline Hardening

## Description

**Suggested Points:** 8 (High — implementing production-grade CI/CD patterns from Lumy-Backend, including multi-stage deployments, approval gates, settings validation, and automated migration execution)

## Objective

Harden the CI/CD pipeline with patterns learned from Lumy-Backend's GitHub Actions workflows, including PR ticket validation, multi-stage deployment with approval gates, Docker image versioning, Azure deployment automation, and automated migration execution.

## Requirements

### PR Validation Workflow
- Ticket reference check (JIRA pattern)
- Concurrent job management (cancel previous runs)
- Required status checks before merge

### Test Stage (Pattern from Lumy-Backend)
```yaml
name: Tests

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

concurrency:
  group: tests-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
```

### Build Stage with Docker
- Multi-tag strategy (SHA + branch-latest)
- Layer caching for faster builds
- ACR/ECR authentication via OIDC (no secrets in repo)
- Image scanning for vulnerabilities

### Deploy Stage with Approval Gates
- Environment protection rules
- Required reviewers for production
- Settings validation before deploy
- Automated migration execution

### Settings Validation
```yaml
- name: Validate Required Settings
  run: |
    REQUIRED_KEYS="SECRET_KEY DATABASE_URL REDIS_URL"
    for key in $REQUIRED_KEYS; do
      if [[ -z "${!key}" ]]; then
        echo "::error::Missing required setting: $key"
        exit 1
      fi
    done
```

### Automated Migration Execution
```yaml
- name: Run Migrations
  run: |
    # Wait for container to be ready
    az webapp start --name $APP_NAME --resource-group $RG
    sleep 30

    # Execute migration via SSH or exec
    az webapp ssh --name $APP_NAME --resource-group $RG \
      --command "npm run migrate:apply -- --force"

    # Verify migration status
    az webapp ssh --name $APP_NAME --resource-group $RG \
      --command "npm run migrate:status"
```

## Implementation Notes
- Backend: GitHub Actions workflows in `.github/workflows/`
- Frontend: Same workflow structure
- CLI: N/A
- Database: Migration execution in deploy stage

## Unit Tests

### Required Unit Tests
| Test File | Test Case | Assertion |
|-----------|-----------|-----------|
| `.github/workflows/__tests__/validate.test.ts` | `PR without ticket fails` | Check fails |
| `.github/workflows/__tests__/validate.test.ts` | `PR with ticket passes` | Check passes |
| `scripts/deploy/__tests__/settings.test.ts` | `missing required key fails` | Exit code 1 |
| `scripts/deploy/__tests__/settings.test.ts` | `all keys present passes` | Exit code 0 |
| `scripts/deploy/__tests__/migrate.test.ts` | `migration command executes` | Command runs |

### Test Coverage Requirements
- All workflow paths tested via act or similar
- Settings validation 100% covered
- Migration scripts tested in isolation

## Integration Tests

### Required Integration Tests
| Test Scenario | Setup | Steps | Expected Result |
|---------------|-------|-------|-----------------|
| `PR without ticket` | PR created | 1. Submit PR without ticket ref | PR check fails |
| `PR with ticket` | PR created | 1. Submit PR with "TAG-123" | PR check passes |
| `concurrent cancellation` | Two PRs to same branch | 1. Push to PR 2. Push again | First run cancelled |
| `build and push` | Main branch push | 1. Build 2. Push to registry | Image available |
| `deploy with approval` | Production environment | 1. Trigger deploy | Waits for approval |
| `settings validation fail` | Missing SECRET_KEY | 1. Deploy | Deployment blocked |
| `migration execution` | Pending migrations | 1. Deploy | Migrations applied |

### End-to-End Flows
- PR created → Tests run → Build → Approval → Deploy → Migrate → Verify
- Failed test → PR blocked → Fix → Re-run → Pass → Merge

## GitHub Actions Workflow Suite

### 1. PR Ticket Check
```yaml
# .github/workflows/pr-ticket-check.yml
name: PR Ticket Check

on:
  pull_request:
    types: [opened, edited, synchronize]

jobs:
  check-ticket:
    runs-on: ubuntu-latest
    steps:
      - name: Check for ticket reference
        uses: actions/github-script@v7
        with:
          script: |
            const pr = context.payload.pull_request;
            const title = pr.title || '';
            const body = pr.body || '';

            // Match JIRA-style ticket: TAG-123, RGDEV-456, etc.
            const ticketPattern = /\b[A-Z]+-\d+\b/;

            if (!ticketPattern.test(title) && !ticketPattern.test(body)) {
              core.setFailed(
                'PR must reference a ticket (e.g., TAG-123) in title or body.\n' +
                'Example title: "TAG-123: Add user authentication"'
              );
            } else {
              const match = title.match(ticketPattern) || body.match(ticketPattern);
              console.log(`Found ticket reference: ${match[0]}`);
            }
```

### 2. Test Suite
```yaml
# .github/workflows/tests.yml
name: Tests

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_call:  # Allow reuse in deploy workflow

concurrency:
  group: tests-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test_user
          POSTGRES_PASSWORD: test_pass
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run type check
        run: npm run typecheck

      - name: Run unit tests
        run: npm run test:unit -- --coverage
        env:
          DATABASE_URL: postgres://test_user:test_pass@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379/0

      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgres://test_user:test_pass@localhost:5432/test_db
          REDIS_URL: redis://localhost:6379/0

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
```

### 3. Deploy Pipeline
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  # Stage 1: Test
  test:
    uses: ./.github/workflows/tests.yml

  # Stage 2: Build
  build:
    needs: test
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}

    steps:
      - uses: actions/checkout@v4

      - name: Azure Login (OIDC - no secrets!)
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: ACR Login
        run: az acr login --name ${{ vars.ACR_NAME }}

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ vars.ACR_NAME }}.azurecr.io/tag-gateway
          tags: |
            type=sha,prefix=
            type=ref,event=branch,suffix=-latest

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Scan for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ steps.meta.outputs.tags }}
          exit-code: '1'
          severity: 'CRITICAL,HIGH'

  # Stage 3: Deploy (with approval for production)
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production  # Requires approval

    steps:
      - uses: actions/checkout@v4

      - name: Azure Login
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Validate Required Settings
        env:
          SECRET_KEY: ${{ secrets.SECRET_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          REDIS_URL: ${{ secrets.REDIS_URL }}
        run: |
          REQUIRED="SECRET_KEY DATABASE_URL REDIS_URL"
          for key in $REQUIRED; do
            if [[ -z "${!key}" ]]; then
              echo "::error::Missing required setting: $key"
              exit 1
            fi
          done
          echo "All required settings present"

      - name: Deploy to Azure App Service
        uses: azure/webapps-deploy@v2
        with:
          app-name: ${{ vars.AZURE_WEBAPP_NAME }}
          images: ${{ needs.build.outputs.image_tag }}

      - name: Run Migrations
        run: |
          echo "Waiting for deployment to stabilize..."
          sleep 60

          echo "Running migrations..."
          az webapp ssh --name ${{ vars.AZURE_WEBAPP_NAME }} \
            --resource-group ${{ vars.AZURE_RESOURCE_GROUP }} \
            --command "npm run migrate:apply -- --force"

          echo "Verifying migration status..."
          az webapp ssh --name ${{ vars.AZURE_WEBAPP_NAME }} \
            --resource-group ${{ vars.AZURE_RESOURCE_GROUP }} \
            --command "npm run migrate:status"

      - name: Health Check
        run: |
          for i in {1..10}; do
            STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://${{ vars.AZURE_WEBAPP_NAME }}.azurewebsites.net/api/health)
            if [ "$STATUS" = "200" ]; then
              echo "Health check passed!"
              exit 0
            fi
            echo "Attempt $i: Status $STATUS, retrying..."
            sleep 10
          done
          echo "::error::Health check failed after 10 attempts"
          exit 1

      - name: Notify on Success
        if: success()
        run: |
          echo "Deployment successful: ${{ needs.build.outputs.image_tag }}"
          # Add Slack/Teams notification here

      - name: Notify on Failure
        if: failure()
        run: |
          echo "::error::Deployment failed!"
          # Add Slack/Teams notification here
```

## Acceptance Criteria
1. PR ticket check blocks PRs without ticket reference
2. Concurrent PR runs are cancelled (latest wins)
3. Tests run with PostgreSQL and Redis services
4. Docker images tagged with SHA and branch-latest
5. Vulnerability scanning blocks critical issues
6. Production deploy requires approval
7. Settings validated before deploy
8. Migrations run automatically after deploy
9. Health check verifies successful deployment

## Review Checklist
- [ ] Are secrets stored in GitHub Secrets, not in workflow files?
- [ ] Is OIDC used for cloud authentication (no long-lived credentials)?
- [ ] Does the health check have appropriate retry logic?
- [ ] Is there a rollback procedure if deployment fails?
- [ ] Are notifications configured for success and failure?
- [ ] Is vulnerability scanning blocking on CRITICAL/HIGH?

## Dependencies
- Depends on: Day 30 (Migration framework for automated execution)
- Blocks: Day 33 (Runbooks document this pipeline)

## Risk Factors
- **Deployment timeout** — Mitigation: Increase timeout, add retry logic
- **Migration failure mid-deploy** — Mitigation: Pre-deploy migration test, rollback procedure
- **Approval bottleneck** — Mitigation: Multiple approvers, time-based auto-approve for non-production
- **Secret rotation** — Mitigation: OIDC where possible, rotation procedures documented
