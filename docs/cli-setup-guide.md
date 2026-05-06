# Arkon CLI Setup Guide

This guide walks you through setting up the Arkon CLI (`tag` command) for AI Gateway management, usage tracking, and integration with Claude Code.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Build the CLI](#step-1-build-the-cli)
3. [Step 2: Verify CLI Installation](#step-2-verify-cli-installation)
4. [Step 3: Start Required Services](#step-3-start-required-services)
5. [Step 4: Get Authentication Token](#step-4-get-authentication-token)
6. [Step 5: Authenticate the CLI](#step-5-authenticate-the-cli)
7. [Step 6: Install Claude Code Hooks](#step-6-install-claude-code-hooks)
8. [Step 7: Enable Event Collection](#step-7-enable-event-collection)
9. [Step 8: Verify Setup](#step-8-verify-setup)
10. [Step 9: Test the Integration](#step-9-test-the-integration)
11. [Daily Usage](#daily-usage)
12. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, ensure you have:

- **Node.js 20+** installed
- **pnpm** package manager
- **PostgreSQL** database running (via Docker or local)
- **Arkon API** server running on `http://localhost:3001`
- **Arkon Web** app running on `http://localhost:3002` (optional, for dashboards)

---

## Step 1: Build the CLI

Build the CLI package from source:

```bash
cd C:\Users\thach\Documents\workstation\arkon-workstation
pnpm --filter @arkon/cli build
```

**Expected output:**
```
> @arkon/cli@0.1.0 build
> tsc
```

**What this does:**
- Compiles TypeScript source files in `packages/cli/src/`
- Outputs JavaScript to `packages/cli/dist/`

---

## Step 2: Verify CLI Installation

Test that the CLI runs correctly:

```bash
cd packages/cli
node dist/index.js --help
```

**Expected output:**
```
Usage: tag [options] [command]

Arkon CLI - AI Gateway management tool

Options:
  -v, --version             Output the current version
  -h, --help                Display help for command

Commands:
  login [options]           Authenticate with the Arkon Gateway
  logout                    Log out and clear stored credentials
  status [options]          Show current authentication state
  sync                      Sync skills and MCP configurations
  hooks                     Manage Claude Code event capture hooks
  events                    Manage event collection and buffering
  doctor [options]          Diagnose and fix common issues
  ...
```

---

## Step 3: Start Required Services

Ensure the Arkon API is running:

```bash
# From project root
pnpm dev:api
```

Verify the API is healthy:

```bash
curl http://localhost:3001/api/health
```

**Expected output:**
```json
{"status":"healthy","timestamp":"...","version":"1.0.0","checks":{"database":"ok"}}
```

---

## Step 4: Get Authentication Token

Login to get a JWT token for CLI authentication:

```bash
curl -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@arkon.dev\",\"password\":\"admin123\"}"
```

**Expected output:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@arkon.dev",
    "name": "Admin User",
    "role": "TENANT_ADMIN",
    "tenantId": "..."
  }
}
```

**Save the `token` value** - you'll need it in the next step.

---

## Step 5: Authenticate the CLI

Use headless mode to authenticate with the token:

```bash
cd packages/cli

# Replace YOUR_TOKEN with the token from Step 4
set TAG_API_URL=http://localhost:3001
set TAG_TOKEN=YOUR_TOKEN
node dist/index.js login --headless
```

**Expected output:**
```
✔ Authenticated successfully (headless mode)
```

Verify authentication:

```bash
set TAG_API_URL=http://localhost:3001
node dist/index.js status
```

**Expected output:**
```
Status

  Authenticated: Yes
  User:          admin@arkon.dev (Admin User)
  Role:          TENANT_ADMIN
  Tenant:        Default Tenant
  Teams:         Engineering
  Token Expires: in 364 days
  API Endpoint:  http://localhost:3001
```

---

## Step 6: Install Claude Code Hooks

Install event capture hooks for Claude Code:

```bash
set TAG_API_URL=http://localhost:3001
node dist/index.js hooks install
```

**Expected output:**
```
Installing Arkon event capture hook...

✓ Hook installed successfully

Config: C:\Users\thach\.claude\hooks.json

The hook will capture skill and MCP tool invocations.
Events are buffered locally and flushed every 30 seconds.

To enable event collection, run: tag events enable
```

**What this does:**
- Creates/updates `~/.claude/hooks.json`
- Adds hooks for `postSkillInvoke` and `postToolCall` events
- Events are captured when you use skills or MCP tools in Claude Code

---

## Step 7: Enable Event Collection

Enable the event collection system:

```bash
set TAG_API_URL=http://localhost:3001
node dist/index.js events enable
```

**Expected output:**
```
Enabling event collection...

✓ Event collection enabled

Events will be buffered locally and flushed every 30 seconds.
```

**What this does:**
- Creates settings file at `~/.tag/events.settings`
- Events will be buffered to `~/.tag/events.buffer`
- Auto-flush every 30 seconds (when events exist)

---

## Step 8: Verify Setup

Run diagnostics to verify everything is configured correctly:

```bash
set TAG_API_URL=http://localhost:3001
node dist/index.js doctor
```

**Expected output (all green):**
```
Arkon CLI Diagnostics

✓ Installation
   CLI configured correctly

✓ Authentication
   Token valid, expires in 364 days

✓ Network
   API reachable (67ms)

✓ Claude Code
   Claude Code configured with hooks

✓ Sync State
   Skills synced

Summary: 5 passed, 0 warnings, 0 errors
```

If you see warnings, run with `--fix`:

```bash
node dist/index.js doctor --fix
```

---

## Step 9: Test the Integration

### 9.1 Check Event Status

```bash
set TAG_API_URL=http://localhost:3001
node dist/index.js events status
```

**Expected output:**
```
Event Collection Status

Collection: ✓ Enabled
Auth:       ✓ Authenticated

Buffer:
  Events:    0
  Location:  C:\Users\thach\.tag\events.buffer

Flush Stats:
  Last flush:    Never
  Total flushed: 0
```

### 9.2 Use Claude Code

Now when you use Claude Code and invoke:
- **Skills** (e.g., `/commit`, `/review-pr`)
- **MCP tools** (e.g., grapuco tools, custom MCP servers)

Events will be captured automatically.

### 9.3 Flush Events Manually

To immediately send buffered events to the server:

```bash
set TAG_API_URL=http://localhost:3001
node dist/index.js events flush
```

### 9.4 View Usage Dashboard

Open the admin dashboard to see captured events:

- **Usage Dashboard**: http://localhost:3002/admin/usage
- **LLM Usage Dashboard**: http://localhost:3002/admin/llm-usage

---

## Daily Usage

### Quick Commands Reference

Create a batch file for easier access:

**File: `packages/cli/tag.cmd`**
```batch
@echo off
set TAG_API_URL=http://localhost:3001
node "%~dp0dist\index.js" %*
```

Then use:

```bash
# Check status
tag.cmd status

# Sync skills from remote
tag.cmd sync skills pull

# Push local skills to remote
tag.cmd sync skills push

# Flush events
tag.cmd events flush

# Run diagnostics
tag.cmd doctor
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TAG_API_URL` | Arkon API endpoint | `http://localhost:3001` |
| `TAG_TOKEN` | Access token for headless auth | (none) |

---

## Troubleshooting

### Problem: "Not authenticated"

**Solution:** Re-authenticate with a fresh token:

```bash
# Get new token
curl -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@arkon.dev\",\"password\":\"admin123\"}"

# Re-login
set TAG_TOKEN=NEW_TOKEN
node dist/index.js login --headless
```

### Problem: "API not reachable"

**Solution:** Ensure the API is running:

```bash
# Check API health
curl http://localhost:3001/api/health

# Start API if not running
pnpm dev:api
```

### Problem: "Hooks not installed"

**Solution:** Reinstall hooks:

```bash
node dist/index.js hooks install
node dist/index.js doctor --fix
```

### Problem: "Events not appearing in dashboard"

**Solution:**

1. Check event collection is enabled:
   ```bash
   node dist/index.js events status
   ```

2. Manually flush events:
   ```bash
   node dist/index.js events flush
   ```

3. Check the buffer file exists:
   ```bash
   type %USERPROFILE%\.tag\events.buffer
   ```

### Problem: "Token expired"

**Solution:** Get a new token and re-authenticate (Steps 4-5).

---

## Understanding the Dashboards

### Usage Dashboard (`/admin/usage`)

Tracks **Claude Code activity**:
- Skill invocations (e.g., `/commit`, `/review-pr`)
- MCP tool usage
- Captured via CLI hooks

### LLM Usage Dashboard (`/admin/llm-usage`)

Tracks **API LLM calls**:
- Cerebras, Anthropic, Ollama usage
- Token counts (input/output)
- Costs per model
- Captured via direct API logging

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Claude Code                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Skills    │  │  MCP Tools  │  │    Chat     │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│         ▼                ▼                │                      │
│  ┌──────────────────────────────┐         │                      │
│  │  ~/.claude/hooks.json        │         │                      │
│  │  (postSkillInvoke,           │         │                      │
│  │   postToolCall)              │         │                      │
│  └──────────────┬───────────────┘         │                      │
└─────────────────┼─────────────────────────┼──────────────────────┘
                  │                         │
                  ▼                         ▼
           ┌──────────────┐          ┌──────────────┐
           │ ~/.tag/      │          │ Arkon API    │
           │ events.buffer│          │ /api/llm/*   │
           └──────┬───────┘          └──────┬───────┘
                  │                         │
                  │ (tag events flush)      │
                  ▼                         ▼
           ┌──────────────┐          ┌──────────────┐
           │ Arkon API    │          │ Database     │
           │ /api/usage/* │          │ LlmMessage   │
           └──────┬───────┘          │ LlmSession   │
                  │                  └──────────────┘
                  ▼                         │
           ┌──────────────┐                 │
           │ Database     │                 │
           │ UsageEvent   │                 │
           └──────────────┘                 │
                  │                         │
                  ▼                         ▼
           ┌─────────────────────────────────────┐
           │         Admin Dashboards            │
           │  /admin/usage    /admin/llm-usage   │
           └─────────────────────────────────────┘
```

---

## Next Steps

1. **Push skills to remote**: `tag sync skills push`
2. **Configure MCP servers**: `tag sync mcp push`
3. **Set up RAG ingestion**: `tag rag ingest-dir ./docs`
4. **Monitor usage**: Visit `/admin/usage` and `/admin/llm-usage`

---

## Support

- **CLI Help**: `tag --help` or `tag <command> --help`
- **Diagnostics**: `tag doctor`
- **Issues**: https://github.com/your-org/arkon-workstation/issues
