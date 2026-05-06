# Arkon CLI - Coding & Bug Fixing Workflows

Practical workflows for using Arkon CLI with Claude Code for development tasks.

---

## Quick Setup (One-Time)

```bash
# 1. Build CLI
pnpm --filter @arkon/cli build

# 2. Get token
curl -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@arkon.dev\",\"password\":\"admin123\"}"

# 3. Authenticate (replace YOUR_TOKEN)
cd packages/cli
set TAG_API_URL=http://localhost:3001
set TAG_TOKEN=YOUR_TOKEN
node dist/index.js login --headless

# 4. Install hooks & enable events
node dist/index.js hooks install
node dist/index.js events enable

# 5. Verify
node dist/index.js doctor
```

---

## Workflow 1: Starting a New Coding Session

### Before You Start

```bash
# Check CLI status
cd C:\Users\thach\Documents\workstation\arkon-workstation\packages\cli
set TAG_API_URL=http://localhost:3001
node dist/index.js status
```

**Expected:** `Authenticated: Yes`

### Pull Latest Skills

```bash
node dist/index.js sync skills pull
```

This downloads any new skills from the server to use locally.

### Start Coding with Claude Code

Open Claude Code in your project directory. All skill and MCP tool usage will be automatically tracked.

---

## Workflow 2: Bug Fixing

### Step 1: Identify the Bug

Use Claude Code to investigate:

```
> Explain the error in apps/api/src/routes/auth.ts:45
```

### Step 2: Check Recent Changes

```bash
# See what changed recently
git log --oneline -10

# Check current branch status
git status
```

### Step 3: Fix with Claude Code

Ask Claude Code to help fix the bug:

```
> Fix the authentication bug where tokens expire too quickly
```

### Step 4: Test the Fix

```bash
# Run tests
pnpm test

# Or specific tests
pnpm --filter @arkon/api test
```

### Step 5: Track Your Work

Events are auto-captured, but you can manually flush:

```bash
node dist/index.js events flush
```

View your activity in the Usage Dashboard: http://localhost:3002/admin/usage

---

## Workflow 3: Using AI Models for Code Generation

### Check Available Models

View configured models in the Admin dashboard:
http://localhost:3002/admin/models

### Test a Model via API

```bash
curl -X POST http://localhost:3001/api/llm/chat ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}],\"provider\":\"cerebras\"}"
```

### View LLM Usage

All LLM API calls are tracked automatically:
http://localhost:3002/admin/llm-usage

---

## Workflow 4: Skill Development

### Create a New Skill

1. Create skill directory:
   ```bash
   mkdir .claude\skills\my-new-skill
   ```

2. Create `SKILL.md`:
   ```markdown
   # My New Skill

   Description of what this skill does.

   ## Usage

   /my-new-skill [args]

   ## Steps

   1. Step one
   2. Step two
   ```

### Push Skill to Server

```bash
node dist/index.js sync skills push my-new-skill
```

### List All Skills

```bash
node dist/index.js sync skills list
```

---

## Workflow 5: RAG-Powered Development

### Ingest Documentation

```bash
# Single file
node dist/index.js rag ingest README.md

# Entire directory
node dist/index.js rag ingest-dir ./docs
```

### Search for Information

```bash
node dist/index.js rag search "how does authentication work"
```

### Query with AI Response

```bash
node dist/index.js rag query "explain the database schema"
```

---

## Workflow 6: Debugging Issues

### Run Diagnostics

```bash
node dist/index.js doctor
```

### Check Network Connectivity

```bash
node dist/index.js doctor network
```

### Check Authentication

```bash
node dist/index.js doctor auth
```

### Auto-Fix Issues

```bash
node dist/index.js doctor --fix
```

---

## Workflow 7: End of Day

### Flush All Events

Ensure all tracked events are sent to server:

```bash
node dist/index.js events flush
```

### Check Event Stats

```bash
node dist/index.js events status
```

### Review Your Activity

Visit the dashboards:
- **Your Activity**: http://localhost:3002/admin/usage
- **LLM Usage**: http://localhost:3002/admin/llm-usage

---

## Command Quick Reference

| Task | Command |
|------|---------|
| Check status | `node dist/index.js status` |
| View help | `node dist/index.js --help` |
| Run diagnostics | `node dist/index.js doctor` |
| Fix issues | `node dist/index.js doctor --fix` |
| Pull skills | `node dist/index.js sync skills pull` |
| Push skills | `node dist/index.js sync skills push` |
| List skills | `node dist/index.js sync skills list` |
| Install hooks | `node dist/index.js hooks install` |
| Check hooks | `node dist/index.js hooks status` |
| Enable events | `node dist/index.js events enable` |
| Disable events | `node dist/index.js events disable` |
| Flush events | `node dist/index.js events flush` |
| Event status | `node dist/index.js events status` |
| Ingest docs | `node dist/index.js rag ingest <file>` |
| Search RAG | `node dist/index.js rag search "<query>"` |
| Query RAG | `node dist/index.js rag query "<question>"` |
| Logout | `node dist/index.js logout` |

---

## Tips & Best Practices

### 1. Use Environment Variables

Set these in your terminal profile:

```bash
set TAG_API_URL=http://localhost:3001
```

### 2. Create an Alias

Add to your PATH or create `tag.cmd`:

```batch
@echo off
set TAG_API_URL=http://localhost:3001
node "C:\Users\thach\Documents\workstation\arkon-workstation\packages\cli\dist\index.js" %*
```

Then use: `tag status`, `tag doctor`, etc.

### 3. Keep Hooks Updated

After CLI updates, reinstall hooks:

```bash
node dist/index.js hooks install
```

### 4. Monitor Token Expiration

Check status regularly:

```bash
node dist/index.js status
```

Re-authenticate if token is expiring soon.

### 5. Use RAG for Context

Before asking Claude Code complex questions, ingest relevant docs:

```bash
node dist/index.js rag ingest-dir ./docs
```

---

## Troubleshooting Common Issues

### "Command not found"

Ensure you're in the CLI directory:
```bash
cd C:\Users\thach\Documents\workstation\arkon-workstation\packages\cli
```

### "Not authenticated"

Re-run the login flow:
```bash
set TAG_TOKEN=YOUR_NEW_TOKEN
node dist/index.js login --headless
```

### "API not reachable"

Start the API server:
```bash
pnpm dev:api
```

### "Events not syncing"

1. Check events are enabled: `node dist/index.js events status`
2. Manual flush: `node dist/index.js events flush`
3. Check hooks: `node dist/index.js hooks status`

### "Skills not found"

Sync from server:
```bash
node dist/index.js sync skills pull
```

---

## Related Documentation

- [CLI Setup Guide](./cli-setup-guide.md) - Full 9-step setup
- [Architecture Overview](./architecture.md) - System design
- [API Documentation](../apps/api/README.md) - Backend API reference
